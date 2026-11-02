'use strict';
/**
 * 日期工具：所有「今天」都按 Asia/Shanghai 计算，日期以 YYYY-MM-DD 字符串在应用内流转，
 * 避免容器时区（常见为 UTC）导致记录偏移一天。
 */

const TZ = 'Asia/Shanghai';
const DAY = 86400000;

function todayStr() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseDate(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

function toUTC(s) {
  const { y, m, d } = parseDate(s);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ts) {
  const dt = new Date(ts);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function diffDays(a, b) {
  return Math.round((toUTC(a) - toUTC(b)) / DAY);
}

function addDays(s, n) {
  return fromUTC(toUTC(s) + n * DAY);
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addMonths(s, n) {
  const { y, m, d } = parseDate(s);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, daysInMonth(ny, nm))).padStart(2, '0')}`;
}

/** 按自然日历计算年龄，返回 { years, months, days, totalDays } */
function ageParts(birth, ref = todayStr()) {
  const b = parseDate(birth);
  const r = parseDate(ref);
  let years = r.y - b.y;
  let months = r.m - b.m;
  let days = r.d - b.d;
  if (days < 0) {
    months -= 1;
    const pm = r.m - 1 === 0 ? 12 : r.m - 1;
    const py = r.m - 1 === 0 ? r.y - 1 : r.y;
    days += daysInMonth(py, pm);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days, totalDays: diffDays(ref, birth) };
}

function formatAge(birth, ref = todayStr()) {
  const { years, months, days, totalDays } = ageParts(birth, ref);
  if (totalDays < 0) return `还有 ${Math.abs(totalDays)} 天出生`;
  if (totalDays === 0) return '今天出生';
  const parts = [];
  if (years) parts.push(`${years} 岁`);
  if (months) parts.push(`${months} 个月`);
  if (days || parts.length === 0) parts.push(`${days} 天`);
  return parts.join(' ');
}

/** 由预产期推算某天的孕龄（天）。足月按 280 天计 */
function gestDays(dueDate, date) {
  if (!dueDate || !isDate(dueDate)) return null;
  return 280 - diffDays(date, dueDate);
}

function gestLabel(days) {
  if (days == null) return '';
  const w = Math.floor(days / 7);
  const d = days % 7;
  return `${w} 周${d ? ` + ${d} 天` : ''}`;
}

const CN_MONTH = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

function formatCN(s) {
  if (!s) return '';
  const { y, m, d } = parseDate(s);
  return `${y} 年 ${m} 月 ${d} 日`;
}

function weekdayCN(s) {
  const names = ['日', '一', '二', '三', '四', '五', '六'];
  return `周${names[new Date(toUTC(s)).getUTCDay()]}`;
}

/** 距离目标日期的人话描述 */
function relativeLabel(date, ref = todayStr()) {
  const n = diffDays(date, ref);
  if (n === 0) return '今天';
  if (n === 1) return '明天';
  if (n === -1) return '昨天';
  if (n > 0) return `${n} 天后`;
  return `已过 ${Math.abs(n)} 天`;
}

module.exports = {
  TZ, todayStr, isDate, parseDate, diffDays, addDays, addMonths,
  ageParts, formatAge, gestDays, gestLabel, formatCN, weekdayCN, relativeLabel,
  daysInMonth, CN_MONTH,
};
