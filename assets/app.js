/* 日报折叠渲染逻辑：读取页面内 #daily-data JSON 数据渲染卡片 */
(function () {
  'use strict';
  var dataEl = document.getElementById('daily-data');
  if (!dataEl) { return; }
  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }

  var items = data.items || [];
  var stats = data.stats || {};

  /* 顶部统计条 */
  var statsEl = document.getElementById('stats');
  if (statsEl && items.length) {
    var pills = [];
    if (stats.total) pills.push('<span class="stat-pill">共 <b>' + stats.total + '</b> 条</span>');
    if (stats.local_pct) pills.push('<span class="stat-pill">本地信源 <b>' + stats.local_pct + '</b></span>');
    if (stats.cn_pct) pills.push('<span class="stat-pill">中文 <b>' + stats.cn_pct + '</b></span>');
    if (stats.en_pct) pills.push('<span class="stat-pill">英文 <b>' + stats.en_pct + '</b></span>');
    statsEl.innerHTML = pills.join('');
  }

  /* 渲染卡片 */
  var listEl = document.getElementById('list');
  if (!items.length) {
    listEl.innerHTML = '<div class="empty">本期无新增重大动态</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var tableHtml = '';
    if (it.table && it.table.length) {
      tableHtml = '<table class="item-table">';
      for (var t = 0; t < it.table.length; t++) {
        tableHtml += '<tr><th>' + esc(it.table[t][0]) + '</th><td>' + esc(it.table[t][1]) + '</td></tr>';
      }
      tableHtml += '</table>';
    }
    html += '<div class="item" data-i="' + i + '">' +
      '<div class="item-head">' +
        '<div class="item-title-row">' +
          '<span class="item-num">' + (it.num || (i + 1)) + '</span>' +
          '<div class="item-title">' + esc(it.title) + '</div>' +
        '</div>' +
        '<div class="item-meta">' +
          '<span class="tag tag-' + esc(it.tag || 'local') + '">' + esc(it.tagText || it.tag || '') + '</span>' +
          '<span>' + esc(it.source || '') + '</span>' +
          '<span>·</span>' +
          '<span>' + esc(it.time || '') + '</span>' +
        '</div>' +
        '<svg class="item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>' +
      '</div>' +
      '<div class="item-body"><div class="item-body-inner">' +
        '<div class="item-summary">' + esc(it.summary) + '</div>' +
        tableHtml +
        (it.sourceFull ? '<div class="item-source">🔗 ' + esc(it.sourceFull) + '</div>' : '') +
      '</div></div>' +
    '</div>';
  }
  listEl.innerHTML = html;

  /* 展开/折叠 */
  var heads = listEl.querySelectorAll('.item-head');
  for (var h = 0; h < heads.length; h++) {
    (function (head) {
      head.addEventListener('click', function () {
        head.parentElement.classList.toggle('open');
      });
    })(heads[h]);
  }
  var expandBtn = document.getElementById('btnExpandAll');
  var collapseBtn = document.getElementById('btnCollapseAll');
  if (expandBtn) {
    expandBtn.addEventListener('click', function () {
      var els = listEl.querySelectorAll('.item');
      for (var j = 0; j < els.length; j++) { els[j].classList.add('open'); }
    });
  }
  if (collapseBtn) {
    collapseBtn.addEventListener('click', function () {
      var els = listEl.querySelectorAll('.item');
      for (var j = 0; j < els.length; j++) { els[j].classList.remove('open'); }
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
})();

/* ===== 仓库被炸专题（独立数据 data/warehouse_attacks.json，所有页面共享） ===== */
(function () {
  'use strict';
  var statsEl = document.getElementById('stats');
  if (!statsEl) { return; }
  var sec = document.createElement('div');
  sec.id = 'warehouse';
  sec.className = 'warehouse-section';
  statsEl.insertAdjacentElement('afterend', sec);

  var DATA_URL = (location.pathname.indexOf('/archive/') !== -1 ? '../' : '') + 'data/warehouse_attacks.json';
  fetch(DATA_URL).then(function (r) { return r.json(); }).then(function (db) {
    render(db);
  }).catch(function () { sec.style.display = 'none'; });

  function render(db) {
    var events = (db.events || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var totals = db.totals || {};
    var wb = totals.wb || 0, ozon = totals.ozon || 0;
    var dead = 0, hurt = 0;
    events.forEach(function (e) {
      var c = e.casualties || '';
      var dm = c.match(/(\d+)\s*死/); if (dm) dead += parseInt(dm[1], 10);
      var hm = c.match(/(\d+)\s*伤/); if (hm) hurt += parseInt(hm[1], 10);
      if (/另(\d+)人死/.test(c)) { dead += parseInt(c.match(/另(\d+)人死/)[1], 10); }
    });
    var cards = '';
    events.slice(0, 6).forEach(function (e) {
      var isOzon = e.platform === 'ozon';
      cards += '<div class="wh-card">' +
        '<div class="wh-card-head"><span class="wh-badge wh-' + (isOzon ? 'ozon' : 'wb') + '">' + (isOzon ? 'Ozon' : 'WB') + '</span>' +
        '<span class="wh-date">' + esc2(e.date) + '</span></div>' +
        '<div class="wh-city">📍 ' + esc2(e.cityCn || e.city) + '</div>' +
        (e.casualties ? '<div class="wh-casualties">⚠️ ' + esc2(e.casualties) + '</div>' : '') +
        '<div class="wh-note">' + esc2(e.note || '') + '</div>' +
        (e.source ? '<a class="wh-source" href="' + esc2(e.source) + '" target="_blank">来源 ↗</a>' : '') +
      '</div>';
    });
    var insights = db.insights || [];
    var insightCards = '';
    insights.forEach(function (ins) {
      insightCards += '<div class="wh-insight">' +
        '<div class="wh-insight-head"><span class="wh-insight-icon">' + esc2(ins.icon || '💡') + '</span>' +
        '<span class="wh-insight-title">' + esc2(ins.title) + '</span></div>' +
        '<div class="wh-insight-text">' + esc2(ins.text) + '</div>' +
        (ins.source ? '<div class="wh-insight-source">来源：' + esc2(ins.source) + '</div>' : '') +
      '</div>';
    });
    var todos = db.todos || [];
    var todoHtml = '';
    todos.forEach(function (t, i) {
      var done = t.status === 'done';
      todoHtml += '<div class="wh-todo' + (done ? ' wh-todo-done' : '') + '">' +
        '<span class="wh-todo-num">' + (i + 1) + '.</span>' +
        '<span class="wh-todo-text">' + esc2(t.text) + '</span>' +
      '</div>';
    });
    sec.innerHTML =
      '<div class="wh-header"><span class="wh-icon">🚨</span>电商平台仓库被炸专题</div>' +
      '<div class="wh-stats">' +
        '<div class="wh-stat wh-stat-wb"><div class="wh-num">' + wb + '</div><div class="wh-label">WB 被炸仓库</div></div>' +
        '<div class="wh-stat wh-stat-ozon"><div class="wh-num">' + ozon + '</div><div class="wh-label">Ozon 被炸仓库</div></div>' +
        '<div class="wh-stat"><div class="wh-num">' + events.length + '</div><div class="wh-label">累计遇袭事件</div></div>' +
        '<div class="wh-stat wh-stat-cas"><div class="wh-num">' + dead + '死' + hurt + '伤</div><div class="wh-label">伤亡合计</div></div>' +
      '</div>' +
      '<div id="wh-map" class="wh-map"></div>' +
      '<div class="wh-cards-title">📋 遇袭记录（最新在前）</div>' +
      '<div class="wh-cards">' + cards + '</div>' +
      (insightCards ? '<div class="wh-cards-title">🧠 深度解读（最新信息）</div><div class="wh-insights">' + insightCards + '</div>' : '') +
      (todoHtml ? '<div class="wh-cards-title">✅ 卖家待办事项（共 ' + todos.length + ' 项）</div><div class="wh-todos">' + todoHtml + '</div>' : '') +
      '<div class="wh-update">数据截至 ' + esc2(db.updated || '') + ' · 每日日报自动更新</div>';
    initMap(events);
  }

  function initMap(events) {
    if (typeof L === 'undefined') {
      loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
      loadJs('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', function () { initMap(events); });
      return;
    }
    var mapEl = document.getElementById('wh-map');
    if (!mapEl || mapEl._leaflet_id) { return; }
    var map = L.map('wh-map').setView([52, 45], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 16
    }).addTo(map);
    var pts = [];
    var usedCoords = {};
    events.forEach(function (e) {
      var isOzon = e.platform === 'ozon';
      var color = isOzon ? '#005bff' : '#cb11ab';
      // 同坐标事件错开（避免相互遮挡）
      var key = e.lat.toFixed(3) + ',' + e.lng.toFixed(3);
      var dup = usedCoords[key] || 0;
      usedCoords[key] = dup + 1;
      var lat = e.lat + dup * 0.12;
      var lng = e.lng + dup * 0.12;
      L.circleMarker([lat, lng], {
        radius: 10, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9
      }).addTo(map).bindPopup(
        '<b>' + (isOzon ? 'Ozon' : 'Wildberries') + '</b><br>' +
        esc2(e.cityCn || e.city) + '<br>' + esc2(e.date) + '<br>' +
        (e.casualties ? '⚠️ ' + esc2(e.casualties) : '')
      );
      pts.push([lat, lng]);
    });
    if (pts.length) { map.fitBounds(pts, { padding: [30, 30] }); }
  }

  function loadCss(href) {
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }
  function loadJs(src, cb) {
    var s = document.createElement('script'); s.src = src; s.onload = cb;
    document.head.appendChild(s);
  }
  function esc2(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
})();
