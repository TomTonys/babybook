export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function todayStr() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function toUTC(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function diffDays(a, b) {
  return Math.round((toUTC(a) - toUTC(b)) / 86400000);
}

export function addDays(s, n) {
  const dt = new Date(toUTC(s) + n * 86400000);
  return dt.toISOString().slice(0, 10);
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function ageParts(birth, ref = todayStr()) {
  const b = birth.split('-').map(Number);
  const r = ref.split('-').map(Number);
  let years = r[0] - b[0];
  let months = r[1] - b[1];
  let days = r[2] - b[2];
  if (days < 0) {
    months -= 1;
    const pm = r[1] - 1 === 0 ? 12 : r[1] - 1;
    const py = r[1] - 1 === 0 ? r[0] - 1 : r[0];
    days += daysInMonth(py, pm);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days, totalDays: diffDays(ref, birth) };
}

export function formatAge(birth, ref = todayStr()) {
  if (!birth) return '';
  const { years, months, days, totalDays } = ageParts(birth, ref);
  if (totalDays < 0) return `还有 ${Math.abs(totalDays)} 天出生`;
  if (totalDays === 0) return '今天出生';
  const parts = [];
  if (years) parts.push(`${years} 岁`);
  if (months) parts.push(`${months} 个月`);
  if (days || parts.length === 0) parts.push(`${days} 天`);
  return parts.join(' ');
}

export function gestLabel(days) {
  if (days == null) return '';
  const w = Math.floor(days / 7);
  const d = days % 7;
  return `${w} 周${d ? ` + ${d} 天` : ''}`;
}

export function fmtDate(s, { year = true } = {}) {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-');
  return year ? `${y} 年 ${Number(m)} 月 ${Number(d)} 日` : `${Number(m)} 月 ${Number(d)} 日`;
}

export function fmtDateShort(s) {
  if (!s) return '';
  const [, m, d] = s.slice(0, 10).split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function relativeLabel(date, ref = todayStr()) {
  if (!date) return '';
  const n = diffDays(date, ref);
  if (n === 0) return '今天';
  if (n === 1) return '明天';
  if (n === -1) return '昨天';
  if (n > 0) return `${n} 天后`;
  return `已过 ${Math.abs(n)} 天`;
}

export function fmtNum(value, digits = 1) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function fmtDateInput(s) {
  return s ? String(s).slice(0, 10) : '';
}

export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
