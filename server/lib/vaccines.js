'use strict';
const { q } = require('../db');
const { addMonths, diffDays, todayStr } = require('./dates');

/** 按出生日期生成免疫规划（或自费）接种计划，已存在的剂次不会重复插入 */
async function generateSchedule(babyId, birthDate, category = 'nepi') {
  const defs = await q(
    'SELECT code, name, dose_no, category, age_months FROM vaccine_defs WHERE category = ? ORDER BY sort_order',
    [category],
  );
  if (!defs.length) return 0;
  const rows = defs.map((d) => [
    babyId, d.code, d.name, d.dose_no, d.category, addMonths(birthDate, d.age_months),
  ]);
  const result = await q(
    `INSERT IGNORE INTO vaccinations (baby_id, def_code, name, dose_no, category, planned_date)
     VALUES ?`,
    [rows],
  );
  return result.affectedRows || 0;
}

/** 出生日期修改后，重算尚未接种剂次的计划日期 */
async function reschedule(babyId, birthDate) {
  await q(
    `UPDATE vaccinations v
       JOIN vaccine_defs d ON d.code = v.def_code AND d.dose_no = v.dose_no
        SET v.planned_date = DATE_ADD(?, INTERVAL d.age_months MONTH)
      WHERE v.baby_id = ? AND v.status = 'pending' AND v.def_code IS NOT NULL`,
    [birthDate, babyId],
  );
}

const DUE_SOON_DAYS = 14;

/** 把数据库行翻译成前端直接可用的状态 */
function decorate(row, today = todayStr()) {
  const out = { ...row };
  const planned = row.planned_date;
  let state = row.status;
  let gap = null;
  if (planned) gap = diffDays(planned, today);
  if (row.status === 'pending' && planned) {
    if (gap < 0) state = 'overdue';
    else if (gap <= DUE_SOON_DAYS) state = 'due';
    else state = 'upcoming';
  }
  out.state = state;
  out.gapDays = gap; // 正数=还有几天，负数=已逾期几天
  out.overdueDays = state === 'overdue' ? -gap : 0;
  return out;
}

module.exports = { generateSchedule, reschedule, decorate, DUE_SOON_DAYS };
