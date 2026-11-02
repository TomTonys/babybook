import { api } from '../api.js';
import { icon, chip, emptyState } from '../ui.js';
import { esc, fmtDate, fmtNum, relativeLabel, todayStr, gestLabel } from '../util.js';

function hero(baby) {
  const meta = [];
  if (baby.isBorn) {
    meta.push(chip(`出生 ${fmtDate(baby.birth_date, { year: false })}`, 'brand'));
    if (baby.birth_weight_g) meta.push(chip(`出生 ${fmtNum(baby.birth_weight_g / 1000, 2)} kg`));
    if (baby.birth_length_cm) meta.push(chip(`身长 ${fmtNum(baby.birth_length_cm)} cm`));
    if (baby.delivery_method) meta.push(chip(baby.delivery_method));
    if (baby.birth_hospital) meta.push(chip(baby.birth_hospital));
  } else {
    meta.push(chip(`预产期 ${fmtDate(baby.due_date, { year: false })}`, 'accent'));
    if (baby.due_date) meta.push(chip(`距预产期 ${Math.max(0, baby.daysToDue)} 天`));
  }
  return `<div class="hero">
    ${baby.avatar
      ? `<div class="avatar"><img src="${esc(baby.avatar)}" alt="" /></div>`
      : `<div class="avatar">${esc((baby.nickname || baby.name || '宝').slice(0, 1))}</div>`}
    <div class="hero__main">
      <div class="hero__name">
        <h2>${esc(baby.nickname || baby.name)}</h2>
        <span>${esc(baby.name)}${baby.nickname ? '' : ''} · ${baby.gender === 'male' ? '男宝宝' : baby.gender === 'female' ? '女宝宝' : '宝宝'}</span>
      </div>
      <div class="hero__age">
        ${baby.isBorn ? `${esc(baby.ageText)} · 出生第 ${baby.daysOld + 1} 天` : `孕 ${esc(baby.gestLabel || '—')}`}
      </div>
      <div class="hero__meta">${meta.join('')}</div>
    </div>
    <div class="hero__side">
      <a class="btn btn--soft btn--sm" href="#/growth">${icon('plus', 'icon-sm')} 记录测量</a>
      <a class="btn btn--ghost btn--sm" href="#/settings">${icon('pen', 'icon-sm')} 编辑档案</a>
    </div>
  </div>`;
}

function pregnancyCard(baby) {
  if (baby.isBorn) return '';
  const days = baby.gestDays ?? 0;
  const pct = Math.max(0, Math.min(100, Math.round((days / 280) * 100)));
  const toDue = baby.daysToDue ?? 0;
  const r = 44;
  const c = 2 * Math.PI * r;
  return `<div class="card">
    <div class="preg">
      <svg class="preg__ring" viewBox="0 0 104 104">
        <circle cx="52" cy="52" r="${r}" fill="none" stroke="#efe7da" stroke-width="8" />
        <circle cx="52" cy="52" r="${r}" fill="none" stroke="#2f6b5b" stroke-width="8"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c - (c * pct) / 100}"
          transform="rotate(-90 52 52)" />
        <text x="52" y="50" text-anchor="middle" fill="#241f1a" style="font-size:18px;font-family:var(--serif)">${pct}%</text>
        <text x="52" y="66" text-anchor="middle" fill="#8b8177" style="font-size:10px">孕期</text>
      </svg>
      <div class="preg__info">
        <h3>孕 ${esc(baby.gestLabel || '—')}</h3>
        <p>${toDue > 0 ? `距离预产期还有 ${toDue} 天` : toDue === 0 ? '今天是预产期' : `已过预产期 ${Math.abs(toDue)} 天，注意胎动与产检`}</p>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn btn--sm" href="#/prenatal">${icon('plus', 'icon-sm')} 记录产检</a>
          <a class="btn btn--ghost btn--sm" href="#/settings">${icon('pen', 'icon-sm')} 填写出生信息</a>
        </div>
      </div>
    </div>
  </div>`;
}

function stats(data) {
  const v = data.vaccine;
  const pct = v.total ? Math.round((v.done / v.total) * 100) : 0;
  const nextPrenatal = data.prenatal.nextVisitDate;
  const growth = data.lastGrowth;
  return `<div class="stats">
    <div class="stat ${v.overdue ? 'stat--warn' : 'stat--ok'}">
      <div class="stat__label">${icon('syringe', 'icon-sm')} 疫苗接种</div>
      <div class="stat__value">${v.done}<small>/ ${v.total} 剂</small></div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="stat__sub">${v.overdue ? `逾期 ${v.overdue} 剂 · 该补种了` : v.due ? `近期 ${v.due} 剂待接种` : '按计划进行中'}</div>
    </div>
    <div class="stat ${v.overdue ? 'stat--warn' : ''}">
      <div class="stat__label">${icon('alert', 'icon-sm')} 逾期未种</div>
      <div class="stat__value">${v.overdue}<small>剂</small></div>
      <div class="stat__sub">${v.overdue ? '建议尽快联系接种门诊' : '没有逾期，很棒'}</div>
    </div>
    <div class="stat">
      <div class="stat__label">${icon('heart', 'icon-sm')} ${data.baby.isBorn ? '产检记录' : '下次产检'}</div>
      <div class="stat__value" style="font-size:${nextPrenatal && !data.baby.isBorn ? '20px' : '26px'}">${nextPrenatal && !data.baby.isBorn ? esc(fmtDate(nextPrenatal, { year: false })) : `${data.prenatal.count}<small>次</small>`}</div>
      <div class="stat__sub">${nextPrenatal && !data.baby.isBorn ? `还有 ${Math.max(0, (new Date(nextPrenatal) - new Date(todayStr())) / 86400000)} 天` : data.baby.isBorn ? '孕期记录已归档' : '还没有预约下次'}</div>
    </div>
    <div class="stat">
      <div class="stat__label">${icon('ruler', 'icon-sm')} 最近测量</div>
      <div class="stat__value">${growth && growth.weight_kg ? fmtNum(growth.weight_kg, 2) : '—'}<small>kg</small></div>
      <div class="stat__sub">${growth ? `${esc(fmtDate(growth.measured_on, { year: false }))}${growth.height_cm ? ` · ${fmtNum(growth.height_cm)} cm` : ''}` : '还没有测量记录'}</div>
    </div>
  </div>`;
}

function todoList(data) {
  const items = [];
  for (const v of data.nextVaccines) {
    if (v.state === 'overdue') {
      items.push({
        sort: v.planned_date,
        href: '#/vaccines',
        icon: 'syringe', tone: 'danger',
        title: `补种 ${v.name} 第 ${v.dose_no} 剂`,
        sub: `原计划 ${fmtDate(v.planned_date, { year: false })} · 已逾期 ${v.overdueDays} 天`,
        chip: chip('逾期', 'danger'),
      });
    } else if (v.state === 'due') {
      items.push({
        sort: v.planned_date,
        href: '#/vaccines',
        icon: 'syringe', tone: 'amber',
        title: `接种 ${v.name} 第 ${v.dose_no} 剂`,
        sub: `计划 ${fmtDate(v.planned_date, { year: false })} · ${relativeLabel(v.planned_date)}`,
        chip: chip('该接种了', 'amber'),
      });
    } else {
      items.push({
        sort: v.planned_date,
        href: '#/vaccines',
        icon: 'syringe', tone: '',
        title: `${v.name} 第 ${v.dose_no} 剂`,
        sub: `${fmtDate(v.planned_date, { year: false })} · ${relativeLabel(v.planned_date)}`,
        chip: chip('待接种'),
      });
    }
  }
  for (const e of data.upcomingEvents) {
    items.push({
      sort: e.event_date,
      href: '#/vaccines',
      icon: e.kind === 'checkup' ? 'calendar' : 'book',
      tone: 'accent',
      title: e.title,
      sub: `${fmtDate(e.event_date, { year: false })} · ${relativeLabel(e.event_date)}${e.notes ? ` · ${e.notes}` : ''}`,
      chip: chip('待办', 'accent'),
    });
  }
  if (data.prenatal.nextVisitDate && !data.baby.isBorn) {
    items.push({
      sort: data.prenatal.nextVisitDate,
      href: '#/prenatal',
      icon: 'heart', tone: 'accent',
      title: '下次产检',
      sub: `${fmtDate(data.prenatal.nextVisitDate, { year: false })} · ${relativeLabel(data.prenatal.nextVisitDate)}`,
      chip: chip('产检', 'accent'),
    });
  }
  items.sort((a, b) => (a.sort < b.sort ? -1 : 1));

  if (!items.length) {
    return emptyState({
      iconName: 'check',
      title: '近期没有待办',
      desc: '疫苗、产检和自定义提醒都会出现在这里。',
      action: '<a class="btn btn--soft btn--sm" href="#/vaccines">去看看疫苗表</a>',
    });
  }
  return `<div class="rows">${items.slice(0, 5).map((it) => `
    <a class="row" href="${it.href}">
      <div class="row__icon ${it.tone ? `row__icon--${it.tone}` : ''}">${icon(it.icon)}</div>
      <div class="row__main">
        <div class="row__title">${esc(it.title)}</div>
        <div class="row__sub">${esc(it.sub)}</div>
      </div>
      <div class="row__side">${it.chip}</div>
    </a>`).join('')}</div>`;
}

function recentList(data) {
  if (!data.recent.length) {
    return emptyState({ iconName: 'book', title: '还没有记录', desc: '接种、产检、测量都会按时间汇总在这里。' });
  }
  const icons = { vaccine: 'syringe', prenatal: 'heart', growth: 'ruler' };
  const tones = { vaccine: '', prenatal: 'accent', growth: 'amber' };
  return `<div class="rows">${data.recent.map((r) => `
    <div class="row">
      <div class="row__icon row__icon--${tones[r.kind]}">${icon(icons[r.kind])}</div>
      <div class="row__main">
        <div class="row__title">${esc(r.title)}</div>
        <div class="row__sub">${esc(fmtDate(r.date))}</div>
      </div>
      <div class="row__side">${esc(relativeLabel(r.date))}</div>
    </div>`).join('')}</div>`;
}

export async function renderOverview(ctx) {
  const { baby } = ctx;
  const data = await api.get(`/babies/${baby.id}/overview`);
  const el = document.createElement('div');
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(`${data.today}T00:00:00Z`).getUTCDay()];
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${baby.isBorn ? '今天' : '孕期'}</h1>
        <p>${fmtDate(data.today)} · 周${weekday}</p>
      </div>
      <div class="page-head__actions">
        <a class="btn btn--ghost btn--sm" href="#/prenatal">${icon('heart', 'icon-sm')} ${baby.isBorn ? '产检档案' : '记产检'}</a>
        <a class="btn btn--sm" href="#/vaccines">${icon('syringe', 'icon-sm')} 疫苗表</a>
      </div>
    </div>
    ${hero(data.baby)}
    ${pregnancyCard(data.baby)}
    ${stats(data)}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;margin-top:18px">
      <div class="card">
        <div class="card__head">
          <div class="card__title">${icon('calendar')} 近期要做</div>
          <a class="card__hint" href="#/vaccines">全部</a>
        </div>
        ${todoList(data)}
      </div>
      <div class="card">
        <div class="card__head">
          <div class="card__title">${icon('clock')} 最近记录</div>
        </div>
        ${recentList(data)}
      </div>
    </div>`;
  return el;
}
