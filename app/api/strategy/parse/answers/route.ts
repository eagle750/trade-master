import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { ParsedBrief, ClarifyingQuestion, QuestionAnswer, ParameterBlock } from '@/lib/strategyTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are AlphaForge's strategy parser for the Indian equity market (NSE).

You have already asked the user clarifying questions about their strategy. Now, given their original
input AND their answers to those questions, produce the final parsed Brief and Parameters.

Respond with valid JSON containing ALL fields listed below. Every field must be present — use null + source "optional" or "required" for anything not in the strategy or answers:
{
  "brief": {
    "bullets": [
      { "stage": "Universe",    "text": "...", "citations": [] },
      { "stage": "Eligibility", "text": "...", "citations": [] },
      { "stage": "Screen",      "text": "...", "citations": ["Q1"] },
      { "stage": "Rank",        "text": "...", "citations": ["Q2"] },
      { "stage": "Select",      "text": "...", "citations": ["Q3"] }
    ]
  },
  "confidence": 0.0,
  "parameters": [
    {
      "id": "money_timeline", "group": "Money & timeline",
      "fields": [
        { "id": "capital",        "value": 1000000,    "source": "default" },
        { "id": "run_capital",    "value": "<INR amount stated or answered — null + source 'required' if missing>", "source": "stated" },
        { "id": "backtest_start", "value": "2020-01-01", "source": "default" },
        { "id": "backtest_end",   "value": "2024-12-31", "source": "default" }
      ]
    },
    {
      "id": "selection", "group": "Selection rules",
      "fields": [
        { "id": "universe",      "value": "<nifty50|nifty100|nifty500 — from strategy or answer>", "source": "stated" },
        { "id": "n_picks",       "value": null, "source": "required" },
        { "id": "rank_by",       "value": "<momentum|roe|roa|composite — from strategy or answer only>", "source": "stated" },
        { "id": "weighting",     "value": "equal", "source": "default" },
        { "id": "rebalance_freq","value": null, "source": "required" },
        { "id": "min_ltp",       "value": null, "source": "optional" },
        { "id": "min_mcap_cr",   "value": null, "source": "optional" }
      ]
    },
    {
      "id": "execution", "group": "Execution mechanics",
      "fields": [
        { "id": "slippage",   "value": null, "source": "optional" },
        { "id": "brokerage",  "value": "zerodha_flat", "source": "default" },
        { "id": "order_type", "value": "market_close",  "source": "default" }
      ]
    },
    {
      "id": "screen", "group": "Screen filters",
      "fields": [
        { "id": "max_pe",          "value": null, "source": "optional" },
        { "id": "min_roe",         "value": null, "source": "optional" },
        { "id": "max_de",          "value": null, "source": "optional" },
        { "id": "min_roa",         "value": null, "source": "optional" },
        { "id": "max_pb",          "value": null, "source": "optional" },
        { "id": "min_rev_growth",  "value": null, "source": "optional" },
        { "id": "momentum_months", "value": 12, "source": "AI" },
        { "id": "ema_filter",      "value": null, "source": "optional" },
        { "id": "ema_short",       "value": null, "source": "optional" },
        { "id": "ema_medium",      "value": null, "source": "optional" },
        { "id": "ema_long",        "value": null, "source": "optional" }
      ]
    },
    {
      "id": "risk", "group": "Risk controls",
      "fields": [
        { "id": "stop_loss",        "value": null, "source": "optional" },
        { "id": "target_pct",       "value": null, "source": "optional" },
        { "id": "max_holding_days", "value": null, "source": "optional" },
        { "id": "position_cap",     "value": null, "source": "optional" },
        { "id": "sector_cap",       "value": null, "source": "optional" }
      ]
    }
  ]
}

Rules:
- Use citations like ["Q1","Q2"] when a bullet was shaped by an answer to that question.
- Source tags: "stated" (user said it explicitly), "AI" (clearly inferable from strategy), "required" (still missing — leave null), "optional" (not in strategy — leave null).
- NEVER fill a value that was not answered and is not clearly stated in the original strategy. If it is still missing, set source "required" and value null.
- rank_by MUST come from the strategy or a user answer. NEVER default it to "momentum" or any other value on your own.
- ema_filter, ema_short, ema_medium, ema_long — set ONLY if the strategy or answers specify EMA conditions.
- min_ltp, min_mcap_cr — set ONLY if the strategy or answers explicitly state a minimum price or market cap.
- Indian conventions: ₹, lakh/crore, NSE only.

Respond ONLY with the JSON object. No preamble, no markdown fences.`;

function defaultParameters(): ParameterBlock[] {
  return [
    {
      id: 'money_timeline', group: 'Money & timeline',
      fields: [
        { id: 'capital',        label: 'Capital',        type: 'currency', value: 1000000,   source: 'default', required: false, unit: '₹' },
        { id: 'run_capital',    label: 'Run capital',    type: 'currency', value: null,      source: 'required', required: true, unit: '₹', helpText: 'Amount committed to this strategy. Must be ≤ your total capital.' },
        { id: 'backtest_start', label: 'Backtest start', type: 'date',     value: '2020-01-01', source: 'default', required: false },
        { id: 'backtest_end',   label: 'Backtest end',   type: 'date',     value: '2024-12-31', source: 'default', required: false },
      ],
    },
    {
      id: 'selection', group: 'Selection rules',
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
      id: 'execution', group: 'Execution mechanics',
      fields: [
        { id: 'slippage',   label: 'Slippage assumption', type: 'percent', value: 0.1,             source: 'AI',    required: false, unit: '%', confidence: 0.9 },
        { id: 'brokerage',  label: 'Brokerage model',     type: 'select',  value: 'zerodha_flat',  source: 'default', required: false,
          options: [{ value: 'zerodha_flat', label: 'Zerodha — ₹20 flat' }, { value: 'groww_flat', label: 'Groww — ₹20 flat' }, { value: 'zero', label: 'Zero (idealised)' }] },
        { id: 'order_type', label: 'Order type',          type: 'select',  value: 'market_close',  source: 'default', required: false,
          options: [{ value: 'market_close', label: 'Market at close (EOD)' }, { value: 'market_open', label: 'Market at open' }] },
      ],
    },
    {
      id: 'screen', group: 'Screen filters',
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
      id: 'risk', group: 'Risk controls',
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

function formatAnswers(questions: ClarifyingQuestion[], answers: QuestionAnswer[]): string {
  return questions.map((q) => {
    const ans = answers.find((a) => a.questionId === q.id);
    const value = ans?.value ?? q.defaultValue;
    const source = ans?.source === 'user' ? 'User answered' : `User skipped — AI default: ${q.defaultLabel}`;
    return `${q.id.toUpperCase()}: "${q.question}"\n  → ${source}: ${JSON.stringify(value)}`;
  }).join('\n\n');
}

/* ── POST /api/strategy/parse/answers ── */
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      input: string;
      questions: ClarifyingQuestion[];
      answers: QuestionAnswer[];
    };

    const { input, questions = [], answers = [] } = body;

    if (!input?.trim()) {
      return NextResponse.json({ error: 'Original input is required' }, { status: 400 });
    }

    const answersText = formatAnswers(questions, answers);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Original strategy input:\n"${input.trim()}"\n\n---\n\nClarifying question answers:\n${answersText}\n\n---\n\nNow produce the final Brief and Parameters incorporating all answers.`,
        },
      ],
    });

    const raw = response.content.find((b) => b.type === 'text');
    if (!raw || raw.type !== 'text') throw new Error('No text response from Claude');

    let parsed: Record<string, unknown>;
    try {
      const start = raw.text.indexOf('{');
      const end = raw.text.lastIndexOf('}');
      if (start === -1 || end === -1) throw new SyntaxError('no JSON object found');
      parsed = JSON.parse(raw.text.slice(start, end + 1));
    } catch {
      console.error('[answers] raw response:', raw.text.substring(0, 500));
      throw new Error('Claude returned non-JSON response');
    }

    const parameters = mergeParameters(
      defaultParameters(),
      (parsed.parameters as ParameterBlock[]) ?? []
    );

    const confidence = (parsed.confidence as number) ?? 0.92;
    const briefData  = (parsed.brief as Record<string, unknown>) ?? {};

    const brief: ParsedBrief = {
      bullets:         (briefData.bullets as ParsedBrief['bullets']) ?? [],
      confidence,
      confidenceLabel: confidence >= 0.9 ? 'High' : confidence >= 0.65 ? 'Medium' : 'Low',
      generatedAt:     new Date().toISOString(),
      parameters,
    };

    return NextResponse.json({ brief, clarifyingQuestions: [] });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('API key') || msg.includes('auth') ? 401 : 503;
    return NextResponse.json({ error: msg }, { status });
  }
}
