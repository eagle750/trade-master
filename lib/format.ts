/* Indian number/date formatting utilities — §2.5 conventions */

/** Format ₹ with Indian lakh/crore notation */
export function formatCr(value: number, unit: 'Cr' | 'L' = 'Cr'): string {
  if (unit === 'L') return `₹${(value / 100000).toFixed(2)} L`;
  if (Math.abs(value) >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L Cr`;
  }
  return `₹${value.toFixed(2)} Cr`;
}

/** Format large number in lakh/crore (no ₹) */
export function formatNum(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000000) return `${(value / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000)   return `${(value / 100000).toFixed(2)} L`;
  if (abs >= 1000)     return `${value.toLocaleString('en-IN')}`;
  return String(value);
}

/** ₹ price — always 2 dp */
export function formatPrice(value: number): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Signed % with arrow — §2.5 & §2.6 */
export function formatPct(value: number): { text: string; dir: 'up' | 'down' | 'flat' } {
  const dir = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
  const text = `${arrow} ${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  return { text, dir };
}

/** Market cap in Cr, formatted */
export function formatMcap(crore: number): string {
  if (crore >= 100000) return `₹${(crore / 100000).toFixed(1)} L Cr`;
  return `₹${Math.round(crore).toLocaleString('en-IN')} Cr`;
}

/** DD MMM YYYY — §2.5 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** HH:MM 24h IST */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** "X min ago" / "HH:MM" for news timestamps */
export function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)  return `${diffH}h ago`;
  return formatDate(iso);
}

/** Index value with comma for thousands */
export function formatIndex(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
