import type { FlowCell } from '@/lib/types';
import { formatDate } from '@/lib/format';
import styles from './FIIDIIFlows.module.css';

interface Props {
  fii: FlowCell | null;
  dii: FlowCell | null;
  isLoading?: boolean;
}

function FlowTile({ flow }: { flow: FlowCell }) {
  const isPositive = flow.netCr >= 0;
  const formatted = `₹${Math.abs(flow.netCr).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
  const label = flow.type === 'fii' ? 'FII · Cash' : 'DII · Cash';

  return (
    <div className={styles.tile}>
      <div className={styles.tileLabel + ' section-label'}>{label}</div>
      <div className={styles.tileAmount + ' num ' + (isPositive ? styles.positive : styles.negative)}>
        {isPositive ? '+' : '−'}{formatted}
      </div>
      <div className={styles.tileSubtext}>
        Net {isPositive ? 'buyer' : 'seller'} · {formatDate(flow.asOf)}
      </div>
    </div>
  );
}

function EmptyTile({ label }: { label: string }) {
  return (
    <div className={styles.tile}>
      <div className={styles.tileLabel + ' section-label'}>{label}</div>
      <div className={styles.tileAmount + ' ' + styles.empty}>—</div>
      <div className={styles.tileSubtext}>Data unavailable</div>
    </div>
  );
}

export default function FIIDIIFlows({ fii, dii, isLoading }: Props) {
  return (
    <div className={styles.card + ' card'}>
      <div className={styles.header}>
        <span className="section-label">Institutional flows</span>
        <span className={styles.note}>Previous trading day · Cash segment</span>
      </div>
      <div className={styles.grid}>
        {isLoading ? (
          <>
            <div className="skeleton" style={{ height: 52 }} />
            <div className="skeleton" style={{ height: 52 }} />
          </>
        ) : (
          <>
            {fii ? <FlowTile flow={fii} /> : <EmptyTile label="FII · Cash" />}
            {dii ? <FlowTile flow={dii} /> : <EmptyTile label="DII · Cash" />}
          </>
        )}
      </div>
    </div>
  );
}
