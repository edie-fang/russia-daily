/* 周度复盘渲染逻辑：读取页面内 #weekly-data JSON，渲染分领域折叠卡片 + 关键数据表 + 趋势判断 */
(function () {
  'use strict';
  var dataEl = document.getElementById('weekly-data');
  if (!dataEl) { return; }
  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }

  /* 顶部统计条 */
  var statsEl = document.getElementById('stats');
  var stats = data.stats || {};
  if (statsEl) {
    var pills = [];
    if (data.period) pills.push('<span class="stat-pill">周期 <b>' + esc(data.period) + '</b></span>');
    if (stats.total) pills.push('<span class="stat-pill">共 <b>' + stats.total + '</b> 条</span>');
    if (stats.local_pct) pills.push('<span class="stat-pill">本地信源 <b>' + stats.local_pct + '</b></span>');
    if (stats.sections) pills.push('<span class="stat-pill">' + esc(stats.sections) + '</span>');
    statsEl.innerHTML = pills.join('');
  }

  var listEl = document.getElementById('list');
  var sections = data.sections || [];
  var html = '';

  /* 分领域折叠卡片 */
  for (var s = 0; s < sections.length; s++) {
    var sec = sections[s];
    var items = sec.items || [];
    html += '<div class="wk-sec-title"><span class="wk-sec-icon">' + esc(sec.icon || '') + '</span>' +
      esc(sec.name || '') + '<span class="wk-sec-count">' + items.length + ' 条</span></div>';
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
      html += '<div class="item">' +
        '<div class="item-head">' +
          '<div class="item-title-row">' +
            '<span class="item-num">' + (it.num || (i + 1)) + '</span>' +
            '<div class="item-title">' + esc(it.title) + '</div>' +
          '</div>' +
          '<div class="item-meta">' +
            '<span class="tag tag-local">' + esc(it.tagText || '本地') + '</span>' +
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
  }

  /* 关键数据表 */
  var kd = data.keyData;
  if (kd && kd.rows && kd.rows.length) {
    html += '<div class="wk-sec-title"><span class="wk-sec-icon">📊</span>关键数据表<span class="wk-sec-count">本周重要指标变化</span></div>';
    html += '<div class="wk-card"><div class="wk-table-wrap"><table class="wk-table"><thead><tr>';
    for (var hh = 0; hh < kd.headers.length; hh++) {
      html += '<th>' + esc(kd.headers[hh]) + '</th>';
    }
    html += '</tr></thead><tbody>';
    for (var r = 0; r < kd.rows.length; r++) {
      html += '<tr>';
      for (var c = 0; c < kd.rows[r].length; c++) {
        html += (c === 0 ? '<td class="wk-k">' : '<td>') + esc(kd.rows[r][c]) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';
  }

  /* 趋势判断 */
  var trends = data.trends || [];
  if (trends.length) {
    html += '<div class="wk-sec-title"><span class="wk-sec-icon">🧭</span>趋势判断<span class="wk-sec-count">' + trends.length + ' 个领域</span></div>';
    for (var ti = 0; ti < trends.length; ti++) {
      html += '<div class="wk-card wk-trend">' +
        '<div class="wk-trend-title">' + esc(trends[ti].title) + '</div>' +
        '<div class="wk-trend-text">' + esc(trends[ti].text) + '</div>' +
      '</div>';
    }
  }

  /* 信源说明 + 元信息 */
  if (data.sourceStats) {
    html += '<div class="wk-sec-title"><span class="wk-sec-icon">📡</span>信源比例</div>' +
      '<div class="wk-card"><div class="wk-trend-text">' + esc(data.sourceStats) + '</div></div>';
  }
  var meta = data.meta || [];
  if (meta.length) {
    html += '<div class="wk-sec-title"><span class="wk-sec-icon">ℹ️</span>元信息</div><div class="wk-card wk-meta">';
    for (var m = 0; m < meta.length; m++) {
      html += '<div class="wk-meta-line">' + esc(meta[m]) + '</div>';
    }
    html += '</div>';
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
      for (var k = 0; k < els.length; k++) { els[k].classList.remove('open'); }
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
})();
