import { NextResponse } from 'next/server';
import { runScreener, type ScreenerParams } from '@/lib/screener';
import { NIFTY50_NS, NIFTY100_NS, NIFTY500_NS } from '@/lib/nseSymbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNIVERSE_META: Record<string, { symbols: string[]; label: string }> = {
  nifty50:  { symbols: NIFTY50_NS,  label: 'Nifty 50' },
  nifty100: { symbols: NIFTY100_NS, label: 'Nifty 100' },
  nifty500: { symbols: NIFTY500_NS, label: 'Nifty 500' },
};

function resolveUniverse(universe?: string): { symbols: string[]; label: string } | null {
  if (!universe) return null;
  return UNIVERSE_META[universe] ?? null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      nPicks?:         number;
      momentumMonths?: number;
      universe?:       string;
      rankBy?:         string;
      minLtp?:         number;
      minMcapCr?:      number;
      maxPE?:          number;
      minROE?:         number;
      maxDE?:          number;
      minROA?:         number;
      maxPB?:          number;
      minRevGrowth?:   number;
      emaFilter?:      string;
      emaShort?:       number;
      emaMedium?:      number;
      emaLong?:        number;
    };

    const missing = [
      !body.nPicks   && 'nPicks',
      !body.rankBy   && 'rankBy',
      !body.universe && 'universe',
    ].filter(Boolean);
    if (missing.length) return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')} — re-parse the strategy` }, { status: 400 });

    const resolved = resolveUniverse(body.universe);
    if (!resolved) {
      return NextResponse.json(
        { error: `Unknown universe "${body.universe}" — must be one of nifty50, nifty100, nifty500` },
        { status: 400 },
      );
    }
    const { symbols, label } = resolved;

    const momentumMonths = body.momentumMonths ?? 12;

    const params: ScreenerParams = {
      nPicks:         body.nPicks!,
      momentumMonths,
      rankBy:         body.rankBy as ScreenerParams['rankBy'],
      /* eligibility — come from parsed params (product defaults if not in strategy) */
      minLtp:         body.minLtp,
      minMcapCr:      body.minMcapCr,
      /* screen filters — only set if strategy explicitly mentioned them */
      maxPE:          body.maxPE,
      minROE:         body.minROE,
      maxDE:          body.maxDE,
      minROA:         body.minROA,
      maxPB:          body.maxPB,
      minRevGrowth:   body.minRevGrowth,
      emaFilter:      body.emaFilter as ScreenerParams['emaFilter'],
      emaShort:       body.emaShort,
      emaMedium:      body.emaMedium,
      emaLong:        body.emaLong,
      universe:       symbols,
      universeName:   label,
    };

    const result = await runScreener(params);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: 'Screener failed', detail: String(err) },
      { status: 500 }
    );
  }
}
