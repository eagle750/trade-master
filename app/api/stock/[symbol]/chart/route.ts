import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { sma, ema, rsi, macd, bollingerBands } from '@/lib/indicators';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const RANGES: Record<string, { period: string; interval: '1d' | '1wk' | '1mo' }> = {
  '1D':  { period: '5d',  interval: '1d' },
  '5D':  { period: '1mo', interval: '1d' },
  '1M':  { period: '3mo', interval: '1d' },
  '3M':  { period: '6mo', interval: '1d' },
  '6M':  { period: '1y',  interval: '1d' },
  '1Y':  { period: '2y',  interval: '1d' },
  '5Y':  { period: '5y',  interval: '1wk' },
  'Max': { period: '10y', interval: '1mo' },
};

/* Cache per symbol+range */
const _cache = new Map<string, { data: unknown; exp: number }>();

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const url   = new URL(req.url);
  const range = url.searchParams.get('range') ?? '1Y';
  const cfg   = RANGES[range] ?? RANGES['1Y'];
  const key   = `${symbol}:${range}`;

  const now = Date.now();
  const cached = _cache.get(key);
  if (cached && now < cached.exp) return NextResponse.json(cached.data);

  try {
    const nseSym  = `${symbol.toUpperCase()}.NS`;
    const period1 = getPeriod1(cfg.period);

    const raw = await yf.chart(nseSym, { period1, interval: cfg.interval });
    const bars = (raw as unknown as { quotes: Array<Record<string, unknown>> }).quotes
      .filter((q) => q.close != null)
      .map((q) => ({
        t: new Date((q.date as string | Date)).toISOString(),
        o: Number(q.open  ?? 0),
        h: Number(q.high  ?? 0),
        l: Number(q.low   ?? 0),
        c: Number(q.close ?? 0),
        v: Number(q.volume ?? 0),
      }));

    const closes  = bars.map((b) => b.c);
    const volumes = bars.map((b) => b.v);
    const rsiVals = rsi(closes, 14);
    const macdVals = macd(closes);
    const bb       = bollingerBands(closes, 20, 2);

    const data = {
      symbol: symbol.toUpperCase(),
      range,
      interval: cfg.interval,
      bars,
      indicators: {
        sma20:      sma(closes, 20),
        sma50:      sma(closes, 50),
        sma200:     sma(closes, 200),
        ema20:      ema(closes, 20),
        rsi14:      rsiVals,
        macdLine:   macdVals.line,
        macdSignal: macdVals.signal,
        macdHist:   macdVals.hist,
        bbUpper:    bb.upper,
        bbMiddle:   bb.middle,
        bbLower:    bb.lower,
        volume:     volumes,
      },
    };

    _cache.set(key, { data, exp: now + 60_000 });
    return NextResponse.json(data);

  } catch (err) {
    return NextResponse.json({ error: 'Chart data fetch failed', detail: String(err) }, { status: 500 });
  }
}

function getPeriod1(period: string): string {
  const d = new Date();
  const n = parseInt(period);
  if (period.endsWith('d'))  d.setDate(d.getDate() - n);
  if (period.endsWith('mo')) d.setMonth(d.getMonth() - n);
  if (period.endsWith('y'))  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
}
