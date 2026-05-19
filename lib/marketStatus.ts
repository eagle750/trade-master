import type { MarketPulseData } from './types';

/* NSE public holidays 2024–2026 (yyyy-mm-dd in IST) */
const NSE_HOLIDAYS = new Set([
  /* 2024 */
  '2024-01-22', '2024-01-26', '2024-03-08', '2024-03-25', '2024-03-29',
  '2024-04-11', '2024-04-14', '2024-04-17', '2024-04-21', '2024-05-23',
  '2024-06-17', '2024-07-17', '2024-08-15', '2024-10-02', '2024-11-01',
  '2024-11-15', '2024-11-20', '2024-12-25',

  /* 2025 */
  '2025-01-26', '2025-02-26', '2025-03-14', '2025-03-31', '2025-04-10',
  '2025-04-14', '2025-04-18', '2025-05-01', '2025-06-07', '2025-08-15',
  '2025-08-27', '2025-10-02', '2025-10-02', '2025-10-21', '2025-10-22',
  '2025-11-05', '2025-12-25',

  /* 2026 */
  '2026-01-26', '2026-03-03', '2026-03-20', '2026-04-02', '2026-04-03',
  '2026-04-14', '2026-05-01', '2026-05-27', '2026-06-27', '2026-08-15',
  '2026-08-17', '2026-10-02', '2026-11-10', '2026-11-11', '2026-11-25',
  '2026-12-25',
]);

export type MarketStatusResult = {
  status:    MarketPulseData['marketStatus'];
  time:      string;
  exchange:  'NSE';
  region:    'IND';
  reason?:   'weekend' | 'holiday' | 'after-hours' | 'pre-open';
};

export function getMarketStatus(): MarketStatusResult {
  const now = new Date();

  /* Derive current IST date/time without relying on Intl for arithmetic */
  const istOffset = 5.5 * 60 * 60 * 1000;           // UTC+5:30 in ms
  const istMs     = now.getTime() + istOffset;
  const istDate   = new Date(istMs);

  const dayOfWeek = istDate.getUTCDay();              // 0=Sun, 6=Sat
  const yyyy      = istDate.getUTCFullYear();
  const mm        = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const dd        = String(istDate.getUTCDate()).padStart(2, '0');
  const dateStr   = `${yyyy}-${mm}-${dd}`;

  const mins = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();

  /* Weekend */
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { status: 'holiday', time: now.toISOString(), exchange: 'NSE', region: 'IND', reason: 'weekend' };
  }

  /* Public holiday */
  if (NSE_HOLIDAYS.has(dateStr)) {
    return { status: 'holiday', time: now.toISOString(), exchange: 'NSE', region: 'IND', reason: 'holiday' };
  }

  /* NSE trading sessions (IST minutes from midnight) */
  const PRE_OPEN_START = 9 * 60;           // 09:00
  const MARKET_OPEN    = 9 * 60 + 15;      // 09:15
  const MARKET_CLOSE   = 15 * 60 + 30;     // 15:30

  if (mins < PRE_OPEN_START || mins >= MARKET_CLOSE) {
    return { status: 'closed', time: now.toISOString(), exchange: 'NSE', region: 'IND', reason: 'after-hours' };
  }
  if (mins < MARKET_OPEN) {
    return { status: 'pre-open', time: now.toISOString(), exchange: 'NSE', region: 'IND', reason: 'pre-open' };
  }

  return { status: 'open', time: now.toISOString(), exchange: 'NSE', region: 'IND' };
}
