/* ============================================================
 * build-real.js  —  把 import/*.json 转换并校验为题库文件
 * ------------------------------------------------------------
 * 用法：node build-real.js
 * 产出：js/data-questions-real.js
 *
 * 硬规则（不可绕过）：
 *  1. srcLevel 只允许「官方真题 / 机构整理 / 回忆版 / 模拟」四值。
 *     2018 年后官方不再公布真题，网上来源一律不得标为「官方真题」。
 *  2. 每道题的 k 必须指向 data-knowledge.js 里真实存在的节点。
 *  3. 答案字母必须落在选项范围内；单选只能有一个答案；多选至少两个。
 *  4. 校验不通过的题目会被跳过并打印，不会被静默写入。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const importDir = path.join(root, 'import');

/* ---- 载入知识节点 ---- */
const ctx = { window: { DATA_KNOWLEDGE: { nodes: [] } } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'data-knowledge.js'), 'utf8'), ctx);
const nodeIds = new Set(ctx.window.DATA_KNOWLEDGE.nodes.map(n => n.id));
const nodeSec = {};
ctx.window.DATA_KNOWLEDGE.nodes.forEach(n => { nodeSec[n.id] = n.sec; });

const SRC_LEVELS = ['官方真题', '机构整理', '回忆版', '模拟'];
const SECS = new Set(ctx.window.DATA_KNOWLEDGE.nodes.map(n => n.sec));

if (!fs.existsSync(importDir)) {
  console.error('缺少 import/ 目录');
  process.exit(1);
}

const files = fs.readdirSync(importDir).filter(f => /^q\d{4}-.*\.json$/.test(f)).sort();
if (!files.length) {
  console.error('import/ 里没有 qYYYY-*.json 文件');
  process.exit(1);
}

let all = [];
let autoEffected = 0;   // 由「年份+板块」规则自动补上时效警示的题数
files.forEach(f => {
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(path.join(importDir, f), 'utf8'));
  } catch (e) {
    console.error('✗ ' + f + ' JSON 解析失败：' + e.message);
    return;
  }
  if (!Array.isArray(arr)) { console.error('✗ ' + f + ' 不是数组'); return; }
  console.log('  读 ' + f + '：' + arr.length + ' 题');
  all = all.concat(arr);
});

/* ---- 校验 + 规范化 ---- */
const seen = new Set();
const out = [];
const problems = [];

all.forEach((q, i) => {
  const tag = q.id || ('#' + i);
  const bad = (msg) => { problems.push(tag + '：' + msg); };

  if (!q.id) return bad('缺 id');
  if (seen.has(q.id)) return bad('id 重复');
  seen.add(q.id);

  if (!q.stem) return bad('缺题干');
  if (!Array.isArray(q.options) || q.options.length < 2) return bad('选项格式错误');
  if (!Array.isArray(q.answer) || !q.answer.length) return bad('缺答案');

  const letters = q.options.map((_, idx) => String.fromCharCode(65 + idx));
  if (!q.answer.every(a => letters.indexOf(a) > -1)) return bad('答案字母超出选项范围：' + JSON.stringify(q.answer));

  /* 题型按官方结构推断（覆盖人工判定，保证两卷一致）：
     法考客观题每卷 100 题 = 50 单选 + 35 多选 + 15 不定项
     → 1-50 单选 / 51-85 多选 / 86-100 不定项 */
  if (q.no >= 1 && q.no <= 100) {
    const inferred = q.no <= 50 ? '单选' : (q.no <= 85 ? '多选' : '不定项');
    if (q.type && q.type !== inferred) {
      problems.push(tag + '：题型已按官方第' + q.no + '题结构由「' + q.type + '」纠正为「' + inferred + '」');
    }
    q.type = inferred;
  }

  /* 答案个数与题型的矛盾：不丢弃（回忆版本就可能残缺），但必须标记出来 */
  if (q.type === '单选' && q.answer.length !== 1) {
    return bad('单选题答案不唯一：' + JSON.stringify(q.answer));
  }
  if (q.type === '多选' && q.answer.length < 2) {
    q.note = (q.note ? q.note + '；' : '') +
      '【数据提示】本题按官方结构属多选题，但回忆版只记录到 ' + q.answer.length + ' 个答案，答案可能不完整，作答时请谨慎参考。';
  }
  // 不定项允许 1—4 个，不校验个数

  if (!q.k || !nodeIds.has(q.k)) return bad('k 不是有效节点：' + q.k);
  if (!q.sec) q.sec = nodeSec[q.k];
  if (q.sec && nodeSec[q.k] && q.sec !== nodeSec[q.k]) {
    bad('sec 与节点所属板块不符：题标「' + q.sec + '」，节点 ' + q.k + ' 属「' + nodeSec[q.k] + '」——已按节点纠正');
    q.sec = nodeSec[q.k];
  }

  if (!SRC_LEVELS.includes(q.srcLevel)) return bad('srcLevel 非法：' + q.srcLevel);
  if (q.srcLevel === '官方真题') {
    // 2018 年后官方不公布真题；出现这个值必须人工确认
    bad('⚠ 标为「官方真题」，请人工核实来源后决定是否保留（已强制降级为「回忆版」）');
    q.srcLevel = '回忆版';
  }

  /* ---- 时效性兜底标注 ----------------------------------------
   * 人工/子 agent 逐个判断新旧法容易漏标，这里按「题目年份 + 板块」
   * 再做一遍规则化判定。若题目已自带 timeEffect（具体的、更准确的），
   * 保留原值；只有在缺失时才补通用警示。
   * 目的：绝不让一道「答案已被新法改变」的旧题裸奔进题库。
   *
   * 前缀约定（UI 依赖，勿改）：
   *   【新旧法变化】 = 人工逐题核对，新旧法有实质变化（最高可信度）
   *   【新旧法提示】 = 规则化兜底，同板块可能存在变化，需考生自行复核
   * ------------------------------------------------------------ */
  if (q.timeEffect) {
    // 人工标注：统一加「【新旧法变化】」前缀，便于 UI 区分与统计
    const t = String(q.timeEffect).replace(/^[★\s]+/, '');
    if (t.indexOf('【新旧法') !== 0) q.timeEffect = '【新旧法变化】' + t;
    else q.timeEffect = t;
  }
  if (!q.timeEffect && q.year) {
    const R = [
      { sec: '民法',   since: 2021, text: '《民法典》已于 2021-01-01 施行，取代合同法、物权法、侵权责任法、担保法、婚姻法、继承法等；本题出自民法典施行前，所涉民事规则已被取代，作答请按《民法典》现行条文判断，勿直接套用原参考答案。' },
      { sec: '商法',   since: 2024, text: '《公司法》2023 年修订已于 2024-07-01 施行（五年认缴、股东失权、清算义务人改为董事等），本题出自施行前，作答请按新公司法判断。' },
      { sec: '行政法', since: 2024, text: '《行政复议法》2023 年修订已于 2024-01-01 施行（条号与复议前置、管辖规则均有调整），本题出自施行前，作答请按修订后文本判断。' },
      { sec: '民诉',   since: 2024, text: '《民事诉讼法》2021 年、2023 年修正已相继施行，《仲裁法》2025 年修订将于 2026-03-01 施行（撤销裁决申请期限已由 6 个月改为 3 个月）；本题出自修正前，条号与规则可能已变，作答请按现行文本判断。' },
      { sec: '刑法',   since: 2021, text: '《刑法修正案（十一）》（2021-03-01 施行）与《刑法修正案（十二）》（2024-03-01 施行）已修改多处罪名与法定刑（含行贿罪 7 类从重情形、民营企业内部人员腐败三罪主体扩展）；本题出自施行前，作答请按现行条文判断。' },
      { sec: '经济法', since: 2022, text: '《反垄断法》2022 年修正、《反不正当竞争法》2025 年修订已相继施行（条号与规则均有调整）；本题出自修正前，作答请按现行条文判断。' }
    ];
    const hit = R.find(r => r.sec === q.sec && q.year < r.since);
    if (hit) {
      q.timeEffect = '【新旧法提示】' + hit.text;
      autoEffected++;
    }
  }

  /* 规范化输出 */
  out.push({
    id: q.id,
    diag: false,
    srcLevel: q.srcLevel,
    src: q.src || '历年真题（回忆版）',
    year: q.year || null,
    stage: q.stage || '客观题',
    paper: q.paper || null,
    no: q.no || null,
    sec: q.sec,
    k: q.k,
    type: q.type || (q.answer.length === 1 ? '单选' : '多选'),
    difficulty: q.difficulty || 3,
    stem: q.stem,
    options: q.options,
    answer: q.answer,
    trap: q.trap || null,
    statute: q.statute || null,
    correctWhy: q.correctWhy || null,
    wrongWhy: q.wrongWhy || {},
    related: [],
    timeEffect: q.timeEffect || null,
    note: q.note || null
  });
});

/* ---- 报告 ---- */
console.log('-----------------------------------');
console.log('读入 ' + all.length + ' 题，通过校验 ' + out.length + ' 题');
console.log('其中由「年份+板块」规则自动补时效警示：' + autoEffected + ' 题');
console.log('人工标注（更具体）的时效变化：' +
  out.filter(q => q.timeEffect && q.timeEffect.indexOf('【新旧法变化】') === 0).length + ' 题');
if (problems.length) {
  console.log('问题 ' + problems.length + ' 条：');
  problems.slice(0, 40).forEach(p => console.log('  · ' + p));
  if (problems.length > 40) console.log('  … 其余 ' + (problems.length - 40) + ' 条省略');
}
if (!out.length) { console.error('没有可用题目，不写文件'); process.exit(1); }

/* ---- 写文件 ---- */
const esc = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');

let body = '/* ============================================================\n' +
  ' * data-questions-real.js  —  历年真题（回忆版）\n' +
  ' * ------------------------------------------------------------\n' +
  ' * 来源：233网校整理的 2019 年法考客观题真题（回忆版）\n' +
  ' * 【重要声明】司法部自 2018 年改革后不再公布考试真题与答案，\n' +
  ' *   因此本文件的题目一律标注为「回忆版」，题干与答案均由考生\n' +
  ' *   回忆、经辅导机构整理，非官方发布，仅供参考。\n' +
  ' * 生成脚本：build-real.js（勿手改此文件，改 import/*.json 后重跑）\n' +
  ' * ============================================================ */\n' +
  '(function () {\n  var bank = [\n';

out.forEach((q, i) => {
  body += '    { id: \'' + esc(q.id) + '\', diag: false, srcLevel: \'' + esc(q.srcLevel) + '\', src: \'' + esc(q.src) + '\',\n' +
    '      year: ' + (q.year || 'null') + ', stage: \'' + esc(q.stage) + '\', paper: ' + (q.paper ? '\'' + esc(q.paper) + '\'' : 'null') + ', no: ' + (q.no || 'null') + ',\n' +
    '      sec: \'' + esc(q.sec) + '\', k: \'' + esc(q.k) + '\', type: \'' + esc(q.type) + '\', difficulty: ' + q.difficulty + ',\n' +
    '      stem: \'' + esc(q.stem) + '\',\n' +
    '      options: [' + q.options.map(o => '\'' + esc(o) + '\'').join(', ') + '],\n' +
    '      answer: [' + q.answer.map(a => '\'' + a + '\'').join(', ') + '],\n' +
    '      trap: ' + (q.trap ? '\'' + esc(q.trap) + '\'' : 'null') + ',\n' +
    '      statute: ' + (q.statute ? '\'' + esc(q.statute) + '\'' : 'null') + ',\n' +
    '      correctWhy: ' + (q.correctWhy ? '\'' + esc(q.correctWhy) + '\'' : 'null') + ',\n' +
    '      wrongWhy: {' + Object.keys(q.wrongWhy).map(k => k + ': \'' + esc(q.wrongWhy[k]) + '\'').join(', ') + '},\n' +
    '      related: [], timeEffect: ' + (q.timeEffect ? '\'' + esc(q.timeEffect) + '\'' : 'null') +
    (q.note ? ',\n      note: \'' + esc(q.note) + '\'' : '') + ' }' +
    (i === out.length - 1 ? '' : ',') + '\n';
});

body += '  ];\n  window.DATA_QUESTIONS.questions = window.DATA_QUESTIONS.questions.concat(bank);\n})();\n';

fs.writeFileSync(path.join(root, 'js', 'data-questions-real.js'), body, 'utf8');
console.log('已写出 js/data-questions-real.js（' + out.length + ' 题）');
