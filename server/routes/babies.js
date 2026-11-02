'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { q, one } = require('../db');
const config = require('../config');
const auth = require('../auth');
const { wrap, fail, str, num, date, intId } = require('../lib/http');
const D = require('../lib/dates');
const { generateSchedule, reschedule, decorate } = require('../lib/vaccines');

const router = express.Router();
router.use(auth.requireAuth);

const GENDERS = ['male', 'female', 'unknown'];

function serialize(row) {
  if (!row) return null;
  const today = D.todayStr();
  const baby = {
    ...row,
    apgar_1: row.apgar_1,
    apgar_5: row.apgar_5,
    isBorn: Boolean(row.birth_date),
    ageText: row.birth_date ? D.formatAge(row.birth_date, today) : '',
    daysOld: row.birth_date ? D.diffDays(today, row.birth_date) : null,
    gestDays: !row.birth_date && row.due_date ? D.gestDays(row.due_date, today) : null,
    gestLabel: !row.birth_date && row.due_date ? D.gestLabel(D.gestDays(row.due_date, today)) : '',
    daysToDue: !row.birth_date && row.due_date ? D.diffDays(row.due_date, today) : null,
  };
  return baby;
}

function readBody(body, existing = {}) {
  const out = {};
  if (body.name !== undefined) out.name = str(body.name, 64);
  if (body.nickname !== undefined) out.nickname = str(body.nickname, 64);
  if (body.gender !== undefined) out.gender = GENDERS.includes(body.gender) ? body.gender : 'unknown';
  if (body.due_date !== undefined) out.due_date = date(body.due_date);
  if (body.birth_date !== undefined) out.birth_date = date(body.birth_date);
  if (body.birth_time !== undefined) {
    out.birth_time = /^\d{2}:\d{2}(:\d{2})?$/.test(body.birth_time || '') ? body.birth_time : null;
  }
  if (body.birth_weight_g !== undefined) out.birth_weight_g = num(body.birth_weight_g, { min: 200, max: 9000 });
  if (body.birth_length_cm !== undefined) out.birth_length_cm = num(body.birth_length_cm, { min: 20, max: 80 });
  if (body.birth_head_cm !== undefined) out.birth_head_cm = num(body.birth_head_cm, { min: 20, max: 60 });
  if (body.delivery_method !== undefined) out.delivery_method = str(body.delivery_method, 32);
  if (body.birth_hospital !== undefined) out.birth_hospital = str(body.birth_hospital, 128);
  if (body.apgar_1 !== undefined) out.apgar_1 = num(body.apgar_1, { min: 0, max: 10 });
  if (body.apgar_5 !== undefined) out.apgar_5 = num(body.apgar_5, { min: 0, max: 10 });
  if (body.blood_type !== undefined) out.blood_type = str(body.blood_type, 16);
  if (body.notes !== undefined) out.notes = str(body.notes, 2000);
  for (const k of Object.keys(out)) {
    if (out[k] === null && existing[k] !== undefined && body[k] !== null && k !== 'notes') {
      // 允许显式清空日期/数字字段，其余保持 null
    }
  }
  return out;
}

router.get('/', wrap(async (req, res) => {
  const rows = await q('SELECT * FROM babies WHERE archived = 0 ORDER BY created_at ASC');
  res.json({ babies: rows.map(serialize) });
}));

router.post('/', wrap(async (req, res) => {
  const data = readBody(req.body);
  if (!data.name) return fail(res, 400, '请填写宝宝姓名或小名');
  const cols = Object.keys(data);
  const sql = `INSERT INTO babies (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  const result = await q(sql, cols.map((c) => data[c]));
  const baby = await one('SELECT * FROM babies WHERE id = ?', [result.insertId]);
  if (baby.birth_date) await generateSchedule(baby.id, baby.birth_date, 'nepi');
  res.status(201).json({ baby: serialize(baby) });
}));

router.get('/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const baby = id && await one('SELECT * FROM babies WHERE id = ?', [id]);
  if (!baby) return fail(res, 404, '宝宝不存在');
  res.json({ baby: serialize(baby) });
}));

router.patch('/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const baby = id && await one('SELECT * FROM babies WHERE id = ?', [id]);
  if (!baby) return fail(res, 404, '宝宝不存在');

  const data = readBody(req.body, baby);
  if (data.name !== undefined && !data.name) return fail(res, 400, '姓名不能为空');
  if (data.birth_date && data.due_date && data.birth_date < data.due_date
      && D.diffDays(data.due_date, data.birth_date) > 60) {
    return fail(res, 400, '出生日期与预产期相差过大，请检查');
  }

  const cols = Object.keys(data);
  if (cols.length) {
    await q(
      `UPDATE babies SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...cols.map((c) => data[c]), id],
    );
  }

  const updated = await one('SELECT * FROM babies WHERE id = ?', [id]);
  if (updated.birth_date) {
    await generateSchedule(updated.id, updated.birth_date, 'nepi');
    if (data.birth_date && data.birth_date !== baby.birth_date) {
      await reschedule(updated.id, updated.birth_date);
    }
  }
  res.json({ baby: serialize(updated) });
}));

router.patch('/:id/archive', wrap(async (req, res) => {
  const id = intId(req.params.id);
  if (!id) return fail(res, 400, '参数错误');
  await q('UPDATE babies SET archived = ? WHERE id = ?', [req.body.archived ? 1 : 0, id]);
  res.json({ ok: true });
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = intId(req.params.id);
  if (!id) return fail(res, 400, '参数错误');
  const baby = await one('SELECT avatar FROM babies WHERE id = ?', [id]);
  if (!baby) return fail(res, 404, '宝宝不存在');
  await q('DELETE FROM babies WHERE id = ?', [id]);
  if (baby.avatar) removeUpload(baby.avatar);
  res.json({ ok: true });
}));

function removeUpload(url) {
  const name = path.basename(String(url));
  const file = path.join(config.uploadDir, name);
  if (!file.startsWith(config.uploadDir)) return;
  fs.promises.unlink(file).catch(() => {});
}

router.post('/:id/avatar', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const baby = id && await one('SELECT * FROM babies WHERE id = ?', [id]);
  if (!baby) return fail(res, 404, '宝宝不存在');

  const dataUrl = String(req.body.dataUrl || '');
  const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return fail(res, 400, '仅支持 PNG / JPG / WebP 图片');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) return fail(res, 400, '图片不能超过 3MB');

  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const name = `${id}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.mkdirSync(config.uploadDir, { recursive: true });
  await fs.promises.writeFile(path.join(config.uploadDir, name), buf);
  const url = `/uploads/${name}`;
  await q('UPDATE babies SET avatar = ? WHERE id = ?', [url, id]);
  if (baby.avatar) removeUpload(baby.avatar);
  res.json({ avatar: url });
}));

// ── 概览 ────────────────────────────────────────────────────────────────
router.get('/:id/overview', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const baby = id && await one('SELECT * FROM babies WHERE id = ?', [id]);
  if (!baby) return fail(res, 404, '宝宝不存在');
  const today = D.todayStr();

  const vaccRows = await q(
    `SELECT v.*, d.age_label, d.age_months
       FROM vaccinations v
       LEFT JOIN vaccine_defs d ON d.code = v.def_code AND d.dose_no = v.dose_no
      WHERE v.baby_id = ? AND v.category = 'nepi'`,
    [id],
  );
  const vacc = vaccRows.map((r) => decorate(r, today));
  const pending = vacc.filter((v) => v.status === 'pending');
  const stats = {
    total: vacc.length,
    done: vacc.filter((v) => v.status === 'done').length,
    overdue: pending.filter((v) => v.state === 'overdue').length,
    due: pending.filter((v) => v.state === 'due').length,
    upcoming: pending.filter((v) => v.state === 'upcoming').length,
  };
  const nextVaccines = pending
    .filter((v) => v.planned_date)
    .sort((a, b) => (a.planned_date < b.planned_date ? -1 : 1))
    .slice(0, 3);

  const prenatalCount = await one('SELECT COUNT(*) AS n FROM prenatal_visits WHERE baby_id = ?', [id]);
  const lastPrenatal = await one(
    'SELECT * FROM prenatal_visits WHERE baby_id = ? ORDER BY visit_date DESC, id DESC LIMIT 1', [id],
  );
  const nextPrenatal = await one(
    `SELECT visit_date, next_visit_date FROM prenatal_visits
      WHERE baby_id = ? AND next_visit_date IS NOT NULL AND next_visit_date >= ?
      ORDER BY next_visit_date ASC LIMIT 1`, [id, today],
  );

  const lastGrowth = await one(
    'SELECT * FROM growth_records WHERE baby_id = ? ORDER BY measured_on DESC, id DESC LIMIT 1', [id],
  );

  const upcomingEvents = await q(
    `SELECT * FROM events WHERE baby_id = ? AND done = 0 AND event_date >= ?
      ORDER BY event_date ASC LIMIT 5`, [id, today],
  );

  const recent = [];
  const recentVacc = await q(
    `SELECT id, name, dose_no, done_date FROM vaccinations
      WHERE baby_id = ? AND status = 'done' AND done_date IS NOT NULL
      ORDER BY done_date DESC LIMIT 4`, [id],
  );
  for (const v of recentVacc) recent.push({ kind: 'vaccine', date: v.done_date, title: `接种 ${v.name}（第 ${v.dose_no} 剂）`, id: v.id });
  const recentPrenatal = await q(
    `SELECT id, visit_date, visit_type, hospital FROM prenatal_visits
      WHERE baby_id = ? ORDER BY visit_date DESC LIMIT 3`, [id],
  );
  for (const p of recentPrenatal) recent.push({ kind: 'prenatal', date: p.visit_date, title: `产检 · ${p.visit_type}${p.hospital ? ` @ ${p.hospital}` : ''}`, id: p.id });
  const recentGrowth = await q(
    `SELECT id, measured_on, weight_kg, height_cm FROM growth_records
      WHERE baby_id = ? ORDER BY measured_on DESC LIMIT 3`, [id],
  );
  for (const g of recentGrowth) recent.push({ kind: 'growth', date: g.measured_on, title: '成长测量', id: g.id });
  recent.sort((a, b) => (a.date < b.date ? 1 : -1));

  res.json({
    baby: serialize(baby),
    today,
    vaccine: stats,
    nextVaccines,
    prenatal: {
      count: prenatalCount ? prenatalCount.n : 0,
      last: lastPrenatal,
      nextVisitDate: nextPrenatal ? nextPrenatal.next_visit_date : null,
    },
    lastGrowth,
    upcomingEvents,
    recent: recent.slice(0, 6),
  });
}));

// ── 导出 ────────────────────────────────────────────────────────────────
router.get('/:id/export', wrap(async (req, res) => {
  const id = intId(req.params.id);
  const baby = id && await one('SELECT * FROM babies WHERE id = ?', [id]);
  if (!baby) return fail(res, 404, '宝宝不存在');
  const [prenatal, vaccinations, growth, events] = await Promise.all([
    q('SELECT * FROM prenatal_visits WHERE baby_id = ? ORDER BY visit_date', [id]),
    q('SELECT * FROM vaccinations WHERE baby_id = ? ORDER BY planned_date', [id]),
    q('SELECT * FROM growth_records WHERE baby_id = ? ORDER BY measured_on', [id]),
    q('SELECT * FROM events WHERE baby_id = ? ORDER BY event_date', [id]),
  ]);
  res.setHeader('Content-Disposition', `attachment; filename="babybook-${id}-${D.todayStr()}.json"`);
  res.json({ exportedAt: new Date().toISOString(), baby, prenatal, vaccinations, growth, events });
}));

module.exports = router;
module.exports.serialize = serialize;
