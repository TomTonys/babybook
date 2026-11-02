'use strict';
const path = require('path');
const os = require('os');
const express = require('express');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use(express.json({ limit: '6mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.static(config.publicDir, {
  index: false,
  // 页面/JS/CSS 每次向服务器校验（文件没变返回 304，几乎零开销），
  // 保证更新代码后刷新即生效，不会被旧缓存卡住
  setHeaders(res, filePath) {
    if (/\.(js|css|html)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d' }));

app.get('/api/health', async (req, res) => {
  try {
    await db.q('SELECT 1');
    res.json({ ok: true, time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/babies', require('./routes/babies'));
app.use('/api', require('./routes/vaccines'));
app.use('/api', require('./routes/prenatal'));
app.use('/api', require('./routes/growth'));
app.use('/api', require('./routes/events'));
app.use('/api', require('./routes/ai'));

app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

// 单页应用回退
app.get('*', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'index.html'));
});

// 统一错误处理
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  const status = err.status && err.status < 500 ? err.status : 500;
  res.status(status).json({ error: status === 500 ? '服务器开小差了，请稍后再试' : err.message });
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) out.push(item.address);
    }
  }
  return out;
}

async function main() {
  await db.init();
  const secret = await db.initSessionSecret();
  auth.init(secret);

  const server = app.listen(config.port, config.host, () => {
    console.log('\n  宝宝簿 BabyBook 已启动');
    console.log(`  本机访问   http://localhost:${config.port}`);
    for (const ip of lanAddresses()) console.log(`  局域网访问 http://${ip}:${config.port}`);
    console.log(`  数据库     ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}\n`);
  });

  const shutdown = async () => {
    server.close();
    await db.pool.end().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('启动失败：', err.message);
  if (err.code === 'ECONNREFUSED') console.error('请检查 MySQL 地址与端口是否可达。');
  if (err.code === 'ER_ACCESS_DENIED_ERROR') console.error('请检查数据库用户名或密码。');
  if (err.code === 'ER_BAD_DB_ERROR') console.error('请先创建数据库，或检查 DB_NAME。');
  process.exit(1);
});
