import type { MarketPulseData } from './types';

export function getMarketStatus(): {
  status: MarketPulseData['marketStatus'];
  time: string;
} {
  const now  = new Date();
  const ist  = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const mins = ist.getHours() * 60 + ist.getMinutes();

  /* NSE trading calendar: pre-open 09:00–09:15, regular 09:15–15:30 */
  let status: MarketPulseData['marketStatus'];
  if      (mins < 9 * 60)           status = 'closed';
  else if (mins < 9 * 60 + 15)      status = 'pre-open';
  else if (mins < 15 * 60 + 30)     status = 'open';
  else                               status = 'closed';

  return { status, time: now.toISOString() };
}
