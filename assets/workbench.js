/* Edie的个人工作台 渲染逻辑（私有版 v1.3）
   - 工作台数据：../data/workbench_enc.json（XOR(口令)+base64）
   - 待办事项：板块 = 外贸/电商/个人
     · 云端同步：../data/todos_enc.json（同一口令加密，GitHub 仓库为同步中枢）
     · 写回授权：../data/gh_token_enc.json（细粒度 PAT，同口令加密；未配置则仅本机）
     · localStorage 作本地缓存，离线不丢；远端为各设备同步源
   - 专题数据（公开信息）读 ../data/warehouse_attacks.json */
(function () {
  'use strict';
  var app = document.getElementById('app');
  if (!app) { return; }

  var LS_KEY = 'wbk_pc_v1';
  var TODO_KEY = 'wbk_todos_v2';
  var TODO_KEY_OLD = 'wbk_todos_v1';
  var REPO = 'edie-fang/russia-daily';

  var SECTIONS = [
    {id: 'ecom', name: '电商'},
    {id: 'trade', name: '外贸'},
    {id: 'personal', name: '个人'}
  ];

  var passcode = null;      // 解锁后持有的口令（用于加解密）
  var ghToken = null;       // 细粒度 PAT（可写）；null = 仅本机模式
  var syncState = 'local';  // local | syncing | synced | error | pending
  var syncText = '本机';

  document.getElementById('today').textContent =
    new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'});

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ===== XOR 加解密（与 encode_workbench.py 同算法） ===== */
  function xorBytes(bytes, pc) {
    var key = new TextEncoder().encode(pc);
    var out = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) { out[i] = bytes[i] ^ key[i % key.length]; }
    return out;
  }
  function xorDecode(b64, pc) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
    return new TextDecoder('utf-8').decode(xorBytes(bytes, pc));
  }
  function xorEncode(text, pc) {
    var bytes = new TextEncoder().encode(text);
    var enc = xorBytes(bytes, pc);
    var bin = '';
    for (var i = 0; i < enc.length; i++) { bin += String.fromCharCode(enc[i]); }
    return btoa(bin);
  }
  function b64utf8(s) { return btoa(unescape(encodeURIComponent(s))); }

  /* ================= 生物识别（WebAuthn / Windows Hello） ================= */
  /* 绑定逻辑：必须先用口令成功登录一次才能绑定本设备；
     陌生人没有已绑定的凭证，无法通过人脸/指纹直接登录 */
  var BIO_KEY = 'wbk_bio_v1';
  function bioSupported() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  }
  function bioLoad() { try { return JSON.parse(localStorage.getItem(BIO_KEY) || 'null'); } catch (e) { return null; } }
  function bioSave(o) { try { localStorage.setItem(BIO_KEY, JSON.stringify(o)); } catch (e) {} }
  function bioClear() { try { localStorage.removeItem(BIO_KEY); } catch (e) {} }
  function randBytes(n) { var b = new Uint8Array(n); crypto.getRandomValues(b); return b; }
  function bufToB64(buf) {
    var bin = ''; var bytes = new Uint8Array(buf);
    for (var i = 0; i < bytes.length; i++) { bin += String.fromCharCode(bytes[i]); }
    return btoa(bin);
  }
  function b64ToBuf(b64) {
    var bin = atob(b64); var b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { b[i] = bin.charCodeAt(i); }
    return b.buffer;
  }
  function bioBind(pc, onDone) {
    if (!bioSupported()) { onDone && onDone('此浏览器不支持生物识别（请用电脑 Chrome/Edge）'); return; }
    var dk = bufToB64(randBytes(32));
    navigator.credentials.create({
      publicKey: {
        challenge: randBytes(32),
        rp: { name: 'Edie工作台' },
        user: { id: randBytes(16), name: 'edie-workbench', displayName: 'Edie' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        attestation: 'none',
        timeout: 60000
      }
    }).then(function (cred) {
      bioSave({ credId: bufToB64(cred.rawId), encPass: xorEncode(pc, dk), dk: dk });
      onDone && onDone(null, '✅ 已绑定本设备，下次打开可直接用人脸/指纹解锁');
    }).catch(function (e) {
      onDone && onDone('绑定取消或失败（' + ((e && e.name) || '未知') + '）');
    });
  }
  function bioUnlock() {
    var b = bioLoad();
    if (!b) { return; }
    navigator.credentials.get({
      publicKey: {
        challenge: randBytes(32),
        allowCredentials: [{ type: 'public-key', id: b64ToBuf(b.credId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000
      }
    }).then(function () {
      try {
        var pc = xorDecode(b.encPass, b.dk);
        tryUnlock(pc, true);
      } catch (e) { showLock('生物识别数据异常，请用口令登录'); }
    }).catch(function () {
      showLock('人脸/指纹验证未通过，可用口令登录');
    });
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
        passcode = pc;
        fetch('../data/warehouse_attacks.json').then(function (r) { return r.json(); })
          .catch(function () { return null; })
          .then(function (wh) {
            render(data, wh);
            initSync();
            offerBioBind(pc);
          });
      })
      .catch(function () { showLock('数据加载失败，请稍后刷新'); });
  }

  /* 解锁成功后：若本设备支持生物识别且未绑定，提示绑定 */
  function offerBioBind(pc) {
    if (!bioSupported() || bioLoad()) { return; }
    var bar = document.createElement('div');
    bar.className = 'wbk-bio-bar';
    bar.innerHTML = '<span>💡 本设备支持人脸/指纹解锁，绑定后下次一键进入（无需再输口令）</span>' +
      '<button id="bioBindBtn">👆 绑定本设备</button><button id="bioSkipBtn" class="wbk-bio-skip">暂不</button>';
    app.insertBefore(bar, app.firstChild);
    document.getElementById('bioBindBtn').addEventListener('click', function () {
      bioBind(pc, function (err, ok) {
        bar.innerHTML = '<span>' + esc(err || ok) + '</span>';
        if (!err) { setTimeout(function () { bar.remove(); }, 3000); }
      });
    });
    document.getElementById('bioSkipBtn').addEventListener('click', function () { bar.remove(); });
  }

  /* 锁屏界面注入：已绑定设备显示"人脸/指纹解锁"按钮 */
  function injectBioButton() {
    if (!bioSupported() || !bioLoad()) { return; }
    var lock = document.getElementById('lock');
    if (!lock || document.getElementById('bioUnlockBtn')) { return; }
    var btn = document.createElement('button');
    btn.id = 'bioUnlockBtn';
    btn.className = 'btn wbk-bio-btn';
    btn.textContent = '👆 人脸 / 指纹解锁';
    btn.addEventListener('click', bioUnlock);
    var err = document.getElementById('pcErr');
    lock.insertBefore(btn, err || null);
  }
  injectBioButton();

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

  /* ================= 待办：本地缓存 ================= */

  function migrateOld(t) {
    /* v1（品牌板块）→ v2：全部并入电商 */
    var old = null;
    try { old = JSON.parse(localStorage.getItem(TODO_KEY_OLD) || 'null'); } catch (e) {}
    if (!old) { return t; }
    var merged = false;
    Object.keys(old).forEach(function (sec) {
      (old[sec] || []).forEach(function (x) {
        if (!t.ecom) { t.ecom = []; }
        t.ecom.push(x);
        merged = true;
      });
    });
    if (merged) {
      try { localStorage.removeItem(TODO_KEY_OLD); } catch (e) {}
    }
    return t;
  }
  function loadTodos() {
    var t = {};
    try {
      t = JSON.parse(localStorage.getItem(TODO_KEY) || '{}') || {};
    } catch (e) { t = {}; }
    if (!localStorage.getItem(TODO_KEY)) { t = migrateOld(t); }
    return t;
  }
  function saveTodosLocal(t) {
    try { localStorage.setItem(TODO_KEY, JSON.stringify(t)); } catch (e) {}
  }

  /* ================= 待办：云端同步 ================= */
  function setSync(state, text) {
    syncState = state;
    syncText = text;
    var el = document.getElementById('tdSync');
    if (el) {
      var icon = state === 'synced' ? '☁️' : state === 'syncing' ? '⏳' : state === 'error' ? '⚠️' : state === 'pending' ? '📴' : '💻';
      el.textContent = icon + ' ' + text;
      el.className = 'wbk-sync wbk-sync-' + state;
    }
  }

  function initSync() {
    /* 1) 取写回令牌（无则本机模式）——加时间戳防缓存 */
    fetch('../data/gh_token_enc.json?v=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (payload) {
        if (payload && payload.enc) {
          try { ghToken = xorDecode(payload.enc, passcode).trim(); } catch (e) { ghToken = null; }
        }
        /* 2) 拉远端待办（有则以远端为准） */
        return fetch('../data/todos_enc.json?v=' + Date.now())
          .then(function (r) { return r.ok ? r.json() : null; });
      })
      .then(function (payload) {
        if (payload && payload.enc) {
          try {
            var remote = JSON.parse(xorDecode(payload.enc, passcode));
            if (remote && typeof remote === 'object') {
              saveTodosLocal(remote);
              refreshTodo();
            }
          } catch (e) {}
        }
        setSync(ghToken ? 'synced' : 'local', ghToken ? '云端已同步' : '仅本机（未配置同步）');
        if (ghToken) { pushTodos(); }  // 令牌就绪后立即把本地数据推上云端
      })
      .catch(function () {
        setSync(ghToken ? 'error' : 'local', ghToken ? '云端读取失败（本机数据可用）' : '仅本机（未配置同步）');
      });
  }

  /* ================= 云端同步配置（自助写入加密 PAT） ================= */
  function cfgSync() {
    if (!passcode) { return; }
    var pat = prompt(
      '配置云端同步（多设备共享待办）：\n\n' +
      '1. 打开 github.com/settings/personal-access-tokens/new\n' +
      '2. 仓库选择 russia-daily，权限勾 Contents: Read and write\n' +
      '3. 生成后把 PAT 粘贴到这里：'
    );
    if (!pat || !pat.trim()) { return; }
    pat = pat.trim();
    var encJson = JSON.stringify({ enc: xorEncode(pat, passcode) });
    var apiBase = 'https://api.github.com/repos/' + REPO + '/contents/data/gh_token_enc.json';
    setSync('syncing', '写入同步配置…');
    fetch(apiBase, { headers: { 'Authorization': 'Bearer ' + pat, 'Accept': 'application/vnd.github+json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (info) {
        var body = { message: 'workbench: configure sync token', content: b64utf8(encJson), branch: 'main' };
        if (info && info.sha) { body.sha = info.sha; }
        return fetch(apiBase, {
          method: 'PUT',
          headers: { 'Authorization': 'Bearer ' + pat, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      })
      .then(function (r) {
        if (r && (r.status === 200 || r.status === 201)) {
          ghToken = pat;
          setSync('synced', '云端同步已配置 ✓');
          pushTodos();
        } else {
          setSync('error', '写入失败：请检查 PAT 权限');
        }
      })
      .catch(function () { setSync('error', '网络错误，稍后重试'); });
  }

  var pushTimer = null;
  function pushTodos() {
    if (!ghToken) { setSync('local', '仅本机（未配置同步）'); return; }
    setSync('syncing', '同步中…');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(doPush, 1200);
  }
  function doPush() {
    var t = loadTodos();
    var encJson = JSON.stringify({enc: xorEncode(JSON.stringify(t), passcode)});
    var apiBase = 'https://api.github.com/repos/' + REPO + '/contents/data/todos_enc.json';
    fetch(apiBase, {headers: {'Authorization': 'token ' + ghToken, 'Accept': 'application/vnd.github+json'}})
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (info) {
        var body = {
          message: 'workbench todos sync',
          content: b64utf8(encJson),
          branch: 'main'
        };
        if (info && info.sha) { body.sha = info.sha; }
        return fetch(apiBase, {
          method: 'PUT',
          headers: {'Authorization': 'token ' + ghToken, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'},
          body: JSON.stringify(body)
        });
      })
      .then(function (r) {
        if (r && (r.status === 200 || r.status === 201)) {
          var d = new Date();
          setSync('synced', '已同步 ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2));
        } else {
          setSync('pending', '同步失败，已存本机，下次自动重试');
        }
      })
      .catch(function () { setSync('pending', '同步失败，已存本机，下次自动重试'); });
  }

  /* ================= 待办：渲染 ================= */
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

    h += '<div class="wbk-add">' +
      '<select id="tdSec">' + SECTIONS.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('') + '</select>' +
      '<input id="tdText" type="text" placeholder="输入待办事项…" maxlength="120">' +
      '<input id="tdDue" type="date" title="目标完成期限">' +
      '<button class="wbk-addbtn" id="tdAdd">+ 添加</button></div>';

    /* 全部分区依次排列：电商 → 外贸 → 个人（不用标签切换隐藏） */
    SECTIONS.forEach(function (s) {
      var items = (t[s.id] || []).filter(function (x) { return !x.done; });
      items.sort(function (a, b) {
        var da = a.due || '9999', db = b.due || '9999';
        return da < db ? -1 : da > db ? 1 : a.created - b.created;
      });
      h += '<div class="wbk-subsec">' + esc(s.name) + '（' + items.length + '）</div>';
      if (!items.length) {
        h += '<div class="wbk-todo-empty">暂无进行中事项</div>';
      }
      items.forEach(function (x) {
        h += '<div class="wbk-ti">' +
          '<button class="wbk-done-btn" data-sec="' + s.id + '" data-id="' + x.id + '" title="标记完成">✓</button>' +
          '<div class="wbk-ti-main"><div class="wbk-ti-text">' + esc(x.text) + '</div>' +
          '<div class="wbk-ti-meta">建 ' + fmtDT(x.created) + ' · ' + dueBadge(x.due) + '</div></div>' +
          '<button class="wbk-del-btn" data-sec="' + s.id + '" data-id="' + x.id + '" title="删除">×</button></div>';
      });

      var done = (t[s.id] || []).filter(function (x) { return x.done; });
      done.sort(function (a, b) { return b.doneAt - a.doneAt; });
      if (done.length) {
        h += '<div class="wbk-done-toggle" data-sec="' + s.id + '">▸ 已完成（' + done.length + '，点击展开）</div>';
        h += '<div class="wbk-done-list" style="display:none" data-sec="' + s.id + '">';
        done.forEach(function (x) {
          h += '<div class="wbk-ti wbk-ti-done">' +
            '<div class="wbk-ti-main"><div class="wbk-ti-text">' + esc(x.text) + '</div>' +
            '<div class="wbk-ti-meta">建 ' + fmtDT(x.created) + ' · 完成于 ' + fmtDT(x.doneAt) + '</div></div>' +
            '<button class="wbk-re-btn" data-sec="' + s.id + '" data-id="' + x.id + '" title="恢复为进行中">↩</button>' +
            '<button class="wbk-del-btn" data-sec="' + s.id + '" data-id="' + x.id + '" title="删除">×</button></div>';
        });
        h += '</div>';
      }
    });

    h += '<div class="wbk-todo-foot"><span id="tdExport">⤒ 备份</span><span id="tdImport">⤓ 恢复</span><span id="tdSyncCfg">⚙️ 配置同步</span><span id="tdSync" class="wbk-sync">💻 本机</span></div>';
    h += '</div>';
    return h;
  }

  function refreshTodo() {
    var zone = document.getElementById('todoZone');
    if (!zone) { return; }
    zone.innerHTML = renderTodoSection();
    wireTodo();
    setSync(syncState, syncText);  // 重渲染后恢复同步状态徽标
  }

  function mutate(fn) {
    var t = loadTodos();
    fn(t);
    saveTodosLocal(t);
    refreshTodo();
    pushTodos();
  }

  function wireTodo() {
    var addBtn = document.getElementById('tdAdd');
    var textEl = document.getElementById('tdText');
    var dueEl = document.getElementById('tdDue');
    var secEl = document.getElementById('tdSec');
    function doAdd() {
      var v = (textEl.value || '').trim();
      if (!v) { textEl.focus(); return; }
      var sec = secEl ? secEl.value : SECTIONS[0].id;
      mutate(function (t) {
        if (!t[sec]) { t[sec] = []; }
        t[sec].push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          text: v,
          created: Date.now(),
          due: dueEl.value || '',
          done: false,
          doneAt: 0
        });
      });
    }
    if (addBtn) {
      addBtn.addEventListener('click', doAdd);
      textEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { doAdd(); } });
    }
    var doneBtns = app.querySelectorAll('.wbk-done-btn');
    for (var j = 0; j < doneBtns.length; j++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var sec = btn.getAttribute('data-sec');
          mutate(function (t) {
            (t[sec] || []).forEach(function (x) {
              if (x.id === btn.getAttribute('data-id')) { x.done = true; x.doneAt = Date.now(); }
            });
          });
        });
      })(doneBtns[j]);
    }
    var reBtns = app.querySelectorAll('.wbk-re-btn');
    for (var k = 0; k < reBtns.length; k++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var sec = btn.getAttribute('data-sec');
          mutate(function (t) {
            (t[sec] || []).forEach(function (x) {
              if (x.id === btn.getAttribute('data-id')) { x.done = false; x.doneAt = 0; }
            });
          });
        });
      })(reBtns[k]);
    }
    var delBtns = app.querySelectorAll('.wbk-del-btn');
    for (var m = 0; m < delBtns.length; m++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          if (!confirm('删除这条事项？')) { return; }
          var sec = btn.getAttribute('data-sec');
          mutate(function (t) {
            t[sec] = (t[sec] || []).filter(function (x) { return x.id !== btn.getAttribute('data-id'); });
          });
        });
      })(delBtns[m]);
    }
    var toggles = app.querySelectorAll('.wbk-done-toggle');
    for (var tg = 0; tg < toggles.length; tg++) {
      (function (el) {
        el.addEventListener('click', function () {
          var sec = el.getAttribute('data-sec');
          var list = app.querySelector('.wbk-done-list[data-sec="' + sec + '"]');
          if (!list) { return; }
          var open = list.style.display !== 'none';
          list.style.display = open ? 'none' : '';
          el.textContent = (open ? '▸ 已完成' : '▾ 已完成') + el.textContent.replace(/^[▸▾] 已完成/, '');
        });
      })(toggles[tg]);
    }
    var ex = document.getElementById('tdExport');
    if (ex) {
      ex.addEventListener('click', function () {
        var s = localStorage.getItem(TODO_KEY) || '{}';
        if (navigator.clipboard) {
          navigator.clipboard.writeText(s).then(function () { alert('已复制待办数据'); });
        } else {
          prompt('复制以下数据：', s);
        }
      });
    }
    var cfg = document.getElementById('tdSyncCfg');
    if (cfg) { cfg.addEventListener('click', cfgSync); }
    var im = document.getElementById('tdImport');
    if (im) {
      im.addEventListener('click', function () {
        var s = prompt('粘贴备份的待办数据（JSON）：');
        if (!s) { return; }
        try {
          JSON.parse(s);
          localStorage.setItem(TODO_KEY, s);
          refreshTodo();
          pushTodos();
        } catch (e) { alert('数据格式不正确'); }
      });
    }
  }

  /* ================= 主渲染 ================= */
  function render(d, wh) {
    var h = '';

    h += '<div id="todoZone">' + renderTodoSection() + '</div>';

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

    h += '<div class="wbk-sec">⚙️ 自动化体系</div><div class="wbk-card">';
    (d.system || []).forEach(function (s) {
      var dot = s.status === 'ok' ? '🟢' : (s.status === 'warn' ? '🟡' : '🔴');
      h += '<div class="wbk-sys"><span>' + dot + ' ' + esc(s.name) + '</span><span class="wbk-sys-sch">' + esc(s.schedule) + '</span><span class="wbk-sys-note">' + esc(s.note) + '</span></div>';
    });
    h += '</div>';

    h += '<div class="hint">数据更新：' + esc(d.updated || '') + ' · Edie的个人工作台 v1.3 · 私人页面请勿外传</div>';
    app.innerHTML = h;

    wireTodo();
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
