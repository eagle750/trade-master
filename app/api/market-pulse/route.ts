import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { INDEX_YAHOO, SECTOR_YAHOO, NIFTY100_NS, NSE_SECTOR_MAP } from '@/lib/nseSymbols';
import { getMarketStatus } from '@/lib/marketStatus';
import type { MarketPulseData, TickerCell, SectorCell, Mover, FlowCell, NewsItem, StockRow } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* yahoo-finance2 v3: default export is the class, must instantiate */
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/* yf instance type helpers */
type YFInstance = InstanceType<typeof YahooFinance>;

/* ---- Minimal shapes for the Yahoo Finance fields we actually use ---- */
interface YFQuote {
  regularMarketPrice?:         number;
  regularMarketChange?:        number;
  regularMarketChangePercent?: number;
  shortName?:                  string;
  longName?:                   string;
  marketCap?:                  number;
  trailingPE?:                 number;
  sector?:                     string;
}

interface YFNewsItem {
  title?:                string;
  publisher?:            string;
  link?:                 string;
  providerPublishTime?:  number;
}

interface YFSearch {
  news?: YFNewsItem[];
}

/* Safe wrappers — cast through unknown to avoid yahoo-finance2 `never` inference */
async function safeQuote(symbol: string): Promise<YFQuote | null> {
  try {
    const raw = await yf.quote(symbol);
    return (raw as unknown) as YFQuote;
  } catch {
    return null;
  }
}

async function safeSearch(query: string, newsCount: number): Promise<YFSearch | null> {
  try {
    const raw = await yf.search(query, { newsCount, quotesCount: 0 });
    return (raw as unknown) as YFSearch;
  } catch {
    return null;
  }
}

/* ---- Server-side in-memory cache ---- */
interface CacheEntry { data: MarketPulseData; expires: number }
let _cache: CacheEntry | null = null;
const TTL_OPEN   = 15_000;
const TTL_CLOSED = 300_000;

const bareSymbol = (y: string) => y.replace(/\.(NS|BO)$/i, '');

/* ---- Index quotes ---- */
async function fetchIndices(): Promise<TickerCell[]> {
  const entries = Object.values(INDEX_YAHOO);
  const quotes  = await Promise.all(entries.map((e) => safeQuote(e.symbol)));
  return entries.map((e, i) => ({
    name:      e.name,
    symbol:    e.symbol,
    value:     quotes[i]?.regularMarketPrice      ?? 0,
    change:    quotes[i]?.regularMarketChange     ?? 0,
    changePct: quotes[i]?.regularMarketChangePercent ?? 0,
  }));
}

/* ---- Sector heatmap ---- */
async function fetchSectors(): Promise<SectorCell[]> {
  const quotes = await Promise.all(SECTOR_YAHOO.map((s) => safeQuote(s.symbol)));
  return SECTOR_YAHOO.map((s, i) => ({
    name:      s.name,
    index:     s.index,
    changePct: quotes[i]?.regularMarketChangePercent ?? 0,
  }));
}

/* ---- Nifty 100 stock quotes ---- */
async function fetchStockQuotes(): Promise<StockRow[]> {
  const BATCH = 10;
  const rows: StockRow[] = [];

  for (let i = 0; i < NIFTY100_NS.length; i += BATCH) {
    const batch  = NIFTY100_NS.slice(i, i + BATCH);
    const quotes = await Promise.all(batch.map(safeQuote));

    for (const [j, q] of quotes.entries()) {
      if (!q?.regularMarketPrice) continue;
      const nseSym = bareSymbol(batch[j]);
      const pe     = q.trailingPE;

      rows.push({
        symbol:    nseSym,
        name:      q.shortName ?? q.longName ?? nseSym,
        sector:    q.sector ?? NSE_SECTOR_MAP[nseSym] ?? '—',
        ltp:       q.regularMarketPrice,
        changePct: q.regularMarketChangePercent ?? 0,
        mcapCr:    q.marketCap && q.marketCap > 0 ? Math.round(q.marketCap / 1e7) : 0,
        pe:        pe && isFinite(pe) && pe > 0 ? pe : undefined,
      });
    }

    if (i + BATCH < NIFTY100_NS.length) {
      await new Promise((r) => setTimeout(r, 80));
    }
  }
  return rows;
}

/* ---- Movers ---- */
function computeMovers(stocks: StockRow[]): { gainers: Mover[]; losers: Mover[] } {
  const sorted  = [...stocks].filter((s) => !s.circuit)
                             .sort((a, b) => b.changePct - a.changePct);
  const toMover = (s: StockRow): Mover => ({
    symbol: s.symbol, name: s.name, ltp: s.ltp, changePct: s.changePct, sector: s.sector,
  });
  return { gainers: sorted.slice(0, 4).map(toMover), losers: sorted.slice(-4).reverse().map(toMover) };
}

/* ---- News — aggregate from index + top stocks ---- */
async function fetchNews(): Promise<NewsItem[]> {
  const NEWS_SYMBOLS = ['^NSEI', 'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS'];
  const results = await Promise.all(
    NEWS_SYMBOLS.map((s) => safeSearch(s, 3))
  );
  const seen = new Set<string>();
  const allNews: YFNewsItem[] = [];
  for (const r of results) {
    for (const n of r?.news ?? []) {
      const id = (n as unknown as Record<string, string>).uuid ?? n.title ?? '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      allNews.push(n);
    }
  }

  /* Sort by publish time descending */
  allNews.sort((a, b) => {
    const ta = new Date(
      (a as unknown as Record<string, string>).providerPublishTime ?? 0
    ).getTime();
    const tb = new Date(
      (b as unknown as Record<string, string>).providerPublishTime ?? 0
    ).getTime();
    return tb - ta;
  });

  return allNews.slice(0, 5).map((n, i) => {
    const raw = n as unknown as Record<string, string>;
    /* v3 returns ISO string; v2 returned Unix seconds — handle both */
    const pt = raw.providerPublishTime ?? '';
    const publishedAt = isNaN(Number(pt))
      ? new Date(pt).toISOString()
      : new Date(Number(pt) * 1000).toISOString();

    return {
      id:          raw.uuid ?? String(i),
      headline:    n.title ?? '',
      sentiment:   'neutral' as const,
      category:    detectCategory(n.title ?? '', raw.relatedTickers),
      source:      n.publisher ?? 'Unknown',
      publishedAt,
      url:         n.link ?? '#',
    };
  });
}

function detectCategory(title: string, tickers?: string): string {
  const t = title.toLowerCase();
  if (/rbi|sebi|govt|government|ministry|budget|policy|rate|inflation|gdp/i.test(t)) return 'Macro';
  if (/nse|bse|sensex|nifty|market|index/i.test(t)) return 'Macro';
  if (/sector|industry|banking|pharma|auto|it |fmcg|metal|energy/i.test(t)) return 'Sector';
  if (tickers && tickers.length > 0) return 'Stock';
  return 'Macro';
}

/* ---- FII / DII from NSE ---- */
async function fetchFIIDII(): Promise<{ fii: FlowCell | null; dii: FlowCell | null }> {
  try {
    const initRes = await fetch('https://www.nseindia.com', {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(5000),
    });

    const cookieParts: string[] = [];
    initRes.headers.forEach((val, key) => {
      if (key.toLowerCase() === 'set-cookie') cookieParts.push(val.split(';')[0]);
    });

    const dataRes = await fetch('https://www.nseindia.com/api/fiidiiTradeReact', {
      headers: {
        'Cookie':           cookieParts.join('; '),
        'User-Agent':       'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer':          'https://www.nseindia.com/',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept':           'application/json, text/plain, */*',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!dataRes.ok) throw new Error(`NSE HTTP ${dataRes.status}`);

    const json = await dataRes.json() as Array<{
      category: string; buyValue: string; sellValue: string; netValue: string; date?: string;
    }>;

    const fiiRow = json.find((r) => /FII|FPI/i.test(r.category ?? ''));
    const diiRow = json.find((r) => /DII/i.test(r.category ?? ''));
    const asOf   = fiiRow?.date ?? new Date().toISOString().slice(0, 10);
    const parseCr = (v: string) => parseFloat((v ?? '0').replace(/,/g, '')) || 0;

    return {
      fii: fiiRow ? { type: 'fii', segment: 'cash', asOf, netCr: parseCr(fiiRow.netValue) } : null,
      dii: diiRow ? { type: 'dii', segment: 'cash', asOf, netCr: parseCr(diiRow.netValue) } : null,
    };
  } catch {
    return { fii: null, dii: null };
  }
}

/* ---- GET /api/market-pulse ---- */
export async function GET() {
  const now = Date.now();
  if (_cache && now < _cache.expires) return NextResponse.json(_cache.data);

  try {
    const [indicesRes, sectorsRes, stocksRes, newsRes, flowsRes] = await Promise.allSettled([
      fetchIndices(),
      fetchSectors(),
      fetchStockQuotes(),
      fetchNews(),
      fetchFIIDII(),
    ]);

    const indices = indicesRes.status === 'fulfilled' ? indicesRes.value : [];
    const sectors = sectorsRes.status === 'fulfilled' ? sectorsRes.value : [];
    const stocks  = stocksRes.status  === 'fulfilled' ? stocksRes.value  : [];
    const news    = newsRes.status    === 'fulfilled' ? newsRes.value    : [];
    const flows   = flowsRes.status   === 'fulfilled' ? flowsRes.value   : { fii: null, dii: null };

    const { gainers, losers } = computeMovers(stocks);
    const { status, time }    = getMarketStatus();

    const data: MarketPulseData = {
      marketStatus:     status,
      marketStatusTime: time,
      indices,
      todaysStory: { generatedAt: new Date().toISOString(), body: '', sources: [] },
      sectors,
      topMovers: { gainers, losers },
      flows,
      news,
      stocks,
    };

    _cache = { data, expires: now + (status === 'open' ? TTL_OPEN : TTL_CLOSED) };
    return NextResponse.json(data);

  } catch (err) {
    return NextResponse.json({ error: 'Market data fetch failed', detail: String(err) }, { status: 500 });
  }
}
