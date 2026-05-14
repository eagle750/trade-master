import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';

/* POST /api/broker/zerodha/session
   Body: { api_key, api_secret, request_token }
   Returns: { access_token, user_name, user_id, ... } */
export async function POST(req: Request) {
  try {
    const { api_key, api_secret, request_token } = await req.json() as {
      api_key: string; api_secret: string; request_token: string;
    };

    if (!api_key || !api_secret || !request_token) {
      return NextResponse.json({ error: 'api_key, api_secret and request_token required' }, { status: 400 });
    }

    /* Kite Connect checksum: SHA-256(api_key + request_token + api_secret) */
    const checksum = crypto
      .createHash('sha256')
      .update(api_key + request_token + api_secret)
      .digest('hex');

    const res = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: {
        'X-Kite-Version': '3',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ api_key, request_token, checksum }),
    });

    const data = await res.json() as Record<string, unknown>;

    if (!res.ok || data.status === 'error') {
      return NextResponse.json({ error: (data.message as string) ?? 'Session creation failed' }, { status: 401 });
    }

    return NextResponse.json(data.data ?? data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
