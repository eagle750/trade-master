import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { runBacktest } from '@/lib/backtestEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const yf     = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const _cache = new Map<string, { data: unknown; exp: number }>();

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const url = new URL(req.url);

  /* Accept explicit from/to dates OR fallback to years-based calculation */
  const fromParam = url.searchParams.get('from');
  const toParam   = url.searchParams.get('to');
  const years     = parseInt(url.searchParams.get('years') ?? '3');

  const today   = new Date().toISOString().slice(0, 10);
  const defFrom = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - years); return d.toISOString().slice(0, 10); })();

  const period1 = fromParam ?? defFrom;
  const period2 = toParam   ?? today;

  /* Validate: period2 must be >= period1 */
  if (period1 >= period2) {
    return NextResponse.json({ error: '"From" date must be before "To" date' }, { status: 422 });
  }

  const capital     = parseInt(url.searchParams.get('capital')       ?? '1000000');
  const slippagePct = parseFloat(url.searchParams.get('slippagePct') ?? '0.001');
  const rsiPeriod   = parseInt(url.searchParams.get('rsiPeriod')     ?? '14');
  const threshold   = parseFloat(url.searchParams.get('threshold')   ?? '0.50');
  const key         = `${symbol}:${period1}:${period2}:${capital}:${slippagePct}:${rsiPeriod}:${threshold}`;

  const now    = Date.now();
  const cached = _cache.get(key);
  if (cached && now < cached.exp) return NextResponse.json(cached.data);

  try {
    const raw = await yf.chart(`${symbol.toUpperCase()}.NS`, {
      period1,
      period2,
      interval: '1d',
    });

    const toISTDate = (d: unknown): string => {
      const ms = d instanceof Date ? d.getTime() : new Date(d as string).getTime();
      /* Shift to IST (UTC+5:30) before slicing the date */
      return new Date(ms + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    };

    const allBars = ((raw as unknown as { quotes: Array<Record<string, unknown>> }).quotes)
      .filter((q) => q.close != null)
      .map((q) => ({
        t: toISTDate(q.date),
        o: Number(q.open   ?? 0),
        h: Number(q.high   ?? 0),
        l: Number(q.low    ?? 0),
        c: Number(q.close  ?? 0),
        v: Number(q.volume ?? 0),
      }));

    /* Trim to the requested window */
    const bars = allBars.filter((b) => b.t >= period1 && b.t <= period2);

    if (bars.length < 30) {
      return NextResponse.json(
        { error: `Only ${bars.length} trading days in selected period. Choose a longer range.` },
        { status: 422 }
      );
    }

    const result = runBacktest(symbol.toUpperCase(), bars, {
      capital,
      slippagePct,
      brokerage: 20,
      rsiPeriod,
      threshold,
    });

    _cache.set(key, { data: result, exp: now + 3_600_000 });
    return NextResponse.json(result);

  } catch (err) {
    return NextResponse.json({ error: 'Backtest failed', detail: String(err) }, { status: 500 });
  }
}
