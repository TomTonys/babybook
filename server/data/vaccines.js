'use strict';
/**
 * 疫苗程序种子数据
 * - nepi：国家免疫规划疫苗（《国家免疫规划疫苗儿童免疫程序及说明（2021 年版）》11 种 22 剂）
 * - self：常见自费疫苗，默认不在接种表里生成，用户可在「疫苗」页一键启用
 * 调整程序时直接改这里，重启后会自动同步（按 code + dose_no upsert）。
 */

const NEPI = [
  { code: 'hepb', name: '乙肝疫苗', dose_no: 1, age_months: 0, age_label: '出生后 24 小时内', notes: '出生后尽早接种第 1 剂，母亲 HBsAg 阳性者需加注乙肝免疫球蛋白' },
  { code: 'bcg', name: '卡介苗', dose_no: 1, age_months: 0, age_label: '出生时', notes: '出生后尽早接种，早产/低体重儿遵医嘱' },
  { code: 'hepb', name: '乙肝疫苗', dose_no: 2, age_months: 1, age_label: '1 月龄', notes: '' },
  { code: 'ipv', name: '脊灰灭活疫苗（IPV）', dose_no: 1, age_months: 2, age_label: '2 月龄', notes: '第 1、2 剂用 IPV' },
  { code: 'ipv', name: '脊灰灭活疫苗（IPV）', dose_no: 2, age_months: 3, age_label: '3 月龄', notes: '' },
  { code: 'dtap', name: '百白破疫苗', dose_no: 1, age_months: 3, age_label: '3 月龄', notes: '' },
  { code: 'bopv', name: '脊灰减毒活疫苗（bOPV）', dose_no: 1, age_months: 4, age_label: '4 月龄', notes: '第 3、4 剂用 bOPV' },
  { code: 'dtap', name: '百白破疫苗', dose_no: 2, age_months: 4, age_label: '4 月龄', notes: '' },
  { code: 'dtap', name: '百白破疫苗', dose_no: 3, age_months: 5, age_label: '5 月龄', notes: '' },
  { code: 'hepb', name: '乙肝疫苗', dose_no: 3, age_months: 6, age_label: '6 月龄', notes: '' },
  { code: 'mpsv_a', name: 'A 群流脑多糖疫苗', dose_no: 1, age_months: 6, age_label: '6 月龄', notes: '' },
  { code: 'mmr', name: '麻腮风疫苗', dose_no: 1, age_months: 8, age_label: '8 月龄', notes: '' },
  { code: 'jev', name: '乙脑减毒活疫苗', dose_no: 1, age_months: 8, age_label: '8 月龄', notes: '' },
  { code: 'mpsv_a', name: 'A 群流脑多糖疫苗', dose_no: 2, age_months: 9, age_label: '9 月龄', notes: '与第 1 剂间隔不少于 3 个月' },
  { code: 'dtap', name: '百白破疫苗', dose_no: 4, age_months: 18, age_label: '18 月龄', notes: '' },
  { code: 'mmr', name: '麻腮风疫苗', dose_no: 2, age_months: 18, age_label: '18 月龄', notes: '' },
  { code: 'hepa', name: '甲肝减毒活疫苗', dose_no: 1, age_months: 18, age_label: '18 月龄', notes: '' },
  { code: 'jev', name: '乙脑减毒活疫苗', dose_no: 2, age_months: 24, age_label: '2 周岁', notes: '' },
  { code: 'mpsv_ac', name: 'A 群 C 群流脑多糖疫苗', dose_no: 1, age_months: 36, age_label: '3 周岁', notes: '与 A 群第 2 剂间隔不少于 12 个月' },
  { code: 'bopv', name: '脊灰减毒活疫苗（bOPV）', dose_no: 2, age_months: 48, age_label: '4 周岁', notes: '' },
  { code: 'dt', name: '白破疫苗', dose_no: 1, age_months: 72, age_label: '6 周岁', notes: '' },
  { code: 'mpsv_ac', name: 'A 群 C 群流脑多糖疫苗', dose_no: 2, age_months: 72, age_label: '6 周岁', notes: '' },
];

const SELF = [
  { code: 'pcv13', name: '13 价肺炎球菌结合疫苗', dose_no: 1, age_months: 2, age_label: '2 月龄', notes: '自费，基础免疫 3 剂 + 加强 1 剂' },
  { code: 'pcv13', name: '13 价肺炎球菌结合疫苗', dose_no: 2, age_months: 4, age_label: '4 月龄', notes: '' },
  { code: 'pcv13', name: '13 价肺炎球菌结合疫苗', dose_no: 3, age_months: 6, age_label: '6 月龄', notes: '' },
  { code: 'pcv13', name: '13 价肺炎球菌结合疫苗', dose_no: 4, age_months: 12, age_label: '12 月龄', notes: '加强剂' },
  { code: 'rv5', name: '五价轮状病毒疫苗', dose_no: 1, age_months: 2, age_label: '2 月龄', notes: '自费，口服，首剂 6~12 周龄' },
  { code: 'rv5', name: '五价轮状病毒疫苗', dose_no: 2, age_months: 3, age_label: '3 月龄', notes: '' },
  { code: 'rv5', name: '五价轮状病毒疫苗', dose_no: 3, age_months: 4, age_label: '4 月龄', notes: '' },
  { code: 'hib', name: 'b 型流感嗜血杆菌疫苗', dose_no: 1, age_months: 2, age_label: '2 月龄', notes: '自费，可用五联疫苗替代' },
  { code: 'hib', name: 'b 型流感嗜血杆菌疫苗', dose_no: 2, age_months: 3, age_label: '3 月龄', notes: '' },
  { code: 'hib', name: 'b 型流感嗜血杆菌疫苗', dose_no: 3, age_months: 4, age_label: '4 月龄', notes: '' },
  { code: 'hib', name: 'b 型流感嗜血杆菌疫苗', dose_no: 4, age_months: 18, age_label: '18 月龄', notes: '' },
  { code: 'ev71', name: '肠道病毒 71 型灭活疫苗', dose_no: 1, age_months: 6, age_label: '6 月龄', notes: '自费，预防手足口病重症' },
  { code: 'ev71', name: '肠道病毒 71 型灭活疫苗', dose_no: 2, age_months: 7, age_label: '7 月龄', notes: '与第 1 剂间隔 1 个月' },
  { code: 'var', name: '水痘减毒活疫苗', dose_no: 1, age_months: 12, age_label: '12 月龄', notes: '自费，部分地区已纳入免费' },
  { code: 'var', name: '水痘减毒活疫苗', dose_no: 2, age_months: 48, age_label: '4 周岁', notes: '' },
  { code: 'flu', name: '流感疫苗', dose_no: 1, age_months: 6, age_label: '6 月龄起', notes: '自费，每年接种一次；首次接种需 2 剂' },
  { code: 'hpv', name: '双价 HPV 疫苗', dose_no: 1, age_months: 156, age_label: '13 周岁', notes: '自费；部分地区对 13 岁女孩免费接种' },
];

function buildSeed() {
  const rows = [];
  let order = 0;
  for (const v of NEPI) rows.push({ ...v, category: 'nepi', sort_order: order++ });
  for (const v of SELF) rows.push({ ...v, category: 'self', sort_order: order++ });
  return rows;
}

module.exports = { buildSeed, NEPI, SELF };
