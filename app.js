(() => {
  const storageKey = 'keiba_roi_records_v1';
  const syncKey = 'keiba_roi_sync_settings_v1';

  /** @typedef {{id:string,date:string,race:string,stake:number,ret:number,memo?:string}} Record */

  const $ = (sel) => document.querySelector(sel);

  // Elements
  const raceInput = /** @type {HTMLInputElement} */(document.getElementById('race'));
  const raceDatalist = /** @type {HTMLDataListElement} */(document.getElementById('race-list'));
  const form = $('#entry-form');
  const tbody = $('#records tbody');
  const from = $('#from');
  const to = $('#to');
  const applyBtn = $('#apply-filter');
  const clearBtn = $('#clear-filter');
  const exportBtn = $('#export-json');
  const importInput = $('#import-json');
  const listQ = /** @type {HTMLInputElement} */(document.getElementById('filter-q'));
  const listGroup = /** @type {HTMLSelectElement} */(document.getElementById('filter-group'));
  const listClearBtn = document.getElementById('filter-clear-list');
  const listRoi100 = /** @type {HTMLInputElement} */(document.getElementById('filter-roi100'));
  const listFrom = /** @type {HTMLInputElement} */(document.getElementById('list-from'));
  const listTo = /** @type {HTMLInputElement} */(document.getElementById('list-to'));

  const sumCount = $('#sum-count');
  const sumStake = $('#sum-stake');
  const sumReturn = $('#sum-return');
  const sumRoi = $('#sum-roi');
  const sumPL = $('#sum-pl');
  const canvas = /** @type {HTMLCanvasElement} */(document.getElementById('roi-chart'));
  const ctx = canvas.getContext('2d');
  // Sync UI elements
  const syncToken = /** @type {HTMLInputElement} */(document.getElementById('sync-token'));
  const syncGist = /** @type {HTMLInputElement} */(document.getElementById('sync-gist'));
  const syncAuto = /** @type {HTMLInputElement} */(document.getElementById('sync-auto'));
  const syncSaveBtn = document.getElementById('sync-save');
  const gistInitBtn = document.getElementById('gist-init');
  const gistUploadBtn = document.getElementById('gist-upload');
  const gistDownloadBtn = document.getElementById('gist-download');

  // Utilities
  const fmtYen = (n) => new Intl.NumberFormat('ja-JP').format(Math.round(n));
  const pct = (n) => `${(n * 100).toFixed(1)}%`;
  const parseNum = (v) => Math.max(0, Number(v || 0));

  function loadRecords() {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }
  /** @param {Record[]} rows */
  function saveRecords(rows) {
    localStorage.setItem(storageKey, JSON.stringify(rows));
    // Background sync if enabled
    if (syncState.settings.auto && !syncState.isSyncing) scheduleUpload();
  }

  // ---- Sync (GitHub Gist) ----
  const syncState = {
    settings: loadSyncSettings(),
    uploadTimer: null,
    isSyncing: false,
  };

  function loadSyncSettings() {
    try { return JSON.parse(localStorage.getItem(syncKey) || '{}'); } catch { return {}; }
  }
  function saveSyncSettings(s) {
    localStorage.setItem(syncKey, JSON.stringify(s));
  }
  function setSyncUIFromSettings() {
    if (syncToken) syncToken.value = syncState.settings.token || '';
    if (syncGist) syncGist.value = syncState.settings.gistId || '';
    if (syncAuto) syncAuto.checked = !!syncState.settings.auto;
  }
  function headers(token) {
    return {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github+json'
    };
  }
  async function gistInit() {
    const token = (syncToken?.value || '').trim();
    if (!token) { alert('トークンを入力してください'); return; }
    const files = { 'keiba-roi-records.json': { content: JSON.stringify(loadRecords(), null, 2) } };
    const body = { description: 'keiba-roi data', public: false, files };
    try {
      syncState.isSyncing = true;
      const res = await fetch('https://api.github.com/gists', {
        method: 'POST', headers: headers(token), body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Gist作成に失敗しました');
      const json = await res.json();
      const id = json.id;
      syncState.settings = { token, gistId: id, auto: !!(syncAuto && syncAuto.checked) };
      saveSyncSettings(syncState.settings);
      setSyncUIFromSettings();
      alert('Gistを作成しました: ' + id);
    } catch (e) {
      alert('Gist作成に失敗しました。トークン権限（gist）やネットワークを確認してください。');
    } finally { syncState.isSyncing = false; }
  }
  async function gistUpload() {
    const token = (syncToken?.value || '').trim();
    const id = (syncGist?.value || '').trim();
    if (!token || !id) { alert('トークンとGist IDを設定してください'); return; }
    const files = { 'keiba-roi-records.json': { content: JSON.stringify(loadRecords(), null, 2) } };
    try {
      syncState.isSyncing = true;
      const res = await fetch('https://api.github.com/gists/' + encodeURIComponent(id), {
        method: 'PATCH', headers: headers(token), body: JSON.stringify({ files })
      });
      if (!res.ok) throw new Error('アップロード失敗');
      alert('アップロード完了');
    } catch (e) {
      alert('アップロードに失敗しました');
    } finally { syncState.isSyncing = false; }
  }
  async function gistDownload() {
    const token = (syncToken?.value || '').trim();
    const id = (syncGist?.value || '').trim();
    if (!token || !id) { alert('トークンとGist IDを設定してください'); return; }
    try {
      syncState.isSyncing = true;
      const res = await fetch('https://api.github.com/gists/' + encodeURIComponent(id), { headers: headers(token) });
      if (!res.ok) throw new Error('ダウンロード失敗');
      const json = await res.json();
      const file = json.files && (json.files['keiba-roi-records.json'] || Object.values(json.files)[0]);
      if (!file) throw new Error('対象ファイルがありません');
      let text = file.content;
      if (file.truncated && file.raw_url) {
        const raw = await fetch(file.raw_url);
        text = await raw.text();
      }
      const rows = JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error('JSON配列ではありません');
      const norm = rows.map(r => ({ id: r.id || uid(), date: r.date, race: r.race, stake: Number(r.stake)||0, ret: Number(r.ret)||0, memo: r.memo||'' })).filter(r => r.date && r.race);
      saveRecords(norm);
      from.value=''; to.value='';
      refresh();
      alert(`ダウンロード完了（${norm.length}件）`);
    } catch (e) {
      alert('ダウンロードに失敗しました');
    } finally { syncState.isSyncing = false; }
  }
  function scheduleUpload() {
    clearTimeout(syncState.uploadTimer);
    syncState.uploadTimer = setTimeout(() => { gistUpload().catch(()=>{}); }, 800);
  }

  function uid() { return Math.random().toString(36).slice(2, 10); }

  // Populate race datalist (suggestions)
  function setupRaceDatalist() {
    if (!raceDatalist) return;
    const opts = [];
    RACE_LIST.forEach(({ group, items }) => {
      items.forEach((name) => {
        const v = `${group} ${name}`;
        opts.push(`<option value="${escapeHtml(v)}"></option>`);
      });
    });
    raceDatalist.innerHTML = opts.join('');
  }

  // Render table
  // 一覧は内部スクロール化のため全件描画
  let currentRows = [];
  let sortKey = ''; // '', 'stake', 'ret', 'roi'
  let sortDir = 'desc'; // 'asc' | 'desc'

  /** @param {Record[]} rows */
  function renderTable(rows) {
    tbody.innerHTML = '';
    const filtered = applyListFilter(rows);
    filtered.sort((a, b) => compareRecords(a, b));
    const visible = filtered; // 全件表示し、.table-wrapでスクロール
    for (const r of visible) {
      const tr = document.createElement('tr');
      const roi = r.stake > 0 ? r.ret / r.stake : 0;
      const roiCls = roi > 1 ? 'roi-up' : roi < 1 ? 'roi-down' : 'roi-flat';
      tr.innerHTML = `
        <td>${r.date}</td>
        <td>${escapeHtml(r.race)}</td>
        <td>¥${fmtYen(r.stake)}</td>
        <td>¥${fmtYen(r.ret)}</td>
        <td><span class="roi-badge ${roiCls}">${pct(roi)}</span></td>
        <td>${escapeHtml(r.memo || '')}</td>
        <td><button data-id="${r.id}" class="del">削除</button></td>
      `;
      tbody.appendChild(tr);
    }
  }

  function compareRecords(a, b) {
    // Default sort by date asc if no sortKey
    if (!sortKey) return a.date.localeCompare(b.date);
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    const dir = sortDir === 'asc' ? 1 : -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    // tie-breaker by date
    return a.date.localeCompare(b.date);
  }

  function getSortValue(r, key) {
    if (key === 'stake') return Number(r.stake) || 0;
    if (key === 'ret') return Number(r.ret) || 0;
    if (key === 'roi') return r.stake > 0 ? r.ret / r.stake : 0;
    return 0;
  }

  function applyListFilter(rows) {
    let out = rows;
    const q = (listQ?.value || '').trim().toLowerCase();
    const g = (listGroup?.value || '').trim();
    const needRoi100 = !!(listRoi100 && listRoi100.checked);
    const lf = (listFrom && listFrom.value) ? listFrom.value : '';
    const lt = (listTo && listTo.value) ? listTo.value : '';
    if (q) {
      out = out.filter(r => (r.race || '').toLowerCase().includes(q) || (r.memo || '').toLowerCase().includes(q));
    }
    if (g) {
      out = out.filter(r => (r.race || '').startsWith(g + ' '));
    }
    if (needRoi100) {
      out = out.filter(r => r.stake > 0 && (r.ret / r.stake) >= 1);
    }
    if (lf) {
      out = out.filter(r => (r.date || '') >= lf);
    }
    if (lt) {
      out = out.filter(r => (r.date || '') <= lt);
    }
    return out;
  }

  // Summary + chart for filtered range
  /** @param {Record[]} rows */
  function renderSummaryAndChart(rows) {
    const totalStake = rows.reduce((s, r) => s + r.stake, 0);
    const totalRet = rows.reduce((s, r) => s + r.ret, 0);
    const roi = totalStake > 0 ? totalRet / totalStake : 0;
    const pl = totalRet - totalStake;
    sumCount.textContent = String(rows.length);
    sumStake.textContent = `¥${fmtYen(totalStake)}`;
    sumReturn.textContent = `¥${fmtYen(totalRet)}`;
    sumRoi.textContent = pct(roi);
    sumPL.textContent = `¥${fmtYen(pl)}`;
    // emphasize positive/negative
    sumRoi.className = '';
    sumPL.className = '';
    if (roi > 1) sumRoi.classList.add('badge-ok');
    else if (roi < 1) sumRoi.classList.add('badge-danger');
    if (pl > 0) sumPL.classList.add('badge-ok');
    else if (pl < 0) sumPL.classList.add('badge-danger');

    drawChart(rows);
  }

  // Simple line chart: x=time, y=cumulative ROI
  // Chart interaction state
  let chartState = { points: [], pxPoints: [], xToPx: null, yToPx: null, x0: 0, y0: 0, x1: 0, y1: 0 };

  /** @param {Record[]} rows */
  function drawChart(rows, highlightIndex = null) {
    // Prepare series: cumulative after each record
    const sorted = [...rows].sort((a,b) => a.date.localeCompare(b.date));
    const points = [];
    let cStake = 0, cRet = 0;
    for (const r of sorted) {
      cStake += r.stake; cRet += r.ret;
      const roi = cStake > 0 ? cRet / cStake : 0;
      points.push({ x: new Date(r.date), d: r.date, y: roi });
    }

    // Canvas sizing
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    if (ctx.setTransform) ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const W = cssW, H = cssH;
    const PAD = 40;
    // Axes area
    const x0 = PAD, y0 = H - PAD, x1 = W - 10, y1 = 10;

    // Background grid
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = y0 - (i * (y0 - y1)) / 5;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    }

    // Y scale from 0% to max(200%, data max * 1.1)
    const maxY = Math.max(2, Math.max(0, ...points.map(p => p.y)) * 1.1);
    const minY = 0;
    const yToPx = (y) => y0 - ((y - minY) / (maxY - minY || 1)) * (y0 - y1);

    // X scale
    const xs = points.map(p => p.x.getTime());
    const minX = xs.length ? Math.min(...xs) : Date.now();
    const maxX = xs.length ? Math.max(...xs) : minX + 86400000;
    const xToPx = (t) => x0 + ((t - minX) / (maxX - minX || 1)) * (x1 - x0);

    // Axes
    ctx.strokeStyle = '#2c3644';
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); // x
    ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); // y
    ctx.stroke();

    // 100% reference line (ROI = 1.0)
    if (maxY >= 1 && minY <= 1) {
      const y100 = yToPx(1);
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.setLineDash && ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y100);
      ctx.lineTo(x1, y100);
      ctx.stroke();
      // optional label
      ctx.fillStyle = '#ef4444';
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.fillText('100%', x1 - 44, y100 - 6);
      ctx.setLineDash && ctx.setLineDash([]);
      ctx.restore();
    }

    // Y ticks and labels
    ctx.fillStyle = '#8aa0b6';
    ctx.font = '12px ui-sans-serif, system-ui';
    for (let i = 0; i <= 5; i++) {
      const yv = minY + (i * (maxY - minY)) / 5;
      const yy = yToPx(yv);
      ctx.fillText(`${(yv*100)|0}%`, 6, yy + 4);
    }

    // X labels (first, mid, last)
    const xs2 = points.map(p => p.x.getTime());
    const minX2 = xs2.length ? Math.min(...xs2) : Date.now();
    const maxX2 = xs2.length ? Math.max(...xs2) : minX2 + 86400000;
    if (xs2.length) {
      const lab = (t) => new Date(t).toISOString().slice(0,10);
      ctx.fillText(lab(minX2), x0, y0 + 16);
      ctx.fillText(lab(maxX2), x1 - 80, y0 + 16);
      if (maxX2 - minX2 > 86400000 * 14) {
        const mid = (minX2 + maxX2) / 2;
        ctx.fillText(lab(mid), xToPx(mid) - 40, y0 + 16);
      }
    }

    // Save chart state for interaction
    const pxPoints = points.map(p => ({ x: xToPx(p.x.getTime()), y: yToPx(p.y) }));
    chartState = { points, pxPoints, xToPx, yToPx, x0, y0, x1, y1 };

    // Line + area fill
    if (points.length) {
      // area
      const grad = ctx.createLinearGradient(0, y1, 0, y0);
      grad.addColorStop(0, 'rgba(43, 182, 115, 0.35)');
      grad.addColorStop(1, 'rgba(43, 182, 115, 0.00)');
      ctx.beginPath();
      points.forEach((p, i) => {
        const px = xToPx(p.x.getTime());
        const py = yToPx(p.y);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      // close to x-axis
      const lastX = xToPx(points[points.length-1].x.getTime());
      const firstX = xToPx(points[0].x.getTime());
      ctx.lineTo(lastX, y0);
      ctx.lineTo(firstX, y0);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // stroke
      ctx.strokeStyle = '#2bb673';
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((p, i) => {
        const px = xToPx(p.x.getTime());
        const py = yToPx(p.y);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
      // Highlight selected index or default to last marker
      if (highlightIndex != null && pxPoints[highlightIndex]) {
        drawHighlight(highlightIndex);
      } else {
        const last = points[points.length - 1];
        ctx.fillStyle = '#2bb673';
        ctx.beginPath();
        ctx.arc(xToPx(last.x.getTime()), yToPx(last.y), 3, 0, Math.PI*2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#8aa0b6';
      ctx.font = '14px ui-sans-serif, system-ui';
      ctx.fillText('該当データがありません', x0 + 8, (y0 + y1)/2);
    }
  }

  function drawHighlight(index) {
    const p = chartState.points[index];
    const px = chartState.pxPoints[index];
    if (!p || !px) return;
    // vertical guide
    ctx.strokeStyle = '#39465a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px.x, chartState.y1);
    ctx.lineTo(px.x, chartState.y0);
    ctx.stroke();
    // point
    ctx.fillStyle = '#2bb673';
    ctx.beginPath();
    ctx.arc(px.x, px.y, 3, 0, Math.PI*2);
    ctx.fill();
    // tooltip
    const label = `${p.d}  ${pct(p.y)}`;
    ctx.font = '12px ui-sans-serif, system-ui';
    const pad = 6;
    const metrics = ctx.measureText(label);
    const tw = metrics.width + pad*2;
    const th = 22;
    let bx = px.x + 10;
    if (bx + tw > chartState.x1) bx = px.x - tw - 10;
    let by = px.y - th - 8;
    if (by < chartState.y1) by = px.y + 8;
    ctx.fillStyle = 'rgba(15,19,24,0.95)';
    ctx.strokeStyle = '#2c3644';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, tw, th, 6); else ctx.rect(bx, by, tw, th);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e5ecf4';
    ctx.fillText(label, bx + pad, by + th - 7);
  }

  // Filtering
  /** @param {Record[]} all */
  function applyFilter(all) {
    const f = from.value ? new Date(from.value) : null;
    const t = to.value ? new Date(to.value) : null;
    let out = all;
    if (f) out = out.filter(r => new Date(r.date) >= f);
    if (t) out = out.filter(r => new Date(r.date) <= t);
    return out;
  }

  // Event handlers
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = /** @type {HTMLInputElement} */($('#date')).value;
    const race = (raceInput?.value || '').trim();
    const stake = parseNum(/** @type {HTMLInputElement} */($('#stake')).value);
    const ret = parseNum(/** @type {HTMLInputElement} */($('#return')).value);
    const memo = /** @type {HTMLInputElement} */($('#memo')).value.trim();
    if (!date || !race) return;
    /** @type {Record} */
    const rec = { id: uid(), date, race, stake, ret, memo };
    const all = loadRecords();
    all.push(rec); saveRecords(all);
    // reset memo & amounts for quick entry
    $('#stake').value = '';
    $('#return').value = '';
    $('#memo').value = '';
    refresh();
  });

  tbody.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.classList.contains('del')) {
      const id = target.dataset.id;
      const all = loadRecords().filter(r => r.id !== id);
      saveRecords(all);
      refresh();
    }
  });

  applyBtn.addEventListener('click', () => refresh());
  clearBtn.addEventListener('click', () => {
    from.value = ''; to.value = '';
    refresh();
  });

  exportBtn.addEventListener('click', () => {
    const data = JSON.stringify(loadRecords(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'keiba-roi-records.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      if (isCSVFile(file.name, file.type) || looksLikeCSV(text)) {
        const recs = parseCSVToRecords(text);
        if (!recs.length) throw new Error('CSVにデータがありません');
        // 見やすいようにフィルタ解除
        from.value = '';
        to.value = '';
        saveRecords(recs);
        refresh();
        alert(`CSVを取り込みました（${recs.length}件）`);
      } else {
        const rows = JSON.parse(text);
        if (Array.isArray(rows)) {
          const norm = rows.map(r => ({
            id: r.id || uid(),
            date: r.date,
            race: r.race,
            stake: Number(r.stake)||0,
            ret: Number(r.ret)||0,
            memo: r.memo || ''
          })).filter(r => r.date && r.race);
          from.value = '';
          to.value = '';
          saveRecords(norm);
          refresh();
          alert(`JSONを取り込みました（${norm.length}件）`);
        } else {
          throw new Error('JSON配列ではありません');
        }
      }
    } catch (err) {
      alert('ファイルの読み込みに失敗しました。JSON/CSVを選択してください。');
    } finally {
      importInput.value = '';
    }
  });

  // Sync UI handlers
  setSyncUIFromSettings();
  syncSaveBtn?.addEventListener('click', () => {
    syncState.settings = {
      token: (syncToken?.value || '').trim(),
      gistId: (syncGist?.value || '').trim(),
      auto: !!(syncAuto && syncAuto.checked),
    };
    saveSyncSettings(syncState.settings);
    alert('同期設定を保存しました');
  });
  gistInitBtn?.addEventListener('click', () => { gistInit(); });
  gistUploadBtn?.addEventListener('click', () => { gistUpload(); });
  gistDownloadBtn?.addEventListener('click', async () => {
    if (!confirm('Gistの内容でローカルデータを上書きします。よろしいですか？')) return;
    await gistDownload();
  });

  function isCSVFile(name, type) {
    const n = (name || '').toLowerCase();
    const t = (type || '').toLowerCase();
    return n.endsWith('.csv') || n.endsWith('.tsv') || t.indexOf('csv') !== -1 || t.indexOf('tab-separated') !== -1;
  }

  function looksLikeCSV(text) {
    const header = (text.split(/\r?\n/)[0] || '');
    return /[,\t;]/.test(header) && (text.indexOf('\n') !== -1);
  }

  function parseCSVToRecords(text) {
    const rows = parseCSV(text);
    if (!rows.length) return [];
    const header = rows[0].map((h) => (h || '').trim());
    const idx = headerIndexMap(header);
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const date = (r[idx.date] || '').trim();
      const race = (r[idx.race] || '').trim();
      const stake = Number(cleanNumber(r[idx.stake] || 0)) || 0;
      const ret = Number(cleanNumber(r[idx.ret] || 0)) || 0;
      const memo = (r[idx.memo] || '').trim();
      if (!date || !race) continue;
      out.push({ id: uid(), date, race, stake, ret, memo });
    }
    return out;
  }

  function headerIndexMap(header) {
    const norm = (s) => String(s || '').toLowerCase()
      .replace(/[\s　,¥_/\-()（）.:%\[\]"]/g, '')
      .replace(/額|円/g, '');
    const H = header.map(norm);
    const find = (cands) => H.findIndex((h) => cands.some((k) => h.indexOf(norm(k)) !== -1));
    const map = {
      date: find(['日付','date','日時']),
      race: find(['レース','race','競走名','大会','レース名']),
      stake: find(['投資','投資額','bet','stake','購入','購入額','購入金額']),
      ret: find(['回収','回収額','払戻','払戻金','payout','return','払戻金額']),
      memo: find(['メモ','memo','備考','note'])
    };
    if (map.date < 0) map.date = 0;
    if (map.race < 0) map.race = 1;
    if (map.stake < 0) map.stake = 2;
    if (map.ret < 0) map.ret = 3;
    if (map.memo < 0) map.memo = 4;
    return map;
  }

  function parseCSV(text) {
    // Remove BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const first = text.split(/\r?\n/)[0] || '';
    const delim = detectDelimiter(first);
    const rows = [];
    let i = 0, field = '', row = [], inQuotes = false;
    const pushField = () => { row.push(field); field = ''; };
    const pushRow = () => { rows.push(row); row = []; };
    while (i < text.length) {
      const c = text[i++];
      if (inQuotes) {
        if (c === '"') {
          if (text[i] === '"') { field += '"'; i++; } else { inQuotes = false; }
        } else { field += c; }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === delim) pushField();
        else if (c === '\n') { pushField(); pushRow(); }
        else if (c === '\r') {/* noop */}
        else field += c;
      }
    }
    pushField(); pushRow();
    // Trim trailing empty rows
    while (rows.length && rows[rows.length-1].every((x) => x === '')) rows.pop();
    return rows;
  }

  function detectDelimiter(line) {
    const counts = { ',': 0, '\t': 0, ';': 0 };
    for (let i = 0; i < line.length; i++) {
      if (counts.hasOwnProperty(line[i])) counts[line[i]]++;
    }
    let best = ',', max = -1;
    Object.keys(counts).forEach((k) => { if (counts[k] > max) { max = counts[k]; best = k; } });
    return max > 0 ? best : ',';
  }

  function cleanNumber(v) {
    return String(v || '').replace(/[¥,\s]/g, '');
  }

  function refresh() {
    const all = loadRecords();
    const filtered = applyFilter(all);
    currentRows = filtered;
    renderTable(currentRows);
    renderSummaryAndChart(currentRows);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  // Init
  setupRaceDatalist();
  // Default date = today
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('date').value = today;
  refresh();
  // Auto download on start if enabled
  if (syncState.settings && syncState.settings.auto && syncState.settings.token && syncState.settings.gistId) {
    gistDownload().catch(()=>{});
  }
  // 「もっと表示」は廃止（内部スクロールに変更）
  // Sorting handlers on table headers
  document.querySelectorAll('#records thead th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-key');
      if (!key) return;
      if (sortKey === key) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = key; sortDir = 'desc';
      }
      // update header indicators
      document.querySelectorAll('#records thead th.sortable').forEach((el) => {
        el.classList.remove('sorted-asc','sorted-desc');
      });
      th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      renderTable(currentRows);
    });
  });
  // List filters listeners
  listQ?.addEventListener('input', () => { renderTable(currentRows); });
  listGroup?.addEventListener('change', () => { renderTable(currentRows); });
  listRoi100?.addEventListener('change', () => { renderTable(currentRows); });
  listFrom?.addEventListener('change', () => { renderTable(currentRows); });
  listTo?.addEventListener('change', () => { renderTable(currentRows); });
  listClearBtn?.addEventListener('click', () => {
    if (listQ) listQ.value = '';
    if (listGroup) listGroup.value = '';
    if (listRoi100) listRoi100.checked = false;
    if (listFrom) listFrom.value = '';
    if (listTo) listTo.value = '';
    renderTable(currentRows);
  });
  // Date pickers for filters: open calendar on click or button
  document.querySelectorAll('.picker-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      // Try native showPicker; fallback to .click()
      if (input.showPicker) {
        try { input.showPicker(); return; } catch (_) {}
      }
      input.focus();
      input.click();
    });
  });
  [from, to].forEach((inp) => {
    inp.addEventListener('click', () => {
      if (inp.showPicker) {
        try { inp.showPicker(); return; } catch (_) {}
      }
      // Fallback to native picker by synthetic click
      inp.click();
    });
    // Block typing to encourage picker usage
    inp.addEventListener('keydown', (e) => {
      // Allow navigation keys (Tab/Shift+Tab)
      if (e.key === 'Tab') return;
      e.preventDefault();
    });
  });
  // Chart interactions
  canvas.addEventListener('mousemove', (e) => {
    if (!chartState || !chartState.pxPoints || !chartState.pxPoints.length) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
    // redraw with nearest highlight
    let best = null, bestDx = Infinity, bestDist = Infinity;
    chartState.pxPoints.forEach((pp, i) => {
      const dx = Math.abs(pp.x - mx);
      const dist = Math.hypot(pp.x - mx, pp.y - my);
      if (dx < bestDx || (dx === bestDx && dist < bestDist)) { best = i; bestDx = dx; bestDist = dist; }
    });
    drawChart(currentRows, best);
  });
  canvas.addEventListener('mouseleave', () => {
    drawChart(currentRows, null);
  });
  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('theme_pref');
  if (saved === 'light') document.documentElement.setAttribute('data-theme','light');
  themeToggle?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'light' ? null : 'light';
    if (next) document.documentElement.setAttribute('data-theme', next); else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme_pref', next ? 'light' : 'dark');
  });
})();
