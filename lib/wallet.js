/* =============================================================================
   lib/wallet.js — Billetera del COMERCIO (saldo real + transferencia a Nequi)
   -----------------------------------------------------------------------------
   IMPORTANTE (legal): esta "billetera" NO custodia dinero. Muestra el saldo
   REAL que la pasarela (Wompi) tiene a favor del comercio por los cobros
   confirmados (ordenes PAGADO), y permite ordenar la dispersion de ese dinero
   a la cuenta Nequi del comercio mediante "Pagos a Terceros" de Wompi.
   ============================================================================= */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { maskPhone } = require('./settlement');

const DB_PATH = process.env.WALLET_DB_PATH || path.join(__dirname, '..', 'data', 'transfers.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    cache = {};
  }
  return cache;
}

function persist() {
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function createWallet({ store, wompi, payoutsCfg, nequi, activo }) {
  function ordenesPagadas() {
    return store.all().filter((o) => o.status === 'PAGADO');
  }

  function recaudadoPorMoneda() {
    const pagadas = ordenesPagadas();
    const sum = (cur) => pagadas.filter((o) => o.currency === cur)
      .reduce((a, o) => a + Number(o.amount || 0), 0);
    return { COP: sum('COP'), CLP: sum('CLP') };
  }

  function transferidoCOP() {
    const db = load();
    return Object.values(db)
      .filter((t) => t.estado === 'ENVIADO' && t.moneda === 'COP')
      .reduce((a, t) => a + Number(t.monto || 0), 0);
  }

  function disponibleCOP() {
    return Math.max(0, recaudadoPorMoneda().COP - transferidoCOP());
  }

  function historial() {
    const db = load();
    return Object.values(db).sort((a, b) => (b.fecha || 0) - (a.fecha || 0)).slice(0, 100);
  }

  function resumen() {
    const rec = recaudadoPorMoneda();
    return {
      activo,
      moneda: 'COP',
      recaudadoCOP: rec.COP,
      recaudadoCLP: rec.CLP,
      transferidoCOP: transferidoCOP(),
      disponibleCOP: disponibleCOP(),
      nequi: (nequi && nequi.phone)
        ? { telefono: maskPhone(nequi.phone), nombre: nequi.name || '' }
        : null,
      historial: historial(),
    };
  }

  async function transferirNequi({ montoCOP } = {}) {
    const disponible = disponibleCOP();
    const monto = montoCOP ? Math.round(Number(montoCOP)) : disponible;
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new Error('Monto invalido.');
    }
    if (monto > disponible) {
      throw new Error(`El monto supera el saldo disponible (${disponible} COP).`);
    }

    const id = crypto.randomUUID();
    const referencia = `TRF-${id}`;
    const base = { id, referencia, moneda: 'COP', monto, fecha: Date.now(), destino: 'NEQUI' };

    if (!activo) {
      const rec = Object.assign({}, base, {
        estado: 'PENDIENTE_CONFIG',
        detalle: 'Faltan credenciales de Pagos a Terceros (Wompi) para dispersar.',
      });
      const db = load(); db[id] = rec; persist();
      return rec;
    }

    try {
      const resp = await wompi.disperseToNequi(payoutsCfg, {
        reference: referencia,
        amountInCents: monto * 100,
        nequi,
      });
      const rec = Object.assign({}, base, { estado: 'ENVIADO', respuesta: resp });
      const db = load(); db[id] = rec; persist();
      return rec;
    } catch (e) {
      const detalle = e && e.response && e.response.data ? e.response.data : (e && e.message);
      const rec = Object.assign({}, base, { estado: 'ERROR', detalle });
      const db = load(); db[id] = rec; persist();
      return rec;
    }
  }

  return { resumen, transferirNequi, disponibleCOP, activo };
}

module.exports = { createWallet };
