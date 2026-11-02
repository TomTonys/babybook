'use strict';
const express = require('express');
const { q, one } = require('../db');
const auth = require('../auth');
const { verifyPassword, hashPassword } = require('../lib/password');
const { wrap, fail, str } = require('../lib/http');

const router = express.Router();

// 登录失败限流：同一 IP 15 分钟内最多 10 次失败
const FAIL_WINDOW = 15 * 60 * 1000;
const failures = new Map();

function hitLimit(ip) {
  const rec = failures.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > FAIL_WINDOW) {
    failures.delete(ip);
    return false;
  }
  return rec.count >= 10;
}

function recordFailure(ip) {
  const rec = failures.get(ip);
  if (!rec || Date.now() - rec.first > FAIL_WINDOW) {
    failures.set(ip, { count: 1, first: Date.now() });
  } else {
    rec.count += 1;
  }
}

router.post('/login', wrap(async (req, res) => {
  const ip = req.ip || 'unknown';
  if (hitLimit(ip)) return fail(res, 429, '尝试次数过多，请 15 分钟后再试');

  const username = str(req.body.username, 64);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!username || !password) return fail(res, 400, '请输入账号和密码');

  const user = await one('SELECT * FROM users WHERE username = ?', [username]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordFailure(ip);
    return fail(res, 401, '账号或密码不正确');
  }
  failures.delete(ip);
  auth.setSession(res, user);
  res.json({ user: { id: user.id, username: user.username, displayName: user.display_name } });
}));

router.post('/logout', (req, res) => {
  auth.clearSession(res);
  res.json({ ok: true });
});

router.get('/me', wrap(async (req, res) => {
  const user = await auth.currentUser(req);
  if (!user) return fail(res, 401, '未登录');
  res.json({ user: { id: user.id, username: user.username, displayName: user.display_name } });
}));

router.post('/password', auth.requireAuth, wrap(async (req, res) => {
  const oldPassword = typeof req.body.oldPassword === 'string' ? req.body.oldPassword : '';
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  if (newPassword.length < 6) return fail(res, 400, '新密码至少 6 位');

  const user = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user || !verifyPassword(oldPassword, user.password_hash)) {
    return fail(res, 400, '当前密码不正确');
  }
  await q('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), user.id]);
  res.json({ ok: true });
}));

module.exports = router;
