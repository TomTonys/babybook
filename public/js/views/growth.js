import { api } from '../api.js';
import { icon, chip, emptyState, openModal, toast, confirmDialog, field, formValues } from '../ui.js';
import { esc, fmtDate, fmtNum, fmtDateInput, todayStr } from '../util.js';

function openMeasureForm(ctx, record = null) {
  const r = record || {};
  const body = `
    <div class="form-grid">
      ${field({ label: '测量日期', name: 'measured_on', type: 'date', required: true, value: fmtDateInput(r.measured_on || todayStr()) })}
      ${field({ label: '体重（kg）', name: 'weight_kg', type: 'number', step: '0.01', value: r.weight_kg ?? '', placeholder: '7.15', min: 0.4, max: 120 })}
      ${field({ label: '身长（cm）', name: 'height_cm', type: 'number', step: '0.1', value: r.height_cm ?? '', placeholder: '66.5', min: 20, max: 200 })}
      ${field({ label: '头围（cm）', name: 'head_cm', type: 'number', step: '0.1', value: r.head_cm ?? '', placeholder: '42.3', min: 20, max: 70 })}
      ${field({ label: '备注', name: 'note', value: r.note || '', wide: true, placeholder: '如 满月体检、儿保…' })}
    </div>`;
  openModal({
    title: record ? '编辑测量' : '记录一次测量',
    subtitle: '身高体重头围至少填一项',
    body,
    onSubmit: async (fd) => {
      const data = formValues(fd);
      if (!data.weight_kg && !data.height_cm && !data.head_cm) {
        throw new Error('至少填写一项测量数据');
      }
      const payload = {
        measured_on: data.measured_on,
        weight_kg: data.weight_kg,
        height_cm: data.height_cm,
        head_cm: data.head_cm,
        note: data.note,
      };
      if (record) await api.patch(`/growth/${record.id}`, payload);
      else await api.post(`/babies/${ctx.baby.id}/growth`, payload);
      toast('已记录', 'ok');
      ctx.reload();
    },
  });
}

function renderChart(records, baby) {
  const has = (key) => records.some((r) => r[key] != null);
  const types = [
    { key: 'weight_kg', label: '体重', unit: 'kg', color: '#2f6b5b' },
    { key: 'height_cm', label: '身长', unit: 'cm', color: '#dd7a5c' },
    { key: 'head_cm', label: '头围', unit: 'cm', color: '#b0761d' },
  ].filter((t) => has(t.key));

  if (!types.length) return '';

  const W = 860, H = 340, P = { t: 24, r: 24, b: 44, l: 48 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;

  const xMin = Math.min(...records.map((r) => r.ageDays ?? 0));
  const xMax = Math.max(...records.map((r) => r.ageDays ?? 0), 30);
  const domain = types.map((t) => {
    const vals = records.filter((r) => r[t.key] != null).map((r) => Number(r[t.key]));
    const min = Math.min(...vals), max = Math.max(...vals);
    const pad = (max - min) * 0.12 || max * 0.1 || 1;
    return [min - pad, max + pad];
  });
  const ymin = Math.min(...domain.map((d) => d[0]));
  const ymax = Math.max(...domain.map((d) => d[1]));

  const X = (days) => P.l + ((days - xMin) / (xMax - xMin || 1)) * iw;
  const Y = (v) => P.t + ih - ((v - ymin) / (ymax - ymin || 1)) * ih;

  const yTicks = 5;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => ymin + ((ymax - ymin) / yTicks) * i);

  let grid = '';
  for (const tv of tickVals) {
    const y = Y(tv);
    grid += `<line class="grid-line" x1="${P.l}" y1="${y}" x2="${W - P.r}" y2="${y}"/>`;
    grid += `<text x="${P.l - 8}" y="${y + 4}" text-anchor="end">${fmtNum(tv, (ymax - ymin) < 10 ? 1 : 0)}</text>`;
  }

  const n = records.length;
  const xStep = Math.max(1, Math.ceil(n / 6));
  let xTicks = '';
  records.forEach((r, i) => {
    if (i % xStep !== 0 && i !== n - 1) return;
    xTicks += `<text x="${X(r.ageDays ?? 0)}" y="${H - 16}" text-anchor="middle">${r.ageText ? esc(r.ageText) : fmtDate(r.measured_on, { year: false })}</text>`;
  });

  let series = '';
  types.forEach((t) => {
    const pts = records.filter((r) => r[t.key] != null).map((r) => ({
      x: X(r.ageDays ?? 0), y: Y(Number(r[t.key])),
      label: `${t.label} ${fmtNum(Number(r[t.key]), 2)}${t.unit === 'kg' ? ' kg' : ' cm'}`,
    }));
    if (pts.length > 1) {
      const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      series += `<path class="line" d="${path}" style="stroke:${t.color}"/>`;
    }
    for (const p of pts) {
      series += `<circle class="dot" r="4" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" style="stroke:${t.color}" data-label="${esc(p.label)}"/>`;
    }
  });

  const legend = types.map((t) => (
    `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2)"><i style="width:14px;height:3px;border-radius:2px;background:${t.color};display:inline-block"></i>${t.label}</span>`
  )).join('');

  return `<div class="chart-wrap">
    <div style="display:flex;gap:16px;margin-bottom:6px;flex-wrap:wrap">${legend}</div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" id="growth-chart" preserveAspectRatio="xMidYMid meet">
      ${grid}
      <line class="axis" x1="${P.l}" y1="${P.t + ih}" x2="${W - P.r}" y2="${P.t + ih}"/>
      ${xTicks}
      ${series}
    </svg>
    <div class="chart-tip" id="chart-tip"></div>
  </div>`;
}

export async function renderGrowth(ctx) {
  const { baby } = ctx;
  const { records } = await api.get(`/babies/${baby.id}/growth`);

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>成长</h1>
        <p>身高体重头围曲线，${records.length ? `共 ${records.length} 次测量` : '开始记录第一次测量'}</p>
      </div>
      <div class="page-head__actions">
        <button class="btn btn--sm" id="add-measure">${icon('plus', 'icon-sm')} 记一次测量</button>
      </div>
    </div>

    <div class="card">
      <div class="card__head">
        <div class="card__title">${icon('chart')} 生长曲线</div>
        ${records.length ? `<div class="card__hint">横轴按日龄，纵轴数值范围自动</div>` : ''}
      </div>
      ${records.length ? renderChart(records, baby) : `<div class="chart-empty">还没有测量记录</div>`}
    </div>

    <div class="card">
      <div class="card__head"><div class="card__title">${icon('ruler')} 测量记录</div></div>
      ${records.length ? `<div class="measure-list">
        ${[...records].reverse().map((r, i) => {
          const prev = records[records.length - 1 - (i + 1)];
          const dw = prev && r.weight_kg != null && prev.weight_kg != null ? Number(r.weight_kg) - Number(prev.weight_kg) : null;
          const dh = prev && r.height_cm != null && prev.height_cm != null ? Number(r.height_cm) - Number(prev.height_cm) : null;
          const vals = [];
          if (r.weight_kg != null) vals.push(`体重 <b>${fmtNum(r.weight_kg, 2)} kg</b>`);
          if (r.height_cm != null) vals.push(`身长 <b>${fmtNum(r.height_cm)} cm</b>`);
          if (r.head_cm != null) vals.push(`头围 <b>${fmtNum(r.head_cm)} cm</b>`);
          const delta = [];
          if (dw != null && dw !== 0) delta.push(`体重 ${dw > 0 ? '+' : ''}${fmtNum(dw, 2)} kg`);
          if (dh != null && dh !== 0) delta.push(`身长 ${dh > 0 ? '+' : ''}${fmtNum(dh, 1)} cm`);
          return `<div class="measure" data-id="${r.id}">
            <div class="measure__date">${esc(fmtDate(r.measured_on))}<br/><span style="font-size:11px">${esc(r.ageText)}</span></div>
            <div class="measure__vals">${vals.join('')}
              ${delta.length ? `<span class="measure__delta">${esc(delta.join(' · '))}（vs 上次）</span>` : ''}
              ${r.note ? `<span style="font-size:12px;color:var(--muted)">· ${esc(r.note)}</span>` : ''}
            </div>
            <div class="measure__actions">
              <button class="icon-btn" data-action="edit" aria-label="编辑" style="width:30px;height:30px">${icon('pen', 'icon-sm')}</button>
              <button class="icon-btn" data-action="del" aria-label="删除" style="width:30px;height:30px">${icon('trash', 'icon-sm')}</button>
            </div>
          </div>`;
        }).join('')}
      </div>` : emptyState({
        iconName: 'ruler',
        title: '还没有测量记录',
        desc: '满月、3 月龄、6 月龄…每次体检的数值记一下，曲线就长出来了。',
        action: '<button class="btn" id="add-measure-empty">记第一次测量</button>',
      })}
    </div>`;

  const add = () => openMeasureForm(ctx);
  el.querySelector('#add-measure')?.addEventListener('click', add);
  el.querySelector('#add-measure-empty')?.addEventListener('click', add);

  el.querySelectorAll('.measure').forEach((node) => {
    const r = records.find((x) => x.id === Number(node.dataset.id));
    node.querySelector('[data-action="edit"]')?.addEventListener('click', () => openMeasureForm(ctx, r));
    node.querySelector('[data-action="del"]')?.addEventListener('click', async () => {
      if (!(await confirmDialog(`删除 ${fmtDate(r.measured_on)} 的测量记录？`, { confirmText: '删除' }))) return;
      await api.del(`/growth/${r.id}`);
      toast('已删除');
      ctx.reload();
    });
  });

  // 曲线 tooltip
  const svg = el.querySelector('#growth-chart');
  if (svg) {
    const tip = el.querySelector('#chart-tip');
    svg.addEventListener('mousemove', (e) => {
      const dot = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.dot');
      const target = e.target.closest?.('.dot') || dot;
      if (target && target.dataset.label) {
        const rect = svg.getBoundingClientRect();
        const scale = rect.width / 860;
        const cx = Number(target.getAttribute('cx')) * scale;
        const cy = Number(target.getAttribute('cy')) * scale;
        tip.style.left = `${cx}px`;
        tip.style.top = `${cy}px`;
        tip.textContent = target.dataset.label;
        tip.style.opacity = '1';
      } else {
        tip.style.opacity = '0';
      }
    });
    svg.addEventListener('mouseleave', () => {
      tip.style.opacity = '0';
    });
  }

  return el;
}
