'use strict';
const express = require('express');
const { getSetting, setSetting, one } = require('../db');
const auth = require('../auth');
const { wrap, fail, str, intId } = require('../lib/http');
const D = require('../lib/dates');
const { MODULES, toolDefs, runTool, snapshot } = require('../lib/aitools');

const router = express.Router();
router.use(auth.requireAuth);

const CONFIG_KEY = 'ai_config';
const MAX_TOOL_ROUNDS = 6;
const HISTORY_LIMIT = 24;

const DEFAULT_CONFIG = {
  baseUrl: '',
  apiKey: '',
  model: '',
  temperature: 0.4,
  modules: Object.keys(MODULES),
  systemPrompt: '',
  mode: 'auto', // auto=优先 function-calling，不支持时回退快照 | tools=只用工具 | snapshot=只用数据快照
};

const BUILT_IN_SYSTEM = [
  '你是「宝宝簿」里的家庭育儿数据助手。用户在一个自托管的家庭记录系统里存了宝宝的产检、出生、疫苗和成长数据。',
  '回答涉及宝宝的具体问题时，必须先调用工具读取真实数据，基于返回内容作答；不要凭通用知识编造数字或日期。',
  '如果工具返回为空或数据不足，如实说明，并提示用户在对应模块补录。',
  '涉及医疗决策（补种安排、疫苗不良反应、发育是否异常等）时，给数据事实和一般指南参考，并提醒以儿科医生/接种门诊意见为准。',
  '用简体中文回答，口语化、简洁，多用列表和具体日期，不要输出原始 JSON。',
].join('\n');

async function loadConfig() {
  const raw = await getSetting(CONFIG_KEY);
  let saved = {};
  try { saved = raw ? JSON.parse(raw) : {}; } catch { saved = {}; }
  const cfg = { ...DEFAULT_CONFIG, ...saved };
  cfg.modules = (Array.isArray(cfg.modules) ? cfg.modules : DEFAULT_CONFIG.modules).filter((m) => MODULES[m]);
  if (!cfg.modules.length) cfg.modules = DEFAULT_CONFIG.modules;
  return cfg;
}

function publicConfig(cfg) {
  return {
    baseUrl: cfg.baseUrl,
    hasKey: Boolean(cfg.apiKey),
    keyMask: cfg.apiKey ? `${cfg.apiKey.slice(0, 4)}••••${cfg.apiKey.slice(-4)}` : '',
    model: cfg.model,
    temperature: cfg.temperature,
    modules: cfg.modules,
    systemPrompt: cfg.systemPrompt,
    mode: cfg.mode,
  };
}

router.get('/ai/config', wrap(async (req, res) => {
  res.json({
    config: publicConfig(await loadConfig()),
    moduleLabels: Object.fromEntries(Object.entries(MODULES).map(([k, v]) => [k, v.label])),
  });
}));

router.put('/ai/config', wrap(async (req, res) => {
  const cfg = await loadConfig();
  const b = req.body || {};
  if (b.baseUrl !== undefined) cfg.baseUrl = str(b.baseUrl, 200).replace(/\/+$/, '');
  if (b.apiKey) cfg.apiKey = str(b.apiKey, 200); // 空值表示不修改（防误清空）
  if (b.model !== undefined) cfg.model = str(b.model, 100);
  if (b.temperature !== undefined) cfg.temperature = Math.max(0, Math.min(2, Number(b.temperature) || 0));
  if (Array.isArray(b.modules)) {
    const picked = b.modules.filter((m) => MODULES[m]);
    cfg.modules = picked.length ? picked : cfg.modules;
  }
  if (b.systemPrompt !== undefined) cfg.systemPrompt = str(b.systemPrompt, 4000);
  if (['auto', 'tools', 'snapshot'].includes(b.mode)) cfg.mode = b.mode;
  await setSetting(CONFIG_KEY, JSON.stringify(cfg));
  res.json({ config: publicConfig(cfg) });
}));

router.post('/ai/config/key', wrap(async (req, res) => {
  const cfg = await loadConfig();
  cfg.apiKey = req.body && req.body.clear ? '' : str((req.body && req.body.apiKey) || '', 200);
  await setSetting(CONFIG_KEY, JSON.stringify(cfg));
  res.json({ config: publicConfig(cfg) });
}));

function upstream(cfg, body, apiKey, signal) {
  return fetch(`${cfg.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
}

router.post('/ai/test', wrap(async (req, res) => {
  const cfg = await loadConfig();
  if (!cfg.baseUrl || !cfg.model) return fail(res, 400, '请先填写 API 地址和模型名');
  try {
    const r = await upstream(cfg, {
      model: cfg.model,
      max_tokens: 16,
      messages: [{ role: 'user', content: '回复"连接成功"四个字' }],
    }, cfg.apiKey, AbortSignal.timeout(20000));
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      return fail(res, 502, `上游返回 ${r.status}：${(data && data.error && data.error.message) || ''}`.slice(0, 300));
    }
    res.json({ ok: true, sample: data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content });
  } catch (err) {
    fail(res, 502, `无法连接 ${cfg.baseUrl}：${err.message}`);
  }
}));

function wireMessages(messages) {
  return messages.map((m) => {
    const out = { role: m.role };
    if (m.content != null) out.content = m.content;
    if (m.tool_calls) out.tool_calls = m.tool_calls;
    if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
    if (m.role === 'assistant' && m.content == null && !m.tool_calls) out.content = '';
    return out;
  });
}

async function completionOnce(cfg, messages, tools, signal) {
  const body = {
    model: cfg.model,
    temperature: cfg.temperature,
    messages: wireMessages(messages),
  };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  const r = await upstream(cfg, body, cfg.apiKey, signal);
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const detail = (data && data.error && (data.error.message || JSON.stringify(data.error))) || '';
    const err = new Error(`上游 ${r.status}：${detail}`.slice(0, 300));
    err.status = r.status;
    err.toolsSuspect = /tool|function|invalid|unsupported|400|422/i.test(`${r.status} ${detail}`);
    throw err;
  }
  return data;
}

router.post('/ai/chat', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const send = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

  (async () => {
    const cfg = await loadConfig();
    if (!cfg.baseUrl || !cfg.model) {
      send('error', { message: '还没有配置 AI 服务，请先到「AI 设置」填写 API 地址和模型' });
      return res.end();
    }

    const babyId = intId(req.body && req.body.babyId);
    if (!babyId || !(await one('SELECT id FROM babies WHERE id = ?', [babyId]))) {
      send('error', { message: '宝宝不存在' }); return res.end();
    }

    let history = Array.isArray(req.body.messages) ? req.body.messages.slice(-HISTORY_LIMIT) : [];
    history = history
      .filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    if (!history.length || history[history.length - 1].role !== 'user') {
      send('error', { message: '消息格式不正确' }); return res.end();
    }

    const ac = new AbortController();
    req.on('close', () => ac.abort());

    const systemBase = [
      cfg.systemPrompt || BUILT_IN_SYSTEM,
      `今天日期：${D.todayStr()}（Asia/Shanghai）。`,
      `当前宝宝：id=${babyId}；工具调用不传 baby_id 时默认这个宝宝。`,
    ].join('\n');

    try {
      let useTools = cfg.mode !== 'snapshot';
      let messages = useTools
        ? [{ role: 'system', content: systemBase }, ...history]
        : [{ role: 'system', content: `${systemBase}\n\n以下是从系统读取的当前数据快照：\n${await snapshot(cfg.modules, babyId)}` }, ...history];
      const tools = toolDefs(cfg.modules);

      // ── 工具循环：非流式，直到模型不再要求调用工具 ──
      let finalText = null;
      let guard = 0;
      while (useTools && finalText === null && guard < MAX_TOOL_ROUNDS) {
        guard += 1;
        send('status', { text: guard === 1 ? '正在思考…' : '正在核对数据…' });
        let data;
        try {
          data = await completionOnce(cfg, messages, tools, ac.signal);
        } catch (err) {
          if (cfg.mode === 'auto' && err.toolsSuspect) {
            send('status', { text: '该上游不支持工具调用，改用数据快照模式…' });
            messages = [{ role: 'system', content: `${systemBase}\n\n以下是从系统读取的当前数据快照（JSON）：\n${await snapshot(cfg.modules, babyId)}` }, ...history];
            useTools = false;
            continue;
          }
          throw err;
        }
        const msg = data.choices && data.choices[0] && data.choices[0].message;
        if (!msg) throw new Error('上游返回内容为空');
        if (msg.tool_calls && msg.tool_calls.length) {
          messages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });
          for (const call of msg.tool_calls) {
            const name = call.function && call.function.name;
            send('status', { text: `正在查询「${name || '数据'}」…` });
            const result = await runTool(name, babyId, call.function && call.function.arguments);
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) });
          }
          continue;
        }
        finalText = msg.content || '';
      }

      if (finalText !== null) {
        send('delta', { text: finalText });
        send('done', {});
        return res.end();
      }

      // ── 快照模式：流式输出 ──
      send('status', { text: '正在生成回答…' });
      const r = await upstream(cfg, {
        model: cfg.model,
        temperature: cfg.temperature,
        stream: true,
        messages: wireMessages(messages),
      }, cfg.apiKey, ac.signal);
      if (!r.ok || !r.body) {
        const t = await r.text().catch(() => '');
        throw new Error(`上游 ${r.status}：${t.slice(0, 200)}`);
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let emitted = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
            if (delta) { emitted = true; send('delta', { text: delta }); }
          } catch { /* 忽略半截行 */ }
        }
      }
      if (!emitted) send('delta', { text: '（上游没有返回内容，请检查模型名或稍后重试）' });
      send('done', {});
      res.end();
    } catch (err) {
      if (!ac.signal.aborted) send('error', { message: String(err.message || err).slice(0, 300) });
      res.end();
    }
  })().catch((err) => {
    send('error', { message: String(err.message || err).slice(0, 300) });
    if (!res.writableEnded) res.end();
  });
});

module.exports = router;
