'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { IconSearch, IconChartLine, IconTrendingUp, IconSettings, IconX, IconLoader2 } from '@tabler/icons-react';
import type { SearchResult } from '@/app/api/search/route';
import styles from './CommandPalette.module.css';

interface Props { onClose: () => void }

const TYPE_ICONS: Record<string, React.ReactNode> = {
  stock:    <IconChartLine size={14} />,
  index:    <IconTrendingUp size={14} />,
  strategy: <IconChartLine size={14} />,
  setting:  <IconSettings size={14} />,
};

const TYPE_LABELS: Record<string, string> = {
  stock: 'Stocks', index: 'Indices', strategy: 'Strategies', setting: 'Settings',
};

export default function CommandPalette({ onClose }: Props) {
  const router   = useRouter();
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active,  setActive]  = useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const debounce  = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { inputRef.current?.focus(); }, []);

  /* Keyboard: Esc closes, ↑↓ navigates, Enter navigates */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      if (e.key === 'Enter' && results[active]) { navigate(results[active]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [results, active]);

  const navigate = useCallback((r: SearchResult) => {
    router.push(r.url);
    onClose();
  }, [router, onClose]);

  const search = useCallback((q: string) => {
    clearTimeout(debounce.current);
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setActive(0);
      } catch { setResults([]); }
      finally  { setLoading(false); }
    }, 250);
  }, []);

  const handleChange = (v: string) => { setQuery(v); search(v); };

  /* Group results by type */
  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  }

  let flatIdx = 0;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.palette} onClick={(e) => e.stopPropagation()}>
        {/* Input */}
        <div className={styles.inputRow}>
          <IconSearch size={16} color="var(--text-tertiary)" />
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search stocks, indices, strategies…"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            autoComplete="off"
          />
          {loading
            ? <IconLoader2 size={14} color="var(--text-tertiary)" className={styles.spin} />
            : query && <button className={styles.clear} onClick={() => handleChange('')}><IconX size={13} /></button>
          }
          <span className={styles.kbdHint}>Esc to close</span>
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <div className={styles.results}>
            {Object.entries(grouped).map(([type, items]) => (
              <div key={type} className={styles.group}>
                <div className={styles.groupLabel}>{TYPE_LABELS[type] ?? type}</div>
                {items.map((r) => {
                  const idx = flatIdx++;
                  const isActive = idx === active;
                  return (
                    <button
                      key={`${r.type}-${r.symbol ?? r.name}`}
                      className={styles.item + (isActive ? ' ' + styles.itemActive : '')}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => navigate(r)}
                    >
                      <span className={styles.itemIcon}>{TYPE_ICONS[r.type]}</span>
                      <div className={styles.itemText}>
                        <span className={styles.itemName}>
                          {r.symbol && <span className={styles.itemSymbol}>{r.symbol}</span>}
                          {r.name}
                        </span>
                        {r.sub && <span className={styles.itemSub}>{r.sub}</span>}
                      </div>
                      {isActive && <span className={styles.enterHint}>↵</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : query && !loading ? (
          <div className={styles.empty}>No results for &ldquo;{query}&rdquo;</div>
        ) : !query ? (
          <div className={styles.hint}>
            <p>Type a stock symbol or company name</p>
            <div className={styles.hintChips}>
              {['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'Nifty 50'].map((s) => (
                <button key={s} className="chip" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => handleChange(s)}>{s}</button>
              ))}
            </div>
          </div>
        ) : null}

        <div className={styles.footer}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
