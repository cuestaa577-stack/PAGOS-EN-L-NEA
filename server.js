/* =============================================================================
   server.js — Pasarela de pagos (Chile + Colombia) + App web instalable (PWA)
   -----------------------------------------------------------------------------
   CHILE (Flow):
     - EFECTIVO: cupon de pago presencial (Servipag / Servipag Express / Sencillito)
     - TARJETA : credito/debito en el checkout seguro de Flow
   COLOMBIA (Wompi):
     - TARJETA, NEQUI, PSE en el Web Checkout de Wompi
     - El dinero se dispersa automaticamente a la cuenta Nequi del comercio
       (Wompi "Pagos a Terceros", bankId NEQUI = 1507)

   Seguridad: la web del comercio NUNCA captura datos de tarjeta (PCI-DSS).
   ============================================================================= */

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

const Flow = require('./lib/flow');
const Wompi = require('./lib/wompi');
const store = require('./lib/store');
const { createSettlement } = require('./lib/settlement');

const app = express();

// ------------------------------- Configuracion -------------------------------
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const COMMERCE_NAME = process.env.COMMERCE_NAME || 'Pago de Servicios';
const ORDER_TIMEOUT = Number(process.env.ORDER_TIMEOUT || 3600); // segundos

// --- Flow (Chile) ---
const hasFlowKeys = Boolean(process.env.FLOW_API_KEY && process.env.FLOW_SECRET_KEY);
const FLOW_BASE = process.env.FLOW_ENV === 'production'
  ? 'https://www.flow.cl/api'
  : 'https://sandbox.flow.cl/api';
const flow = new Flow({
  apiKey: process.env.FLOW_API_KEY,
  secretKey: process.env.FLOW_SECRET_KEY,
  baseUrl: FLOW_BASE,
});
const FLOW_PM_EFECTIVO = Number(process.env.FLOW_PM_EFECTIVO || 9);  // cupon (efectivo)
const FLOW_PM_TARJETA = Number(process.env.FLOW_PM_TARJETA || 1);    // tarjeta

// --- Wompi (Colombia) ---
const hasWompiKeys = Boolean(
  process.env.WOMPI_PUBLIC_KEY && process.env.WOMPI_INTEGRITY_SECRET
);
const wompi = new Wompi({
  publicKey: process.env.WOMPI_PUBLIC_KEY,
  privateKey: process.env.WOMPI_PRIVATE_KEY,
  integritySecret: process.env.WOMPI_INTEGRITY_SECRET,
  eventsSecret: process.env.WOMPI_EVENTS_SECRET,
  env: process.env.WOMPI_ENV || 'production',
});

// --- Pagos a Terceros (dispersion a Nequi) ---
const payoutsCfg = {
  apiKey: process.env.WOMPI_PAYOUTS_API_KEY,
  userPrincipalId: process.env.WOMPI_PAYOUTS_USER_PRINCIPAL_ID,
  accountId: process.env.WOMPI_PAYOUTS_ACCOUNT_ID,
  baseUrl: process.env.WOMPI_PAYOUTS_BASE_URL || 'https://api.payouts.wompi.co/v1',
};
const nequi = {
  phone: process.env.NEQUI_PHONE,
  legalId: process.env.NEQUI_LEGAL_ID,
  legalIdType: process.env.NEQUI_LEGAL_ID_TYPE || 'CC',
  name: process.env.NEQUI_NAME,
  email: process.env.NEQUI_EMAIL,
};
const settlement = createSettlement({
  wompi,
  payoutsCfg,
  nequi,
  enabled: process.env.SETTLE_TO_NEQUI !== 'false',
});

const MODO_CL = hasFlowKeys ? 'REAL' : 'DEMO';
const MODO_CO = hasWompiKeys ? 'REAL' : 'DEMO';

// ------------------------------- Middleware ----------------------------------
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

// Cabeceras de seguridad basicas
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// Estaticos (con cabeceras adecuadas para PWA)
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (/manifest\.json$/i.test(filePath)) {
      res.setHeader('Content-Type', 'application/manifest+json');
    } else if (/sw\.js$/i.test(filePath)) {
      // El service worker nunca debe cachearse y controla todo el sitio.
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Service-Worker-Allowed', '/');
    } else if (/\.(html|js|css)$/i.test(filePath)) {
      // Evita que el navegador sirva versiones viejas de la pagina de pago.
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// --------------------------- Utilidades internas -----------------------------
function generarCodigo(pais) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[crypto.randomInt(chars.length)];
  return (pais === 'CO' ? 'CO-' : 'PAGO-') + s;
}

function emailValido(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const LIMITES = {
  CL: { min: 350, max: 5000000, moneda: 'CLP' },
  CO: { min: 1500, max: 50000000, moneda: 'COP' },
};

// Rate limit simple en memoria (por IP)
const _hits = new Map();
function rateLimit(max, ventanaMs) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'x';
    const ahora = Date.now();
    const arr = (_hits.get(ip) || []).filter((t) => ahora - t < ventanaMs);
    if (arr.length >= max) {
      return res.status(429).json({ ok: false, mensaje: 'Demasiadas solicitudes. Intenta en un momento.' });
    }
    arr.push(ahora);
    _hits.set(ip, arr);
    next();
  };
}

// ------------------------- Estados (traduccion) ------------------------------
const ESTADOS_FLOW = { 1: 'PAGADO', 2: 'PENDIENTE', 3: 'RECHAZADO', 4: 'ANULADO' };
const ESTADOS_WOMPI = {
  APPROVED: 'PAGADO',
  PENDING: 'PENDIENTE',
  DECLINED: 'RECHAZADO',
  VOIDED: 'ANULADO',
  ERROR: 'RECHAZADO',
};

// --------------------- Confirmacion / liquidacion ----------------------------
async function liquidarSiCorresponde(ordenId) {
  const orden = store.findById(ordenId);
  if (!orden) return null;
  if (orden.status !== 'PAGADO') return orden;
  if (orden.settlement) return orden; // ya liquidada
  const liq = await settlement.liquidar(orden);
  return store.updateOrder(ordenId, { settlement: liq });
}

async function confirmarOrdenFlow(orden, statusData) {
  const status = ESTADOS_FLOW[statusData.status] || 'PENDIENTE';
  // Verifica que el monto coincida (defensa contra manipulacion).
  if (statusData.amount && Number(statusData.amount) !== Number(orden.amount)) {
    return store.updateOrder(orden.id, { status: 'REVISAR', flowStatus: statusData.status, flowRaw: statusData });
  }
  const patch = {
    status,
    flowStatus: statusData.status,
    flowOrder: statusData.flowOrder,
    payer: statusData.payer,
    paymentData: statusData.paymentData,
    updatedAt: Date.now(),
  };
  const updated = store.updateOrder(orden.id, patch);
  if (status === 'PAGADO') await liquidarSiCorresponde(orden.id);
  return store.findById(orden.id) || updated;
}

async function confirmarOrdenWompi(orden, tx) {
  const status = ESTADOS_WOMPI[tx.status] || 'PENDIENTE';
  // Verifica el monto (Wompi usa centavos).
  if (tx.amount_in_cents && Number(tx.amount_in_cents) !== Math.round(Number(orden.amount) * 100)) {
    return store.updateOrder(orden.id, { status: 'REVISAR', wompiStatus: tx.status, wompiRaw: tx });
  }
  const patch = {
    status,
    wompiStatus: tx.status,
    wompiTransactionId: tx.id,
    wompiPaymentMethod: tx.payment_method_type,
    updatedAt: Date.now(),
  };
  const updated = store.updateOrder(orden.id, patch);
  if (status === 'PAGADO') await liquidarSiCorresponde(orden.id);
  return store.findById(orden.id) || updated;
}

// --------------------------------- API ---------------------------------------

// Config publica para el frontend
app.get('/api/config', (req, res) => {
  res.json({
    ok: true,
    comercio: COMMERCE_NAME,
    paises: {
      CL: {
        moneda: 'CLP',
        modo: MODO_CL,
        metodos: ['efectivo', 'tarjeta'],
        limites: LIMITES.CL,
      },
      CO: {
        moneda: 'COP',
        modo: MODO_CO,
        metodos: ['tarjeta'],
        limites: LIMITES.CO,
      },
    },
    liquidacionNequi: {
      activa: settlement.activo,
      destino: 'Nequi',
    },
  });
});

// Crear una orden de pago
app.post('/api/pagar', rateLimit(20, 60 * 1000), async (req, res) => {
  try {
    const { pais, metodo, nombre, email, monto } = req.body || {};

    if (!['CL', 'CO'].includes(pais)) {
      return res.status(400).json({ ok: false, mensaje: 'Pais no soportado.' });
    }
    if (!nombre || String(nombre).trim().length < 3) {
      return res.status(400).json({ ok: false, mensaje: 'Ingresa tu nombre completo.' });
    }
    if (!emailValido(email)) {
      return res.status(400).json({ ok: false, mensaje: 'Ingresa un correo valido.' });
    }
    const lim = LIMITES[pais];
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum < lim.min || montoNum > lim.max) {
      return res.status(400).json({
        ok: false,
        mensaje: `El monto debe estar entre ${lim.min} y ${lim.max} ${lim.moneda}.`,
      });
    }

    const met = pais === 'CO' ? 'tarjeta' : (metodo === 'efectivo' ? 'efectivo' : 'tarjeta');
    const codigo = generarCodigo(pais);
    const id = crypto.randomUUID();
    const orden = {
      id,
      codigo,
      pais,
      metodo: met,
      nombre: String(nombre).trim(),
      email: String(email).trim(),
      amount: montoNum,
      currency: lim.moneda,
      status: 'CREADA',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // ---- CHILE ----
    if (pais === 'CL') {
      if (MODO_CL === 'DEMO') {
        orden.checkoutUrl = `${PUBLIC_URL}/demo/${met === 'efectivo' ? 'checkout' : 'tarjeta'}?codigo=${codigo}`;
        store.createOrder(orden);
        return res.json({ ok: true, codigo, monto: montoNum, moneda: 'CLP', checkoutUrl: orden.checkoutUrl, modo: 'DEMO' });
      }
      const paymentMethod = met === 'efectivo' ? FLOW_PM_EFECTIVO : FLOW_PM_TARJETA;
      const flowResp = await flow.createPayment({
        commerceOrder: codigo,
        subject: `${COMMERCE_NAME} - ${codigo}`,
        amount: Math.round(montoNum),
        currency: 'CLP',
        email: orden.email,
        urlConfirmation: `${PUBLIC_URL}/api/webhook/flow`,
        urlReturn: `${PUBLIC_URL}/api/retorno?codigo=${codigo}`,
        paymentMethod,
        timeout: ORDER_TIMEOUT,
      });
      orden.flowToken = flowResp.token;
      orden.flowOrder = flowResp.flowOrder;
      orden.checkoutUrl = `${flowResp.url}?token=${flowResp.token}`;
      store.createOrder(orden);
      return res.json({ ok: true, codigo, monto: montoNum, moneda: 'CLP', checkoutUrl: orden.checkoutUrl, modo: 'REAL' });
    }

    // ---- COLOMBIA ----
    if (MODO_CO === 'DEMO') {
      orden.checkoutUrl = `${PUBLIC_URL}/demo/wompi?codigo=${codigo}`;
      store.createOrder(orden);
      return res.json({ ok: true, codigo, monto: montoNum, moneda: 'COP', checkoutUrl: orden.checkoutUrl, modo: 'DEMO' });
    }
    const reference = codigo;
    orden.wompiReference = reference;
    orden.checkoutUrl = wompi.buildCheckoutUrl({
      reference,
      amountInCents: Math.round(montoNum * 100),
      redirectUrl: `${PUBLIC_URL}/api/retorno-wompi?codigo=${codigo}`,
      customerData: { email: orden.email, fullName: orden.nombre },
    });
    store.createOrder(orden);
    return res.json({ ok: true, codigo, monto: montoNum, moneda: 'COP', checkoutUrl: orden.checkoutUrl, modo: 'REAL' });
  } catch (e) {
    const detalle = e && e.response && e.response.data ? e.response.data : (e && e.message);
    return res.status(500).json({ ok: false, mensaje: 'No se pudo crear el pago.', detalle });
  }
});

// Consultar estado por codigo
app.get('/api/estado/:codigo', (req, res) => {
  const orden = store.findByCodigo(req.params.codigo);
  if (!orden) return res.status(404).json({ ok: false, mensaje: 'Codigo no encontrado.' });

  // Refresca el estado desde la pasarela si aun esta pendiente.
  if (orden.status !== 'PAGADO' && orden.pais === 'CL' && orden.flowToken && MODO_CL === 'REAL') {
    flow.getStatus(orden.flowToken)
      .then((s) => confirmarOrdenFlow(orden, s))
      .catch(() => {});
  }

  res.json({
    ok: true,
    codigo: orden.codigo,
    status: orden.status,
    monto: orden.amount,
    moneda: orden.currency,
    pais: orden.pais,
    metodo: orden.metodo,
    settlement: orden.settlement || null,
  });
});

// Webhook de Flow (confirmacion server-to-server)
app.post('/api/webhook/flow', async (req, res) => {
  try {
    const token = req.body && req.body.token;
    if (!token) return res.status(400).send('sin token');
    const orden = store.findByToken(token);
    if (!orden) return res.status(404).send('orden no encontrada');
    const statusData = await flow.getStatus(token);
    confirmarOrdenFlow(orden, statusData);
    res.send('OK');
  } catch (e) {
    res.status(500).send('error');
  }
});

// Webhook de Wompi (eventos)
app.post('/api/webhook/wompi', async (req, res) => {
  try {
    const evento = req.body || {};
    if (!wompi.verifyEvent(evento)) {
      return res.status(401).json({ ok: false, mensaje: 'Firma de evento invalida.' });
    }
    const tx = evento.data && evento.data.transaction;
    if (tx) {
      const orden = store.findByWompiId(tx.id) || store.findByCodigo(tx.reference);
      if (orden) await confirmarOrdenWompi(orden, tx);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

// Retorno del pagador (Flow)
app.get('/api/retorno', (req, res) => {
  const codigo = req.query.codigo || '';
  res.redirect(`/?codigo=${encodeURIComponent(codigo)}`);
});

// Retorno del pagador (Wompi)
app.get('/api/retorno-wompi', (req, res) => {
  const codigo = req.query.codigo || '';
  res.redirect(`/?codigo=${encodeURIComponent(codigo)}`);
});

// Listado de ordenes (panel simple)
app.get('/api/ordenes', (req, res) => {
  res.json({ ok: true, ordenes: store.all().slice(0, 100) });
});

// ------------------------------ Rutas DEMO -----------------------------------
app.get('/demo/checkout', (req, res) => res.sendFile(path.join(__dirname, 'public', 'demo-checkout.html')));
app.get('/demo/tarjeta', (req, res) => res.sendFile(path.join(__dirname, 'public', 'demo-tarjeta.html')));
app.get('/demo/wompi', (req, res) => res.sendFile(path.join(__dirname, 'public', 'demo-wompi.html')));

// Simula la confirmacion de un cupon en efectivo (Chile)
app.post('/demo/pay', async (req, res) => {
  const orden = store.findByCodigo(req.body && req.body.codigo);
  if (!orden) return res.status(404).json({ ok: false, mensaje: 'Orden no encontrada.' });
  await confirmarOrdenFlow(orden, { status: 1, amount: orden.amount, flowOrder: orden.flowOrder || 0 });
  res.json({ ok: true });
});

// Simula el pago con tarjeta (Chile)
app.post('/demo/pay-card', async (req, res) => {
  const orden = store.findByCodigo(req.body && req.body.codigo);
  if (!orden) return res.status(404).json({ ok: false, mensaje: 'Orden no encontrada.' });
  await confirmarOrdenFlow(orden, { status: 1, amount: orden.amount, flowOrder: orden.flowOrder || 0 });
  res.json({ ok: true });
});

// Simula el pago en Colombia (Wompi)
app.post('/demo/pay-wompi', async (req, res) => {
  const orden = store.findByCodigo(req.body && req.body.codigo);
  if (!orden) return res.status(404).json({ ok: false, mensaje: 'Orden no encontrada.' });
  await confirmarOrdenWompi(orden, {
    id: 'demo-' + orden.id,
    status: 'APPROVED',
    amount_in_cents: Math.round(orden.amount * 100),
    payment_method_type: req.body && req.body.metodo ? req.body.metodo : 'CARD',
    reference: orden.codigo,
  });
  res.json({ ok: true });
});

// --------------------------------- Arranque ----------------------------------
app.listen(PORT, () => {
  console.log(`\n  ${COMMERCE_NAME} — pagos Chile + Colombia (PWA)`);
  console.log(`  Escuchando en ${PUBLIC_URL}  (puerto ${PORT})`);
  console.log(`  Chile (Flow):   ${MODO_CL}`);
  console.log(`  Colombia (Wompi): ${MODO_CO}`);
  console.log(`  Liquidacion a Nequi: ${settlement.activo ? 'ACTIVA' : 'SIMULADA'}\n`);
});

module.exports = app;
