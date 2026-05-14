import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { ParsedBrief, ClarifyingQuestion, QuestionAnswer, ParameterBlock } from '@/lib/strategyTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/* Same stable system prompt — will be served from cache after first /parse call */
const SYSTEM_PROMPT = `You are AlphaForge's strategy parser for the Indian equity market (NSE).

You have already asked the user clarifying questions about their strategy. Now, given their original
input AND their answers to those questions, produce the final parsed Brief and Parameters.

Respond with valid JSON:
{
  "brief": {
    "bullets": [
      { "stage": "Universe",     "text": "...", "citations": [] },
      { "stage": "Eligibility",  "text": "...", "citations": [] },
      { "stage": "Screen",       "text": "...", "citations": ["Q1"] },
      { "stage": "Rank",         "text": "...", "citations": ["Q2"] },
      { "stage": "Select",       "text": "...", "citations": ["Q3"] }
    ]
  },
  "confidence": 0.0-1.0,
  "parameters": [
    {
      "id": "money_timeline",
      "group": "Money & timeline",
      "fields": [
        { "id": "capital",        "value": 1000000, "source": "default" },
        { "id": "backtest_start", "value": "2020-01-01", "source": "AI", "confidence": 0.85 },
        { "id": "backtest_end",   "value": null, "source": "required" }
      ]
    },
    {
      "id": "selection",
      "group": "Selection rules",
      "fields": [
        { "id": "n_picks",        "value": 20,       "source": "stated" },
        { "id": "weighting",      "value": "equal",  "source": "default" },
        { "id": "rebalance_freq", "value": "monthly","source": "stated" }
      ]
    },
    {
      "id": "execution",
      "group": "Execution mechanics",
      "fields": [
        { "id": "slippage",   "value": 0.1,            "source": "AI", "confidence": 0.9 },
        { "id": "brokerage",  "value": "zerodha_flat", "source": "default" },
        { "id": "order_type", "value": "market_close", "source": "default" }
      ]
    },
    {
      "id": "risk",
      "group": "Risk controls",
      "fields": [
        { "id": "stop_loss",    "value": null, "source": "optional" },
        { "id": "position_cap", "value": null, "source": "optional" },
        { "id": "sector_cap",   "value": null, "source": "optional" }
      ]
    }
  ]
}

Rules:
- Use citations like ["Q1","Q2"] when a bullet was shaped by an answer to that question.
- Source tags: "stated" (user said it explicitly), "AI" (inferred), "required" (still missing), "default" (product default), "optional" (off by default).
- "stated" takes priority when a user's answer resolves an ambiguity.
- All answers tagged "source: default" mean the user skipped — use the AI default.
- Indian conventions: ₹, lakh/crore, NSE only.

Respond ONLY with the JSON object. No preamble, no markdown fences.`;

function defaultParameters(): ParameterBlock[] {
  return [
    {
      id: 'money_timeline', group: 'Money & timeline',
      fields: [
        { id: 'capital',        label: 'Capital',        type: 'currency', value: 1000000,   source: 'default', required: false, unit: '₹' },
        { id: 'backtest_start', label: 'Backtest start', type: 'date',     value: '2020-01-01', source: 'AI',   required: false, confidence: 0.8 },
        { id: 'backtest_end',   label: 'Backtest end',   type: 'date',     value: null,       source: 'required', required: true },
      ],
    },
    {
      id: 'selection', group: 'Selection rules',
      fields: [
        { id: 'n_picks',       label: 'Number of picks (N)', type: 'number', value: 20,       source: 'AI',    required: false, confidence: 0.85 },
        { id: 'weighting',     label: 'Weighting',           type: 'select', value: 'equal',  source: 'default', required: false,
          options: [{ value: 'equal', label: 'Equal weight' }, { value: 'marketcap', label: 'Market-cap weight' }, { value: 'score', label: 'Score weight' }] },
        { id: 'rebalance_freq',label: 'Rebalance frequency', type: 'select', value: 'monthly', source: 'AI',   required: false, confidence: 0.9,
          options: [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }] },
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
      id: 'risk', group: 'Risk controls',
      fields: [
        { id: 'stop_loss',    label: 'Stop loss per position', type: 'percent', value: null, source: 'optional', required: false, unit: '%' },
        { id: 'position_cap', label: 'Max position size',       type: 'percent', value: null, source: 'optional', required: false, unit: '%' },
        { id: 'sector_cap',   label: 'Max sector exposure',     type: 'percent', value: null, source: 'optional', required: false, unit: '%' },
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

    /* Prompt caching: stable system prompt cached; dynamic content (input + answers) uncached */
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8096,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
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
