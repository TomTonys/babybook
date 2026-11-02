import { esc } from './util.js';

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

export function toast(message, type = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type ? `toast--${type}` : ''}`;
  el.textContent = message;
  root.append(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 260);
  }, type === 'error' ? 3600 : 2200);
}

let openCount = 0;

/**
 * 打开弹窗
 * @param {object} opts {title, subtitle, body, confirmText, cancelText, wide, danger, extra, hideSubmit, onSubmit}
 * onSubmit(formData, form, close) 可返回 false 阻止关闭
 */
export function openModal(opts) {
  const {
    title, subtitle = '', body = '', confirmText = '保存', cancelText = '取消',
    wide = false, danger = false, extra = [], hideSubmit = false, onSubmit = null,
  } = opts;

  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  const extraHtml = extra.map((btn, i) => (
    `<button type="button" class="btn ${btn.variant || 'btn--ghost'}" data-extra="${i}">${esc(btn.label)}</button>`
  )).join('');

  mask.innerHTML = `
    <form class="modal ${wide ? 'modal--wide' : ''}" autocomplete="off" novalidate>
      <div class="modal__head">
        <h3>${esc(title)}</h3>
        ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
      </div>
      <div class="modal__body">${body}</div>
      <div class="modal__foot">
        ${extraHtml}
        ${hideSubmit ? '' : `<button type="button" class="btn btn--ghost" data-cancel>${esc(cancelText)}</button>`}
        ${hideSubmit ? `<button type="button" class="btn btn--ghost" data-cancel>关闭</button>` : ''}
        ${hideSubmit ? '' : `<button type="submit" class="btn ${danger ? 'btn--danger' : ''}">${esc(confirmText)}</button>`}
      </div>
    </form>`;

  const form = mask.querySelector('form');
  const close = () => {
    mask.remove();
    openCount = Math.max(0, openCount - 1);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && openCount === 1) close();
  };

  mask.addEventListener('click', (e) => {
    if (e.target === mask) close();
  });
  form.querySelector('[data-cancel]').addEventListener('click', close);
  form.querySelectorAll('[data-extra]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cfg = extra[Number(btn.dataset.extra)];
      try {
        const value = await cfg.action(new FormData(form), form, close);
        if (value !== false && cfg.close !== false) close();
      } catch (err) {
        toast(err.message || '操作失败', 'error');
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return close();
    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    try {
      const keep = await onSubmit(new FormData(form), form, close);
      if (keep !== false) close();
    } catch (err) {
      toast(err.message || '保存失败', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById('modal-root').append(mask);
  openCount += 1;
  document.addEventListener('keydown', onKey);
  setTimeout(() => {
    const first = form.querySelector('input:not([type="hidden"]), select, textarea');
    if (first) first.focus({ preventScroll: true });
  }, 40);
  return { form, close, mask };
}

export function confirmDialog(message, opts = {}) {
  const { title = '确认操作', confirmText = '确认', danger = true } = opts;
  return new Promise((resolve) => {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal__head"><h3>${esc(title)}</h3></div>
        <div class="modal__body">
          <p style="font-size:14px;color:var(--ink-2);line-height:1.7">${esc(message)}</p>
        </div>
        <div class="modal__foot">
          <button type="button" class="btn btn--ghost" data-no>取消</button>
          <button type="button" class="btn ${danger ? 'btn--danger' : ''}" data-yes>${esc(confirmText)}</button>
        </div>
      </div>`;
    const done = (value) => {
      mask.remove();
      resolve(value);
    };
    mask.querySelector('[data-no]').addEventListener('click', () => done(false));
    mask.querySelector('[data-yes]').addEventListener('click', () => done(true));
    mask.addEventListener('click', (e) => {
      if (e.target === mask) done(false);
    });
    document.getElementById('modal-root').append(mask);
  });
}

/** 生成表单项 HTML */
export function field({
  label, name, type = 'text', value = '', placeholder = '', required = false,
  hint = '', options = null, min, max, step, wide = false, rows = 3, readonly = false,
  inputmode, autocomplete = 'off',
}) {
  const id = `f_${name}_${Math.random().toString(36).slice(2, 7)}`;
  const cls = `field${wide ? ' field--wide' : ''}`;
  const common = [
    `id="${id}"`, `name="${name}"`, `placeholder="${esc(placeholder)}"`,
    required ? 'required' : '', readonly ? 'readonly' : '',
    min !== undefined ? `min="${min}"` : '', max !== undefined ? `max="${max}"` : '',
    step !== undefined ? `step="${step}"` : '', inputmode ? `inputmode="${inputmode}"` : '',
    autocomplete ? `autocomplete="${autocomplete}"` : '',
  ].filter(Boolean).join(' ');

  let control;
  if (options) {
    control = `<select ${common}>${options.map((o) => {
      const v = typeof o === 'string' ? o : o.value;
      const t = typeof o === 'string' ? o : o.label;
      return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(t)}</option>`;
    }).join('')}</select>`;
  } else if (type === 'textarea') {
    control = `<textarea ${common} rows="${rows}">${esc(value)}</textarea>`;
  } else {
    control = `<input type="${type}" ${common} value="${esc(value)}" />`;
  }

  return `<div class="${cls}">
    <label for="${id}">${esc(label)}${required ? ' <span style="color:var(--accent)">*</span>' : ''}</label>
    ${control}
    ${hint ? `<span class="hint">${esc(hint)}</span>` : ''}
  </div>`;
}

/** 兼容两种入参：<form> 元素或已构造好的 FormData */
export function formValues(source) {
  const fd = source instanceof FormData ? source : new FormData(source);
  const data = {};
  for (const [k, v] of fd.entries()) {
    data[k] = typeof v === 'string' ? v.trim() : v;
  }
  return data;
}

export function emptyState({ iconName = 'baby', title, desc = '', action = '' }) {
  return `<div class="empty">
    <div class="empty__icon">${icon(iconName, 'icon-lg')}</div>
    <h3>${esc(title)}</h3>
    ${desc ? `<p>${esc(desc)}</p>` : ''}
    ${action}
  </div>`;
}

export function chip(text, variant = '') {
  return `<span class="chip ${variant ? `chip--${variant}` : ''}">${esc(text)}</span>`;
}
