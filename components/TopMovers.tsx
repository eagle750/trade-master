import type { Mover } from '@/lib/types';
import { formatPrice, formatPct } from '@/lib/format';
import styles from './TopMovers.module.css';

interface Props {
  gainers: Mover[];
  losers: Mover[];
  isLoading?: boolean;
}

function MoverRow({ m }: { m: Mover }) {
  const { text, dir } = formatPct(m.changePct);
  return (
    <div className={styles.row}>
      <div className={styles.info}>
        <span className={styles.symbol}>{m.symbol}</span>
        <span className={styles.name}>{m.name}</span>
      </div>
      <div className={styles.price}>
        {m.circuit ? (
          <span className={'pill ' + (m.circuit === 'UC' ? 'pill--up' : 'pill--down')} style={{ marginRight: 6 }}>
            {m.circuit}
          </span>
        ) : null}
        <span className={styles.ltp + ' num'}>{formatPrice(m.ltp)}</span>
        <span className={styles.change + ' num ' + (dir === 'up' ? styles.up : styles.down)}>
          {text}
        </span>
      </div>
    </div>
  );
}

export default function TopMovers({ gainers, losers, isLoading }: Props) {
  return (
    <div className={styles.twoCol}>
      {(['gainers', 'losers'] as const).map((kind) => {
        const rows = kind === 'gainers' ? gainers : losers;
        const label = kind === 'gainers' ? 'Top gainers' : 'Top losers';
        return (
          <div key={kind} className={styles.card + ' card'}>
            <div className={styles.header}>
              <span className="section-label">{label}</span>
            </div>
            <div className={styles.rows}>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={styles.skeletonRow}>
                      <div className="skeleton" style={{ height: 12, width: '60%' }} />
                      <div className="skeleton" style={{ height: 12, width: '25%' }} />
                    </div>
                  ))
                : rows.map((m) => <MoverRow key={m.symbol} m={m} />)
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}
