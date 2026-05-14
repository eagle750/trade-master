/* Client-side CSV export utilities — watermarked per §9.4 */

function escape(v: unknown): string {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function buildCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const watermark = `# Source: AlphaForge · Generated: ${new Date().toISOString()} IST\n`;
  const head      = headers.map(escape).join(',');
  const body      = rows.map((r) => r.map(escape).join(',')).join('\n');
  return watermark + head + '\n' + body;
}

export function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const csv  = buildCSV(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* Specific exporters */
export function exportStockFilter(stocks: { symbol: string; name: string; sector: string; ltp: number; changePct: number; mcapCr: number; pe?: number; roe?: number }[]) {
  downloadCSV('alphaforge_stock_filter.csv',
    ['Symbol', 'Company', 'Sector', 'LTP (₹)', 'Day chg %', 'Mkt cap (Cr)', 'P/E', 'ROE %'],
    stocks.map((s) => [s.symbol, s.name, s.sector, s.ltp.toFixed(2), s.changePct.toFixed(2), s.mcapCr, s.pe?.toFixed(1) ?? '', s.roe?.toFixed(1) ?? ''])
  );
}

export function exportTradeLog(trades: { type: string; qty: number; price: number; pnl?: number; pnlPct?: number; daysHeld?: number; reason: string; date: string }[]) {
  downloadCSV('alphaforge_trade_log.csv',
    ['Date', 'Type', 'Qty', 'Price (₹)', 'P&L (₹)', 'P&L %', 'Days held', 'Reason'],
    trades.map((t) => [t.date, t.type, t.qty, t.price.toFixed(2), t.pnl?.toFixed(2) ?? '', t.pnlPct?.toFixed(2) ?? '', t.daysHeld ?? '', t.reason])
  );
}

export function exportSelection(stocks: { rank: number; symbol: string; name: string; sector: string; weight: number; headlineMetric: { label: string; value: string } }[]) {
  downloadCSV('alphaforge_selection.csv',
    ['Rank', 'Symbol', 'Company', 'Sector', 'Weight %', 'Metric label', 'Metric value'],
    stocks.map((s) => [s.rank, s.symbol, s.name, s.sector, (s.weight * 100).toFixed(1), s.headlineMetric.label, s.headlineMetric.value])
  );
}

export function exportWatchlist(name: string, stocks: { symbol: string; name: string; ltp?: number; changePct?: number }[]) {
  downloadCSV(`alphaforge_watchlist_${name.replace(/\s+/g, '_')}.csv`,
    ['Symbol', 'Company', 'LTP (₹)', 'Day chg %', 'Added'],
    stocks.map((s) => [s.symbol, s.name, s.ltp?.toFixed(2) ?? '', s.changePct?.toFixed(2) ?? '', ''])
  );
}
