import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { NSE_SECTOR_MAP } from '@/lib/nseSymbols';
import { getMarketStatus } from '@/lib/marketStatus';
import type { NewsItem } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/* Simple per-symbol cache: 60s during market hours, 10min otherwise */
const _cache = new Map<string, { data: StockOverviewData; exp: number }>();

export interface StockOverviewData {
  symbol:        string;
  name:          string;
  sector:        string;
  exchange:      string;
  ltp:           number;
  dayChange:     number;
  dayChangePct:  number;
  marketStatus:  'open' | 'closed' | 'pre-open';
  open:          number;
  dayHigh:       number;
  dayLow:        number;
  volume:        number;
  avgVolume30d:  number;
  high52w:       number;
  low52w:        number;
  marketCapCr:   number;
  pe?:           number;
  pb?:           number;
  roe?:          number;
  debtToEquity?: number;
  eps?:          number;
  dividendYield?:number;
  beta?:         number;
  promoterPct?:  number;
  institutionPct?:number;
  publicPct?:    number;
  pledgePct?:    number;
  news:          NewsItem[];
  upcomingEvents: { type: string; date: string; detail?: string }[];
}

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const nseSym = symbol.toUpperCase();
  const yahooSym = `${nseSym}.NS`;

  const now = Date.now();
  const cached = _cache.get(nseSym);
  if (cached && now < cached.exp) return NextResponse.json(cached.data);

  try {
    const [summaryRes, newsRes] = await Promise.allSettled([
      yf.quoteSummary(yahooSym, {
        modules: [
          'price', 'summaryDetail', 'financialData',
          'defaultKeyStatistics', 'majorHoldersBreakdown', 'calendarEvents',
        ],
      }),
      yf.search(yahooSym, { newsCount: 6, quotesCount: 0 }),
    ]);

    if (summaryRes.status === 'rejected') throw summaryRes.reason;

    const s   = summaryRes.value as unknown as Record<string, Record<string, unknown>>;
    const p   = s.price   ?? {};
    const sd  = s.summaryDetail ?? {};
    const fd  = s.financialData  ?? {};
    const ks  = s.defaultKeyStatistics ?? {};
    const mh  = s.majorHoldersBreakdown ?? {};
    const cal = (s.calendarEvents as Record<string, unknown> | undefined) ?? {};

    const mcapRaw = (p.marketCap as number) ?? 0;
    const { status } = getMarketStatus();

    /* News */
    const rawNews = newsRes.status === 'fulfilled'
      ? ((newsRes.value as unknown as { news?: unknown[] }).news ?? [])
      : [];
    const news: NewsItem[] = (rawNews as Array<Record<string, unknown>>).slice(0, 5).map((n, i) => ({
      id:          String(n.uuid ?? i),
      headline:    (n.title as string) ?? '',
      sentiment:   'neutral' as const,
      category:    'Stock',
      source:      (n.publisher as string) ?? 'Unknown',
      publishedAt: new Date(((n.providerPublishTime as string | number) ?? Date.now())).toISOString(),
      url:         (n.link as string) ?? '#',
    }));

    /* Upcoming events */
    const events: { type: string; date: string; detail?: string }[] = [];
    const earnings = (cal.earnings as Record<string, unknown> | undefined);
    if (earnings?.earningsDate) {
      const dates = earnings.earningsDate as unknown[];
      if (dates[0]) events.push({ type: 'results', date: new Date(dates[0] as string).toISOString().slice(0, 10) });
    }
    const exDiv = sd.exDividendDate;
    if (exDiv) {
      const divAmt = sd.dividendRate;
      events.push({
        type:   'dividend',
        date:   new Date(exDiv as string).toISOString().slice(0, 10),
        detail: divAmt ? `₹${divAmt}/share` : undefined,
      });
    }

    const data: StockOverviewData = {
      symbol:         nseSym,
      name:           (p.longName as string) ?? (p.shortName as string) ?? nseSym,
      sector:         (p.sector as string) ?? NSE_SECTOR_MAP[nseSym] ?? '—',
      exchange:       'NSE',
      ltp:            (p.regularMarketPrice as number) ?? 0,
      dayChange:      (p.regularMarketChange as number) ?? 0,
      dayChangePct:   (p.regularMarketChangePercent as number) ?? 0,
      marketStatus:   (status === 'holiday' ? 'closed' : status) as 'open' | 'closed' | 'pre-open',
      open:           (p.regularMarketOpen as number) ?? 0,
      dayHigh:        (p.regularMarketDayHigh as number) ?? 0,
      dayLow:         (p.regularMarketDayLow as number) ?? 0,
      volume:         (p.regularMarketVolume as number) ?? 0,
      avgVolume30d:   (sd.averageVolume as number) ?? 0,
      high52w:        (sd.fiftyTwoWeekHigh as number) ?? 0,
      low52w:         (sd.fiftyTwoWeekLow as number) ?? 0,
      marketCapCr:    mcapRaw > 0 ? Math.round(mcapRaw / 1e7) : 0,
      pe:             (sd.trailingPE as number) ?? undefined,
      pb:             (ks.priceToBook as number) ?? undefined,
      roe:            (fd.returnOnEquity as number) ?? undefined,
      debtToEquity:   (fd.debtToEquity as number) ?? undefined,
      eps:            (ks.trailingEps as number) ?? undefined,
      dividendYield:  (sd.dividendYield as number) ?? undefined,
      beta:           (sd.beta as number) ?? undefined,
      promoterPct:    (mh.insidersPercentHeld as number) ?? undefined,
      institutionPct: (mh.institutionsPercentHeld as number) ?? undefined,
      publicPct:      (mh.institutionsFloatPercentHeld as number) ?? undefined,
      news,
      upcomingEvents: events,
    };

    const ttl = status === 'open' ? 60_000 : 600_000;
    _cache.set(nseSym, { data, exp: now + ttl });
    return NextResponse.json(data);

  } catch (err) {
    return NextResponse.json({ error: 'Stock data fetch failed', detail: String(err) }, { status: 500 });
  }
}
