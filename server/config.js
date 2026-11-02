'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** 极简 .env 读取，避免额外依赖 */
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv();

const env = process.env;

module.exports = {
  root: ROOT,
  port: Number(env.PORT || 8090),
  host: env.HOST || '0.0.0.0',
  trustProxy: env.TRUST_PROXY === '1',
  db: {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'babybook',
  },
  adminUser: env.ADMIN_USER || 'admin',
  adminPassword: env.ADMIN_PASSWORD || 'baby123456',
  sessionSecret: env.SESSION_SECRET || '',
  uploadDir: path.join(ROOT, 'data', 'uploads'),
  publicDir: path.join(ROOT, 'public'),
};
