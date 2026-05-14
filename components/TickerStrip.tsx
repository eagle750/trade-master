'use client';

import type { TickerCell } from '@/lib/types';
import { formatIndex, formatPct } from '@/lib/format';
import styles from './TickerStrip.module.css';

interface Props {
  indices: TickerCell[];
  isLoading?: boolean;
}

function TickerCellView({ cell, isLoading }: { cell: TickerCell; isLoading?: boolean }) {
  const { text: pctText, dir } = formatPct(cell.changePct);
  const changeClass = dir === 'up' ? styles.up : dir === 'down' ? styles.down : styles.flat;

  if (isLoading) {
    return (
      <div className={styles.cell}>
        <div className="skeleton" style={{ height: 10, width: 60, marginBottom: 4 }} />
        <div className="skeleton" style={{ height: 16, width: 80, marginBottom: 4 }} />
        <div className="skeleton" style={{ height: 10, width: 50 }} />
      </div>
    );
  }

  return (
    <div className={styles.cell} role="button" tabIndex={0}>
      <div className={styles.name}>{cell.name}</div>
      <div className={styles.value + ' num'}>
        {cell.value === 0 ? '—' : formatIndex(cell.value)}
      </div>
      <div className={styles.change + ' num ' + changeClass}>
        {cell.change === 0 ? '—' : pctText}
      </div>
    </div>
  );
}

export default function TickerStrip({ indices, isLoading }: Props) {
  return (
    <div className={styles.strip}>
      <div className={styles.inner + ' page-container'}>
        {indices.map((cell) => (
          <TickerCellView key={cell.symbol ?? cell.name} cell={cell} isLoading={isLoading} />
        ))}
      </div>
    </div>
  );
}
