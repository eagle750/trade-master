'use client';

import { useState } from 'react';
import { IconCheck, IconLoader2 } from '@tabler/icons-react';
import type { ClarifyingQuestion, QuestionAnswer } from '@/lib/strategyTypes';
import styles from './ClarifyingQuestions.module.css';

interface Props {
  questions: ClarifyingQuestion[];
  onSubmit: (answers: QuestionAnswer[]) => void;
}

function impactClass(impact: ClarifyingQuestion['impact']): string {
  if (impact === 'high')   return 'pill--down';
  if (impact === 'medium') return 'pill--caution';
  return 'pill--neutral';
}

function QuestionInput({
  q,
  answer,
  onAnswer,
}: {
  q: ClarifyingQuestion;
  answer: QuestionAnswer | undefined;
  onAnswer: (val: unknown, source: 'user' | 'default') => void;
}) {
  const [customVal, setCustomVal] = useState('');

  if (q.type === 'numeric') {
    return (
      <div className={styles.chipRow}>
        {q.inputConfig.quickPicks?.map((pick) => (
          <button
            key={String(pick)}
            className={'chip' + (answer?.value === pick && answer?.source === 'user' ? ' chip--selected' : '')}
            onClick={() => onAnswer(pick, 'user')}
          >
            {pick} months
          </button>
        ))}
        <input
          type="number"
          className={'input ' + styles.customInput}
          placeholder="Custom"
          value={customVal}
          onChange={(e) => {
            setCustomVal(e.target.value);
            if (e.target.value) onAnswer(Number(e.target.value), 'user');
          }}
        />
      </div>
    );
  }

  if (q.type === 'single-select' || q.type === 'yes-no') {
    return (
      <div className={styles.chipRow}>
        {q.inputConfig.options?.map((opt) => (
          <button
            key={String(opt.value)}
            className={'chip' + (answer?.value === opt.value && answer?.source === 'user' ? ' chip--selected' : '')}
            onClick={() => onAnswer(opt.value, 'user')}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  if (q.type === 'multi-select') {
    const selected: unknown[] = Array.isArray(answer?.value) ? (answer!.value as unknown[]) : [];
    return (
      <div className={styles.chipRow}>
        {q.inputConfig.options?.map((opt) => {
          const isSelected = selected.includes(opt.value);
          return (
            <button
              key={String(opt.value)}
              className={'chip' + (isSelected ? ' chip--selected' : '')}
              onClick={() => {
                const next = isSelected
                  ? selected.filter((v) => v !== opt.value)
                  : [...selected, opt.value];
                onAnswer(next, 'user');
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <input
      type="text"
      className="input"
      placeholder="Your answer…"
      value={answer?.value != null ? String(answer.value) : ''}
      onChange={(e) => onAnswer(e.target.value, 'user')}
    />
  );
}

export default function ClarifyingQuestions({ questions, onSubmit }: Props) {
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>({});
  const [submitting, setSubmitting] = useState(false);

  const answeredCount = Object.values(answers).filter(
    (a) => a.value !== null
  ).length;

  const pendingCount = questions.length - answeredCount;

  const setAnswer = (qId: string, value: unknown, source: 'user' | 'default') => {
    setAnswers((prev) => ({ ...prev, [qId]: { questionId: qId, value, source } }));
  };

  const useAllDefaults = () => {
    const defaults: Record<string, QuestionAnswer> = {};
    questions.forEach((q) => {
      defaults[q.id] = { questionId: q.id, value: q.defaultValue, source: 'default' };
    });
    setAnswers(defaults);
  };

  const handleSubmit = () => {
    setSubmitting(true);
    const allAnswers = questions.map((q) =>
      answers[q.id] ?? { questionId: q.id, value: q.defaultValue, source: 'default' as const }
    );
    setTimeout(() => onSubmit(allAnswers), 1200);
  };

  return (
    <div className={styles.wrap}>
      {/* Parsing progress strip */}
      <div className={styles.progressStrip + ' card card--brand'}>
        <span className={styles.progressLabel}>
          Parsing your strategy · <strong>{answeredCount} of {questions.length}</strong> answered
        </span>
        <div className={'progress ' + styles.progressBar}>
          <div
            className="progress__fill"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Escape banner */}
      <div className={'banner banner--info ' + styles.escapeBanner}>
        <span>In a hurry?</span>
        <button className="btn btn--link btn--sm" onClick={useAllDefaults}>
          Use AI defaults for all unanswered
        </button>
      </div>

      {/* Question cards */}
      <div className={styles.stack}>
        {questions.map((q) => {
          const answered = answers[q.id];
          const isAnswered = answered !== undefined;

          return (
            <div
              key={q.id}
              className={'card ' + styles.questionCard + (isAnswered ? ' ' + styles.answered : '')}
            >
              {/* Card header */}
              <div className={styles.qHeader}>
                <span className={styles.qNum}>Question {q.id.toUpperCase()}</span>
                <span className={'pill ' + impactClass(q.impact)}>
                  {q.impact.toUpperCase()} IMPACT
                </span>
                <span className="pill pill--neutral">{q.type.replace('-', ' ')}</span>
                {isAnswered && (
                  <span className={styles.checkIcon}>
                    <IconCheck size={13} />
                  </span>
                )}
              </div>

              {/* Question text */}
              <p className={styles.questionText}>{q.question}</p>

              {/* Why we ask */}
              <p className={styles.whyAsk}>
                <span className={styles.whyLabel}>Why we ask: </span>
                {q.whyAsk.split(q.highlightedPhrase).map((part, i, arr) => (
                  <span key={i}>
                    {part}
                    {i < arr.length - 1 && (
                      <mark className={styles.highlight}>{q.highlightedPhrase}</mark>
                    )}
                  </span>
                ))}
              </p>

              {/* Input */}
              <QuestionInput
                q={q}
                answer={answers[q.id]}
                onAnswer={(val, src) => setAnswer(q.id, val, src)}
              />

              {/* Skip link */}
              <button
                className={'btn btn--link btn--xs ' + styles.skipLink}
                onClick={() => setAnswer(q.id, q.defaultValue, 'default')}
              >
                Skip — use AI default of {q.defaultLabel}
              </button>
            </div>
          );
        })}
      </div>

      {/* Sticky bottom bar */}
      <div className={styles.stickyBar}>
        <span className={styles.pendingNote}>
          {pendingCount > 0
            ? `${pendingCount} still pending. Submit and AI uses defaults for unanswered.`
            : 'All questions answered. Ready to parse.'}
        </span>
        <button
          className="btn btn--primary btn--md"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <><IconLoader2 size={14} className={styles.spin} /> Parsing…</>
          ) : (
            'Submit and parse'
          )}
        </button>
      </div>
    </div>
  );
}
