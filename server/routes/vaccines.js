'use strict';
const express = require('express');
const { q, one } = require('../db');
const auth = require('../auth');
const { wrap, fail, str, date, intId } = require('../lib/http');
const D = require('../lib/dates');
const { generateSchedule, decorate } = require('../lib/vaccines');

const router = express.Router();
router.use(auth.requireAuth);

router.get('/babies/:id/vaccinations', wrap(async (req, res) => {
  const id = intId(req.params.id);
  if (!id) return fail(res, 400, '参数错误');
  const category = req.query.category === 'self' ? 'self' : req.query.category === 'all' ? null : 'nepi';
  const params = [id];
  let where = 'v.baby_id = ?';
  if (category) {
    where += ' AND v.category = ?';
    params.push(category);
  }
  const rows = await q(
    `SELECT v.*, d.age_label, d.age_months, d.notes AS def_notes
       FROM vaccinations v
       LEFT JOIN vaccine_defs d ON d.code = v.def_code AND d.dose_no = v.dose_no
      WHERE ${where}
      ORDER BY COALESCE(v.planned_date, '9999-12-31'), COALESCE(d.sort_order, 999), v.id`,
    params,
  );
  const today = D.todayStr();
  res.json({ vaccinations: rows.map((r) => decorate(r, today)), today });
}));

router.post('/babies/:id/vaccinations/generate', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const baby = id && await one('SELECT * FROM babies WHERE id = ?', [id]);
  if (!baby) return fail(res, 404, '宝宝不存在');
  if (!baby.birth_date) return fail(res, 400, '请先填写出生日期');
  const category = req.body.category === 'self' ? 'self' : 'nepi';
  const created = await generateSchedule(id, baby.birth_date, category);
  res.json({ created });
}));

router.post('/babies/:id/vaccinations', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const baby = id && await one('SELECT id FROM babies WHERE id = ?', [id]);
  if (!baby) return fail(res, 404, '宝宝不存在');
  const name = str(req.body.name, 64);
  if (!name) return fail(res, 400, '请填写疫苗名称');
  const doseNo = Math.max(1, Math.min(20, Number(req.body.dose_no) || 1));
  const planned = date(req.body.planned_date) || D.todayStr();
  const result = await q(
    `INSERT INTO vaccinations (baby_id, def_code, name, dose_no, category, planned_date, notes)
     VALUES (?, NULL, ?, ?, 'other', ?, ?)`,
    [id, name, doseNo, planned, str(req.body.notes, 255)],
  );
  const row = await one('SELECT * FROM vaccinations WHERE id = ?', [result.insertId]);
  res.status(201).json({ vaccination: decorate(row) });
}));

router.patch('/vaccinations/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const row = id && await one('SELECT * FROM vaccinations WHERE id = ?', [id]);
  if (!row) return fail(res, 404, '记录不存在');

  const data = {};
  if (req.body.status !== undefined) {
    const status = ['pending', 'done', 'skipped'].includes(req.body.status) ? req.body.status : 'pending';
    data.status = status;
    if (status === 'done') {
      data.done_date = date(req.body.done_date) || row.done_date || D.todayStr();
    } else if (status === 'pending') {
      data.done_date = null;
    }
  } else if (req.body.done_date !== undefined) {
    data.done_date = date(req.body.done_date);
  }
  if (req.body.batch_no !== undefined) data.batch_no = str(req.body.batch_no, 64);
  if (req.body.manufacturer !== undefined) data.manufacturer = str(req.body.manufacturer, 64);
  if (req.body.clinic !== undefined) data.clinic = str(req.body.clinic, 128);
  if (req.body.reaction !== undefined) data.reaction = str(req.body.reaction, 255);
  if (req.body.notes !== undefined) data.notes = str(req.body.notes, 255);
  if (req.body.planned_date !== undefined) data.planned_date = date(req.body.planned_date);

  const cols = Object.keys(data);
  if (!cols.length) return fail(res, 400, '没有需要更新的内容');
  await q(
    `UPDATE vaccinations SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...cols.map((c) => data[c]), id],
  );
  const updated = await one('SELECT * FROM vaccinations WHERE id = ?', [id]);
  res.json({ vaccination: decorate(updated) });
}));

router.delete('/vaccinations/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  if (!id) return fail(res, 400, '参数错误');
  await q('DELETE FROM vaccinations WHERE id = ?', [id]);
  res.json({ ok: true });
}));

module.exports = router;
