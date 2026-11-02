'use strict';
const express = require('express');
const { q, one } = require('../db');
const auth = require('../auth');
const { wrap, fail, str, num, date, intId } = require('../lib/http');
const D = require('../lib/dates');

const router = express.Router();
router.use(auth.requireAuth);

router.get('/babies/:id/growth', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const baby = id && await one('SELECT id, birth_date FROM babies WHERE id = ?', [id]);
  if (!baby) return fail(res, 404, '宝宝不存在');
  const rows = await q(
    'SELECT * FROM growth_records WHERE baby_id = ? ORDER BY measured_on ASC, id ASC', [id],
  );
  const records = rows.map((r) => ({
    ...r,
    ageDays: baby.birth_date ? D.diffDays(r.measured_on, baby.birth_date) : null,
    ageText: baby.birth_date ? D.formatAge(baby.birth_date, r.measured_on) : '',
  }));
  res.json({ records });
}));

router.post('/babies/:id/growth', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const baby = id && await one('SELECT id FROM babies WHERE id = ?', [id]);
  if (!baby) return fail(res, 404, '宝宝不存在');
  const measured = date(req.body.measured_on) || D.todayStr();
  const weight = num(req.body.weight_kg, { min: 0.4, max: 120 });
  const height = num(req.body.height_cm, { min: 20, max: 200 });
  const head = num(req.body.head_cm, { min: 20, max: 70 });
  if (weight == null && height == null && head == null) return fail(res, 400, '至少填写一项测量数据');
  const result = await q(
    `INSERT INTO growth_records (baby_id, measured_on, weight_kg, height_cm, head_cm, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, measured, weight, height, head, str(req.body.note, 255)],
  );
  const row = await one('SELECT * FROM growth_records WHERE id = ?', [result.insertId]);
  res.status(201).json({ record: row });
}));

router.patch('/growth/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const row = id && await one('SELECT * FROM growth_records WHERE id = ?', [id]);
  if (!row) return fail(res, 404, '记录不存在');
  const data = {};
  if (req.body.measured_on !== undefined) data.measured_on = date(req.body.measured_on) || row.measured_on;
  if (req.body.weight_kg !== undefined) data.weight_kg = num(req.body.weight_kg, { min: 0.4, max: 120 });
  if (req.body.height_cm !== undefined) data.height_cm = num(req.body.height_cm, { min: 20, max: 200 });
  if (req.body.head_cm !== undefined) data.head_cm = num(req.body.head_cm, { min: 20, max: 70 });
  if (req.body.note !== undefined) data.note = str(req.body.note, 255);
  const cols = Object.keys(data);
  if (!cols.length) return fail(res, 400, '没有需要更新的内容');
  await q(
    `UPDATE growth_records SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...cols.map((c) => data[c]), id],
  );
  res.json({ record: await one('SELECT * FROM growth_records WHERE id = ?', [id]) });
}));

router.delete('/growth/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  if (!id) return fail(res, 400, '参数错误');
  await q('DELETE FROM growth_records WHERE id = ?', [id]);
  res.json({ ok: true });
}));

module.exports = router;
