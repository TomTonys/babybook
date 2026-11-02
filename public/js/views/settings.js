import { api } from '../api.js';
import { icon, chip, emptyState, openModal, toast, confirmDialog, field, formValues } from '../ui.js';
import { esc, fmtDate, fmtNum, fmtDateInput, relativeLabel, todayStr } from '../util.js';

function openBabyForm(ctx, baby = null) {
  const b = baby || {};
  const body = `
    <div class="form-grid">
      ${field({ label: '姓名 / 小名', name: 'name', required: true, value: b.name || '', placeholder: '宝宝的名字' })}
      ${field({ label: '昵称（可留空）', name: 'nickname', value: b.nickname || '' })}
      ${field({ label: '性别', name: 'gender', type: 'select', value: b.gender || 'unknown', options: [
        { value: 'female', label: '女宝宝' }, { value: 'male', label: '男宝宝' }, { value: 'unknown', label: '暂不填写' },
      ] })}
      ${field({ label: '血型', name: 'blood_type', value: b.blood_type || '', placeholder: '如 A、B、O、AB' })}
      ${field({ label: '预产期', name: 'due_date', type: 'date', value: fmtDateInput(b.due_date || '') })}
      ${field({ label: '出生日期', name: 'birth_date', type: 'date', value: fmtDateInput(b.birth_date || '') })}
      ${field({ label: '出生时间', name: 'birth_time', type: 'time', value: b.birth_time || '' })}
      ${field({ label: '分娩方式', name: 'delivery_method', type: 'select', value: b.delivery_method || '', options: [
        '', '顺产', '剖宫产', '其他',
      ].map((o) => (o === '' ? { value: '', label: '未填写' } : o)) })}
      ${field({ label: '出生体重（克）', name: 'birth_weight_g', type: 'number', value: b.birth_weight_g ?? '', min: 200, max: 9000 })}
      ${field({ label: '出生身长（cm）', name: 'birth_length_cm', type: 'number', step: '0.1', value: b.birth_length_cm ?? '' })}
      ${field({ label: '出生头围（cm）', name: 'birth_head_cm', type: 'number', step: '0.1', value: b.birth_head_cm ?? '' })}
      ${field({ label: 'Apgar 评分（1分 / 5分）', name: 'apgar', value: b.apgar_1 ? `${b.apgar_1}/${b.apgar_5 ?? ''}` : '', placeholder: '9/10', hint: '格式 1分钟/5分钟评分' })}
      ${field({ label: '出生医院', name: 'birth_hospital', value: b.birth_hospital || '', wide: true })}
      ${field({ label: '备注', name: 'notes', type: 'textarea', value: b.notes || '', wide: true, placeholder: '想记下的事，可留空' })}
    </div>`;

  openModal({
    title: baby ? `编辑 ${esc(baby.name)}` : '新建宝宝档案',
    subtitle: '修改出生日期后，待接种的疫苗会自动重排',
    body,
    wide: true,
    onSubmit: async (fd) => {
      const data = formValues(fd);
      const payload = {
        name: data.name,
        nickname: data.nickname,
        gender: data.gender,
        blood_type: data.blood_type,
        due_date: data.due_date || null,
        birth_date: data.birth_date || null,
        birth_time: data.birth_time || null,
        delivery_method: data.delivery_method,
        birth_weight_g: data.birth_weight_g,
        birth_length_cm: data.birth_length_cm,
        birth_head_cm: data.birth_head_cm,
        birth_hospital: data.birth_hospital,
        notes: data.notes,
      };
      const m = /^(?:(\d{1,2})\/)?(\d{1,2})?$/.exec(data.apgar || '');
      if (m && m[2]) payload.apgar_1 = Number(m[1] || m[2]);
      if (m && m[1]) payload.apgar_5 = Number(m[1]);

      if (baby) {
        await api.patch(`/babies/${baby.id}`, payload);
        toast('档案已更新', 'ok');
      } else {
        const { baby: created } = await api.post('/babies', payload);
        localStorage.setItem('bb_baby', String(created.id));
        toast('已创建', 'ok');
      }
      ctx.reload();
    },
  });
}

export async function renderSettings(ctx) {
  const { baby, babies, user } = ctx;
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="page-head">
      <div><h1>设置</h1><p>档案、账号与数据</p></div>
    </div>

    <div class="settings-grid">
      <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
        <div class="card">
          <div class="card__head"><div class="card__title">${icon('baby')} 宝宝档案</div></div>
          ${babies.map((b) => `
            <div class="baby-card-line" data-baby-id="${b.id}">
              ${b.avatar ? `<div class="avatar avatar--sm"><img src="${esc(b.avatar)}" alt="" /></div>`
                : `<div class="avatar avatar--sm">${esc((b.nickname || b.name).slice(0, 1))}</div>`}
              <div class="grow">
                <b>${esc(b.nickname || b.name)}</b>
                <span style="font-size:12px;color:var(--muted);margin-left:8px">
                  ${b.isBorn ? `生于 ${esc(fmtDate(b.birth_date))}` : `预产期 ${esc(fmtDate(b.due_date))}`}
                </span>
                <div style="font-size:12px;color:var(--muted);margin-top:2px">
                  ${b.isBorn ? `${esc(b.ageText)}${b.birth_weight_g ? ` · 出生 ${fmtNum(b.birth_weight_g / 1000, 2)} kg` : ''}` : `孕 ${esc(b.gestLabel || '—')}`}
                </div>
              </div>
              ${b.id === baby.id ? chip('当前', 'brand') : ''}
              <button class="btn btn--ghost btn--sm" data-action="edit">${icon('pen', 'icon-sm')}</button>
              <button class="btn btn--ghost btn--sm" data-action="avatar">${icon('camera', 'icon-sm')}</button>
            </div>`).join('')}
          <button class="btn btn--soft btn--block" style="margin-top:14px" id="add-baby">${icon('plus', 'icon-sm')} 添加宝宝</button>
        </div>

        <div class="card">
          <div class="card__head"><div class="card__title">${icon('calendar')} 待办提醒</div><div class="card__hint">儿保体检、复查等</div></div>
          <div id="events-list"></div>
          <button class="btn btn--ghost btn--block" style="margin-top:12px" id="add-event">${icon('plus', 'icon-sm')} 加一条</button>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
        <div class="card">
          <div class="card__head"><div class="card__title">${icon('settings')} 账号</div></div>
          <div style="display:flex;align-items:center;gap:12px">
            <div class="avatar avatar--sm" style="background:#efe7db;color:var(--ink-2)">${esc((user.displayName || user.username).slice(0, 1).toUpperCase())}</div>
            <div><b style="font-weight:500">${esc(user.displayName || user.username)}</b>
            <div style="font-size:12px;color:var(--muted)">账号 ${esc(user.username)}</div></div>
          </div>
          <button class="btn btn--ghost btn--sm" style="margin-top:14px" id="change-pw">${icon('clock', 'icon-sm')} 修改密码</button>
        </div>

        <div class="card">
          <div class="card__head"><div class="card__title">${icon('download')} 数据</div></div>
          <p style="font-size:13px;color:var(--muted);margin-bottom:14px">所有数据都在你自己的 MySQL 里。可随时导出备份，也可删除当前宝宝的全部记录。</p>
          <button class="btn btn--ghost btn--block" style="margin-bottom:10px" id="export-data">${icon('download', 'icon-sm')} 导出当前宝宝（JSON）</button>
          <button class="btn btn--danger btn--block" id="delete-baby">${icon('trash', 'icon-sm')} 删除当前宝宝</button>
        </div>

        <div class="card danger-zone">
          <div class="card__head"><div class="card__title" style="color:var(--danger)">关于</div></div>
          <p style="font-size:12.5px;color:var(--muted);line-height:1.7">
            宝宝簿是本地自托管应用，无账号体系、无第三方服务。<br/>
            疫苗程序基于《国家免疫规划疫苗儿童免疫程序及说明（2021 年版）》，具体接种以社区卫生服务中心的安排为准。
          </p>
        </div>
      </div>
    </div>`;

  // 档案操作
  el.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const b = babies.find((x) => x.id === Number(btn.closest('[data-baby-id]').dataset.babyId));
      openBabyForm(ctx, b);
    });
  });
  el.querySelectorAll('[data-action="avatar"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const b = babies.find((x) => x.id === Number(btn.closest('[data-baby-id]').dataset.babyId));
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp';
      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) {
          toast('图片不能超过 3MB', 'error');
          return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            await api.post(`/babies/${b.id}/avatar`, { dataUrl: reader.result });
            toast('头像已更新', 'ok');
            ctx.reload();
          } catch (err) {
            toast(err.message, 'error');
          }
        };
        reader.readAsDataURL(file);
      });
      input.click();
    });
  });
  el.querySelector('#add-baby').addEventListener('click', () => openBabyForm(ctx, null));

  // 待办
  const eventsList = el.querySelector('#events-list');
  try {
    const { events } = await api.get(`/babies/${baby.id}/events`);
    if (!events.length) {
      eventsList.innerHTML = `<div style="font-size:13px;color:var(--muted);padding:6px 0">还没有待办事项</div>`;
    } else {
      eventsList.innerHTML = `<div class="rows">${events.map((e) => `
        <div class="row" data-id="${e.id}">
          <div class="row__icon ${e.done ? '' : 'row__icon--amber'}">${icon(e.kind === 'checkup' ? 'calendar' : 'book')}</div>
          <div class="row__main">
            <div class="row__title" style="${e.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(e.title)}</div>
            <div class="row__sub">${esc(fmtDate(e.event_date))} · ${esc(relativeLabel(e.event_date))}${e.notes ? ` · ${esc(e.notes)}` : ''}</div>
          </div>
          <div class="row__side">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)">
              <input type="checkbox" data-done ${e.done ? 'checked' : ''} style="accent-color:var(--brand)" /> 完成
            </label>
          </div>
        </div>`).join('')}</div>`;

      eventsList.querySelectorAll('input[data-done]').forEach((cb) => {
        cb.addEventListener('change', async () => {
          const id = Number(cb.closest('.row').dataset.id);
          await api.patch(`/events/${id}`, { done: cb.checked });
          ctx.reload();
        });
      });
    }
  } catch (err) {
    eventsList.innerHTML = `<div style="font-size:13px;color:var(--danger)">${esc(err.message)}</div>`;
  }

  el.querySelector('#add-event').addEventListener('click', () => {
    openModal({
      title: '加一条待办',
      body: `<div class="form-grid">
        ${field({ label: '事项', name: 'title', required: true, wide: true, placeholder: '如 6 月龄儿保体检' })}
        ${field({ label: '日期', name: 'event_date', type: 'date', required: true, value: todayStr() })}
        ${field({ label: '类型', name: 'kind', type: 'select', value: 'other', options: [
          { value: 'checkup', label: '体检 / 复查' }, { value: 'milestone', label: '里程碑' }, { value: 'other', label: '其他' },
        ] })}
        ${field({ label: '备注', name: 'notes', wide: true, placeholder: '可选' })}
      </div>`,
      onSubmit: async (fd) => {
        const data = formValues(fd);
        if (!data.title) throw new Error('请填写事项名称');
        await api.post(`/babies/${baby.id}/events`, data);
        toast('已添加', 'ok');
        ctx.reload();
      },
    });
  });

  // 密码
  el.querySelector('#change-pw').addEventListener('click', () => {
    openModal({
      title: '修改密码',
      body: `<div class="form-grid">
        ${field({ label: '当前密码', name: 'oldPassword', type: 'password', required: true, wide: true })}
        ${field({ label: '新密码（至少 6 位）', name: 'newPassword', type: 'password', required: true, wide: true, autocomplete: 'new-password' })}
      </div>`,
      onSubmit: async (fd) => {
        const data = formValues(fd);
        await api.post('/auth/password', data);
        toast('密码已更新', 'ok');
      },
    });
  });

  // 导出
  el.querySelector('#export-data').addEventListener('click', async () => {
    const data = await api.get(`/babies/${baby.id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `babybook-${baby.id}-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('已导出 JSON', 'ok');
  });

  // 删除宝宝
  el.querySelector('#delete-baby').addEventListener('click', async () => {
    if (!(await confirmDialog(`删除 ${esc(baby.name)} 的全部数据（档案、产检、疫苗、成长、待办）？无法恢复。`, { confirmText: '彻底删除' }))) return;
    await api.del(`/babies/${baby.id}`);
    localStorage.removeItem('bb_baby');
    toast('已删除');
    ctx.reload();
  });

  return el;
}
