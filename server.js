/* =============================================================================
   server.js — Pasarela de pagos (Chile + Colombia) + App web instalable (PWA)
   -----------------------------------------------------------------------------
   CHILE (Flow):
     - EFECTIVO: cupon de pago presencial (Servipag / Servipag Express / Sencillito)
       Los clientes NO necesitan RUT en la web: solo reciben un codigo.
   COLOMBIA (Wompi):
     - TARJETA (debito / credito, Mastercard, etc.) en el Web Checkout de Wompi.
     - El dinero se dispersa a la cuenta Nequi del comercio (Pagos a Terceros).

   Ademas: inicio de sesion de usuarios, panel del comercio con billetera
   (saldo real) y transferencia real a Nequi.

   Seguridad: la web del comercio NUNCA captura datos de tarjeta (PCI-DSS).
   ============================================================================= */

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const Flow = require('./lib/flow');
const Wompi = require('./lib/wompi');
const store = require('./lib/store');
const users = require('./lib/users');
const auth = require('./lib/auth');
const { createSettlement } = require('./lib/settlement');
const { createWallet } = require('./lib/wallet');

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

// Billetera del comercio (saldo real recaudado + dispersion a Nequi).
const wallet = createWallet({ store, wompi, payoutsCfg, nequi, activo: settlement.activo });

// Modo de operacion:
//   REAL      -> hay llaves de comercio, se cobra de verdad.
//   DEMO      -> SOLO si DEMO_MODE=true (pruebas: simula el pago).
//   NO_CONFIG -> faltan llaves y no hay demo: NO se puede cobrar (nada de simulacion).
const DEMO_MODE = process.env.DEMO_MODE === 'true';
const MODO_CL = hasFlowKeys ? 'REAL' : (DEMO_MODE ? 'DEMO' : 'NO_CONFIG');
const MODO_CO = hasWompiKeys ? 'REAL' : (DEMO_MODE ? 'DEMO' : 'NO_CONFIG');

// --- Autenticacion / sesiones ---
// Si es true, para crear un pago hay que haber iniciado sesion.
const REQUIRE_LOGIN_TO_PAY = process.env.REQUIRE_LOGIN_TO_PAY === 'true';

// ------------------------------- Middleware ----------------------------------
// CORS con credenciales (para que la cookie de sesion viaje si hay front externo).
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(auth.attachUser);

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
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Service-Worker-Allowed', '/');
    } else if (/\.(html|js|css)$/i.test(filePath)) {
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
        metodos: ['efectivo'],
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
    requiereLogin: REQUIRE_LOGIN_TO_PAY,
  });
});

// ------------------------------ Autenticacion --------------------------------
app.post('/api/auth/registro', rateLimit(20, 60 * 1000), (req, res) => {
  try {
    const { nombre, email, password } = req.body || {};
    if (!nombre || String(nombre).trim().length < 3) {
      return res.status(400).json({ ok: false, mensaje: 'Ingresa tu nombre completo.' });
    }
    if (!emailValido(email)) {
      return res.status(400).json({ ok: false, mensaje: 'Ingresa un correo valido.' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ ok: false, mensaje: 'La contrasena debe tener al menos 8 caracteres.' });
    }
    // Si aun no existe ningun COMERCIO (administrador), el primero en registrarse
    // lo sera. Asi el dueño de la web siempre puede ver su billetera y pasar el
    // saldo a Nequi, sin tener que configurar variables de entorno.
    const hayAdmin = users.all().some((u) => u.role === 'admin');
    const user = users.create({
      nombre,
      email,
      passwordHash: auth.hashPassword(password),
      role: hayAdmin ? 'user' : 'admin',
    });
    auth.setSession(res, user);
    return res.json({ ok: true, usuario: auth.publicUser(user) });
  } catch (e) {
    if (e && e.code === 'EMAIL_EXISTS') {
      return res.status(409).json({ ok: false, mensaje: e.message });
    }
    return res.status(500).json({ ok: false, mensaje: 'No se pudo crear la cuenta.' });
  }
});

app.post('/api/auth/login', rateLimit(30, 60 * 1000), (req, res) => {
  const { email, password } = req.body || {};
  const user = users.findByEmail(email);
  if (!user || !auth.verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ ok: false, mensaje: 'Correo o contrasena incorrectos.' });
  }
  auth.setSession(res, user);
  return res.json({ ok: true, usuario: auth.publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  auth.clearSession(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ ok: true, usuario: auth.publicUser(req.user) });
});

// ------------------------- Mis ordenes (usuario) -----------------------------
app.get('/api/mis-ordenes', auth.requireAuth, (req, res) => {
  const mias = store.all()
    .filter((o) => o.userId === req.user.id || String(o.email).toLowerCase() === req.user.email)
    .slice(0, 100)
    .map((o) => ({
      codigo: o.codigo,
      pais: o.pais,
      metodo: o.metodo,
      monto: o.amount,
      moneda: o.currency,
      status: o.status,
      createdAt: o.createdAt,
      settlement: o.settlement || null,
    }));
  res.json({ ok: true, ordenes: mias });
});

// --------------------------- Panel de administracion -------------------------
app.get('/api/admin/ordenes', auth.requireAdmin, (req, res) => {
  res.json({ ok: true, ordenes: store.all().slice(0, 200) });
});

app.get('/api/admin/usuarios', auth.requireAdmin, (req, res) => {
  res.json({ ok: true, usuarios: users.all() });
});

app.get('/api/admin/stats', auth.requireAdmin, (req, res) => {
  const ordenes = store.all();
  const pagadas = ordenes.filter((o) => o.status === 'PAGADO');
  const suma = (arr) => arr.reduce((a, o) => a + Number(o.amount || 0), 0);
  const porPais = {
    CL: ordenes.filter((o) => o.pais === 'CL').length,
    CO: ordenes.filter((o) => o.pais === 'CO').length,
  };
  res.json({
    ok: true,
    stats: {
      totalOrdenes: ordenes.length,
      pagadas: pagadas.length,
      usuarios: users.count(),
      porPais,
      recaudadoCLP: suma(pagadas.filter((o) => o.currency === 'CLP')),
      recaudadoCOP: suma(pagadas.filter((o) => o.currency === 'COP')),
      modoCL: MODO_CL,
      modoCO: MODO_CO,
      liquidacionNequi: settlement.activo,
    },
  });
});

// --------------------------- Billetera del comercio --------------------------
app.get('/api/admin/wallet', auth.requireAdmin, (req, res) => {
  res.json({ ok: true, wallet: wallet.resumen() });
});

app.post('/api/admin/transferir-nequi', auth.requireAdmin, rateLimit(10, 60 * 1000), async (req, res) => {
  try {
    const transferencia = await wallet.transferirNequi({ montoCOP: req.body && req.body.montoCOP });
    res.json({ ok: true, transferencia, wallet: wallet.resumen() });
  } catch (e) {
    res.status(400).json({ ok: false, mensaje: e.message || 'No se pudo transferir.' });
  }
});

// Crear una orden de pago
app.post('/api/pagar', rateLimit(20, 60 * 1000), async (req, res) => {
  try {
    const { pais, metodo, nombre, email, monto } = req.body || {};

    // Si el comercio exige sesion para pagar, la comprobamos aqui.
    if (REQUIRE_LOGIN_TO_PAY && !req.user) {
      return res.status(401).json({ ok: false, mensaje: 'Inicia sesion para realizar el pago.' });
    }

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

    // Chile = efectivo (codigo). Colombia = tarjeta.
    const met = pais === 'CO' ? 'tarjeta' : 'efectivo';
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
      userId: req.user ? req.user.id : null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // ---- CHILE ----
    if (pais === 'CL') {
      if (MODO_CL === 'NO_CONFIG') {
        return res.status(503).json({
          ok: false,
          mensaje: 'El cobro en Chile aun no esta configurado. El comercio debe conectar sus llaves de Flow para cobrar de verdad.',
        });
      }
      if (MODO_CL === 'DEMO') {
        orden.checkoutUrl = `${PUBLIC_URL}/demo/checkout?codigo=${codigo}`;
        store.createOrder(orden);
        return res.json({ ok: true, codigo, monto: montoNum, moneda: 'CLP', checkoutUrl: orden.checkoutUrl, modo: 'DEMO' });
      }
      const paymentMethod = FLOW_PM_EFECTIVO;
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
    if (MODO_CO === 'NO_CONFIG') {
      return res.status(503).json({
        ok: false,
        mensaje: 'El cobro en Colombia aun no esta configurado. El comercio debe conectar sus llaves de Wompi para cobrar de verdad.',
      });
    }
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

// Listado de ordenes (panel simple) — protegido por admin
app.get('/api/ordenes', auth.requireAdmin, (req, res) => {
  res.json({ ok: true, ordenes: store.all().slice(0, 100) });
});

// ------------------------------ Rutas DEMO -----------------------------------
app.get('/demo/checkout', (req, res) => res.sendFile(path.join(__dirname, 'public', 'demo-checkout.html')));
app.get('/demo/tarjeta', (req, res) => res.sendFile(path.join(__dirname, 'public', 'demo-tarjeta.html')));
app.get('/demo/wompi', (req, res) => res.sendFile(path.join(__dirname, 'public', 'demo-wompi.html')));

app.post('/demo/pay', async (req, res) => {
  const orden = store.findByCodigo(req.body && req.body.codigo);
  if (!orden) return res.status(404).json({ ok: false, mensaje: 'Orden no encontrada.' });
  await confirmarOrdenFlow(orden, { status: 1, amount: orden.amount, flowOrder: orden.flowOrder || 0 });
  res.json({ ok: true });
});

app.post('/demo/pay-card', async (req, res) => {
  const orden = store.findByCodigo(req.body && req.body.codigo);
  if (!orden) return res.status(404).json({ ok: false, mensaje: 'Orden no encontrada.' });
  await confirmarOrdenFlow(orden, { status: 1, amount: orden.amount, flowOrder: orden.flowOrder || 0 });
  res.json({ ok: true });
});

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

// ---------------------- Administrador inicial (bootstrap) --------------------
(function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  try {
    if (email && password) {
      const existente = users.findByEmail(email);
      if (!existente) {
        users.create({
          nombre: process.env.ADMIN_NAME || 'Administrador',
          email,
          passwordHash: auth.hashPassword(password),
          role: 'admin',
        });
        console.log(`  [auth] Administrador creado: ${email}`);
      } else if (existente.role !== 'admin') {
        users.update(existente.id, { role: 'admin' });
        console.log(`  [auth] Usuario ${email} promovido a administrador.`);
      }
      return;
    }
    // Sin ADMIN_EMAIL configurado: el primer usuario registrado es el COMERCIO
    // (administrador), para que vea su billetera y pueda pasar el saldo a Nequi.
    const hayAdmin = users.all().some((u) => u.role === 'admin');
    if (!hayAdmin) {
      const todos = users.all(); // ordenados por fecha (mas reciente primero)
      const masAntiguo = todos[todos.length - 1];
      if (masAntiguo) {
        users.update(masAntiguo.id, { role: 'admin' });
        console.log(`  [auth] Comercio (administrador) asignado: ${masAntiguo.email}`);
      }
    }
  } catch (e) {
    console.warn('  [auth] No se pudo crear el administrador:', e.message);
  }
})();

// --------------------------------- Arranque ----------------------------------
app.listen(PORT, () => {
  console.log(`\n  ${COMMERCE_NAME} — pagos Chile + Colombia (PWA)`);
  console.log(`  Escuchando en ${PUBLIC_URL}  (puerto ${PORT})`);
  console.log(`  Chile (Flow):   ${MODO_CL}`);
  console.log(`  Colombia (Wompi): ${MODO_CO}`);
  console.log(`  Liquidacion a Nequi: ${settlement.activo ? 'ACTIVA' : 'SIMULADA'}`);
  console.log(`  Login para pagar: ${REQUIRE_LOGIN_TO_PAY ? 'OBLIGATORIO' : 'OPCIONAL'}\n`);
});

module.exports = app;
