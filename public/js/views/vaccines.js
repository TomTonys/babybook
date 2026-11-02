import { api } from '../api.js';
import { icon, chip, emptyState, openModal, toast, confirmDialog, field, formValues } from '../ui.js';
import { esc, fmtDate, fmtDateInput, relativeLabel, todayStr } from '../util.js';

const state = { tab: 'nepi', filter: 'all' };

const STATE_CHIP = {
  done: () => chip('已接种', 'brand'),
  overdue: (v) => chip(`逾期 ${v.overdueDays} 天`, 'danger'),
  due: (v) => chip(`还有 ${v.gapDays} 天`, 'amber'),
  upcoming: (v) => chip(`还有 ${v.gapDays} 天`),
  skipped: () => chip('已跳过'),
};

function summaryCard(list) {
  const total = list.length;
  const done = list.filter((v) => v.status === 'done').length;
  const overdue = list.filter((v) => v.state === 'overdue').length;
  const due = list.filter((v) => v.state === 'due').length;
  const pending = list.filter((v) => v.status === 'pending').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="card" style="padding:20px 22px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap">
      <div>
        <div style="font-size:13px;color:var(--muted)">免疫规划接种进度</div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-top:2px">
          <span style="font-family:var(--serif);font-size:30px">${done}</span>
          <span style="color:var(--muted);font-size:14px">/ ${total} 剂已完成</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${overdue ? chip(`${overdue} 剂逾期`, 'danger') : ''}
        ${due ? chip(`${due} 剂近期`, 'amber') : ''}
        ${chip(`${pending} 剂待接种`)}
      </div>
    </div>
    <div class="progress" style="margin-top:14px;height:8px"><i style="width:${pct}%"></i></div>
  </div>`;
}

function groupByAge(list) {
  const groups = new Map();
  for (const v of list) {
    const key = v.age_label || '其他';
    if (!groups.has(key)) groups.set(key, { label: key, age: v.age_months ?? 999, items: [] });
    groups.get(key).items.push(v);
  }
  return [...groups.values()].sort((a, b) => a.age - b.age);
}

function itemHtml(v) {
  const meta = [];
  if (v.status === 'done') {
    meta.push(`接种 ${fmtDate(v.done_date, { year: false })}`);
    if (v.clinic) meta.push(v.clinic);
    if (v.manufacturer) meta.push(v.manufacturer);
    if (v.batch_no) meta.push(`批号 ${v.batch_no}`);
  } else {
    if (v.planned_date) meta.push(`计划 ${fmtDate(v.planned_date, { year: false })}`);
    if (v.age_label) meta.push(v.age_label);
    if (v.def_notes) meta.push(v.def_notes);
  }
  return `<div class="vacc-item ${v.status === 'done' ? 'vacc-item--done' : ''} ${v.state === 'overdue' ? 'vacc-item--overdue' : ''}" data-id="${v.id}">
    <div class="vacc-check">${icon('check', 'icon-sm')}</div>
    <div class="vacc-item__main">
      <div class="vacc-item__name">${esc(v.name)} <span class="vacc-item__dose">第 ${v.dose_no} 剂</span>
        ${v.category === 'self' ? chip('自费', 'ghost') : ''}${v.category === 'other' ? chip('自定义', 'ghost') : ''}
      </div>
      <div class="vacc-item__meta">${esc(meta.join(' · '))}</div>
    </div>
    <div class="vacc-item__side">${(STATE_CHIP[v.state] || (() => ''))(v)}</div>
  </div>`;
}

function openVaccine(v, ctx) {
  const isDone = v.status === 'done';
  const body = `
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
      <div style="font-weight:600;font-size:16px">${esc(v.name)} · 第 ${v.dose_no} 剂</div>
      ${(STATE_CHIP[v.state] || (() => ''))(v)}
    </div>
    ${v.def_notes ? `<div style="font-size:12.5px;color:var(--muted);margin-bottom:14px;padding:10px 12px;background:#f7f1e7;border-radius:10px">${esc(v.def_notes)}</div>` : ''}
    <div class="form-grid">
      ${field({ label: '接种日期', name: 'done_date', type: 'date', value: fmtDateInput(v.done_date || v.planned_date || todayStr()), wide: true })}
      ${field({ label: '疫苗厂家', name: 'manufacturer', value: v.manufacturer || '', placeholder: '如 深圳康泰' })}
      ${field({ label: '批号', name: 'batch_no', value: v.batch_no || '', placeholder: '接种证上的批号' })}
      ${field({ label: '接种门诊', name: 'clinic', value: v.clinic || '', placeholder: '如 城东社区卫生服务中心', wide: true })}
      ${field({ label: '反应 / 备注', name: 'reaction', value: v.reaction || '', placeholder: '发热、红肿等，可留空', wide: true })}
    </div>`;

  const extra = [];
  if (v.status === 'done') {
    extra.push({
      label: '撤销接种',
      variant: 'btn--ghost',
      action: async () => {
        if (!(await confirmDialog('撤销后这一剂会回到「待接种」，确定吗？'))) return;
        await api.patch(`/vaccinations/${v.id}`, { status: 'pending' });
        toast('已撤销接种记录');
        ctx.reload();
      },
    });
  } else {
    extra.push({
      label: '跳过此剂',
      variant: 'btn--ghost',
      action: async () => {
        if (!(await confirmDialog('标记为跳过（如医生建议推迟或已用其他疫苗替代），之后可在「已跳过」里恢复。'))) return;
        await api.patch(`/vaccinations/${v.id}`, { status: 'skipped' });
        toast('已标记跳过');
        ctx.reload();
      },
    });
  }
  if (v.category === 'other') {
    extra.push({
      label: '删除',
      variant: 'btn--danger',
      action: async () => {
        if (!(await confirmDialog('删除这条接种记录？', { confirmText: '删除' }))) return;
        await api.del(`/vaccinations/${v.id}`);
        toast('已删除');
        ctx.reload();
      },
    });
  }

  openModal({
    title: isDone ? '接种记录' : '记录接种',
    subtitle: v.planned_date ? `计划日期 ${fmtDate(v.planned_date)}` : '',
    body,
    confirmText: '标记为已接种',
    extra,
    onSubmit: async (fd) => {
      const data = formValues(fd);
      if (!data.done_date) throw new Error('请选择接种日期');
      await api.patch(`/vaccinations/${v.id}`, {
        status: 'done',
        done_date: data.done_date,
        manufacturer: data.manufacturer,
        batch_no: data.batch_no,
        clinic: data.clinic,
        reaction: data.reaction,
      });
      toast('已记录接种', 'ok');
      ctx.reload();
    },
  });
}

function openAddCustom(ctx) {
  openModal({
    title: '添加疫苗记录',
    subtitle: '用于自费疫苗、流感疫苗等不在标准程序里的接种',
    body: `<div class="form-grid">
      ${field({ label: '疫苗名称', name: 'name', required: true, wide: true, placeholder: '如 流感疫苗（四价）' })}
      ${field({ label: '第几剂', name: 'dose_no', type: 'number', value: 1, min: 1, max: 20 })}
      ${field({ label: '计划日期', name: 'planned_date', type: 'date', value: todayStr() })}
      ${field({ label: '备注', name: 'notes', wide: true, placeholder: '可选' })}
    </div>`,
    onSubmit: async (fd) => {
      const data = formValues(fd);
      if (!data.name) throw new Error('请填写疫苗名称');
      await api.post(`/babies/${ctx.baby.id}/vaccinations`, {
        name: data.name, dose_no: data.dose_no, planned_date: data.planned_date, notes: data.notes,
      });
      toast('已添加', 'ok');
      ctx.reload();
    },
  });
}

async function enableSelf(ctx) {
  const { created } = await api.post(`/babies/${ctx.baby.id}/vaccinations/generate`, { category: 'self' });
  toast(created ? `已生成 ${created} 剂自费疫苗计划` : '自费疫苗计划已存在', 'ok');
  ctx.reload();
}

export async function renderVaccines(ctx) {
  const { baby } = ctx;
  if (!baby.birth_date) {
    const el = document.createElement('div');
    el.innerHTML = `<div class="page-head"><div><h1>疫苗</h1><p>按出生日期自动排期</p></div></div>
      <div class="card">${emptyState({
        iconName: 'syringe',
        title: '还没有出生日期',
        desc: '填写出生日期后，会自动按国家免疫规划生成 11 种 22 剂的接种计划。',
        action: '<a class="btn btn--soft" href="#/settings">去填写出生信息</a>',
      })}</div>`;
    return el;
  }

  const { vaccinations } = await api.get(`/babies/${baby.id}/vaccinations?category=all`);
  const all = vaccinations;
  const nepi = all.filter((v) => v.category === 'nepi');
  const self = all.filter((v) => v.category === 'self');
  const others = all.filter((v) => v.category === 'other');

  const source = state.tab === 'nepi' ? nepi : state.tab === 'self' ? self : others;
  let list = source;
  if (state.filter === 'pending') list = list.filter((v) => v.status === 'pending');
  if (state.filter === 'done') list = list.filter((v) => v.status === 'done');
  if (state.filter === 'overdue') list = list.filter((v) => v.state === 'overdue');
  if (state.filter === 'skipped') list = list.filter((v) => v.status === 'skipped');

  const groups = groupByAge(list);
  const counts = {
    nepi: nepi.length, self: self.length, other: others.length,
    pending: source.filter((v) => v.status === 'pending').length,
    done: source.filter((v) => v.status === 'done').length,
    overdue: source.filter((v) => v.state === 'overdue').length,
  };

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div><h1>疫苗</h1><p>国家免疫规划 11 种 22 剂，按出生日期自动排期</p></div>
      <div class="page-head__actions">
        <button class="btn btn--ghost btn--sm" id="add-vacc">${icon('plus', 'icon-sm')} 自定义</button>
        ${state.tab === 'nepi' ? `<button class="btn btn--soft btn--sm" id="self-btn">${icon('syringe', 'icon-sm')} ${self.length ? '自费疫苗' : '启用自费疫苗'}</button>` : ''}
      </div>
    </div>
    ${summaryCard(nepi)}

    <div class="filter-bar" style="margin-top:18px">
      <div class="seg" id="tab-seg">
        <button data-tab="nepi" class="${state.tab === 'nepi' ? 'active' : ''}">免疫规划 ${nepi.length}</button>
        <button data-tab="self" class="${state.tab === 'self' ? 'active' : ''}">自费 ${self.length}</button>
        <button data-tab="other" class="${state.tab === 'other' ? 'active' : ''}">自定义 ${others.length}</button>
      </div>
      <div class="spacer"></div>
      <div class="seg" id="filter-seg">
        <button data-filter="all" class="${state.filter === 'all' ? 'active' : ''}">全部</button>
        <button data-filter="pending" class="${state.filter === 'pending' ? 'active' : ''}">待接种</button>
        <button data-filter="overdue" class="${state.filter === 'overdue' ? 'active' : ''}">逾期</button>
        <button data-filter="done" class="${state.filter === 'done' ? 'active' : ''}">已接种</button>
        <button data-filter="skipped" class="${state.filter === 'skipped' ? 'active' : ''}">已跳过</button>
      </div>
    </div>

    <div id="vacc-list">
      ${groups.length ? groups.map((g) => `
        <div class="vacc-group">
          <div class="vacc-group__head">${esc(g.label)}</div>
          ${g.items.map(itemHtml).join('')}
        </div>`).join('') : `<div class="card">${emptyState({
          iconName: 'syringe',
          title: state.tab === 'self' && !self.length ? '还没有启用自费疫苗' : '没有符合条件的记录',
          desc: state.tab === 'self' && !self.length ? '13 价肺炎、轮状病毒、水痘、流感等自费疫苗可以一键生成计划。' : '换个筛选条件看看。',
          action: state.tab === 'self' && !self.length ? '<button class="btn btn--soft" id="self-empty-btn">启用自费疫苗</button>' : '',
        })}</div>`}
    </div>`;

  el.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      state.filter = 'all';
      ctx.reload();
    });
  });
  el.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      ctx.reload();
    });
  });
  el.querySelector('#add-vacc').addEventListener('click', () => openAddCustom(ctx));
  const selfBtn = el.querySelector('#self-btn');
  if (selfBtn) {
    selfBtn.addEventListener('click', () => {
      if (self.length) {
        state.tab = 'self';
        state.filter = 'all';
        ctx.reload();
      } else {
        enableSelf(ctx);
      }
    });
  }
  const selfEmpty = el.querySelector('#self-empty-btn');
  if (selfEmpty) selfEmpty.addEventListener('click', () => enableSelf(ctx));

  el.querySelectorAll('.vacc-item').forEach((node) => {
    node.addEventListener('click', () => {
      const record = all.find((v) => v.id === Number(node.dataset.id));
      if (record) openVaccine(record, ctx);
    });
  });

  return el;
}
