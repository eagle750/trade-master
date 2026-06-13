import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { ParsedBrief, ClarifyingQuestion, ParameterBlock } from '@/lib/strategyTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are AlphaForge's strategy parser for the Indian equity market (NSE).

Your job: parse a user's plain-English investing idea into a structured strategy.

You MUST respond with valid JSON matching exactly this shape:
{
  "needsClarification": boolean,
  "clarifyingQuestions": [...],   // only if needsClarification=true
  "brief": { ... },               // always present
  "parameters": [ ... ]           // always present
}

## Brief format
Five bullets — one per funnel stage — using exact stage names:
- Universe (which stocks to start with: Nifty 50 / 500 / Total Market / custom)
- Eligibility (liquidity, T2T, ASM/GSM exclusions)
- Screen (quantitative filters: P/E, ROE, RSI, etc.)
- Rank (how to order survivors: momentum, ROE, composite score, etc.)
- Select (how many picks, weighting, rebalance frequency)

## When to ask clarifying questions
Ask clarifying questions ONLY about strategy logic and run_capital — never about backtest dates, brokerage, or execution mechanics (those are set by the user in the configuration panel).

Ask whenever ANY of the following are missing or ambiguous — do NOT assume or infer:
- Trade direction not stated (long / short / both) — ALWAYS ask if not explicit
- n_picks (how many stocks to select) — ask if not stated
- rank_by (what metric to rank on) — ask if not stated; NEVER default to momentum
- Universe (which index) — ask if not stated
- EMA periods not specified (e.g. "use EMA" without specifying 20/50/100) — ask
- Any filter mentioned but threshold not given (e.g. "high ROE" without a number)
- Rebalance frequency not stated
- run_capital (₹ committed to this strategy) — ask if not stated; do NOT default. Use type "numeric" with unit "₹"

Ask each missing/ambiguous item ONCE — never repeat a question already asked. One question per item. Each question:
{
  "id": "q1",
  "impact": "high" | "medium" | "low",
  "type": "numeric" | "single-select" | "multi-select" | "yes-no" | "date" | "free-text",
  "question": "...",
  "whyAsk": "one sentence explanation",
  "highlightedPhrase": "exact phrase from input that is ambiguous or missing",
  "inputConfig": {
    "quickPicks": [/* for numeric — values only, no unit text */],
    "unit": "pts",  // for numeric only: unit label, e.g. "months", "pts", "%", "days"
    "options": [{ "value": "...", "label": "..." }]  // for select types
  },
  "defaultValue": null,   // null means no default — user MUST answer
  "defaultLabel": "No default — please specify"
}

## Parameters
Return all 5 parameter blocks. Set each field based ONLY on what the strategy explicitly states or the user has answered. NEVER infer or default values that are not in the strategy:
- money_timeline: capital (₹ for backtest sizing — default 1000000), backtest_start (date — default 2020-01-01), backtest_end (date — default 2024-12-31), run_capital (₹ committed to this strategy — extract if stated; otherwise null + source "required" and ask a clarifying question)
- selection: universe ("nifty50"|"nifty100"|"nifty500" — from strategy only; if not stated set value null + source "required" and ask a clarifying question — NEVER default to nifty100), n_picks (from strategy only, ask if missing), rank_by ("momentum"|"roe"|"roa"|"composite" — from strategy only, ask if missing — NEVER default to momentum), weighting (select), rebalance_freq (from strategy only, ask if missing), min_ltp (ONLY if strategy explicitly states a minimum stock price, else null), min_mcap_cr (ONLY if strategy explicitly states a minimum market cap, else null)
- execution: slippage (%), brokerage (select), order_type (select)
- screen: max_pe, min_roe, max_de, min_roa, max_pb, min_rev_growth (set ONLY if explicitly in strategy, else null), momentum_months (use value from strategy if stated, else default 12 — do NOT set null), ema_filter ("bullish"|"bearish" — set ONLY if strategy mentions EMA; "bullish" = EMA short & medium above EMA long = long trade passes; "bearish" = both below = short trade passes), ema_short (EMA short period — from strategy, e.g. 20), ema_medium (EMA medium period — from strategy, e.g. 50), ema_long (EMA long period — from strategy, e.g. 100)
- risk: stop_loss (% — set if strategy mentions stop), target_pct (% — set if strategy mentions profit target), max_holding_days (set if strategy mentions max holding period), position_cap, sector_cap (all optional — set ONLY if in strategy)

Tag each field's source: "stated" (strategy said it explicitly), "AI" (clearly inferable), "required" (missing — user must fill), "optional" (not in strategy — leave null).

## Confidence
- "High" (0.90–1.0): clear, specific strategy
- "Medium" (0.65–0.89): some ambiguity resolved with defaults
- "Low" (0.40–0.64): significant ambiguity, review carefully

## Indian market conventions
- ₹ (never Rs. or INR)
- Lakh (L) / Crore (Cr) — never million/billion
- NSE stocks only — equity cash, no F&O
- Universe options: Nifty 50, Nifty 100, Nifty 200, Nifty 500, Nifty Total Market
- Rebalance options: daily, weekly, monthly, quarterly

Respond ONLY with the JSON object. No preamble, no markdown fences.`;

/* ── Parameter block templates ── */
function defaultParameters(): ParameterBlock[] {
  return [
    {
      id: 'money_timeline',
      group: 'Money & timeline',
      fields: [
        { id: 'capital',        label: 'Capital',        type: 'currency', value: 1000000,   source: 'default', required: false, unit: '₹' },
        { id: 'run_capital',    label: 'Run capital',    type: 'currency', value: null,      source: 'required', required: true, unit: '₹', helpText: 'Amount committed to this strategy. Must be ≤ your total capital.' },
        { id: 'backtest_start', label: 'Backtest start', type: 'date',     value: '2020-01-01', source: 'default', required: false },
        { id: 'backtest_end',   label: 'Backtest end',   type: 'date',     value: '2024-12-31', source: 'default', required: false },
      ],
    },
    {
      id: 'selection',
      group: 'Selection rules',
      fields: [
        { id: 'universe',      label: 'Universe',            type: 'select', value: null,      source: 'required', required: true,
          options: [{ value: 'nifty50', label: 'Nifty 50' }, { value: 'nifty100', label: 'Nifty 100' }, { value: 'nifty500', label: 'Nifty 500' }] },
        { id: 'n_picks',       label: 'Number of picks (N)', type: 'number', value: null,      source: 'required', required: true },
        { id: 'rank_by',       label: 'Rank by',             type: 'select', value: null,      source: 'required', required: true,
          options: [{ value: 'momentum', label: 'Momentum' }, { value: 'roe', label: 'ROE' }, { value: 'roa', label: 'ROA' }, { value: 'composite', label: 'Composite score' }] },
        { id: 'weighting',     label: 'Weighting',           type: 'select', value: 'equal',  source: 'default', required: false,
          options: [{ value: 'equal', label: 'Equal weight' }, { value: 'marketcap', label: 'Market-cap weight' }, { value: 'score', label: 'Score weight' }] },
        { id: 'rebalance_freq',label: 'Rebalance frequency', type: 'select', value: 'monthly', source: 'AI',   required: false, confidence: 0.9,
          options: [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }] },
        { id: 'min_ltp',       label: 'Min stock price (₹)', type: 'number', value: null,     source: 'optional', required: false },
        { id: 'min_mcap_cr',   label: 'Min mkt cap (₹Cr)',   type: 'number', value: null,     source: 'optional', required: false },
      ],
    },
    {
      id: 'execution',
      group: 'Execution mechanics',
      fields: [
        { id: 'slippage',    label: 'Slippage assumption', type: 'percent', value: 0.1,              source: 'AI',    required: false, unit: '%', confidence: 0.9 },
        { id: 'brokerage',   label: 'Brokerage model',     type: 'select',  value: 'zerodha_flat',   source: 'default', required: false,
          options: [{ value: 'zerodha_flat', label: 'Zerodha — ₹20 flat' }, { value: 'groww_flat', label: 'Groww — ₹20 flat' }, { value: 'zero', label: 'Zero (idealised)' }] },
        { id: 'order_type',  label: 'Order type',          type: 'select',  value: 'market_close',   source: 'default', required: false,
          options: [{ value: 'market_close', label: 'Market at close (EOD)' }, { value: 'market_open', label: 'Market at open' }] },
      ],
    },
    {
      id: 'screen',
      group: 'Screen filters',
      fields: [
        { id: 'max_pe',          label: 'Max P/E ratio',               type: 'number',  value: null, source: 'optional', required: false },
        { id: 'min_roe',         label: 'Min ROE (%)',                 type: 'percent', value: null, source: 'optional', required: false, unit: '%' },
        { id: 'max_de',          label: 'Max Debt/Equity ratio',       type: 'number',  value: null, source: 'optional', required: false },
        { id: 'min_roa',         label: 'Min ROA (%)',                 type: 'percent', value: null, source: 'optional', required: false, unit: '%' },
        { id: 'max_pb',          label: 'Max Price/Book ratio',        type: 'number',  value: null, source: 'optional', required: false },
        { id: 'min_rev_growth',  label: 'Min Revenue growth (%)',      type: 'percent', value: null, source: 'optional', required: false, unit: '%' },
        { id: 'momentum_months', label: 'Momentum lookback (months)',  type: 'number',  value: 12,   source: 'AI',       required: false, confidence: 0.9 },
        { id: 'ema_filter',      label: 'EMA trend filter',            type: 'select',  value: null, source: 'optional', required: false,
          options: [{ value: 'bullish', label: 'Bullish (short & medium EMA above long)' }, { value: 'bearish', label: 'Bearish (short & medium EMA below long)' }] },
        { id: 'ema_short',       label: 'EMA short period (days)',     type: 'number',  value: null, source: 'optional', required: false },
        { id: 'ema_medium',      label: 'EMA medium period (days)',    type: 'number',  value: null, source: 'optional', required: false },
        { id: 'ema_long',        label: 'EMA long period (days)',      type: 'number',  value: null, source: 'optional', required: false },
      ],
    },
    {
      id: 'risk',
      group: 'Risk controls',
      fields: [
        { id: 'stop_loss',         label: 'Stop loss per position', type: 'percent', value: null, source: 'optional', required: false, unit: '%' },
        { id: 'target_pct',        label: 'Profit target',           type: 'percent', value: null, source: 'optional', required: false, unit: '%' },
        { id: 'max_holding_days',  label: 'Max holding days',        type: 'number',  value: null, source: 'optional', required: false },
        { id: 'position_cap',      label: 'Max position size',       type: 'percent', value: null, source: 'optional', required: false, unit: '%' },
        { id: 'sector_cap',        label: 'Max sector exposure',     type: 'percent', value: null, source: 'optional', required: false, unit: '%' },
      ],
    },
  ];
}

/* ── Build ParsedBrief from Claude's JSON response ── */
function buildBrief(parsed: Record<string, unknown>, parameters: ParameterBlock[]): ParsedBrief {
  const briefData = parsed.brief as Record<string, unknown>;
  const confidence = (parsed.confidence as number) ?? 0.85;

  return {
    bullets: (briefData.bullets as ParsedBrief['bullets']) ?? [],
    confidence,
    confidenceLabel: confidence >= 0.9 ? 'High' : confidence >= 0.65 ? 'Medium' : 'Low',
    generatedAt: new Date().toISOString(),
    parameters,
  };
}

/* ── POST /api/strategy/parse ── */
export async function POST(req: Request) {
  try {
    const { input } = await req.json() as { input: string };

    if (!input?.trim()) {
      return NextResponse.json({ error: 'Input is required' }, { status: 400 });
    }
    if (input.trim().length < 20) {
      return NextResponse.json({ error: 'Input too short — add more detail' }, { status: 400 });
    }

    const t0 = Date.now();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Parse this investing strategy for the Indian equity market (NSE):\n\n${input.trim()}`,
        },
      ],
    });
    console.log(`[parse] Claude responded in ${Date.now() - t0}ms, tokens: in=${response.usage.input_tokens} out=${response.usage.output_tokens}`);

    const raw = response.content.find((b) => b.type === 'text');
    if (!raw || raw.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    let parsed: Record<string, unknown>;
    try {
      const start = raw.text.indexOf('{');
      const end = raw.text.lastIndexOf('}');
      if (start === -1 || end === -1) throw new SyntaxError('no JSON object found');
      parsed = JSON.parse(raw.text.slice(start, end + 1));
    } catch {
      const truncated = response.usage?.output_tokens >= 8090;
      console.error('[parse] raw response (truncated=' + truncated + '):', raw.text.substring(0, 500));
      throw new Error(truncated ? 'Response too long — try a shorter strategy description' : 'Claude returned non-JSON response');
    }

    const parameters = mergeParameters(
      defaultParameters(),
      (parsed.parameters as ParameterBlock[]) ?? []
    );

    if (parsed.needsClarification && Array.isArray(parsed.clarifyingQuestions) && parsed.clarifyingQuestions.length > 0) {
      return NextResponse.json({
        clarifyingQuestions: parsed.clarifyingQuestions as ClarifyingQuestion[],
        brief: null,
      });
    }

    const brief = buildBrief(parsed, parameters);
    return NextResponse.json({ brief, clarifyingQuestions: [] });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[parse] Anthropic error:', err);
    const status = msg.includes('API key') || msg.includes('auth') ? 401 : 503;
    return NextResponse.json({ error: msg }, { status });
  }
}

/* Merge Claude's parameter overrides onto the default template */
function mergeParameters(defaults: ParameterBlock[], overrides: ParameterBlock[]): ParameterBlock[] {
  return defaults.map((block) => {
    const override = overrides.find((o) => o.id === block.id);
    if (!override) return block;
    return {
      ...block,
      fields: block.fields.map((field) => {
        const of_ = override.fields?.find((f) => f.id === field.id);
        return of_ ? { ...field, ...of_ } : field;
      }),
    };
  });
}
