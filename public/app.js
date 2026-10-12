/* =============================================================================
   app.js — Lógica del frontend (Chile + Colombia) + sesión + PWA
   -----------------------------------------------------------------------------
   DOS FLUJOS EXACTOS:
     - CHILE     -> SOLO efectivo: se genera un CÓDIGO y se paga en
                    Servipag / Sencillito. NO se pide RUT en la web.
     - COLOMBIA  -> SOLO tarjeta (crédito/débito, Mastercard, etc.) por Wompi.
   Además: inicio de sesión (para ver "Mis pagos"), polling de estado y PWA.
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
let pais = 'CL';          // Chile por defecto
let cfg = null;
let usuario = null;       // sesión actual (o null)

const MONEDAS = {
  CL: { code: 'CLP', min: 350, max: 5000000, rapido: [5000, 10000, 20000, 26000], locale: 'es-CL' },
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
    if (cfg.comercio) {
      $('#tituloComercio').textContent = cfg.comercio;
      $('#tbNombre').textContent = cfg.comercio;
    }
    pintarAvisoModo();
  } catch (e) { /* sin config, seguimos */ }
}

function pintarAvisoModo() {
  if (!cfg) return;
  const modoCL = cfg.paises && cfg.paises.CL && cfg.paises.CL.modo;
  const modoCO = cfg.paises && cfg.paises.CO && cfg.paises.CO.modo;
  const noConfig = modoCL === 'NO_CONFIG' || modoCO === 'NO_CONFIG';
  const demo = modoCL === 'DEMO' || modoCO === 'DEMO';

  if (noConfig) {
    const paises = [];
    if (modoCL === 'NO_CONFIG') paises.push('Chile');
    if (modoCO === 'NO_CONFIG') paises.push('Colombia');
    avisoModo.innerHTML =
      '<div class="aviso"><b>Cobros aún no activados.</b> Falta conectar las llaves de cobro real de ' +
      paises.join(' y ') + '. Mientras no se conecten, <b>no se generan pagos</b> (ni simulados). ' +
      'El comercio debe poner sus llaves de Flow (Chile) y Wompi (Colombia) para cobrar de verdad.</div>';
  } else if (demo) {
    avisoModo.innerHTML =
      '<div class="aviso"><b>Modo de pruebas.</b> El sistema está en modo demostración ' +
      '(DEMO_MODE). Los pagos se simulan. Para cobrar de verdad, activa las credenciales reales.</div>';
  } else {
    avisoModo.innerHTML = '';
  }
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

  if (p === 'CO') {
    $('#miIcono').textContent = '💳';
    $('#miTitulo').textContent = 'Tarjeta de crédito o débito';
    $('#miTexto').textContent = 'Pagas con tarjeta (Mastercard, Visa, etc.) en el checkout seguro de Wompi. El comercio nunca ve los datos de tu tarjeta.';
    $('#medios').innerHTML = '<span>Tarjeta</span><span>Mastercard</span><span>Visa</span><span>Wompi</span>';
    $('#etiquetaCodigo').textContent = 'Tu código de pago';
  } else {
    $('#miIcono').textContent = '💵';
    $('#miTitulo').textContent = 'Efectivo con código';
    $('#miTexto').textContent = 'Recibes un código y pagas en Servipag / Sencillito. No necesitas RUT en la web.';
    $('#medios').innerHTML = '<span>Servipag</span><span>Servipag Express</span><span>Sencillito</span><span>Efectivo</span>';
    $('#etiquetaCodigo').textContent = 'Tu código de pago';
  }
  pintarPasos();
}

/* -------------------------------- Pasos ----------------------------------- */
function pintarPasos() {
  const titulo = $('#tituloPasos');
  const pasos = $('#pasos');
  const btn = $('#btnPagar');
  if (!pasos) return;

  if (pais === 'CO') {
    if (titulo) titulo.textContent = '¿Cómo pagar con tarjeta en Colombia?';
    pasos.innerHTML =
      '<div class="paso"><div class="num">1</div><p>Presiona <b>“Ir a pagar”</b> para abrir el checkout seguro de Wompi.</p></div>' +
      '<div class="paso"><div class="num">2</div><p>Ingresa los datos de tu <b>tarjeta de crédito o débito</b> (Mastercard, Visa, etc.).</p></div>' +
      '<div class="paso"><div class="num">3</div><p>Wompi procesa el pago de forma segura (el comercio nunca ve tu tarjeta).</p></div>' +
      '<div class="paso"><div class="num">4</div><p>Al confirmarse, esta página cambia a <b>PAGADO</b> y el dinero se dispersa a Nequi.</p></div>';
    if (btn) btn.textContent = 'Generar orden de pago';
  } else {
    if (titulo) titulo.textContent = '¿Cómo pagar en efectivo en Chile?';
    pasos.innerHTML =
      '<div class="paso"><div class="num">1</div><p>Presiona <b>“Ir a pagar”</b> para abrir el checkout y elegir <b>Servipag → Cupón de pago</b> (o Sencillito).</p></div>' +
      '<div class="paso"><div class="num">2</div><p>Recibirás el <b>cupón con tu código</b> por correo y en pantalla.</p></div>' +
      '<div class="paso"><div class="num">3</div><p>Acude a cualquier <b>sucursal Servipag / Servipag Express</b> o <b>Sencillito</b> y paga en efectivo mostrando el código.</p></div>' +
      '<div class="paso"><div class="num">4</div><p>Al confirmarse el pago, esta página cambia a <b>PAGADO</b> automáticamente.</p></div>';
    if (btn) btn.textContent = 'Generar código de pago';
  }
}

/* ------------------------------ Listeners UI ------------------------------ */
document.querySelectorAll('#paises .p').forEach((el) => {
  el.addEventListener('click', () => seleccionarPais(el.dataset.pais));
});

/* -------------------------------- Enviar ---------------------------------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (cfg && cfg.requiereLogin && !usuario) {
    abrirModal('login');
    return;
  }

  btnPagar.disabled = true;
  const textoOriginal = btnPagar.textContent;
  btnPagar.textContent = 'Generando...';

  const payload = {
    pais,
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
      if (r.status === 401) { abrirModal('login'); return; }
      alert(data.mensaje || 'No se pudo generar el pago.');
      return;
    }

    codigoActual = data.codigo;
    codigoTexto.textContent = data.codigo;
    montoTexto.innerHTML = fmt(data.monto, data.moneda) + ' <span>' + data.moneda + '</span>';
    linkPagar.href = data.checkoutUrl;
    linkPagar.textContent = pais === 'CO' ? 'Ir a pagar con tarjeta (Wompi)' : 'Ir a pagar (Servipag / Sencillito)';
    liquidacion.style.display = 'none';
    resultado.classList.add('visible');
    pintarEstado('CREADA');
    resultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
    iniciarPolling();
    if (usuario) cargarMisPagos();
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
        if (data.status === 'PAGADO') {
          linkPagar.style.display = 'none';
          if (usuario) cargarMisPagos();
        }
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

/* =========================================================================
   SESIÓN (login / registro / mis pagos)
   ========================================================================= */
const authModal = $('#authModal');

function abrirModal(tab) {
  authModal.classList.add('visible');
  cambiarTab(tab || 'login');
}
function cerrarModal() {
  authModal.classList.remove('visible');
  $('#loginMsg').textContent = '';
  $('#regMsg').textContent = '';
}
function cambiarTab(tab) {
  const esLogin = tab === 'login';
  $('#tabLogin').classList.toggle('sel', esLogin);
  $('#tabRegistro').classList.toggle('sel', !esLogin);
  $('#formLogin').style.display = esLogin ? 'block' : 'none';
  $('#formRegistro').style.display = esLogin ? 'none' : 'block';
}

$('#modalCerrar').addEventListener('click', cerrarModal);
$('#tabLogin').addEventListener('click', () => cambiarTab('login'));
$('#tabRegistro').addEventListener('click', () => cambiarTab('registro'));
authModal.addEventListener('click', (e) => { if (e.target === authModal) cerrarModal(); });

function pintarSesion() {
  const cont = $('#tbAcciones');
  if (!cont) return;
  const esComercio = usuario && usuario.role === 'admin';
  // Helpers a prueba de caché vieja (si un elemento aún no existe, no rompemos).
  const mostrar = (sel, on) => { const el = $(sel); if (el) el.style.display = on ? 'block' : 'none'; };
  if (usuario) {
    cont.innerHTML =
      '<span class="tb-user">👤 ' + escapar(usuario.nombre) + '</span>' +
      '<button type="button" class="tb-btn" id="tbMisPagos">Mis pagos</button>' +
      (esComercio ? '<button type="button" class="tb-btn tb-btn-primario" id="tbMiSaldo">Mi saldo</button>' : '') +
      '<button type="button" class="tb-btn" id="tbSalir">Salir</button>';
    const bMisPagos = $('#tbMisPagos');
    if (bMisPagos) bMisPagos.addEventListener('click', () => {
      const el = $('#misPagosCard'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const bMiSaldo = $('#tbMiSaldo');
    if (esComercio && bMiSaldo) {
      bMiSaldo.addEventListener('click', () => {
        const el = $('#billeteraCard'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    const bSalir = $('#tbSalir');
    if (bSalir) bSalir.addEventListener('click', cerrarSesion);
    const mpU = $('#mpUsuario'); if (mpU) mpU.textContent = usuario.email;
    mostrar('#misPagosCard', true);
    mostrar('#billeteraCard', esComercio);
    if (esComercio) cargarBilletera();
  } else {
    cont.innerHTML =
      '<button type="button" class="tb-btn" id="tbLogin">Iniciar sesión</button>' +
      '<button type="button" class="tb-btn tb-btn-primario" id="tbRegistro">Crear cuenta</button>';
    const bLogin = $('#tbLogin'); if (bLogin) bLogin.addEventListener('click', () => abrirModal('login'));
    const bReg = $('#tbRegistro'); if (bReg) bReg.addEventListener('click', () => abrirModal('registro'));
    mostrar('#misPagosCard', false);
    mostrar('#billeteraCard', false);
  }
}

/* --------------------- Billetera del comercio (mini) ---------------------- */
async function cargarBilletera() {
  const fCOP = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
  const fCLP = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
  try {
    const r = await fetch('/api/admin/wallet');
    const data = await r.json();
    if (!data.ok) return;
    const w = data.wallet;
    $('#bmSaldo').innerHTML = fCOP(w.disponibleCOP) + ' <small>COP</small>';
    $('#bmRecaudadoCOP').textContent = fCOP(w.recaudadoCOP);
    $('#bmTransferidoCOP').textContent = fCOP(w.transferidoCOP);
    $('#bmRecaudadoCLP').textContent = fCLP(w.recaudadoCLP);
    $('#bmNequi').textContent = w.nequi
      ? (w.nequi.telefono + (w.nequi.nombre ? ' · ' + w.nequi.nombre : ''))
      : 'sin configurar';
  } catch (e) { /* silencioso */ }
}

async function cargarSesion() {
  try {
    const r = await fetch('/api/auth/me');
    const data = await r.json();
    usuario = data && data.usuario ? data.usuario : null;
  } catch (e) {
    usuario = null;
  }
  pintarSesion();
  if (usuario) cargarMisPagos();
}

async function cerrarSesion() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  usuario = null;
  pintarSesion();
}

/* Formulario de login */
$('#formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#loginMsg');
  msg.textContent = 'Entrando...';
  msg.className = 'auth-msg';
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('#loginEmail').value.trim(), password: $('#loginPass').value }),
    });
    const data = await r.json();
    if (!data.ok) { msg.textContent = data.mensaje || 'No se pudo iniciar sesión.'; msg.className = 'auth-msg err'; return; }
    usuario = data.usuario;
    pintarSesion();
    cargarMisPagos();
    cerrarModal();
    $('#formLogin').reset();
  } catch (err) {
    msg.textContent = 'Error de conexión.'; msg.className = 'auth-msg err';
  }
});

/* Formulario de registro */
$('#formRegistro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#regMsg');
  msg.textContent = 'Creando cuenta...';
  msg.className = 'auth-msg';
  try {
    const r = await fetch('/api/auth/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: $('#regNombre').value.trim(),
        email: $('#regEmail').value.trim(),
        password: $('#regPass').value,
      }),
    });
    const data = await r.json();
    if (!data.ok) { msg.textContent = data.mensaje || 'No se pudo crear la cuenta.'; msg.className = 'auth-msg err'; return; }
    usuario = data.usuario;
    pintarSesion();
    cargarMisPagos();
    cerrarModal();
    $('#formRegistro').reset();
  } catch (err) {
    msg.textContent = 'Error de conexión.'; msg.className = 'auth-msg err';
  }
});

/* -------------------------------- Mis pagos ------------------------------- */
async function cargarMisPagos() {
  if (!usuario) return;
  const lista = $('#misPagosLista');
  lista.innerHTML = '<p class="hint">Cargando tus pagos…</p>';
  try {
    const r = await fetch('/api/mis-ordenes');
    const data = await r.json();
    if (!data.ok) { lista.innerHTML = '<p class="hint">No se pudieron cargar tus pagos.</p>'; return; }
    if (!data.ordenes.length) {
      lista.innerHTML = '<p class="hint">Aún no tienes pagos. Genera uno arriba y aparecerá aquí.</p>';
      return;
    }
    lista.innerHTML = data.ordenes.map((o) => {
      const est = ESTADO_TXT[o.status] || o.status;
      const clase = String(o.status || '').toLowerCase();
      return '<div class="mp-item">' +
        '<div class="mp-izq"><b>' + escapar(o.codigo) + '</b>' +
        '<span class="mp-pais">' + (o.pais === 'CO' ? '🇨🇴 Colombia · Tarjeta' : '🇨🇱 Chile · Efectivo') + '</span></div>' +
        '<div class="mp-der"><span class="mp-monto">' + fmt(o.monto, o.moneda) + ' ' + o.moneda + '</span>' +
        '<span class="estado ' + clase + '"><span class="dot"></span>' + est + '</span></div>' +
        '</div>';
    }).join('');
  } catch (e) {
    lista.innerHTML = '<p class="hint">Error al cargar tus pagos.</p>';
  }
}

function escapar(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin SW, la web igual funciona */ });
  });
}

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

window.addEventListener('appinstalled', () => {
  if (instalarBarra) instalarBarra.classList.remove('visible');
  deferredPrompt = null;
});

/* -------------------------------- Arranque -------------------------------- */
seleccionarPais('CL');
cargarConfig();
cargarSesion();
