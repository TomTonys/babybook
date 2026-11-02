'use strict';
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./config');
const { buildSeed } = require('./data/vaccines');
const { hashPassword } = require('./lib/password');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+08:00',
  dateStrings: true,
  supportBigNumbers: true,
});

async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    multipleStatements: true,
  });
  try {
    await conn.query(schema);
  } finally {
    await conn.end();
  }
}

async function seedVaccineDefs() {
  const rows = buildSeed();
  const values = rows.map((r) => [r.code, r.name, r.dose_no, r.age_months, r.age_label, r.category, r.notes, r.sort_order]);
  await q(
    `INSERT INTO vaccine_defs (code, name, dose_no, age_months, age_label, category, notes, sort_order)
     VALUES ? ON DUPLICATE KEY UPDATE
       name = VALUES(name), age_months = VALUES(age_months), age_label = VALUES(age_label),
       category = VALUES(category), notes = VALUES(notes), sort_order = VALUES(sort_order)`,
    [values],
  );
}

async function seedAdmin() {
  const row = await one('SELECT COUNT(*) AS n FROM users');
  if (row && row.n > 0) return;
  const hash = hashPassword(config.adminPassword);
  await q('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)', [
    config.adminUser, hash, '管理员',
  ]);
  console.log(`\n  已创建管理员账号：${config.adminUser} / ${config.adminPassword}\n  登录后请到「设置」修改密码。\n`);
}

async function getSetting(k) {
  const row = await one('SELECT v FROM settings WHERE k = ?', [k]);
  return row ? row.v : null;
}

async function setSetting(k, v) {
  await q(
    'INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
    [k, v],
  );
}

/** 会话密钥：优先环境变量，否则生成一次并存库，保证重启后会话不失效 */
async function initSessionSecret() {
  if (config.sessionSecret) return config.sessionSecret;
  let secret = await getSetting('session_secret');
  if (!secret) {
    secret = require('crypto').randomBytes(48).toString('hex');
    await setSetting('session_secret', secret);
  }
  return secret;
}

async function init() {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  await migrate();
  await seedVaccineDefs();
  await seedAdmin();
}

module.exports = { pool, q, one, init, migrate, getSetting, setSetting, initSessionSecret };
