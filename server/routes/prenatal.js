'use strict';
const express = require('express');
const { q, one } = require('../db');
const auth = require('../auth');
const { wrap, fail, str, num, date, intId } = require('../lib/http');
const D = require('../lib/dates');

const router = express.Router();
router.use(auth.requireAuth);

function serialize(row, dueDate) {
  if (!row) return null;
  return {
    ...row,
    gestDays: row.gest_days,
    gestLabel: row.gest_days != null ? D.gestLabel(row.gest_days) : (dueDate ? D.gestLabel(D.gestDays(dueDate, row.visit_date)) : ''),
  };
}

function readBody(body, dueDate) {
  const out = {};
  if (body.visit_date !== undefined) out.visit_date = date(body.visit_date);
  if (body.visit_type !== undefined) out.visit_type = str(body.visit_type, 32) || '常规产检';
  if (body.hospital !== undefined) out.hospital = str(body.hospital, 128);
  if (body.department !== undefined) out.department = str(body.department, 64);
  if (body.weight_kg !== undefined) out.weight_kg = num(body.weight_kg, { min: 20, max: 200 });
  if (body.systolic !== undefined) out.systolic = num(body.systolic, { min: 40, max: 260 });
  if (body.diastolic !== undefined) out.diastolic = num(body.diastolic, { min: 20, max: 200 });
  if (body.fundal_height_cm !== undefined) out.fundal_height_cm = num(body.fundal_height_cm, { min: 5, max: 60 });
  if (body.abdominal_cm !== undefined) out.abdominal_cm = num(body.abdominal_cm, { min: 40, max: 160 });
  if (body.fetal_heart_rate !== undefined) out.fetal_heart_rate = num(body.fetal_heart_rate, { min: 50, max: 260 });
  if (body.items !== undefined) out.items = str(body.items, 255);
  if (body.summary !== undefined) out.summary = str(body.summary, 4000);
  if (body.next_visit_date !== undefined) out.next_visit_date = date(body.next_visit_date);
  if (out.visit_date && dueDate) out.gest_days = D.gestDays(dueDate, out.visit_date);
  return out;
}

router.get('/babies/:id/prenatal', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const baby = id && await one('SELECT id, due_date, birth_date FROM babies WHERE id = ?', [id]);
  if (!baby) return fail(res, 404, '宝宝不存在');
  const rows = await q(
    'SELECT * FROM prenatal_visits WHERE baby_id = ? ORDER BY visit_date DESC, id DESC', [id],
  );
  const nextVisit = await one(
    `SELECT next_visit_date FROM prenatal_visits
      WHERE baby_id = ? AND next_visit_date >= ? ORDER BY next_visit_date ASC LIMIT 1`,
    [id, D.todayStr()],
  );
  res.json({
    visits: rows.map((r) => serialize(r, baby.due_date)),
    dueDate: baby.due_date,
    nextVisitDate: nextVisit ? nextVisit.next_visit_date : null,
    today: D.todayStr(),
  });
}));

router.post('/babies/:id/prenatal', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const baby = id && await one('SELECT id, due_date FROM babies WHERE id = ?', [id]);
  if (!baby) return fail(res, 404, '宝宝不存在');
  const data = readBody(req.body, baby.due_date);
  if (!data.visit_date) return fail(res, 400, '请选择产检日期');
  const cols = Object.keys(data);
  const result = await q(
    `INSERT INTO prenatal_visits (baby_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`,
    [id, ...cols.map((c) => data[c])],
  );
  const row = await one('SELECT * FROM prenatal_visits WHERE id = ?', [result.insertId]);
  res.status(201).json({ visit: serialize(row, baby.due_date) });
}));

router.patch('/prenatal/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const row = id && await one('SELECT * FROM prenatal_visits WHERE id = ?', [id]);
  if (!row) return fail(res, 404, '记录不存在');
  const baby = await one('SELECT due_date FROM babies WHERE id = ?', [row.baby_id]);
  const data = readBody(req.body, baby ? baby.due_date : null);
  if (!Object.keys(data).length) return fail(res, 400, '没有需要更新的内容');
  const cols = Object.keys(data);
  await q(
    `UPDATE prenatal_visits SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...cols.map((c) => data[c]), id],
  );
  const updated = await one('SELECT * FROM prenatal_visits WHERE id = ?', [id]);
  res.json({ visit: serialize(updated, baby ? baby.due_date : null) });
}));

router.delete('/prenatal/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  if (!id) return fail(res, 400, '参数错误');
  await q('DELETE FROM prenatal_visits WHERE id = ?', [id]);
  res.json({ ok: true });
}));

module.exports = router;
