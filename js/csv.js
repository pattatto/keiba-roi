import { uid } from './utils.js';

export function isCSVFile(name, type) {
  const n = (name || '').toLowerCase();
  const t = (type || '').toLowerCase();
  return n.endsWith('.csv') || n.endsWith('.tsv') || t.indexOf('csv') !== -1 || t.indexOf('tab-separated') !== -1;
}

export function looksLikeCSV(text) {
  const header = (text.split(/\r?\n/)[0] || '');
  return /[,\t;]/.test(header) && (text.indexOf('\n') !== -1);
}

export function parseCSVToRecords(text) {
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

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // Remove BOM
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
  while (rows.length && rows[rows.length-1].every((x) => x === '')) rows.pop();
  return rows;
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

