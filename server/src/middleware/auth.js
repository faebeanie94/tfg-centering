const crypto = require('crypto');
const express = require('express');

const COOKIE_NAME = 'tfg_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// Failed login attempts by client IP. In memory, so a restart clears it.
const failedLogins = new Map();

function safeEqual(a, b) {
  const hash = (value) => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

// Keyed on the password, so changing TEAM_PASSWORD signs everyone out.
function sign(expires, password) {
  return crypto.createHmac('sha256', password).update(`session:${expires}`).digest('hex');
}

function createSessionToken(password) {
  const expires = Date.now() + SESSION_TTL_MS;
  return `${expires}.${sign(expires, password)}`;
}

function isValidSessionToken(token, password) {
  const match = /^(\d+)\.([0-9a-f]{64})$/.exec(token || '');
  if (!match || !password) return false;
  const [, expires, signature] = match;
  return Number(expires) > Date.now() && safeEqual(signature, sign(expires, password));
}

function readSessionCookie(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator !== -1 && part.slice(0, separator).trim() === COOKIE_NAME) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

function requireAuth(req, res, next) {
  if (isValidSessionToken(readSessionCookie(req), process.env.TEAM_PASSWORD)) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

// Fly's proxy always overwrites this header, so it can't be spoofed in production.
function clientIp(req) {
  return req.headers['fly-client-ip'] || req.ip;
}

function isLockedOut(ip) {
  const record = failedLogins.get(ip);
  return Boolean(record) && record.resetAt > Date.now() && record.count >= MAX_FAILED_LOGINS;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  for (const [key, record] of failedLogins) {
    if (record.resetAt <= now) failedLogins.delete(key);
  }
  const record = failedLogins.get(ip) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  record.count += 1;
  failedLogins.set(ip, record);
}

function login(req, res) {
  const password = process.env.TEAM_PASSWORD;
  if (!password) {
    return res.status(503).json({ error: 'Sign-in is not configured on this server' });
  }

  const ip = clientIp(req);
  if (isLockedOut(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  const submitted = req.body?.password;
  if (typeof submitted !== 'string' || !safeEqual(submitted, password)) {
    recordFailedLogin(ip);
    return res.status(401).json({ error: 'Incorrect password' });
  }

  failedLogins.delete(ip);
  res.cookie(COOKIE_NAME, createSessionToken(password), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/api',
  });
  res.status(204).end();
}

// Mounted on /api ahead of the body parsers, so unauthenticated uploads are
// rejected before they're buffered into memory.
const authGate = express.Router();
authGate.post('/auth/login', express.json({ limit: '10kb' }), login);
authGate.use(requireAuth);

module.exports = { authGate, requireAuth, failedLogins };
