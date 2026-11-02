'use strict';
const express = require('express');
const { q, one } = require('../db');
const auth = require('../auth');
const { wrap, fail, str, date, intId } = require('../lib/http');

const router = express.Router();
router.use(auth.requireAuth);

const KINDS = ['checkup', 'milestone', 'other'];

router.get('/babies/:id/events', wrap(async (req, res) => {
  const id = intId(req.params.id);
  if (!id) return fail(res, 400, '参数错误');
  const rows = await q(
    'SELECT * FROM events WHERE baby_id = ? ORDER BY done ASC, event_date ASC', [id],
  );
  res.json({ events: rows });
}));

router.post('/babies/:id/events', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const baby = id && await one('SELECT id FROM babies WHERE id = ?', [id]);
  if (!baby) return fail(res, 404, '宝宝不存在');
  const title = str(req.body.title, 128);
  const when = date(req.body.event_date);
  if (!title) return fail(res, 400, '请填写事项名称');
  if (!when) return fail(res, 400, '请选择日期');
  const kind = KINDS.includes(req.body.kind) ? req.body.kind : 'other';
  const result = await q(
    'INSERT INTO events (baby_id, title, event_date, kind, notes) VALUES (?, ?, ?, ?, ?)',
    [id, title, when, kind, str(req.body.notes, 255)],
  );
  res.status(201).json({ event: await one('SELECT * FROM events WHERE id = ?', [result.insertId]) });
}));

router.patch('/events/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const row = id && await one('SELECT * FROM events WHERE id = ?', [id]);
  if (!row) return fail(res, 404, '记录不存在');
  const data = {};
  if (req.body.title !== undefined) data.title = str(req.body.title, 128) || row.title;
  if (req.body.event_date !== undefined) data.event_date = date(req.body.event_date) || row.event_date;
  if (req.body.kind !== undefined && KINDS.includes(req.body.kind)) data.kind = req.body.kind;
  if (req.body.done !== undefined) data.done = req.body.done ? 1 : 0;
  if (req.body.notes !== undefined) data.notes = str(req.body.notes, 255);
  const cols = Object.keys(data);
  if (!cols.length) return fail(res, 400, '没有需要更新的内容');
  await q(
    `UPDATE events SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...cols.map((c) => data[c]), id],
  );
  res.json({ event: await one('SELECT * FROM events WHERE id = ?', [id]) });
}));

router.delete('/events/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  if (!id) return fail(res, 400, '参数错误');
  await q('DELETE FROM events WHERE id = ?', [id]);
  res.json({ ok: true });
}));

module.exports = router;
