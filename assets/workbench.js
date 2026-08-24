/* Edie的个人工作台 渲染逻辑（私有版）
   - 数据加密存放：../data/workbench_enc.json（XOR(口令)+base64）
   - 输入口令后解码渲染，口令经 localStorage 记住（每设备一次）
   - 专题数据（公开信息）仍读 ../data/warehouse_attacks.json */
(function () {
  'use strict';
  var app = document.getElementById('app');
  if (!app) { return; }

  var LS_KEY = 'wbk_pc_v1';
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

  /* 口令门 */
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

  /* ===== 渲染 ===== */
  function render(d, wh) {
    var h = '';

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

    h += '<div class="hint">数据更新：' + esc(d.updated || '') + ' · Edie的个人工作台 v1.1 · 私人页面请勿外传</div>';
    app.innerHTML = h;
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
