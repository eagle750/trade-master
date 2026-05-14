'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  IconFilter, IconX, IconPlus, IconArrowsUpDown, IconChevronDown, IconDownload,
} from '@tabler/icons-react';
import { exportStockFilter } from '@/lib/csvExport';
import type { StockRow, FilterState } from '@/lib/types';
import { formatPrice, formatMcap, formatPct } from '@/lib/format';
import styles from './StockFilter.module.css';

interface Props {
  stocks: StockRow[];
  initialSectorFilter?: string;
  onSectorFilterClear?: () => void;
}

const SECTORS = ['Banking', 'IT', 'Pharma', 'Auto', 'FMCG', 'Energy', 'Metal', 'Finance', 'Utilities', 'PSU Bank', 'Conglom.'];
const COLUMNS: { key: keyof StockRow; label: string; numeric?: boolean }[] = [
  { key: 'symbol',    label: 'Symbol' },
  { key: 'name',      label: 'Company' },
  { key: 'sector',    label: 'Sector' },
  { key: 'ltp',       label: 'LTP', numeric: true },
  { key: 'changePct', label: 'Day chg %', numeric: true },
  { key: 'mcapCr',    label: 'Mkt cap', numeric: true },
  { key: 'pe',        label: 'P/E', numeric: true },
  { key: 'roe',       label: 'ROE %', numeric: true },
];

type SortDir = 'asc' | 'desc';

const emptyFilter: FilterState = {
  cap: [],
  sector: [],
  index: [],
  excludeT2T: false,
  excludeASM: false,
  excludeGSM: false,
};

export default function StockFilter({ stocks, initialSectorFilter, onSectorFilterClear }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterState>({
    ...emptyFilter,
    sector: initialSectorFilter ? [initialSectorFilter] : [],
  });
  const [sortKey, setSortKey]   = useState<keyof StockRow>('mcapCr');
  const [sortDir, setSortDir]   = useState<SortDir>('desc');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saveModal, setSaveModal]   = useState(false);
  const [saveName, setSaveName]     = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const filtered = useMemo(() => {
    let rows = [...stocks];

    if (filter.sector.length > 0) {
      rows = rows.filter((r) => filter.sector.includes(r.sector));
    }

    rows.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return rows;
  }, [stocks, filter, sortKey, sortDir]);

  const paged = filtered.slice(0, (page + 1) * PAGE_SIZE);

  const handleSort = useCallback((key: keyof StockRow) => {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }, [sortKey]);

  const removeSectorFilter = (s: string) => {
    setFilter((f) => ({ ...f, sector: f.sector.filter((x) => x !== s) }));
    if (initialSectorFilter === s) onSectorFilterClear?.();
  };

  const resetFilter = () => {
    setFilter(emptyFilter);
    onSectorFilterClear?.();
    setPage(0);
  };

  const activeChips: { label: string; onRemove: () => void }[] = [
    ...filter.sector.map((s) => ({
      label: `Sector: ${s}`,
      onRemove: () => removeSectorFilter(s),
    })),
    ...filter.cap.map((c) => ({
      label: `Cap: ${c}`,
      onRemove: () => setFilter((f) => ({ ...f, cap: f.cap.filter((x) => x !== c) })),
    })),
  ];

  return (
    <section className={styles.section} id="stock-filter">
      {/* Filter chip rail */}
      <div className={styles.chipRail}>
        <IconFilter size={14} color="var(--text-secondary)" />
        <span className="section-label" style={{ marginRight: 8 }}>Stock filter</span>

        {activeChips.map((chip) => (
          <button
            key={chip.label}
            className={'chip chip--filter ' + styles.activeChip}
            onClick={chip.onRemove}
          >
            {chip.label}
            <span className="chip__remove"><IconX size={11} /></span>
          </button>
        ))}

        <button
          className={'btn btn--secondary btn--sm ' + styles.moreBtn}
          onClick={() => setDrawerOpen(true)}
        >
          <IconPlus size={12} />
          More filters
          <IconChevronDown size={12} />
        </button>

        {activeChips.length > 0 && (
          <button className="btn btn--ghost btn--sm" onClick={resetFilter}>
            Reset
          </button>
        )}

        <span className={styles.count + ' num'}>
          {filtered.length.toLocaleString('en-IN')} stocks
        </span>
      </div>

      {/* Results table */}
      <div className={styles.tableWrap}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <p>No matches today. Relax a filter to widen.</p>
            <button className="btn btn--secondary btn--sm" onClick={resetFilter}>
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={col.numeric ? styles.numericCol : ''}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <IconArrowsUpDown
                          size={11}
                          style={{ marginLeft: 3, verticalAlign: -1, opacity: 0.7 }}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((row) => {
                  const { text, dir } = formatPct(row.changePct);
                  return (
                    <tr
                      key={row.symbol}
                      onClick={() => window.open(`/stock/${row.symbol}`, '_blank')}
                    >
                      <td>
                        <span className={styles.symbol}>{row.symbol}</span>
                      </td>
                      <td className={styles.companyName}>{row.name}</td>
                      <td>{row.sector}</td>
                      <td className={styles.numericCol}>
                        {row.circuit ? (
                          <span className={'pill ' + (row.circuit === 'UC' ? 'pill--up' : 'pill--down')}>
                            {row.circuit}
                          </span>
                        ) : (
                          <span className="num">{formatPrice(row.ltp)}</span>
                        )}
                      </td>
                      <td className={styles.numericCol + ' ' + (dir === 'up' ? styles.up : dir === 'down' ? styles.down : '')}>
                        <span className="num">{text}</span>
                      </td>
                      <td className={styles.numericCol + ' num'}>{formatMcap(row.mcapCr)}</td>
                      <td className={styles.numericCol + ' num'}>{row.pe?.toFixed(1) ?? '—'}</td>
                      <td className={styles.numericCol + ' num'}>{row.roe != null ? `${row.roe.toFixed(1)}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {paged.length < filtered.length && (
              <button
                className={'btn btn--secondary btn--sm ' + styles.loadMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Load more ({filtered.length - paged.length} remaining)
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer CTAs */}
      <div className={styles.footer}>
        <button className="btn btn--secondary btn--sm" onClick={() => setSaveModal(true)}>
          Save filter
        </button>
        <button className="btn btn--secondary btn--sm" onClick={() => exportStockFilter(filtered)}>
          <IconDownload size={13} /> Export CSV
        </button>
        <button className="btn btn--primary btn--sm" onClick={() => router.push('/strategy?from=filter')}>
          Use in strategy
        </button>
      </div>

      {/* Filter drawer */}
      {drawerOpen && (
        <>
          <div className="modal-backdrop" onClick={() => setDrawerOpen(false)} />
          <div className="drawer">
            <div className={styles.drawerHeader}>
              <span className={styles.drawerTitle}>Filter stocks</span>
              <button className={styles.drawerClose + ' btn btn--ghost btn--sm'} onClick={() => setDrawerOpen(false)}>
                <IconX size={16} />
              </button>
            </div>
            <div className={styles.drawerBody}>
              {/* Sector filter */}
              <div className={styles.filterGroup}>
                <div className="section-label" style={{ marginBottom: 8 }}>Sector</div>
                <div className={styles.filterChips}>
                  {SECTORS.map((s) => (
                    <button
                      key={s}
                      className={'chip' + (filter.sector.includes(s) ? ' chip--selected' : '')}
                      onClick={() =>
                        setFilter((f) => ({
                          ...f,
                          sector: f.sector.includes(s)
                            ? f.sector.filter((x) => x !== s)
                            : [...f.sector, s],
                        }))
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Eligibility */}
              <div className={styles.filterGroup}>
                <div className="section-label" style={{ marginBottom: 8 }}>Eligibility</div>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={filter.excludeT2T}
                    onChange={(e) => setFilter((f) => ({ ...f, excludeT2T: e.target.checked }))}
                  />
                  <span>Exclude T2T stocks</span>
                </label>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={filter.excludeASM}
                    onChange={(e) => setFilter((f) => ({ ...f, excludeASM: e.target.checked }))}
                  />
                  <span>Exclude ASM-flagged stocks</span>
                </label>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={filter.excludeGSM}
                    onChange={(e) => setFilter((f) => ({ ...f, excludeGSM: e.target.checked }))}
                  />
                  <span>Exclude GSM-flagged stocks</span>
                </label>
              </div>
            </div>
            <div className={styles.drawerFooter}>
              <button className="btn btn--secondary btn--md" onClick={resetFilter}>Reset all</button>
              <button className="btn btn--primary btn--md" onClick={() => setDrawerOpen(false)}>
                Apply filters
              </button>
            </div>
          </div>
        </>
      )}

      {/* Save filter modal */}
      {saveModal && (
        <div className="modal-backdrop" onClick={() => setSaveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.drawerTitle}>Save filter as watchlist</span>
              <button className="btn btn--ghost btn--sm" onClick={() => setSaveModal(false)}>
                <IconX size={16} />
              </button>
            </div>
            <div style={{ marginTop: 16 }}>
              <label className={styles.modalLabel}>Watchlist name</label>
              <input
                className="input"
                style={{ marginTop: 6 }}
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. IT large cap"
                autoFocus
              />
            </div>
            <div className={styles.modalFooter}>
              <button className="btn btn--secondary btn--md" onClick={() => setSaveModal(false)}>Cancel</button>
              <button
                className="btn btn--primary btn--md"
                disabled={!saveName.trim()}
                onClick={() => { setSaveModal(false); setSaveName(''); }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
