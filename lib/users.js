/* =============================================================================
   lib/users.js — Registro de usuarios (persistencia en JSON)
   -----------------------------------------------------------------------------
   Guarda los usuarios en data/users.json con escritura atomica (write + rename).
   Las contrasenas NUNCA se guardan en texto plano: se guardan como hash bcrypt.
   ============================================================================= */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.USERS_DB_PATH || path.join(__dirname, '..', 'data', 'users.json');

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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const users = {
  create({ nombre, email, passwordHash, role = 'user' }) {
    const db = load();
    const emailNorm = normalizeEmail(email);
    if (Object.values(db).some((u) => u.email === emailNorm)) {
      const err = new Error('Ese correo ya esta registrado.');
      err.code = 'EMAIL_EXISTS';
      throw err;
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    const user = {
      id,
      nombre: String(nombre || '').trim(),
      email: emailNorm,
      passwordHash,
      role: role === 'admin' ? 'admin' : 'user',
      createdAt: now,
      updatedAt: now,
    };
    db[id] = user;
    persist();
    return user;
  },

  findByEmail(email) {
    const db = load();
    const emailNorm = normalizeEmail(email);
    return Object.values(db).find((u) => u.email === emailNorm) || null;
  },

  findById(id) {
    const db = load();
    return db[id] || null;
  },

  update(id, patch) {
    const db = load();
    if (!db[id]) return null;
    db[id] = Object.assign({}, db[id], patch, { updatedAt: Date.now() });
    persist();
    return db[id];
  },

  all() {
    const db = load();
    return Object.values(db)
      .map(({ passwordHash, ...rest }) => rest)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  count() {
    return Object.keys(load()).length;
  },
};

module.exports = users;
module.exports.normalizeEmail = normalizeEmail;
