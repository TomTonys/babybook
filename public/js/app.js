import { api } from './api.js';
import { icon, toast, field, formValues } from './ui.js';
import { esc, formatAge, fmtDate } from './util.js';
import { renderOverview } from './views/overview.js';
import { renderVaccines } from './views/vaccines.js';
import { renderPrenatal } from './views/prenatal.js';
import { renderGrowth } from './views/growth.js';
import { renderSettings } from './views/settings.js';
import { renderAi } from './views/ai.js';

const app = document.getElementById('app');

const NAV = [
  { key: 'overview', hash: '#/', label: '概览', icon: 'home' },
  { key: 'vaccines', hash: '#/vaccines', label: '疫苗', icon: 'syringe' },
  { key: 'prenatal', hash: '#/prenatal', label: '产检', icon: 'heart' },
  { key: 'growth', hash: '#/growth', label: '成长', icon: 'chart' },
  { key: 'ai', hash: '#/ai', label: 'AI 助手', icon: 'sparkle' },
  { key: 'settings', hash: '#/settings', label: '设置', icon: 'settings' },
];

const VIEWS = {
  overview: renderOverview,
  vaccines: renderVaccines,
  prenatal: renderPrenatal,
  growth: renderGrowth,
  ai: renderAi,
  settings: renderSettings,
};

const state = { user: null, babies: [], baby: null, route: 'overview' };

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '').split('?')[0];
  return VIEWS[hash] ? hash : 'overview';
}

function go(hash) {
  if (location.hash === hash) return;
  location.hash = hash;
}

function avatar(baby, cls = '') {
  if (baby && baby.avatar) {
    return `<div class="avatar ${cls}"><img src="${esc(baby.avatar)}" alt="" /></div>`;
  }
  const letter = baby ? (baby.nickname || baby.name || '宝').slice(0, 1) : '宝';
  return `<div class="avatar ${cls}">${esc(letter)}</div>`;
}

/* ── 登录 ─────────────────────────────────────────────── */
function renderLogin() {
  state.user = null;
  app.innerHTML = `
    <div class="login">
      <div class="login__brand">
        <div class="login__logo">${icon('baby')}<span>BABYBOOK</span></div>
        <div>
          <h1>宝宝簿</h1>
          <p>把产检、出生、疫苗和每一次长高，都收进一本只属于你们家的册子里。</p>
        </div>
        <div class="login__logo" style="letter-spacing:.08em;font-size:12px;color:rgba(244,239,230,.5)">
          自托管 · 数据在自己的服务器
        </div>
      </div>
      <div class="login__panel">
        <form class="login__box" id="login-form">
          <h2>欢迎回来</h2>
          <p>登录后继续记录宝宝的成长</p>
          <div class="field" style="margin-bottom:14px">
            <label for="login-user">账号</label>
            <input id="login-user" name="username" autocomplete="username" required />
          </div>
          <div class="field" style="margin-bottom:20px">
            <label for="login-pass">密码</label>
            <input id="login-pass" name="password" type="password" autocomplete="current-password" required />
          </div>
          <button class="btn btn--block" type="submit">登录</button>
          <div class="login__foot">首次部署的管理员账号见服务器启动日志，或 .env 中的 ADMIN_USER / ADMIN_PASSWORD</div>
        </form>
      </div>
    </div>`;

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const values = formValues(form);
      await api.post('/auth/login', values);
      await boot();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
  form.querySelector('input').focus();
}

/* ── 首次引导 ─────────────────────────────────────────── */
function renderOnboarding() {
  app.innerHTML = `
    <div class="onboard">
      <form class="onboard__card" id="onboard-form">
        <div class="onboard__mark">${icon('baby', 'icon-lg')}</div>
        <h1>先建一份宝宝档案</h1>
        <p class="lead">还没出生也可以先建：填预产期，产检记录就有了孕周；出生后再补出生信息，疫苗表会自动排好。</p>
        <div class="form-grid">
          ${field({ label: '姓名 / 小名', name: 'name', placeholder: '比如 小满', required: true, wide: true })}
          ${field({ label: '性别', name: 'gender', type: 'select', options: [
            { value: 'female', label: '女宝宝' }, { value: 'male', label: '男宝宝' }, { value: 'unknown', label: '暂不填写' },
          ] })}
          ${field({ label: '预产期', name: 'due_date', type: 'date', hint: '用于计算孕周' })}
          ${field({ label: '出生日期', name: 'birth_date', type: 'date', hint: '已出生再填，留空表示孕期' })}
          ${field({ label: '出生体重（克）', name: 'birth_weight_g', type: 'number', placeholder: '3250', min: 200, max: 9000 })}
          ${field({ label: '出生身长（cm）', name: 'birth_length_cm', type: 'number', placeholder: '50.2', step: '0.1', min: 20, max: 80 })}
        </div>
        <div style="margin-top:22px">
          <button class="btn btn--block" type="submit">创建档案</button>
        </div>
        <div class="onboard__foot">数据保存在你自己的 MySQL 里，不会上传到任何第三方。</div>
      </form>
    </div>`;

  const form = document.getElementById('onboard-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = formValues(form);
    if (!body.birth_date && !body.due_date) {
      toast('请至少填写预产期或出生日期', 'error');
      return;
    }
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const { baby } = await api.post('/babies', body);
      localStorage.setItem('bb_baby', String(baby.id));
      await boot();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

/* ── 主框架 ───────────────────────────────────────────── */
function shellHtml() {
  return `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand__mark">${icon('baby', 'icon-lg')}</div>
          <div>
            <div class="brand__name">宝宝簿</div>
            <div class="brand__sub">BabyBook</div>
          </div>
        </div>
        <div class="baby-switch">
          <label>当前宝宝</label>
          <select id="baby-select"></select>
        </div>
        <nav class="nav">
          ${NAV.map((n) => `<a href="${n.hash}" data-key="${n.key}">${icon(n.icon)}<span>${n.label}</span></a>`).join('')}
        </nav>
        <div class="sidebar__foot">
          <div class="user-line"><span class="dot"></span><span>${esc(state.user.displayName || state.user.username)}</span></div>
          <button class="logout-btn" id="logout-btn">${icon('logout', 'icon-sm')} 退出登录</button>
        </div>
      </aside>
      <main class="main">
        <header class="mobile-top" id="mobile-top"></header>
        <div class="container" id="view"></div>
      </main>
      <nav class="tabbar">
        ${NAV.map((n) => `<a href="${n.hash}" data-key="${n.key}">${icon(n.icon)}<span>${n.label}</span></a>`).join('')}
      </nav>
    </div>`;

  // mobile-top 只渲染骨架，内容随后填充
}

function updateShellMeta() {
  const { babies, baby } = state;
  const select = document.getElementById('baby-select');
  if (select) {
    select.innerHTML = babies.map((b) => (
      `<option value="${b.id}" ${baby && b.id === baby.id ? 'selected' : ''}>${esc(b.nickname || b.name)}${b.isBorn ? '' : '（孕期中）'}</option>`
    )).join('');
  }
  const top = document.getElementById('mobile-top');
  if (top && baby) {
    top.innerHTML = `
      ${avatar(baby, 'avatar--sm')}
      <div class="grow">
        <b>${esc(baby.nickname || baby.name)}</b>
        <span>${baby.isBorn ? esc(baby.ageText) : `孕 ${esc(baby.gestLabel || '—')}`}</span>
      </div>
      <button class="icon-btn" id="mobile-switch" aria-label="切换宝宝">${icon('chevron')}</button>`;
    top.querySelector('#mobile-switch').addEventListener('click', () => {
      if (state.babies.length < 2) return go('#/settings');
      const ids = state.babies.map((b) => b.id);
      const next = ids[(ids.indexOf(state.baby.id) + 1) % ids.length];
      selectBaby(next);
    });
  }
}

function selectBaby(id) {
  const baby = state.babies.find((b) => b.id === Number(id));
  if (!baby) return;
  state.baby = baby;
  localStorage.setItem('bb_baby', String(baby.id));
  updateShellMeta();
  renderRoute();
}

async function loadBabies() {
  const { babies } = await api.get('/babies');
  state.babies = babies || [];
  const saved = Number(localStorage.getItem('bb_baby'));
  state.baby = state.babies.find((b) => b.id === saved) || state.babies[0] || null;
  if (state.baby) localStorage.setItem('bb_baby', String(state.baby.id));
}

function shell() {
  app.innerHTML = shellHtml();
  updateShellMeta();
  document.getElementById('baby-select').addEventListener('change', (e) => selectBaby(e.target.value));
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api.post('/auth/logout').catch(() => {});
    state.user = null;
    renderLogin();
  });
}

async function renderRoute() {
  state.route = currentRoute();
  document.querySelectorAll('.nav a, .tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.key === state.route);
  });
  const view = document.getElementById('view');
  if (!view) return;
  view.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--muted)">加载中…</div>`;
  try {
    const node = await VIEWS[state.route]({
      baby: state.baby,
      babies: state.babies,
      user: state.user,
      go,
      reload: async () => {
        await loadBabies();
        updateShellMeta();
        await renderRoute();
      },
    });
    view.replaceChildren(node);
    window.scrollTo({ top: 0 });
  } catch (err) {
    view.innerHTML = `<div class="card"><div class="empty">
      <div class="empty__icon">${icon('alert', 'icon-lg')}</div>
      <h3>页面没加载出来</h3><p>${esc(err.message)}</p>
      <button class="btn btn--soft" id="retry-btn">重试</button></div></div>`;
    const retry = document.getElementById('retry-btn');
    if (retry) retry.addEventListener('click', renderRoute);
  }
}

async function boot() {
  try {
    const { user } = await api.get('/auth/me');
    state.user = user;
  } catch {
    renderLogin();
    return;
  }
  try {
    await loadBabies();
  } catch (err) {
    toast(err.message, 'error');
    renderLogin();
    return;
  }
  if (!state.babies.length) {
    renderOnboarding();
    return;
  }
  shell();
  renderRoute();
}

window.addEventListener('hashchange', () => {
  if (state.user && state.babies.length) renderRoute();
});
window.addEventListener('auth:expired', () => {
  if (state.user) renderLogin();
});

boot();
