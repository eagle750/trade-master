'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { IconArchive, IconArrowsLeftRight, IconArrowRight, IconAlertTriangle, IconPlayerPlay } from '@tabler/icons-react';
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
    } catch {
      setParseError('Parse service not available. Connect the AI API endpoint to enable strategy parsing.');
      setStage('drafting');
    }
  }, [inputText]);

  const handleQSubmit = useCallback(async (answers: QuestionAnswer[]) => {
    try {
      const res = await fetch('/api/strategy/parse/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputText, answers }),
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
  }, [inputText]);

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
    /* Persist run parameters for the funnel page */
    const nField = paramBlocks.flatMap((b) => b.fields).find((f) => f.id === 'n_picks');
    sessionStorage.setItem('af_run_params', JSON.stringify({
      nPicks: Number(nField?.value ?? 20),
    }));
    router.push('/strategy/funnel');
  };

  const activeStep = toStep(stage);

  return (
    <div className={styles.page}>
      <GlobalNav marketStatus={getMarketStatus().status} marketStatusTime={new Date().toISOString()} />

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
            {/* Direct shortcut — works without LLM parse */}
            <button
              className="btn btn--primary btn--sm"
              onClick={() => {
                sessionStorage.setItem('af_run_params', JSON.stringify({ nPicks: 20 }));
                router.push('/strategy/funnel');
              }}
            >
              <IconPlayerPlay size={13} />
              Run screener
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
