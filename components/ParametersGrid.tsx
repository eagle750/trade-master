'use client';

import { IconAlertTriangle } from '@tabler/icons-react';
import type { ParameterBlock, ParameterField, ParameterSource } from '@/lib/strategyTypes';
import { formatDate } from '@/lib/format';
import styles from './ParametersGrid.module.css';

interface Props {
  blocks: ParameterBlock[];
  onChange: (blockId: string, fieldId: string, value: unknown) => void;
  missingFields: string[];
}

function SourceTag({ source, confidence }: { source: ParameterSource; confidence?: number }) {
  const cls = `param-tag param-tag--${source}`;
  let label: string = source;
  if (source === 'AI' && confidence != null && confidence < 0.95) {
    label = `AI · ${Math.round(confidence * 100)}%`;
  } else if (source === 'AI') {
    label = 'AI';
  }
  const icon = source === 'required' ? ' ⚠' : '';
  return <span className={cls}>{label}{icon}</span>;
}

function FieldControl({
  field,
  onChange,
}: {
  field: ParameterField;
  onChange: (v: unknown) => void;
}) {
  const baseClass = 'input ' + styles.fieldInput;

  if (field.type === 'select') {
    return (
      <select
        className={'select ' + styles.fieldInput}
        value={String(field.value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      >
        {!field.value && <option value="">Select…</option>}
        {field.options?.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    );
  }

  if (field.type === 'date') {
    const displayVal = field.value ? String(field.value) : '';
    return (
      <input
        type="date"
        className={baseClass}
        value={displayVal}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (field.type === 'currency') {
    const numVal = field.value != null ? Number(field.value) : '';
    return (
      <div className={styles.currencyWrap}>
        <span className={styles.currencyPrefix}>₹</span>
        <input
          type="number"
          className={baseClass + ' ' + styles.currencyInput}
          value={numVal}
          min={0}
          step={100000}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    );
  }

  if (field.type === 'percent' || field.type === 'number') {
    return (
      <div className={styles.unitWrap}>
        <input
          type="number"
          className={baseClass}
          value={field.value != null ? String(field.value) : ''}
          placeholder={field.source === 'optional' ? 'Off' : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
        {field.unit && <span className={styles.unit}>{field.unit}</span>}
      </div>
    );
  }

  if (field.type === 'toggle') {
    return (
      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={Boolean(field.value)}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: 'var(--brand)' }}
        />
        <span className={styles.toggleLabel}>{field.value ? 'On' : 'Off'}</span>
      </label>
    );
  }

  return (
    <input
      type="text"
      className={baseClass}
      value={String(field.value ?? '')}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function ParamBox({
  block,
  onChange,
  missingFields,
}: {
  block: ParameterBlock;
  onChange: (fieldId: string, value: unknown) => void;
  missingFields: string[];
}) {
  return (
    <div className={styles.box}>
      <div className={styles.boxHeader + ' section-label'}>{block.group}</div>
      <div className={styles.fields}>
        {block.fields.map((field) => {
          const isMissing = missingFields.includes(field.id);
          return (
            <div
              key={field.id}
              className={styles.field + (isMissing ? ' ' + styles.fieldMissing : '')}
              id={`param-${field.id}`}
            >
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>{field.label}</label>
                <SourceTag source={field.source} confidence={field.confidence} />
              </div>
              <FieldControl field={field} onChange={(v) => onChange(field.id, v)} />
              {field.helpText && (
                <span className={styles.helpText}>{field.helpText}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ParametersGrid({ blocks, onChange, missingFields }: Props) {
  return (
    <div className={'card ' + styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>Parameters</span>
      </div>

      {missingFields.length > 0 && (
        <div className={'banner banner--caution ' + styles.warningBanner}>
          <IconAlertTriangle size={14} />
          <span>
            {missingFields.length} required field{missingFields.length > 1 ? 's' : ''} missing:{' '}
            {missingFields.map((id, i) => (
              <button
                key={id}
                className="btn btn--link btn--xs"
                onClick={() => document.getElementById(`param-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              >
                {blocks.flatMap((b) => b.fields).find((f) => f.id === id)?.label ?? id}
                {i < missingFields.length - 1 ? ',' : ''}
              </button>
            ))}
          </span>
        </div>
      )}

      <div className={styles.grid}>
        {blocks.map((block) => (
          <ParamBox
            key={block.id}
            block={block}
            onChange={(fieldId, value) => onChange(block.id, fieldId, value)}
            missingFields={missingFields}
          />
        ))}
      </div>
    </div>
  );
}
