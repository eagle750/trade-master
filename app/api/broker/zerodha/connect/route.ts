import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/* GET /api/broker/zerodha/connect?api_key=xxx
   Returns the Kite login URL the client should redirect to. */
export async function GET(req: Request) {
  const apiKey = new URL(req.url).searchParams.get('api_key');
  if (!apiKey) return NextResponse.json({ error: 'api_key required' }, { status: 400 });

  const loginUrl = `https://kite.zerodha.com/connect/login?api_key=${apiKey}&v=3`;
  return NextResponse.json({ loginUrl });
}
