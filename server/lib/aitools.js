'use strict';
/**
 * AI 助手的工具层：把数据库查询包装成 OpenAI function-calling 工具。
 * 只读；按「模块开关」过滤暴露给模型的工具；baby_id 一律校验存在性。
 */
const { q, one } = require('../db');
const D = require('./dates');
const { decorate } = require('./vaccines');

/** 模块定义：key 用于设置存储，tools 列出该模块放开的工具名 */
const MODULES = {
  profile: { label: '宝宝档案', tools: ['list_babies', 'get_baby_profile'] },
  prenatal: { label: '产检记录', tools: ['list_prenatal_visits'] },
  vaccines: { label: '疫苗接种', tools: ['get_vaccination_status', 'get_vaccine_detail'] },
  growth: { label: '成长测量', tools: ['get_growth_records'] },
  events: { label: '待办提醒', tools: ['list_events'] },
};

const TOOL_LABELS = {
  list_babies: '宝宝列表',
  get_baby_profile: '宝宝档案',
  list_prenatal_visits: '产检记录',
  get_vaccination_status: '疫苗进度',
  get_vaccine_detail: '疫苗明细',
  get_growth_records: '成长测量',
  list_events: '待办事项',
};

const BABY_ID_PARAM = {
  type: 'object',
  properties: {
    baby_id: { type: 'integer', description: '宝宝 ID；不填默认当前宝宝' },
  },
  additionalProperties: false,
};

const DEFS = {
  list_babies: {
    type: 'function',
    function: {
      name: 'list_babies',
      description: '列出家庭里所有宝宝（id、姓名、出生日期或预产期）。回答涉及"哪个宝宝"或多宝宝对比时先调用。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  get_baby_profile: {
    type: 'function',
    function: {
      name: 'get_baby_profile',
      description: '读取宝宝完整档案：出生体重/身长/头围、分娩方式、医院、Apgar、血型、当前年龄或孕周。',
      parameters: BABY_ID_PARAM,
    },
  },
  list_prenatal_visits: {
    type: 'function',
    function: {
      name: 'list_prenatal_visits',
      description: '读取产检记录列表（时间倒序）：日期、孕周、类型、医院、体重、血压、胎心、宫高腹围、检查结果与医生建议、下次产检日期。',
      parameters: {
        type: 'object',
        properties: {
          baby_id: BABY_ID_PARAM.properties.baby_id,
          limit: { type: 'integer', description: '最多返回几条，默认 20' },
        },
        additionalProperties: false,
      },
    },
  },
  get_vaccination_status: {
    type: 'function',
    function: {
      name: 'get_vaccination_status',
      description: '疫苗接种汇总：总剂次、已完成、逾期、近期该种、待接种的数量，以及接下来 5 剂的计划。',
      parameters: {
        type: 'object',
        properties: {
          baby_id: BABY_ID_PARAM.properties.baby_id,
          category: { type: 'string', enum: ['nepi', 'self', 'all'], description: '免疫规划/自费/全部，默认 nepi' },
        },
        additionalProperties: false,
      },
    },
  },
  get_vaccine_detail: {
    type: 'function',
    function: {
      name: 'get_vaccine_detail',
      description: '疫苗逐剂明细：每剂的名称、剂次、计划/实际接种日期、状态、厂家、批号、门诊、反应。可按疫苗名模糊筛选。',
      parameters: {
        type: 'object',
        properties: {
          baby_id: BABY_ID_PARAM.properties.baby_id,
          name_contains: { type: 'string', description: '疫苗名包含关键字，如 乙肝、百白破' },
        },
        additionalProperties: false,
      },
    },
  },
  get_growth_records: {
    type: 'function',
    function: {
      name: 'get_growth_records',
      description: '成长测量记录（时间正序）：日期、日龄、体重 kg、身长 cm、头围 cm、备注。用于分析生长趋势。',
      parameters: {
        type: 'object',
        properties: {
          baby_id: BABY_ID_PARAM.properties.baby_id,
          limit: { type: 'integer', description: '最多返回几条，默认 30（取最近）' },
        },
        additionalProperties: false,
      },
    },
  },
  list_events: {
    type: 'function',
    function: {
      name: 'list_events',
      description: '待办/提醒事项：儿保体检、里程碑等，含日期与是否完成。',
      parameters: BABY_ID_PARAM,
    },
  },
};

async function resolveBabyId(requestedBabyId, args) {
  const id = Number(args && args.baby_id) || requestedBabyId;
  const baby = await one('SELECT id, name, nickname, birth_date, due_date FROM babies WHERE id = ?', [id]);
  if (!baby) throw new Error(`宝宝 id=${id} 不存在`);
  return baby;
}

const EXECUTORS = {
  async list_babies() {
    const rows = await q('SELECT id, name, nickname, gender, birth_date, due_date, archived FROM babies ORDER BY id');
    return rows.map((r) => ({
      ...r,
      age: r.birth_date ? D.formatAge(r.birth_date) : (r.due_date ? `预产期 ${r.due_date}` : '未知'),
    }));
  },

  async get_baby_profile(babyId, args) {
    const baby = await resolveBabyId(babyId, args);
    const full = await one('SELECT * FROM babies WHERE id = ?', [baby.id]);
    const today = D.todayStr();
    return {
      id: full.id,
      姓名: full.name,
      昵称: full.nickname,
      性别: { male: '男', female: '女', unknown: '未填' }[full.gender],
      预产期: full.due_date,
      出生日期: full.birth_date,
      出生时间: full.birth_time,
      当前: full.birth_date ? `${D.formatAge(full.birth_date, today)}（出生第 ${D.diffDays(today, full.birth_date) + 1} 天）`
        : (full.due_date ? `孕 ${D.gestLabel(D.gestDays(full.due_date, today))}，距预产期 ${D.diffDays(full.due_date, today)} 天` : '未知'),
      出生体重kg: full.birth_weight_g ? full.birth_weight_g / 1000 : null,
      出生身长cm: full.birth_length_cm,
      出生头围cm: full.birth_head_cm,
      分娩方式: full.delivery_method,
      出生医院: full.birth_hospital,
      Apgar: full.apgar_1 != null ? `${full.apgar_1}/${full.apgar_5 ?? ''}` : null,
      血型: full.blood_type,
      备注: full.notes,
    };
  },

  async list_prenatal_visits(babyId, args) {
    const baby = await resolveBabyId(babyId, args);
    const limit = Math.min(50, Math.max(1, Number(args && args.limit) || 20));
    const rows = await q(
      'SELECT * FROM prenatal_visits WHERE baby_id = ? ORDER BY visit_date DESC, id DESC LIMIT ' + limit,
      [baby.id],
    );
    return rows.map((r) => ({
      日期: r.visit_date,
      孕周: r.gest_days != null ? D.gestLabel(r.gest_days) : null,
      类型: r.visit_type,
      医院: r.hospital || null,
      体重kg: r.weight_kg,
      血压: r.systolic != null ? `${r.systolic}/${r.diastolic}` : null,
      胎心: r.fetal_heart_rate,
      宫高cm: r.fundal_height_cm,
      腹围cm: r.abdominal_cm,
      检查项目: r.items || null,
      结果: r.summary || null,
      下次产检: r.next_visit_date,
    }));
  },

  async get_vaccination_status(babyId, args) {
    const baby = await resolveBabyId(babyId, args);
    const cat = ['nepi', 'self', 'all'].includes(args && args.category) ? args.category : 'nepi';
    const params = [baby.id];
    let where = 'v.baby_id = ?';
    if (cat !== 'all') { where += ' AND v.category = ?'; params.push(cat); }
    const rows = await q(
      `SELECT v.*, d.age_label, d.age_months FROM vaccinations v
       LEFT JOIN vaccine_defs d ON d.code = v.def_code AND d.dose_no = v.dose_no
       WHERE ${where} ORDER BY COALESCE(v.planned_date,'9999-12-31')`,
      params,
    );
    const today = D.todayStr();
    const dec = rows.map((r) => decorate(r, today));
    const pending = dec.filter((v) => v.status === 'pending');
    return {
      宝宝: baby.nickname || baby.name,
      类别: { nepi: '国家免疫规划', self: '自费', all: '全部' }[cat],
      统计: {
        总剂次: dec.length,
        已接种: dec.filter((v) => v.status === 'done').length,
        已跳过: dec.filter((v) => v.status === 'skipped').length,
        逾期: pending.filter((v) => v.state === 'overdue').length,
        两周内该种: pending.filter((v) => v.state === 'due').length,
        更期待种: pending.filter((v) => v.state === 'upcoming').length,
      },
      接下来5剂: pending.slice(0, 5).map((v) => ({
        疫苗: `${v.name} 第${v.dose_no}剂`,
        计划: v.planned_date,
        状态: { overdue: `已逾期${v.overdueDays}天`, due: '两周内', upcoming: '未到' }[v.state] || v.state,
      })),
    };
  },

  async get_vaccine_detail(babyId, args) {
    const baby = await resolveBabyId(babyId, args);
    const rows = await q(
      `SELECT v.*, d.age_label FROM vaccinations v
       LEFT JOIN vaccine_defs d ON d.code = v.def_code AND d.dose_no = v.dose_no
       WHERE v.baby_id = ? ORDER BY COALESCE(v.planned_date,'9999-12-31'), v.id`,
      [baby.id],
    );
    const today = D.todayStr();
    const kw = args && args.name_contains ? String(args.name_contains) : '';
    return rows
      .filter((r) => !kw || r.name.includes(kw))
      .map((r) => {
        const v = decorate(r, today);
        return {
          疫苗: `${r.name} 第${r.dose_no}剂`,
          类别: { nepi: '免费', self: '自费', other: '自定义' }[r.category],
          状态: { done: `已接种 ${r.done_date || ''}`.trim(), skipped: '已跳过', pending: `待接种（计划 ${r.planned_date || '未排'}）` }[r.status],
          月龄: v.age_label || null,
          厂家: r.manufacturer || null,
          批号: r.batch_no || null,
          门诊: r.clinic || null,
          反应: r.reaction || null,
        };
      });
  },

  async get_growth_records(babyId, args) {
    const baby = await resolveBabyId(babyId, args);
    if (!baby.birth_date) return { 提示: '该宝宝没有出生日期，年龄列以日期为准' };
    const limit = Math.min(100, Math.max(1, Number(args && args.limit) || 30));
    const rows = await q(
      'SELECT * FROM growth_records WHERE baby_id = ? ORDER BY measured_on DESC, id DESC LIMIT ' + limit,
      [baby.id],
    );
    return rows.reverse().map((r) => ({
      日期: r.measured_on,
      日龄: D.diffDays(r.measured_on, baby.birth_date),
      月龄: D.formatAge(baby.birth_date, r.measured_on),
      体重kg: r.weight_kg != null ? Number(r.weight_kg) : null,
      身长cm: r.height_cm != null ? Number(r.height_cm) : null,
      头围cm: r.head_cm != null ? Number(r.head_cm) : null,
      备注: r.note || null,
    }));
  },

  async list_events(babyId, args) {
    const baby = await resolveBabyId(babyId, args);
    const rows = await q(
      'SELECT * FROM events WHERE baby_id = ? ORDER BY done ASC, event_date ASC LIMIT 30',
      [baby.id],
    );
    const today = D.todayStr();
    return rows.map((r) => ({
      事项: r.title,
      日期: r.event_date,
      距今: D.relativeLabel(r.event_date, today),
      类型: { checkup: '体检/复查', milestone: '里程碑', other: '其他' }[r.kind],
      已完成: !!r.done,
      备注: r.notes || null,
    }));
  },
};

/** 按启用的模块返回给模型的工具定义 */
function toolDefs(enabledModules) {
  const names = new Set();
  for (const m of enabledModules) {
    if (MODULES[m]) MODULES[m].tools.forEach((t) => names.add(t));
  }
  return [...names].filter((n) => DEFS[n]).map((n) => DEFS[n]);
}

async function runTool(name, babyId, argsJson) {
  const fn = EXECUTORS[name];
  if (!fn) return { error: `未知工具 ${name}` };
  let args = {};
  try { args = argsJson ? JSON.parse(argsJson) : {}; } catch { args = {}; }
  try {
    return { ok: true, data: await fn(babyId, args) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** 不支持 function-calling 的上游：直接把启用模块的数据快照塞进 system */
async function snapshot(enabledModules, babyId) {
  const parts = [];
  for (const m of enabledModules) {
    if (!MODULES[m]) continue;
    for (const t of MODULES[m].tools) {
      if (t === 'list_babies') continue;
      try {
        const data = await EXECUTORS[t](babyId, {});
        parts.push(`【${TOOL_LABELS[t]}】\n${JSON.stringify(data, null, 1)}`);
      } catch { /* 单块失败不影响 */ }
    }
  }
  return parts.join('\n\n');
}

module.exports = { MODULES, TOOL_LABELS, toolDefs, runTool, snapshot };
