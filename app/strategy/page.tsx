'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { IconArchive, IconArrowsLeftRight, IconArrowRight, IconAlertTriangle } from '@tabler/icons-react';
import GlobalNav from '@/components/GlobalNav';
import StepIndicator from '@/components/StepIndicator';
import EnglishInputCard from '@/components/EnglishInputCard';
import BriefCard from '@/components/BriefCard';
import ParametersGrid from '@/components/ParametersGrid';
import ClarifyingQuestions from '@/components/ClarifyingQuestions';
import DisclaimerFooter from '@/components/DisclaimerFooter';
import type { ParseStage, ParsedBrief, ParameterBlock, QuestionAnswer, ClarifyingQuestion } from '@/lib/strategyTypes';
import { getMarketStatus } from '@/lib/marketStatus';
import styles from './page.module.css';

function toStep(stage: ParseStage): 1 | 2 | 3 {
  if (stage === 'empty' || stage === 'drafting' || stage === 'parsing') return 1;
  if (stage === 'clarifying') return 2;
  return 3;
}

function findMissingFields(blocks: ParameterBlock[]): string[] {
  return blocks
    .flatMap((b) => b.fields)
    .filter((f) => f.required && (f.value === null || f.value === undefined || f.value === ''))
    .map((f) => f.id);
}

export default function StrategyLabPage() {
  const router = useRouter();

  const [inputText, setInputText]         = useState('');
  const [stage, setStage]                 = useState<ParseStage>('empty');
  const [brief, setBrief]                 = useState<ParsedBrief | null>(null);
  const [paramBlocks, setParamBlocks]     = useState<ParameterBlock[]>([]);
  const [parseError, setParseError]       = useState<string | null>(null);
  const [clarifyQs, setClarifyQs]         = useState<ClarifyingQuestion[]>([]);
  const [sourceFile, setSourceFile]       = useState<string | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleInputChange = (text: string) => {
    setInputText(text);
    setStage(text.trim().length > 0 ? 'drafting' : 'empty');
    if (brief) { setBrief(null); setParseError(null); }
    clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      /* TODO: POST /api/strategy/draft */
    }, 5000);
  };

  const handleParse = useCallback(async () => {
    setStage('parsing');
    setParseError(null);
    try {
      const res = await fetch('/api/strategy/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputText }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (json.clarifyingQuestions?.length > 0) {
        setClarifyQs(json.clarifyingQuestions);
        setStage('clarifying');
      } else {
        setBrief(json.brief);
        setParamBlocks(json.brief.parameters);
        setStage('brief-ready');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setParseError(msg.includes('401') || msg.includes('auth')
        ? 'Invalid or expired API key — update ANTHROPIC_API_KEY in .env.local and restart the server.'
        : `Parse failed: ${msg}`);
      setStage('drafting');
    }
  }, [inputText]);

  const handleQSubmit = useCallback(async (answers: QuestionAnswer[]) => {
    try {
      const res = await fetch('/api/strategy/parse/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputText, questions: clarifyQs, answers }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setBrief(json.brief);
      setParamBlocks(json.brief.parameters);
      setStage('brief-ready');
    } catch {
      setParseError('Failed to process answers. Please try again.');
      setStage('drafting');
    }
  }, [inputText, clarifyQs]);

  const handleParamChange = useCallback(
    (blockId: string, fieldId: string, value: unknown) => {
      setParamBlocks((prev) =>
        prev.map((b) =>
          b.id !== blockId ? b : {
            ...b,
            fields: b.fields.map((f) => f.id !== fieldId ? f : { ...f, value }),
          }
        )
      );
    },
    []
  );

  const missingFields = findMissingFields(paramBlocks);
  const canRun        = stage === 'brief-ready' && missingFields.length === 0;

  const handleRun = () => {
    if (!canRun) return;
    setStage('running');
    const allFields = paramBlocks.flatMap((b) => b.fields);
    const fv = (id: string) => allFields.find(f => f.id === id)?.value;
    const numOrUndef = (v: unknown) => (v == null || v === '') ? undefined : Number(v);

    sessionStorage.setItem('af_run_params', JSON.stringify({
      nPicks:         numOrUndef(fv('n_picks')),
      universe:       fv('universe') != null ? String(fv('universe')) : undefined,
      momentumMonths: numOrUndef(fv('momentum_months')),
      rankBy:         fv('rank_by') != null ? String(fv('rank_by')) : undefined,
      minLtp:         numOrUndef(fv('min_ltp')),
      minMcapCr:      numOrUndef(fv('min_mcap_cr')),
      /* screen filters — only included if the strategy set them */
      maxPE:          numOrUndef(fv('max_pe')),
      minROE:         fv('min_roe') != null && fv('min_roe') !== '' ? Number(fv('min_roe')) / 100 : undefined,
      maxDE:          numOrUndef(fv('max_de')),
      minROA:         fv('min_roa') != null && fv('min_roa') !== '' ? Number(fv('min_roa')) / 100 : undefined,
      maxPB:          numOrUndef(fv('max_pb')),
      minRevGrowth:   fv('min_rev_growth') != null && fv('min_rev_growth') !== '' ? Number(fv('min_rev_growth')) / 100 : undefined,
      emaFilter:      fv('ema_filter') != null ? String(fv('ema_filter')) : undefined,
      emaShort:       numOrUndef(fv('ema_short')),
      emaMedium:      numOrUndef(fv('ema_medium')),
      emaLong:        numOrUndef(fv('ema_long')),
      runCapital:     numOrUndef(fv('run_capital')),
      stopLossPct:    fv('stop_loss') != null && fv('stop_loss') !== '' ? Number(fv('stop_loss')) : undefined,
      targetPct:      fv('target_pct') != null && fv('target_pct') !== '' ? Number(fv('target_pct')) : undefined,
      maxHoldingDays: numOrUndef(fv('max_holding_days')),
      strategyIdea:   inputText.slice(0, 600),
      sourceFile:     sourceFile ?? undefined,
      briefBullets:   brief?.bullets ?? [],
      confidence:     brief?.confidenceLabel ?? '',
      parsedAt:       new Date().toISOString(),
    }));
    router.push('/strategy/funnel');
  };

  const activeStep = toStep(stage);

  return (
    <div className={styles.page}>
      <GlobalNav marketStatus={getMarketStatus().status} marketStatusTime={new Date().toISOString()} marketStatusReason={getMarketStatus().reason} />

      <div className={'page-container ' + styles.inner}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Strategy lab</h1>
            <p className={styles.pageSub}>
              Describe an idea in plain English — the AI turns it into a verifiable, backtestable strategy.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button className="btn btn--secondary btn--sm">
              <IconArchive size={14} />
              Saved strategies
            </button>
            <button className="btn btn--secondary btn--sm">
              <IconArrowsLeftRight size={14} />
              Compare strategies
            </button>
          </div>
        </div>

        {/* Step indicator */}
        <div className={styles.stepRow}>
          <StepIndicator active={activeStep} />
        </div>

        {/* API error banner */}
        {parseError && (
          <div className="banner banner--caution" style={{ marginBottom: 10 }}>
            <IconAlertTriangle size={14} />
            {parseError}
          </div>
        )}

        {/* Content */}
        {stage === 'clarifying' ? (
          <div className={styles.content}>
            <ClarifyingQuestions
              questions={clarifyQs}
              onSubmit={handleQSubmit}
            />
          </div>
        ) : (
          <div className={styles.content}>
            <EnglishInputCard
              value={inputText}
              onChange={handleInputChange}
              onParse={handleParse}
              isParsing={stage === 'parsing'}
              isLocked={stage === 'brief-ready'}
              onFileName={setSourceFile}
            />

            {brief && stage === 'brief-ready' && (
              <div className={styles.parsedSection}>
                <div className={styles.reParseBar}>
                  <span className={styles.reParseText}>
                    Strategy parsed. Editing the input will require a re-parse.
                  </span>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => { setBrief(null); setStage('drafting'); }}
                  >
                    Edit input
                  </button>
                </div>

                <BriefCard
                  brief={brief}
                  onBriefChange={(updated) => setBrief(updated)}
                />

                <ParametersGrid
                  blocks={paramBlocks}
                  onChange={handleParamChange}
                  missingFields={missingFields}
                />

                <div className={styles.actionBar}>
                  {missingFields.length > 0 && (
                    <span className={styles.gateNote}>
                      Fill required fields above to enable Run.
                    </span>
                  )}
                  <span className={styles.spacer} />
                  <button
                    className={'btn btn--primary btn--lg ' + styles.runBtn}
                    disabled={!canRun}
                    onClick={handleRun}
                  >
                    Confirm and run
                    <IconArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <DisclaimerFooter />
    </div>
  );
}
