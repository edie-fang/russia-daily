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
