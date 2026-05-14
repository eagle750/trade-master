import { IconBookmarkPlus, IconBell, IconShare } from '@tabler/icons-react';
import { formatPrice, formatPct } from '@/lib/format';
import type { StockOverviewData } from '@/app/api/stock/[symbol]/route';
import styles from './StockHeader.module.css';

interface Props { data: StockOverviewData; isLoading?: boolean }

export default function StockHeader({ data, isLoading }: Props) {
  const initials = data.symbol.slice(0, 2);
  const { text, dir } = formatPct(data.dayChangePct);

  return (
    <div className={styles.header}>
      <div className={styles.left}>
        <div className={styles.avatar}>{initials}</div>
        <div>
          <div className={styles.symbolRow}>
            <span className={styles.symbol}>{data.symbol}</span>
            <span className="pill pill--neutral" style={{ fontSize: 10 }}>{data.sector}</span>
            <span className="pill pill--neutral" style={{ fontSize: 10 }}>NSE</span>
            {data.marketStatus === 'open' && (
              <span className={styles.livePill}>
                <span className="pulse pulse--up" style={{ width: 5, height: 5 }} />
                LIVE
              </span>
            )}
          </div>
          <div className={styles.name}>{isLoading ? '—' : data.name}</div>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.priceBlock}>
          {isLoading ? (
            <div className="skeleton" style={{ height: 22, width: 120 }} />
          ) : (
            <>
              <div className={styles.ltp + ' num'}>{formatPrice(data.ltp)}</div>
              <div className={styles.change + ' num ' + (dir === 'up' ? styles.up : dir === 'down' ? styles.down : '')}>
                {dir === 'up' ? '▲' : dir === 'down' ? '▼' : ''} {Math.abs(data.dayChange).toFixed(2)} ({text.replace('▲ ', '').replace('▼ ', '')}) · today
              </div>
            </>
          )}
        </div>

        <div className={styles.actions}>
          <button className="btn btn--secondary btn--sm">
            <IconBookmarkPlus size={14} /> Watchlist
          </button>
          <button className="btn btn--secondary btn--sm" aria-label="Set alert">
            <IconBell size={14} />
          </button>
          <button className="btn btn--secondary btn--sm" aria-label="Share">
            <IconShare size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
