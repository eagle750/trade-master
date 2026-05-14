'use client';

import { useState } from 'react';
import { IconX, IconBolt, IconBell, IconAlertTriangle, IconNews } from '@tabler/icons-react';
import styles from './NotificationPanel.module.css';

interface Props { onClose: () => void }

type Category = 'all' | 'signals' | 'alerts' | 'system';

const MOCK_NOTIFICATIONS = [
  { id: '1', category: 'system',  title: 'Market Pulse data refreshed',       sub: 'Yahoo Finance · just now',       read: false },
  { id: '2', category: 'system',  title: 'Backtest cache cleared',             sub: 'System · 2 min ago',             read: false },
  { id: '3', category: 'alerts',  title: 'Set up price alerts on stocks',      sub: 'Go to any stock → bell icon',    read: true  },
  { id: '4', category: 'signals', title: 'Connect broker to receive signals',  sub: 'Live trading → Add broker',      read: true  },
];

const CAT_ICONS: Record<string, React.ReactNode> = {
  signals: <IconBolt size={13} />,
  alerts:  <IconBell size={13} />,
  system:  <IconAlertTriangle size={13} />,
  news:    <IconNews size={13} />,
};

export default function NotificationPanel({ onClose }: Props) {
  const [cat,       setCat]       = useState<Category>('all');
  const [notifs,    setNotifs]    = useState(MOCK_NOTIFICATIONS);

  const filtered = cat === 'all' ? notifs : notifs.filter((n) => n.category === cat);
  const unread   = notifs.filter((n) => !n.read).length;

  const markAllRead = () => setNotifs((ns) => ns.map((n) => ({ ...n, read: true })));
  const dismiss     = (id: string) => setNotifs((ns) => ns.filter((n) => n.id !== id));

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>
        <div className={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={styles.title}>Notifications</span>
            {unread > 0 && <span className="pill pill--brand" style={{ fontSize: 10 }}>{unread} new</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {unread > 0 && <button className="btn btn--ghost btn--xs" onClick={markAllRead}>Mark all read</button>}
            <button className="btn btn--ghost btn--sm" onClick={onClose}><IconX size={15} /></button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="tabs" style={{ padding: '0 16px', flexShrink: 0 }}>
          {(['all','signals','alerts','system'] as Category[]).map((c) => (
            <button key={c} className={'tab' + (cat === c ? ' tab--active' : '')} onClick={() => setCat(c)}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>

        {/* Notifications list */}
        <div className={styles.list}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>No {cat === 'all' ? '' : cat + ' '}notifications</div>
          ) : filtered.map((n) => (
            <div key={n.id} className={styles.item + (n.read ? '' : ' ' + styles.unread)}>
              <span className={styles.icon + ' ' + styles[`icon_${n.category}`]}>{CAT_ICONS[n.category]}</span>
              <div className={styles.content}>
                <div className={styles.itemTitle}>{n.title}</div>
                <div className={styles.itemSub}>{n.sub}</div>
              </div>
              <button className="btn btn--ghost btn--xs" onClick={() => dismiss(n.id)} title="Dismiss"><IconX size={11} /></button>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Connect a broker and set watchlist alerts to receive real-time notifications.
          </span>
        </div>
      </div>
    </>
  );
}
