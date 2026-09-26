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

  /* 板块配置：电商最多 10 条，其它板块各最多 5 条 */
  var CATS = [
    { key: 'ecom', icon: '📦', name: '电商动态', limit: 10,
      kw: /Ozon|Wildberries|WB|Яндекс\s*Маркет|Yandex|маркетплейс|电商|仓储|物流|分拣|履约|配送|零售|卖家|平台经济|Магнит|М\.Видео|Лента|X5|АКОРТ|RWB|包装|跨境|选品|店铺|退货|маркетплейса/i },
    { key: 'lighting', icon: '💡', name: '灯具照明', limit: 5, kw: /灯具|照明|LED|светильник|светотехник|灯泡|光源/i },
    { key: 'beauty', icon: '💄', name: '美妆个护', limit: 5, kw: /美妆|化妆|护肤|香水|个护|парфюм|космет|脱毛|洗护|口腔|P&G|宝洁/i },
    { key: 'appliance', icon: '🔌', name: '家电电器', limit: 5, kw: /家电|电器|бытов|техник|Smart\s*TV|智能电视|RuStore|智能眼镜|小家电|清洁电器|智能家居/i },
    { key: 'econ', icon: '📊', name: '经济金融', limit: 5, kw: /央行|汇率|卢布|通胀|利率|油价|Brent|MOEX|Минфин|ЦБ|预算|税|GDP|工资|天然气|证券|抵押|信贷|分期|最低生活|被动收入|消费税/i },
    { key: 'politics', icon: '🏛', name: '时政要闻', limit: 5, kw: /选举|杜马|普京|政府|制裁|无人机|袭击|打击|军事|国防|外交|特朗普|泽连斯基|停火|峰会|部长|法案|立法|炼油厂|州长|атака|БПЛА/i },
    { key: 'other', icon: '📰', name: '其它动态', limit: 5, kw: null }
  ];

  function classify(it) {
    if (it.cat) { return it.cat; }
    var s = String(it.title || '');
    for (var ci = 0; ci < CATS.length; ci++) {
      if (CATS[ci].kw && CATS[ci].kw.test(s)) { return CATS[ci].key; }
    }
    return 'other';
  }

  function itemCard(it, displayNum) {
    var tableHtml = '';
    if (it.table && it.table.length) {
      tableHtml = '<table class="item-table">';
      for (var t = 0; t < it.table.length; t++) {
        tableHtml += '<tr><th>' + esc(it.table[t][0]) + '</th><td>' + esc(it.table[t][1]) + '</td></tr>';
      }
      tableHtml += '</table>';
    }
    return '<div class="item">' +
      '<div class="item-head">' +
        '<div class="item-title-row">' +
          '<span class="item-num">' + displayNum + '</span>' +
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

  /* 渲染卡片：按板块分组，每板块限量（电商 10，其它 5） */
  var listEl = document.getElementById('list');
  if (!items.length) {
    listEl.innerHTML = '<div class="empty">本期无新增重大动态</div>';
    return;
  }
  var grouped = {};
  for (var gi = 0; gi < items.length; gi++) {
    var gk = classify(items[gi]);
    if (!grouped[gk]) { grouped[gk] = []; }
    grouped[gk].push(items[gi]);
  }
  var html = '';
  var seq = 0;
  CATS.forEach(function (c) {
    var arr = grouped[c.key] || [];
    if (!arr.length) { return; }
    var use = arr.slice(0, c.limit);
    html += '<div class="cat-title">' + c.icon + ' ' + c.name +
      '<span class="cat-count">' + use.length + ' 条' +
      (arr.length > c.limit ? '（另有 ' + (arr.length - c.limit) + ' 条未显示）' : '') +
      '</span></div>';
    use.forEach(function (it) { seq++; html += itemCard(it, seq); });
  });
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
    function eventCard(e) {
      var isOzon = e.platform === 'ozon';
      return '<div class="wh-card">' +
        '<div class="wh-card-head"><span class="wh-badge wh-' + (isOzon ? 'ozon' : 'wb') + '">' + (isOzon ? 'Ozon' : 'WB') + '</span>' +
        '<span class="wh-date">' + esc2(e.date) + '</span></div>' +
        '<div class="wh-city">📍 ' + esc2(e.cityCn || e.city) + '</div>' +
        (e.casualties ? '<div class="wh-casualties">⚠️ ' + esc2(e.casualties) + '</div>' : '') +
        '<div class="wh-note">' + esc2(e.note || '') + '</div>' +
        (e.source ? '<a class="wh-source" href="' + esc2(e.source) + '" target="_blank">来源 ↗</a>' : '') +
      '</div>';
    }
    function clip(s, n) {
      s = String(s == null ? '' : s);
      return s.length > n ? s.slice(0, n) + '…' : s;
    }
    function daysAgo(dstr) {
      var d = new Date(String(dstr) + 'T00:00:00');
      if (isNaN(d.getTime())) { return ''; }
      var diff = Math.floor((Date.now() - d.getTime()) / 86400000);
      if (diff <= 0) { return '今天'; }
      return diff + ' 天前';
    }

    var insights = db.insights || [];
    var todos = db.todos || [];

    /* 只展示：最新一次遇袭 + 最新一条分析 */
    var latest = events[0];
    var latestHtml = latest
      ? '<div class="wh-cards">' + eventCard(latest) + '</div>' +
        '<div class="wh-ago">最近一次 · ' + esc2(latest.date) + '（' + daysAgo(latest.date) + '）</div>'
      : '<div class="wh-note">暂无记录</div>';
    var latestIns = null;
    for (var ii = insights.length - 1; ii >= 0 && ii >= insights.length - 5; ii--) {
      if (!/待核实/.test(insights[ii].title || '')) { latestIns = insights[ii]; break; }
    }
    if (!latestIns && insights.length) { latestIns = insights[insights.length - 1]; }
    var latestInsHtml = latestIns
      ? '<div class="wh-insight">' +
          '<div class="wh-insight-head"><span class="wh-insight-icon">' + esc2(latestIns.icon || '💡') + '</span>' +
          '<span class="wh-insight-title">' + esc2(latestIns.title) + '</span></div>' +
          '<div class="wh-insight-text">' + esc2(clip(latestIns.text, 200)) + '</div>' +
        '</div>'
      : '';

    /* 完整历史（默认折叠） */
    var allCards = '';
    events.forEach(function (e) { allCards += eventCard(e); });
    var insightCards = '';
    insights.forEach(function (ins) {
      insightCards += '<div class="wh-insight">' +
        '<div class="wh-insight-head"><span class="wh-insight-icon">' + esc2(ins.icon || '💡') + '</span>' +
        '<span class="wh-insight-title">' + esc2(ins.title) + '</span></div>' +
        '<div class="wh-insight-text">' + esc2(ins.text) + '</div>' +
        (ins.source ? '<div class="wh-insight-source">来源：' + esc2(ins.source) + '</div>' : '') +
      '</div>';
    });
    var todoHtml = '';
    todos.forEach(function (t, i) {
      var done = t.status === 'done';
      todoHtml += '<div class="wh-todo' + (done ? ' wh-todo-done' : '') + '">' +
        '<span class="wh-todo-num">' + (i + 1) + '.</span>' +
        '<span class="wh-todo-text">' + esc2(t.text) + '</span>' +
      '</div>';
    });
    sec.innerHTML =
      '<div class="wh-header" id="wh-toggle">' +
        '<span class="wh-icon">🚨</span>' +
        '<span class="wh-title-text">电商平台仓库被炸专题</span>' +
        '<span class="wh-summary">' + wb + ' WB · ' + ozon + ' Ozon · ' + events.length + ' 起 · ' + dead + '死' + hurt + '伤</span>' +
        '<span class="wh-chevron">▾</span>' +
      '</div>' +
      '<div class="wh-body" id="wh-body">' +
        '<div class="wh-stats">' +
          '<div class="wh-stat wh-stat-wb"><div class="wh-num">' + wb + '</div><div class="wh-label">WB 被炸仓库</div></div>' +
          '<div class="wh-stat wh-stat-ozon"><div class="wh-num">' + ozon + '</div><div class="wh-label">Ozon 被炸仓库</div></div>' +
          '<div class="wh-stat"><div class="wh-num">' + events.length + '</div><div class="wh-label">累计遇袭事件</div></div>' +
          '<div class="wh-stat wh-stat-cas"><div class="wh-num">' + dead + '死' + hurt + '伤</div><div class="wh-label">伤亡合计</div></div>' +
        '</div>' +
        '<div id="wh-map" class="wh-map"></div>' +
        '<div class="wh-cards-title">📍 最新一次遇袭</div>' +
        latestHtml +
        (latestInsHtml ? '<div class="wh-cards-title">🧠 最新分析</div><div class="wh-insights">' + latestInsHtml + '</div>' : '') +
        '<div class="wh-sub" id="wh-sub-history">' +
          '<div class="wh-sub-head" data-sub="wh-sub-history"><span class="wh-sub-title">📚 完整历史</span><span class="wh-sub-count">' + events.length + ' 起 · ' + insights.length + ' 分析 · ' + todos.length + ' 待办</span><span class="wh-sub-chevron">▾</span></div>' +
          '<div class="wh-sub-body">' +
            (allCards ? '<div class="wh-cards-title">📋 全部遇袭记录（最新在前）</div><div class="wh-cards">' + allCards + '</div>' : '') +
            (insightCards ? '<div class="wh-cards-title">🧠 全部分析</div><div class="wh-insights">' + insightCards + '</div>' : '') +
            (todoHtml ? '<div class="wh-cards-title">✅ 卖家待办事项</div><div class="wh-todos">' + todoHtml + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="wh-update">数据截至 ' + esc2(db.updated || '') + ' · 每日日报自动更新</div>' +
      '</div>';

    // 折叠：默认收起为一行摘要，点击展开；展开状态记忆在 localStorage
    var WH_KEY = 'wh_section_open';
    var isOpen = false;
    try { isOpen = localStorage.getItem(WH_KEY) === '1'; } catch (e) { isOpen = false; }
    var toggleEl = document.getElementById('wh-toggle');
    function syncCollapse() {
      sec.classList.toggle('wh-collapsed', !isOpen);
      if (isOpen) { window.setTimeout(function () { initMap(events); }, 60); }
    }
    if (toggleEl) {
      toggleEl.addEventListener('click', function () {
        isOpen = !isOpen;
        try { localStorage.setItem(WH_KEY, isOpen ? '1' : '0'); } catch (e) {}
        syncCollapse();
      });
    }
    // 二级折叠：深度解读 / 待办事项 默认收起（各自记忆状态）
    var subs = sec.querySelectorAll('.wh-sub-head');
    Array.prototype.forEach.call(subs, function (head) {
      var id = head.getAttribute('data-sub');
      var wrap = document.getElementById(id);
      if (!wrap) { return; }
      var openSub = false;
      try { openSub = localStorage.getItem('wh_open_' + id) === '1'; } catch (e) { openSub = false; }
      wrap.classList.toggle('wh-sub-collapsed', !openSub);
      head.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openSub = !openSub;
        try { localStorage.setItem('wh_open_' + id, openSub ? '1' : '0'); } catch (e) {}
        wrap.classList.toggle('wh-sub-collapsed', !openSub);
      });
    });

    syncCollapse();
  }

  var whMap = null;
  function initMap(events) {
    if (typeof L === 'undefined') {
      loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
      loadJs('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', function () { initMap(events); });
      return;
    }
    var mapEl = document.getElementById('wh-map');
    if (!mapEl) { return; }
    if (mapEl._leaflet_id) { if (whMap) { whMap.invalidateSize(); } return; }
    var map = L.map('wh-map').setView([52, 45], 4);
    whMap = map;
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
