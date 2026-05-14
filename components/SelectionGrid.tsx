import type { SelectionStock } from '@/lib/screener';
import styles from './SelectionGrid.module.css';

interface Props { stocks: SelectionStock[] }

function capLabel(c: SelectionStock['cap']) {
  return { mega: 'Mega cap', large: 'Large cap', mid: 'Mid cap', small: 'Small cap' }[c];
}

export default function SelectionGrid({ stocks }: Props) {
  return (
    <div className={styles.wrap}>
      <div className={styles.grid}>
        {stocks.map((s) => (
          <div
            key={s.symbol}
            className={styles.card}
            onClick={() => window.open(`/stock/${s.symbol}`, '_blank')}
            role="button"
            tabIndex={0}
          >
            <div className={styles.rank}>#{s.rank}</div>
            <div className={styles.symbol}>{s.symbol}</div>
            <div className={styles.name}>{s.name}</div>
            <div className={styles.metric + ' num'}>
              <span className={styles.metricLabel}>{s.headlineMetric.label}:</span>{' '}
              <span className={
                s.headlineMetric.value.startsWith('+') ? styles.positive
                : s.headlineMetric.value.startsWith('-') ? styles.negative
                : ''
              }>
                {s.headlineMetric.value}
              </span>
            </div>
            <div className={styles.meta}>
              {s.sector} · {capLabel(s.cap)}
            </div>
            <div className={styles.weight + ' num'}>
              Weight {(s.weight * 100).toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
