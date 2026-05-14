import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export interface PlaceOrderBody {
  api_key:       string;
  access_token:  string;
  tradingsymbol: string;
  exchange:      'NSE' | 'BSE';
  transaction_type: 'BUY' | 'SELL';
  quantity:      number;
  order_type:    'MARKET' | 'LIMIT';
  product:       'CNC' | 'MIS' | 'NRML';
  price?:        number;
  tag?:          string;
}

/* POST /api/broker/zerodha/orders — place a live order */
export async function POST(req: Request) {
  try {
    const body = await req.json() as PlaceOrderBody;
    const { api_key, access_token, ...orderParams } = body;

    if (!api_key || !access_token) {
      return NextResponse.json({ error: 'api_key and access_token required' }, { status: 400 });
    }

    const form = new URLSearchParams();
    form.set('tradingsymbol',    orderParams.tradingsymbol);
    form.set('exchange',         orderParams.exchange ?? 'NSE');
    form.set('transaction_type', orderParams.transaction_type);
    form.set('quantity',         String(orderParams.quantity));
    form.set('order_type',       orderParams.order_type ?? 'MARKET');
    form.set('product',          orderParams.product ?? 'CNC');
    if (orderParams.price) form.set('price', String(orderParams.price));
    if (orderParams.tag)   form.set('tag', orderParams.tag);

    const res = await fetch('https://api.kite.trade/orders/regular', {
      method: 'POST',
      headers: {
        'X-Kite-Version': '3',
        'Authorization':  `token ${api_key}:${access_token}`,
        'Content-Type':   'application/x-www-form-urlencoded',
      },
      body: form,
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) return NextResponse.json({ error: (data.message as string) ?? 'Order failed' }, { status: res.status });
    return NextResponse.json(data.data ?? data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/* GET /api/broker/zerodha/orders — fetch today's orders */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const api_key      = searchParams.get('api_key');
  const access_token = searchParams.get('access_token');

  if (!api_key || !access_token) {
    return NextResponse.json({ error: 'api_key and access_token required' }, { status: 400 });
  }

  const res = await fetch('https://api.kite.trade/orders', {
    headers: {
      'X-Kite-Version': '3',
      'Authorization':  `token ${api_key}:${access_token}`,
    },
  });

  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) return NextResponse.json({ error: (data.message as string) ?? 'Failed' }, { status: res.status });
  return NextResponse.json(data.data ?? data);
}
