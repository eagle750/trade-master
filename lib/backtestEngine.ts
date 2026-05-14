/**
 * Single-stock backtest engine.
 * Uses EOD price bars from Yahoo Finance.
 * Strategy: RSI momentum — buy when RSI crosses above 50, sell below 50.
 * All numbers are real Yahoo Finance prices/returns. No fabricated values.
 */
import { rsi } from './indicators';

export interface BacktestConfig {
  capital:     number;  /* ₹ notional */
  slippagePct: number;  /* e.g. 0.001 = 0.1% */
  brokerage:   number;  /* ₹ flat per leg */
  rsiPeriod:   number;
  threshold:   number;  /* 0-1, factor score threshold for signal */
}

export interface OHLCVBar {
  t: string;
  o: number; h: number; l: number; c: number; v: number;
}

export interface TickState {
  date:        string;
  dayIndex:    number;
  totalDays:   number;
  ohlcv:       { o: number; h: number; l: number; c: number; v: number };
  factorScore: number;
  conditions:  { name: string; met: boolean; value: string }[];
  signal:      'BUY' | 'SELL' | null;
  action?:     { type: 'BUY' | 'SELL'; qty: number; price: number; slippageCost: number; brokerage: number };
  position:    { type: 'LONG' | 'FLAT'; qty: number; avgCost: number; daysHeld: number; unrealisedPnL: number };
  account:     { cash: number; positionMTM: number; equity: number; returnPctFromStart: number };
  equityCurves:{ strategy: number; bAndH: number };
  drawdowns:   { strategy: number; bAndH: number };
}

export interface TradeEvent {
  id:        string;
  tickIndex: number;
  type:      'BUY' | 'SELL';
  qty:       number;
  price:     number;
  pnl?:      number;
  pnlPct?:   number;
  daysHeld?: number;
  reason:    string;
}

export interface BacktestPerformance {
  equityNow:       number;
  returnPct:       number;
  cagr:            number;
  maxDD:           number;
  bAndHReturnPct:  number;
  bAndHMaxDD:      number;
  sharpe:          number;
  winRate:         { wins: number; losses: number; total: number };
  timeInMarketPct: number;
  tradingDays:     number;
}

export interface BacktestResult {
  symbol:      string;
  config:      BacktestConfig & { from: string; to: string };
  ticks:       TickState[];
  trades:      TradeEvent[];
  performance: BacktestPerformance;
}

export function runBacktest(
  symbol:  string,
  bars:    OHLCVBar[],
  config:  BacktestConfig,
): BacktestResult {
  const { capital, slippagePct, brokerage, rsiPeriod, threshold } = config;

  const closes      = bars.map((b) => b.c);
  const rsiValues   = rsi(closes, rsiPeriod);
  const factorScores = rsiValues.map((r) => r != null ? r / 100 : 0);

  const bAndHStartPrice = bars[0].c;
  let cash         = capital;
  let qty          = 0;
  let avgCost      = 0;
  let daysHeld     = 0;
  let entryTickIdx = -1;

  let peakEquity    = capital;
  let peakBandH     = capital;
  let maxDD         = 0;
  let maxBandHDD    = 0;
  let daysInMarket  = 0;

  const ticks:  TickState[]  = [];
  const trades: TradeEvent[] = [];
  const dailyReturns: number[] = [];

  let prevEquity = capital;

  for (let i = 0; i < bars.length; i++) {
    const bar    = bars[i];
    const score  = factorScores[i];
    const prevScore = i > 0 ? factorScores[i - 1] : 0;

    /* ---- Conditions ---- */
    const conds = [
      { name: 'RSI > 50 (momentum positive)', met: score > threshold,     value: (score * 100).toFixed(1) },
      { name: 'RSI not overbought (< 85)',     met: score < 0.85,          value: (score * 100).toFixed(1) },
      { name: 'Price above open',              met: bar.c >= bar.o,        value: bar.c.toFixed(2) },
    ];

    /* ---- Signals ---- */
    let signal: 'BUY' | 'SELL' | null = null;
    if (score > threshold && prevScore <= threshold && qty === 0)                signal = 'BUY';
    if ((score <= threshold && prevScore > threshold) && qty > 0)  signal = 'SELL';

    /* ---- Execute ---- */
    let action: TickState['action'] | undefined;
    if (signal === 'BUY' && cash > 0) {
      const execPrice = bar.c * (1 + slippagePct);
      const slip      = bar.c * slippagePct;
      qty             = Math.floor(cash / (execPrice + brokerage / Math.max(1, cash / execPrice)));
      if (qty > 0) {
        const totalCost = qty * execPrice + brokerage;
        avgCost         = execPrice;
        cash            -= totalCost;
        daysHeld        = 0;
        entryTickIdx    = i;
        action          = { type: 'BUY', qty, price: bar.c, slippageCost: slip * qty, brokerage };
        trades.push({ id: `t${trades.length}`, tickIndex: i, type: 'BUY', qty, price: bar.c, reason: `Factor score ${score.toFixed(2)} crossed above ${threshold}` });
      }
    } else if (signal === 'SELL' && qty > 0) {
      const execPrice = bar.c * (1 - slippagePct);
      const slip      = bar.c * slippagePct;
      const proceeds  = qty * execPrice - brokerage;
      const pnl       = proceeds - qty * avgCost;
      const pnlPct    = (pnl / (qty * avgCost)) * 100;
      const held      = i - entryTickIdx;
      cash            += proceeds;
      action          = { type: 'SELL', qty, price: bar.c, slippageCost: slip * qty, brokerage };
      trades.push({ id: `t${trades.length}`, tickIndex: i, type: 'SELL', qty, price: bar.c, pnl, pnlPct, daysHeld: held, reason: `Factor score ${score.toFixed(2)} crossed below ${threshold}` });
      qty             = 0;
      avgCost         = 0;
      daysHeld        = 0;
      entryTickIdx    = -1;
    }

    if (qty > 0) daysHeld++;
    if (qty > 0) daysInMarket++;

    const positionMTM  = qty * bar.c;
    const equity       = cash + positionMTM;
    const unrealisedPnL = qty > 0 ? (bar.c - avgCost) * qty : 0;
    const bAndHEquity  = capital * (bar.c / bAndHStartPrice);

    /* Drawdown */
    if (equity > peakEquity)    peakEquity    = equity;
    if (bAndHEquity > peakBandH) peakBandH   = bAndHEquity;
    const ddNow     = (equity - peakEquity) / peakEquity;
    const bHddNow   = (bAndHEquity - peakBandH) / peakBandH;
    if (ddNow   < maxDD)     maxDD     = ddNow;
    if (bHddNow < maxBandHDD) maxBandHDD = bHddNow;

    /* Daily return for Sharpe */
    const dr = prevEquity > 0 ? (equity - prevEquity) / prevEquity : 0;
    dailyReturns.push(dr);
    prevEquity = equity;

    const allMet   = conds.every((c) => c.met);
    const metCount = conds.filter((c) => c.met).length;

    ticks.push({
      date:         bar.t.slice(0, 10),
      dayIndex:     i,
      totalDays:    bars.length,
      ohlcv:        { o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v },
      factorScore:  score,
      conditions:   conds,
      signal,
      action,
      position:     { type: qty > 0 ? 'LONG' : 'FLAT', qty, avgCost, daysHeld, unrealisedPnL },
      account:      { cash, positionMTM, equity, returnPctFromStart: (equity - capital) / capital * 100 },
      equityCurves: { strategy: equity, bAndH: bAndHEquity },
      drawdowns:    { strategy: ddNow * 100, bAndH: bHddNow * 100 },
    });
  }

  /* Close open position at end */
  if (qty > 0 && bars.length > 0) {
    const lastBar  = bars[bars.length - 1];
    const proceeds = qty * lastBar.c - brokerage;
    const pnl      = proceeds - qty * avgCost;
    trades.push({ id: `t${trades.length}`, tickIndex: bars.length - 1, type: 'SELL', qty, price: lastBar.c, pnl, pnlPct: pnl / (qty * avgCost) * 100, daysHeld: bars.length - 1 - entryTickIdx, reason: 'Period end — position closed' });
  }

  /* Performance */
  const finalEquity   = ticks[ticks.length - 1]?.account.equity ?? capital;
  const returnPct     = (finalEquity - capital) / capital * 100;
  const periodYears   = bars.length / 252;
  const cagr          = periodYears > 0 ? (Math.pow(finalEquity / capital, 1 / periodYears) - 1) * 100 : 0;
  const bAndHReturn   = ticks[ticks.length - 1]?.equityCurves.bAndH ?? capital;
  const bAndHReturnPct = (bAndHReturn - capital) / capital * 100;

  const meanRet   = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const stdRet    = Math.sqrt(dailyReturns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / dailyReturns.length);
  const sharpe    = stdRet > 0 ? (meanRet / stdRet) * Math.sqrt(252) : 0;

  const wins   = trades.filter((t) => t.type === 'SELL' && (t.pnl ?? 0) > 0).length;
  const total  = trades.filter((t) => t.type === 'SELL').length;

  return {
    symbol,
    config: { ...config, from: bars[0]?.t.slice(0,10) ?? '', to: bars[bars.length-1]?.t.slice(0,10) ?? '' },
    ticks,
    trades,
    performance: {
      equityNow:       finalEquity,
      returnPct,
      cagr,
      maxDD:           maxDD * 100,
      bAndHReturnPct,
      bAndHMaxDD:      maxBandHDD * 100,
      sharpe:          parseFloat(sharpe.toFixed(2)),
      winRate:         { wins, losses: total - wins, total },
      timeInMarketPct: bars.length > 0 ? (daysInMarket / bars.length) * 100 : 0,
      tradingDays:     bars.length,
    },
  };
}
