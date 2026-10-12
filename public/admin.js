/* =============================================================================
   admin.js — Panel del COMERCIO
   -----------------------------------------------------------------------------
   - Verifica que la sesión sea de administrador.
   - Muestra estadísticas, la BILLETERA (saldo real recaudado) y las órdenes.
   - Permite ordenar la transferencia del saldo a la cuenta Nequi del comercio.
   ============================================================================= */

const $ = (sel) => document.querySelector(sel);

const fmtCOP = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
const fmtCLP = (n) => '$' + Number(n || 0).toLocaleString('es-CL');

const ESTADO_TXT = {
  CREADA: 'Esperando pago',
  PENDIENTE: 'Pendiente',
  PAGADO: 'Pagado',
  RECHAZADO: 'Rechazado',
  ANULADO: 'Anulado',
  REVISAR: 'En revisión',
};

function escapar(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fecha(ms) {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  } catch (e) { return '—'; }
}

/* --------------------------------- Arranque -------------------------------- */
(async function init() {
  let usuario = null;
  try {
    const r = await fetch('/api/auth/me');
    const data = await r.json();
    usuario = data && data.usuario ? data.usuario : null;
  } catch (e) { /* sin sesión */ }

  if (!usuario || usuario.role !== 'admin') {
    $('#gate').style.display = 'block';
    $('#panel').style.display = 'none';
    $('#gateMsg').innerHTML = usuario
      ? 'Tu cuenta (<b>' + escapar(usuario.email) + '</b>) es de <b>cliente</b>, no del comercio. ' +
        'Para ver la billetera y pasar el saldo a Nequi, entra con la cuenta del <b>comercio (administrador)</b>.'
      : 'Debes iniciar sesión con la cuenta del <b>comercio (administrador)</b> para ver la billetera.';
    return;
  }

  $('#gate').style.display = 'none';
  $('#panel').style.display = 'block';

  $('#btnSalir').addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    location.href = 'index.html';
  });

  $('#btnTransferir').addEventListener('click', transferir);

  await Promise.all([cargarStats(), cargarWallet(), cargarOrdenes(), cargarUsuarios()]);
})();

/* --------------------------------- Stats ----------------------------------- */
async function cargarStats() {
  try {
    const r = await fetch('/api/admin/stats');
    const data = await r.json();
    if (!data.ok) return;
    const s = data.stats;

    if (s.modoCL === 'NO_CONFIG' || s.modoCO === 'NO_CONFIG') {
      const faltan = [];
      if (s.modoCL === 'NO_CONFIG') faltan.push('Chile (Flow)');
      if (s.modoCO === 'NO_CONFIG') faltan.push('Colombia (Wompi)');
      $('#avisoConfig').innerHTML =
        '<div class="aviso"><b>Cobros sin activar:</b> faltan las llaves de ' + faltan.join(' y ') +
        '. Mientras no las conectes, no se generan pagos reales (ni simulados).</div>';
    } else if (s.modoCL === 'DEMO' || s.modoCO === 'DEMO') {
      $('#avisoConfig').innerHTML =
        '<div class="aviso"><b>Modo de pruebas (DEMO_MODE).</b> Los pagos se simulan. ' +
        'Desactiva DEMO_MODE y agrega las llaves reales para cobrar de verdad.</div>';
    } else {
      $('#avisoConfig').innerHTML = '';
    }

    $('#stats').innerHTML =
      tarjeta('Órdenes totales', s.totalOrdenes) +
      tarjeta('Pagadas', s.pagadas) +
      tarjeta('Usuarios', s.usuarios) +
      tarjeta('Chile (CLP)', fmtCLP(s.recaudadoCLP), 'recaudado') +
      tarjeta('Colombia (COP)', fmtCOP(s.recaudadoCOP), 'recaudado') +
      tarjeta('Órdenes por país', s.porPais.CL + ' CL · ' + s.porPais.CO + ' CO');
  } catch (e) { /* silencioso */ }
}

function tarjeta(k, v, sub) {
  return '<div class="stat"><div class="k">' + escapar(k) + '</div><div class="v">' +
    escapar(v) + (sub ? ' <small>' + escapar(sub) + '</small>' : '') + '</div></div>';
}

/* -------------------------------- Billetera -------------------------------- */
async function cargarWallet() {
  try {
    const r = await fetch('/api/admin/wallet');
    const data = await r.json();
    if (!data.ok) return;
    const w = data.wallet;

    $('#saldoDisponible').innerHTML = fmtCOP(w.disponibleCOP) + ' <small>COP</small>';
    $('#recaudadoCOP').textContent = fmtCOP(w.recaudadoCOP);
    $('#transferidoCOP').textContent = fmtCOP(w.transferidoCOP);
    $('#recaudadoCLP').textContent = fmtCLP(w.recaudadoCLP);
    $('#nequiDestino').textContent = w.nequi
      ? (w.nequi.telefono + (w.nequi.nombre ? ' · ' + w.nequi.nombre : ''))
      : 'sin configurar';

    if (!w.activo) {
      $('#msgTransferir').textContent =
        'La dispersión a Nequi está en modo pendiente: faltan las credenciales de "Pagos a Terceros" de Wompi.';
      $('#msgTransferir').className = 'msg err';
    }
  } catch (e) { /* silencioso */ }
}

async function transferir() {
  const msg = $('#msgTransferir');
  const monto = $('#montoTransferir').value;
  msg.textContent = 'Enviando…';
  msg.className = 'msg';
  $('#btnTransferir').disabled = true;
  try {
    const r = await fetch('/api/admin/transferir-nequi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(monto ? { montoCOP: Number(monto) } : {}),
    });
    const data = await r.json();
    if (!data.ok) {
      msg.textContent = data.mensaje || 'No se pudo transferir.';
      msg.className = 'msg err';
      return;
    }
    const t = data.transferencia;
    if (t.estado === 'ENVIADO') {
      msg.textContent = '✅ Transferencia enviada a Nequi por ' + fmtCOP(t.monto) + ' COP.';
      msg.className = 'msg ok';
    } else if (t.estado === 'PENDIENTE_CONFIG') {
      msg.textContent = '⚠️ Registrada, pero falta configurar las credenciales de dispersión (Wompi Pagos a Terceros).';
      msg.className = 'msg err';
    } else {
      msg.textContent = '⚠️ La dispersión no se pudo completar. Revisa las credenciales.';
      msg.className = 'msg err';
    }
    $('#montoTransferir').value = '';
    await cargarWallet();
  } catch (e) {
    msg.textContent = 'Error de conexión.';
    msg.className = 'msg err';
  } finally {
    $('#btnTransferir').disabled = false;
  }
}

/* -------------------------------- Órdenes ---------------------------------- */
async function cargarOrdenes() {
  try {
    const r = await fetch('/api/admin/ordenes');
    const data = await r.json();
    if (!data.ok) return;
    const tb = $('#tablaOrdenes');
    if (!data.ordenes.length) {
      tb.innerHTML = '<tr><td colspan="7">Aún no hay órdenes.</td></tr>';
      return;
    }
    tb.innerHTML = data.ordenes.map((o) => {
      const clase = String(o.status || '').toLowerCase();
      return '<tr>' +
        '<td><b>' + escapar(o.codigo) + '</b></td>' +
        '<td>' + (o.pais === 'CO' ? '🇨🇴 CO' : '🇨🇱 CL') + '</td>' +
        '<td>' + escapar(o.metodo || '—') + '</td>' +
        '<td>' + (o.currency === 'COP' ? fmtCOP(o.amount) : fmtCLP(o.amount)) + ' ' + escapar(o.currency) + '</td>' +
        '<td><span class="estado ' + clase + '"><span class="dot"></span>' + (ESTADO_TXT[o.status] || o.status) + '</span></td>' +
        '<td>' + escapar(o.nombre) + '<br><small>' + escapar(o.email) + '</small></td>' +
        '<td>' + fecha(o.createdAt) + '</td>' +
        '</tr>';
    }).join('');
  } catch (e) { /* silencioso */ }
}

/* -------------------------------- Usuarios --------------------------------- */
async function cargarUsuarios() {
  try {
    const r = await fetch('/api/admin/usuarios');
    const data = await r.json();
    if (!data.ok) return;
    const tb = $('#tablaUsuarios');
    if (!data.usuarios.length) {
      tb.innerHTML = '<tr><td colspan="4">Aún no hay usuarios registrados.</td></tr>';
      return;
    }
    tb.innerHTML = data.usuarios.map((u) =>
      '<tr>' +
      '<td>' + escapar(u.nombre) + '</td>' +
      '<td>' + escapar(u.email) + '</td>' +
      '<td>' + (u.role === 'admin' ? '👑 admin' : 'usuario') + '</td>' +
      '<td>' + fecha(u.createdAt) + '</td>' +
      '</tr>'
    ).join('');
  } catch (e) { /* silencioso */ }
}
