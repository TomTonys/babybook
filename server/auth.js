'use strict';
const crypto = require('crypto');
const { one } = require('./db');

const COOKIE = 'bb_sid';
const MAX_AGE = 30 * 24 * 3600; // 30 天
let SECRET = '';

function init(secret) {
  SECRET = secret;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || !payload.uid || !payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function setSession(res, user) {
  const token = sign({ uid: user.id, exp: Date.now() + MAX_AGE * 1000 });
  const attrs = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE}`,
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/**
 * 从 req 里取出 token。支持三种形态（客户端/代理写法不一）：
 *  1. Cookie 头正常值：bb_sid=<body>.<mac>
 *  2. Cookie 值多包了一层名字：bb_sid=bb_sid=<body>.<mac>
 *  3. 整个 Cookie 头被当成值传入：<body>.<mac>（如某些 SDK 透传）
 */
function extractToken(req) {
  const header = req.headers.cookie || '';
  const jar = parseCookies(header);
  let token = jar[COOKIE] || '';
  if (token.startsWith(`${COOKIE}=`)) token = token.slice(COOKIE.length + 1);
  if (!token.includes('.') && header.includes('.') && !header.includes(' ')) {
    token = header.trim();
  }
  return token;
}

async function currentUser(req) {
  const token = extractToken(req);
  const payload = verify(token);
  if (!payload) return null;
  const user = await one('SELECT id, username, display_name FROM users WHERE id = ?', [payload.uid]);
  return user || null;
}

async function requireAuth(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: '请先登录' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { init, setSession, clearSession, currentUser, requireAuth, parseCookies, extractToken };
