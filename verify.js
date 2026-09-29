// 数据交叉引用校验脚本（Node 运行，无需浏览器）
// 用法: node verify.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const sandbox = { window: {}, console };
sandbox.window.DATA_QUESTIONS = { questions: [] };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// 题库文件动态发现：新增 data-questions-*.js 时无需手动维护列表
// 注意顺序：data-questions.js（主文件）必须先于扩展文件加载
const qFiles = fs.readdirSync(path.join(root, 'js'))
  .filter(f => /^data-questions.*\.js$/.test(f))
  .filter(f => f !== 'data-questions.js')
  .sort();

const files = [
  'data-exam.js', 'data-knowledge.js', 'data-questions.js'
].concat(qFiles).concat([
  'data-statutes.js', 'data-newlaws.js', 'data-subjective.js'
]).concat(
  fs.readdirSync(path.join(root, 'js')).filter(f => f.indexOf('patch-k-') === 0).sort()
);

for (const f of files) {
  const p = path.join(root, 'js', f);
  const code = fs.readFileSync(p, 'utf8');
  try { vm.runInContext(code, sandbox, { filename: f }); }
  catch (e) { console.log('!! 加载失败 ' + f + ': ' + e.message); }
}

const W = sandbox.window;
const nodes = (W.DATA_KNOWLEDGE && W.DATA_KNOWLEDGE.nodes) || [];
const qs = (W.DATA_QUESTIONS && W.DATA_QUESTIONS.questions) || [];
const statutes = (W.DATA_STATUTES && (W.DATA_STATUTES.statutes || W.DATA_STATUTES.list)) || [];

const nodeIds = new Set(nodes.map(n => n.id));
let err = 0, warn = 0;
const errList = [], warnList = [];

function E(m) { err++; errList.push(m); }
function Wn(m) { warn++; warnList.push(m); }

// ---- 1. 节点唯一性 ----
const seenNode = new Set();
nodes.forEach(n => {
  if (!n.id) E('节点缺 id: ' + JSON.stringify(n).slice(0, 80));
  if (seenNode.has(n.id)) E('节点 id 重复: ' + n.id);
  seenNode.add(n.id);
});

// ---- 2. 题目校验 ----
const seenQ = new Set();
const typeCount = {}, secCount = {}, srcCount = {}, tierCount = {};
let optionLetterTotal = 0;
qs.forEach((q, i) => {
  const tag = q.id || ('#' + i);
  if (!q.id) E('题目缺 id (索引 ' + i + ')');
  if (seenQ.has(q.id)) E('题目 id 重复: ' + q.id);
  seenQ.add(q.id);

  // 知识点引用
  if (q.k && !nodeIds.has(q.k)) E(tag + ' 知识点 ' + q.k + ' 不存在于节点表');

  // 选项（字符串数组）
  const opts = q.options || [];
  if (opts.length < 2) E(tag + ' 选项不足 2 个');
  optionLetterTotal += opts.length;
  const letters = opts.map((_, i) => String.fromCharCode(65 + i)); // A,B,C,D...
  if (opts.length > 4) Wn(tag + ' 选项超过 4 个（' + opts.length + '）');

  // 答案（字母数组或字符串）
  let ansArr = Array.isArray(q.answer) ? q.answer.map(x => String(x).toUpperCase())
              : String(q.answer || '').toUpperCase().replace(/[^A-D]/g, '').split('');
  ansArr = ansArr.filter(Boolean);
  if (!ansArr.length) E(tag + ' 缺答案');
  else {
    const bad = ansArr.filter(c => !letters.includes(c));
    if (bad.length) E(tag + ' 答案 ' + ansArr.join(',') + ' 不在选项 ' + letters.join('') + ' 范围内');
    const uniq = new Set(ansArr);
    if (uniq.size !== ansArr.length) E(tag + ' 答案含重复字母: ' + ansArr.join(','));
    if (q.type === '单选' && ansArr.length !== 1) E(tag + ' 单选答案不唯一: ' + ansArr.join(','));
    if (q.type === '多选' && ansArr.length < 2) Wn(tag + ' 多选答案仅 ' + ansArr.length + ' 个: ' + ansArr.join(','));
  }

  // 来源分级
  if (!q.srcLevel) E(tag + ' 缺 srcLevel（数据诚实性要求）');
  if (!('timeEffect' in q)) Wn(tag + ' 缺 timeEffect 字段');
  if (!q.stem || String(q.stem).length < 8) Wn(tag + ' 题干过短');
  if (!q.trap) Wn(tag + ' 缺 trap（命题陷阱）字段');
  if (!q.correctWhy) Wn(tag + ' 缺 correctWhy 解析');

  typeCount[q.type] = (typeCount[q.type] || 0) + 1;
  secCount[q.sec] = (secCount[q.sec] || 0) + 1;
  srcCount[q.srcLevel] = (srcCount[q.srcLevel] || 0) + 1;
});

// ---- 3. 节点覆盖 ----
const coveredNodes = new Set(qs.map(q => q.k).filter(Boolean));
const uncovered = nodes.filter(n => !coveredNodes.has(n.id)).map(n => n.id);
nodes.forEach(n => { tierCount[n.tier] = (tierCount[n.tier] || 0) + 1; });

// ---- 4. 法条引用 ----
const statuteNodes = new Set(statutes.map(s => s.node).filter(Boolean));
const badStatuteRefs = [];
statutes.forEach(s => {
  if (s.node && !nodeIds.has(s.node)) badStatuteRefs.push((s.id || s.title || '?') + ' -> ' + s.node);
});
badStatuteRefs.forEach(m => E('法条指向不存在的节点: ' + m));

// ---- 5. 考频统计口径 ----
// 与 state.js 的 REAL_SOURCES 保持一致：官方真题 + 机构整理 + 回忆版
// （2018 年后官方不再公布真题，市场流通的历年真题只可能是后两类）
const FREQ_SOURCES = ['官方真题', '机构整理', '回忆版'];
const freqEligible = qs.filter(q => FREQ_SOURCES.indexOf(q.srcLevel) > -1).length;

// ---- 6. A 层节点字段完整性 ----
const aNodes = nodes.filter(n => n.tier === 'A');
const incomplete = aNodes.filter(n => {
  return !(n.one && n.rule && n.why && n.exc && n.mem && n.sub && (n.cmp || []).length);
});
if (incomplete.length) Wn('A 层节点字段不完整(' + incomplete.length + '): ' + incomplete.map(n => n.id).join(', '));
const noTrap = aNodes.filter(n => !(n.tr || []).length);
if (noTrap.length) Wn('A 层节点缺 tr 陷阱(' + noTrap.length + '): ' + noTrap.map(n => n.id).join(', '));

// ---- 输出 ----
console.log('=========== 数据校验报告 ===========');
console.log('节点总数        : ' + nodes.length);
console.log('节点 tier 分布  : ' + JSON.stringify(tierCount));
console.log('题目总数        : ' + qs.length);
console.log('题目类型分布    : ' + JSON.stringify(typeCount));
console.log('来源分级分布    : ' + JSON.stringify(srcCount));
console.log('选项总数        : ' + optionLetterTotal);
console.log('法条总数        : ' + statutes.length);
console.log('可计考频的题目  : ' + freqEligible +
  (freqEligible === 0
    ? '  (→ 考频显示「尚未完成统计」，符合设计：宁可没有数字，也不给假数据)'
    : '  (考频统计已生效；若其中「官方真题」为 0，界面须显式标注数据来自回忆版)'));
console.log('被题目覆盖的节点: ' + coveredNodes.size + ' / ' + nodes.length);
console.log('未被覆盖的节点  : ' + uncovered.length + (uncovered.length ? ' → ' + uncovered.join(', ') : ''));
console.log('科目题量分布    : ' + JSON.stringify(secCount));
console.log('-----------------------------------');
console.log('错误 ' + err + ' 条');
errList.slice(0, 40).forEach(m => console.log('  [ERR ] ' + m));
if (errList.length > 40) console.log('  ... 其余 ' + (errList.length - 40) + ' 条省略');
console.log('警告 ' + warn + ' 条');
warnList.slice(0, 25).forEach(m => console.log('  [WARN] ' + m));
if (warnList.length > 25) console.log('  ... 其余 ' + (warnList.length - 25) + ' 条省略');
console.log('===================================');
process.exit(err > 0 ? 1 : 0);
