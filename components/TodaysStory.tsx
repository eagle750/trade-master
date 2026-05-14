import { IconInfoCircle } from '@tabler/icons-react';
import { formatTime } from '@/lib/format';
import styles from './TodaysStory.module.css';

interface Props {
  body: string;
  generatedAt: string;
  isLoading?: boolean;
}

export default function TodaysStory({ body, generatedAt, isLoading }: Props) {
  return (
    <div className={styles.card}>
      <div className={styles.accent} />
      <div className={styles.content}>
        <div className={styles.header}>
          <span className="section-label">Today&apos;s story</span>
          <span className="param-tag param-tag--ai" style={{ marginLeft: 8 }}>
            AI-generated · verify
          </span>
          <span className={styles.time}>
            <IconInfoCircle size={11} style={{ verticalAlign: -1, marginRight: 2 }} />
            {formatTime(generatedAt)} IST
          </span>
        </div>

        {isLoading ? (
          <div className={styles.skeletonBlock}>
            <div className="skeleton" style={{ height: 13, width: '90%', marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 13, width: '80%', marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 13, width: '60%' }} />
          </div>
        ) : body ? (
          <p className={styles.body}>{body}</p>
        ) : (
          <p className={styles.empty}>No market summary available yet.</p>
        )}
      </div>
    </div>
  );
}
