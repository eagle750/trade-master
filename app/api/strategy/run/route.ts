import { NextResponse } from 'next/server';
import { runScreener, type ScreenerParams } from '@/lib/screener';
import { NIFTY100_NS } from '@/lib/nseSymbols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      nPicks?:         number;
      maxPE?:          number;
      minROE?:         number;
      momentumMonths?: number;
    };

    const params: ScreenerParams = {
      nPicks:         body.nPicks         ?? 20,
      maxPE:          body.maxPE          ?? 50,
      minROE:         body.minROE         ?? 0.10,
      momentumMonths: body.momentumMonths ?? 12,
      universe:       NIFTY100_NS,
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
