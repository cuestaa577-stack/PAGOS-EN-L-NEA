/* =============================================================================
   app.js — Lógica del frontend (Chile + Colombia) + App instalable (PWA)
   - Selector de PAÍS (CL / CO) y MÉTODO (efectivo / tarjeta)
   - Envía el formulario al backend (/api/pagar)
   - Muestra el CÓDIGO de pago y el botón para ir al checkout seguro
   - Consulta el estado automáticamente (polling) hasta que se pague
   - Muestra la liquidación a la cuenta Nequi del comercio
   - Registra el Service Worker y ofrece instalar la app
   ============================================================================= */

const $ = (sel) => document.querySelector(sel);

const form = $('#paymentForm');
const btnPagar = $('#btnPagar');
const resultado = $('#resultado');
const codigoTexto = $('#codigoTexto');
const montoTexto = $('#montoTexto');
const estadoWrap = $('#estadoWrap');
const linkPagar = $('#linkPagar');
const avisoModo = $('#avisoModo');
const liquidacion = $('#liquidacion');

let codigoActual = null;
let pollTimer = null;
let pais = 'CO';          // país seleccionado
let metodo = 'tarjeta';   // método seleccionado
let cfg = null;

const MONEDAS = {
  CL: { code: 'CLP', min: 350, max: 5000000, rapido: [10000, 20000, 26000, 50000], locale: 'es-CL' },
  CO: { code: 'COP', min: 1500, max: 50000000, rapido: [20000, 50000, 100000, 200000], locale: 'es-CO' },
};

const fmt = (n, code) => {
  const loc = code === 'COP' ? 'es-CO' : 'es-CL';
  return '$' + Number(n).toLocaleString(loc);
};

/* --------------------------------- Config --------------------------------- */
async function cargarConfig() {
  try {
    const r = await fetch('/api/config');
    cfg = await r.json();
    if (cfg.comercio) $('#tituloComercio').textContent = cfg.comercio;
    const demoCL = cfg.paises && cfg.paises.CL && cfg.paises.CL.modo === 'DEMO';
    const demoCO = cfg.paises && cfg.paises.CO && cfg.paises.CO.modo === 'DEMO';
    if (demoCL || demoCO) {
      avisoModo.innerHTML =
        '<div class="aviso"><b>Modo demostración.</b> El sistema funciona, pero aún no hay llaves de cobro reales para ' +
        (demoCL && demoCO ? 'ningún país' : demoCL ? 'Chile' : 'Colombia') +
        '. El pago se simula. Para cobrar de verdad, activa tus credenciales (ver README).</div>';
    }
  } catch (e) { /* sin config, seguimos */ }
}

/* ------------------------------ Montos rápidos ---------------------------- */
function pintarMontosRapidos() {
  const m = MONEDAS[pais];
  const cont = $('#montosRapidos');
  cont.innerHTML = '';
  m.rapido.forEach((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = fmt(v, m.code);
    b.addEventListener('click', () => { $('#monto').value = v; });
    cont.appendChild(b);
  });
}

/* -------------------------------- País ------------------------------------ */
function seleccionarPais(p) {
  pais = p;
  document.querySelectorAll('#paises .p').forEach((el) => {
    el.classList.toggle('sel', el.dataset.pais === p);
  });

  const m = MONEDAS[p];
  $('#labelMonto').textContent = `Monto a pagar (${m.code})`;
  $('#monto').min = m.min;
  $('#monto').max = m.max;
  $('#monto').placeholder = p === 'CO' ? 'Ej. 50000' : 'Ej. 26000';
  $('#hintMonto').textContent =
    `Mínimo ${m.min.toLocaleString(m.locale)} ${m.code} · Máximo ${m.max.toLocaleString(m.locale)} ${m.code} por transacción.`;
  pintarMontosRapidos();

  // Colombia: Wompi cobra tarjeta, Nequi y PSE (sin cupón de barrio).
  const opEfectivo = $('#opEfectivo');
  if (p === 'CO') {
    opEfectivo.style.display = 'none';
    seleccionarMetodo('tarjeta');
    $('#ssTarjeta').textContent = 'Tarjeta, Nequi o PSE';
    $('#medios').innerHTML = '<span>Tarjeta</span><span>Nequi</span><span>PSE</span><span>Bancolombia</span>';
  } else {
    opEfectivo.style.display = '';
    $('#ssEfectivo').textContent = 'Con un código en Servipag / Sencillito';
    $('#ssTarjeta').textContent = 'Crédito o débito, pago seguro';
    $('#medios').innerHTML = '<span>Servipag</span><span>Servipag Express</span><span>Sencillito</span><span>Efectivo</span>';
  }
  pintarPasos();
}

/* -------------------------------- Método ---------------------------------- */
function seleccionarMetodo(met) {
  metodo = met;
  document.querySelectorAll('#metodos .op').forEach((el) => {
    el.classList.toggle('sel', el.dataset.metodo === met);
  });
  pintarPasos();
}

function pintarPasos() {
  const titulo = $('#tituloPasos');
  const pasos = $('#pasos');
  const btn = $('#btnPagar');
  if (!pasos) return;
  if (pais === 'CO') {
    if (titulo) titulo.textContent = '¿Cómo pagar en Colombia?';
    pasos.innerHTML =
      '<div class="paso"><div class="num">1</div><p>Presiona <b>&ldquo;Ir a pagar&rdquo;</b> para abrir el checkout seguro de Wompi.</p></div>' +
      '<div class="paso"><div class="num">2</div><p>Elige <b>tarjeta</b>, <b>Nequi</b> o <b>PSE</b> y completa el pago.</p></div>' +
      '<div class="paso"><div class="num">3</div><p>Wompi procesa el pago de forma segura (el comercio nunca ve tu tarjeta).</p></div>' +
      '<div class="paso"><div class="num">4</div><p>Al confirmarse, esta página cambia a <b>PAGADO</b> y el dinero se dispersa a Nequi.</p></div>';
    if (btn) btn.textContent = 'Generar orden de pago';
  } else if (metodo === 'efectivo') {
    if (titulo) titulo.textContent = '¿Cómo pagar en efectivo?';
    pasos.innerHTML =
      '<div class="paso"><div class="num">1</div><p>Presiona <b>&ldquo;Ir a pagar&rdquo;</b> para abrir el checkout y elegir <b>Servipag &rarr; Cupón de pago</b> (o Sencillito).</p></div>' +
      '<div class="paso"><div class="num">2</div><p>Recibirás el <b>cupón con tu código</b> por correo y en pantalla.</p></div>' +
      '<div class="paso"><div class="num">3</div><p>Acude a cualquier <b>sucursal Servipag / Servipag Express</b> o <b>Sencillito</b> y paga en efectivo mostrando el código.</p></div>' +
      '<div class="paso"><div class="num">4</div><p>Al confirmarse el pago, esta página cambia a <b>PAGADO</b> automáticamente.</p></div>';
    if (btn) btn.textContent = 'Generar código de pago';
  } else {
    if (titulo) titulo.textContent = '¿Cómo pagar con tarjeta?';
    pasos.innerHTML =
      '<div class="paso"><div class="num">1</div><p>Presiona <b>&ldquo;Ir a pagar&rdquo;</b> para abrir el checkout seguro de Flow.</p></div>' +
      '<div class="paso"><div class="num">2</div><p>Ingresa los datos de tu tarjeta de crédito o débito en la página segura.</p></div>' +
      '<div class="paso"><div class="num">3</div><p>La pasarela certificada PCI-DSS procesa el pago; el comercio nunca ve tu tarjeta.</p></div>' +
      '<div class="paso"><div class="num">4</div><p>Al confirmarse el pago, esta página cambia a <b>PAGADO</b> automáticamente.</p></div>';
    if (btn) btn.textContent = 'Ir a pagar con tarjeta';
  }
}

/* ------------------------------ Listeners UI ------------------------------ */
document.querySelectorAll('#paises .p').forEach((el) => {
  el.addEventListener('click', () => seleccionarPais(el.dataset.pais));
});
document.querySelectorAll('#metodos .op').forEach((el) => {
  el.addEventListener('click', () => seleccionarMetodo(el.dataset.metodo));
});

/* -------------------------------- Enviar ---------------------------------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  btnPagar.disabled = true;
  const textoOriginal = btnPagar.textContent;
  btnPagar.textContent = 'Generando...';

  const payload = {
    pais,
    metodo,
    nombre: $('#nombre').value.trim(),
    email: $('#email').value.trim(),
    monto: Number($('#monto').value),
  };

  try {
    const r = await fetch('/api/pagar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json();

    if (!data.ok) {
      alert(data.mensaje || 'No se pudo generar el pago.');
      return;
    }

    codigoActual = data.codigo;
    codigoTexto.textContent = data.codigo;
    montoTexto.innerHTML = fmt(data.monto, data.moneda) + ' <span>' + data.moneda + '</span>';
    linkPagar.href = data.checkoutUrl;
    linkPagar.textContent = pais === 'CO' ? 'Ir a pagar (Wompi)' : (metodo === 'tarjeta' ? 'Ir a pagar con tarjeta' : 'Ir a pagar');
    liquidacion.style.display = 'none';
    resultado.classList.add('visible');
    pintarEstado('CREADA');
    resultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
    iniciarPolling();
  } catch (err) {
    alert('Error de conexión con el servidor.');
  } finally {
    btnPagar.disabled = false;
    btnPagar.textContent = textoOriginal;
  }
});

/* -------------------------------- Estados --------------------------------- */
const ESTADO_TXT = {
  CREADA: 'Esperando pago',
  PENDIENTE: 'Pendiente de pago',
  PAGADO: 'Pagado',
  RECHAZADO: 'Rechazado',
  ANULADO: 'Anulado',
  REVISAR: 'En revisión',
};

function pintarEstado(status) {
  const clase = String(status || 'CREADA').toLowerCase();
  estadoWrap.innerHTML =
    '<span class="estado ' + clase + '"><span class="dot"></span>' +
    (ESTADO_TXT[status] || status) + '</span>';
}

function pintarLiquidacion(settlement) {
  if (!settlement) { liquidacion.style.display = 'none'; return; }
  const estados = {
    ENVIADO: '💜 Dinero dispersado a tu cuenta Nequi',
    SIMULADO: '💜 Liquidación a Nequi (simulada en modo demo)',
    NO_APLICA: 'ℹ️ Este cobro se liquida en Chile (vía Flow)',
    ERROR: '⚠️ La dispersión a Nequi quedó pendiente',
  };
  const monto = settlement.montoCentavos
    ? '$' + (settlement.montoCentavos / 100).toLocaleString('es-CO') + ' COP'
    : '';
  liquidacion.textContent = (estados[settlement.estado] || 'Liquidación') + (monto ? ' · ' + monto : '');
  liquidacion.style.display = 'flex';
}

/* -------------------------------- Polling --------------------------------- */
function iniciarPolling() {
  detenerPolling();
  pollTimer = setInterval(consultarEstado, 5000);
}
function detenerPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function consultarEstado() {
  if (!codigoActual) return;
  try {
    const r = await fetch('/api/estado/' + encodeURIComponent(codigoActual));
    const data = await r.json();
    if (data.ok) {
      pintarEstado(data.status);
      if (data.status === 'PAGADO') pintarLiquidacion(data.settlement);
      if (['PAGADO', 'RECHAZADO', 'ANULADO'].includes(data.status)) {
        detenerPolling();
        if (data.status === 'PAGADO') linkPagar.style.display = 'none';
      }
    }
  } catch (e) { /* reintenta */ }
}

/* --------------------------- Consultar manual ----------------------------- */
$('#btnConsultar').addEventListener('click', async () => {
  const cod = $('#codigoConsulta').value.trim().toUpperCase();
  const msg = $('#consultaMsg');
  if (!cod) { msg.textContent = 'Ingresa un código.'; return; }
  try {
    const r = await fetch('/api/estado/' + encodeURIComponent(cod));
    const data = await r.json();
    if (!data.ok) { msg.textContent = 'No encontramos ese código.'; return; }
    msg.textContent = 'Pedido ' + data.codigo + ': ' + (ESTADO_TXT[data.status] || data.status) +
      ' — ' + fmt(data.monto, data.moneda) + ' ' + data.moneda;
  } catch (e) {
    msg.textContent = 'Error al consultar.';
  }
});

/* -------------------------------- Imprimir -------------------------------- */
$('#btnImprimir').addEventListener('click', () => window.print());

/* -------------------------- Auto-consulta por URL ------------------------- */
(function autoConsulta() {
  const params = new URLSearchParams(location.search);
  const cod = params.get('codigo');
  if (cod) {
    $('#codigoConsulta').value = cod;
    codigoActual = cod;
    $('#btnConsultar').click();
    iniciarPolling();
  }
})();

/* =========================================================================
   PWA — App instalable
   ========================================================================= */
let deferredPrompt = null;
const instalarBarra = $('#instalarBarra');
const btnInstalar = $('#btnInstalar');
const btnCerrarInstalar = $('#btnCerrarInstalar');
const iosAyuda = $('#iosAyuda');

// 1) Registro del Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin SW, la web igual funciona */ });
  });
}

// 2) Android/Chrome/Edge: el navegador avisa cuando la app se puede instalar
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (instalarBarra) instalarBarra.classList.add('visible');
});

if (btnInstalar) {
  btnInstalar.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (instalarBarra) instalarBarra.classList.remove('visible');
  });
}

if (btnCerrarInstalar) {
  btnCerrarInstalar.addEventListener('click', () => {
    if (instalarBarra) instalarBarra.classList.remove('visible');
  });
}

// 3) iOS (Safari): no existe beforeinstallprompt -> mostramos instrucciones
(function iosInstallHint() {
  const ua = window.navigator.userAgent || '';
  const esIOS = /iphone|ipad|ipod/i.test(ua);
  const esSafari = /safari/i.test(ua) && !/crios|fxios|chrome/i.test(ua);
  const yaInstalada = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (esIOS && esSafari && !yaInstalada && iosAyuda) {
    iosAyuda.classList.add('visible');
  }
})();

// 4) Si ya quedó instalada, ocultamos el banner
window.addEventListener('appinstalled', () => {
  if (instalarBarra) instalarBarra.classList.remove('visible');
  deferredPrompt = null;
});

/* -------------------------------- Arranque -------------------------------- */
seleccionarPais('CO');
cargarConfig();
