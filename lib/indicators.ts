/** Technical indicator calculations from raw OHLCV data */

export function sma(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

export function ema(closes: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { out[i] = null; continue; }
    if (prev === null) {
      prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
      out[i] = prev;
    } else {
      prev = closes[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface MACD {
  line:   (number | null)[];
  signal: (number | null)[];
  hist:   (number | null)[];
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9): MACD {
  const fastEma   = ema(closes, fast);
  const slowEma   = ema(closes, slow);
  const macdLine  = closes.map((_, i) => {
    const f = fastEma[i]; const s = slowEma[i];
    return f !== null && s !== null ? f - s : null;
  });

  /* Signal is EMA of MACD line — only over defined values */
  const defined    = macdLine.filter((v): v is number => v !== null);
  const sigEma     = ema(defined, signal);
  let sigIdx = 0;
  const signalLine = macdLine.map((v) => v !== null ? sigEma[sigIdx++] ?? null : null);
  const hist       = macdLine.map((v, i) => {
    const s = signalLine[i]; return v !== null && s !== null ? v - s : null;
  });
  return { line: macdLine, signal: signalLine, hist };
}

export interface BB {
  upper:  (number | null)[];
  middle: (number | null)[];
  lower:  (number | null)[];
}

export function bollingerBands(closes: number[], period = 20, stdMult = 2): BB {
  const middle = sma(closes, period);
  const upper:  (number | null)[] = [];
  const lower:  (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (middle[i] === null) { upper.push(null); lower.push(null); continue; }
    const slice  = closes.slice(i - period + 1, i + 1);
    const mean   = middle[i]!;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const sd     = Math.sqrt(variance);
    upper.push(mean + stdMult * sd);
    lower.push(mean - stdMult * sd);
  }
  return { upper, middle, lower };
}
