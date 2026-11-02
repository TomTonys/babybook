import { api } from '../api.js';
import { icon, chip, emptyState, openModal, toast, confirmDialog, field, formValues } from '../ui.js';
import { esc, fmtDate, fmtNum, fmtDateInput, relativeLabel, todayStr, gestLabel } from '../util.js';

function metricsHtml(v) {
  const items = [];
  if (v.weight_kg != null) items.push(['体重', `${fmtNum(v.weight_kg, 1)} kg`]);
  if (v.systolic != null || v.diastolic != null) items.push(['血压', `${v.systolic ?? '—'}/${v.diastolic ?? '—'}`]);
  if (v.fetal_heart_rate != null) items.push(['胎心', `${v.fetal_heart_rate} 次/分`]);
  if (v.fundal_height_cm != null) items.push(['宫高', `${fmtNum(v.fundal_height_cm)} cm`]);
  if (v.abdominal_cm != null) items.push(['腹围', `${fmtNum(v.abdominal_cm)} cm`]);
  if (!items.length) return '';
  return `<div class="tl-metrics">${items.map(([k, val]) => `<div class="tl-metric"><b>${esc(val)}</b>${esc(k)}</div>`).join('')}</div>`;
}

function itemCard(v, ctx) {
  const canEdit = true;
  const next = v.next_visit_date ? `<div class="tl-card__next">${icon('calendar', 'icon-sm')} 下次产检 ${esc(fmtDate(v.next_visit_date, { year: false }))}（${esc(relativeLabel(v.next_visit_date))}）</div>` : '';
  return `<div class="tl-item" data-id="${v.id}">
    <div class="tl-card" data-card>
      <div class="tl-card__head">
        <span class="tl-card__type">${esc(v.visit_type)}</span>
        <span class="tl-card__date">${esc(fmtDate(v.visit_date))}${v.gestLabel ? ` · 孕 ${esc(v.gestLabel)}` : ''}</span>
        ${(v.hospital || v.department) ? chip(`${esc(v.hospital)}${v.department ? ' ' + esc(v.department) : ''}`, 'ghost') : ''}
      </div>
      ${v.items ? `<div style="margin-top:8px">${esc(v.items).split(',').map((s) => s.trim()).filter(Boolean).map((s) => chip(s)).join('')}</div>` : ''}
      ${metricsHtml(v)}
      ${v.summary ? `<div class="tl-card__body">${esc(v.summary)}</div>` : ''}
      ${next}
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn btn--ghost btn--sm" data-action="edit">${icon('pen', 'icon-sm')} 编辑</button>
        <button class="btn btn--danger btn--sm" data-action="del">${icon('trash', 'icon-sm')} 删除</button>
      </div>
    </div>
  </div>`;
}

function openForm(ctx, visit = null) {
  const v = visit || {};
  const body = `
    <div class="form-grid">
      ${field({ label: '产检日期', name: 'visit_date', type: 'date', required: true, value: fmtDateInput(v.visit_date || todayStr()) })}
      ${field({ label: '类型', name: 'visit_type', type: 'select', value: v.visit_type || '常规产检', options: [
        '常规产检', '早孕建档', 'NT 检查', '唐筛 / 无创 DNA', '大排畸', '糖耐量', '胎心监护', '其他',
      ] })}
      ${field({ label: '医院', name: 'hospital', value: v.hospital || '', placeholder: '如 市妇幼保健院' })}
      ${field({ label: '科室', name: 'department', value: v.department || '', placeholder: '如 产科' })}
      ${field({ label: '体重（kg）', name: 'weight_kg', type: 'number', step: '0.1', value: v.weight_kg ?? '' })}
      ${field({ label: '血压（收缩/舒张）', name: 'bp', value: v.systolic ? `${v.systolic}/${v.diastolic}` : '', placeholder: '120/80', hint: '格式 收缩/舒张' })}
      ${field({ label: '胎心（次/分）', name: 'fetal_heart_rate', type: 'number', value: v.fetal_heart_rate ?? '', min: 50, max: 260 })}
      ${field({ label: '宫高（cm）', name: 'fundal_height_cm', type: 'number', step: '0.5', value: v.fundal_height_cm ?? '' })}
      ${field({ label: '腹围（cm）', name: 'abdominal_cm', type: 'number', step: '0.5', value: v.abdominal_cm ?? '' })}
      ${field({ label: '检查项目', name: 'items', value: v.items || '', placeholder: '逗号分隔，如 B超, 血常规, 尿常规', wide: true })}
      ${field({ label: '结果与建议', name: 'summary', type: 'textarea', value: v.summary || '', placeholder: '医生的结论、注意事项…', wide: true })}
      ${field({ label: '下次产检日期', name: 'next_visit_date', type: 'date', value: fmtDateInput(v.next_visit_date || '') })}
    </div>`;

  openModal({
    title: visit ? '编辑产检记录' : '新增产检记录',
    subtitle: `孕周按预产期自动推算${ctx.baby.due_date ? '' : '（未填预产期）'}`,
    body,
    wide: true,
    onSubmit: async (fd) => {
      const data = formValues(fd);
      let systolic = null, diastolic = null;
      const m = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(data.bp || '');
      if (m) {
        systolic = Number(m[1]);
        diastolic = Number(m[2]);
      }
      const payload = {
        visit_date: data.visit_date,
        visit_type: data.visit_type,
        hospital: data.hospital,
        department: data.department,
        weight_kg: data.weight_kg,
        systolic, diastolic,
        fetal_heart_rate: data.fetal_heart_rate,
        fundal_height_cm: data.fundal_height_cm,
        abdominal_cm: data.abdominal_cm,
        items: data.items,
        summary: data.summary,
        next_visit_date: data.next_visit_date,
      };
      if (visit) await api.patch(`/prenatal/${visit.id}`, payload);
      else await api.post(`/babies/${ctx.baby.id}/prenatal`, payload);
      toast('已保存', 'ok');
      ctx.reload();
    },
  });
}

export async function renderPrenatal(ctx) {
  const { baby } = ctx;
  const data = await api.get(`/babies/${baby.id}/prenatal`);
  const { visits, nextVisitDate } = data;

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>产检</h1>
        <p>${baby.isBorn
          ? `孕期共 ${visits.length} 次产检记录`
          : `预产期 ${baby.due_date ? fmtDate(baby.due_date) : '未填写'}${baby.gestLabel ? ` · 现在 ${gestLabel(baby.gestDays)}` : ''}`}</p>
      </div>
      <div class="page-head__actions">
        <button class="btn btn--sm" id="add-visit">${icon('plus', 'icon-sm')} 记一次产检</button>
      </div>
    </div>

    ${nextVisitDate ? `
      <div class="card" style="border-color:var(--line)">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div class="row__icon row__icon--accent">${icon('calendar')}</div>
          <div style="flex:1;min-width:180px">
            <div style="font-weight:600">${esc(fmtDate(nextVisitDate))} 有产检</div>
            <div style="font-size:12.5px;color:var(--muted);margin-top:2px">${esc(relativeLabel(nextVisitDate))} · 带产检手册</div>
          </div>
          <button class="btn btn--ghost btn--sm" id="clear-next">清除提醒</button>
        </div>
      </div>` : ''}

    ${visits.length ? `
      <div class="card">
        <div class="card__head"><div class="card__title">${icon('heart')} 产检时间线</div></div>
        <div class="timeline">
          ${visits.map((v, i) => itemCard(v, ctx)).join('')}
        </div>
      </div>` : `
      <div class="card">
        ${emptyState({
          iconName: 'heart',
          title: '还没有产检记录',
          desc: '建档、NT、大排畸、糖耐……把每次产检记下来，孕周自动算好。',
          action: '<button class="btn" id="add-visit-empty">记第一次产检</button>',
        })}
      </div>`}`;

  const add = () => openForm(ctx);
  el.querySelector('#add-visit')?.addEventListener('click', add);
  el.querySelector('#add-visit-empty')?.addEventListener('click', add);

  const clearNext = el.querySelector('#clear-next');
  if (clearNext) clearNext.addEventListener('click', async () => {
    const target = visits.find((v) => v.next_visit_date === nextVisitDate);
    if (!target) return;
    if (!(await confirmDialog('清除「下次产检」提醒日期？产检记录本身保留。'))) return;
    await api.patch(`/prenatal/${target.id}`, { next_visit_date: null });
    toast('已清除');
    ctx.reload();
  });

  el.querySelectorAll('.tl-item').forEach((node) => {
    const visit = visits.find((v) => v.id === Number(node.dataset.id));
    node.querySelector('[data-action="edit"]')?.addEventListener('click', () => openForm(ctx, visit));
    node.querySelector('[data-action="del"]')?.addEventListener('click', async () => {
      if (!(await confirmDialog(`删除 ${fmtDate(visit.visit_date)} 的产检记录？`, { confirmText: '删除' }))) return;
      await api.del(`/prenatal/${visit.id}`);
      toast('已删除');
      ctx.reload();
    });
  });

  return el;
}
