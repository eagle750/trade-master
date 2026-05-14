import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const _cache = new Map<string, { data: FundamentalsData; exp: number }>();

export interface QuarterlyPoint { period: string; value: number | null; }

export interface FundamentalsData {
  /* Valuation */
  pe?:                  number;
  forwardPE?:           number;
  pb?:                  number;
  pegRatio?:            number;
  evToEbitda?:          number;
  evToRevenue?:         number;
  enterpriseValueCr?:   number;
  marketCapCr?:         number;

  /* Profitability */
  roe?:                 number;
  roa?:                 number;
  roic?:                number;
  grossMargin?:         number;
  operatingMargin?:     number;
  netMargin?:           number;

  /* Financial health */
  debtToEquity?:        number;
  currentRatio?:        number;
  quickRatio?:          number;
  interestCoverage?:    number;

  /* Per share */
  eps?:                 number;
  forwardEps?:          number;
  bookValuePerShare?:   number;
  dividendYield?:       number;
  dividendRate?:        number;
  payoutRatio?:         number;

  /* Growth */
  revenueGrowthYoy?:    number;
  earningsGrowthYoy?:   number;

  /* Analyst */
  targetMeanPrice?:     number;
  targetLowPrice?:      number;
  targetHighPrice?:     number;
  recommendation?:      string;
  analystCount?:        number;

  /* Shareholding */
  promoterPct?:         number;
  institutionPct?:      number;
  publicPct?:           number;

  /* Quarterly history */
  revenueQ:             QuarterlyPoint[];
  netProfitQ:           QuarterlyPoint[];
  ebitdaQ:              QuarterlyPoint[];
}

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const nseSym   = symbol.toUpperCase();
  const yahooSym = `${nseSym}.NS`;

  const now    = Date.now();
  const cached = _cache.get(nseSym);
  if (cached && now < cached.exp) return NextResponse.json(cached.data);

  try {
    const res = await yf.quoteSummary(yahooSym, {
      modules: [
        'price', 'summaryDetail', 'financialData', 'defaultKeyStatistics',
        'majorHoldersBreakdown', 'incomeStatementHistoryQuarterly',
        'balanceSheetHistoryQuarterly', 'cashflowStatementHistoryQuarterly',
      ],
    }) as unknown as Record<string, Record<string, unknown>>;

    const p   = res.price               ?? {};
    const sd  = res.summaryDetail        ?? {};
    const fd  = res.financialData        ?? {};
    const ks  = res.defaultKeyStatistics ?? {};
    const mh  = res.majorHoldersBreakdown ?? {};
    const isQ = (res.incomeStatementHistoryQuarterly as Record<string, unknown> | undefined) ?? {};
    const cfQ = (res.cashflowStatementHistoryQuarterly as Record<string, unknown> | undefined) ?? {};

    const mcapRaw = (p.marketCap as number) ?? 0;
    const evRaw   = (ks.enterpriseValue as number) ?? 0;

    /* Quarterly income history */
    const incomeStmts = ((isQ.incomeStatementHistory as unknown[]) ?? []) as Array<Record<string, unknown>>;
    const cfStmts     = ((cfQ.cashflowStatements as unknown[]) ?? []) as Array<Record<string, unknown>>;

    const fmtPeriod = (d: unknown) => {
      if (!d) return '';
      const dt = new Date(d as string);
      return `Q${Math.ceil((dt.getMonth() + 1) / 3)} ${dt.getFullYear()}`;
    };

    const toCr = (v: unknown) => (typeof v === 'number' && v !== 0) ? Math.round(v / 1e7) : null;

    const revenueQ: QuarterlyPoint[] = incomeStmts.slice(0, 8).reverse().map((s) => ({
      period: fmtPeriod(s.endDate),
      value:  toCr(s.totalRevenue),
    }));

    const netProfitQ: QuarterlyPoint[] = incomeStmts.slice(0, 8).reverse().map((s) => ({
      period: fmtPeriod(s.endDate),
      value:  toCr(s.netIncome),
    }));

    /* EBITDA from cashflow: operatingCashFlow proxy or sum */
    const ebitdaQ: QuarterlyPoint[] = cfStmts.slice(0, 8).reverse().map((s) => ({
      period: fmtPeriod(s.endDate),
      value:  toCr(s.totalCashFromOperatingActivities),
    }));

    const rec = (fd.recommendationKey as string | undefined);

    const data: FundamentalsData = {
      pe:                 (sd.trailingPE   as number) ?? undefined,
      forwardPE:          (ks.forwardPE    as number) ?? undefined,
      pb:                 (ks.priceToBook  as number) ?? undefined,
      pegRatio:           (ks.pegRatio     as number) ?? undefined,
      evToEbitda:         (ks.enterpriseToEbitda as number) ?? undefined,
      evToRevenue:        (ks.enterpriseToRevenue as number) ?? undefined,
      enterpriseValueCr:  evRaw > 0 ? Math.round(evRaw / 1e7) : undefined,
      marketCapCr:        mcapRaw > 0 ? Math.round(mcapRaw / 1e7) : undefined,

      roe:                (fd.returnOnEquity  as number) ?? undefined,
      roa:                (fd.returnOnAssets  as number) ?? undefined,
      grossMargin:        (fd.grossMargins    as number) ?? undefined,
      operatingMargin:    (fd.operatingMargins as number) ?? undefined,
      netMargin:          (fd.profitMargins   as number) ?? undefined,

      debtToEquity:       (fd.debtToEquity    as number) ?? undefined,
      currentRatio:       (fd.currentRatio    as number) ?? undefined,
      quickRatio:         (fd.quickRatio      as number) ?? undefined,

      eps:                (ks.trailingEps     as number) ?? undefined,
      forwardEps:         (ks.forwardEps      as number) ?? undefined,
      bookValuePerShare:  (ks.bookValue       as number) ?? undefined,
      dividendYield:      (sd.dividendYield   as number) ?? undefined,
      dividendRate:       (sd.dividendRate    as number) ?? undefined,
      payoutRatio:        (sd.payoutRatio     as number) ?? undefined,

      revenueGrowthYoy:   (fd.revenueGrowth   as number) ?? undefined,
      earningsGrowthYoy:  (fd.earningsGrowth  as number) ?? undefined,

      targetMeanPrice:    (fd.targetMeanPrice  as number) ?? undefined,
      targetLowPrice:     (fd.targetLowPrice   as number) ?? undefined,
      targetHighPrice:    (fd.targetHighPrice  as number) ?? undefined,
      recommendation:     rec,
      analystCount:       (fd.numberOfAnalystOpinions as number) ?? undefined,

      promoterPct:        (mh.insidersPercentHeld      as number) ?? undefined,
      institutionPct:     (mh.institutionsPercentHeld  as number) ?? undefined,
      publicPct:          (mh.institutionsFloatPercentHeld as number) ?? undefined,

      revenueQ,
      netProfitQ,
      ebitdaQ,
    };

    _cache.set(nseSym, { data, exp: now + 600_000 });
    return NextResponse.json(data);

  } catch (err) {
    return NextResponse.json({ error: 'Fundamentals fetch failed', detail: String(err) }, { status: 500 });
  }
}
