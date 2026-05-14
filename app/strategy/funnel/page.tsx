'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { IconArrowsLeftRight, IconLoader2, IconAlertTriangle, IconDownload, IconCheck, IconPencil, IconX } from '@tabler/icons-react';
import GlobalNav from '@/components/GlobalNav';
import StepIndicator from '@/components/StepIndicator';
import FunnelStageCard from '@/components/FunnelStageCard';
import SelectionGrid from '@/components/SelectionGrid';
import DisclaimerFooter from '@/components/DisclaimerFooter';
import { getMarketStatus } from '@/lib/marketStatus';
import { formatPrice, formatPct, formatMcap } from '@/lib/format';
import type { FunnelStage, SelectionStock, ScreenerResult } from '@/lib/screener';
import React from 'react';

interface SavedStrategy {
  id:         number;
  savedAt:    string;
  params:     Record<string, unknown>;
  selection:  string[];
  stageCount: number;
}

interface BacktestRow {
  symbol:      string;
  cagr?:       number;
  sharpe?:     number;
  maxDrawdown?: number;
  trades?:     number;
  error?:      string;
}
import type { StockRow } from '@/lib/types';
import styles from './page.module.css';

/* Read parameters stored by the strategy page */
function readRunParams() {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(sessionStorage.getItem('af_run_params') ?? '{}'); }
  catch { return {}; }
}

export default function FunnelPage() {
  const router = useRouter();

  const [result,      setResult]      = useState<ScreenerResult | null>(null);
  const [isRunning,   setIsRunning]   = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [activeStage,    setActiveStage]    = useState<number>(5);
  const [excluded,       setExcluded]       = useState<Set<string>>(new Set());
  const [verifiedStages,  setVerifiedStages]  = useState<Set<number>>(new Set());
  const [ruleOverrides,   setRuleOverrides]   = useState<Record<number, string>>({});
  const [editingRule,     setEditingRule]     = useState(false);
  const [ruleInput,       setRuleInput]       = useState('');
  const [savedMsg,        setSavedMsg]        = useState<string | null>(null);
  const [isBacktesting,    setIsBacktesting]    = useState(false);
  const [backtestResults,  setBacktestResults]  = useState<BacktestRow[] | null>(null);
  const [showBtConfig,     setShowBtConfig]     = useState(false);
  const [btFrom,           setBtFrom]           = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 3); return d.toISOString().slice(0, 10); });
  const [btTo,             setBtTo]             = useState(() => new Date().toISOString().slice(0, 10));
  const ruleInputRef = useRef<HTMLTextAreaElement>(null);

  const run = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    try {
      const params = readRunParams();
      const res    = await fetch('/api/strategy/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(params),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ScreenerResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsRunning(false);
    }
  }, []);

  useEffect(() => { run(); }, [run]);

  const activeStageData: FunnelStage | undefined = result?.stages.find((s) => s.index === activeStage);
  const universeCount = result?.stages[0]?.count ?? 0;

  const visibleStocks  = activeStageData?.stocks.filter((s) => !excluded.has(s.symbol)) ?? [];
  const excludedCount  = excluded.size;

  const toggleExclude = (symbol: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(symbol) ? next.delete(symbol) : next.add(symbol);
      return next;
    });
  };

  const handleVerifyAndContinue = () => {
    setVerifiedStages((prev) => new Set([...prev, activeStage]));
    const stages = result?.stages ?? [];
    const next = stages.find((s) => s.index > activeStage);
    if (next) setActiveStage(next.index);
  };

  const handleStartOverride = () => {
    const currentRule = ruleOverrides[activeStage] ?? activeStageData?.rule ?? '';
    setRuleInput(currentRule);
    setEditingRule(true);
    setTimeout(() => ruleInputRef.current?.focus(), 50);
  };

  const handleSaveOverride = () => {
    if (ruleInput.trim()) {
      setRuleOverrides((prev) => ({ ...prev, [activeStage]: ruleInput.trim() }));
    }
    setEditingRule(false);
  };

  const handleCancelOverride = () => {
    setEditingRule(false);
  };

  const handleSaveStrategy = () => {
    if (!result) return;
    const params = readRunParams();
    const saves = JSON.parse(localStorage.getItem('af_saved_strategies') ?? '[]') as SavedStrategy[];
    const entry: SavedStrategy = {
      id:        Date.now(),
      savedAt:   new Date().toISOString(),
      params,
      selection: result.selection.map((s) => s.symbol),
      stageCount: result.stages.length,
    };
    localStorage.setItem('af_saved_strategies', JSON.stringify([entry, ...saves].slice(0, 20)));
    setSavedMsg('Strategy saved!');
    setTimeout(() => setSavedMsg(null), 2500);
  };

  const handleBacktestAll = async () => {
    if (!result || isBacktesting) return;
    setIsBacktesting(true);
    setBacktestResults(null);
    setShowBtConfig(false);
    const rows = await Promise.all(
      result.selection.map(async (s): Promise<BacktestRow> => {
        try {
          const res = await fetch(`/api/stock/${s.symbol}/backtest?from=${btFrom}&to=${btTo}`);
          if (!res.ok) return { symbol: s.symbol, error: `HTTP ${res.status}` };
          const data = await res.json();
          const p = data.performance;
          return { symbol: s.symbol, cagr: p.cagr, sharpe: p.sharpe, maxDrawdown: p.maxDrawdown, trades: p.totalTrades };
        } catch {
          return { symbol: s.symbol, error: 'Failed' };
        }
      })
    );
    setBacktestResults(rows);
    setIsBacktesting(false);
  };

  const sectorBreakdown = (stocks: SelectionStock[]) => {
    const map: Record<string, number> = {};
    for (const s of stocks) {
      map[s.sector] = (map[s.sector] ?? 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([sector, count]) => ({ sector, pct: Math.round((count / stocks.length) * 100) }));
  };

  const saveToSession = () => {
    if (!result) return;
    sessionStorage.setItem('af_run_a', JSON.stringify(result));
    router.push('/strategy/compare');
  };

  return (
    <div className={styles.page}>
      <GlobalNav marketStatus={getMarketStatus().status} marketStatusTime={new Date().toISOString()} />

      <div className={'page-container ' + styles.inner}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.title}>Strategy run</h1>
            <p className={styles.sub}>
              Nifty 100 · Momentum quality screen · {result ? formatDate(result.asOf) : '…'}
            </p>
          </div>
          <div className={styles.headerActions}>
            <button className="btn btn--secondary btn--sm" onClick={run} disabled={isRunning}>
              {isRunning ? <IconLoader2 size={14} className={styles.spin} /> : null}
              Re-run
            </button>
            <button className="btn btn--secondary btn--sm" onClick={saveToSession} disabled={!result}>
              <IconArrowsLeftRight size={14} />
              Compare strategies
            </button>
          </div>
        </div>

        <div className={styles.stepRow}>
          <StepIndicator active={3} />
        </div>

        {error && (
          <div className="banner banner--error" style={{ marginBottom: 12 }}>
            <IconAlertTriangle size={14} />
            {error}
            <button className="btn btn--secondary btn--sm" style={{ marginLeft: 'auto' }} onClick={run}>Retry</button>
          </div>
        )}

        {/* Funnel strip */}
        <div className={styles.funnel}>
          {isRunning
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={styles.stagePlaceholder}>
                  <div className="skeleton" style={{ height: 3, marginBottom: 10 }} />
                  <div className="skeleton" style={{ height: 10, width: '40%', marginBottom: 6 }} />
                  <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 6 }} />
                  <div className="skeleton" style={{ height: 10, width: '50%' }} />
                </div>
              ))
            : result?.stages.map((stage) => (
                <FunnelStageCard
                  key={stage.index}
                  stage={stage}
                  universeCount={universeCount}
                  isActive={activeStage === stage.index}
                  isVerified={verifiedStages.has(stage.index)}
                  onClick={() => setActiveStage(stage.index)}
                />
              ))
          }
        </div>

        {/* Stage detail panel */}
        {!isRunning && activeStageData && (
          <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
              <div style={{ flex: 1 }}>
                <span className="section-label">
                  Stage {activeStageData.index} — {activeStageData.name}
                  {verifiedStages.has(activeStage) && (
                    <span style={{ marginLeft: 8, color: 'var(--up-dark)', fontSize: 'var(--text-caption)' }}>
                      <IconCheck size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />Verified
                    </span>
                  )}
                </span>
                {editingRule ? (
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <textarea
                      ref={ruleInputRef}
                      value={ruleInput}
                      onChange={(e) => setRuleInput(e.target.value)}
                      rows={2}
                      style={{
                        flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)',
                        padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--brand)', background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)', resize: 'vertical',
                      }}
                    />
                    <button className="btn btn--primary btn--sm" onClick={handleSaveOverride}>Save</button>
                    <button className="btn btn--ghost btn--sm" onClick={handleCancelOverride}>
                      <IconX size={13} />
                    </button>
                  </div>
                ) : (
                  <div className={styles.ruleCode} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {ruleOverrides[activeStage] ?? activeStageData.rule}
                    {ruleOverrides[activeStage] && (
                      <span style={{ color: 'var(--caution-dark)', fontSize: 10 }}>(overridden)</span>
                    )}
                  </div>
                )}
              </div>
              <button className="btn btn--secondary btn--sm">
                <IconDownload size={13} />
                Export
              </button>
            </div>

            {/* Stocks table */}
            {visibleStocks.length > 0 ? (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Symbol</th>
                      <th>Company</th>
                      <th>Sector</th>
                      <th className={styles.numCol}>LTP</th>
                      <th className={styles.numCol}>Day chg %</th>
                      <th className={styles.numCol}>Mkt cap</th>
                      <th className={styles.numCol}>P/E</th>
                      <th className={styles.numCol}>ROE %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStocks.slice(0, 100).map((row) => {
                      const { text, dir } = formatPct(row.changePct);
                      const isExcluded = excluded.has(row.symbol);
                      return (
                        <tr key={row.symbol} className={isExcluded ? styles.rowExcluded : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={!isExcluded}
                              onChange={() => toggleExclude(row.symbol)}
                              style={{ accentColor: 'var(--brand)', cursor: 'pointer' }}
                            />
                          </td>
                          <td><span className={styles.symbolCell}>{row.symbol}</span></td>
                          <td className={styles.nameCell}>{row.name}</td>
                          <td>{row.sector}</td>
                          <td className={styles.numCol + ' num'}>{formatPrice(row.ltp)}</td>
                          <td className={styles.numCol + ' num ' + (dir === 'up' ? styles.up : dir === 'down' ? styles.down : '')}>{text}</td>
                          <td className={styles.numCol + ' num'}>{row.mcapCr > 0 ? formatMcap(row.mcapCr) : '—'}</td>
                          <td className={styles.numCol + ' num'}>{row.pe?.toFixed(1) ?? '—'}</td>
                          <td className={styles.numCol + ' num'}>{row.roe != null ? `${row.roe.toFixed(1)}%` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.emptyStage}>
                <IconAlertTriangle size={20} color="var(--caution)" />
                <p>No stocks at this stage. Try relaxing the screen filters.</p>
              </div>
            )}

            {/* Stat row */}
            <div className={styles.statRow}>
              <span className="num">
                <strong>{visibleStocks.length.toLocaleString('en-IN')}</strong> included
                {excludedCount > 0 && (
                  <> · <span className={styles.excluded}>{excludedCount} excluded by you</span></>
                )}
              </span>
              <div className={styles.statActions}>
                <button className="btn btn--ghost btn--sm" onClick={handleStartOverride} disabled={editingRule}>
                  <IconPencil size={13} />
                  Override rule
                </button>
                <button
                  className="btn btn--primary btn--sm"
                  onClick={handleVerifyAndContinue}
                  disabled={verifiedStages.has(activeStage)}
                >
                  {verifiedStages.has(activeStage)
                    ? <><IconCheck size={13} /> Verified</>
                    : 'Verify and continue'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Selection grid */}
        {!isRunning && result && result.selection.length > 0 && (
          <div className={styles.selectionSection}>
            <div className={styles.selectionHeader}>
              <span className="section-label">Selection — {result.selection.length} stocks</span>
              <div className={styles.sectorChips}>
                {sectorBreakdown(result.selection).map(({ sector, pct }) => (
                  <span key={sector} className="pill pill--neutral">{sector} {pct}%</span>
                ))}
              </div>
            </div>

            <SelectionGrid stocks={result.selection} />

            {/* Action bar */}
            <div className={styles.actionBar}>
              <button className="btn btn--secondary btn--md" onClick={handleSaveStrategy}>
                {savedMsg ?? 'Save strategy'}
              </button>
              <button className="btn btn--secondary btn--md" onClick={() => setShowBtConfig((v) => !v)} disabled={isBacktesting}>
                {isBacktesting ? <><IconLoader2 size={14} className={styles.spin} /> Running…</> : 'Backtest all'}
              </button>
              {result.selection[0] && (
                <button
                  className="btn btn--primary btn--md"
                  onClick={() => window.open(`/stock/${result.selection[0].symbol}`, '_blank')}
                >
                  Open #{1} {result.selection[0].symbol}
                </button>
              )}
              <button className="btn btn--secondary btn--md" onClick={saveToSession}>
                <IconArrowsLeftRight size={14} />
                Add strategy B and compare
              </button>
            </div>

            {showBtConfig && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-primary)', border: '0.5px solid var(--border-tertiary)', borderRadius: 'var(--radius-lg)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-secondary)', fontWeight: 'var(--weight-medium)' as React.CSSProperties['fontWeight'] }}>Backtest window</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-caption)' }}>
                  From
                  <input type="date" value={btFrom} max={btTo} onChange={(e) => setBtFrom(e.target.value)}
                    style={{ padding: '3px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-secondary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-caption)' }}>
                  To
                  <input type="date" value={btTo} min={btFrom} max={new Date().toISOString().slice(0,10)} onChange={(e) => setBtTo(e.target.value)}
                    style={{ padding: '3px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-secondary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-caption)' }} />
                </label>
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                  {[
                    { label: '1Y', years: 1 }, { label: '3Y', years: 3 },
                    { label: '5Y', years: 5 }, { label: '10Y', years: 10 },
                  ].map(({ label, years }) => (
                    <button key={label} className="btn btn--ghost btn--sm" onClick={() => {
                      const d = new Date(); d.setFullYear(d.getFullYear() - years);
                      setBtFrom(d.toISOString().slice(0, 10));
                      setBtTo(new Date().toISOString().slice(0, 10));
                    }}>{label}</button>
                  ))}
                  <button className="btn btn--primary btn--sm" onClick={handleBacktestAll}>Run</button>
                </div>
              </div>
            )}

            {backtestResults && (
              <div style={{ background: 'var(--bg-primary)', border: '0.5px solid var(--border-tertiary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border-tertiary)' }}>
                  <span className="section-label">Backtest results — {btFrom} → {btTo}</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-caption)' }}>
                  <thead>
                    <tr>
                      {['Symbol','CAGR %','Sharpe','Max DD %','Trades'].map((h) => (
                        <th key={h} style={{ padding: '7px 14px', textAlign: h === 'Symbol' ? 'left' : 'right', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-secondary)', color: 'var(--text-secondary)', fontWeight: 'var(--weight-medium)' as React.CSSProperties['fontWeight'], whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {backtestResults.map((row) => (
                      <tr key={row.symbol}>
                        <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-tertiary)', fontFamily: 'var(--font-mono)', fontWeight: 'var(--weight-medium)' as React.CSSProperties['fontWeight'] }}>{row.symbol}</td>
                        {row.error ? (
                          <td colSpan={4} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-tertiary)', color: 'var(--text-secondary)' }}>{row.error}</td>
                        ) : (
                          <>
                            <td style={{ padding: '8px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-tertiary)', color: (row.cagr ?? 0) >= 0 ? 'var(--up-dark)' : 'var(--down)', fontVariantNumeric: 'tabular-nums' }}>{row.cagr?.toFixed(1)}%</td>
                            <td style={{ padding: '8px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{row.sharpe?.toFixed(2)}</td>
                            <td style={{ padding: '8px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-tertiary)', color: 'var(--down)', fontVariantNumeric: 'tabular-nums' }}>{row.maxDrawdown?.toFixed(1)}%</td>
                            <td style={{ padding: '8px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{row.trades}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <DisclaimerFooter />
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} IST`;
}
