export const fmtYen = (n) => new Intl.NumberFormat('ja-JP').format(Math.round(n));
export const pct = (n) => `${(n * 100).toFixed(1)}%`;
export const parseNum = (v) => Math.max(0, Number(v || 0));
export function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}
export function uid() { return Math.random().toString(36).slice(2, 10); }

