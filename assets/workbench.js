/* Edie的个人工作台 渲染逻辑（私有版 v1.2）
   - 数据加密存放：../data/workbench_enc.json（XOR(口令)+base64）
   - 待办事项：localStorage 本地持久化（wbk_todos_v1），按业务板块分栏，
     创建时间自动记录，期限手动填，完成自动归档折叠，支持备份/恢复
   - 专题数据（公开信息）读 ../data/warehouse_attacks.json */
(function () {
  'use strict';
  var app = document.getElementById('app');
  if (!app) { return; }

  var LS_KEY = 'wbk_pc_v1';
  var TODO_KEY = 'wbk_todos_v1';

  /* 业务板块（品牌矩阵 + 综合） */
  var SECTIONS = [
    {id: 'general', name: '综合'},
    {id: 'mosai', name: 'mosai'},
    {id: 'mosai_pc', name: '莫赛(个护)'},
    {id: 'deeplight', name: 'deeplight'},
    {id: 'pipolux', name: 'pipolux'},
    {id: 'dxmhome', name: 'DXMhome'},
    {id: 'entonhome', name: 'entonhome'},
    {id: 'mosaihome', name: 'mosaihome'},
    {id: 'deepclean', name: 'deepclean'}
  ];

  document.getElementById('today').textContent =
    new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'});

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function xorDecode(b64, pc) {
    var bin = atob(b64);
    var key = new TextEncoder().encode(pc);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i) ^ key[i % key.length];
    }
    return new TextDecoder('utf-8').decode(out);
  }

  function tryUnlock(pc, remember) {
    fetch('../data/workbench_enc.json')
      .then(function (r) { return r.json(); })
      .then(function (payload) {
        var data;
        try {
          data = JSON.parse(xorDecode(payload.enc, pc));
        } catch (e) {
          showLock('口令错误，请重试');
          return;
        }
        if (remember) { try { localStorage.setItem(LS_KEY, pc); } catch (e) {} }
        fetch('../data/warehouse_attacks.json').then(function (r) { return r.json(); })
          .catch(function () { return null; })
          .then(function (wh) { render(data, wh); });
      })
      .catch(function () { showLock('数据加载失败，请稍后刷新'); });
  }

  function showLock(err) {
    var lock = document.getElementById('lock');
    if (lock) { lock.style.display = ''; }
    var errEl = document.getElementById('pcErr');
    if (errEl) { errEl.textContent = err || ''; }
  }

  var saved = null;
  try { saved = localStorage.getItem(LS_KEY); } catch (e) {}
  var pcInput = document.getElementById('pcInput');
  var pcBtn = document.getElementById('pcBtn');
  if (pcBtn) {
    pcBtn.addEventListener('click', function () { tryUnlock(pcInput.value, true); });
    pcInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { tryUnlock(pcInput.value, true); }
    });
  }
  if (saved) {
    document.getElementById('lock').style.display = 'none';
    tryUnlock(saved, false);
  }

  /* ================= 待办事项模块 ================= */
  var curSection = 'general';
  var doneOpen = false;

  function loadTodos() {
    try {
      var t = JSON.parse(localStorage.getItem(TODO_KEY) || '{}');
      return typeof t === 'object' && t ? t : {};
    } catch (e) { return {}; }
  }
  function saveTodos(t) {
    try { localStorage.setItem(TODO_KEY, JSON.stringify(t)); } catch (e) {}
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDT(ts) {
    var d = new Date(ts);
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function dueBadge(due) {
    if (!due) { return '<span class="wbk-due wbk-due-none">无期限</span>'; }
    var t = todayStr();
    if (due < t) { return '<span class="wbk-due wbk-due-over">已逾期 ' + esc(due.slice(5)) + '</span>'; }
    if (due === t) { return '<span class="wbk-due wbk-due-today">今天到期</span>'; }
    var diff = Math.round((new Date(due) - new Date(t)) / 86400000);
    if (diff <= 3) { return '<span class="wbk-due wbk-due-soon">限 ' + esc(due.slice(5)) + ' · 剩' + diff + '天</span>'; }
    return '<span class="wbk-due wbk-due-ok">限 ' + esc(due.slice(5)) + '</span>';
  }

  function pendingCount(t, sec) {
    return (t[sec] || []).filter(function (x) { return !x.done; }).length;
  }
  function totalPending(t) {
    var n = 0;
    SECTIONS.forEach(function (s) { n += pendingCount(t, s.id); });
    return n;
  }

  function renderTodoSection() {
    var t = loadTodos();
    var h = '<div class="wbk-sec wbk-sec-todo">📌 待办事项 <span class="wbk-todo-total">' + totalPending(t) + ' 项进行中</span></div>';
    h += '<div class="wbk-card wbk-todo-card">';

    /* 板块标签栏 */
    h += '<div class="wbk-tabs">';
    SECTIONS.forEach(function (s) {
      var n = pendingCount(t, s.id);
      h += '<button class="wbk-tab' + (s.id === curSection ? ' on' : '') + '" data-sec="' + s.id + '">' +
        esc(s.name) + (n ? '<i>' + n + '</i>' : '') + '</button>';
    });
    h += '</div>';

    /* 新增表单 */
    h += '<div class="wbk-add">' +
      '<input id="tdText" type="text" placeholder="输入待办事项…" maxlength="120">' +
      '<input id="tdDue" type="date" title="目标完成期限">' +
      '<button class="wbk-addbtn" id="tdAdd">+ 添加</button></div>';

    /* 进行中列表（按期限升序，无期限排最后） */
    var items = (t[curSection] || []).filter(function (x) { return !x.done; });
    items.sort(function (a, b) {
      var da = a.due || '9999', db = b.due || '9999';
      return da < db ? -1 : da > db ? 1 : a.created - b.created;
    });
    if (!items.length) {
      h += '<div class="wbk-todo-empty">本板块暂无进行中事项</div>';
    }
    items.forEach(function (x) {
      h += '<div class="wbk-ti">' +
        '<button class="wbk-done-btn" data-id="' + x.id + '" title="标记完成">✓</button>' +
        '<div class="wbk-ti-main"><div class="wbk-ti-text">' + esc(x.text) + '</div>' +
        '<div class="wbk-ti-meta">建 ' + fmtDT(x.created) + ' · ' + dueBadge(x.due) + '</div></div>' +
        '<button class="wbk-del-btn" data-id="' + x.id + '" title="删除">×</button></div>';
    });

    /* 已完成（默认折叠） */
    var done = (t[curSection] || []).filter(function (x) { return x.done; });
    done.sort(function (a, b) { return b.doneAt - a.doneAt; });
    if (done.length) {
      h += '<div class="wbk-done-toggle" id="tdToggle">' + (doneOpen ? '▾' : '▸') + ' 已完成（' + done.length + '）' + (doneOpen ? '' : '，点击展开') + '</div>';
      h += '<div class="wbk-done-list"' + (doneOpen ? '' : ' style="display:none"') + '>';
      done.forEach(function (x) {
        h += '<div class="wbk-ti wbk-ti-done">' +
          '<div class="wbk-ti-main"><div class="wbk-ti-text">' + esc(x.text) + '</div>' +
          '<div class="wbk-ti-meta">建 ' + fmtDT(x.created) + ' · 完成于 ' + fmtDT(x.doneAt) + '</div></div>' +
          '<button class="wbk-re-btn" data-id="' + x.id + '" title="恢复为进行中">↩</button>' +
          '<button class="wbk-del-btn" data-id="' + x.id + '" title="删除">×</button></div>';
      });
      h += '</div>';
    }

    /* 备份/恢复 */
    h += '<div class="wbk-todo-foot"><span id="tdExport">⤒ 备份</span><span id="tdImport">⤓ 恢复</span><span class="wbk-todo-hint">数据存于本机浏览器</span></div>';
    h += '</div>';
    return h;
  }

  function wireTodo(rerender) {
    var tabs = app.querySelectorAll('.wbk-tab');
    for (var i = 0; i < tabs.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          curSection = btn.getAttribute('data-sec');
          rerender();
        });
      })(tabs[i]);
    }
    var addBtn = document.getElementById('tdAdd');
    var textEl = document.getElementById('tdText');
    var dueEl = document.getElementById('tdDue');
    function doAdd() {
      var v = (textEl.value || '').trim();
      if (!v) { textEl.focus(); return; }
      var t = loadTodos();
      if (!t[curSection]) { t[curSection] = []; }
      t[curSection].push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        text: v,
        created: Date.now(),
        due: dueEl.value || '',
        done: false,
        doneAt: 0
      });
      saveTodos(t);
      rerender();
    }
    if (addBtn) {
      addBtn.addEventListener('click', doAdd);
      textEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { doAdd(); } });
    }
    var doneBtns = app.querySelectorAll('.wbk-done-btn');
    for (var j = 0; j < doneBtns.length; j++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var t = loadTodos();
          (t[curSection] || []).forEach(function (x) {
            if (x.id === btn.getAttribute('data-id')) { x.done = true; x.doneAt = Date.now(); }
          });
          saveTodos(t);
          rerender();
        });
      })(doneBtns[j]);
    }
    var reBtns = app.querySelectorAll('.wbk-re-btn');
    for (var k = 0; k < reBtns.length; k++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var t = loadTodos();
          (t[curSection] || []).forEach(function (x) {
            if (x.id === btn.getAttribute('data-id')) { x.done = false; x.doneAt = 0; }
          });
          saveTodos(t);
          rerender();
        });
      })(reBtns[k]);
    }
    var delBtns = app.querySelectorAll('.wbk-del-btn');
    for (var m = 0; m < delBtns.length; m++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          if (!confirm('删除这条事项？')) { return; }
          var t = loadTodos();
          t[curSection] = (t[curSection] || []).filter(function (x) { return x.id !== btn.getAttribute('data-id'); });
          saveTodos(t);
          rerender();
        });
      })(delBtns[m]);
    }
    var tg = document.getElementById('tdToggle');
    if (tg) {
      tg.addEventListener('click', function () { doneOpen = !doneOpen; rerender(); });
    }
    var ex = document.getElementById('tdExport');
    if (ex) {
      ex.addEventListener('click', function () {
        var s = localStorage.getItem(TODO_KEY) || '{}';
        if (navigator.clipboard) {
          navigator.clipboard.writeText(s).then(function () { alert('已复制待办数据（可粘贴到另一设备的"恢复"）'); });
        } else {
          prompt('复制以下数据：', s);
        }
      });
    }
    var im = document.getElementById('tdImport');
    if (im) {
      im.addEventListener('click', function () {
        var s = prompt('粘贴备份的待办数据（JSON）：');
        if (!s) { return; }
        try {
          JSON.parse(s);
          localStorage.setItem(TODO_KEY, s);
          rerender();
        } catch (e) { alert('数据格式不正确'); }
      });
    }
  }

  /* ================= 主渲染 ================= */
  function render(d, wh) {
    var h = '';

    /* 0. 待办事项（置顶提醒） */
    h += '<div id="todoZone">' + renderTodoSection() + '</div>';

    /* 1. 指标仪表盘 */
    h += '<div class="wbk-sec">💱 关键指标</div><div class="wbk-ind-grid">';
    (d.indicators || []).forEach(function (it) {
      var arrow = it.trend === 'up' ? '▲' : (it.trend === 'down' ? '▼' : '—');
      var cls = it.trend === 'flat' ? 'flat' : (it.trend === it.good ? 'good' : 'bad');
      h += '<div class="wbk-ind">' +
        '<div class="wbk-ind-name">' + esc(it.name) + '</div>' +
        '<div class="wbk-ind-val">' + esc(it.value) + '<span class="wbk-ind-unit">' + esc(it.unit) + '</span>' +
        '<span class="wbk-ind-arrow ' + cls + '">' + arrow + '</span></div>' +
        '<div class="wbk-ind-note">' + esc(it.note) + '</div></div>';
    });
    h += '</div>';

    /* 2. 情报区 */
    h += '<div class="wbk-sec">📰 情报</div>';
    h += '<div class="wbk-links">' +
      '<a class="wbk-link" href="../archive/' + esc(d.daily.date) + '.html">📊 ' + esc(d.daily.title) + ' <span>' + esc(d.daily.date) + '</span><em>' + esc(d.daily.note) + '</em></a>' +
      '<a class="wbk-link wbk-link-weekly" href="../archive/weekly_' + esc(d.weekly.date) + '.html">🗓 ' + esc(d.weekly.title) + ' <span>' + esc(d.weekly.date) + '</span><em>' + esc(d.weekly.note) + '</em></a>' +
    '</div>';

    if (wh && wh.totals) {
      var evs = (wh.events || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      h += '<div class="wbk-wh">' +
        '<div class="wbk-wh-head">🚨 仓库被炸专题 <a href="../archive/' + esc(d.daily.date) + '.html">完整专题 ›</a></div>' +
        '<div class="wbk-wh-stats">' +
          '<div class="wbk-wh-stat"><b style="color:#cb11ab">' + (wh.totals.wb || 0) + '</b><span>WB 被炸仓库</span></div>' +
          '<div class="wbk-wh-stat"><b style="color:#005bff">' + (wh.totals.ozon || 0) + '</b><span>Ozon 被炸仓库</span></div>' +
          '<div class="wbk-wh-stat"><b>' + evs.length + '</b><span>遇袭事件</span></div>' +
        '</div>';
      evs.slice(0, 3).forEach(function (e) {
        h += '<div class="wbk-wh-ev"><span class="wbk-wh-date">' + esc(e.date) + '</span>' +
          '<span class="wbk-wh-badge ' + (e.platform === 'ozon' ? 'oz' : 'wb') + '">' + (e.platform === 'ozon' ? 'Ozon' : 'WB') + '</span>' +
          esc(e.cityCn || e.city) + '</div>';
      });
      h += '<div class="wbk-wh-upd">数据截至 ' + esc(wh.updated || '') + '</div></div>';
    }

    /* 3. 速算工具 */
    h += '<div class="wbk-sec">🧮 速算</div><div class="wbk-desk-2col"><div>';
    h += '<div class="wbk-card"><div class="wbk-card-title">💱 汇率换算（锁汇价对照）</div>' +
      '<div class="wbk-fx-row"><input id="fxAmt" type="number" value="100000" placeholder="金额">' +
      '<select id="fxFrom"><option value="RUB">卢布 ₽</option><option value="CNY">人民币 ¥</option><option value="USD">美元 $</option></select>' +
      '<span class="wbk-fx-eq">=</span><span class="wbk-fx-out" id="fxOut"></span></div>' +
      '<div class="wbk-fx-rates">汇率 <input id="fxUsd" type="number" step="0.01" value="83.35" title="USD/RUB"> ₽/$ · <input id="fxCny" type="number" step="0.01" value="12.69" title="CNY/RUB"> ₽/¥</div></div>';
    h += '</div><div>';
    h += '<div class="wbk-card"><div class="wbk-card-title">📦 佣金·毛利速算（₽）</div>' +
      '<div class="wbk-calc-grid">' +
      '<label>售价<input id="cPrice" type="number" value="1500"></label>' +
      '<label>佣金%<input id="cComm" type="number" value="22" step="0.5"></label>' +
      '<label>物流<input id="cLog" type="number" value="120"></label>' +
      '<label>成本<input id="cCost" type="number" value="600"></label>' +
      '</div><div class="wbk-calc-out" id="cOut"></div></div>';
    h += '</div></div>';

    /* 4. 管理区 */
    h += '<div class="wbk-sec">📋 管理</div><div class="wbk-desk-2col"><div>';
    h += '<div class="wbk-card"><div class="wbk-card-title">🗓 关键节点</div>';
    (d.milestones || []).forEach(function (m) {
      h += '<div class="wbk-ms wbk-ms-' + esc(m.level) + '"><span class="wbk-ms-date">' + esc(m.date) + '</span>' + esc(m.text) + '</div>';
    });
    h += '</div></div><div>';
    h += '<div class="wbk-card"><div class="wbk-card-title">✅ 本周跟踪</div>';
    (d.todos || []).forEach(function (t) {
      h += '<div class="wbk-todo">• ' + esc(t) + '</div>';
    });
    h += '</div>';
    if (d.meeting) {
      h += '<div class="wbk-card wbk-meeting"><div class="wbk-card-title">⏱ ' + esc(d.meeting.title) + '</div>';
      (d.meeting.rules || []).forEach(function (r) {
        h += '<div class="wbk-todo">• ' + esc(r) + '</div>';
      });
      h += '</div>';
    }
    h += '</div></div>';

    /* 5. 系统状态 */
    h += '<div class="wbk-sec">⚙️ 自动化体系</div><div class="wbk-card">';
    (d.system || []).forEach(function (s) {
      var dot = s.status === 'ok' ? '🟢' : (s.status === 'warn' ? '🟡' : '🔴');
      h += '<div class="wbk-sys"><span>' + dot + ' ' + esc(s.name) + '</span><span class="wbk-sys-sch">' + esc(s.schedule) + '</span><span class="wbk-sys-note">' + esc(s.note) + '</span></div>';
    });
    h += '</div>';

    h += '<div class="hint">数据更新：' + esc(d.updated || '') + ' · Edie的个人工作台 v1.2 · 私人页面请勿外传</div>';
    app.innerHTML = h;

    function rerenderTodo() {
      var zone = document.getElementById('todoZone');
      zone.innerHTML = renderTodoSection();
      wireTodo(rerenderTodo);
      var nt = document.getElementById('tdText');
      if (nt) { nt.focus(); }
    }
    wireTodo(rerenderTodo);
    wireCalc();
  }

  /* ===== 计算器逻辑 ===== */
  function wireCalc() {
    var amt = document.getElementById('fxAmt'), from = document.getElementById('fxFrom'),
        usd = document.getElementById('fxUsd'), cny = document.getElementById('fxCny'),
        out = document.getElementById('fxOut');
    function fx() {
      var a = parseFloat(amt.value) || 0, u = parseFloat(usd.value) || 1, c = parseFloat(cny.value) || 1;
      var rub = from.value === 'RUB' ? a : (from.value === 'USD' ? a * u : a * c);
      out.innerHTML = '₽' + fmt(rub) + ' · $' + fmt(rub / u) + ' · ¥' + fmt(rub / c);
    }
    [amt, from, usd, cny].forEach(function (el) { el.addEventListener('input', fx); });
    fx();

    var p = document.getElementById('cPrice'), cm = document.getElementById('cComm'),
        lg = document.getElementById('cLog'), ct = document.getElementById('cCost'),
        cOut = document.getElementById('cOut');
    function calc() {
      var price = parseFloat(p.value) || 0, comm = price * (parseFloat(cm.value) || 0) / 100,
          cost = (parseFloat(ct.value) || 0) + (parseFloat(lg.value) || 0),
          profit = price - comm - cost,
          margin = price > 0 ? profit / price * 100 : 0;
      cOut.innerHTML = '佣金 ₽' + fmt(comm) + ' · 净利 <b class="' + (profit >= 0 ? 'pos' : 'neg') + '">₽' + fmt(profit) + '</b> · 毛利率 <b class="' + (margin >= 0 ? 'pos' : 'neg') + '">' + margin.toFixed(1) + '%</b>';
    }
    [p, cm, lg, ct].forEach(function (el) { el.addEventListener('input', calc); });
    calc();
  }
  function fmt(n) { return Math.round(n).toLocaleString('ru-RU'); }
})();
