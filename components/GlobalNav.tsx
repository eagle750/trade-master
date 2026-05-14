'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  IconBolt, IconSearch, IconBell, IconUser,
  IconChevronDown, IconFilter, IconArrowsLeftRight, IconBookmark,
} from '@tabler/icons-react';
import type { MarketStatus } from '@/lib/types';
import styles from './GlobalNav.module.css';

/* Lazy-load heavy panels */
const CommandPalette  = dynamic(() => import('./CommandPalette'),  { ssr: false });
const WatchlistPanel  = dynamic(() => import('./WatchlistPanel'),  { ssr: false });
const NotificationPanel = dynamic(() => import('./NotificationPanel'), { ssr: false });

interface Props {
  marketStatus: MarketStatus;
  marketStatusTime: string;
}

function MarketStatusPill({ status, time }: { status: MarketStatus; time: string }) {
  const d    = new Date(time);
  const hhmm = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  if (status === 'open') return (
    <span className={styles.statusPill + ' ' + styles.statusOpen}>
      <span className="pulse pulse--up" style={{ width: 6, height: 6 }} /> MARKET OPEN · {hhmm} IST
    </span>
  );
  if (status === 'pre-open') return (
    <span className={styles.statusPill + ' ' + styles.statusPreOpen}>
      <span className="pulse pulse--caution" style={{ width: 6, height: 6 }} /> PRE-OPEN · {hhmm} IST
    </span>
  );
  if (status === 'holiday') return (
    <span className={styles.statusPill + ' ' + styles.statusClosed}>MARKET CLOSED · HOLIDAY</span>
  );
  return (
    <span className={styles.statusPill + ' ' + styles.statusClosed}>MARKET CLOSED · {hhmm} IST</span>
  );
}

function StrategyDropdown({ pathname }: { pathname: string }) {
  const isActive = pathname?.startsWith('/strategy');
  return (
    <div className={styles.dropdown}>
      <Link href="/strategy" className={styles.navTab + (isActive ? ' ' + styles.navTabActive : '')}>
        Strategy Lab <IconChevronDown size={11} style={{ marginLeft: 3 }} />
      </Link>
      <div className={styles.dropdownMenu}>
        <Link href="/strategy"        className={styles.dropdownItem}>Input &amp; Brief</Link>
        <Link href="/strategy/funnel" className={styles.dropdownItem}><IconFilter size={12} /> Funnel &amp; Selection</Link>
        <Link href="/strategy/compare" className={styles.dropdownItem}><IconArrowsLeftRight size={12} /> Compare strategies</Link>
      </div>
    </div>
  );
}

export default function GlobalNav({ marketStatus, marketStatusTime }: Props) {
  const pathname = usePathname();
  const [cmdOpen,    setCmdOpen]    = useState(false);
  const [watchOpen,  setWatchOpen]  = useState(false);
  const [notifOpen,  setNotifOpen]  = useState(false);

  /* Cmd+K / Ctrl+K global shortcut */
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setCmdOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  return (
    <>
      <nav className={styles.nav}>
        <div className={styles.inner + ' page-container'}>
          <Link href="/" className={styles.logo}>
            <IconBolt size={18} color="var(--brand)" strokeWidth={2} />
            <span className={styles.logoText}>AlphaForge</span>
          </Link>

          <div className={styles.tabsGroup}>
            <Link href="/" className={styles.navTab + (pathname === '/' || pathname === '/pulse' ? ' ' + styles.navTabActive : '')}>
              Market Pulse
            </Link>
            <StrategyDropdown pathname={pathname ?? ''} />
          </div>

          <div className={styles.actions}>
            <MarketStatusPill status={marketStatus} time={marketStatusTime} />

            {/* Search */}
            <button className={styles.iconBtn} onClick={() => setCmdOpen(true)} aria-label="Search (⌘K)">
              <IconSearch size={16} />
            </button>

            {/* Watchlists */}
            <button className={styles.iconBtn + (watchOpen ? ' ' + styles.iconBtnActive : '')} onClick={() => { setWatchOpen(!watchOpen); setNotifOpen(false); }} aria-label="Watchlists">
              <IconBookmark size={16} />
            </button>

            {/* Notifications */}
            <button className={styles.iconBtn + (notifOpen ? ' ' + styles.iconBtnActive : '')} onClick={() => { setNotifOpen(!notifOpen); setWatchOpen(false); }} aria-label="Notifications">
              <IconBell size={16} />
            </button>

            <button className={styles.iconBtn} aria-label="Profile">
              <IconUser size={16} />
            </button>
          </div>
        </div>
      </nav>

      {cmdOpen   && <CommandPalette   onClose={() => setCmdOpen(false)} />}
      {watchOpen && <WatchlistPanel   onClose={() => setWatchOpen(false)} />}
      {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
    </>
  );
}
