import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/* GET /api/broker/zerodha/funds?api_key=xxx&access_token=xxx */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const api_key      = searchParams.get('api_key');
  const access_token = searchParams.get('access_token');

  if (!api_key || !access_token) {
    return NextResponse.json({ error: 'api_key and access_token required' }, { status: 400 });
  }

  const res = await fetch('https://api.kite.trade/user/margins', {
    headers: {
      'X-Kite-Version':  '3',
      'Authorization':   `token ${api_key}:${access_token}`,
    },
  });

  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) return NextResponse.json({ error: (data.message as string) ?? 'Failed' }, { status: res.status });
  return NextResponse.json(data.data ?? data);
}
