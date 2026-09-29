/* ============================================================
 * state.js  —  核心引擎
 *  1. 状态与持久化（localStorage）
 *  2. 掌握度模型（含遗忘衰减）
 *  3. 间隔重复（SRS）
 *  4. 优先级算法
 *  5. 考频统计（仅统计真题来源）
 *  6. 学习数据与周报
 *  7. 导入 / 导出
 * ============================================================ */

(function () {
  'use strict';

  var STORAGE_KEY = 'fakao2026.system.v1';

  /* ---------------- 日期工具 ---------------- */
  function todayStr(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  function nowStr(d) {
    d = d || new Date();
    var h = d.getHours(), mi = d.getMinutes();
    return todayStr(d) + ' ' + (h < 10 ? '0' + h : h) + ':' + (mi < 10 ? '0' + mi : mi);
  }
  function parseDate(s) {
    if (!s) return null;
    var p = String(s).slice(0, 10).split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }
  function daysBetween(a, b) {
    var d1 = parseDate(a), d2 = parseDate(b);
    if (!d1 || !d2) return 0;
    return Math.round((d2 - d1) / 86400000);
  }
  function addDays(s, n) {
    var d = parseDate(s);
    d.setDate(d.getDate() + n);
    return todayStr(d);
  }

  /* ---------------- 默认状态 ---------------- */
  function defaultState() {
    return {
      version: 1,
      createdAt: todayStr(),
      profile: {
        nickname: '姐姐',
        dailyMinutes: 240,
        track: 'objective2027',   // 'objective2027' | 'subjective2026'（2026 年度已结束）
        baseLevel: null,           // 诊断后写入：零基础 / 基础薄弱 / 中等 / 较强
        diagDone: false,
        diagResult: null,
        objective2026Passed: null  // 用户自填：2026 客观题是否通过
      },
      nodes: {},       // nodeId -> { mastery, attempts, correct, wrongCount, lastReview, srsStage, nextDue, manual }
      wrong: [],       // 错题本
      logs: [],        // 每日日志 { date, minutes, qCount, qCorrect, newWrong, tasksDone, weakest, plan }
      sessions: [],    // 答题明细 { ts, qid, nodeId, correct, mode, ms }
      streak: { last: null, days: 0 },
      taskCache: { date: null, list: [] },
      examRecords: [], // 模拟考试记录
      readNodes: [],   // 已学习（展开讲解）的节点
      subjAnswers: {}, // 主观题作答 { caseId: { text, checked, at, history[] } }
      customQuestions: [],
      settings: { showDataLevel: true, theme: 'dark' }
    };
  }

  var state = null;

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        state = Object.assign(defaultState(), parsed);
        state.profile = Object.assign(defaultState().profile, parsed.profile || {});
        state.settings = Object.assign(defaultState().settings, parsed.settings || {});
        return state;
      }
    } catch (e) {
      console.warn('读取本地记录失败，已重置为新档案。', e);
    }
    state = defaultState();
    return state;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('保存失败', e);
      return false;
    }
  }

  function reset() {
    state = defaultState();
    save();
  }

  /* ---------------- 节点状态 ---------------- */
  function nodeState(id) {
    if (!state.nodes[id]) {
      state.nodes[id] = {
        mastery: 0, attempts: 0, correct: 0, wrongCount: 0,
        lastReview: null, srsStage: 0, nextDue: null, manual: null
      };
    }
    return state.nodes[id];
  }

  /* 遗忘衰减：按星级决定半衰速度（高频考点复习更密，衰减略快以触发复习） */
  function decayRate(star) {
    return 0.010 + (star || 3) * 0.0025; // 1.25% ~ 2.25% / 天
  }

  function effectiveMastery(id) {
    var ns = state.nodes[id];
    if (!ns || ns.attempts === 0) return null;
    var node = Data.findNode(id);
    var star = node ? node.star : 3;
    if (!ns.lastReview) return ns.mastery;
    var days = Math.max(0, daysBetween(ns.lastReview, todayStr()));
    var eff = ns.mastery * Math.pow(1 - decayRate(star), days);
    return Math.max(0, Math.round(eff));
  }

  function masteryLabel(m) {
    if (m === null || m === undefined) return { text: '未采集', cls: 'm-none' };
    if (m >= 85) return { text: '牢固掌握', cls: 'm-great' };
    if (m >= 70) return { text: '基本掌握', cls: 'm-good' };
    if (m >= 50) return { text: '初步掌握', cls: 'm-mid' };
    if (m >= 30) return { text: '薄弱', cls: 'm-weak' };
    return { text: '危险', cls: 'm-bad' };
  }

  /* ---------------- 答题记录 ---------------- */
  function recordAnswer(q, chosen, mode) {
    var correct = Data.isCorrect(q, chosen);
    var ns = nodeState(q.k);
    var before = ns.mastery;

    ns.attempts++;
    if (correct) {
      ns.correct++;
      ns.mastery = Math.round(ns.mastery + (100 - ns.mastery) * 0.28);
      ns.srsStage = Math.min(ns.srsStage + 1, SRS_STAGES.length - 1);
    } else {
      ns.wrongCount++;
      ns.mastery = Math.round(ns.mastery * 0.62);
      ns.srsStage = 0;
    }
    ns.mastery = Math.max(0, Math.min(100, ns.mastery));
    ns.lastReview = todayStr();
    ns.nextDue = addDays(todayStr(), SRS_STAGES[ns.srsStage]);

    // 错题本
    if (!correct) {
      var existed = state.wrong.filter(function (w) { return w.qid === q.id; })[0];
      if (existed) {
        existed.times++;
        existed.lastDate = todayStr();
        existed.lastReview = todayStr();
        existed.myAnswer = chosen;
        existed.stage = 0;
        existed.nextDue = addDays(todayStr(), SRS_STAGES[0]);
      } else {
        state.wrong.push({
          qid: q.id, nodeId: q.k, sec: q.sec,
          date: todayStr(), lastDate: todayStr(), lastReview: todayStr(),
          myAnswer: chosen, correctAnswer: q.answer, times: 1,
          reason: '', stage: 0, nextDue: addDays(todayStr(), SRS_STAGES[0])
        });
      }
    }

    // 会话明细
    state.sessions.push({ ts: Date.now(), qid: q.id, nodeId: q.k, correct: correct ? 1 : 0, mode: mode || 'train' });

    // 每日日志
    var log = todayLog();
    log.qCount++;
    if (correct) log.qCorrect++;

    touchStreak();
    save();
    return { correct: correct, masteryBefore: before, masteryAfter: ns.mastery };
  }

  function setWrongReason(qid, reason) {
    var w = state.wrong.filter(function (x) { return x.qid === qid; })[0];
    if (w) { w.reason = reason; save(); }
  }

  function markWrongReviewed(qid, correct) {
    var w = state.wrong.filter(function (x) { return x.qid === qid; })[0];
    if (!w) return;
    w.lastReview = todayStr();
    if (correct) {
      w.stage = Math.min(w.stage + 1, SRS_STAGES.length - 1);
      if (w.stage >= SRS_STAGES.length - 1 && w.times >= 3) w.mastered = true;
    } else {
      w.stage = 0;
      w.times++;
    }
    w.nextDue = addDays(todayStr(), SRS_STAGES[w.stage]);
    save();
  }

  function dueWrongQuestions() {
    var t = todayStr();
    return state.wrong.filter(function (w) {
      return !w.mastered && (!w.nextDue || daysBetween(t, w.nextDue) <= 0);
    });
  }

  function markNodeRead(id) {
    if (state.readNodes.indexOf(id) === -1) {
      state.readNodes.push(id);
      save();
    }
  }

  /* ---------------- 主观题作答记录 ---------------- */
  function getSubjAnswer(caseId) {
    if (!state.subjAnswers) state.subjAnswers = {};
    return state.subjAnswers[caseId] || null;
  }
  /* 保存作答：上一次的作答会推入 history（最多保留 5 次），用于对比进步 */
  function saveSubjAnswer(caseId, text, checked) {
    if (!state.subjAnswers) state.subjAnswers = {};
    var prev = state.subjAnswers[caseId];
    var history = (prev && prev.history) ? prev.history.slice(-4) : [];
    if (prev && (prev.text || (prev.checked || []).length)) {
      history.push({ text: prev.text || '', checked: (prev.checked || []).slice(), at: prev.at });
    }
    var rec = {
      text: text || '',
      checked: (checked || []).slice().sort(function (a, b) { return a - b; }),
      at: nowStr(),
      history: history
    };
    state.subjAnswers[caseId] = rec;
    save();
    return rec;
  }
  /* 主观题作答总览：用于学习数据页展示 */
  function subjSummary() {
    var m = state.subjAnswers || {};
    var ids = Object.keys(m);
    var done = ids.filter(function (k) { return (m[k].text || '').trim().length > 0; });
    return { total: ids.length, written: done.length, map: m };
  }

  /* ---------------- 间隔重复 ---------------- */
  var SRS_STAGES = [0, 1, 3, 7, 14, 30];

  /* ---------------- 每日日志 ---------------- */
  function todayLog() {
    var t = todayStr();
    var log = state.logs.filter(function (l) { return l.date === t; })[0];
    if (!log) {
      log = { date: t, minutes: 0, qCount: 0, qCorrect: 0, newWrong: 0, tasksDone: [], tasks: [] };
      state.logs.push(log);
    }
    return log;
  }

  function addMinutes(m) {
    var log = todayLog();
    log.minutes += m;
    save();
  }

  function touchStreak() {
    var t = todayStr();
    if (state.streak.last === t) return;
    if (state.streak.last && daysBetween(state.streak.last, t) === 1) {
      state.streak.days++;
    } else if (state.streak.last && daysBetween(state.streak.last, t) > 1) {
      state.streak.days = 1;
    } else {
      state.streak.days = 1;
    }
    state.streak.last = t;
  }

  /* ---------------- 优先级算法 ---------------- */
  function priorityOf(id) {
    var node = Data.findNode(id);
    if (!node) return 0;
    var ns = state.nodes[id];
    var eff = ns && ns.attempts > 0 ? effectiveMastery(id) : 0;
    var starW = (node.star || 3) / 5;                       // 考试重要度
    var secW = Data.sectionWeight(node.sec);                // 板块权重
    var gap = (100 - eff) / 100;                            // 掌握度缺口
    var due = 1;
    if (ns && ns.nextDue) {
      var d = daysBetween(todayStr(), ns.nextDue);
      if (d <= 0) due = 1.6;                                 // 已到复习期
      else due = 1 / (1 + d * 0.18);
    } else if (!ns || ns.attempts === 0) {
      due = 1.15;                                            // 完全未接触，略微加权
    }
    var subjW = node.subj === '高' ? 1.15 : (node.subj === '中' ? 1.05 : 1);
    return starW * secW * gap * due * subjW * 100;
  }

  function topPriorityNodes(n, opts) {
    opts = opts || {};
    var list = Data.KNOWLEDGE.nodes.map(function (node) {
      return { id: node.id, node: node, p: priorityOf(node.id) };
    });
    if (opts.sec) list = list.filter(function (x) { return x.node.sec === opts.sec; });
    if (opts.coreOnly) list = list.filter(function (x) { return x.node.core; });
    list.sort(function (a, b) { return b.p - a.p; });
    return list.slice(0, n || 6);
  }

  /* 遗忘预警 */
  function forgettingAlerts() {
    var out = [];
    Data.KNOWLEDGE.nodes.forEach(function (node) {
      if (node.star < 4) return;
      var ns = state.nodes[node.id];
      if (!ns || !ns.attempts || !ns.lastReview) return;
      var days = daysBetween(ns.lastReview, todayStr());
      if (days < 7) return;
      var eff = effectiveMastery(node.id);
      if (eff === null) return;
      if (eff < ns.mastery * 0.85) {
        out.push({ node: node, days: days, from: ns.mastery, to: eff });
      }
    });
    out.sort(function (a, b) { return (a.to / (a.from || 1)) - (b.to / (b.from || 1)); });
    return out.slice(0, 8);
  }

  /* ---------------- 考频统计（只统计真题来源） ----------------
   * 【为什么把「回忆版」也算进来】
   * 2018 年改革后司法部不再公布真题与答案，市场流通的历年真题
   * 只可能是「回忆版」或「机构整理版」，不可能有「官方真题」。
   * 若把回忆版排除在考频之外，考频统计永远出不来数字，功能等于废弃。
   * 因此：回忆版计入考频，但界面必须显式标注来源（见 app.js 的 freqLabel），
   * 且 frequencyStats 返回 recallOnly 供界面提示「本数据非官方」。
   * 原则：可以用它看考点分布，但绝不许让用户误以为这是官方数据。
   * ------------------------------------------------------------ */
  var REAL_SOURCES = ['官方真题', '机构整理', '回忆版'];

  function frequencyStats() {
    var byNode = {};
    var realCount = 0, simCount = 0, recallCount = 0, instCount = 0, offCount = 0;
    Data.QUESTIONS.questions.forEach(function (q) {
      if (q.srcLevel === '官方真题') offCount++;
      else if (q.srcLevel === '机构整理') instCount++;
      else if (q.srcLevel === '回忆版') recallCount++;
      else simCount++;
      if (REAL_SOURCES.indexOf(q.srcLevel) === -1) return;
      realCount++;
      var y = q.year || 0;
      if (!byNode[q.k]) byNode[q.k] = { total: 0, y3: 0, y5: 0, y8: 0, y10: 0, direct: 0, indirect: 0 };
      var b = byNode[q.k];
      b.total++;
      if (y) {
        var cur = new Date().getFullYear();
        if (cur - y <= 3) b.y3++;
        if (cur - y <= 5) b.y5++;
        if (cur - y <= 8) b.y8++;
        if (cur - y <= 10) b.y10++;
      }
      if (q.examMode === '综合案例') b.indirect++; else b.direct++;
    });
    return {
      byNode: byNode, realCount: realCount,
      counts: { off: offCount, inst: instCount, recall: recallCount, sim: simCount },
      hasReal: realCount > 0,
      /* 是否「只有回忆版」——即完全没有官方真题与机构整理版 */
      recallOnly: offCount === 0 && instCount === 0 && recallCount > 0
    };
  }

  function freqText(nodeId) {
    var st = frequencyStats();
    if (!st.hasReal) return null;
    return st.byNode[nodeId] || null;
  }

  /* ---------------- 统计汇总 ---------------- */
  function summary() {
    var nodes = Data.KNOWLEDGE.nodes;
    var touched = nodes.filter(function (n) { return state.nodes[n.id] && state.nodes[n.id].attempts > 0; });
    var masterySum = 0, masteryCnt = 0;
    var bySec = {};
    Data.KNOWLEDGE.sections.forEach(function (s) { bySec[s.key] = { sum: 0, cnt: 0, touched: 0, total: 0 }; });
    nodes.forEach(function (n) {
      var ns = state.nodes[n.id];
      var sec = bySec[n.sec] || (bySec[n.sec] = { sum: 0, cnt: 0, touched: 0, total: 0 });
      sec.total++;
      if (ns && ns.attempts > 0) {
        var eff = effectiveMastery(n.id);
        masterySum += eff; masteryCnt++;
        sec.sum += eff; sec.cnt++; sec.touched++;
      }
    });
    var totalQ = 0, totalCorrect = 0;
    state.logs.forEach(function (l) { totalQ += l.qCount; totalCorrect += l.qCorrect; });
    var totalMin = state.logs.reduce(function (a, l) { return a + (l.minutes || 0); }, 0);
    var last7 = state.logs.filter(function (l) { return daysBetween(l.date, todayStr()) < 7; });
    var q7 = last7.reduce(function (a, l) { return a + l.qCount; }, 0);
    var c7 = last7.reduce(function (a, l) { return a + l.qCorrect; }, 0);
    return {
      coverage: Math.round(touched.length / nodes.length * 100),
      mastery: masteryCnt ? Math.round(masterySum / masteryCnt) : 0,
      masteryCount: masteryCnt,
      bySec: bySec,
      totalQ: totalQ,
      totalCorrect: totalCorrect,
      totalMinutes: totalMin,
      acc7: q7 ? Math.round(c7 / q7 * 100) : null,
      q7: q7,
      wrongActive: state.wrong.filter(function (w) { return !w.mastered; }).length,
      wrongTotal: state.wrong.length,
      streak: state.streak.days,
      readCount: state.readNodes.length
    };
  }

  /* 考试阶段判定 */
  function examInfo() {
    var ex = Data.EXAM;
    var t = todayStr();
    var subjDate = ex.subjective.dateISO.slice(0, 10);
    var dSubj = daysBetween(t, subjDate);
    var track = state.profile.track;

    var out = {
      track: track,
      subjDate: subjDate,
      daysToSubj: dSubj,
      objStatus: '2026 年客观题已于 ' + ex.objective.examDates + ' 举行，成绩 ' + ex.objective.resultDate + ' 公布，全国统一合格线 ' + ex.objective.passLine + ' 分。',
      phase: null,
      phaseDesc: '',
      focus: [],
      nextAction: ''
    };

    if (track === 'subjective2026') {
      if (dSubj < 0) {
        out.phase = '2026 主观题已结束';
        out.phaseDesc = '2026 年主观题考试（' + subjDate + '）已结束。建议切换到 2027 考试年度规划。';
      } else if (dSubj <= 7) {
        out.phase = '考前阶段（主观题）';
        out.phaseDesc = ex.phases[4].desc;
      } else if (dSubj <= 30) {
        out.phase = '主观题冲刺阶段';
        out.phaseDesc = '主观题专项训练：案例拆解、争点提取、踩点得分、规范表达、时间分配。不再大规模学习新知识。';
      } else {
        out.phase = '主观题专项阶段';
        out.phaseDesc = ex.phases[5].desc;
      }
      out.focus = ['主观题四段式答题框架', '案例拆解五步法', '高频板块（刑法/民法/刑诉/民诉/行政法/商法）', '新法（公司法/行政复议法/仲裁法/婚姻家庭编解释二/治安管理处罚法）', '论述题（习近平法治思想）'];
    } else {
      /* ---- 2027 备考年度：以客观题为主轴，主观题在客观题结束后接续 ---- */
      var objISO = (ex.next.objective2027 && ex.next.objective2027.dateISO) || '2027-09-12T09:00:00+08:00';
      var subjISO = (ex.next.subjective2027 && ex.next.subjective2027.dateISO) || '2027-10-17T09:00:00+08:00';
      var dObj = daysBetween(t, objISO.slice(0, 10));
      var dSub2 = daysBetween(t, subjISO.slice(0, 10));
      out.objDate = objISO.slice(0, 10);
      out.daysToObj = dObj;
      out.daysToSubj = dSub2;
      out.objGuess = ex.next.objective2027.guess;
      out.subjGuess = ex.next.subjective2027.guess;
      out.confidence = ex.next.objective2027.confidence;

      var ph = ex.phases.filter(function (p) { return dObj >= p.minDays; });
      out.phase = ph.length ? ph[0].name : '考前阶段';
      out.phaseDesc = ph.length ? ph[0].desc : '';

      if (dObj > 150) {
        out.focus = [
          '建立知识框架：刑法、民法两大主力板块先啃',
          '理解而非记忆：把规则背后的原理弄懂',
          '客观题三大题型（单选/多选/不定项）答题技巧',
          '新法体系性学习（公司法/行政复议法/仲裁法/治安管理处罚法）',
          '每周一次全科小测，建立错题本'
        ];
        out.nextAction = '当前最重要的是「把知识体系过一遍」，不要急着刷题海。';
      } else if (dObj > 90) {
        out.focus = [
          '高频考点强化：星级 ★★★★★ 的知识点逐个攻破',
          '辨析能力训练：相似概念对比（撤销 vs 无效、解除 vs 撤销）',
          '真题化训练：按知识点集中做题，研究命题陷阱',
          '错题本定期回顾，薄弱板块加量',
          '主观题表达模板开始积累'
        ];
        out.nextAction = '进入强化阶段，开始以题带点。';
      } else if (dObj > 45) {
        out.focus = [
          '真题阶段：以题目为主线复盘知识点',
          '命题陷阱专项：主体偷换、时间节点、程序顺序、一般与例外',
          '法条定位速度训练',
          '全科组卷模拟，训练答题节奏',
          '主观题案例拆解训练'
        ];
        out.nextAction = '进入真题阶段，重点转向命题角度。';
      } else if (dObj > 30) {
        out.focus = ['高频知识压缩复习', '错题反复滚动', '新法重点', '程序时间节点', '模拟考试节奏'];
        out.nextAction = '进入冲刺阶段，低频知识降低权重。';
      } else {
        out.focus = ['高频考点', '错题', '新法', '速记', '模拟考试'];
        out.nextAction = '考前阶段，不再大规模学新知识。';
      }
    }
    return out;
  }

  /* ---------------- 周报 ---------------- */
  function weeklyReport() {
    var t = todayStr();
    var logs = state.logs.filter(function (l) { return daysBetween(l.date, t) < 7; });
    var q = 0, c = 0, min = 0;
    logs.forEach(function (l) { q += l.qCount; c += l.qCorrect; min += l.minutes || 0; });
    var prevLogs = state.logs.filter(function (l) {
      var d = daysBetween(l.date, t);
      return d >= 7 && d < 14;
    });
    var pq = 0, pc = 0;
    prevLogs.forEach(function (l) { pq += l.qCount; pc += l.qCorrect; });
    var wrongNew = state.wrong.filter(function (w) { return daysBetween(w.date, t) < 7; }).length;
    var bySec = {};
    state.sessions.filter(function (s) { return daysBetween(todayStr(new Date(s.ts)), t) < 7; })
      .forEach(function (s) {
        var n = Data.findNode(s.nodeId); if (!n) return;
        if (!bySec[n.sec]) bySec[n.sec] = { q: 0, c: 0 };
        bySec[n.sec].q++; if (s.correct) bySec[n.sec].c++;
      });
    return {
      minutes: min, q: q, correct: c,
      acc: q ? Math.round(c / q * 100) : null,
      prevAcc: pq ? Math.round(pc / pq * 100) : null,
      newWrong: wrongNew,
      bySec: bySec,
      activeDays: logs.filter(function (l) { return l.qCount > 0; }).length
    };
  }

  /* ---------------- 导入 / 导出 ---------------- */
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }
  function importJSON(text) {
    var obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object') throw new Error('数据格式不正确');
    state = Object.assign(defaultState(), obj);
    state.profile = Object.assign(defaultState().profile, obj.profile || {});
    save();
    return true;
  }
  function addCustomQuestions(arr) {
    if (!Array.isArray(arr)) throw new Error('题目数据应为数组');
    var added = 0;
    arr.forEach(function (q) {
      if (!q.id || !q.stem || !q.answer) return;
      if (Data.QUESTIONS.questions.some(function (x) { return x.id === q.id; })) return;
      q.srcLevel = q.srcLevel || '模拟';
      q.src = q.src || '导入题目';
      Data.QUESTIONS.questions.push(q);
      state.customQuestions.push(q.id);
      added++;
    });
    save();
    return added;
  }

  window.AppState = {
    load: load, save: save, reset: reset,
    get state() { return state; },
    nodeState: nodeState,
    effectiveMastery: effectiveMastery,
    masteryLabel: masteryLabel,
    recordAnswer: recordAnswer,
    setWrongReason: setWrongReason,
    markWrongReviewed: markWrongReviewed,
    dueWrongQuestions: dueWrongQuestions,
    markNodeRead: markNodeRead,
    getSubjAnswer: getSubjAnswer,
    saveSubjAnswer: saveSubjAnswer,
    subjSummary: subjSummary,
    todayLog: todayLog,
    addMinutes: addMinutes,
    priorityOf: priorityOf,
    topPriorityNodes: topPriorityNodes,
    forgettingAlerts: forgettingAlerts,
    frequencyStats: frequencyStats,
    freqText: freqText,
    summary: summary,
    examInfo: examInfo,
    weeklyReport: weeklyReport,
    exportJSON: exportJSON,
    importJSON: importJSON,
    addCustomQuestions: addCustomQuestions,
    SRS_STAGES: SRS_STAGES,
    todayStr: todayStr,
    daysBetween: daysBetween,
    addDays: addDays
  };
})();
