import type { NewsItem, Sentiment } from '@/lib/types';
import { formatRelative } from '@/lib/format';
import styles from './NewsRail.module.css';

interface Props {
  items: NewsItem[];
  isLoading?: boolean;
}

function sentimentClass(s: Sentiment): string {
  if (s === 'positive') return 'pill--up';
  if (s === 'negative') return 'pill--down';
  return 'pill--neutral';
}

function NewsItemView({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.item}
    >
      <div className={styles.topRow}>
        {item.sentiment && (
          <span className={'pill ' + sentimentClass(item.sentiment)}>
            {item.sentiment}
          </span>
        )}
        <span className={styles.category + ' pill pill--outline'}>{item.category}</span>
        {item.ticker && (
          <span className={styles.ticker}>{item.ticker}</span>
        )}
      </div>
      <div className={styles.headline + ' truncate-2'}>{item.headline}</div>
      <div className={styles.meta}>
        <span>{item.source}</span>
        <span className={styles.dot}>·</span>
        <span className="num">{formatRelative(item.publishedAt)}</span>
      </div>
    </a>
  );
}

export default function NewsRail({ items, isLoading }: Props) {
  return (
    <div className={styles.card + ' card'}>
      <div className={styles.header}>
        <span className="section-label">News</span>
      </div>

      <div className={styles.list}>
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.skeletonItem}>
                <div className="skeleton" style={{ height: 10, width: '40%', marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 13, width: '95%', marginBottom: 4 }} />
                <div className="skeleton" style={{ height: 13, width: '80%', marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 10, width: '35%' }} />
              </div>
            ))
          : items.length === 0
          ? <p className={styles.empty}>Quiet day. No major news.</p>
          : items.map((item) => <NewsItemView key={item.id} item={item} />)
        }
      </div>

      <a href="#" className={styles.viewAll}>View all news</a>
    </div>
  );
}
