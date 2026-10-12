/* =============================================================================
   lib/store.js — Persistencia simple de ordenes en un archivo JSON
   -----------------------------------------------------------------------------
   Guarda las ordenes en data/orders.json con escritura atomica (write a un
   archivo temporal y luego rename) para evitar corrupcion si el proceso muere.
   Es suficiente para una web de servicios; para alto volumen se puede migrar a
   una base de datos (Postgres, MySQL, etc.) sin cambiar la interfaz publica.
   ============================================================================= */

const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'orders.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    cache = JSON.parse(raw);
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

const store = {
  /** Crea una orden nueva. */
  createOrder(order) {
    const db = load();
    db[order.id] = order;
    persist();
    return order;
  },

  /** Actualiza una orden existente con un patch. */
  updateOrder(id, patch) {
    const db = load();
    if (!db[id]) return null;
    db[id] = Object.assign({}, db[id], patch, { updatedAt: Date.now() });
    persist();
    return db[id];
  },

  /** Busca por el token de Flow. */
  findByToken(token) {
    const db = load();
    return Object.values(db).find((o) => o.flowToken === token) || null;
  },

  /** Busca por id interno. */
  findById(id) {
    const db = load();
    return db[id] || null;
  },

  /** Busca por el codigo legible (PAGO-XXXXXX / CO-XXXXXX). */
  findByCodigo(codigo) {
    const db = load();
    const c = String(codigo || '').toUpperCase();
    return Object.values(db).find((o) => String(o.codigo).toUpperCase() === c) || null;
  },

  /** Busca por el id de transaccion de Wompi. */
  findByWompiId(wompiId) {
    const db = load();
    return Object.values(db).find((o) => o.wompiTransactionId === wompiId) || null;
  },

  /** Devuelve todas las ordenes (mas recientes primero). */
  all() {
    const db = load();
    return Object.values(db).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },
};

module.exports = store;
