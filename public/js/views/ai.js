import { api } from '../api.js';
import { icon, openModal, toast, field, formValues } from '../ui.js';
import { esc } from '../util.js';

const state = { messages: [], busy: false };

const SUGGESTIONS = [
  '宝宝现在有哪些疫苗逾期了？',
  '最近三个月体重增长正常吗？',
  '上次产检医生说了什么？下次什么时候？',
  '帮我看看接下来两周要做什么',
];

/* ── 设置弹窗 ─────────────────────────────────────────── */
async function openAiSettings(onSaved) {
  const { config, moduleLabels } = await api.get('/ai/config');
  const modHtml = Object.entries(moduleLabels).map(([key, label]) => `
    <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid var(--line);border-radius:11px;cursor:pointer;font-size:13.5px">
      <input type="checkbox" name="mod_${key}" ${config.modules.includes(key) ? 'checked' : ''} style="accent-color:var(--brand)" />
      ${esc(label)}
    </label>`).join('');

  const body = `
    <div class="form-grid">
      ${field({ label: 'API 地址（Base URL）', name: 'baseUrl', required: true, wide: true,
        value: config.baseUrl, placeholder: 'http://your-ai-gateway:3100 或 https://api.deepseek.com',
        hint: '任何 OpenAI 兼容服务：自建 ai_gateway、DeepSeek、硅基流动、OpenAI 等' })}
      ${field({ label: 'API Key', name: 'apiKey', type: 'password', wide: true,
        placeholder: config.hasKey ? `已保存 ${config.keyMask}（留空不修改）` : 'sk-…',
        autocomplete: 'new-password' })}
      ${field({ label: '模型名', name: 'model', required: true, value: config.model, placeholder: '如 deepseek-chat / gpt-4o-mini' })}
      ${field({ label: '回答风格', name: 'mode', type: 'select', value: config.mode, options: [
        { value: 'auto', label: '自动（推荐）' },
        { value: 'tools', label: '工具调用（函数调用）' },
        { value: 'snapshot', label: '数据快照（老模型兼容）' },
      ] })}
      ${field({ label: '温度 0~2', name: 'temperature', type: 'number', step: '0.1', min: 0, max: 2, value: config.temperature })}
    </div>
    <div style="margin-top:16px">
      <div style="font-size:12.5px;color:var(--ink-2);font-weight:500;margin-bottom:8px">允许 AI 读取的模块</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px">${modHtml}</div>
    </div>
    <div class="field" style="margin-top:16px">
      <label>自定义提示词（可选，留空用内置）</label>
      <textarea name="systemPrompt" rows="3" placeholder="例如：回答时先给结论再给依据；涉及月龄发育参照儿保手册…">${esc(config.systemPrompt || '')}</textarea>
    </div>`;

  openModal({
    title: 'AI 服务设置',
    subtitle: 'AI 只能读取上面勾选模块的数据，且只读不写',
    body,
    wide: true,
    confirmText: '保存',
    extra: [
      {
        label: '测试连接',
        variant: 'btn--ghost',
        close: false,
        action: async (fd) => {
          // 先保存当前填写的内容，再测，避免测的是旧配置
          const data = formValues(fd);
          const modules = Object.keys(moduleLabels).filter((k) => fd.get(`mod_${k}`) === 'on');
          await api.put('/ai/config', {
            baseUrl: data.baseUrl,
            apiKey: data.apiKey || undefined,
            model: data.model,
            mode: data.mode,
            temperature: data.temperature,
            modules,
            systemPrompt: data.systemPrompt,
          });
          toast('测试中…');
          try {
            const r = await api.post('/ai/test');
            toast(`连接成功：${r.sample || 'OK'}`, 'ok');
          } catch (err) {
            toast(err.message, 'error');
            return false;
          }
        },
      },
      ...(config.hasKey ? [{
        label: '清除密钥',
        variant: 'btn--ghost',
        close: false,
        action: async () => {
          await api.post('/ai/config/key', { clear: true });
          toast('已清除 API Key', 'ok');
        },
      }] : []),
    ],
    onSubmit: async (fd) => {
      const data = formValues(fd);
      const modules = Object.keys(moduleLabels).filter((k) => fd.get(`mod_${k}`) === 'on');
      await api.put('/ai/config', {
        baseUrl: data.baseUrl,
        apiKey: data.apiKey || undefined,
        model: data.model,
        mode: data.mode,
        temperature: data.temperature,
        modules,
        systemPrompt: data.systemPrompt,
      });
      toast('已保存', 'ok');
      if (onSaved) onSaved();
    },
  });
}

/* ── 聊天界面 ─────────────────────────────────────────── */
function bubble(msg) {
  if (msg.role === 'user') {
    return `<div class="msg msg--user"><div class="msg__body">${esc(msg.content)}</div></div>`;
  }
  const steps = (msg.steps && msg.steps.length)
    ? `<details class="msg__steps"><summary>查询了 ${msg.steps.length} 次数据</summary>${msg.steps.map((s) => `<div>· ${esc(s)}</div>`).join('')}</details>`
    : '';
  const body = msg.error
    ? `<span style="color:var(--danger)">${esc(msg.content || '出错了')}</span>`
    : (msg.content ? mdLite(msg.content) : '<span class="msg__typing"><i></i><i></i><i></i></span>');
  return `<div class="msg msg--ai"><div class="msg__avatar">${icon('baby', 'icon-sm')}</div>
    <div class="msg__body">${steps}${body}</div></div>`;
}

/** 极简 markdown：加粗、行内码、列表、换行 */
function mdLite(text) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^[-·] (.+)$/gm, '· $1')
    .replace(/\n/g, '<br/>');
}

function renderMessages(el) {
  const list = el.querySelector('#chat-list');
  list.innerHTML = state.messages.length
    ? state.messages.map(bubble).join('')
    : `<div class="chat-hello">
        <div class="empty__icon">${icon('baby', 'icon-lg')}</div>
        <h3>问我关于宝宝的事</h3>
        <p>我会直接查你记录里的真实数据来回答，只读不改动。</p>
        <div class="chat-sugs">${SUGGESTIONS.map((s, i) => `<button class="chip chip--ghost chat-sug" data-i="${i}">${esc(s)}</button>`).join('')}</div>
      </div>`;
  list.scrollTop = list.scrollHeight;
  list.querySelectorAll('.chat-sug').forEach((b) => {
    b.addEventListener('click', () => {
      const input = el.querySelector('#chat-input');
      input.value = SUGGESTIONS[Number(b.dataset.i)];
      input.focus();
    });
  });
}

async function send(el) {
  const input = el.querySelector('#chat-input');
  const text = input.value.trim();
  if (!text || state.busy) return;
  input.value = '';
  state.busy = true;
  el.querySelector('#send-btn').disabled = true;

  state.messages.push({ role: 'user', content: text });
  const aiMsg = { role: 'assistant', content: '', steps: [] };
  state.messages.push(aiMsg);
  renderMessages(el);

  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        babyId: ctxBabyId(el),
        messages: state.messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => null);
      throw new Error((j && j.error) || `请求失败 ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let event = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (t.startsWith('event:')) { event = t.slice(6).trim(); continue; }
        if (!t.startsWith('data:')) continue;
        let payload;
        try { payload = JSON.parse(t.slice(5).trim()); } catch { continue; }
        if (event === 'status') {
          aiMsg.steps.push(payload.text);
          const statusEl = el.querySelector('#chat-status');
          if (statusEl) statusEl.textContent = payload.text;
          renderMessages(el);
        } else if (event === 'delta') {
          aiMsg.content += payload.text;
          renderMessages(el);
        } else if (event === 'error') {
          aiMsg.error = true;
          aiMsg.content = payload.message;
          renderMessages(el);
        }
      }
    }
    if (!aiMsg.content && !aiMsg.error) { aiMsg.error = true; aiMsg.content = '没有收到回答'; }
  } catch (err) {
    aiMsg.error = true;
    aiMsg.content = err.message;
  } finally {
    aiMsg.content = aiMsg.content || '';
    state.busy = false;
    const statusEl = el.querySelector('#chat-status');
    if (statusEl) statusEl.textContent = '';
    el.querySelector('#send-btn').disabled = false;
    renderMessages(el);
  }
}

function ctxBabyId(el) {
  return Number(el.dataset.babyId);
}

export async function renderAi(ctx) {
  const el = document.createElement('div');
  el.dataset.babyId = ctx.baby.id;

  let config = null;
  try {
    ({ config } = await api.get('/ai/config'));
  } catch { /* 忽略，按未配置处理 */ }
  const configured = config && config.baseUrl && config.model;

  el.innerHTML = `
    <div class="page-head">
      <div><h1>AI 助手</h1><p>读取你记录的真实数据来回答（${ctx.baby.nickname || ctx.baby.name}）</p></div>
      <div class="page-head__actions">
        <button class="btn btn--ghost btn--sm" id="clear-chat">${icon('x', 'icon-sm')} 清空对话</button>
        <button class="btn btn--sm" id="ai-settings">${icon('settings', 'icon-sm')} AI 设置</button>
      </div>
    </div>

    ${configured ? '' : `<div class="card" style="border-color:#f0d4ce;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div class="row__icon row__icon--danger">${icon('alert')}</div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:600">还没有配置 AI 服务</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:2px">填一个 OpenAI 兼容的地址和模型就能用，比如你自建的 ai_gateway。</div>
        </div>
        <button class="btn btn--sm" id="ai-settings-2">去配置</button>
      </div>
    </div>`}

    <div class="chat">
      <div class="chat__list" id="chat-list"></div>
      <div class="chat__input">
        <div class="chat__status" id="chat-status"></div>
        <div style="display:flex;gap:10px;align-items:flex-end">
          <textarea id="chat-input" rows="1" placeholder="问点什么，比如：接下来两周要打什么疫苗？"></textarea>
          <button class="btn" id="send-btn" ${configured ? '' : 'disabled'}>${icon('chevron')} 发送</button>
        </div>
      </div>
    </div>`;

  renderMessages(el);

  const openSettings = () => openAiSettings(() => ctx.reload());
  el.querySelector('#ai-settings').addEventListener('click', openSettings);
  el.querySelector('#ai-settings-2')?.addEventListener('click', openSettings);
  el.querySelector('#clear-chat').addEventListener('click', () => {
    state.messages = [];
    renderMessages(el);
  });
  el.querySelector('#send-btn').addEventListener('click', () => send(el));
  const input = el.querySelector('#chat-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(el);
    }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(140, input.scrollHeight)}px`;
  });

  return el;
}
