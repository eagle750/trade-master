'use client';

import { IconCheck, IconEye, IconLoader2 } from '@tabler/icons-react';
import type { FunnelStage } from '@/lib/screener';
import styles from './FunnelStageCard.module.css';

interface Props {
  stage:        FunnelStage;
  universeCount: number;
  isActive:     boolean;
  isVerified?:  boolean;
  isRunning?:   boolean;
  onClick:      () => void;
}

export default function FunnelStageCard({ stage, universeCount, isActive, isVerified, isRunning, onClick }: Props) {
  const effectiveStatus = isVerified ? 'verified' : stage.status;
  const survivalPct = universeCount > 0 ? (stage.count / universeCount) * 100 : 0;

  return (
    <div
      className={styles.card + (isActive ? ' ' + styles.active : '')}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      {/* Proportional survival bar */}
      <div className={styles.barTrack}>
        <div
          className={styles.barFill}
          style={{ width: `${Math.max(survivalPct, 2)}%` }}
        />
      </div>

      {/* Stage label */}
      <div className={styles.stageLabel + ' section-label'}>
        Stage {stage.index}
      </div>
      <div className={styles.stageName}>{stage.name}</div>

      {/* Count */}
      {isRunning ? (
        <div className={styles.running}>
          <IconLoader2 size={14} className={styles.spin} />
        </div>
      ) : (
        <div className={styles.count + ' num'}>{stage.count.toLocaleString('en-IN')}</div>
      )}

      {/* Delta */}
      {!isRunning && stage.delta !== 0 && (
        <div className={styles.delta + ' num'}>
          {stage.delta > 0 ? '+' : ''}{stage.delta.toLocaleString('en-IN')} vs prev
        </div>
      )}

      {/* Status */}
      {!isRunning && (
        <div className={styles.status}>
          {effectiveStatus === 'verified' && (
            <span className={styles.statusVerified}>
              <IconCheck size={11} /> verified
            </span>
          )}
          {effectiveStatus === 'inspecting' && (
            <span className={styles.statusInspecting}>
              <IconEye size={11} /> inspecting
            </span>
          )}
          {effectiveStatus === 'pending' && (
            <span className={styles.statusPending}>pending</span>
          )}
        </div>
      )}
    </div>
  );
}
