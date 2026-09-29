/* ============================================================
 * app.js  —  界面与交互
 * ============================================================ */

(function () {
  'use strict';

  /* ==================== 数据索引层 ==================== */
  var Data = {
    get EXAM() { return window.DATA_EXAM; },
    get KNOWLEDGE() { return window.DATA_KNOWLEDGE; },
    get QUESTIONS() { return window.DATA_QUESTIONS; },
    get STATUTES() { return window.DATA_STATUTES; },
    get NEWLAWS() { return window.DATA_NEWLAWS; },
    get SUBJECTIVE() { return window.DATA_SUBJECTIVE; },

    nodeIndex: null,
    findNode: function (id) {
      if (!this.nodeIndex) {
        this.nodeIndex = {};
        this.KNOWLEDGE.nodes.forEach(function (n) { Data.nodeIndex[n.id] = n; });
      }
      return this.nodeIndex[id] || null;
    },
    findQuestion: function (id) {
      return this.QUESTIONS.questions.filter(function (q) { return q.id === id; })[0] || null;
    },
    sectionWeight: function (sec) {
      var s = this.KNOWLEDGE.sections.filter(function (x) { return x.key === sec; })[0];
      return s ? s.weight : 1;
    },
    sectionColor: function (sec) {
      var s = this.KNOWLEDGE.sections.filter(function (x) { return x.key === sec; })[0];
      return s ? s.color : '#8C8C8C';
    },
    isCorrect: function (q, chosen) {
      if (!chosen || !chosen.length) return false;
      var a = q.answer.slice().sort().join(',');
      var c = chosen.slice().sort().join(',');
      return a === c;
    },
    questionsOf: function (nodeId) {
      return this.QUESTIONS.questions.filter(function (q) { return q.k === nodeId; });
    }
  };
  window.Data = Data;

  /* ==================== 工具 ==================== */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }
  function stars(n) {
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= n ? '★' : '☆';
    return s;
  }
  function bar(pct, color) {
    pct = Math.max(0, Math.min(100, pct || 0));
    return '<div class="bar"><div class="bar-in" style="width:' + pct + '%;background:' + (color || '#4C7BE0') + '"></div></div>';
  }
  function levelTag(level) {
    var map = {
      '官方已确认': 'lv-ok', '官方来源可推知': 'lv-ok2',
      '二手来源，未核实': 'lv-warn', '查无实据': 'lv-bad',
      '与官方法条矛盾': 'lv-bad', '表述不准确': 'lv-warn'
    };
    return '<span class="tag ' + (map[level] || 'lv-warn') + '">' + esc(level) + '</span>';
  }
  function srcTag(l) {
    var map = { '官方真题': 'lv-ok', '机构整理': 'lv-ok2', '回忆版': 'lv-warn', '模拟': 'lv-sim' };
    return '<span class="tag ' + (map[l] || 'lv-sim') + '">' + esc(l) + '</span>';
  }

  /* ---------------------------------------------------------------
     题库性质判定 —— 措辞诚实性的唯一依据
     约定：只有题库里真的存在「官方真题 / 机构整理 / 回忆版」时，
     才允许在界面文案里使用「真题」二字描述这些题目。
     当前题库全部为自编模拟题，因此一律称「题目」。
     --------------------------------------------------------------- */
  function bankNature() {
    var qs = (Data.QUESTIONS && Data.QUESTIONS.questions) || [];
    var c = { off: 0, inst: 0, mem: 0, sim: 0 };
    qs.forEach(function (q) {
      if (q.srcLevel === '官方真题') c.off++;
      else if (q.srcLevel === '机构整理') c.inst++;
      else if (q.srcLevel === '回忆版') c.mem++;
      else c.sim++;
    });
    c.total = qs.length;
    /* 可计入考频的真题数：官方真题 + 机构整理 + 回忆版
     * （2018 年后官方不再公布真题，市场流通的只可能是后两类） */
    c.real = c.off + c.inst + c.mem;
    /* 是否完全没有官方真题/机构整理版、只有回忆版 */
    c.recallOnly = c.off === 0 && c.inst === 0 && c.mem > 0;
    c.anyReal = c.off + c.inst + c.mem > 0;  // 是否存在任何非模拟题
    c.label = c.anyReal ? '题目' : '模拟题';
    return c;
  }
  /* 「真题」一词的安全用法：有真题才说真题，没有就直说模拟题 */
  function qWord() { return bankNature().anyReal ? '题目' : '模拟题'; }
  function bankNotice() {
    var n = bankNature();
    if (n.anyReal) {
      return '当前题库共 ' + n.total + ' 道：官方真题 ' + n.off + ' 道、机构整理 ' + n.inst +
        ' 道、回忆版 ' + n.mem + ' 道、模拟题 ' + n.sim + ' 道。';
    }
    return '当前题库共 ' + n.total + ' 道，<b>全部为依考试大纲考点自编的模拟题，不含任何历年真题</b>。' +
      '系统不会把模拟题标注成真题。可在「设置 → 导入题目」中导入真题数据，导入后本页措辞与考频统计会自动切换。';
  }

  /* 考频数字的统一显示。
   * 硬规则：只要统计里含回忆版，就必须把「回忆版」三个字显示出来，
   * 绝不让用户把回忆版数据误当成官方考频。 */
  function freqLabel(fr, prefix) {
    if (!fr) return '<span class="warn">尚未完成统计</span>';
    var n = bankNature();
    var txt = (prefix || '题库内') + ' ' + fr.total + ' 题';
    if (n.recallOnly) txt += '<span class="st">（回忆版）</span>';
    return txt;
  }
  /* 考频数据的来源声明，放在任何展示考频的区块里 */
  function freqSourceNote() {
    var n = bankNature();
    if (!n.anyReal) {
      return '当前题库<span class="warn-text">不含任何历年真题</span>，所有知识点显示「尚未完成统计」。这是刻意的——宁可没有数字，也不给假数据。';
    }
    if (n.recallOnly) {
      return '考频基于 <b>' + n.mem + ' 道回忆版真题</b>统计。' +
        '<span class="warn-text">司法部自 2018 年改革后不再公布真题与答案，因此不存在官方考频数据；' +
        '本次统计的题干与答案均来自考生回忆、经辅导机构整理，非官方发布</span>，仅可用于观察考点分布，不代表官方命题频次。';
    }
    return '考频基于 ' + n.real + ' 道真题统计（官方真题 ' + n.off + ' 道、机构整理 ' + n.inst +
      ' 道、回忆版 ' + n.mem + ' 道）。';
  }

  /* Fisher–Yates 洗牌（不修改原数组） */
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  /* 从题库抽取 n 道题，尽量覆盖多个板块（按板块轮转取样，避免全是同一科） */
  function pickBalanced(pool, n) {
    var buckets = {};
    pool.forEach(function (q) { (buckets[q.sec] = buckets[q.sec] || []).push(q); });
    var keys = Object.keys(buckets).map(function (k) { return { k: k, list: shuffle(buckets[k]) }; });
    keys = shuffle(keys);
    var out = [], i = 0;
    while (out.length < n && keys.some(function (b) { return b.list.length; })) {
      var b = keys[i % keys.length];
      if (b.list.length) out.push(b.list.shift());
      i++;
    }
    return out;
  }
  function toast(msg) {
    var t = el('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  /* ==================== 路由 ==================== */
  var NAV = [
    { key: 'dash', name: '今日学习', icon: '◉' },
    { key: 'tree', name: '知识体系', icon: '▤' },
    { key: 'compare', name: '对比辨析', icon: '⇄' },
    { key: 'train', name: '题目训练', icon: '▶' },
    { key: 'exam', name: '模拟考试', icon: '◍' },
    { key: 'wrong', name: '错题本', icon: '✕' },
    { key: 'trap', name: '命题陷阱库', icon: '⚠' },
    { key: 'statute', name: '法条库', icon: '§' },
    { key: 'newlaw', name: '新法专区', icon: '✦' },
    { key: 'subj', name: '主观题', icon: '✎' },
    { key: 'data', name: '学习数据', icon: '▦' },
    { key: 'search', name: '搜索', icon: '⌕' },
    { key: 'coach', name: 'AI 教练', icon: '☰' },
    { key: 'settings', name: '设置', icon: '⚙' }
  ];

  var route = { view: 'dash', arg: null };

  function go(hash) { location.hash = hash; }

  function parseHash() {
    var h = (location.hash || '#/dash').replace(/^#\/?/, '');
    var parts = h.split('/');
    route.view = parts[0] || 'dash';
    route.arg = parts.slice(1).join('/') || null;
  }

  /* ==================== 骨架 ==================== */
  function renderShell() {
    var info = AppState.examInfo();
    var log = AppState.todayLog();
    var done = log.qCount;
    var target = Math.max(20, Math.round(AppState.state.profile.dailyMinutes / 6));
    var pct = Math.min(100, Math.round(done / target * 100));

    var navHtml = NAV.map(function (n) {
      var badge = '';
      if (n.key === 'wrong') {
        var d = AppState.dueWrongQuestions().length;
        if (d) badge = '<em class="badge">' + d + '</em>';
      }
      if (n.key === 'newlaw') badge = '<em class="badge badge-b">' + Data.NEWLAWS.items.length + '</em>';
      return '<a href="#/' + n.key + '" class="nav-item' + (route.view === n.key ? ' active' : '') + '">' +
        '<i>' + n.icon + '</i><span>' + n.name + '</span>' + badge + '</a>';
    }).join('');

    var countdown = '';
    if (info.track === 'subjective2026') {
      countdown = '<div class="cd"><span class="cd-label">主观题</span><b class="' + (info.daysToSubj <= 7 ? 'cd-hot' : '') + '">' +
        (info.daysToSubj >= 0 ? 'D-' + info.daysToSubj : '已结束') + '</b></div>';
    } else {
      countdown = '<div class="cd"><span class="cd-label">2027 客观题(预计)</span><b class="' + (info.daysToObj <= 30 ? 'cd-hot' : '') + '">D-' + info.daysToObj + '</b></div>' +
        '<div class="cd"><span class="cd-label">2027 主观题(预计)</span><b>' + info.daysToSubj + ' 天</b></div>';
    }

    document.body.innerHTML =
      '<div class="app">' +
        '<aside class="side">' +
          '<div class="brand"><span class="logo">法</span><div><b>' + (info.track === 'subjective2026' ? '2026' : '2027') + ' 法考 AI 备考系统</b><small>交互式 · 动态更新 · 数据可溯源</small></div></div>' +
          '<nav>' + navHtml + '</nav>' +
          '<div class="side-foot">' +
            '<div class="mini">档案创建 ' + esc(AppState.state.createdAt) + '</div>' +
            '<div class="mini">数据核验 ' + esc(Data.EXAM.meta.verifiedAt) + '</div>' +
          '</div>' +
        '</aside>' +
        '<main class="main">' +
          '<header class="top">' +
            '<div class="top-left">' + countdown +
              '<div class="cd"><span class="cd-label">连续学习</span><b>' + AppState.state.streak.days + ' 天</b></div>' +
              '<div class="cd"><span class="cd-label">今日完成度</span><b>' + pct + '%</b>' +
                '<div class="mini-bar"><div style="width:' + pct + '%"></div></div></div>' +
            '</div>' +
            '<div class="top-right"><span class="pill">' + esc(info.phase) + '</span>' +
              '<a class="btn btn-ghost" href="#/diag">' + (AppState.state.profile.diagDone ? '重做诊断' : '开始诊断') + '</a>' +
            '</div>' +
          '</header>' +
          '<section class="content" id="view"></section>' +
        '</main>' +
      '</div>' +
      '<div id="toast" class="toast"></div>';

    var v = el('view');
    var fn = VIEWS[route.view] || VIEWS.dash;
    v.innerHTML = fn(route.arg);
    if (AFTER[route.view]) AFTER[route.view](route.arg);
    /* 考试模式下启动计时器；离开则停止 */
    if (route.view === 'train' && route.arg && route.arg.indexOf('exam') === 0 && quiz.list.length) startExamTimer();
    else stopExamTimer();
  }

  /* ==================== 视图：驾驶舱 ==================== */
  function viewDash() {
    var info = AppState.examInfo();
    var sum = AppState.summary();
    var log = AppState.todayLog();
    var ex = Data.EXAM;
    var freq = AppState.frequencyStats();

    /* 各科掌握度 */
    var secBars = Data.KNOWLEDGE.sections.map(function (s) {
      var d = sum.bySec[s.key] || { sum: 0, cnt: 0, total: 0 };
      var m = d.cnt ? Math.round(d.sum / d.cnt) : 0;
      var known = d.cnt > 0;
      return '<div class="sec-row">' +
        '<span class="sec-name" style="border-color:' + s.color + '">' + esc(s.key) + '</span>' +
        '<div class="sec-bar">' + bar(m, s.color) + '</div>' +
        '<span class="sec-val">' + (known ? m + '%' : '未采集') + '</span>' +
        '</div>';
    }).join('');

    /* 今日任务 */
    var tasks = buildTodayTasks();
    var taskHtml = tasks.map(function (t, i) {
      return '<div class="task' + (log.tasksDone && log.tasksDone.indexOf(t.key) > -1 ? ' done' : '') + '">' +
        '<div class="task-main"><span class="task-type">' + esc(t.type) + '</span>' +
        '<b>' + esc(t.title) + '</b>' +
        '<div class="task-meta">' + esc(t.desc) + ' · 预计 ' + t.min + ' 分钟</div></div>' +
        '<div class="task-act">' +
          '<a class="btn btn-sm" href="' + t.link + '">开始</a>' +
          '<button class="btn btn-sm btn-ghost" data-task-done="' + t.key + '">完成</button>' +
        '</div></div>';
    }).join('');

    /* 薄弱雷达 */
    var weak = AppState.topPriorityNodes(6, {});
    var weakHtml = weak.map(function (w) {
      var ns = AppState.state.nodes[w.id];
      var m = ns && ns.attempts ? AppState.effectiveMastery(w.id) : null;
      return '<a class="weak-item" href="#/node/' + w.id + '">' +
        '<div class="weak-top"><b>' + esc(w.node.name) + '</b>' +
        '<span class="st">' + stars(w.node.star) + '</span></div>' +
        '<div class="weak-bot">' + bar(m || 0, m === null ? '#5a5a5a' : (m < 50 ? '#E4564A' : '#4C7BE0')) +
        '<span>' + (m === null ? '未采集' : m + '/100') + '</span>' +
        '<span class="pri">🔥 ' + Math.round(w.p) + '</span></div></a>';
    }).join('');

    /* 遗忘预警 */
    var alerts = AppState.forgettingAlerts();
    var alertHtml = alerts.length ? alerts.map(function (a) {
      return '<div class="alert-item">⚠️ <b>' + esc(a.node.name) + '</b>　上次复习 ' + a.days + ' 天前　' +
        '预计掌握度 ' + a.from + ' → ' + a.to + '　' +
        '<a href="#/train/node/' + a.node.id + '">做 3 道相关题</a></div>';
    }).join('') : '<div class="muted">暂无遗忘预警。开始学习后，系统会跟踪每个知识点的衰减情况。</div>';

    /* 考频状态 */
    var realCnt = freq.counts.off + freq.counts.inst;
    var freqHtml =
      '<div class="kv"><span>题库总量</span><b>' + Data.QUESTIONS.questions.length + ' 道</b></div>' +
      '<div class="kv"><span>官方真题</span><b class="' + (freq.counts.off ? '' : 'warn') + '">' + freq.counts.off + ' 道</b></div>' +
      '<div class="kv"><span>机构整理真题</span><b class="' + (freq.counts.inst ? '' : 'warn') + '">' + freq.counts.inst + ' 道</b></div>' +
      '<div class="kv"><span>回忆版</span><b>' + freq.counts.recall + ' 道</b></div>' +
      '<div class="kv"><span>自编模拟题</span><b>' + freq.counts.sim + ' 道</b></div>' +
      '<div class="note">' + freqSourceNote() + '</div>' +
      '<div class="note">界面文案也遵循同一原则：只有题库里真的存在真题时，系统才会用「真题」二字描述题目。' +
      (bankNature().anyReal
        ? '当前题库已含历年真题（回忆版），相关文案已切换为「真题」。'
        : '当前题库全部为自编模拟题，因此一律称「题目」或「模拟题」。') + '</div>';

    /* 倒计时卡片：按目标年度切换 */
    var heroCd;
    if (info.track === 'subjective2026') {
      heroCd = '<div class="hero-cd-item"><span>主观题</span><b>' + (info.daysToSubj >= 0 ? info.daysToSubj + ' 天' : '已结束') + '</b>' +
          '<small>' + esc(ex.subjective.dateText) + '　240 分钟　180 分</small></div>' +
        '<div class="hero-cd-item"><span>客观题（2026）</span><b class="muted-b">已结束</b>' +
          '<small>' + esc(ex.objective.examDates) + '　成绩 ' + esc(ex.objective.resultDate) + ' 公布</small></div>';
    } else {
      heroCd = '<div class="hero-cd-item"><span>2027 客观题（预计）</span><b>' + info.daysToObj + ' 天</b>' +
          '<small>' + esc(info.objGuess) + '　·　' + esc(info.confidence) + '</small></div>' +
        '<div class="hero-cd-item"><span>2027 主观题（预计）</span><b>' + info.daysToSubj + ' 天</b>' +
          '<small>' + esc(info.subjGuess) + '　·　' + esc(info.confidence) + '</small></div>';
    }

    return '' +
    '<div class="grid grid-2">' +
      '<div class="card card-hero">' +
        '<div class="hero-title">法考备考驾驶舱</div>' +
        '<div class="hero-sub">' + esc(info.phase) + '　·　' + esc(AppState.todayStr()) + '　·　目标：' +
          (info.track === 'subjective2026' ? '2026 年主观题' : '2027 年考试年度') + '</div>' +
        '<div class="hero-cd">' + heroCd + '</div>' +
        '<div class="hero-note">' + esc(info.phaseDesc) +
          (info.nextAction ? '<br><b>本阶段提醒：</b>' + esc(info.nextAction) : '') + '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h3>今日学习</h3>' +
        '<div class="stat-row">' +
          '<div class="stat"><b>' + log.qCount + '</b><span>今日做题</span></div>' +
          '<div class="stat"><b>' + (log.qCount ? Math.round(log.qCorrect / log.qCount * 100) + '%' : '—') + '</b><span>今日正确率</span></div>' +
          '<div class="stat"><b>' + (log.minutes || 0) + '</b><span>今日学习(分钟)</span></div>' +
        '</div>' +
        '<div class="stat-row">' +
          '<div class="stat"><b>' + sum.totalQ + '</b><span>累计做题</span></div>' +
          '<div class="stat"><b>' + Math.round(sum.totalMinutes / 60) + '</b><span>累计学习(小时)</span></div>' +
          '<div class="stat"><b>' + sum.coverage + '%</b><span>知识覆盖率</span></div>' +
        '</div>' +
        '<div class="stat-row">' +
          '<div class="stat"><b>' + (sum.acc7 === null ? '—' : sum.acc7 + '%') + '</b><span>近7日正确率</span></div>' +
          '<div class="stat"><b>' + sum.wrongActive + '</b><span>待复习错题</span></div>' +
          '<div class="stat"><b>' + (sum.masteryCount ? sum.mastery + '/100' : '未采集') + '</b><span>综合掌握度</span></div>' +
        '</div>' +
        '<div class="note">所有数字均来自你的真实答题记录，系统不生成任何虚构数据。' +
        (sum.totalQ === 0 ? ' 目前尚未开始答题，先做一次入学诊断。' : '') + '</div>' +
        '<div class="row-btns"><span class="tiny muted" style="align-self:center">记录学习时长：</span>' +
          '<button class="btn btn-sm btn-ghost" data-min="15">+15 分钟</button>' +
          '<button class="btn btn-sm btn-ghost" data-min="30">+30 分钟</button>' +
          '<button class="btn btn-sm btn-ghost" data-min="60">+60 分钟</button>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="grid grid-2">' +
      '<div class="card"><h3>今日法考任务</h3>' + taskHtml +
        '<div class="note">任务由优先级算法生成：考试重要度 × 板块权重 × 掌握度缺口 × 遗忘紧急度 × 主观题价值。' +
        '未完成的内容会自动滚入后续计划。</div>' +
      '</div>' +
      '<div class="card"><h3>薄弱知识雷达</h3>' + weakHtml +
        '<div class="note">🔥 后的数字是当前优先级分值，越大越应该今天学。</div>' +
      '</div>' +
    '</div>' +

    '<div class="grid grid-2">' +
      '<div class="card"><h3>各板块掌握度</h3>' + secBars +
        '<div class="note">掌握度 = 个人对该板块已答题知识点的平均掌握程度（含遗忘衰减）。' +
        '「未采集」表示该板块尚未做过任何题，不是 0 分。</div>' +
      '</div>' +
      '<div class="card"><h3>遗忘预警</h3>' + alertHtml + '</div>' +
    '</div>' +

    '<div class="grid grid-2">' +
      '<div class="card"><h3>题库与考频状态</h3>' + freqHtml +
        '<div class="row-btns"><a class="btn" href="#/settings">导入真题数据</a>' +
        '<a class="btn btn-ghost" href="#/train">开始训练</a></div>' +
      '</div>' +
      '<div class="card"><h3>新法更新状态</h3>' +
        '<div class="kv"><span>已核验条目</span><b>' + Data.NEWLAWS.items.length + ' 条</b></div>' +
        '<div class="kv"><span>核验日期</span><b>' + esc(Data.NEWLAWS.verifiedAt) + '</b></div>' +
        '<div class="kv"><span>已纠正的错误说法</span><b>' + Data.NEWLAWS.corrections.length + ' 条</b></div>' +
        Data.NEWLAWS.items.filter(function (i) { return i.fire === '高'; }).slice(0, 4).map(function (i) {
          return '<div class="nl-line">🔥 <a href="#/newlaw">' + esc(i.name) + '</a>　<span class="muted">' + esc(i.effective) + '</span></div>';
        }).join('') +
        '<div class="note">新法专区每条都标注了结论等级与证据来源。' +
        '<b>本系统已纠正 5 处流传较广的错误说法</b>，详见新法专区。</div>' +
        '<div class="row-btns"><a class="btn" href="#/newlaw">查看新法专区</a></div>' +
      '</div>' +
    '</div>' +

    '<div class="card"><h3>本阶段主攻方向</h3><div class="chips">' +
      info.focus.map(function (f) { return '<span class="chip">' + esc(f) + '</span>'; }).join('') +
    '</div></div>';
  }

  /* 今日任务生成 */
  function buildTodayTasks() {
    var t = AppState.todayStr();
    if (AppState.state.taskCache.date === t && AppState.state.taskCache.list.length) {
      return AppState.state.taskCache.list;
    }
    var top = AppState.topPriorityNodes(4, {});
    var list = [];
    top.forEach(function (x, i) {
      var mins = [45, 40, 35, 30][i] || 30;
      list.push({
        key: 'k-' + x.id, type: '知识学习', title: x.node.name,
        desc: stars(x.node.star) + ' ' + x.node.band + ' · 优先级 ' + Math.round(x.p),
        min: mins, link: '#/node/' + x.id
      });
    });
    var due = AppState.dueWrongQuestions().length;
    list.push({ key: 'q-train', type: '题目训练', title: '专项训练 20 题', desc: '按薄弱点优先出题', min: 40, link: '#/train' });
    list.push({ key: 'q-wrong', type: '错题复习', title: '错题复习 ' + Math.min(due, 8) + ' 道', desc: due ? '间隔重复到期' : '暂无到期错题', min: 25, link: '#/wrong' });
    list.push({ key: 'q-statute', type: '法条训练', title: '法条定位 5 条', desc: '训练检索速度', min: 15, link: '#/statute' });
    if (AppState.state.profile.track === 'subjective2026') {
      list.push({ key: 'q-subj', type: '主观题', title: '案例拆解 1 例', desc: '四段式答题框架训练', min: 45, link: '#/subj' });
    }
    AppState.state.taskCache = { date: t, list: list };
    AppState.save();
    return list;
  }

  /* ==================== 视图：知识体系 ==================== */
  function viewTree(arg) {
    var secFilter = arg ? decodeURIComponent(arg) : 'all';
    var secs = Data.KNOWLEDGE.sections;
    var tabs = '<a class="tab' + (secFilter === 'all' ? ' active' : '') + '" href="#/tree">全部</a>' +
      secs.map(function (s) {
        return '<a class="tab' + (secFilter === s.key ? ' active' : '') + '" href="#/tree/' + encodeURIComponent(s.key) + '">' + esc(s.key) + '</a>';
      }).join('');

    var list = Data.KNOWLEDGE.nodes.filter(function (n) { return secFilter === 'all' || n.sec === secFilter; });
    var bySec = {};
    list.forEach(function (n) { (bySec[n.sec] = bySec[n.sec] || []).push(n); });

    var body = Object.keys(bySec).map(function (sec) {
      var nodes = bySec[sec].sort(function (a, b) { return (b.star - a.star) || a.id.localeCompare(b.id); });
      return '<div class="sec-block">' +
        '<div class="sec-head"><span class="dot" style="background:' + Data.sectionColor(sec) + '"></span>' +
        '<b>' + esc(sec) + '</b><span class="muted">共 ' + nodes.length + ' 个知识节点</span></div>' +
        '<table class="tbl"><thead><tr><th style="width:34%">知识节点（唯一 ID）</th><th style="width:9%">重要度</th>' +
        '<th style="width:9%">考频等级</th><th style="width:10%">考法</th><th style="width:16%">掌握度</th><th style="width:12%">考频统计</th><th></th></tr></thead><tbody>' +
        nodes.map(function (n) {
          var ns = AppState.state.nodes[n.id];
          var m = ns && ns.attempts ? AppState.effectiveMastery(n.id) : null;
          var lab = AppState.masteryLabel(m);
          var fr = AppState.freqText(n.id);
          return '<tr>' +
            '<td><a href="#/node/' + n.id + '"><b>' + esc(n.name) + '</b></a>' +
              '<div class="tiny">' + esc(n.id) + (n.core ? ' · <span class="core">核心制度</span>' : '') + '</div></td>' +
            '<td><span class="st">' + stars(n.star) + '</span></td>' +
            '<td>' + esc(n.band) + '</td>' +
            '<td class="tiny">' + esc(n.ex) + '</td>' +
            '<td><div class="mini-bar"><div style="width:' + (m || 0) + '%;background:' + (m === null ? '#444' : (m < 50 ? '#E4564A' : m < 70 ? '#E08A3C' : '#3E9E6C')) + '"></div></div>' +
              '<span class="tiny ' + lab.cls + '">' + (m === null ? '未采集' : m + '/100 ' + lab.text) + '</span></td>' +
            '<td class="tiny">' + freqLabel(fr) + '</td>' +
            '<td><a class="btn btn-sm" href="#/train/node/' + n.id + '">练</a></td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div>';
    }).join('');

    return '<div class="card">' +
      '<h3>法考知识图谱</h3>' +
      '<div class="tabs">' + tabs + '</div>' +
      '<div class="note"><b>重要度（★）</b>是「考试重要度」，属专业初判，依据命题规律、大纲地位、综合命题价值、主观题价值综合判断；' +
      '<b>掌握度（/100）</b>是「你的个人掌握程度」，来自你的真实答题记录。两者必须分开看——' +
      '★★★★★ 但掌握度 42，意味着「超级重点，但你很差」，这类内容优先级最高。</div>' +
      '<div class="note warn-box"><b>考频说明：</b>' + freqSourceNote() + '</div>' +
    '</div>' + body;
  }

  /* ==================== 视图：知识节点详情 ==================== */
  function viewNode(id) {
    var n = Data.findNode(id);
    if (!n) return '<div class="card">未找到该知识节点。</div>';
    AppState.markNodeRead(id);
    var ns = AppState.state.nodes[id];
    var m = ns && ns.attempts ? AppState.effectiveMastery(id) : null;
    var lab = AppState.masteryLabel(m);
    var fr = AppState.freqText(id);
    var qs = Data.questionsOf(id);
    var sts = Data.STATUTES.statutes.filter(function (s) { return s.node === id; });
    var wrongs = AppState.state.wrong.filter(function (w) { return w.nodeId === id; });

    function block(title, content) {
      if (!content) return '';
      return '<div class="kb"><h4>' + esc(title) + '</h4><div class="kb-body">' + content + '</div></div>';
    }

    var statutes = sts.length ? sts.map(function (s) {
      return '<div class="statute"><div class="statute-head"><b>' + esc(s.law) + ' ' + esc(s.art) + '</b>' +
        '<span class="tag ' + (s.level === '必须背' ? 'lv-ok' : s.level === '必须熟悉' ? 'lv-ok2' : 'lv-sim') + '">' + esc(s.level) + '</span></div>' +
        '<div class="statute-key">' + esc(s.key) + '</div>' +
        (s.warning ? '<div class="warn-box">' + esc(s.warning) + '</div>' : '') +
        '<div class="tiny">关键词：' + (s.keywords || []).join('、') + '　适用场景：' + esc(s.scene) + '</div></div>';
    }).join('') : '<div class="muted">本节点暂无已录入的法条。可在法条库中检索相关法律。</div>';

    var related = (n.cmp || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('');

    return '<div class="card">' +
      '<div class="crumb"><a href="#/tree">知识体系</a> / ' + esc(n.sec) + ' / ' + esc(n.l1) + '</div>' +
      '<h2>' + esc(n.name) + '</h2>' +
      '<div class="node-meta">' +
        '<span class="st">' + stars(n.star) + '</span>' +
        '<span class="tag">' + esc(n.band) + '</span>' +
        '<span class="tag">' + esc(n.ex) + '</span>' +
        (n.core ? '<span class="tag core">核心制度</span>' : '') +
        '<span class="tag">主观题价值：' + esc(n.subj) + '</span>' +
        '<span class="tag">ID ' + esc(n.id) + '</span>' +
      '</div>' +
      '<div class="mblock">' +
        '<div class="mblock-left"><span>考试重要度</span><b>' + stars(n.star) + '</b><small>（考试重要度，非个人水平）</small></div>' +
        '<div class="mblock-right"><span>你的掌握度</span><b class="' + lab.cls + '">' + (m === null ? '未采集' : m + '/100') + '</b>' +
        '<small>' + (m === null ? '还没做过相关题' : lab.text) + '</small></div>' +
      '</div>' +
      '<div class="row-btns">' +
        '<a class="btn" href="#/train/node/' + id + '">做这个知识点的题（' + qs.length + '）</a>' +
        '<button class="btn btn-ghost" data-mastery="' + id + '">我已掌握</button>' +
        '<button class="btn btn-ghost" data-confused="' + id + '">仍不理解</button>' +
      '</div>' +
    '</div>' +

    '<div class="grid grid-2">' +
      '<div class="card"><h3>考试讲解（六层）</h3>' +
        block('一句话结论', esc(n.one || '（本节点为占位节点，讲解待补充）')) +
        block('考试规则', n.rule ? '<p>' + esc(n.rule).replace(/\n/g, '</p><p>') + '</p>' : '') +
        block('为什么', n.why ? esc(n.why) : '') +
        block('典型情形', n.ex1 ? esc(n.ex1) : '') +
        block('例外', n.exc ? esc(n.exc) : '') +
        block('相似知识点对比', related ? '<ul>' + related + '</ul>' : '') +
        block('记忆方法', n.mem ? '<div class="mem">' + esc(n.mem) + '</div>' : '') +
        block('主观题如何表达', n.sub ? '<div class="sub-expr">' + esc(n.sub) + '</div>' : '') +
        (n.note ? '<div class="warn-box">' + esc(n.note) + '</div>' : '') +
      '</div>' +
      '<div class="card"><h3>考频与命题陷阱</h3>' +
        '<div class="kv"><span>题库内题目</span><b>' + qs.length + ' 道</b></div>' +
        '<div class="kv"><span>考频统计</span><b class="' + (fr ? '' : 'warn') + '">' +
          freqLabel(fr, '近10年') + '</b></div>' +
        '<div class="kv"><span>考频等级（专业初判）</span><b>' + esc(n.band) + '</b></div>' +
        '<div class="kv"><span>你的错题</span><b>' + wrongs.length + ' 道</b></div>' +
        '<h4 class="mt">命题陷阱</h4>' +
        (n.tr && n.tr.length ? '<ul class="trap-list">' + n.tr.map(function (t) {
          return '<li><span class="trap-mark">陷阱</span>' + esc(t) + '</li>';
        }).join('') + '</ul>' : '<div class="muted">本节点陷阱清单待补充。</div>') +
        '<div class="note">看到「一律」「必须」「任何情况下」这类绝对化表述，立刻警觉；' +
        '看到「可以」和「应当」，先确认条文原文到底用哪个。</div>' +
      '</div>' +
    '</div>' +

    '<div class="card"><h3>核心法条</h3>' + statutes +
      '<div class="note">' + esc(Data.STATUTES.disclaimer) + '</div></div>' +

    '<div class="card"><h3>主动回忆检测</h3>' +
      '<div class="recall">' +
        '<div class="recall-q">不看上面的讲解，用自己的话回答：<br>' +
        '<b>「' + esc(n.l1 + '—' + n.l2) + '」的核心规则是什么？最容易错在哪一步？</b></div>' +
        '<textarea id="recall-text" placeholder="在这里写下来（写出来才算真的记住）"></textarea>' +
        '<div class="row-btns"><button class="btn" data-recall-save="' + id + '">提交自评</button>' +
        '<span class="muted">提交后，选择「已掌握」会小幅提升掌握度；选择「仍不理解」会触发纠偏。</span></div>' +
      '</div>' +
      '<div class="note">阅读会产生「虚假的掌握感」，主动回忆才是真正的检验。' +
      '答错时系统只针对错误认知纠偏，不会把整章重讲一遍。</div>' +
    '</div>';
  }

  /* ==================== 视图：训练 ==================== */
  var quiz = { list: [], idx: 0, chosen: [], revealed: false, mode: 'random', title: '', key: null, results: [] };

  function startQuiz(list, title, mode, key) {
    quiz.list = list; quiz.idx = 0; quiz.chosen = []; quiz.revealed = false;
    quiz.mode = mode || 'random'; quiz.title = title || '';
    quiz.key = key || null; quiz.results = []; quiz.examStart = Date.now();
  }
  /* 同一路由 key 下不重复初始化，避免重绘时清空答题进度 */
  function quizReady(key) {
    return quiz.key === key && quiz.list.length > 0;
  }

  function viewTrain(arg) {
    if (arg && arg.indexOf('single/') === 0) {
      var qid0 = arg.slice(7);
      var one0 = Data.findQuestion(qid0);
      if (!one0) return '<div class="card">未找到该题目。<a href="#/train">返回训练</a></div>';
      if (!quizReady(arg)) startQuiz([one0], '单题精练 · ' + one0.id, 'single', arg);
      return renderQuiz();
    }
    if (arg && arg.indexOf('node/') === 0) {
      var nid = arg.slice(5);
      var node = Data.findNode(nid);
      var list = Data.questionsOf(nid);
      if (!list.length) return '<div class="card">该知识节点暂无题目。<a href="#/tree">返回知识体系</a></div>';
      if (!quizReady('node/' + nid)) startQuiz(list, '专项训练：' + node.name, 'node', 'node/' + nid);
      return renderQuiz();
    }
    if (arg === 'weak') {
      if (!quizReady('weak')) {
        var top = AppState.topPriorityNodes(8, {});
        var ids = top.map(function (x) { return x.id; });
        var l2 = Data.QUESTIONS.questions.filter(function (q) { return ids.indexOf(q.k) > -1; }).slice(0, 20);
        startQuiz(l2, '薄弱点专项训练', 'weak', 'weak');
      }
      return renderQuiz();
    }
    if (arg === 'due') {
      if (!quizReady('due')) {
        var due = AppState.dueWrongQuestions();
        if (!due.length) return '<div class="card">当前没有到期的错题。<a href="#/wrong">去错题本</a></div>';
        var l3 = due.map(function (w) { return Data.findQuestion(w.qid); }).filter(Boolean);
        startQuiz(l3, '错题复习（间隔重复到期）', 'due', 'due');
      }
      return renderQuiz();
    }
    if (arg && arg.indexOf('sec/') === 0) {
      var sec = decodeURIComponent(arg.slice(4));
      if (!quizReady('sec/' + sec)) {
        var l4 = Data.QUESTIONS.questions.filter(function (q) { return q.sec === sec; });
        startQuiz(l4, sec + ' 专项训练', 'sec', 'sec/' + sec);
      }
      return renderQuiz();
    }

    /* 只做历年真题（回忆版 / 机构整理 / 官方真题），不含自编模拟题 */
    if (arg === 'real') {
      if (!quizReady('real')) {
        var reals = Data.QUESTIONS.questions.filter(isRealQ);
        if (!reals.length) {
          return '<div class="card">当前题库还没有历年真题。<a href="#/settings">去导入真题数据</a></div>';
        }
        var lr = pickBalanced(reals, 10);
        startQuiz(lr, '历年真题训练（' + lr.length + ' 题）', 'real', 'real');
      }
      return renderQuiz();
    }
    if (arg && arg.indexOf('compare') === 0) {
      if (!quizReady(arg)) return '<div class="card">请先在「对比辨析」页面开始训练。<a href="#/compare">去对比辨析</a></div>';
      return renderQuiz();
    }
    if (arg && arg.indexOf('exam') === 0) {
      if (!quizReady(arg)) return '<div class="card">请先在「模拟考试」页面选择卷型。<a href="#/exam">去组卷</a></div>';
      return renderQuiz();
    }
    if (arg && (arg.indexOf('random/') === 0 || arg.indexOf('similar/') === 0)) {
      if (!quizReady(arg)) {
        if (arg.indexOf('similar/') === 0) {
          var nid2 = arg.slice(8);
          var l5 = Data.questionsOf(nid2);
          if (!l5.length) return '<div class="card">该知识点暂无其他题目。<a href="#/tree">返回知识体系</a></div>';
          startQuiz(l5, '相似知识点训练：' + (Data.findNode(nid2) ? Data.findNode(nid2).name : nid2), 'similar', arg);
        } else {
          var allQ = Data.QUESTIONS.questions;
          if (!allQ.length) return '<div class="card">题库为空。</div>';
          var qq = pickBalanced(allQ, 10);
          startQuiz(qq, '随机训练（' + qq.length + ' 题）', 'random', arg);
        }
      }
      return renderQuiz();
    }

    var secBtns = Data.KNOWLEDGE.sections.map(function (s) {
      var c = Data.QUESTIONS.questions.filter(function (q) { return q.sec === s.key; }).length;
      return '<a class="btn btn-ghost" href="#/train/sec/' + encodeURIComponent(s.key) + '">' + esc(s.key) + '（' + c + '）</a>';
    }).join('');

    var bank = bankNature();
    return '<div class="card"><h3>题目训练（七层解析）</h3>' +
      '<div class="warn-box"><b>关于题目来源：</b>' + bankNotice() + '</div>' +
      '<div class="row-btns">' +
        '<button class="btn btn-lg" id="start-random">开始一组训练（10 题）</button>' +
        (bank.anyReal
          ? '<a class="btn btn-ghost" href="#/train/real">只做历年真题（' + bank.real + ' 道）</a>'
          : '') +
        '<a class="btn btn-ghost" href="#/train/weak">按薄弱点出题</a>' +
        '<a class="btn btn-ghost" href="#/train/due">错题复习（到期 ' + AppState.dueWrongQuestions().length + '）</a>' +
        '<a class="btn btn-ghost" href="#/exam">组卷模拟考试</a>' +
      '</div>' +
      '<h4 class="mt">按板块专项训练</h4><div class="chips">' + secBtns + '</div>' +
      '<div class="note">答题流程：先只显示题目 → 你作答 → 系统揭示答案 → 按七层顺序解析：' +
      '①为什么正确 ②其他选项为什么错 ③考什么知识点 ④这个知识点还怎么考过 ⑤以后可能怎么变形 ⑥关联法条 ⑦相似知识点与时间效力。</div>' +
      '</div>';
  }

  function renderQuiz() {
    if (!quiz.list.length) return '<div class="card">没有可用的题目。</div>';
    if (quiz.idx >= quiz.list.length) return renderQuizResult();
    var q = quiz.list[quiz.idx];
    var ns = Data.findNode(q.k);
    var multi = q.type !== '单选';
    var chosen = quiz.chosen;

    var opts = q.options.map(function (o, i) {
      var key = String.fromCharCode(65 + i);
      var cls = 'opt';
      if (quiz.revealed) {
        if (q.answer.indexOf(key) > -1) cls += ' opt-right';
        else if (chosen.indexOf(key) > -1) cls += ' opt-wrong';
      } else if (chosen.indexOf(key) > -1) {
        cls += ' opt-sel';
      }
      return '<div class="' + cls + '" data-opt="' + key + '"><i>' + key + '</i><span>' + esc(o) + '</span></div>';
    }).join('');

    var analysis = '';
    if (quiz.revealed) {
      var correct = Data.isCorrect(q, chosen);
      var ww = q.wrongWhy || {};
      var wrongList = q.options.map(function (o, i) { return String.fromCharCode(65 + i); })
        .filter(function (k) { return q.answer.indexOf(k) === -1; })
        .map(function (k) {
          var txt = ww[k] || '本项与法律规定不符。';
          return '<li><b>' + k + '：</b>' + esc(txt) + '</li>';
        }).join('');

      analysis =
      '<div class="analysis">' +
        '<div class="verdict ' + (correct ? 'ok' : 'no') + '">' +
          (correct ? '✓ 回答正确' : '✕ 回答错误') +
          '<span>你的答案：' + (chosen.length ? chosen.join('') : '未作答') + '　正确答案：' + q.answer.join('') + '</span>' +
        '</div>' +
        '<div class="layer"><h5>第 1 层 · 为什么正确</h5><p>' + esc(q.correctWhy) + '</p></div>' +
        '<div class="layer"><h5>第 2 层 · 其他选项为什么错</h5><ul>' + wrongList + '</ul></div>' +
        '<div class="layer"><h5>第 3 层 · 考什么知识点</h5><p><a href="#/node/' + q.k + '">' + esc(ns ? ns.name : q.k) + '</a>' +
          '　<span class="st">' + (ns ? stars(ns.star) : '') + '</span>　' + esc(q.sec) + '　难度 ' + stars(q.difficulty) + '</p></div>' +
        '<div class="layer"><h5>第 4 层 · 这个知识点还怎么考过</h5><p>' +
          '题库内该知识点共有 <b>' + Data.questionsOf(q.k).length + '</b> 道' + qWord() + '。' +
          (bankNature().real > 0
            ? '其中可计入考频的真题 ' + bankNature().real + ' 道' +
              (bankNature().recallOnly ? '（<b>全部为回忆版</b>，非官方数据）' : '') + '。'
            : '<span class="warn">历年真题考频：当前题库不含真题，无法统计。</span>') +
          ' 相关知识点：' + ((ns && ns.cmp) ? ns.cmp.map(function (c) { return esc(c.split('：')[0]); }).join('；') : '—') + '</p></div>' +
        '<div class="layer"><h5>第 5 层 · 以后可能怎么变形</h5><p>' + esc(q.trap || '—') +
          ' 命题人通常会在此处叠加「主体变化」「时间节点变化」「程序顺序变化」或「一般规则与例外互换」。</p></div>' +
        '<div class="layer"><h5>第 6 层 · 关联法条</h5><p>' + esc(q.statute || '—') + '　<a href="#/statute">去法条库检索</a></p></div>' +
        '<div class="layer"><h5>第 7 层 · 相似知识点与时间效力</h5>' +
          '<p>' + (q.timeEffect ? '<span class="warn-box">' + esc(q.timeEffect) + '</span>' : '本题不存在新旧法导致答案变化的问题。') + '</p>' +
        '</div>' +
        (correct ? '' :
          '<div class="layer"><h5>错误原因归档</h5><div class="chips" id="reason-chips">' +
          ['知识不会', '记忆错误', '概念混淆', '审题错误', '法条记错', '新旧法混淆', '粗心', '多选漏选', '理解偏差']
            .map(function (r) { return '<button class="chip chip-btn" data-reason="' + r + '" data-qid="' + q.id + '">' + r + '</button>'; }).join('') +
          '</div><div class="tiny">选择后会记入错题本，用于后续的针对性纠偏。</div></div>') +
        '<div class="row-btns">' +
          '<button class="btn" id="next-q">' + (quiz.idx + 1 >= quiz.list.length ? (isExam ? '提交试卷' : '查看本组结果') : '下一题') + '</button>' +
          '<a class="btn btn-ghost" href="#/node/' + q.k + '">复习这个知识点</a>' +
          '<button class="btn btn-ghost" id="similar-q">找相似题目</button>' +
        '</div>' +
      '</div>';
    }

    var isExam = quiz.mode === 'exam';
    var answered = (quiz.results || []).filter(function (r) { return r !== undefined && r !== null; }).length;
    return '<div class="card quiz">' +
      '<div class="quiz-head">' +
        '<div class="crumb"><a href="#/train">题目训练</a> / ' + esc(quiz.title) + '</div>' +
        '<div class="quiz-right">' +
          (isExam ? '<span class="exam-clock" id="exam-clock">' + fmtDur(Date.now() - (quiz.examStart || Date.now())) + '</span>' : '') +
          (isExam ? '<button class="btn btn-sm btn-ghost" id="exam-quit">提前交卷</button>' : '') +
          '<span class="quiz-progress">第 ' + (quiz.idx + 1) + ' / ' + quiz.list.length + ' 题' +
            (isExam ? '　已答 ' + answered : '') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="q-meta">' + srcTag(q.srcLevel) +
        '<span class="tag">' + esc(q.sec) + '</span>' +
        '<span class="tag">' + esc(q.type) + '</span>' +
        '<span class="tag">难度 ' + stars(q.difficulty) + '</span>' +
        '<span class="tag">' + (q.year ? q.year + ' 年 ' + esc(q.stage) : '来源：' + esc(q.src)) + '</span>' +
        (q.no ? '<span class="tag">第 ' + q.no + ' 题</span>' : '') +
      '</div>' +
      '<div class="q-stem">' + esc(q.stem) + '</div>' +
      (multi ? '<div class="tiny">本题为' + esc(q.type) + '，可选择多个选项。</div>' : '') +
      '<div class="opts" id="opts">' + opts + '</div>' +
      (quiz.revealed ? '' :
        '<div class="row-btns"><button class="btn btn-lg" id="submit-q">提交答案</button>' +
        '<button class="btn btn-ghost" id="skip-q">跳过</button></div>') +
      analysis +
    '</div>';
  }

  function renderQuizResult() {
    var total = quiz.list.length;
    var correct = 0;
    var bySec = {};
    quiz.list.forEach(function (q, i) {
      var rec = quiz.results ? quiz.results[i] : null;
      if (rec === true) {
        correct++;
        bySec[q.sec] = bySec[q.sec] || { q: 0, c: 0 };
        bySec[q.sec].q++; bySec[q.sec].c++;
      } else if (rec === false) {
        bySec[q.sec] = bySec[q.sec] || { q: 0, c: 0 };
        bySec[q.sec].q++;
      }
    });
    var acc = total ? Math.round(correct / total * 100) : 0;
    var rows = Object.keys(bySec).map(function (s) {
      var d = bySec[s];
      return '<div class="kv"><span>' + esc(s) + '</span><b>' + d.c + '/' + d.q + '　' + Math.round(d.c / d.q * 100) + '%</b></div>';
    }).join('');
    return '<div class="card"><h3>本组训练结果</h3>' +
      '<div class="stat-row">' +
        '<div class="stat"><b>' + total + '</b><span>题量</span></div>' +
        '<div class="stat"><b>' + correct + '</b><span>正确</span></div>' +
        '<div class="stat"><b>' + acc + '%</b><span>正确率</span></div>' +
      '</div>' + rows +
      '<div class="note">本组为训练模式，成绩仅用于判断掌握情况，不代表考试水平。' +
      '错题已自动进入错题本，并按 1/3/7/14/30 天的间隔安排复习。</div>' +
      '<div class="row-btns"><a class="btn" href="#/wrong">去错题本</a>' +
      '<a class="btn btn-ghost" href="#/train/weak">再做一组薄弱点</a>' +
      '<a class="btn btn-ghost" href="#/dash">回到驾驶舱</a></div></div>';
  }

  /* ==================== 视图：模拟考试 ==================== */
  /* 判定一道题是否为可计入考频的真题 */
  /* 回忆版同样计入「真题」：2018 年后官方不公布真题，
     市场流通的历年真题只可能是回忆版或机构整理版 */
  function isRealQ(q) {
    return q.srcLevel === '官方真题' || q.srcLevel === '机构整理' || q.srcLevel === '回忆版';
  }
  /* 按题型抽题：真题优先，再按板块轮转保证覆盖均衡 */
  function pickByType(type, n) {
    var pool = Data.QUESTIONS.questions.filter(function (q) { return q.type === type; });
    var real = pool.filter(isRealQ);
    var sim = pool.filter(function (q) { return !isRealQ(q); });
    var out = pickBalanced(real, n);
    if (out.length < n) out = out.concat(pickBalanced(sim, n - out.length));
    return out;
  }
  /* 按官方题型结构组一套客观题卷（50 单选 + 35 多选 + 15 不定项） */
  function buildPaper() {
    var per = Data.EXAM.objectiveStructure.perPaper;
    var single = pickByType('单选', per.single.count);
    var multi = pickByType('多选', per.multi.count);
    var indef = pickByType('不定项', per.indefinite.count);
    return {
      list: single.concat(multi, indef),   // 真实考试分题型集中，不打乱顺序
      got: { single: single.length, multi: multi.length, indef: indef.length },
      need: { single: per.single.count, multi: per.multi.count, indef: per.indefinite.count }
    };
  }
  /* 单题分值 */
  function scoreOf(q) {
    var per = Data.EXAM.objectiveStructure.perPaper;
    if (q.type === '单选') return per.single.perScore;
    if (q.type === '多选') return per.multi.perScore;
    return per.indefinite.perScore;
  }
  /* 满分 */
  function fullScore(list) {
    return list.reduce(function (s, q) { return s + scoreOf(q); }, 0);
  }
  function fmtDur(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    function p(x) { return x < 10 ? '0' + x : '' + x; }
    return p(h) + ':' + p(m) + ':' + p(ss);
  }

  function viewExam() {
    var st = Data.EXAM.objectiveStructure;
    var per = st.perPaper;
    var cnt = { '单选': 0, '多选': 0, '不定项': 0 };
    Data.QUESTIONS.questions.forEach(function (q) { if (cnt[q.type] !== undefined) cnt[q.type]++; });

    var gap = {
      single: per.single.count - cnt['单选'],
      multi: per.multi.count - cnt['多选'],
      indef: per.indefinite.count - cnt['不定项']
    };
    var full1 = gap.single <= 0 && gap.multi <= 0 && gap.indef <= 0;
    var full2 = cnt['单选'] >= per.single.count * 2 && cnt['多选'] >= per.multi.count * 2 && cnt['不定项'] >= per.indefinite.count * 2;

    var recs = AppState.state.examRecords.slice(-8).reverse().map(function (r) {
      var sc = (r.score !== undefined && r.full !== undefined) ? (r.score + '/' + r.full + ' 分　') : '';
      return '<div class="kv"><span>' + esc(r.date) + '　' + (r.title ? esc(r.title) + '　' : '') + sc + '用时 ' + r.minutes + ' 分钟</span>' +
        '<b>' + r.correct + '/' + r.size + ' 题　' + Math.round(r.correct / r.size * 100) + '%</b></div>';
    }).join('') || '<div class="muted">还没有模拟考试记录。</div>';

    /* 题型结构表 */
    var structRows = [
      { k: 'single', label: per.single.name, c: per.single.count, p: per.single.perScore },
      { k: 'multi', label: per.multi.name, c: per.multi.count, p: per.multi.perScore },
      { k: 'indefinite', label: per.indefinite.name, c: per.indefinite.count, p: per.indefinite.perScore }
    ].map(function (r) {
      var have = cnt[{ single: '单选', multi: '多选', indefinite: '不定项' }[r.k]] || 0;
      var ok = have >= r.c;
      return '<tr><td>' + esc(r.label) + '</td><td>' + r.c + ' 题</td><td>' + r.p + ' 分/题</td>' +
        '<td>' + (r.c * r.p) + ' 分</td>' +
        '<td>' + have + ' 道　' + (ok ? '<span class="tag lv-ok">充足</span>' : '<span class="tag lv-warn">缺 ' + (r.c - have) + ' 道</span>') + '</td></tr>';
    }).join('');

    return '<div class="card"><h3>客观题模拟考试</h3>' +
      '<div class="note">按<b>官方客观题题型结构</b>组卷：每卷 ' + per.total + ' 题 / ' + per.score + ' 分（' +
        per.single.name + ' ' + per.single.count + ' 题×' + per.single.perScore + ' 分 + ' +
        per.multi.name + ' ' + per.multi.count + ' 题×' + per.multi.perScore + ' 分 + ' +
        per.indefinite.name + ' ' + per.indefinite.count + ' 题×' + per.indefinite.perScore + ' 分）。' +
        '两卷合计 ' + st.totalScore + ' 分，考试时长每卷 ' + st.timePerPaper + '。' +
        '交卷后输出：<b>按分计分</b>的总分、各题型得分率、各板块得分率、答题速度、薄弱点与下一阶段建议。</div>' +
      '<div class="row-btns">' +
        '<button class="btn btn-lg' + (full1 ? '' : ' btn-disabled') + '" data-exam="full"' + (full1 ? '' : ' disabled') + '>标准卷（' + per.total + ' 题 / ' + per.score + ' 分）</button>' +
        '<button class="btn' + (full2 ? '' : ' btn-disabled') + '" data-exam="double"' + (full2 ? '' : ' disabled') + '>双卷连考（' + (per.total * 2) + ' 题 / ' + st.totalScore + ' 分）</button>' +
        '<button class="btn btn-ghost" data-exam="20">快速练卷 20 题</button>' +
        '<button class="btn btn-ghost" data-exam="50">快速练卷 50 题</button>' +
      '</div>' +
      (full1 ? '' : '<div class="warn-box"><b>题库尚不足以组出完整标准卷。</b>缺口：' +
        [gap.single > 0 ? '单选缺 ' + gap.single + ' 道' : '', gap.multi > 0 ? '多选缺 ' + gap.multi + ' 道' : '', gap.indef > 0 ? '不定项缺 ' + gap.indef + ' 道' : '']
          .filter(Boolean).join('、') + '。可先做快速练卷，或在「设置 → 导入题目」补充题目。</div>') +
      '<div class="warn-box">' + bankNotice() + ' 因此这里的成绩是<b>模拟练习水平</b>，不能等同于真实考试水平，仅用于定位薄弱板块与训练答题节奏。</div>' +
      '<div class="note">' + esc(st.note) + '</div>' +
      '</div>' +
      '<div class="grid grid-2">' +
        '<div class="card"><h3>标准卷题型结构（每卷）</h3>' +
          '<table class="tbl"><thead><tr><th>题型</th><th>题量</th><th>分值</th><th>小计</th><th>题库储备</th></tr></thead><tbody>' + structRows + '</tbody></table>' +
          '<div class="kv"><span>合计</span><b>' + per.total + ' 题 / ' + per.score + ' 分</b></div>' +
          '<div class="note">' + esc(st.source) + '</div>' +
        '</div>' +
        '<div class="card"><h3>历史模拟记录</h3>' + recs + '</div>' +
      '</div>';
  }

  function runExam(kind) {
    if (kind === 'full') {
      var p = buildPaper();
      if (p.list.length < 10) { toast('题库题目不足，无法组卷'); return; }
      startQuiz(p.list, '标准卷（' + p.list.length + ' 题 / ' + fullScore(p.list) + ' 分）', 'exam', 'exam/full');
      go('#/train/exam/full');
      return;
    }
    if (kind === 'double') {
      var p1 = buildPaper(), p2 = buildPaper();
      var list = p1.list.concat(p2.list);
      startQuiz(list, '双卷连考（' + list.length + ' 题 / ' + fullScore(list) + ' 分）', 'exam', 'exam/double');
      go('#/train/exam/double');
      return;
    }
    var size = parseInt(kind, 10) || 20;
    var pool = Data.QUESTIONS.questions;
    var real = pool.filter(isRealQ);
    var sim = pool.filter(function (q) { return !isRealQ(q); });
    var list2 = pickBalanced(real, size);
    if (list2.length < size) list2 = list2.concat(pickBalanced(sim, size - list2.length));
    if (list2.length < size) toast('题库题目不足 ' + size + ' 道，本次组卷 ' + list2.length + ' 题');
    startQuiz(list2, '快速练卷（' + list2.length + ' 题）', 'exam', 'exam/' + kind);
    go('#/train/exam/' + kind);
  }

  /* ==================== 视图：命题陷阱库 ==================== */
  /* 陷阱类型自动归类（基于关键词匹配，仅作聚类参考，不是官方分类） */
  var TRAP_TAGS = [
    { name: '期限与时间', kw: ['期间', '时效', '期限', '起算', '届满', '之日', '超过', '以内', '次日'] },
    { name: '主体与资格', kw: ['主体', '资格', '身份', '无权', '越权', '法定代理人', '代表人'] },
    { name: '顺序与程序', kw: ['顺序', '前置', '程序', '送达', '立案', '复议', '审理'] },
    { name: '例外与但书', kw: ['例外', '除外', '但书', '不适用', '不属于'] },
    { name: '一般与特殊', kw: ['一般规定', '特殊', '优先', '特别法', '优于', '特别规定'] },
    { name: '概念混淆', kw: ['混淆', '误认为', '等同于', '当成', '区别', '区分'] },
    { name: '范围与数量', kw: ['范围', '数量', '比例', '上限', '下限', '至少', '至多'] },
    { name: '构成要件', kw: ['要件', '构成', '成立', '既遂', '未遂'] },
    { name: '举证与责任', kw: ['举证', '证明', '倒置', '责任'] }
  ];
  function trapTagsOf(text) {
    var t = String(text || '');
    var hit = [];
    TRAP_TAGS.forEach(function (tag) {
      for (var i = 0; i < tag.kw.length; i++) {
        if (t.indexOf(tag.kw[i]) > -1) { hit.push(tag.name); break; }
      }
    });
    return hit;
  }
  function collectTraps() {
    var out = [];
    Data.QUESTIONS.questions.forEach(function (q) {
      if (!q.trap) return;
      out.push({ q: q, node: Data.findNode(q.k), tags: trapTagsOf(q.trap) });
    });
    return out;
  }
  var trapLimit = 60;
  function viewTrap(arg) {
    var all = collectTraps();
    var kw = arg ? decodeURIComponent(arg) : '';
    var bySec = {}, byTag = {};
    all.forEach(function (t) {
      bySec[t.q.sec] = (bySec[t.q.sec] || 0) + 1;
      t.tags.forEach(function (g) { byTag[g] = (byTag[g] || 0) + 1; });
    });

    var list = all, mode = '全部陷阱条目';
    if (kw) {
      if (byTag[kw]) { list = all.filter(function (t) { return t.tags.indexOf(kw) > -1; }); mode = '陷阱类型 · ' + kw; }
      else { list = all.filter(function (t) { return t.q.sec === kw; }); mode = '板块 · ' + kw; }
    }
    var shown = list.slice(0, trapLimit);

    var items = shown.map(function (t) {
      var tagChips = t.tags.map(function (g) {
        return '<a class="chip chip-sm" href="#/trap/' + encodeURIComponent(g) + '">' + esc(g) + '</a>';
      }).join('');
      return '<div class="trap-item">' +
        '<div class="trap-item-head">' +
          '<span class="tag">' + esc(t.q.sec) + '</span>' + srcTag(t.q.srcLevel) +
          '<b>' + esc(t.node ? t.node.name : t.q.k) + '</b>' +
        '</div>' +
        '<div class="trap-item-body">' + esc(t.q.trap) + '</div>' +
        '<div class="trap-item-foot">' + tagChips +
          '<a class="btn btn-sm" href="#/train/single/' + t.q.id + '">练这道题</a>' +
        '</div>' +
      '</div>';
    }).join('') || '<div class="muted">没有匹配的陷阱条目。</div>';

    var secChips = Data.KNOWLEDGE.sections.map(function (s) {
      return '<a class="chip' + (kw === s.key ? ' chip-on' : '') + '" href="#/trap/' + encodeURIComponent(s.key) + '">' +
        esc(s.key) + '（' + (bySec[s.key] || 0) + '）</a>';
    }).join('');
    var tagChips = TRAP_TAGS.filter(function (g) { return byTag[g.name]; }).map(function (g) {
      return '<a class="chip' + (kw === g.name ? ' chip-on' : '') + '" href="#/trap/' + encodeURIComponent(g.name) + '">' +
        esc(g.name) + '（' + byTag[g.name] + '）</a>';
    }).join('');

    return '<div class="card"><h3>命题陷阱库</h3>' +
      '<div class="note">汇总题库中全部题目的<b>命题陷阱说明</b>——命题人在这道题上挖的坑、最容易掉进去的思维惯性。' +
      '陷阱类型按关键词自动归类，<b>只作聚类参考，不是官方分类</b>。</div>' +
      '<div class="stat-row">' +
        '<div class="stat"><b>' + all.length + '</b><span>陷阱条目总数</span></div>' +
        '<div class="stat"><b>' + Object.keys(bySec).length + '</b><span>覆盖板块</span></div>' +
        '<div class="stat"><b>' + Object.keys(byTag).length + '</b><span>识别出的类型</span></div>' +
      '</div>' +
      '<h4 class="mt">按板块筛选</h4><div class="chips">' +
        '<a class="chip' + (!kw ? ' chip-on' : '') + '" href="#/trap">全部（' + all.length + '）</a>' + secChips + '</div>' +
      '<h4 class="mt">按陷阱类型筛选</h4><div class="chips">' + tagChips + '</div>' +
      '</div>' +
      '<div class="card"><h3>' + esc(mode) + '　<span class="tiny muted">共 ' + list.length + ' 条，已显示 ' + shown.length + ' 条</span></h3>' +
        '<div class="trap-list-wrap">' + items + '</div>' +
        (list.length > shown.length ? '<div class="row-btns"><button class="btn" id="trap-more">再显示 60 条</button></div>' : '') +
      '</div>';
  }

  /* ==================== 视图：相似概念对比辨析 ==================== */
  function collectCompares() {
    var out = [];
    Data.KNOWLEDGE.nodes.forEach(function (n) {
      (n.cmp || []).forEach(function (c) {
        var s = String(c), i = s.indexOf('：');
        out.push({ node: n, pair: i > -1 ? s.slice(0, i) : s, desc: i > -1 ? s.slice(i + 1) : '' });
      });
    });
    return out;
  }
  /* 找出「考概念区分」的题目：陷阱描述里提到混淆 / 区别 / 等同 */
  function confusionQuestions() {
    var kw = ['混淆', '区别', '区分', '等同于', '误认为', '当成'];
    return Data.QUESTIONS.questions.filter(function (q) {
      var t = String(q.trap || '');
      return kw.some(function (k) { return t.indexOf(k) > -1; });
    });
  }
  var cmpLimit = 24;
  function viewCompare(arg) {
    var all = collectCompares();
    var kw = arg ? decodeURIComponent(arg) : '';
    var list = kw ? all.filter(function (c) { return c.node.sec === kw; }) : all;
    var shown = list.slice(0, cmpLimit);
    var bySec = {};
    all.forEach(function (c) { bySec[c.node.sec] = (bySec[c.node.sec] || 0) + 1; });

    var cards = shown.map(function (c, i) {
      var parts = c.pair.split(/\s+vs\s+|\s+VS\s+/i);
      var title = parts.length === 2
        ? '<span class="cmp-a">' + esc(parts[0]) + '</span><span class="cmp-vs">vs</span><span class="cmp-b">' + esc(parts[1]) + '</span>'
        : esc(c.pair);
      return '<div class="cmp-card">' +
        '<div class="cmp-head"><div class="cmp-title">' + title + '</div>' +
          '<span class="tiny muted">' + esc(c.node.sec) + ' · ' + esc(c.node.name) + '</span></div>' +
        '<div class="cmp-body" data-cmp-body="' + i + '" hidden>' +
          esc(c.desc || '（本对比对暂无展开说明，请参考该知识节点的完整讲解）') + '</div>' +
        '<div class="row-btns">' +
          '<button class="btn btn-sm" data-cmp-toggle="' + i + '">展开辨析</button>' +
          '<a class="btn btn-sm btn-ghost" href="#/node/' + c.node.id + '">打开完整讲解</a>' +
        '</div>' +
      '</div>';
    }).join('') || '<div class="muted">没有匹配的对比条目。</div>';

    var cq = confusionQuestions();
    var secChips = Data.KNOWLEDGE.sections.map(function (s) {
      return '<a class="chip' + (kw === s.key ? ' chip-on' : '') + '" href="#/compare/' + encodeURIComponent(s.key) + '">' +
        esc(s.key) + '（' + (bySec[s.key] || 0) + '）</a>';
    }).join('');

    return '<div class="card"><h3>相似概念对比辨析</h3>' +
      '<div class="note">法考失分的一大来源是<b>概念混在一起</b>：法律原则与法律规则、正当防卫与紧急避险、保证与担保……' +
      '这里把知识库中所有成对的相似概念抽出来。卡片默认<b>遮住辨析内容</b>——先自己回忆区别，再展开对照，' +
      '这比直接读一遍有效得多。</div>' +
      '<div class="stat-row">' +
        '<div class="stat"><b>' + all.length + '</b><span>对比对总数</span></div>' +
        '<div class="stat"><b>' + Object.keys(bySec).length + '</b><span>覆盖板块</span></div>' +
        '<div class="stat"><b>' + cq.length + '</b><span>可用的辨析训练题</span></div>' +
      '</div>' +
      '<div class="row-btns">' +
        '<button class="btn btn-lg" id="cmp-train">开始对比辨析训练（' + Math.min(20, cq.length) + ' 题）</button>' +
      '</div>' +
      '<div class="note">训练题从题库中「命题陷阱涉及概念混淆」的题目里抽取，做完能看出哪类概念最容易搞混。</div>' +
      '<h4 class="mt">按板块筛选</h4><div class="chips">' +
        '<a class="chip' + (!kw ? ' chip-on' : '') + '" href="#/compare">全部（' + all.length + '）</a>' + secChips + '</div>' +
      '</div>' +
      '<div class="card"><h3>对比卡片　<span class="tiny muted">共 ' + list.length + ' 对，已显示 ' + shown.length + ' 对</span></h3>' +
        '<div class="cmp-grid">' + cards + '</div>' +
        (list.length > shown.length ? '<div class="row-btns"><button class="btn" id="cmp-more">再显示 24 对</button></div>' : '') +
      '</div>';
  }

  /* ==================== 视图：错题本 ==================== */
  function viewWrong() {
    var ws = AppState.state.wrong.slice().sort(function (a, b) {
      if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
      return (a.nextDue || '').localeCompare(b.nextDue || '');
    });
    if (!ws.length) return '<div class="card"><h3>错题本</h3><div class="muted">还没有错题。做错的题会自动进入这里，并按间隔重复安排复习。</div>' +
      '<div class="row-btns"><a class="btn" href="#/train">开始做题</a></div></div>';

    var t = AppState.todayStr();
    var rows = ws.map(function (w) {
      var q = Data.findQuestion(w.qid);
      if (!q) return '';
      var node = Data.findNode(w.nodeId);
      var due = w.nextDue ? AppState.daysBetween(t, w.nextDue) : 0;
      var status = w.mastered ? '<span class="tag lv-ok">已掌握</span>' :
        (due <= 0 ? '<span class="tag lv-bad">今日复习</span>' : '<span class="tag lv-ok2">' + due + ' 天后</span>');
      return '<tr>' +
        '<td class="tiny">' + esc(w.date) + '</td>' +
        '<td><b>' + esc(node ? node.name : w.nodeId) + '</b><div class="tiny">' + esc(q.stem.slice(0, 40)) + '…</div></td>' +
        '<td>' + esc((w.myAnswer || []).join('')) + ' → <b class="ok-text">' + esc((w.correctAnswer || []).join('')) + '</b></td>' +
        '<td>' + esc(w.reason || '未归档') + '</td>' +
        '<td>' + w.times + ' 次</td>' +
        '<td>' + status + '<div class="tiny">SRS 第 ' + (w.stage + 1) + ' 阶</div></td>' +
        '<td><a class="btn btn-sm" href="#/train/due">复习</a></td>' +
      '</tr>';
    }).join('');

    var reasons = ['知识不会', '记忆错误', '概念混淆', '审题错误', '法条记错', '新旧法混淆', '粗心', '多选漏选', '理解偏差'];
    var stat = {};
    ws.forEach(function (w) { if (w.reason) stat[w.reason] = (stat[w.reason] || 0) + 1; });
    var statHtml = reasons.map(function (r) {
      return '<div class="kv"><span>' + r + '</span><b>' + (stat[r] || 0) + ' 道</b></div>';
    }).join('');

    return '<div class="card"><h3>错题本</h3>' +
      '<div class="stat-row">' +
        '<div class="stat"><b>' + ws.length + '</b><span>错题总数</span></div>' +
        '<div class="stat"><b>' + ws.filter(function (w) { return !w.mastered; }).length + '</b><span>待复习</span></div>' +
        '<div class="stat"><b>' + AppState.dueWrongQuestions().length + '</b><span>今日到期</span></div>' +
      '</div>' +
      '<div class="note">间隔重复机制：答错后当天、1 天后、3 天后、7 天后、14 天后、30 天后依次复习。' +
      '连续答对会延长复习周期；再次答错则回到第一阶段重新高频复习。</div>' +
      '<div class="row-btns"><a class="btn" href="#/train/due">开始今日错题复习</a></div>' +
      '</div>' +
      '<div class="grid grid-2">' +
        '<div class="card"><h3>错题明细</h3><table class="tbl"><thead><tr><th>日期</th><th>题目</th><th>答案</th><th>错误原因</th><th>次数</th><th>复习状态</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="card"><h3>错误原因分布</h3>' + statHtml +
          '<div class="note">「知识不会」需要通过重学解决；「概念混淆」需要做对比训练；' +
          '「审题错误」「粗心」「多选漏选」属于技术性问题，靠答题习惯训练解决。</div>' +
          '<div class="row-btns"><a class="btn btn-ghost" href="#/compare">去对比辨析训练</a></div></div>' +
      '</div>';
  }

  /* ==================== 视图：法条库 ==================== */
  function viewStatute(arg) {
    var kw = arg ? decodeURIComponent(arg) : '';
    var list = Data.STATUTES.statutes.filter(function (s) {
      if (!kw) return true;
      var hay = (s.law + s.art + s.key + (s.keywords || []).join('') + s.scene).toLowerCase();
      return hay.indexOf(kw.toLowerCase()) > -1;
    });
    var groups = {};
    list.forEach(function (s) { (groups[s.law] = groups[s.law] || []).push(s); });
    var body = Object.keys(groups).map(function (law) {
      return '<div class="sec-block"><div class="sec-head"><b>' + esc(law) + '</b>' +
        '<span class="muted">' + groups[law].length + ' 条</span></div>' +
        groups[law].map(function (s) {
          return '<div class="statute"><div class="statute-head"><b>' + esc(s.art) + '</b>' +
            '<span class="tag ' + (s.level === '必须背' ? 'lv-ok' : s.level === '必须熟悉' ? 'lv-ok2' : 'lv-sim') + '">' + esc(s.level) + '</span>' +
            '<a class="btn btn-sm btn-ghost" href="#/node/' + s.node + '">关联知识点</a></div>' +
            '<div class="statute-key">' + esc(s.key) + '</div>' +
            (s.warning ? '<div class="warn-box">' + esc(s.warning) + '</div>' : '') +
            '<div class="tiny">关键词：' + (s.keywords || []).join('、') + '　适用场景：' + esc(s.scene) + '</div></div>';
        }).join('') + '</div>';
    }).join('');

    var lv = { '必须背': 0, '必须熟悉': 0, '知道位置即可': 0 };
    Data.STATUTES.statutes.forEach(function (s) { lv[s.level] = (lv[s.level] || 0) + 1; });

    return '<div class="card"><h3>法条库</h3>' +
      '<div class="search-row"><input id="statute-kw" placeholder="输入关键词、法律名称或条文号检索（如：保证 期间 / 第563条）" value="' + esc(kw) + '">' +
      '<button class="btn" id="statute-go">检索</button></div>' +
      '<div class="stat-row">' +
        '<div class="stat"><b>' + Data.STATUTES.statutes.length + '</b><span>已录入条文</span></div>' +
        '<div class="stat"><b>' + lv['必须背'] + '</b><span>必须背</span></div>' +
        '<div class="stat"><b>' + lv['必须熟悉'] + '</b><span>必须熟悉</span></div>' +
        '<div class="stat"><b>' + list.length + '</b><span>当前检索结果</span></div>' +
      '</div>' +
      '<div class="note">主观题考试由司法行政机关统一提供电子法律法规，可以随时查阅。' +
      '所以条文不必逐字背，但<b>必须能在 30 秒内定位到</b>——这正是「必须背 / 必须熟悉 / 知道位置即可」三级分类的意义。</div>' +
      '<div class="warn-box">' + esc(Data.STATUTES.disclaimer) + '</div>' +
      '</div>' + (body || '<div class="card muted">没有匹配的条文。</div>');
  }

  /* ==================== 视图：新法专区 ==================== */
  function viewNewlaw() {
    var groups = {};
    Data.NEWLAWS.items.forEach(function (i) { (groups[i.group] = groups[i.group] || []).push(i); });

    var body = Object.keys(groups).map(function (g) {
      return '<div class="sec-block"><div class="sec-head"><b>' + esc(g) + '</b><span class="muted">' + groups[g].length + ' 条</span></div>' +
        groups[g].map(function (i) {
          return '<div class="nl-card">' +
            '<div class="nl-head"><b>' + esc(i.name) + '</b>' + levelTag(i.level) +
              '<span class="tag">' + esc(i.status) + '</span>' +
              '<span class="tag">生效：' + esc(i.effective) + '</span>' +
              '<span class="fire fire-' + (i.fire === '高' ? 'h' : i.fire === '中' ? 'm' : 'l') + '">🔥 命题可能性 ' + esc(i.fire) + '</span></div>' +
            '<div class="nl-grid">' +
              '<div><h5>修改前</h5><p>' + esc(i.before) + '</p></div>' +
              '<div><h5>修改后</h5><p>' + esc(i.after) + '</p></div>' +
              '<div><h5>为什么修改</h5><p>' + esc(i.why) + '</p></div>' +
              '<div><h5>考试可能怎么考</h5><p>' + esc(i.howExam) + '</p></div>' +
              '<div><h5>关联旧真题 / 旧答案是否需修正</h5><p>' + esc(i.oldQuestionImpact) + '</p></div>' +
              '<div><h5>证据来源</h5><p>' + esc(i.evidence) + '</p></div>' +
            '</div>' +
            (i.correction ? '<div class="warn-box"><b>⚠️ 已纠正的说法：</b>' + esc(i.correction) + '</div>' : '') +
            (i.note ? '<div class="note">' + esc(i.note) + '</div>' : '') +
            '<div class="tiny">命题可能性为预测，不是确定考点。' + esc(i.fireNote) + '</div>' +
          '</div>';
        }).join('') + '</div>';
    }).join('');

    var corr = Data.NEWLAWS.corrections.map(function (c) {
      return '<div class="corr"><div class="corr-head">' + esc(c.id) + '　<span class="lv-bad tag">' + esc(c.verdict) + '</span></div>' +
        '<div class="corr-claim">流传说法：「' + esc(c.claim) + '」</div>' +
        '<div class="corr-detail">' + esc(c.detail) + '</div>' +
        '<div class="corr-action">本系统处理：' + esc(c.action) + '</div></div>';
    }).join('');

    var srcs = Data.NEWLAWS.sources.map(function (s) {
      return '<div class="kv"><span>' + esc(s.name) + '</span><b>' + esc(s.level) + '</b></div>';
    }).join('');

    return '<div class="card"><h3>2026 法考新法专区</h3>' +
      '<div class="note">' + esc(Data.NEWLAWS.verifyNote) + '</div>' +
      '<div class="kv"><span>核验日期</span><b>' + esc(Data.NEWLAWS.verifiedAt) + '</b></div>' +
      '<div class="kv"><span>已核验条目</span><b>' + Data.NEWLAWS.items.length + ' 条</b></div>' +
      '<div class="kv"><span>已纠正的错误说法</span><b>' + Data.NEWLAWS.corrections.length + ' 条</b></div>' +
      '<div class="note"><b>结论等级说明：</b>' +
        levelTag('官方已确认') + ' 可作为确定考点　' +
        levelTag('官方来源可推知') + ' 可作为考点，措辞谨慎　' +
        levelTag('二手来源，未核实') + ' 仅作方向提示　' +
        levelTag('查无实据') + ' 不得进入考点库　' +
        levelTag('与官方法条矛盾') + ' 明确标注为错误</div>' +
      '</div>' +

      '<div class="card"><h3>⚠️ 已纠正的错误说法（本系统的核心价值之一）</h3>' +
        '<div class="note">这些说法在备考圈流传较广，但经官方来源核验后不成立。' +
        '<b>如果你手上的资料有这些表述，请以官方法条为准。</b></div>' + corr + '</div>' +

      body +

      '<div class="card"><h3>官方核验来源</h3>' + srcs + '</div>';
  }

  /* ==================== 视图：主观题 ==================== */
  function viewSubj(arg) {
    var S = Data.SUBJECTIVE;
    if (arg && arg.indexOf('case/') === 0) {
      var cid = arg.slice(5);
      var c = S.cases.filter(function (x) { return x.id === cid; })[0];
      if (!c) return '<div class="card">未找到该案例。</div>';
      return renderSubjCase(c);
    }

    var cards = S.cases.map(function (c) {
      return '<a class="case-card" href="#/subj/case/' + c.id + '">' +
        '<div class="case-top"><span class="tag">' + esc(c.sec) + '</span>' +
        '<span class="tag">难度 ' + stars(c.difficulty) + '</span></div>' +
        '<b>' + esc(c.title) + '</b>' +
        '<div class="tiny">' + esc(c.questions.length + ' 个问题 · ' + c.scoringPoints.length + ' 个得分点') + '</div>' +
        '<div class="tiny muted">' + esc(c.note) + '</div></a>';
    }).join('');

    return '<div class="card"><h3>主观题专项系统</h3>' +
      '<div class="kv"><span>考试时间</span><b>' + esc(S.meta.exam) + '</b></div>' +
      '<div class="kv"><span>题型</span><b>' + esc(S.meta.types) + '</b></div>' +
      '<div class="kv"><span>考查科目</span><b>' + S.meta.subjects.length + ' 项</b></div>' +
      '<div class="note">' + esc(S.meta.feature) + '</div>' +
      '<div class="warn-box">' + esc(S.meta.disclaimer) + '</div>' +
      '</div>' +

      '<div class="grid grid-2">' +
        '<div class="card"><h3>' + esc(S.caseMethod.title) + '</h3>' +
          '<div class="note">' + esc(S.caseMethod.principle) + '</div>' +
          S.caseMethod.steps.map(function (s) {
            return '<div class="step"><i>' + s.no + '</i><div><b>' + esc(s.name) + '</b><p>' + esc(s.desc) + '</p>' +
              '<div class="tiny muted">示例：' + esc(s.example) + '</div></div></div>';
          }).join('') +
          '<div class="warn-box">' + esc(S.caseMethod.warning) + '</div>' +
        '</div>' +
        '<div class="card"><h3>' + esc(S.answerFrame.title) + '</h3>' +
          S.answerFrame.segments.map(function (s) {
            return '<div class="step"><i>' + s.no + '</i><div><b>' + esc(s.name) + '</b><p>' + esc(s.desc) + '</p>' +
              '<div class="tiny muted">模板：' + esc(s.template) + '</div></div></div>';
          }).join('') +
          '<div class="note">' + esc(S.answerFrame.rule) + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="grid grid-2">' +
        '<div class="card"><h3>' + esc(S.scoringGuide.title) + '</h3>' +
          S.scoringGuide.items.map(function (p) {
            return '<div class="kv"><span>' + esc(p.point) + '　<span class="tiny muted">' + esc(p.desc) + '</span></span><b>' + esc(p.weight) + '</b></div>';
          }).join('') +
          '<div class="warn-box">' + esc(S.scoringGuide.warning) + '</div>' +
        '</div>' +
        '<div class="card"><h3>' + esc(S.timePlan.title) + '</h3>' +
          S.timePlan.plan.map(function (p) {
            return '<div class="step"><i>·</i><div><b>' + esc(p.phase) + '</b><p>' + esc(p.desc) + '</p></div></div>';
          }).join('') +
          '<div class="note">' + esc(S.timePlan.tip) + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card"><h3>训练案例</h3><div class="case-grid">' + cards + '</div></div>' +

      '<div class="card"><h3>' + esc(S.essayFrame.title) + '</h3>' +
        S.essayFrame.structure.map(function (s) {
          return '<div class="step"><i>' + s.no + '</i><div><b>' + esc(s.name) + '</b><p>' + esc(s.desc) + '</p></div></div>';
        }).join('') +
        '<ul class="trap-list">' + S.essayFrame.tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '</div>';
  }

  /* 自评档位判断（不给分数预测，只给结构完整度判断） */
  function subjVerdict(hit, total) {
    if (!total) return '';
    if (hit === 0) {
      return '<div class="note">还没有勾选任何踩分点。先在「第三步」写下你的答案，再回到这里逐条对照——' +
        '<b>先写后对</b>，比直接读答案有效得多。</div>';
    }
    var r = hit / total, band, cls, advice;
    if (r >= 0.85) { band = '高质量档'; cls = 'lv-ok'; advice = '骨架完整、要点齐全。接下来练的是表达精炼度与法言法语规范度。'; }
    else if (r >= 0.6) { band = '合格档'; cls = 'lv-ok2'; advice = '能拿到主要分数，但仍有明显遗漏。逐条看未勾选的点，判断是「没想到」还是「想到了没写」——后者靠答题习惯解决，前者要回去补知识。'; }
    else if (r >= 0.35) { band = '最低得分档'; cls = 'lv-warn'; advice = '命中偏少。回到「拆解案例」重新走一遍：主体 → 行为 → 法律关系 → 争议焦点，通常卡在法律关系定性上。'; }
    else { band = '需重学'; cls = 'lv-bad'; advice = '命中率偏低。建议先回到关联知识节点把结论和法条背熟，再回来重写这道题。'; }
    return '<div class="kv"><span>踩分点命中</span><b>' + hit + ' / ' + total + '　' + Math.round(r * 100) + '%</b></div>' +
      '<div class="warn-box"><span class="tag ' + cls + '">自评档位：' + band + '</span>　' + advice +
      '<br><span class="tiny">这是你对自己的自评，<b>不是阅卷得分</b>。主观题真实得分取决于阅卷老师对表述、逻辑、法言法语的综合判断，本系统不做任何分数预测。</span></div>';
  }

  function renderSubjCase(c) {
    var b = c.breakdown;
    var saved = AppState.getSubjAnswer(c.id);
    function list(arr) { return '<ul class="plain-list">' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; }
    return '<div class="card"><div class="crumb"><a href="#/subj">主观题</a> / 训练案例</div>' +
      '<h2>' + esc(c.title) + '</h2>' +
      '<div class="node-meta"><span class="tag">' + esc(c.sec) + '</span><span class="tag">难度 ' + stars(c.difficulty) + '</span>' +
      '<span class="tag">' + esc(c.note) + '</span></div>' +
      '<h4 class="mt">案情</h4><div class="facts">' + esc(c.facts).replace(/\n/g, '<br>') + '</div>' +
      '</div>' +

      '<div class="card"><h3>第一步：拆解案例</h3>' +
        '<div class="grid grid-3">' +
          '<div class="bd"><h5>① 主体</h5>' + list(b.parties) + '</div>' +
          '<div class="bd"><h5>② 时间线</h5>' + list(b.timeline) + '</div>' +
          '<div class="bd"><h5>③ 行为</h5>' + list(b.acts) + '</div>' +
        '</div>' +
        '<div class="grid grid-2">' +
          '<div class="bd"><h5>④ 法律关系</h5>' + list(b.relations) + '</div>' +
          '<div class="bd"><h5>⑤ 争议焦点</h5>' + list(b.issues) + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card"><h3>第二步：问题</h3>' + list(c.questions) + '</div>' +

      '<div class="card"><h3>第三步：自己写一遍</h3>' +
        '<div class="note">先别往下翻。用你自己的话把结论和理由写出来——哪怕写得很糙。' +
        '写完再对照踩分点和范文，你才会看清自己真正缺的是哪一环。内容只保存在本机浏览器里。</div>' +
        '<textarea class="subj-input" id="subj-input" placeholder="在这里作答……（写完点下面的保存，会自动记住）">' +
          esc(saved ? (saved.text || '') : '') + '</textarea>' +
        '<div class="row-btns">' +
          '<button class="btn" id="subj-save">保存作答</button>' +
          '<span class="tiny muted" id="subj-saved-at">' + (saved ? '上次保存：' + esc(saved.at) : '尚未保存') + '</span>' +
        '</div>' +
        (saved && saved.history && saved.history.length ?
          '<details class="mt"><summary class="tiny">查看历次作答（' + saved.history.length + ' 次）</summary>' +
          saved.history.slice().reverse().map(function (h) {
            return '<div class="subj-history"><div class="tiny muted">' + esc(h.at || '') + '　命中 ' +
              ((h.checked || []).length) + ' 个踩分点</div>' +
              '<div class="subj-history-text">' + esc(h.text || '（未填写）') + '</div></div>';
          }).join('') + '</details>' : '') +
      '</div>' +

      '<div class="card"><h3>第四步：对照踩分点自评</h3>' +
        '<div class="note">这就是阅卷老师在找的东西。逐条勾选你<b>实际写到了</b>的点。' +
        '<b>诚实勾选才有意义</b>——勾满不会让考卷多得分，只会让你看不清自己。</div>' +
        '<div class="score-check" id="subj-check">' +
          c.scoringPoints.map(function (p, i) {
            var on = saved && (saved.checked || []).indexOf(i) > -1;
            return '<label class="score-item' + (on ? ' on' : '') + '">' +
              '<input type="checkbox" data-sp="' + i + '"' + (on ? ' checked' : '') + '>' +
              '<span>' + esc(p) + '</span></label>';
          }).join('') +
        '</div>' +
        '<div id="subj-verdict" class="mt"></div>' +
      '</div>' +

      '<div class="card"><h3>第五步：答案三档对照</h3>' +
        '<div class="note">写完、自评完，再来看范文。对照时重点看：同一层意思，范文是怎么组织语言和法条的。</div>' +
        '<div class="tier"><div class="tier-head">最低得分版<span class="tiny">只写最关键踩分点</span></div>' +
          '<div class="tier-body">' + esc(c.answers.min).replace(/\n/g, '<br>') + '</div></div>' +
        '<div class="tier"><div class="tier-head">合格版<span class="tiny">适合真实考试</span></div>' +
          '<div class="tier-body">' + esc(c.answers.ok).replace(/\n/g, '<br>') + '</div></div>' +
        '<div class="tier tier-high"><div class="tier-head">高质量版<span class="tiny">逻辑完整、法言法语规范</span></div>' +
          '<div class="tier-body">' + esc(c.answers.high).replace(/\n/g, '<br>') + '</div></div>' +
        '<div class="note">学习路径：先看「最低得分版」理解骨架，再看「合格版」学结构，' +
        '最后看「高质量版」学如何把规则、事实、结论层层铺开。</div>' +
      '</div>' +

      '<div class="grid grid-2">' +
        '<div class="card"><h3>关联法条</h3><div class="chips">' +
          c.statutes.map(function (s) { return '<span class="chip">' + esc(s) + '</span>'; }).join('') + '</div></div>' +
        '<div class="card"><h3>本题陷阱</h3><ul class="trap-list">' +
          c.traps.map(function (t) { return '<li><span class="trap-mark">陷阱</span>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '</div>';
  }

  /* ---------------- 学习趋势图（内联 SVG，零依赖） ---------------- */
  function buildTrendChart(days) {
    var t = AppState.todayStr();
    var logs = AppState.state.logs || [];
    var series = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = AppState.addDays(t, -i);
      var f = null;
      for (var j = 0; j < logs.length; j++) { if (logs[j].date === d) { f = logs[j]; break; } }
      series.push({
        date: d, short: d.slice(5),
        q: f ? (f.qCount || 0) : 0,
        acc: (f && f.qCount) ? Math.round(f.qCorrect / f.qCount * 100) : null,
        min: f ? (f.minutes || 0) : 0
      });
    }
    var W = 680, H = 220, PL = 44, PR = 46, PT = 20, PB = 34;
    var iw = W - PL - PR, ih = H - PT - PB;
    var maxQ = Math.max(10, Math.max.apply(null, series.map(function (s) { return s.q; })));
    var step = iw / series.length;
    var bw = Math.max(5, step * 0.52);

    var bars = series.map(function (s, i) {
      var h = ih * (s.q / maxQ);
      var x = PL + i * step + (step - bw) / 2;
      var y = PT + ih - h;
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + Math.max(0, h).toFixed(1) + '" rx="2" fill="#4C7BE0" opacity="' + (s.q ? '0.78' : '0.13') + '">' +
        '<title>' + s.date + '　' + s.q + ' 题　' + s.min + ' 分钟</title></rect>';
    }).join('');

    var pts = [];
    series.forEach(function (s, i) {
      if (s.acc === null) return;
      pts.push([PL + i * step + step / 2, PT + ih - ih * (s.acc / 100), s]);
    });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var dots = pts.map(function (p) {
      return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="#3E9E6C">' +
        '<title>' + p[2].date + '　正确率 ' + p[2].acc + '%</title></circle>';
    }).join('');

    var grid = '';
    [0, 0.5, 1].forEach(function (f) {
      var y = PT + ih - ih * f;
      grid += '<line x1="' + PL + '" y1="' + y.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + y.toFixed(1) +
        '" stroke="#2C333F" stroke-dasharray="3 4"/>' +
        '<text x="' + (PL - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="#6F7A8B">' + Math.round(maxQ * f) + '</text>' +
        '<text x="' + (W - PR + 8) + '" y="' + (y + 4).toFixed(1) + '" font-size="10" fill="#3E9E6C">' + Math.round(100 * f) + '%</text>';
    });

    var every = days > 20 ? 5 : 2;
    var xlabels = series.map(function (s, i) {
      if (i % every !== 0 && i !== series.length - 1) return '';
      return '<text x="' + (PL + i * step + step / 2).toFixed(1) + '" y="' + (H - 12) +
        '" text-anchor="middle" font-size="10" fill="#6F7A8B">' + s.short + '</text>';
    }).join('');

    var hasData = series.some(function (s) { return s.q > 0; });
    return '<div class="chart-wrap"><svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H +
      '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="近 ' + days + ' 天学习趋势">' +
      grid + bars + (line ? '<path d="' + line + '" fill="none" stroke="#3E9E6C" stroke-width="2"/>' : '') + dots + xlabels +
      '<text x="' + PL + '" y="' + (PT - 5) + '" font-size="10" fill="#A9B3C2">柱＝每日答题量</text>' +
      '<text x="' + (W - PR) + '" y="' + (PT - 5) + '" text-anchor="end" font-size="10" fill="#3E9E6C">折线＝当日正确率</text>' +
      '</svg></div>' +
      (hasData ? '' : '<div class="muted tiny">这 ' + days + ' 天还没有学习记录。做几道题，趋势就会出现。</div>');
  }

  /* ==================== 视图：学习数据 ==================== */
  function viewData(arg) {
    var trendDays = arg === '30' ? 30 : 14;
    var sum = AppState.summary();
    var wr = AppState.weeklyReport();
    var logs = AppState.state.logs.slice(-14).reverse();

    var radar = buildRadar(sum);

    var logRows = logs.map(function (l) {
      return '<tr><td>' + esc(l.date) + '</td><td>' + l.qCount + '</td>' +
        '<td>' + (l.qCount ? Math.round(l.qCorrect / l.qCount * 100) + '%' : '—') + '</td>' +
        '<td>' + (l.minutes || 0) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="muted">还没有学习记录。</td></tr>';

    var secRows = Data.KNOWLEDGE.sections.map(function (s) {
      var d = sum.bySec[s.key] || { sum: 0, cnt: 0, total: 0 };
      var m = d.cnt ? Math.round(d.sum / d.cnt) : null;
      return '<div class="sec-row"><span class="sec-name" style="border-color:' + s.color + '">' + esc(s.key) + '</span>' +
        '<div class="sec-bar">' + bar(m || 0, s.color) + '</div>' +
        '<span class="sec-val">' + (m === null ? '未采集' : m + '%') + '</span></div>';
    }).join('');

    var ws = wr.bySec;
    var wrRows = Object.keys(ws).map(function (k) {
      return '<div class="kv"><span>' + esc(k) + '</span><b>' + ws[k].c + '/' + ws[k].q + '　' + Math.round(ws[k].c / ws[k].q * 100) + '%</b></div>';
    }).join('') || '<div class="muted">本周还没有答题记录。</div>';

    return '<div class="card"><h3>法考学习周报（近 7 天）</h3>' +
      '<div class="stat-row">' +
        '<div class="stat"><b>' + wr.minutes + '</b><span>学习分钟</span></div>' +
        '<div class="stat"><b>' + wr.q + '</b><span>刷题数量</span></div>' +
        '<div class="stat"><b>' + (wr.acc === null ? '—' : wr.acc + '%') + '</b><span>本周正确率</span></div>' +
        '<div class="stat"><b>' + wr.activeDays + '</b><span>有效学习天数</span></div>' +
      '</div>' +
      '<div class="kv"><span>上周正确率</span><b>' + (wr.prevAcc === null ? '无数据' : wr.prevAcc + '%') + '</b></div>' +
      '<div class="kv"><span>正确率变化</span><b>' + (wr.acc !== null && wr.prevAcc !== null ? (wr.acc - wr.prevAcc >= 0 ? '+' : '') + (wr.acc - wr.prevAcc) + ' 个百分点' : '数据不足') + '</b></div>' +
      '<div class="kv"><span>本周新增错题</span><b>' + wr.newWrong + ' 道</b></div>' +
      '<h4 class="mt">各板块本周表现</h4>' + wrRows +
      '<div class="note">周报每 7 天自动刷新，数据来自你的真实答题记录。</div>' +
      '</div>' +

      '<div class="grid grid-2">' +
        '<div class="card"><h3>个人法考档案</h3>' +
          '<div class="kv"><span>备考天数</span><b>' + (AppState.state.createdAt ? AppState.daysBetween(AppState.state.createdAt, AppState.todayStr()) + 1 : 1) + ' 天</b></div>' +
          '<div class="kv"><span>连续学习</span><b>' + sum.streak + ' 天</b></div>' +
          '<div class="kv"><span>累计学习时长</span><b>' + (sum.totalMinutes / 60).toFixed(1) + ' 小时</b></div>' +
          '<div class="kv"><span>累计做题</span><b>' + sum.totalQ + ' 道</b></div>' +
          '<div class="kv"><span>累计正确率</span><b>' + (sum.totalQ ? Math.round(sum.totalCorrect / sum.totalQ * 100) + '%' : '—') + '</b></div>' +
          '<div class="kv"><span>知识覆盖率</span><b>' + sum.coverage + '%（' + sum.masteryCount + '/' + Data.KNOWLEDGE.nodes.length + '）</b></div>' +
          '<div class="kv"><span>已学知识点</span><b>' + sum.readCount + ' 个</b></div>' +
          '<div class="kv"><span>错题总数 / 待复习</span><b>' + sum.wrongTotal + ' / ' + sum.wrongActive + '</b></div>' +
          '<div class="kv"><span>基础等级</span><b>' + esc(AppState.state.profile.baseLevel || '未诊断') + '</b></div>' +
          '<div class="note"><b>关于「准备程度」：</b>本系统只呈现可量化的学习数据（覆盖率、正确率、掌握度），' +
          '<b>不承诺通过概率</b>。任何通过率的承诺都是不负责任的。</div>' +
        '</div>' +
        '<div class="card"><h3>掌握度雷达</h3>' + radar +
          '<div class="note">雷达图展示各板块已采集知识点的平均掌握度。未采集板块显示为 0，不代表实际水平。</div>' +
        '</div>' +
      '</div>' +

      '<div class="card"><h3>学习趋势</h3>' +
        '<div class="chips" style="margin-bottom:10px">' +
          '<a class="chip' + (trendDays === 14 ? ' chip-on' : '') + '" href="#/data">近 14 天</a>' +
          '<a class="chip' + (trendDays === 30 ? ' chip-on' : '') + '" href="#/data/30">近 30 天</a>' +
        '</div>' +
        buildTrendChart(trendDays) +
        '<div class="note">柱子是当天答题量（看左侧刻度），折线是当天正确率（看右侧刻度）。' +
        '没有柱子的日期表示当天没有学习记录——连续空白比单日低正确率更值得警惕。</div>' +
      '</div>' +

      '<div class="grid grid-2">' +
        '<div class="card"><h3>各板块掌握度</h3>' + secRows + '</div>' +
        '<div class="card"><h3>近 14 天学习记录</h3>' +
          '<table class="tbl"><thead><tr><th>日期</th><th>题量</th><th>正确率</th><th>分钟</th></tr></thead><tbody>' + logRows + '</tbody></table>' +
        '</div>' +
      '</div>';
  }

  function buildRadar(sum) {
    var secs = Data.KNOWLEDGE.sections;
    var cx = 190, cy = 175, R = 118;
    var n = secs.length;
    var grid = '';
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var pts = [];
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + i * 2 * Math.PI / n;
        pts.push((cx + R * f * Math.cos(a)).toFixed(1) + ',' + (cy + R * f * Math.sin(a)).toFixed(1));
      }
      grid += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="#3a3f4b" stroke-width="1"/>';
    });
    var axes = '', labels = '', dataPts = [];
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n;
      var x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      axes += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#3a3f4b" stroke-width="1"/>';
      var lx = cx + (R + 26) * Math.cos(a), ly = cy + (R + 26) * Math.sin(a);
      labels += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" fill="#c9cfda" font-size="12" text-anchor="middle" dominant-baseline="middle">' + esc(secs[i].key) + '</text>';
      var d = sum.bySec[secs[i].key] || { cnt: 0, sum: 0 };
      var v = d.cnt ? Math.min(1, (d.sum / d.cnt) / 100) : 0.02;
      dataPts.push((cx + R * v * Math.cos(a)).toFixed(1) + ',' + (cy + R * v * Math.sin(a)).toFixed(1));
    }
    return '<svg viewBox="0 0 380 350" class="radar">' + grid + axes +
      '<polygon points="' + dataPts.join(' ') + '" fill="rgba(76,123,224,0.35)" stroke="#6E9BFF" stroke-width="2"/>' +
      labels + '</svg>';
  }

  /* ==================== 视图：搜索 ==================== */
  function viewSearch(arg) {
    var kw = arg ? decodeURIComponent(arg) : '';
    var res = doSearch(kw);
    return '<div class="card"><h3>全库搜索</h3>' +
      '<div class="search-row"><input id="search-kw" placeholder="搜索知识点、法条、题目关键词、板块（如：表见代理 / 保证期间 / 抵押）" value="' + esc(kw) + '">' +
      '<button class="btn" id="search-go">搜索</button></div>' +
      '<div class="chips">' + ['表见代理', '保证期间', '非法证据排除', '合同解除', '行政复议', '股东失权', '正当防卫', '共同犯罪']
        .map(function (k) { return '<a class="chip" href="#/search/' + encodeURIComponent(k) + '">' + esc(k) + '</a>'; }).join('') + '</div>' +
      '</div>' + res;
  }

  function doSearch(kw) {
    if (!kw) return '<div class="card muted">输入关键词开始搜索。系统会同时检索知识节点、法条、题目、新法与主观题案例。</div>';
    var k = kw.toLowerCase();
    function hit(s) { return String(s || '').toLowerCase().indexOf(k) > -1; }

    var nodes = Data.KNOWLEDGE.nodes.filter(function (n) {
      return hit(n.name) || hit(n.one) || hit(n.rule) || (n.tr || []).join('').indexOf(kw) > -1;
    });
    var sts = Data.STATUTES.statutes.filter(function (s) {
      return hit(s.law) || hit(s.art) || hit(s.key) || (s.keywords || []).join('').toLowerCase().indexOf(k) > -1;
    });
    var qs = Data.QUESTIONS.questions.filter(function (q) {
      return hit(q.stem) || (q.options || []).join('').indexOf(kw) > -1 || hit(q.correctWhy) || hit(q.k);
    });
    var nls = Data.NEWLAWS.items.filter(function (i) {
      return hit(i.name) || hit(i.after) || hit(i.howExam);
    });
    var cases = Data.SUBJECTIVE.cases.filter(function (c) {
      return hit(c.title) || hit(c.facts) || (c.statutes || []).join('').indexOf(kw) > -1;
    });

    var out = '<div class="card"><h3>「' + esc(kw) + '」的搜索结果</h3>' +
      '<div class="stat-row">' +
        '<div class="stat"><b>' + nodes.length + '</b><span>知识点</span></div>' +
        '<div class="stat"><b>' + sts.length + '</b><span>法条</span></div>' +
        '<div class="stat"><b>' + qs.length + '</b><span>题目</span></div>' +
        '<div class="stat"><b>' + nls.length + '</b><span>新法</span></div>' +
        '<div class="stat"><b>' + cases.length + '</b><span>案例</span></div>' +
      '</div></div>';

    if (nodes.length) {
      out += '<div class="card"><h3>知识讲解</h3>' + nodes.map(function (n) {
        var ns = AppState.state.nodes[n.id];
        var m = ns && ns.attempts ? AppState.effectiveMastery(n.id) : null;
        return '<div class="sr"><a href="#/node/' + n.id + '"><b>' + esc(n.name) + '</b></a>' +
          '<span class="st">' + stars(n.star) + '</span>' +
          '<span class="tag">' + esc(n.band) + '</span>' +
          '<div class="tiny">' + esc(n.one || '') + '</div>' +
          '<div class="tiny muted">掌握度：' + (m === null ? '未采集' : m + '/100') +
          '　考频：' + freqLabel(AppState.freqText(n.id)) + '</div></div>';
      }).join('') + '</div>';
    }
    if (sts.length) {
      out += '<div class="card"><h3>相关法条</h3>' + sts.map(function (s) {
        return '<div class="sr"><b>' + esc(s.law) + ' ' + esc(s.art) + '</b> <span class="tag">' + esc(s.level) + '</span>' +
          '<div class="tiny">' + esc(s.key) + '</div></div>';
      }).join('') + '</div>';
    }
    if (qs.length) {
      out += '<div class="card"><h3>相关题目</h3>' + qs.map(function (q) {
        return '<div class="sr">' + srcTag(q.srcLevel) + ' <b>' + esc(q.sec) + '</b>' +
          '<div class="tiny">' + esc(q.stem) + '</div>' +
          '<div class="tiny muted">正确答案：' + q.answer.join('') + '　<a href="#/train/node/' + q.k + '">做这个知识点的题</a></div></div>';
      }).join('') + '</div>';
    }
    if (nls.length) {
      out += '<div class="card"><h3>新法相关</h3>' + nls.map(function (i) {
        return '<div class="sr"><a href="#/newlaw"><b>' + esc(i.name) + '</b></a> ' + levelTag(i.level) +
          '<div class="tiny">' + esc(i.after).slice(0, 160) + '…</div></div>';
      }).join('') + '</div>';
    }
    if (cases.length) {
      out += '<div class="card"><h3>主观题案例</h3>' + cases.map(function (c) {
        return '<div class="sr"><a href="#/subj/case/' + c.id + '"><b>' + esc(c.title) + '</b></a></div>';
      }).join('') + '</div>';
    }
    if (!nodes.length && !sts.length && !qs.length && !nls.length && !cases.length) {
      out += '<div class="card muted">没有找到相关内容。可以换一个关键词，或到「知识体系」中按板块浏览。</div>';
    }
    return out;
  }

  /* ==================== 视图：AI 教练 ==================== */
  function viewCoach(arg) {
    var kw = arg ? decodeURIComponent(arg) : '';
    var out = '';
    if (kw) out = coachAnswer(kw);
    return '<div class="card"><h3>AI 教练（本地知识库驱动）</h3>' +
      '<div class="note">这个教练不联网、不编造。它只从本系统已核验的知识节点、法条、题库中回答，' +
      '因此<b>每个回答都能溯源到具体节点和法条</b>。答不出来时会直接说「当前数据库未覆盖」，而不是编一个看起来像答案的东西。</div>' +
      '<div class="search-row"><input id="coach-kw" placeholder="问点什么，例如：保证责任 / 非法证据排除 / 共同犯罪 / 行政复议前置" value="' + esc(kw) + '">' +
      '<button class="btn" id="coach-go">提问</button></div>' +
      '<div class="chips">' +
        ['保证责任', '非法证据排除', '共同犯罪', '合同解除', '行政复议', '股东失权', '正当防卫', '认罪认罚']
          .map(function (k) { return '<a class="chip" href="#/coach/' + encodeURIComponent(k) + '">' + esc(k) + '</a>'; }).join('') +
      '</div>' +
      '</div>' + out;
  }

  function coachAnswer(kw) {
    var k = kw.toLowerCase();
    var node = Data.KNOWLEDGE.nodes.filter(function (n) {
      return n.name.toLowerCase().indexOf(k) > -1 || (n.l2 || '').toLowerCase().indexOf(k) > -1;
    })[0];
    if (!node) {
      return '<div class="card"><div class="warn-box"><b>当前知识库未覆盖「' + esc(kw) + '」。</b>' +
        '我不会编一个答案给你。你可以：①换一个更接近知识节点名称的关键词；' +
        '②到「知识体系」按板块浏览；③到「搜索」用更宽的关键词检索。</div>' +
        '<div class="row-btns"><a class="btn" href="#/tree">去知识体系</a><a class="btn btn-ghost" href="#/search">去搜索</a></div></div>';
    }
    var ns = AppState.state.nodes[node.id];
    var m = ns && ns.attempts ? AppState.effectiveMastery(node.id) : null;
    var sts = Data.STATUTES.statutes.filter(function (s) { return s.node === node.id; });
    var qs = Data.questionsOf(node.id);
    var fr = AppState.freqText(node.id);

    function depth(title, content) {
      if (!content) return '';
      return '<div class="layer"><h5>' + esc(title) + '</h5><div>' + content + '</div></div>';
    }

    return '<div class="card"><h3>教练回答：' + esc(node.name) + '</h3>' +
      '<div class="node-meta"><span class="st">' + stars(node.star) + '</span>' +
        '<span class="tag">' + esc(node.band) + '</span>' +
        '<span class="tag">你的掌握度：' + (m === null ? '未采集' : m + '/100') + '</span>' +
        '<a class="btn btn-sm" href="#/node/' + node.id + '">打开完整讲解</a></div>' +
      depth('【一句话】', '<p>' + esc(node.one || '') + '</p>') +
      depth('【说人话】', '<p>' + esc(node.why || node.one || '') + '</p>') +
      depth('【考试版】', node.rule ? '<p>' + esc(node.rule).replace(/\n/g, '</p><p>') + '</p>' : '<p>—</p>') +
      depth('【深入理解】', '<p>' + esc(node.exc || node.why || '—') + '</p>') +
      depth('【考频与题目分布】', '<p>本知识点在题库中有 ' + qs.length + ' 道' + qWord() + '。' +
        (fr
          ? '真题统计：近 10 年 ' + fr.total + ' 题' + (bankNature().recallOnly ? '（<b>回忆版</b>，非官方数据）' : '') + '。'
          : '<span class="warn">历年真题考频：当前题库不含真题，无法统计。</span>') + '</p>') +
      depth('【主观题版】', '<div class="sub-expr">' + esc(node.sub || '本知识点暂无主观题表达模板。') + '</div>') +
      (sts.length ? depth('【关联法条】', sts.map(function (s) {
        return '<div class="tiny">· ' + esc(s.law) + ' ' + esc(s.art) + '（' + esc(s.level) + '）</div>';
      }).join('')) : '') +
      (node.tr && node.tr.length ? depth('【最容易错在哪】', '<ul class="trap-list">' + node.tr.map(function (t) {
        return '<li><span class="trap-mark">陷阱</span>' + esc(t) + '</li>';
      }).join('') + '</ul>') : '') +
      '<div class="row-btns"><a class="btn" href="#/train/node/' + node.id + '">来一道相关题</a>' +
        '<a class="btn btn-ghost" href="#/node/' + node.id + '">讲简单一点 / 完整讲解</a></div>' +
      '<div class="note">解释深度可自由切换：一句话 → 说人话 → 考试版 → 深入理解 → 考频与题目分布 → 主观题版。' +
      '默认先讲最重要的，不会一次把整本教材倒给你。</div>' +
      '</div>';
  }

  /* ==================== 视图：诊断测试 ==================== */
  var diagState = { list: [], idx: 0, chosen: [], answers: [] };

  function viewDiag() {
    if (diagState.list.length && diagState.idx < diagState.list.length) return renderDiagQ();
    if (diagState.list.length && diagState.idx >= diagState.list.length) return renderDiagResult();

    var diagQs = Data.QUESTIONS.questions.filter(function (q) { return q.diag; });
    var done = AppState.state.profile.diagDone;
    return '<div class="card"><h3>法考入学诊断</h3>' +
      '<div class="stat-row">' +
        '<div class="stat"><b>' + diagQs.length + '</b><span>诊断题量</span></div>' +
        '<div class="stat"><b>8</b><span>覆盖板块</span></div>' +
        '<div class="stat"><b>' + (done ? esc(AppState.state.profile.baseLevel || '已完成') : '未完成') + '</b><span>当前状态</span></div>' +
      '</div>' +
      '<div class="note">诊断目的不是考你，而是判断你的基础水平，从而生成个性化的备考计划。' +
      '每题覆盖一个板块的核心考点，含单选、多选、不定项。' +
      '<b>做完才会显示答案</b>，请按真实水平作答，不要猜。</div>' +
      '<div class="warn-box">诊断题全部为自编模拟题，用于能力评估，不是历年真题。</div>' +
      '<div class="row-btns"><button class="btn btn-lg" id="diag-start">开始诊断（' + diagQs.length + ' 题）</button>' +
      '<a class="btn btn-ghost" href="#/dash">先跳过</a></div>' +
      '<div class="note">预计用时 40—60 分钟。中途可以退出，但本组进度不会保留，建议一次做完。</div>' +
      '</div>';
  }

  function renderDiagQ() {
    var q = diagState.list[diagState.idx];
    var chosen = diagState.chosen;
    var opts = q.options.map(function (o, i) {
      var key = String.fromCharCode(65 + i);
      return '<div class="opt' + (chosen.indexOf(key) > -1 ? ' opt-sel' : '') + '" data-opt="' + key + '"><i>' + key + '</i><span>' + esc(o) + '</span></div>';
    }).join('');
    var pct = Math.round(diagState.idx / diagState.list.length * 100);
    return '<div class="card quiz">' +
      '<div class="quiz-head"><div class="crumb"><a href="#/diag">入学诊断</a></div>' +
      '<div class="quiz-progress">第 ' + (diagState.idx + 1) + ' / ' + diagState.list.length + ' 题</div></div>' +
      '<div class="bar" style="margin-bottom:14px"><div class="bar-in" style="width:' + pct + '%;background:#4C7BE0"></div></div>' +
      '<div class="q-meta"><span class="tag">' + esc(q.sec) + '</span><span class="tag">' + esc(q.type) + '</span>' +
        '<span class="tag">难度 ' + stars(q.difficulty) + '</span></div>' +
      '<div class="q-stem">' + esc(q.stem) + '</div>' +
      '<div class="opts" id="opts">' + opts + '</div>' +
      '<div class="row-btns"><button class="btn btn-lg" id="diag-next">' +
        (diagState.idx + 1 >= diagState.list.length ? '提交并生成报告' : '下一题') + '</button>' +
        '<button class="btn btn-ghost" id="diag-skip">不确定，跳过</button></div>' +
      '<div class="note">诊断过程中不显示答案与解析，避免影响判断。</div>' +
      '</div>';
  }

  function renderDiagResult() {
    var bySec = {};
    diagState.list.forEach(function (q, i) {
      var ok = diagState.answers[i];
      if (!bySec[q.sec]) bySec[q.sec] = { q: 0, c: 0 };
      bySec[q.sec].q++;
      if (ok) bySec[q.sec].c++;
    });
    var total = diagState.list.length;
    var correct = diagState.answers.filter(Boolean).length;
    var acc = total ? Math.round(correct / total * 100) : 0;
    var level = acc >= 70 ? '较强' : acc >= 50 ? '中等' : acc >= 30 ? '基础薄弱' : '零基础';

    AppState.state.profile.diagDone = true;
    AppState.state.profile.baseLevel = level;
    AppState.state.profile.diagResult = { date: AppState.todayStr(), total: total, correct: correct, acc: acc, bySec: bySec };
    AppState.save();

    var rows = Object.keys(bySec).map(function (s) {
      var d = bySec[s];
      var r = Math.round(d.c / d.q * 100);
      return '<div class="sec-row"><span class="sec-name">' + esc(s) + '</span>' +
        '<div class="sec-bar">' + bar(r, r < 50 ? '#E4564A' : r < 70 ? '#E08A3C' : '#3E9E6C') + '</div>' +
        '<span class="sec-val">' + d.c + '/' + d.q + '　' + r + '%</span></div>';
    }).join('');

    var weakSecs = Object.keys(bySec).filter(function (s) { return bySec[s].c / bySec[s].q < 0.5; });

    return '<div class="card"><h3>诊断报告</h3>' +
      '<div class="stat-row">' +
        '<div class="stat"><b>' + total + '</b><span>题量</span></div>' +
        '<div class="stat"><b>' + correct + '</b><span>正确</span></div>' +
        '<div class="stat"><b>' + acc + '%</b><span>正确率</span></div>' +
        '<div class="stat"><b>' + level + '</b><span>基础等级</span></div>' +
      '</div>' +
      '<h4 class="mt">各板块正确率</h4>' + rows +
      '<div class="note">基础等级仅反映本次诊断的作答结果，用于确定起始学习强度，不代表真实水平，更不代表考试结果。</div>' +
      '</div>' +

      '<div class="card"><h3>基于诊断生成的备考计划</h3>' +
        '<div class="kv"><span>目标考试年度</span><b>' + (AppState.state.profile.track === 'subjective2026' ? '2026 主观题（' + Data.EXAM.subjective.dateText + '）' : '2027 客观题（预计）') + '</b></div>' +
        '<div class="kv"><span>每日可学习时间</span><b>' + AppState.state.profile.dailyMinutes + ' 分钟（可在设置中调整）</b></div>' +
        '<div class="kv"><span>当前阶段</span><b>' + esc(AppState.examInfo().phase) + '</b></div>' +
        '<div class="kv"><span>薄弱板块</span><b>' + (weakSecs.length ? weakSecs.join('、') : '本次诊断未发现明显短板') + '</b></div>' +
        '<div class="note">计划逻辑：<b>高频 × 高重要度 × 低掌握度 × 临近遗忘</b>的知识点优先。' +
        '低频、边缘知识点自动降低权重。未完成的计划会自动滚入后续日期。</div>' +
        '<div class="row-btns"><a class="btn btn-lg" href="#/dash">查看今日任务</a>' +
        '<a class="btn btn-ghost" href="#/tree">浏览知识体系</a></div>' +
      '</div>' +

      '<div class="card"><h3>诊断题逐题回顾</h3>' +
        diagState.list.map(function (q, i) {
          var ok = diagState.answers[i];
          return '<div class="sr"><b>' + (ok ? '<span class="ok-text">✓</span>' : '<span class="no-text">✕</span>') + ' ' + esc(q.sec) + '</b>' +
            '<div class="tiny">' + esc(q.stem) + '</div>' +
            '<div class="tiny muted">正确答案：' + q.answer.join('') + '　' + esc(q.correctWhy.slice(0, 80)) + '…</div>' +
            '<a class="tiny" href="#/node/' + q.k + '">查看知识点讲解 →</a></div>';
        }).join('') +
      '</div>';
  }

  /* ==================== 视图：设置 ==================== */
  function viewSettings() {
    var p = AppState.state.profile;
    return '<div class="card"><h3>备考设置</h3>' +
      '<div class="form-row"><label>目标考试</label>' +
        '<select id="set-track">' +
          '<option value="subjective2026"' + (p.track === 'subjective2026' ? ' selected' : '') + '>2026 年主观题（2026-10-18）</option>' +
          '<option value="objective2027"' + (p.track === 'objective2027' ? ' selected' : '') + '>2027 年客观题（预计 2027 年 9 月）</option>' +
        '</select></div>' +
      '<div class="form-row"><label>每日可学习时间（分钟）</label>' +
        '<input type="number" id="set-min" value="' + (p.dailyMinutes || 240) + '" min="30" max="900" step="30"></div>' +
      '<div class="form-row"><label>2026 年客观题是否通过（自填，用于调整策略）</label>' +
        '<select id="set-pass"><option value="">未填写</option>' +
          '<option value="yes"' + (p.objective2026Passed === true ? ' selected' : '') + '>已通过</option>' +
          '<option value="no"' + (p.objective2026Passed === false ? ' selected' : '') + '>未通过 / 未参加</option>' +
        '</select></div>' +
      '<div class="row-btns"><button class="btn" id="set-save">保存设置</button></div>' +
      '</div>' +

      '<div class="card"><h3>数据管理</h3>' +
        '<div class="note">学习记录保存在浏览器本地（localStorage）。换电脑或清理浏览器数据会丢失，建议定期导出备份。</div>' +
        '<div class="row-btns">' +
          '<button class="btn" id="exp-json">导出学习记录（JSON）</button>' +
          '<button class="btn btn-ghost" id="imp-json">导入学习记录</button>' +
          '<button class="btn btn-ghost" id="exp-csv">导出答题明细（CSV）</button>' +
        '</div>' +
        '<div class="form-row"><label>导入题目（粘贴 JSON 数组）</label>' +
          '<textarea id="imp-q" placeholder=\'[{"id":"Q9001","srcLevel":"官方真题","src":"2024年真题","year":2024,"stage":"客观题","paper":"试卷二","no":15,"sec":"民法","k":"MF-10","type":"单选","stem":"...","options":["A...","B..."],"answer":["C"],"difficulty":3,"trap":"...","statute":"...","correctWhy":"...","wrongWhy":{"A":"..."},"related":[],"timeEffect":null}]\'></textarea>' +
        '</div>' +
        '<div class="row-btns"><button class="btn" id="imp-q-btn">导入题目</button></div>' +
        '<div class="warn-box"><b>导入真题时请如实填写 srcLevel：</b>' +
          '「官方真题」「机构整理」「回忆版」「模拟」。只有前两类会计入考频统计。' +
          '把模拟题标成真题，会直接破坏整个系统的判断依据。</div>' +
      '</div>' +

      '<div class="card"><h3>危险操作</h3>' +
        '<div class="note">清空后所有学习记录、错题本、掌握度将不可恢复。</div>' +
        '<div class="row-btns"><button class="btn btn-danger" id="reset-all">清空全部学习记录</button></div>' +
      '</div>' +

      '<div class="card"><h3>系统信息</h3>' +
        '<div class="kv"><span>知识节点</span><b>' + Data.KNOWLEDGE.nodes.length + ' 个</b></div>' +
        '<div class="kv"><span>题库</span><b>' + Data.QUESTIONS.questions.length + ' 道</b></div>' +
        '<div class="kv"><span>法条</span><b>' + Data.STATUTES.statutes.length + ' 条</b></div>' +
        '<div class="kv"><span>新法条目</span><b>' + Data.NEWLAWS.items.length + ' 条</b></div>' +
        '<div class="kv"><span>主观题案例</span><b>' + Data.SUBJECTIVE.cases.length + ' 例</b></div>' +
        '<div class="kv"><span>考试信息核验日期</span><b>' + esc(Data.EXAM.meta.verifiedAt) + '</b></div>' +
        '<div class="kv"><span>新法核验日期</span><b>' + esc(Data.NEWLAWS.verifiedAt) + '</b></div>' +
      '</div>';
  }

  /* ==================== 视图表 ==================== */
  var VIEWS = {
    dash: viewDash, tree: viewTree, node: viewNode, train: viewTrain,
    exam: viewExam, wrong: viewWrong, statute: viewStatute, newlaw: viewNewlaw,
    subj: viewSubj, data: viewData, search: viewSearch, coach: viewCoach,
    diag: viewDiag, settings: viewSettings, trap: viewTrap, compare: viewCompare
  };

  /* ==================== 交互绑定 ==================== */
  var AFTER = {
    train: function () { bindQuiz(); },
    diag: function () { bindDiag(); },
    statute: function () {
      var b = el('statute-go');
      if (b) b.onclick = function () {
        var v = el('statute-kw').value.trim();
        go(v ? '#/statute/' + encodeURIComponent(v) : '#/statute');
      };
    },
    search: function () {
      var b = el('search-go');
      if (b) b.onclick = function () {
        var v = el('search-kw').value.trim();
        go(v ? '#/search/' + encodeURIComponent(v) : '#/search');
      };
      var inp = el('search-kw');
      if (inp) inp.onkeydown = function (e) { if (e.key === 'Enter') b.click(); };
    },
    coach: function () {
      var b = el('coach-go');
      if (b) b.onclick = function () {
        var v = el('coach-kw').value.trim();
        go(v ? '#/coach/' + encodeURIComponent(v) : '#/coach');
      };
      var inp = el('coach-kw');
      if (inp) inp.onkeydown = function (e) { if (e.key === 'Enter') b.click(); };
    },
    settings: function () { bindSettings(); },
    subj: function () {
      var cid = (route.arg && route.arg.indexOf('case/') === 0) ? route.arg.slice(5) : null;
      if (!cid) return;
      var box = el('subj-check');
      if (!box) return;
      var c = Data.SUBJECTIVE.cases.filter(function (x) { return x.id === cid; })[0];
      if (!c) return;
      var ta = el('subj-input');

      function checkedIdx() {
        var out = [];
        var bs = box.querySelectorAll('input[data-sp]');
        for (var i = 0; i < bs.length; i++) {
          if (bs[i].checked) out.push(parseInt(bs[i].getAttribute('data-sp'), 10));
        }
        return out;
      }
      function refresh() {
        var v = el('subj-verdict');
        if (v) v.innerHTML = subjVerdict(checkedIdx().length, c.scoringPoints.length);
      }
      var bs = box.querySelectorAll('input[data-sp]');
      for (var i = 0; i < bs.length; i++) {
        bs[i].onchange = function () {
          var lbl = this.parentNode;
          if (lbl && lbl.classList) lbl.classList.toggle('on', this.checked);
          refresh();
        };
      }
      var sv = el('subj-save');
      if (sv) sv.onclick = function () {
        var rec = AppState.saveSubjAnswer(cid, ta ? ta.value : '', checkedIdx());
        renderShell();          // 重绘以显示「历次作答」区块
        toast('已保存作答（' + rec.at + '）');
      };
      refresh();
    },
    trap: function () {
      var m = el('trap-more');
      if (m) m.onclick = function () { trapLimit += 60; renderShell(); };
    },
    compare: function () {
      var m = el('cmp-more');
      if (m) m.onclick = function () { cmpLimit += 24; renderShell(); };
      var t = el('cmp-train');
      if (t) t.onclick = function () {
        var cq = confusionQuestions();
        if (!cq.length) { toast('暂无可用的辨析训练题'); return; }
        var list = shuffle(cq).slice(0, 20);
        startQuiz(list, '对比辨析训练（' + list.length + ' 题）', 'compare', 'compare');
        go('#/train/compare');
      };
      var btns = document.querySelectorAll('[data-cmp-toggle]');
      for (var i = 0; i < btns.length; i++) {
        (function (btn) {
          btn.onclick = function () {
            var idx = btn.getAttribute('data-cmp-toggle');
            var body = document.querySelector('[data-cmp-body="' + idx + '"]');
            if (!body) return;
            if (body.hasAttribute('hidden')) { body.removeAttribute('hidden'); btn.textContent = '收起辨析'; }
            else { body.setAttribute('hidden', ''); btn.textContent = '展开辨析'; }
          };
        })(btns[i]);
      }
    }
  };

  function bindQuiz() {
    var opts = el('opts');
    if (opts) {
      opts.onclick = function (e) {
        var t = e.target.closest('.opt');
        if (!t || quiz.revealed) return;
        var key = t.getAttribute('data-opt');
        var q = quiz.list[quiz.idx];
        if (q.type === '单选') {
          quiz.chosen = [key];
        } else {
          var i = quiz.chosen.indexOf(key);
          if (i > -1) quiz.chosen.splice(i, 1); else quiz.chosen.push(key);
        }
        renderShell();
      };
    }
    var sub = el('submit-q');
    if (sub) sub.onclick = function () {
      if (!quiz.chosen.length) { toast('请先选择答案'); return; }
      var q = quiz.list[quiz.idx];
      var res = AppState.recordAnswer(q, quiz.chosen, quiz.mode);
      if (!quiz.results) quiz.results = [];
      quiz.results[quiz.idx] = res.correct;
      quiz.revealed = true;
      AppState.addMinutes(3);
      renderShell();
    };
    var skip = el('skip-q');
    if (skip) skip.onclick = function () {
      if (!quiz.results) quiz.results = [];
      quiz.results[quiz.idx] = false;
      quiz.revealed = true;
      renderShell();
    };
    var nx = el('next-q');
    if (nx) nx.onclick = function () {
      var last = quiz.idx + 1 >= quiz.list.length;
      if (last && quiz.mode === 'exam') {
        var answered = (quiz.results || []).filter(function (r) { return r !== undefined && r !== null; }).length;
        var left = quiz.list.length - answered;
        if (!window.confirm('确认提交试卷？\n共 ' + quiz.list.length + ' 题，已答 ' + answered + ' 题' +
          (left > 0 ? '，未答 ' + left + ' 题（按错处理）' : '') + '。')) return;
        finishExam();
        return;
      }
      quiz.idx++; quiz.chosen = []; quiz.revealed = false;
      if (quiz.idx >= quiz.list.length && quiz.mode === 'exam') { finishExam(); return; }
      renderShell();
    };
    var eq = el('exam-quit');
    if (eq) eq.onclick = function () {
      var answered = (quiz.results || []).filter(function (r) { return r !== undefined && r !== null; }).length;
      if (!window.confirm('确认提前交卷？\n共 ' + quiz.list.length + ' 题，已答 ' + answered + ' 题，' +
        '未答的 ' + (quiz.list.length - answered) + ' 题按错处理。')) return;
      finishExam();
    };
    var sim = el('similar-q');
    if (sim) sim.onclick = function () {
      var q = quiz.list[quiz.idx];
      var list = Data.questionsOf(q.k).filter(function (x) { return x.id !== q.id; });
      if (!list.length) { toast('该知识点暂无其他题目'); return; }
      startQuiz(list, '相似知识点训练：' + (Data.findNode(q.k) ? Data.findNode(q.k).name : q.k), 'similar', 'similar/' + q.k);
      go('#/train/similar/' + q.k);
    };
    var chips = document.querySelectorAll('[data-reason]');
    Array.prototype.forEach.call(chips, function (c) {
      c.onclick = function () {
        AppState.setWrongReason(c.getAttribute('data-qid'), c.getAttribute('data-reason'));
        toast('已归档错误原因：' + c.getAttribute('data-reason'));
        renderShell();
      };
    });
    var sr = el('start-random');
    if (sr) sr.onclick = function () {
      var all = Data.QUESTIONS.questions;
      if (!all.length) { toast('题库为空'); return; }
      var group = pickBalanced(all, 10);
      startQuiz(group, '随机训练（' + group.length + ' 题）', 'random', 'random/group');
      go('#/train/random/group');
    };
  }

  function finishExam() {
    stopExamTimer();
    var total = quiz.list.length;
    var correct = (quiz.results || []).filter(Boolean).length;
    var full = fullScore(quiz.list);
    var score = 0;
    var bySec = {}, byType = {};
    quiz.list.forEach(function (q, i) {
      var ok = !!(quiz.results || [])[i];
      var pts = scoreOf(q);
      if (!bySec[q.sec]) bySec[q.sec] = { q: 0, c: 0, score: 0, full: 0 };
      bySec[q.sec].q++; bySec[q.sec].full += pts;
      if (!byType[q.type]) byType[q.type] = { q: 0, c: 0, score: 0, full: 0 };
      byType[q.type].q++; byType[q.type].full += pts;
      if (ok) {
        score += pts;
        bySec[q.sec].c++; bySec[q.sec].score += pts;
        byType[q.type].c++; byType[q.type].score += pts;
      }
    });
    var secs = Math.max(1, Math.round((Date.now() - (quiz.examStart || Date.now())) / 1000));
    var minutes = Math.max(1, Math.round(secs / 60));

    AppState.state.examRecords.push({
      date: AppState.todayStr(), title: quiz.title, size: total, correct: correct,
      minutes: minutes, bySec: bySec, score: score, full: full
    });
    AppState.addMinutes(minutes);
    AppState.save();

    var typeRows = ['单选', '多选', '不定项'].filter(function (t) { return byType[t]; }).map(function (t) {
      var d = byType[t];
      var rate = d.full ? Math.round(d.score / d.full * 100) : 0;
      return '<tr><td>' + t + '</td><td>' + d.c + '/' + d.q + '</td>' +
        '<td><b>' + d.score + '</b> / ' + d.full + '</td><td>' + rate + '%</td></tr>';
    }).join('');
    var secRows = Object.keys(bySec).map(function (s) {
      var d = bySec[s];
      var rate = d.full ? Math.round(d.score / d.full * 100) : 0;
      return '<div class="sec-row"><span class="sec-name">' + esc(s) + '</span>' +
        '<div class="sec-bar">' + bar(rate) + '</div>' +
        '<span class="sec-val">' + d.score + '/' + d.full + '　' + rate + '%</span></div>';
    }).join('');
    var weakSecs = Object.keys(bySec).filter(function (s) {
      return bySec[s].full && bySec[s].score / bySec[s].full < 0.6;
    });
    var pct = full ? Math.round(score / full * 100) : 0;
    /* 官方合格线 180 / 300，换算到本次满分 */
    var passLine = Math.round(180 / 300 * full);

    el('view').innerHTML = '<div class="card"><h3>模拟考试结果</h3>' +
      '<div class="stat-row">' +
        '<div class="stat"><b>' + score + '/' + full + '</b><span>得分（按分计分）</span></div>' +
        '<div class="stat"><b>' + pct + '%</b><span>得分率</span></div>' +
        '<div class="stat"><b>' + correct + '/' + total + '</b><span>答对题数</span></div>' +
        '<div class="stat"><b>' + fmtDur(secs * 1000) + '</b><span>总用时</span></div>' +
        '<div class="stat"><b>' + (secs / total).toFixed(0) + ' 秒</b><span>每题平均</span></div>' +
      '</div>' +
      '<div class="kv"><span>折算合格线参考</span><b class="' + (score >= passLine ? 'ok-text' : 'no-text') + '">' +
        passLine + ' / ' + full + ' 分（按全国统一合格线 180/300 等比折算）　' +
        (score >= passLine ? '已达到' : '未达到') + '</b></div>' +
      '<h4 class="mt">各题型得分</h4>' +
      '<table class="tbl"><thead><tr><th>题型</th><th>答对/题量</th><th>得分</th><th>得分率</th></tr></thead><tbody>' + typeRows + '</tbody></table>' +
      '<h4 class="mt">各板块得分</h4>' + secRows +
      '<div class="note"><b>下一阶段训练建议：</b>' +
        (weakSecs.length ? '优先强化 ' + weakSecs.join('、') + '。系统已在今日任务中自动提高这些板块的权重。' : '各板块表现均衡，建议进入高频考点与错题复习。') +
      '</div>' +
      '<div class="warn-box">' + bankNotice() + ' 本成绩仅反映你在<b>模拟题</b>上的表现，不能等同于真实考试水平，也不构成任何通过率的预测。</div>' +
      '<div class="row-btns"><a class="btn" href="#/dash">回到驾驶舱</a>' +
      '<a class="btn btn-ghost" href="#/wrong">去错题本</a>' +
      '<a class="btn btn-ghost" href="#/exam">再考一次</a></div></div>';
  }

  /* 考试计时器：只更新时钟文本，不触发整页重绘 */
  var examTimer = null;
  function stopExamTimer() {
    if (examTimer) { clearInterval(examTimer); examTimer = null; }
  }
  function startExamTimer() {
    stopExamTimer();
    var node = el('exam-clock');
    if (!node) return;
    examTimer = setInterval(function () {
      var n = el('exam-clock');
      if (!n) { stopExamTimer(); return; }
      n.textContent = fmtDur(Date.now() - (quiz.examStart || Date.now()));
    }, 1000);
  }

  function bindDiag() {
    var s = el('diag-start');
    if (s) s.onclick = function () {
      diagState.list = Data.QUESTIONS.questions.filter(function (q) { return q.diag; });
      diagState.idx = 0; diagState.chosen = []; diagState.answers = [];
      renderShell();
    };
    var opts = el('opts');
    if (opts) opts.onclick = function (e) {
      var t = e.target.closest('.opt');
      if (!t) return;
      var key = t.getAttribute('data-opt');
      var q = diagState.list[diagState.idx];
      if (q.type === '单选') diagState.chosen = [key];
      else {
        var i = diagState.chosen.indexOf(key);
        if (i > -1) diagState.chosen.splice(i, 1); else diagState.chosen.push(key);
      }
      renderShell();
    };
    var n = el('diag-next');
    if (n) n.onclick = function () {
      var q = diagState.list[diagState.idx];
      diagState.answers[diagState.idx] = Data.isCorrect(q, diagState.chosen);
      AppState.recordAnswer(q, diagState.chosen, 'diag');
      AppState.addMinutes(1);
      diagState.idx++; diagState.chosen = [];
      renderShell();
    };
    var k = el('diag-skip');
    if (k) k.onclick = function () {
      diagState.answers[diagState.idx] = false;
      AppState.addMinutes(1);
      diagState.idx++; diagState.chosen = [];
      renderShell();
    };
  }

  function bindSettings() {
    var sv = el('set-save');
    if (sv) sv.onclick = function () {
      var t = el('set-track').value;
      var m = parseInt(el('set-min').value, 10) || 240;
      var pv = el('set-pass').value;
      AppState.state.profile.track = t;
      AppState.state.profile.dailyMinutes = m;
      AppState.state.profile.objective2026Passed = pv === 'yes' ? true : pv === 'no' ? false : null;
      AppState.state.taskCache = { date: null, list: [] };
      AppState.save();
      toast('设置已保存');
      renderShell();
    };
    var ex = el('exp-json');
    if (ex) ex.onclick = function () {
      download('法考学习记录_' + AppState.todayStr() + '.json', AppState.exportJSON(), 'application/json');
    };
    var im = el('imp-json');
    if (im) im.onclick = function () {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json';
      inp.onchange = function () {
        var f = inp.files[0];
        var r = new FileReader();
        r.onload = function () {
          try { AppState.importJSON(r.result); toast('导入成功'); renderShell(); }
          catch (err) { toast('导入失败：' + err.message); }
        };
        r.readAsText(f);
      };
      inp.click();
    };
    var csv = el('exp-csv');
    if (csv) csv.onclick = function () {
      var lines = ['时间,题目ID,知识点,是否正确,模式'];
      AppState.state.sessions.forEach(function (s) {
        lines.push([new Date(s.ts).toLocaleString(), s.qid, s.nodeId, s.correct ? '正确' : '错误', s.mode].join(','));
      });
      download('答题明细_' + AppState.todayStr() + '.csv', '\ufeff' + lines.join('\n'), 'text/csv');
    };
    var iq = el('imp-q-btn');
    if (iq) iq.onclick = function () {
      try {
        var arr = JSON.parse(el('imp-q').value);
        var n = AppState.addCustomQuestions(arr);
        toast('成功导入 ' + n + ' 道题目');
        renderShell();
      } catch (e) { toast('导入失败：' + e.message); }
    };
    var rs = el('reset-all');
    if (rs) rs.onclick = function () {
      if (confirm('确定清空全部学习记录？此操作不可恢复。建议先导出备份。')) {
        AppState.reset();
        toast('已清空');
        renderShell();
      }
    };
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* 任务完成按钮（全局委托） */
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    var t = e.target.closest('[data-task-done]');
    if (t) {
      var key = t.getAttribute('data-task-done');
      var log = AppState.todayLog();
      if (!log.tasksDone) log.tasksDone = [];
      var i = log.tasksDone.indexOf(key);
      if (i > -1) log.tasksDone.splice(i, 1); else log.tasksDone.push(key);
      AppState.save();
      renderShell();
      return;
    }
    var ms = e.target.closest('[data-mastery]');
    if (ms) {
      var id = ms.getAttribute('data-mastery');
      var ns = AppState.nodeState(id);
      ns.manual = 'mastered';
      ns.mastery = Math.min(100, Math.max(ns.mastery, 70));
      ns.attempts = ns.attempts || 1;
      ns.lastReview = AppState.todayStr();
      ns.nextDue = AppState.addDays(AppState.todayStr(), 7);
      AppState.save();
      toast('已标记为掌握，7 天后安排复习');
      renderShell();
      return;
    }
    var cf = e.target.closest('[data-confused]');
    if (cf) {
      var id2 = cf.getAttribute('data-confused');
      var ns2 = AppState.nodeState(id2);
      ns2.manual = 'confused';
      ns2.srsStage = 0;
      ns2.nextDue = AppState.todayStr();
      AppState.save();
      toast('已加入高频复习，明天会再次出现');
      renderShell();
      return;
    }
    var rc = e.target.closest('[data-recall-save]');
    if (rc) {
      var id3 = rc.getAttribute('data-recall-save');
      var txt = (el('recall-text') || {}).value || '';
      if (!txt.trim()) { toast('先写下来再提交'); return; }
      var ns3 = AppState.nodeState(id3);
      ns3.attempts = ns3.attempts || 1;
      ns3.mastery = Math.min(100, Math.round(ns3.mastery * 0.7 + 55 * 0.3));
      ns3.lastReview = AppState.todayStr();
      ns3.nextDue = AppState.addDays(AppState.todayStr(), 3);
      AppState.save();
      toast('已记录。主动回忆比重复阅读更有效。');
      renderShell();
      return;
    }
    var exb = e.target.closest('[data-exam]');
    if (exb && !exb.disabled) {
      runExam(exb.getAttribute('data-exam'));
      return;
    }
    var mb = e.target.closest('[data-min]');
    if (mb) {
      var mins = parseInt(mb.getAttribute('data-min'), 10);
      AppState.addMinutes(mins);
      toast('已记录 ' + mins + ' 分钟学习时长');
      renderShell();
      return;
    }
  });

  /* ==================== 启动 ==================== */
  function boot() {
    AppState.load();
    parseHash();
    if (!AppState.state.profile.diagDone && (!location.hash || location.hash === '#/' || location.hash === '#/dash')) {
      route.view = 'diag';
      location.hash = '#/diag';
      parseHash();
    }
    renderShell();
  }

  window.addEventListener('hashchange', function () {
    parseHash();
    renderShell();
    window.scrollTo(0, 0);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
