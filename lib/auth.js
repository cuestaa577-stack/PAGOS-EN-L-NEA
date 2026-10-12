/* =============================================================================
   lib/auth.js — Autenticacion (sesiones con JWT en cookie httpOnly)
   -----------------------------------------------------------------------------
   - Contrasenas con bcrypt (nunca en texto plano).
   - JWT en cookie httpOnly, SameSite=Lax (Secure con HTTPS). El JS del navegador
     no puede leer esa cookie -> protege contra robo de token por XSS.
   - Middlewares: attachUser (opcional), requireAuth (401), requireAdmin (403).
   ============================================================================= */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const users = require('./users');

const COOKIE_NAME = 'pagos_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias
const BCRYPT_ROUNDS = 10;

let AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  AUTH_SECRET = require('crypto').randomBytes(48).toString('hex');
  console.warn('\n  [auth] AUTH_SECRET no definido: se genero uno temporal.');
  console.warn('  [auth] Define AUTH_SECRET en .env para que las sesiones persistan.\n');
}

function cookieSecure() {
  const url = String(process.env.PUBLIC_URL || '');
  return process.env.NODE_ENV === 'production' || url.startsWith('https://');
}

function hashPassword(plain) {
  return bcrypt.hashSync(String(plain), BCRYPT_ROUNDS);
}

function verifyPassword(plain, hash) {
  try {
    return bcrypt.compareSync(String(plain), String(hash));
  } catch (e) {
    return false;
  }
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, AUTH_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, AUTH_SECRET);
  } catch (e) {
    return null;
  }
}

function setSession(res, user) {
  res.cookie(COOKIE_NAME, signToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function attachUser(req, res, next) {
  req.user = null;
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token) {
    const payload = verifyToken(token);
    if (payload && payload.sub) {
      const user = users.findById(payload.sub);
      if (user) req.user = user;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, mensaje: 'Debes iniciar sesion.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, mensaje: 'Debes iniciar sesion.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, mensaje: 'No tienes permisos de administrador.' });
  }
  next();
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, nombre: user.nombre, email: user.email, role: user.role };
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  setSession,
  clearSession,
  attachUser,
  requireAuth,
  requireAdmin,
  publicUser,
};
