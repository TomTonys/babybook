'use strict';
const crypto = require('crypto');

const KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const calc = crypto.scryptSync(String(password), salt, KEYLEN);
  const expect = Buffer.from(hash, 'hex');
  return calc.length === expect.length && crypto.timingSafeEqual(calc, expect);
}

module.exports = { hashPassword, verifyPassword };
