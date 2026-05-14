'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IconLoader2, IconAlertTriangle, IconArrowRight, IconArrowLeft } from '@tabler/icons-react';
import GlobalNav from '@/components/GlobalNav';
import DisclaimerFooter from '@/components/DisclaimerFooter';
import { getMarketStatus } from '@/lib/marketStatus';
import { formatPrice, formatPct, formatMcap } from '@/lib/format';
import type { ScreenerResult, SelectionStock } from '@/lib/screener';
import styles from './page.module.css';

/* Read a run result from sessionStorage */
function readRun(key: string): ScreenerResult | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(sessionStorage.getItem(key) ?? 'null'); }
  catch { return null; }
}

/* Build overlap analysis */
function buildOverlap(a: SelectionStock[], b: SelectionStock[]) {
  const setA = new Set(a.map((s) => s.symbol));
  const setB = new Set(b.map((s) => s.symbol));
  const onlyA  = a.filter((s) => !setB.has(s.symbol));
  const inBoth = a.filter((s) =>  setB.has(s.symbol));
  const onlyB  = b.filter((s) => !setA.has(s.symbol));
  return { onlyA, inBoth, onlyB };
}

/* Sector tilt for a selection */
function sectorTilt(stocks: SelectionStock[]) {
  const map: Record<string, number> = {};
  for (const s of stocks) map[s.sector] = (map[s.sector] ?? 0) + 1;
  const total = stocks.length || 1;
  return Object.entries(map).sort((a, b) => b[1] - a[1])
    .map(([sector, count]) => ({ sector, pct: Math.round((count / total) * 100) }));
}

function MetricRow({ label, valA, valB, higherIsBetter = true }: {
  label: string; valA: number | null; valB: number | null; higherIsBetter?: boolean;
}) {
  const winner = valA == null || valB == null ? null
    : higherIsBetter ? (valA > valB ? 'a' : valB > valA ? 'b' : null)
    : (valA < valB ? 'a' : valB < valA ? 'b' : null);

  const fmt = (v: number | null, suffix = '%') =>
    v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}${suffix}`;

  return (
    <div className={styles.metricRow}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValues}>
        <span className={styles.metricVal + (winner === 'a' ? ' ' + styles.winner : '')}>{fmt(valA)}</span>
        <span className={styles.metricDivider}>vs</span>
        <span className={styles.metricVal + (winner === 'b' ? ' ' + styles.winner : '')}>{fmt(valB)}</span>
      </div>
    </div>
  );
}

export default function ComparePage() {
  const router = useRouter();
  const [runA, setRunA] = useState<ScreenerResult | null>(null);
  const [runB, setRunB] = useState<ScreenerResult | null>(null);
  const [runningB, setRunningB] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const a = readRun('af_run_a');
    const b = readRun('af_run_b');
    if (!a) { router.push('/strategy/funnel'); return; }
    setRunA(a);
    if (b) { setRunB(b); return; }
    /* Auto-run a second strategy (different parameters) for strategy B */
    runStrategyB();
  }, []);

  const runStrategyB = async () => {
    setRunningB(true);
    setError(null);
    try {
      /* Strategy B: value screen — lower P/E cap, higher ROE threshold */
      const res = await fetch('/api/strategy/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nPicks: 20, maxPE: 25, minROE: 0.15, momentumMonths: 6 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ScreenerResult = await res.json();
      sessionStorage.setItem('af_run_b', JSON.stringify(data));
      setRunB(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunningB(false);
    }
  };

  const overlap = runA && runB ? buildOverlap(runA.selection, runB.selection) : null;
  const tiltA   = runA ? sectorTilt(runA.selection) : [];
  const tiltB   = runB ? sectorTilt(runB.selection) : [];
  const allSectors = Array.from(new Set([...tiltA.map((t) => t.sector), ...tiltB.map((t) => t.sector)]));

  /* Compute avg 12m return as a rough proxy metric */
  const avgMetric = (stocks: SelectionStock[]) => {
    const vals = stocks.map((s) => parseFloat(s.headlineMetric.value.replace('%', '').replace('+', '')));
    return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  };

  return (
    <div className={styles.page}>
      <GlobalNav marketStatus={getMarketStatus().status} marketStatusTime={new Date().toISOString()} />

      <div className={'page-container ' + styles.inner}>
        {/* Breadcrumb + header */}
        <div className={styles.breadcrumb}>
          <button className="btn btn--ghost btn--sm" onClick={() => router.back()}>
            <IconArrowLeft size={14} /> Strategy lab
          </button>
          <span className={styles.breadSep}>›</span>
          <span>Compare</span>
        </div>

        <div className={styles.pageHeader}>
          <h1 className={styles.title}>
            Strategy A vs Strategy B
          </h1>
          <div className={styles.headerActions}>
            <button className="btn btn--secondary btn--sm" onClick={() => { runStrategyB(); }}>
              Re-run both
            </button>
          </div>
        </div>

        {error && (
          <div className="banner banner--error" style={{ marginBottom: 12 }}>
            <IconAlertTriangle size={14} /> {error}
          </div>
        )}

        {/* Strategy summary cards */}
        <div className={styles.summaryGrid}>
          {/* Strategy A */}
          <div className={'card ' + styles.summaryCard}>
            <div className={styles.strategyLabel + ' ' + styles.labelA}>Strategy A</div>
            <div className={styles.strategyDesc}>
              Nifty 100 · P/E &lt; 50 · ROE &gt; 10% · 12m momentum rank
            </div>
            <div className={styles.statsRow}>
              <div className={styles.statCell}>
                <span className="section-label">Stocks</span>
                <span className={styles.statVal + ' num'}>{runA?.selection.length ?? '—'}</span>
              </div>
              <div className={styles.statCell}>
                <span className="section-label">Avg 12m return</span>
                <span className={styles.statVal + ' num ' + styles.positive}>
                  {runA ? `${avgMetric(runA.selection).toFixed(1)}%` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Strategy B */}
          <div className={'card ' + styles.summaryCard}>
            <div className={styles.strategyLabel + ' ' + styles.labelB}>Strategy B</div>
            {runningB ? (
              <div className={styles.runningMsg}>
                <IconLoader2 size={16} className={styles.spin} />
                Running value screen…
              </div>
            ) : runB ? (
              <>
                <div className={styles.strategyDesc}>
                  Nifty 100 · P/E &lt; 25 · ROE &gt; 15% · 6m momentum rank
                </div>
                <div className={styles.statsRow}>
                  <div className={styles.statCell}>
                    <span className="section-label">Stocks</span>
                    <span className={styles.statVal + ' num'}>{runB.selection.length}</span>
                  </div>
                  <div className={styles.statCell}>
                    <span className="section-label">Avg 6m return</span>
                    <span className={styles.statVal + ' num ' + styles.positive}>
                      {avgMetric(runB.selection).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.runningMsg}>No strategy B yet.</div>
            )}
          </div>
        </div>

        {/* Performance comparison */}
        {runA && runB && (
          <div className={'card ' + styles.section}>
            <div className="section-label" style={{ marginBottom: 12 }}>Performance proxy</div>
            <MetricRow
              label="Avg headline return"
              valA={avgMetric(runA.selection)}
              valB={avgMetric(runB.selection)}
            />
            <MetricRow
              label="Selection size"
              valA={runA.selection.length}
              valB={runB.selection.length}
              higherIsBetter={false}
            />
            <p className={styles.perfNote}>
              Full CAGR / Sharpe / Max DD metrics available after backtest is run.
            </p>
          </div>
        )}

        {/* Selection overlap */}
        {overlap && (
          <div className={'card ' + styles.section}>
            <div className="section-label" style={{ marginBottom: 12 }}>Selection overlap</div>
            <div className={styles.overlapGrid}>
              <div className={styles.overlapCell + ' ' + styles.overlapA}>
                <div className={styles.overlapCount + ' num'}>{overlap.onlyA.length}</div>
                <div className={styles.overlapLabel}>A only</div>
                <div className={styles.overlapTickers}>
                  {overlap.onlyA.slice(0, 5).map((s) => (
                    <span key={s.symbol} className={styles.ticker}>{s.symbol}</span>
                  ))}
                  {overlap.onlyA.length > 5 && <span className={styles.more}>+{overlap.onlyA.length - 5}</span>}
                </div>
              </div>
              <div className={styles.overlapCell + ' ' + styles.overlapBoth}>
                <div className={styles.overlapCount + ' num'}>{overlap.inBoth.length}</div>
                <div className={styles.overlapLabel}>In both</div>
                <div className={styles.overlapTickers}>
                  {overlap.inBoth.slice(0, 5).map((s) => (
                    <span key={s.symbol} className={styles.ticker}>{s.symbol}</span>
                  ))}
                  {overlap.inBoth.length > 5 && <span className={styles.more}>+{overlap.inBoth.length - 5}</span>}
                </div>
              </div>
              <div className={styles.overlapCell + ' ' + styles.overlapB}>
                <div className={styles.overlapCount + ' num'}>{overlap.onlyB.length}</div>
                <div className={styles.overlapLabel}>B only</div>
                <div className={styles.overlapTickers}>
                  {overlap.onlyB.slice(0, 5).map((s) => (
                    <span key={s.symbol} className={styles.ticker}>{s.symbol}</span>
                  ))}
                  {overlap.onlyB.length > 5 && <span className={styles.more}>+{overlap.onlyB.length - 5}</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sector tilt */}
        {runA && runB && (
          <div className={'card ' + styles.section}>
            <div className="section-label" style={{ marginBottom: 12 }}>Sector tilt</div>
            <div className={styles.sectorTable}>
              {allSectors.map((sector) => {
                const pctA = tiltA.find((t) => t.sector === sector)?.pct ?? 0;
                const pctB = tiltB.find((t) => t.sector === sector)?.pct ?? 0;
                return (
                  <div key={sector} className={styles.sectorRow}>
                    <div className={styles.sectorName}>{sector}</div>
                    <div className={styles.sectorBars}>
                      <div className={styles.barWrap}>
                        <div className={styles.barA} style={{ width: `${pctA}%` }} />
                        <span className={styles.barLabel + ' num'}>{pctA}%</span>
                      </div>
                      <div className={styles.barWrap}>
                        <div className={styles.barB} style={{ width: `${pctB}%` }} />
                        <span className={styles.barLabel + ' num'}>{pctB}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className={styles.sectorLegend}>
                <span className={styles.legendA}>■ Strategy A</span>
                <span className={styles.legendB}>■ Strategy B</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer actions */}
        {runA && (
          <div className={styles.footerActions}>
            <button className="btn btn--secondary btn--md">Save comparison</button>
            <button className="btn btn--secondary btn--md" onClick={() => router.push('/strategy/funnel')}>
              Open A
            </button>
            <button
              className="btn btn--primary btn--md"
              onClick={() => router.push('/strategy/funnel')}
            >
              Pick A and continue <IconArrowRight size={14} />
            </button>
          </div>
        )}
      </div>

      <DisclaimerFooter />
    </div>
  );
}
