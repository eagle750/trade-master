import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { ParsedBrief, ClarifyingQuestion, ParameterBlock } from '@/lib/strategyTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/* ── Cached system prompt ── */
const SYSTEM_PROMPT = `You are AlphaForge's strategy parser for the Indian equity market (NSE).

Your job: parse a user's plain-English investing idea into a structured strategy.

You MUST respond with valid JSON matching exactly this shape:
{
  "needsClarification": boolean,
  "clarifyingQuestions": [...],   // only if needsClarification=true, max 5
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

## Clarifying questions
Only ask if the English is genuinely ambiguous. Max 5 questions. Each question:
{
  "id": "q1",
  "impact": "high" | "medium" | "low",
  "type": "numeric" | "single-select" | "multi-select" | "yes-no" | "date" | "free-text",
  "question": "...",
  "whyAsk": "one sentence explanation",
  "highlightedPhrase": "exact phrase from input that is ambiguous",
  "inputConfig": {
    "quickPicks": [/* for numeric */],
    "options": [{ "value": "...", "label": "..." }]  // for select types
  },
  "defaultValue": ...,
  "defaultLabel": "human-readable default"
}

## Parameters
Always return all 4 parameter blocks with realistic inferred values:
- money_timeline: capital (₹, default 10L), backtest_start (date), backtest_end (required)
- selection: n_picks (number), weighting (select), rebalance_freq (select)
- execution: slippage (%), brokerage (select), order_type (select)
- risk: stop_loss (optional %), position_cap (optional %), sector_cap (optional %)

Tag each field's source: "stated" (user said it), "AI" (inferred), "required" (missing), "default" (product default), "optional" (off by default).

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
        { id: 'backtest_start', label: 'Backtest start', type: 'date',     value: '2020-01-01', source: 'AI',   required: false, confidence: 0.8 },
        { id: 'backtest_end',   label: 'Backtest end',   type: 'date',     value: null,       source: 'required', required: true },
      ],
    },
    {
      id: 'selection',
      group: 'Selection rules',
      fields: [
        { id: 'n_picks',       label: 'Number of picks (N)', type: 'number', value: 20,       source: 'AI',    required: false, confidence: 0.85 },
        { id: 'weighting',     label: 'Weighting',           type: 'select', value: 'equal',  source: 'default', required: false,
          options: [{ value: 'equal', label: 'Equal weight' }, { value: 'marketcap', label: 'Market-cap weight' }, { value: 'score', label: 'Score weight' }] },
        { id: 'rebalance_freq',label: 'Rebalance frequency', type: 'select', value: 'monthly', source: 'AI',   required: false, confidence: 0.9,
          options: [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }] },
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
      id: 'risk',
      group: 'Risk controls',
      fields: [
        { id: 'stop_loss',    label: 'Stop loss per position', type: 'percent', value: null, source: 'optional', required: false, unit: '%' },
        { id: 'position_cap', label: 'Max position size',       type: 'percent', value: null, source: 'optional', required: false, unit: '%' },
        { id: 'sector_cap',   label: 'Max sector exposure',     type: 'percent', value: null, source: 'optional', required: false, unit: '%' },
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

    /* Prompt caching: system prompt is stable → cache it.
       User input is volatile → no cache_control on the user turn.  */
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8096,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },  /* cache the large system prompt */
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Parse this investing strategy for the Indian equity market (NSE):\n\n${input.trim()}`,
        },
      ],
    });

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
