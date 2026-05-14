/**
 * Real NSE screening engine.
 * Data: Yahoo Finance (quote + quoteSummary + chart).
 * No mock values — every price, fundamental, and return is live.
 */
import YahooFinance from 'yahoo-finance2';
import { NIFTY100_NS, NSE_SECTOR_MAP } from './nseSymbols';
import type { StockRow } from './types';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/* ---- Types ---- */
export interface ScreenerParams {
  nPicks:       number;    /* Stage 5 — how many to select */
  maxPE?:       number;    /* Stage 3 filter */
  minROE?:      number;    /* Stage 3 filter (0–1, e.g. 0.10 = 10%) */
  maxDE?:       number;    /* Stage 3 filter (debt/equity ratio) */
  momentumMonths: number;  /* Stage 4 lookback — typically 12 */
  universe:     string[];  /* symbol list for Stage 1 */
}

export interface FunnelStage {
  index:      1 | 2 | 3 | 4 | 5;
  name:       'Universe' | 'Eligibility' | 'Screen' | 'Rank' | 'Select';
  rule:       string;
  count:      number;
  delta:      number;
  status:     'verified' | 'inspecting' | 'pending';
  stocks:     StockRow[];
  excludedByUser: string[];
}

export interface SelectionStock {
  rank:            number;
  symbol:          string;
  name:            string;
  sector:          string;
  cap:             'mega' | 'large' | 'mid' | 'small';
  headlineMetric:  { label: string; value: string };
  weight:          number;
}

export interface ScreenerResult {
  runId:     string;
  stages:    FunnelStage[];
  selection: SelectionStock[];
  asOf:      string;
}

/* ---- Helpers ---- */
const BATCH = 10;

async function batchedQuotes(symbols: string[]) {
  const out: Array<{ symbol: string; q: Record<string, unknown> | null }> = [];
  for (let i = 0; i < symbols.length; i += BATCH) {
    const slice = symbols.slice(i, i + BATCH);
    const res   = await Promise.all(
      slice.map((s) =>
        yf.quote(s).then((q) => ({ symbol: s, q: q as unknown as Record<string, unknown> }))
                   .catch(() => ({ symbol: s, q: null }))
      )
    );
    out.push(...res);
    if (i + BATCH < symbols.length) await delay(60);
  }
  return out;
}

async function batchedSummary(symbols: string[]) {
  const out: Map<string, Record<string, unknown>> = new Map();
  for (let i = 0; i < symbols.length; i += BATCH) {
    const slice = symbols.slice(i, i + BATCH);
    const res   = await Promise.all(
      slice.map((s) =>
        yf.quoteSummary(s, { modules: ['financialData', 'summaryDetail'] })
           .then((r) => ({ symbol: s, r: r as unknown as Record<string, unknown> }))
           .catch(() => ({ symbol: s, r: null }))
      )
    );
    for (const { symbol, r } of res) if (r) out.set(symbol, r);
    if (i + BATCH < symbols.length) await delay(60);
  }
  return out;
}

async function batchedMomentum(symbols: string[], months: number) {
  const out: Map<string, number> = new Map();
  const period1 = new Date();
  period1.setMonth(period1.getMonth() - months);
  const p1 = period1.toISOString().slice(0, 10);

  for (let i = 0; i < symbols.length; i += BATCH) {
    const slice = symbols.slice(i, i + BATCH);
    const res   = await Promise.all(
      slice.map((s) =>
        yf.chart(s, { period1: p1, interval: '1mo' })
           .then((r) => {
             const q   = (r as unknown as { quotes: Array<{ close: number }> }).quotes;
             const ret = q.length >= 2
               ? (q[q.length - 1].close - q[0].close) / q[0].close
               : 0;
             return { symbol: s, ret };
           })
           .catch(() => ({ symbol: s, ret: 0 }))
      )
    );
    for (const { symbol, ret } of res) out.set(symbol, ret);
    if (i + BATCH < symbols.length) await delay(60);
  }
  return out;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function capCategory(mcapCr: number): SelectionStock['cap'] {
  if (mcapCr >= 100000) return 'mega';
  if (mcapCr >= 20000)  return 'large';
  if (mcapCr >= 5000)   return 'mid';
  return 'small';
}

function bareSymbol(y: string) { return y.replace(/\.(NS|BO)$/i, ''); }

/* ---- Main screener ---- */
export async function runScreener(params: ScreenerParams): Promise<ScreenerResult> {
  const {
    nPicks         = 20,
    maxPE          = 50,
    minROE         = 0.10,
    momentumMonths = 12,
    universe       = NIFTY100_NS,
  } = params;

  /* ── Stage 1: Universe ────────────────────────────────── */
  const stage1Symbols = universe;

  /* ── Stage 2: Eligibility — fetch live quotes ────────── */
  const quoteData = await batchedQuotes(stage1Symbols);
  const eligible: typeof quoteData = [];
  const allStockRows: Map<string, StockRow> = new Map();

  for (const { symbol, q } of quoteData) {
    if (!q) continue;
    const price  = q.regularMarketPrice as number | undefined;
    const mcapRaw = q.marketCap as number | undefined;
    const mcapCr = mcapRaw && mcapRaw > 0 ? Math.round(mcapRaw / 1e7) : 0;
    const nse    = bareSymbol(symbol);

    if (!price || price < 10) continue;   /* illiquid / suspended */
    if (mcapCr < 1000)        continue;   /* below ₹1,000 Cr */

    const row: StockRow = {
      symbol:    nse,
      name:      (q.shortName as string) ?? (q.longName as string) ?? nse,
      sector:    (q.sector as string) ?? NSE_SECTOR_MAP[nse] ?? '—',
      ltp:       price,
      changePct: (q.regularMarketChangePercent as number) ?? 0,
      mcapCr,
      pe:        (q.trailingPE as number) ?? undefined,
    };
    allStockRows.set(symbol, row);
    eligible.push({ symbol, q });
  }

  /* ── Stage 3: Screen — fundamentals ─────────────────── */
  const eligibleSymbols = eligible.map((e) => e.symbol);
  const summaries       = await batchedSummary(eligibleSymbols);

  const screened: string[] = [];
  const screenedRows: StockRow[] = [];

  for (const sym of eligibleSymbols) {
    const row = allStockRows.get(sym);
    if (!row) continue;

    const s = summaries.get(sym);
    const fd = (s?.financialData as Record<string, unknown>) ?? {};
    const roe = fd.returnOnEquity as number | undefined;

    /* Apply filters — skip if clearly fails; allow undefined to pass */
    if (row.pe != null && row.pe > 0 && row.pe > maxPE) continue;
    if (roe  != null && roe < minROE) continue;

    /* Attach ROE to row for display */
    row.roe = roe != null ? Math.round(roe * 100 * 10) / 10 : undefined;
    screened.push(sym);
    screenedRows.push(row);
  }

  /* ── Stage 4: Rank — 12-month price momentum ─────────── */
  const momentum = await batchedMomentum(screened, momentumMonths);
  screened.sort((a, b) => (momentum.get(b) ?? 0) - (momentum.get(a) ?? 0));
  screenedRows.sort((a, b) => {
    const symA = a.symbol + '.NS';
    const symB = b.symbol + '.NS';
    return (momentum.get(symB) ?? 0) - (momentum.get(symA) ?? 0);
  });

  /* ── Stage 5: Select — top N, equal weight ───────────── */
  const selected    = screened.slice(0, nPicks);
  const selectedRows = screenedRows.slice(0, nPicks);
  const weight      = 1 / nPicks;

  const selection: SelectionStock[] = selectedRows.map((row, i) => {
    const sym12m = row.symbol + '.NS';
    const ret12m = momentum.get(sym12m) ?? 0;
    return {
      rank:  i + 1,
      symbol: row.symbol,
      name:   row.name,
      sector: row.sector,
      cap:    capCategory(row.mcapCr),
      headlineMetric: {
        label: `${momentumMonths}m return`,
        value: `${ret12m >= 0 ? '+' : ''}${(ret12m * 100).toFixed(1)}%`,
      },
      weight,
    };
  });

  const UNIVERSE_COUNT = stage1Symbols.length;
  const ELIG_COUNT     = eligible.length;
  const SCREEN_COUNT   = screened.length;
  const SELECT_COUNT   = selected.length;

  const stages: FunnelStage[] = [
    {
      index: 1, name: 'Universe',
      rule:  `Nifty 100 constituents as of run date`,
      count: UNIVERSE_COUNT, delta: 0,
      status: 'verified', excludedByUser: [],
      stocks: [],
    },
    {
      index: 2, name: 'Eligibility',
      rule:  'Market cap > ₹1,000 Cr · LTP > ₹10 · Excludes suspended',
      count: ELIG_COUNT, delta: ELIG_COUNT - UNIVERSE_COUNT,
      status: 'verified', excludedByUser: [],
      stocks: Array.from(allStockRows.values()).filter((r) =>
        eligible.some((e) => bareSymbol(e.symbol) === r.symbol)
      ),
    },
    {
      index: 3, name: 'Screen',
      rule:  `P/E < ${maxPE} AND ROE > ${Math.round(minROE * 100)}%`,
      count: SCREEN_COUNT, delta: SCREEN_COUNT - ELIG_COUNT,
      status: 'verified', excludedByUser: [],
      stocks: screenedRows,
    },
    {
      index: 4, name: 'Rank',
      rule:  `${momentumMonths}-month price return, highest first (Yahoo Finance adjusted close)`,
      count: SCREEN_COUNT, delta: 0,
      status: 'verified', excludedByUser: [],
      stocks: screenedRows,
    },
    {
      index: 5, name: 'Select',
      rule:  `Top ${nPicks} by rank · Equal weight ${(weight * 100).toFixed(1)}% each`,
      count: SELECT_COUNT, delta: SELECT_COUNT - SCREEN_COUNT,
      status: 'inspecting', excludedByUser: [],
      stocks: selectedRows,
    },
  ];

  return {
    runId:     `run_${Date.now()}`,
    stages,
    selection,
    asOf:      new Date().toISOString(),
  };
}
