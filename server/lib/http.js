'use strict';
const { isDate } = require('./dates');

/** 包裹 async 路由，统一把异常交给 express 错误处理 */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function str(value, max = 255) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function num(value, { min = -Infinity, max = Infinity } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function date(value) {
  return typeof value === 'string' && isDate(value) ? value : null;
}

function intId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = { wrap, fail, str, num, date, intId };
