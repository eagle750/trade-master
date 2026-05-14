import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/* Static index entries */
const INDICES = [
  { symbol: '^NSEI',     name: 'Nifty 50',         type: 'index' },
  { symbol: '^BSESN',    name: 'Sensex',            type: 'index' },
  { symbol: '^NSEBANK',  name: 'Bank Nifty',        type: 'index' },
  { symbol: '^INDIAVIX', name: 'India VIX',         type: 'index' },
  { symbol: '^CNXIT',    name: 'Nifty IT',          type: 'index' },
  { symbol: '^CNXPHARMA',name: 'Nifty Pharma',      type: 'index' },
  { symbol: '^CNXAUTO',  name: 'Nifty Auto',        type: 'index' },
  { symbol: '^CNXMETAL', name: 'Nifty Metal',       type: 'index' },
];

const SETTINGS = [
  { name: 'Account settings',      url: '/settings' },
  { name: 'Broker connections',    url: '/settings#brokers' },
  { name: 'Risk defaults',         url: '/settings#risk' },
  { name: 'Notification settings', url: '/settings#notifications' },
];

export interface SearchResult {
  type:    'stock' | 'index' | 'strategy' | 'setting';
  symbol?: string;
  name:    string;
  sub?:    string;  /* sector / exchange / description */
  url:     string;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (q.trim().length < 1) return NextResponse.json({ results: [] });

  const results: SearchResult[] = [];
  const ql = q.toLowerCase();

  /* Indices — local match */
  INDICES.filter((i) => i.name.toLowerCase().includes(ql) || i.symbol.toLowerCase().includes(ql))
    .forEach((i) => results.push({ type: 'index', symbol: i.symbol, name: i.name, url: `/stock/${i.symbol}` }));

  /* Settings — local match */
  SETTINGS.filter((s) => s.name.toLowerCase().includes(ql))
    .forEach((s) => results.push({ type: 'setting', name: s.name, url: s.url }));

  /* Stocks — Yahoo Finance search */
  try {
    const raw = await yf.search(q, { quotesCount: 8, newsCount: 0 });
    const quotes = (raw as unknown as { quotes?: Array<Record<string, unknown>> }).quotes ?? [];
    for (const r of quotes) {
      const sym = String(r.symbol ?? '');
      /* Only NSE stocks (.NS) or indices */
      if (!sym.endsWith('.NS') && !sym.startsWith('^')) continue;
      const nseSym = sym.replace(/\.NS$/i, '');
      results.push({
        type:    sym.startsWith('^') ? 'index' : 'stock',
        symbol:  nseSym,
        name:    String(r.longname ?? r.shortname ?? nseSym),
        sub:     String(r.sector ?? r.exchange ?? 'NSE'),
        url:     `/stock/${nseSym}`,
      });
    }
  } catch { /* search fails gracefully */ }

  return NextResponse.json({ results: results.slice(0, 12) });
}
