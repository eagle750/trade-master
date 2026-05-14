'use client';

import type { SectorCell } from '@/lib/types';
import styles from './SectorHeatmap.module.css';

interface Props {
  sectors: SectorCell[];
  onSectorClick?: (sector: SectorCell) => void;
  isLoading?: boolean;
}

function heatClass(pct: number): string {
  if (pct > 1.5)  return 'heat-cell--up-strong';
  if (pct > 0.5)  return 'heat-cell--up';
  if (pct >= -0.5) return 'heat-cell--neutral';
  if (pct >= -1.5) return 'heat-cell--down';
  return 'heat-cell--down-strong';
}

export default function SectorHeatmap({ sectors, onSectorClick, isLoading }: Props) {
  return (
    <div className={styles.card + ' card'}>
      <div className={styles.header}>
        <span className="section-label">Sectoral indices</span>
      </div>
      {!isLoading && sectors.length === 0 && (
        <p className={styles.empty}>Sector data unavailable.</p>
      )}
      <div className={styles.grid}>
        {sectors.map((s) =>
          isLoading ? (
            <div key={s.index} className="skeleton" style={{ height: 52, borderRadius: 6 }} />
          ) : (
            <button
              key={s.index}
              className={'heat-cell ' + heatClass(s.changePct) + ' ' + styles.cell}
              onClick={() => onSectorClick?.(s)}
              title={`Filter by ${s.name}`}
            >
              <div className={styles.sectorName}>{s.name}</div>
              <div className={styles.sectorPct + ' num'}>
                {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
              </div>
            </button>
          )
        )}
      </div>
    </div>
  );
}
