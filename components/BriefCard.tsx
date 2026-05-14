'use client';

import { useState } from 'react';
import { IconPencil, IconCheck } from '@tabler/icons-react';
import type { ParsedBrief, BriefBullet } from '@/lib/strategyTypes';
import styles from './BriefCard.module.css';

interface Props {
  brief: ParsedBrief;
  onBriefChange?: (updated: ParsedBrief) => void;
}

function confidencePillClass(label: ParsedBrief['confidenceLabel']): string {
  if (label === 'High')            return 'pill--up';
  if (label === 'Medium')          return 'pill--caution';
  if (label === 'Low')             return 'pill--down';
  return 'pill--neutral'; /* Manually edited */
}

function BulletRow({
  bullet,
  editing,
  onEdit,
}: {
  bullet: BriefBullet;
  editing: boolean;
  onEdit: (text: string) => void;
}) {
  return (
    <li className={styles.bullet}>
      <span className={styles.stageLabel}>{bullet.stage}:</span>
      {editing ? (
        <textarea
          className={'input ' + styles.editInput}
          defaultValue={bullet.text}
          rows={2}
          onChange={(e) => onEdit(e.target.value)}
          autoFocus
        />
      ) : (
        <span className={styles.bulletText}>
          {bullet.text}
          {bullet.citations?.map((c) => (
            <span key={c} className={styles.citation + ' param-tag param-tag--ai'}>{c}</span>
          ))}
        </span>
      )}
    </li>
  );
}

export default function BriefCard({ brief, onBriefChange }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [localBullets, setLocalBullets] = useState<BriefBullet[]>(brief.bullets);
  const [localBrief, setLocalBrief]     = useState(brief);

  const handleSaveEdit = () => {
    const updated: ParsedBrief = {
      ...localBrief,
      bullets: localBullets,
      confidenceLabel: 'Manually edited',
    };
    setLocalBrief(updated);
    setEditMode(false);
    onBriefChange?.(updated);
  };

  const updateBullet = (idx: number, text: string) => {
    setLocalBullets((prev) => prev.map((b, i) => i === idx ? { ...b, text } : b));
  };

  const pctStr = Math.round(localBrief.confidence * 100);

  return (
    <div className={'card card--brand ' + styles.card}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.title}>Brief</span>
        <span className="param-tag param-tag--ai" style={{ marginLeft: 6 }}>AI parsed</span>
        <span
          className={'pill ' + confidencePillClass(localBrief.confidenceLabel)}
          style={{ marginLeft: 4 }}
        >
          {localBrief.confidenceLabel === 'Manually edited'
            ? 'Manually edited'
            : `${localBrief.confidenceLabel} confidence · ${pctStr}%`}
        </span>

        <div className={styles.actions}>
          {editMode ? (
            <button className="btn btn--primary btn--sm" onClick={handleSaveEdit}>
              <IconCheck size={13} /> Save
            </button>
          ) : (
            <button className="btn btn--secondary btn--sm" onClick={() => setEditMode(true)}>
              <IconPencil size={13} /> Edit brief
            </button>
          )}
        </div>
      </div>

      {/* 5 bullets */}
      <ol className={styles.list}>
        {localBullets.map((bullet, idx) => (
          <BulletRow
            key={bullet.stage}
            bullet={bullet}
            editing={editMode}
            onEdit={(text) => updateBullet(idx, text)}
          />
        ))}
      </ol>

      {localBrief.confidenceLabel === 'Low' && (
        <div className="banner banner--caution" style={{ marginTop: 10 }}>
          Low parse confidence — please review carefully or edit.
        </div>
      )}
    </div>
  );
}
