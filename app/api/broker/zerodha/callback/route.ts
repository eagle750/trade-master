import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/* GET /api/broker/zerodha/callback?request_token=xxx&action=login&status=success
   Zerodha redirects here after successful login.
   We pass the request_token to the client page via query param so it can complete the session. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status        = searchParams.get('status');
  const request_token = searchParams.get('request_token');
  const errorMsg      = searchParams.get('message');

  if (status !== 'success' || !request_token) {
    const msg = errorMsg ?? 'Login cancelled or failed';
    return NextResponse.redirect(
      new URL(`/?zerodha_error=${encodeURIComponent(msg)}`, req.url)
    );
  }

  /* Redirect to the broker-connect page with the token so JS can complete the session */
  return NextResponse.redirect(
    new URL(`/broker/zerodha/complete?request_token=${request_token}`, req.url)
  );
}
