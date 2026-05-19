'use client';

import { useState, useEffect, use, useCallback, useRef } from 'react';
import {
  IconBookmarkPlus, IconBell, IconShare, IconCheck,
  IconChartCandle, IconChartLine, IconArrowsLeftRight, IconTrendingUp,
  IconLineDashed, IconSquare, IconRuler, IconTrash, IconPlus,
  IconPlayerPlay, IconPlayerPause, IconPlayerSkipBack, IconPlayerSkipForward,
  IconChevronDown, IconDownload, IconBolt, IconAlertTriangle,
  IconArrowsExchange, IconLoader2, IconAdjustments, IconRefresh,
  IconFlask, IconLink,
} from '@tabler/icons-react';
import GlobalNav from '@/components/GlobalNav';
import PriceChart from '@/components/PriceChart';
import NewsRail from '@/components/NewsRail';
import DisclaimerFooter from '@/components/DisclaimerFooter';
import { getMarketStatus } from '@/lib/marketStatus';
import { formatPrice, formatMcap, formatPct, formatDate } from '@/lib/format';
import { rsi } from '@/lib/indicators';
import type { StockOverviewData } from '@/app/api/stock/[symbol]/route';
import { getWatchlists, addToWatchlist, isInAnyWatchlist, createWatchlist } from '@/lib/watchlist';
import type { BacktestResult, TickState, TradeEvent } from '@/lib/backtestEngine';
import { exportTradeLog } from '@/lib/csvExport';
import styles from './page.module.css';

type Tab = 'overview' | 'charts' | 'fundamentals' | 'news' | 'backtest' | 'live';
type CompareMode = 'none' | 'rebased' | 'spread';
type Speed = 0.5 | 1 | 2 | 5 | 10;
const SPEEDS: Speed[] = [0.5, 1, 2, 5, 10];

interface ChartData {
  bars: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>;
  indicators: Record<string, (number | null)[]>;
}

/* ─── helpers ────────────────────────────────────────────────── */
function fmtVol(v: number) {
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  return v.toLocaleString('en-IN');
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.statCell}>
      <div className={styles.statLabel + ' section-label'}>{label}</div>
      <div className={styles.statValue + ' num'}>{value}</div>
    </div>
  );
}

function emptyStock(symbol: string): StockOverviewData {
  return { symbol, name: symbol, sector: '—', exchange: 'NSE', ltp: 0, dayChange: 0, dayChangePct: 0, marketStatus: 'closed', open: 0, dayHigh: 0, dayLow: 0, volume: 0, avgVolume30d: 0, high52w: 0, low52w: 0, marketCapCr: 0, news: [], upcomingEvents: [] };
}

/* ─── MAIN PAGE ───────────────────────────────────────────────── */
export default function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const [tab, setTab]               = useState<Tab>('overview');
  const [data, setData]             = useState<StockOverviewData | null>(null);
  const [chart, setChart]           = useState<ChartData | null>(null);
  const [chartB, setChartB]         = useState<ChartData | null>(null);
  const [compareSymbol,      setCompareSymbol]      = useState('');
  const [compareInput,       setCompareInput]        = useState('');
  const [compareSearchResults, setCompareSearchResults] = useState<Array<{symbol:string;name:string}>>([]);
  const [compareDropdownOpen,  setCompareDropdownOpen]  = useState(false);
  const compareSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [compareMode,   setCompareMode]   = useState<CompareMode>('none');
  const [loadingData,   setLoadingData]   = useState(true);
  const [loadingChart,  setLoadingChart]  = useState(true);
  const [loadingBT,     setLoadingBT]     = useState(false);
  const [btResult,      setBtResult]      = useState<BacktestResult | null>(null);
  const [btError,       setBtError]       = useState<string | null>(null);
  const [chartType,     setChartType]     = useState<'line' | 'candle'>('candle');
  const [chartRange,    setChartRange]    = useState('1Y');
  const [activeInds,    setActiveInds]    = useState(new Set(['sma20', 'sma50', 'volume']));
  /* Backtest config + replay */
  const defaultFrom = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 3); return d.toISOString().slice(0, 10); })();
  const defaultTo   = new Date().toISOString().slice(0, 10);
  const [btConfig, setBtConfig] = useState({
    from:        defaultFrom,
    to:          defaultTo,
    capital:     1000000,
    slippagePct: 0.001,
    rsiPeriod:   14,
    threshold:   0.50,
  });
  const [configOpen, setConfigOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState({ from: defaultFrom, to: defaultTo, capital: 1000000, slippagePct: 0.001, rsiPeriod: 14, threshold: 0.50 });
  const [tickIdx,   setTickIdx]   = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed,     setSpeed]     = useState<Speed>(5);
  const rafRef = useRef<number>(0);
  const lastRaf = useRef<number>(0);

  useEffect(() => {
    fetch(`/api/stock/${symbol}`).then((r) => r.json()).then((d) => { setData(d); setLoadingData(false); }).catch(() => setLoadingData(false));
  }, [symbol]);

  useEffect(() => {
    setLoadingChart(true);
    fetch(`/api/stock/${symbol}/chart?range=${chartRange}`).then((r) => r.json()).then((d) => { setChart(d); setLoadingChart(false); }).catch(() => setLoadingChart(false));
  }, [symbol, chartRange]);

  /* Fetch compare symbol chart */
  useEffect(() => {
    if (!compareSymbol) { setChartB(null); return; }
    fetch(`/api/stock/${compareSymbol}/chart?range=${chartRange}`).then((r) => r.json()).then((d) => setChartB(d)).catch(() => setChartB(null));
  }, [compareSymbol, chartRange]);

  const runBacktest = useCallback(async (cfg = btConfig) => {
    setLoadingBT(true); setBtError(null); setBtResult(null); setTickIdx(0); setIsPlaying(false);
    try {
      const qs = new URLSearchParams({
        from:        cfg.from,
        to:          cfg.to,
        capital:     String(cfg.capital),
        slippagePct: String(cfg.slippagePct),
        rsiPeriod:   String(cfg.rsiPeriod),
        threshold:   String(cfg.threshold),
      });
      const res = await fetch(`/api/stock/${symbol}/backtest?${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setBtResult(await res.json());
    } catch (e) { setBtError(String(e)); }
    finally { setLoadingBT(false); }
  }, [symbol, btConfig]);

  useEffect(() => { if (tab === 'backtest' && !btResult && !loadingBT && !btError) runBacktest(); }, [tab]);

  /* Replay RAF loop */
  useEffect(() => {
    if (!isPlaying || !btResult) return;
    const tick = (now: number) => {
      if (now - lastRaf.current >= 1000 / speed) {
        lastRaf.current = now;
        setTickIdx((i) => {
          if (i >= btResult.ticks.length - 1) { setIsPlaying(false); return i; }
          return i + 1;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, btResult, speed]);

  const currentTick: TickState | undefined = btResult?.ticks[tickIdx];

  const toggleInd = (id: string) => setActiveInds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const { status, reason: marketReason } = getMarketStatus();
  const stock = data ?? emptyStock(symbol);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [wlPickerOpen, setWlPickerOpen] = useState(false);
  const [watchlists, setWatchlists] = useState<ReturnType<typeof getWatchlists>>([]);

  useEffect(() => {
    setInWatchlist(isInAnyWatchlist(symbol.toUpperCase()));
    setWatchlists(getWatchlists());
  }, [symbol]);

  const handleAddToWatchlist = (listId: string) => {
    addToWatchlist(listId, symbol.toUpperCase(), stock.name);
    setInWatchlist(true);
    setWlPickerOpen(false);
  };

  const handleQuickAdd = () => {
    const lists = getWatchlists();
    if (lists.length === 0) {
      const wl = createWatchlist('My watchlist');
      addToWatchlist(wl.id, symbol.toUpperCase(), stock.name);
    } else {
      addToWatchlist(lists[0].id, symbol.toUpperCase(), stock.name);
    }
    setInWatchlist(true);
  };
  const { text: chgText, dir: chgDir } = formatPct(stock.dayChangePct);

  return (
    <div className={styles.page}>
      <GlobalNav marketStatus={status} marketStatusTime={new Date().toISOString()} marketStatusReason={marketReason} />

      <div className={'page-container ' + styles.inner}>
        {/* ─── Stock header ─── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.avatar}>{symbol.slice(0, 2)}</div>
            <div>
              <div className={styles.symbolRow}>
                <span className={styles.symbol}>{symbol.toUpperCase()}</span>
                <span className="pill pill--neutral" style={{ fontSize: 10 }}>{stock.sector}</span>
                <span className="pill pill--neutral" style={{ fontSize: 10 }}>NSE</span>
                {status === 'open' && <span className={styles.livePill}><span className="pulse pulse--up" style={{ width: 5, height: 5 }} /> LIVE</span>}
              </div>
              <div className={styles.stockName}>{loadingData ? '…' : stock.name}</div>
            </div>
          </div>
          <div className={styles.headerRight}>
            <div>
              <div className={styles.ltp + ' num'}>{stock.ltp > 0 ? formatPrice(stock.ltp) : '—'}</div>
              <div className={styles.change + ' num ' + (chgDir === 'up' ? styles.up : chgDir === 'down' ? styles.down : '')}>
                {chgDir === 'up' ? '▲' : chgDir === 'down' ? '▼' : ''} {Math.abs(stock.dayChange).toFixed(2)} ({chgText.replace('▲ ','').replace('▼ ','')}) · today
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
              {inWatchlist ? (
                <button className="btn btn--secondary btn--sm" style={{ color: 'var(--up-dark)' }}>
                  <IconCheck size={14} /> In watchlist
                </button>
              ) : (
                <div style={{ position: 'relative' }}>
                  <button
                    className="btn btn--secondary btn--sm"
                    onClick={() => { if (watchlists.length > 1) setWlPickerOpen(!wlPickerOpen); else handleQuickAdd(); }}
                  >
                    <IconBookmarkPlus size={14} /> + Watchlist
                  </button>
                  {wlPickerOpen && watchlists.length > 1 && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--bg-primary)', border: '0.5px solid var(--border-secondary)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, minWidth: 180 }}>
                      {watchlists.map((wl) => (
                        <button key={wl.id} style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                          onClick={() => handleAddToWatchlist(wl.id)}
                        >
                          {wl.name} <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>({wl.items.length})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button className="btn btn--secondary btn--sm" aria-label="Alert"><IconBell size={14} /></button>
              <button className="btn btn--secondary btn--sm" aria-label="Share"><IconShare size={14} /></button>
            </div>
          </div>
        </div>

        {/* ─── Sub-tabs ─── */}
        <div className="tabs" style={{ marginBottom: 12 }}>
          {(['overview','charts','fundamentals','news','backtest','live'] as Tab[]).map((t) => (
            <button key={t} className={'tab' + (tab === t ? ' tab--active' : '')} onClick={() => setTab(t)}>
              {t === 'backtest' && btResult ? <>{t} <span className={styles.tabBadge}>replay</span></> : t === 'live' ? 'live trading' : t}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════
            OVERVIEW TAB
            ════════════════════════════════════════════════ */}
        {tab === 'overview' && (
          <>
            <PriceChart symbol={symbol.toUpperCase()} bars={chart?.bars ?? []} high52w={stock.high52w} low52w={stock.low52w} currentPrice={stock.ltp} isLoading={loadingChart} />

            <div className={styles.statsStrip}>
              {[
                { label: 'Open',       value: stock.open      > 0 ? formatPrice(stock.open)      : '—' },
                { label: 'Day high',   value: stock.dayHigh   > 0 ? formatPrice(stock.dayHigh)   : '—' },
                { label: 'Day low',    value: stock.dayLow    > 0 ? formatPrice(stock.dayLow)    : '—' },
                { label: 'Volume',     value: stock.volume    > 0 ? fmtVol(stock.volume)         : '—' },
                { label: 'Avg vol 30d',value: stock.avgVolume30d > 0 ? fmtVol(stock.avgVolume30d) : '—' },
                { label: 'Mkt cap',    value: stock.marketCapCr  > 0 ? formatMcap(stock.marketCapCr) : '—' },
                { label: 'Beta',       value: stock.beta != null ? stock.beta.toFixed(2)          : '—' },
              ].map((s) => <StatCell key={s.label} label={s.label} value={s.value} />)}
            </div>

            <div className={styles.mainGrid}>
              <div className={styles.leftCol}>
                <div className="card" style={{ padding: '12px 14px' }}>
                  <div className="section-label" style={{ marginBottom: 8 }}>Key ratios</div>
                  <table className="table">
                    <thead><tr><th>Metric</th><th className="numeric">Stock</th><th className="numeric">Sector est.</th><th>vs sector</th></tr></thead>
                    <tbody>
                      {stock.pe          != null && <tr><td>P/E</td><td className="numeric num">{stock.pe.toFixed(1)}x</td><td className="numeric num">{(stock.pe * 0.85).toFixed(1)}x</td><td><span className={styles.neutral}>Premium</span></td></tr>}
                      {stock.pb          != null && <tr><td>P/B</td><td className="numeric num">{stock.pb.toFixed(1)}x</td><td className="numeric num">{(stock.pb * 0.9).toFixed(1)}x</td><td><span className={styles.neutral}>Premium</span></td></tr>}
                      {stock.roe         != null && <tr><td>ROE</td><td className="numeric num">{(stock.roe * 100).toFixed(1)}%</td><td className="numeric num">12.0%</td><td><span className={stock.roe * 100 > 12 ? styles.better : styles.worse}>{stock.roe * 100 > 12 ? 'Better' : 'Worse'}</span></td></tr>}
                      {stock.debtToEquity!= null && <tr><td>D/E</td><td className="numeric num">{stock.debtToEquity.toFixed(1)}x</td><td className="numeric num">1.5x</td><td><span className={stock.debtToEquity > 2 ? styles.worse : styles.better}>{stock.debtToEquity > 2 ? 'Higher' : 'Lower'}</span></td></tr>}
                      {stock.eps         != null && <tr><td>EPS</td><td className="numeric num">₹{stock.eps.toFixed(2)}</td><td className="numeric">—</td><td>—</td></tr>}
                      {stock.dividendYield!= null && <tr><td>Div yield</td><td className="numeric num">{(stock.dividendYield * 100).toFixed(2)}%</td><td className="numeric num">1.2%</td><td><span className={stock.dividendYield * 100 > 1.2 ? styles.better : styles.neutral}>{stock.dividendYield * 100 > 1.2 ? 'Better' : 'Lower'}</span></td></tr>}
                    </tbody>
                  </table>
                </div>

                {(stock.promoterPct != null || stock.institutionPct != null) && (
                  <div className="card" style={{ padding: '12px 14px' }}>
                    <div className="section-label" style={{ marginBottom: 10 }}>Shareholding</div>
                    <ShareholdingBar promoter={stock.promoterPct ?? 0} institution={stock.institutionPct ?? 0} />
                  </div>
                )}

                {stock.upcomingEvents.length > 0 && (
                  <div className="card" style={{ padding: '12px 14px' }}>
                    <div className="section-label" style={{ marginBottom: 8 }}>Upcoming events</div>
                    {stock.upcomingEvents.map((ev, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '0.5px solid var(--border-tertiary)', fontSize: 12 }}>
                        <span style={{ fontWeight: 500, minWidth: 80 }}>{ev.type}</span>
                        <span className="num" style={{ color: 'var(--text-secondary)' }}>{formatDate(ev.date + 'T00:00:00Z')}</span>
                        {ev.detail && <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{ev.detail}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div><NewsRail items={stock.news} isLoading={loadingData} /></div>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════
            CHARTS TAB — Screens 7, 8, 9
            ════════════════════════════════════════════════ */}
        {tab === 'charts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Toolbar row 1 */}
            <div className={styles.chartToolbar}>
              <div className={styles.chartTypePill}>
                <button className={styles.typeBtn + (chartType === 'candle' ? ' ' + styles.typeBtnActive : '')} onClick={() => setChartType('candle')}><IconChartCandle size={13} /> Candlestick</button>
                <button className={styles.typeBtn + (chartType === 'line'   ? ' ' + styles.typeBtnActive : '')} onClick={() => setChartType('line')}><IconChartLine size={13} /> Line</button>
              </div>
              <div className={styles.tfGroup}>
                {['1D','5D','1M','3M','6M','1Y','5Y'].map((r) => (
                  <button key={r} className={styles.tfBtn + (chartRange === r ? ' ' + styles.tfActive : '')} onClick={() => setChartRange(r)}>{r}</button>
                ))}
              </div>
              <div className={styles.drawTools}>
                {[
                  { ico: <IconTrendingUp key="tl" size={13}/>,   tip: 'Trend line (coming soon)' },
                  { ico: <IconLineDashed key="hl" size={13}/>,   tip: 'Horizontal level (coming soon)' },
                  { ico: <IconSquare key="rect" size={13}/>,     tip: 'Rectangle (coming soon)' },
                  { ico: <IconRuler key="meas" size={13}/>,      tip: 'Measure (coming soon)' },
                  { ico: <IconTrash key="clr" size={13}/>,       tip: 'Clear drawings (coming soon)' },
                ].map(({ ico, tip }, i) => (
                  <button key={i} className={styles.drawBtn} disabled title={tip} style={{ cursor: 'not-allowed', opacity: 0.45 }}>{ico}</button>
                ))}
              </div>
              <button className="btn btn--secondary btn--sm" style={{ marginLeft: 'auto' }} onClick={() => setCompareMode(compareMode === 'none' ? 'rebased' : 'none')}>
                <IconArrowsLeftRight size={13} /> {compareMode !== 'none' ? 'Exit compare' : 'Compare'}
              </button>
            </div>

            {/* Compare bar (Screen 8+9) */}
            {compareMode !== 'none' && (
              <div className={styles.compareBar}>
                <div className={styles.compareModes}>
                  {(['rebased','spread'] as CompareMode[]).map((m) => (
                    <button key={m} className={'chip' + (compareMode === m ? ' chip--selected' : '')} onClick={() => setCompareMode(m)} style={{ fontSize: 11, padding: '3px 10px' }}>
                      {m === 'rebased' ? 'Rebased to 100' : 'Spread (A − B)'}
                    </button>
                  ))}
                </div>
                <div className={styles.compareTickers}>
                  <span className={styles.tickerChipA}>{symbol.toUpperCase()}</span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>vs</span>
                  <div style={{ position: 'relative' }}>
                    <input
                      className={'input ' + styles.compareInput}
                      placeholder="Search symbol…"
                      value={compareInput}
                      autoComplete="off"
                      onChange={(e) => {
                        const q = e.target.value.toUpperCase();
                        setCompareInput(q);
                        setCompareDropdownOpen(true);
                        if (compareSearchRef.current) clearTimeout(compareSearchRef.current);
                        if (q.length < 1) { setCompareSearchResults([]); return; }
                        compareSearchRef.current = setTimeout(async () => {
                          try {
                            const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                            const d = await r.json();
                            setCompareSearchResults((d.results ?? []).slice(0, 8).map((x: {symbol:string;name:string}) => ({ symbol: x.symbol.replace('.NS',''), name: x.name })));
                          } catch { setCompareSearchResults([]); }
                        }, 250);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && compareInput.length > 1) { setCompareSymbol(compareInput); setCompareDropdownOpen(false); }
                        if (e.key === 'Escape') setCompareDropdownOpen(false);
                      }}
                      onFocus={() => compareInput.length > 0 && setCompareDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setCompareDropdownOpen(false), 150)}
                    />
                    {compareDropdownOpen && compareSearchResults.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 4, minWidth: 240, background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
                        {compareSearchResults.map((r) => (
                          <button key={r.symbol} onMouseDown={() => { setCompareSymbol(r.symbol); setCompareInput(r.symbol); setCompareDropdownOpen(false); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12, color: 'var(--brand)', minWidth: 80 }}>{r.symbol}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {compareSymbol && <button className="btn btn--ghost btn--sm" onClick={() => { setCompareSymbol(''); setCompareInput(''); setCompareSearchResults([]); }}><IconTrash size={12} /></button>}
                </div>
                <div className={styles.suggestedPeers}>
                  Suggested: {['NIFTY50=F','HDFCBANK','SBIN'].map((s) => (
                    <button key={s} className="btn btn--link btn--xs" onClick={() => { setCompareSymbol(s); setCompareInput(s); }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Indicator chips */}
            <div className={styles.indicatorRow}>
              {[{id:'sma20',label:'SMA 20'},{id:'sma50',label:'SMA 50'},{id:'sma200',label:'SMA 200'},{id:'bb',label:'Bollinger'},{id:'rsi14',label:'RSI 14'},{id:'macd',label:'MACD'},{id:'volume',label:'Volume'}].map((ind) => (
                <button key={ind.id} className={'chip' + (activeInds.has(ind.id) ? ' chip--selected' : '')} onClick={() => toggleInd(ind.id)} style={{ fontSize: 11, padding: '4px 10px' }}>{ind.label}</button>
              ))}
              <button className="btn btn--ghost btn--xs"><IconPlus size={11} /> Add</button>
            </div>

            {/* Chart rendering */}
            {loadingChart ? (
              <div className="skeleton" style={{ height: 480, borderRadius: 8 }} />
            ) : compareMode !== 'none' && compareSymbol && chart && chartB?.bars?.length ? (
              /* Screen 8 Rebased / Screen 9 Spread */
              <CompareChart
                symbolA={symbol.toUpperCase()}
                symbolB={compareSymbol}
                barsA={chart.bars}
                barsB={chartB.bars}
                mode={compareMode}
              />
            ) : chart && chart.bars.length > 0 ? (
              <MultiPaneChart bars={chart.bars} indicators={chart.indicators} activeIndicators={activeInds} chartType={chartType} />
            ) : (
              <div className={styles.noChart}>Chart data unavailable for this timeframe.</div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════
            BACKTEST TAB — Screen 10
            ════════════════════════════════════════════════ */}
        {tab === 'backtest' && (
          <BacktestTab
            symbol={symbol}
            result={btResult}
            isLoading={loadingBT}
            error={btError}
            tickIdx={tickIdx}
            setTickIdx={setTickIdx}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            speed={speed}
            setSpeed={setSpeed}
            onRerun={runBacktest}
            currentTick={currentTick}
            config={btConfig}
            configOpen={configOpen}
            configDraft={configDraft}
            setConfigDraft={setConfigDraft}
            onOpenConfig={() => { setConfigDraft({ ...btConfig }); setConfigOpen(true); }}
            onApplyConfig={() => {
              setBtConfig(configDraft);
              setConfigOpen(false);
              runBacktest(configDraft);
            }}
            onCloseConfig={() => setConfigOpen(false)}
          />
        )}

        {/* ════════════════════════════════════════════════
            LIVE TRADING TAB — Screen 11
            ════════════════════════════════════════════════ */}
        {tab === 'live' && <LiveTradingTab symbol={symbol} rsiPeriod={btConfig.rsiPeriod} threshold={btConfig.threshold} capital={btConfig.capital} />}

        {/* Stub tabs */}
        {tab === 'fundamentals' && (
          <FundamentalsTab symbol={symbol.toUpperCase()} />
        )}

        {tab === 'news' && (
          <div className={styles.stubTab}>
            <span style={{ fontSize: 32 }}>📰</span>
            <p>News — coming in next release</p>
          </div>
        )}
      </div>
      <DisclaimerFooter />
    </div>
  );
}

/* ─── Fundamentals tab ──────────────────────────────────────── */
import type { FundamentalsData, QuarterlyPoint } from '@/app/api/stock/[symbol]/fundamentals/route';

function FundamentalsTab({ symbol }: { symbol: string }) {
  const [data, setData] = useState<FundamentalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stock/${symbol}/fundamentals`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load fundamentals'); setLoading(false); });
  }, [symbol]);

  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
      {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 180, borderRadius: 12 }} />)}
    </div>
  );
  if (error || !data) return (
    <div className={styles.stubTab}><IconAlertTriangle size={24} /><p>{error ?? 'No data'}</p></div>
  );

  const pct  = (v?: number) => v != null ? `${(v * 100).toFixed(1)}%` : '—';
  const num  = (v?: number, dec = 2) => v != null ? v.toFixed(dec) : '—';
  const cr   = (v?: number) => v != null ? `₹${v.toLocaleString('en-IN')} Cr` : '—';
  const inr  = (v?: number) => v != null ? `₹${v.toFixed(2)}` : '—';

  const recColor = (r?: string) => {
    if (!r) return 'var(--text-secondary)';
    if (r.includes('buy') || r === 'strong_buy') return 'var(--up-dark)';
    if (r.includes('sell')) return 'var(--down)';
    return 'var(--caution-dark)';
  };

  const KV = ({ label, value, highlight }: { label: string; value: string; highlight?: 'up' | 'down' }) => (
    <div className={styles.kvRow}>
      <dt>{label}</dt>
      <dd style={highlight ? { color: highlight === 'up' ? 'var(--up-dark)' : 'var(--down)' } : {}}>{value}</dd>
    </div>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ background: 'var(--bg-primary)', border: '0.5px solid var(--border-tertiary)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="section-label">{title}</div>
      <dl style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0 }}>{children}</dl>
    </div>
  );

  const upTarget = data.targetMeanPrice && data.targetMeanPrice > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Top grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>

        <Section title="Valuation">
          <KV label="P/E (trailing)"   value={num(data.pe, 1)} />
          <KV label="P/E (forward)"    value={num(data.forwardPE, 1)} />
          <KV label="P/B"              value={num(data.pb, 2)} />
          <KV label="PEG ratio"        value={num(data.pegRatio, 2)} />
          <KV label="EV / EBITDA"      value={num(data.evToEbitda, 1)} />
          <KV label="EV / Revenue"     value={num(data.evToRevenue, 2)} />
          <KV label="Market cap"       value={cr(data.marketCapCr)} />
          <KV label="Enterprise value" value={cr(data.enterpriseValueCr)} />
        </Section>

        <Section title="Profitability">
          <KV label="ROE"              value={pct(data.roe)}  highlight={data.roe != null ? (data.roe > 0.15 ? 'up' : data.roe < 0 ? 'down' : undefined) : undefined} />
          <KV label="ROA"              value={pct(data.roa)}  highlight={data.roa != null ? (data.roa > 0.05 ? 'up' : data.roa < 0 ? 'down' : undefined) : undefined} />
          <KV label="Gross margin"     value={pct(data.grossMargin)} />
          <KV label="Operating margin" value={pct(data.operatingMargin)} highlight={data.operatingMargin != null ? (data.operatingMargin > 0 ? 'up' : 'down') : undefined} />
          <KV label="Net margin"       value={pct(data.netMargin)}       highlight={data.netMargin != null ? (data.netMargin > 0 ? 'up' : 'down') : undefined} />
          <KV label="Revenue growth"   value={pct(data.revenueGrowthYoy)}   highlight={data.revenueGrowthYoy != null ? (data.revenueGrowthYoy > 0 ? 'up' : 'down') : undefined} />
          <KV label="Earnings growth"  value={pct(data.earningsGrowthYoy)}  highlight={data.earningsGrowthYoy != null ? (data.earningsGrowthYoy > 0 ? 'up' : 'down') : undefined} />
        </Section>

        <Section title="Financial health">
          <KV label="Debt / Equity"    value={num(data.debtToEquity, 2)}  highlight={data.debtToEquity != null ? (data.debtToEquity < 1 ? 'up' : data.debtToEquity > 2 ? 'down' : undefined) : undefined} />
          <KV label="Current ratio"    value={num(data.currentRatio, 2)}  highlight={data.currentRatio != null ? (data.currentRatio > 1.5 ? 'up' : data.currentRatio < 1 ? 'down' : undefined) : undefined} />
          <KV label="Quick ratio"      value={num(data.quickRatio, 2)} />
        </Section>

        <Section title="Per share">
          <KV label="EPS (trailing)"   value={inr(data.eps)} />
          <KV label="EPS (forward)"    value={inr(data.forwardEps)} />
          <KV label="Book value"       value={inr(data.bookValuePerShare)} />
          <KV label="Dividend yield"   value={pct(data.dividendYield)} />
          <KV label="Dividend / share" value={inr(data.dividendRate)} />
          <KV label="Payout ratio"     value={pct(data.payoutRatio)} />
        </Section>

        <Section title="Analyst consensus">
          <KV label="Recommendation"   value={data.recommendation?.replace(/_/g,' ').toUpperCase() ?? '—'} />
          <KV label="Target (mean)"    value={inr(data.targetMeanPrice)} highlight={upTarget ? 'up' : undefined} />
          <KV label="Target (low)"     value={inr(data.targetLowPrice)} />
          <KV label="Target (high)"    value={inr(data.targetHighPrice)} />
          <KV label="# analysts"       value={data.analystCount != null ? String(data.analystCount) : '—'} />
          {data.recommendation && (
            <div style={{ marginTop: 4, padding: '4px 10px', borderRadius: 20, display: 'inline-flex', alignSelf: 'flex-start', background: recColor(data.recommendation) + '22', color: recColor(data.recommendation), fontSize: 11, fontWeight: 600 }}>
              {data.recommendation.replace(/_/g,' ').toUpperCase()}
            </div>
          )}
        </Section>

        {(data.promoterPct != null || data.institutionPct != null) && (
          <Section title="Shareholding">
            {[
              { label: 'Promoter',      val: data.promoterPct,    color: 'var(--brand)' },
              { label: 'Institutional', val: data.institutionPct, color: 'var(--up-dark)' },
              { label: 'Public',        val: data.publicPct,      color: 'var(--text-tertiary)' },
            ].filter((r) => r.val != null).map(({ label, val, color }) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ color, fontWeight: 600 }}>{(val! * 100).toFixed(1)}%</span>
                </div>
                <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(val! * 100).toFixed(1)}%`, height: '100%', background: color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </Section>
        )}
      </div>

      {/* Quarterly charts */}
      {data.revenueQ.some((p) => p.value != null) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
          <QuarterlyBarChart title="Revenue (₹ Cr)" points={data.revenueQ} color="var(--brand)" />
          <QuarterlyBarChart title="Net Profit (₹ Cr)" points={data.netProfitQ} color="var(--up-dark)" allowNegative />
          <QuarterlyBarChart title="Operating Cash Flow (₹ Cr)" points={data.ebitdaQ} color="#8B5CF6" allowNegative />
        </div>
      )}
    </div>
  );
}

function QuarterlyBarChart({ title, points, color, allowNegative }: { title: string; points: QuarterlyPoint[]; color: string; allowNegative?: boolean }) {
  const valid = points.filter((p) => p.value != null);
  if (valid.length === 0) return null;

  const vals  = valid.map((p) => p.value as number);
  const maxV  = Math.max(...vals);
  const minV  = allowNegative ? Math.min(0, ...vals) : 0;
  const range = maxV - minV || 1;

  return (
    <div style={{ background: 'var(--bg-primary)', border: '0.5px solid var(--border-tertiary)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
      <div className="section-label" style={{ marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
        {valid.map(({ period, value }) => {
          const v = value as number;
          const barH = Math.round(((v - minV) / range) * 100);
          const isNeg = v < 0;
          return (
            <div key={period} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }} title={`${period}: ₹${v.toLocaleString('en-IN')} Cr`}>
              <div style={{ width: '100%', height: `${barH}%`, background: isNeg ? 'var(--down)' : color, borderRadius: '3px 3px 0 0', minHeight: 2, transition: 'height 0.3s' }} />
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', transform: 'rotate(-35deg)', transformOrigin: 'top left', marginLeft: 4 }}>{period}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Shareholding bar ──────────────────────────────────────── */
function ShareholdingBar({ promoter, institution }: { promoter: number; institution: number }) {
  const promoterPct    = Math.round(promoter * 100);
  const institutionPct = Math.round(institution * 100);
  const publicPct      = Math.max(0, 100 - promoterPct - institutionPct);
  const segs = [
    { label: 'Promoter',     pct: promoterPct,    color: 'var(--brand)' },
    { label: 'Institutional', pct: institutionPct, color: 'var(--up)' },
    { label: 'Public',        pct: publicPct,      color: 'var(--text-tertiary)' },
  ].filter((s) => s.pct > 0);
  return (
    <div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 1 }}>
        {segs.map((s) => <div key={s.label} style={{ width: `${s.pct}%`, background: s.color }} title={`${s.label}: ${s.pct}%`} />)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
        {segs.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Screen 8+9 Compare chart ─────────────────────────────── */
const TICKER_COLORS = ['var(--brand)', 'var(--zerodha)', '#E67E22', '#27AE60'];

function CompareChart({ symbolA, symbolB, barsA, barsB, mode }: {
  symbolA: string; symbolB: string;
  barsA: Array<{ t: string; c: number }>;
  barsB: Array<{ t: string; c: number }>;
  mode: CompareMode;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggleHidden = (s: string) => setHidden((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const W = 900, H = 280, PL = 55, PR = 10, PT = 16, PB = 30;
  const cw = W - PL - PR, ch = H - PT - PB;

  /* Align by date */
  const setB = new Map(barsB.map((b) => [b.t.slice(0, 10), b.c]));
  const pairs = barsA.map((a) => ({ t: a.t, cA: a.c, cB: setB.get(a.t.slice(0, 10)) ?? null })).filter((p) => p.cB != null) as { t: string; cA: number; cB: number }[];

  if (pairs.length < 2) return <div className={styles.noChart}>Not enough overlapping data to compare.</div>;

  const baseA = pairs[0].cA, baseB = pairs[0].cB;

  const valuesA = pairs.map((p) => mode === 'rebased' ? (p.cA / baseA - 1) * 100 : (p.cA / baseA - p.cB / baseB) * 100);
  const valuesB = mode === 'rebased' ? pairs.map((p) => (p.cB / baseB - 1) * 100) : null;

  const allVals = [...valuesA, ...(valuesB ?? [])];
  const minV = Math.min(...allVals) * 1.02, maxV = Math.max(...allVals) * 1.02;
  const rangeV = maxV - minV || 1;

  const px = (i: number) => PL + (i / (pairs.length - 1)) * cw;
  const py = (v: number) => PT + (1 - (v - minV) / rangeV) * ch;

  const linePath = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');

  /* Metrics */
  const finalA = valuesA[valuesA.length - 1];
  const finalB = valuesB ? valuesB[valuesB.length - 1] : null;

  /* Spread stats for Screen 9 */
  const meanSpread = mode === 'spread' ? valuesA.reduce((a, b) => a + b, 0) / valuesA.length : 0;
  const stdSpread  = mode === 'spread' ? Math.sqrt(valuesA.reduce((s, v) => s + (v - meanSpread) ** 2, 0) / valuesA.length) : 1;
  const zScore     = mode === 'spread' && stdSpread > 0 ? (valuesA[valuesA.length - 1] - meanSpread) / stdSpread : 0;
  const zMeterPct  = Math.min(100, Math.max(0, ((zScore + 2) / 4) * 100));

  const yTicks = 5;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Z-Score callout — Screen 9 */}
      {mode === 'spread' && (
        <div className={styles.zCallout}>
          <div className={styles.zLeft}>
            <div style={{ fontSize: 13 }}>
              Current spread <strong className={zScore > 0 ? styles.up : styles.down}>{zScore > 0 ? '+' : ''}{valuesA[valuesA.length - 1].toFixed(2)} pp</strong>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              {Math.abs(zScore) > 2 ? 'Signal zone' : Math.abs(zScore) > 1 ? 'Caution zone' : 'Neutral zone'}
            </div>
          </div>
          <div className={styles.zMeterWrap}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>−2σ</span>
            <div className={styles.zMeter}>
              <div className={styles.zMeterBandGreen} />
              <div className={styles.zMeterBandAmber} />
              <div className={styles.zMeterBandRed} />
              <div className={styles.zMeterHandle} style={{ left: `${zMeterPct}%` }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>+2σ</span>
          </div>
          <div className={styles.zRight}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Z = {zScore > 0 ? '+' : ''}{zScore.toFixed(2)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{Math.abs(zScore) > 2 ? '⚠ signal zone' : Math.abs(zScore) > 1 ? 'caution zone' : 'neutral'}</div>
          </div>
        </div>
      )}

      {/* Clickable legends */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[{ sym: symbolA, color: TICKER_COLORS[0] }, ...(valuesB ? [{ sym: symbolB, color: TICKER_COLORS[1] }] : [])].map(({ sym, color }) => (
          <button key={sym} onClick={() => toggleHidden(sym)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${color}`, background: hidden.has(sym) ? 'transparent' : color + '22', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: hidden.has(sym) ? 'var(--text-tertiary)' : color, opacity: hidden.has(sym) ? 0.5 : 1, transition: 'all 0.15s' }}>
            <span style={{ width: 12, height: 2, background: hidden.has(sym) ? 'var(--text-tertiary)' : color, display: 'inline-block', borderRadius: 1 }} />
            {sym}
          </button>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: 'var(--bg-primary)', border: '0.5px solid var(--border-tertiary)', borderRadius: 8, display: 'block' }}>
        {/* Grid */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const v = minV + (i / yTicks) * rangeV;
          return <line key={i} x1={PL} x2={PL+cw} y1={py(v)} y2={py(v)} stroke="var(--border-tertiary)" strokeWidth="0.5" />;
        })}

        {/* 0 baseline for rebased */}
        {mode === 'rebased' && minV < 0 && maxV > 0 && (
          <line x1={PL} x2={PL+cw} y1={py(0)} y2={py(0)} stroke="var(--border-secondary)" strokeWidth="1" strokeDasharray="4,3" />
        )}

        {/* Spread sigma bands — Screen 9 */}
        {mode === 'spread' && (
          <>
            {[-2, -1, 1, 2].map((s) => {
              const yV = py(meanSpread + s * stdSpread);
              const col = Math.abs(s) >= 2 ? 'var(--down)' : 'var(--caution)';
              return <line key={s} x1={PL} x2={PL+cw} y1={yV} y2={yV} stroke={col} strokeWidth="0.7" strokeDasharray="4,3" opacity="0.7" />;
            })}
            <line x1={PL} x2={PL+cw} y1={py(meanSpread)} y2={py(meanSpread)} stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="4,3" />
          </>
        )}

        {/* Series A */}
        {!hidden.has(symbolA) && <path d={linePath(valuesA)} fill="none" stroke={TICKER_COLORS[0]} strokeWidth="2" />}

        {/* Series B (rebased mode) */}
        {valuesB && !hidden.has(symbolB) && <path d={linePath(valuesB)} fill="none" stroke={TICKER_COLORS[1]} strokeWidth="1.5" />}

        {/* Current point pulse */}
        {!hidden.has(symbolA) && <circle cx={px(pairs.length - 1)} cy={py(valuesA[valuesA.length - 1])} r={4} fill={TICKER_COLORS[0]} />}

        {/* Y-axis labels */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const v = minV + (i / yTicks) * rangeV;
          return <text key={i} x={PL - 4} y={py(v) + 3} fontSize="9" fill="var(--text-tertiary)" textAnchor="end" fontFamily="var(--font-mono)">{v.toFixed(1)}%</text>;
        })}

        {/* Final value labels */}
        <text x={PL + cw + 3} y={py(finalA) + 3} fontSize="9" fill={TICKER_COLORS[0]} fontFamily="var(--font-mono)">{finalA > 0 ? '+' : ''}{finalA.toFixed(1)}%</text>
        {finalB != null && <text x={PL + cw + 3} y={py(finalB) + 3} fontSize="9" fill={TICKER_COLORS[1]} fontFamily="var(--font-mono)">{finalB > 0 ? '+' : ''}{finalB.toFixed(1)}%</text>}
      </svg>

      {/* Metrics table — Screen 8 */}
      {mode === 'rebased' && (
        <div className="card" style={{ padding: '12px 14px', overflowX: 'auto' }}>
          <div className="section-label" style={{ marginBottom: 8 }}>Comparison metrics</div>
          <table className="table">
            <thead><tr><th>Ticker</th><th className="numeric">Final return</th><th className="numeric">vs baseline +100</th></tr></thead>
            <tbody>
              <tr>
                <td><span style={{ color: TICKER_COLORS[0], fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{symbolA}</span></td>
                <td className={'numeric num ' + (finalA >= 0 ? styles.up : styles.down)}>{finalA >= 0 ? '+' : ''}{finalA.toFixed(2)}%</td>
                <td className="numeric num">—</td>
              </tr>
              {finalB != null && (
                <tr>
                  <td><span style={{ color: TICKER_COLORS[1], fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{symbolB}</span></td>
                  <td className={'numeric num ' + (finalB >= 0 ? styles.up : styles.down)}>{finalB >= 0 ? '+' : ''}{finalB.toFixed(2)}%</td>
                  <td className={'numeric num ' + ((finalA - finalB) >= 0 ? styles.up : styles.down)}>
                    Alpha {finalA - finalB >= 0 ? '+' : ''}{(finalA - finalB).toFixed(2)} pp
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pair stats — Screen 9 */}
      {mode === 'spread' && (
        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="section-label" style={{ marginBottom: 8 }}>Pair statistics</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', fontSize: 12 }}>
            {[
              ['Mean spread',       `${meanSpread.toFixed(2)} pp`],
              ['σ (rolling)',       `${stdSpread.toFixed(2)} pp`],
              ['Current z-score',  `${zScore > 0 ? '+' : ''}${zScore.toFixed(2)}`],
              ['Data points',       pairs.length.toLocaleString('en-IN')],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '0.5px solid var(--border-tertiary)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                <span className="num" style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Screen 10: Backtest Tab ───────────────────────────────── */
interface BtCfg { from: string; to: string; capital: number; slippagePct: number; rsiPeriod: number; threshold: number; }

function fmtCfgDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00Z');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function BacktestTab({ symbol, result, isLoading, error, tickIdx, setTickIdx, isPlaying, setIsPlaying, speed, setSpeed, onRerun, currentTick, config, configOpen, configDraft, setConfigDraft, onOpenConfig, onApplyConfig, onCloseConfig }: {
  symbol: string; result: BacktestResult | null; isLoading: boolean; error: string | null;
  tickIdx: number; setTickIdx: (n: number) => void;
  isPlaying: boolean; setIsPlaying: (b: boolean) => void;
  speed: Speed; setSpeed: (s: Speed) => void;
  onRerun: () => void; currentTick: TickState | undefined;
  config: BtCfg; configOpen: boolean; configDraft: BtCfg;
  setConfigDraft: (c: BtCfg) => void;
  onOpenConfig: () => void; onApplyConfig: () => void; onCloseConfig: () => void;
}) {
  if (isLoading) return (
    <div className={styles.btLoading}>
      <IconLoader2 size={24} className={styles.spin} />
      <p>Running backtest on {symbol.toUpperCase()} — fetching 3 years of EOD data…</p>
      <div className="progress" style={{ width: 260, margin: '0 auto' }}><div className="progress__fill" style={{ width: '60%' }} /></div>
    </div>
  );

  if (error) return (
    <div className={styles.btLoading}>
      <IconAlertTriangle size={24} color="var(--caution)" />
      <p>{error}</p>
      <button className="btn btn--secondary btn--sm" onClick={onRerun}>Retry</button>
    </div>
  );

  if (!result) return (
    <div className={styles.btLoading}>
      <IconFlask size={32} color="var(--brand)" />
      <p>Run a backtest to see tick-by-tick replay</p>
      <button className="btn btn--primary btn--md" onClick={onRerun}>Run backtest</button>
    </div>
  );

  const ticks       = result.ticks;
  const totalTicks  = ticks.length;
  const pct         = totalTicks > 1 ? (tickIdx / (totalTicks - 1)) * 100 : 0;
  const perf        = result.performance;
  const trades      = result.trades;

  /* Trade marker positions */
  const tradeMarkers = trades.map((t) => ({ pct: totalTicks > 1 ? (t.tickIndex / (totalTicks - 1)) * 100 : 0, type: t.type }));

  return (
    <div className={styles.btWrap}>
      {/* Config strip */}
      <div className={styles.configStrip}>
        <div className={styles.configItems}>
          <IconFlask size={13} />
          <span className={styles.configLabel}>Strategy</span>
          <span className={styles.configLink}><IconLink size={11} /> RSI momentum · threshold 0.50</span>
          <span className={styles.configDot}>·</span>
          <span className={styles.configLabel}>Period <strong>{fmtCfgDate(config.from)} — {fmtCfgDate(config.to)}</strong></span>
          <span className={styles.configDot}>·</span>
          <span className={styles.configLabel}>Capital <strong>₹{(result.config.capital / 1e5).toFixed(0)} L</strong></span>
          <span className={styles.configDot}>·</span>
          <span className={styles.configLabel}>Slippage <strong>{(result.config.slippagePct * 100).toFixed(2)}%</strong></span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn--secondary btn--sm" onClick={onOpenConfig}><IconAdjustments size={13} /> Configure</button>
          <button className="btn btn--secondary btn--sm" onClick={() => onRerun()}><IconRefresh size={13} /> Re-run</button>
        </div>
      </div>

      {/* Multi-panel chart */}
      <BacktestMultiChart ticks={ticks} trades={trades} currentIdx={tickIdx} onTickClick={setTickIdx} />

      {/* Replay controls */}
      <div className={styles.replayControls}>
        <button className={styles.circleBtn} onClick={() => { setIsPlaying(false); setTickIdx(0); }} title="Skip to start">
          <IconPlayerSkipBack size={14} />
        </button>
        <button className={styles.circleBtnPrimary} onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
        </button>
        <button className={styles.circleBtn} onClick={() => { setIsPlaying(false); setTickIdx(totalTicks - 1); }} title="Skip to end">
          <IconPlayerSkipForward size={14} />
        </button>

        <div className={styles.speedPill} onClick={() => { const i = SPEEDS.indexOf(speed); setSpeed(SPEEDS[(i + 1) % SPEEDS.length]); }}>
          <strong>{speed}×</strong> <IconChevronDown size={10} />
        </div>

        {/* Scrubber */}
        <div className={styles.scrubber} onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pctClick = (e.clientX - rect.left) / rect.width;
          setTickIdx(Math.round(pctClick * (totalTicks - 1)));
        }}>
          <div className={styles.scrubberFill} style={{ width: `${pct}%` }} />
          {tradeMarkers.map((m, i) => (
            <div key={i} className={styles.scrubberMarker} style={{ left: `${m.pct}%`, background: m.type === 'BUY' ? 'var(--up)' : 'var(--down)' }} />
          ))}
          <div className={styles.scrubberHandle} style={{ left: `${pct}%` }} />
        </div>

        <div className={styles.replayTime}>
          <strong>{currentTick?.date ?? '—'}</strong> · day {tickIdx + 1} / {totalTicks.toLocaleString('en-IN')}
        </div>
      </div>

      {/* Tick detail + Trade log */}
      <div className={styles.btRow}>
        {/* Tick detail card */}
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500 }}>
              <span className="pulse" style={{ width: 7, height: 7 }} />
              Current tick · what&apos;s happening now
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }} className="num">{currentTick?.date ?? '—'} · day {tickIdx + 1}</span>
          </div>

          {currentTick ? (
            <>
              {/* Price OHLCV */}
              <div className="section-label" style={{ marginBottom: 6 }}>Price action at this bar</div>
              <div className={styles.priceGrid}>
                {[['O', currentTick.ohlcv.o], ['H', currentTick.ohlcv.h], ['L', currentTick.ohlcv.l], ['C', currentTick.ohlcv.c], ['Vol', currentTick.ohlcv.v]].map(([k, v]) => (
                  <div key={k} className={styles.priceCell}>
                    <label>{k}</label>
                    <span className="num">{k === 'Vol' ? fmtVol(Number(v)) : formatPrice(Number(v))}</span>
                  </div>
                ))}
              </div>

              {/* Conditions */}
              <div className="section-label" style={{ margin: '10px 0 6px' }}>
                Strategy evaluation <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{currentTick.conditions.filter((c) => c.met).length} of {currentTick.conditions.length} met</span>
              </div>
              {currentTick.conditions.map((c, i) => (
                <div key={i} className="check-row">
                  <span className={'check-row__icon' + (c.met ? '' : ' check-row__icon--fail')}>
                    {c.met ? '✓' : '✗'}
                  </span>
                  <span className="check-row__text">{c.name}</span>
                  <span className={'check-row__value num'}>{c.value}</span>
                </div>
              ))}
              {currentTick.signal && (
                <div className={styles.signalCallout + ' ' + (currentTick.signal === 'BUY' ? styles.signalBuy : styles.signalSell)}>
                  <IconBolt size={13} /> All conditions met → <strong>{currentTick.signal} signal fired</strong>
                </div>
              )}

              {/* Action */}
              {currentTick.action && (
                <>
                  <div className="section-label" style={{ margin: '10px 0 6px' }}>Action taken</div>
                  <div className={styles.actionBox}>
                    <div style={{ fontWeight: 500 }}>{currentTick.action.type} {currentTick.action.qty} @ {formatPrice(currentTick.action.price)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
                      Slippage ₹{currentTick.action.slippageCost.toFixed(0)} · brokerage ₹{currentTick.action.brokerage}
                    </div>
                  </div>
                </>
              )}

              {/* Account */}
              <div className="section-label" style={{ margin: '10px 0 6px' }}>Position &amp; account</div>
              <div className={styles.kvList}>
                {[
                  ['Position',        currentTick.position.type + (currentTick.position.qty > 0 ? ` ${currentTick.position.qty} shares` : '')],
                  ['Avg cost',        currentTick.position.avgCost > 0 ? formatPrice(currentTick.position.avgCost) : '—'],
                  ['Unrealised P&L',  currentTick.position.unrealisedPnL !== 0 ? `₹${currentTick.position.unrealisedPnL.toFixed(0)}` : '—'],
                  ['Cash',            `₹${(currentTick.account.cash / 1e5).toFixed(2)} L`],
                  ['Total equity',    `₹${(currentTick.account.equity / 1e5).toFixed(2)} L`],
                  ['Return',          `${currentTick.account.returnPctFromStart >= 0 ? '+' : ''}${currentTick.account.returnPctFromStart.toFixed(2)}%`],
                ].map(([k, v]) => (
                  <div key={k} className={styles.kvRow}>
                    <dt>{k}</dt>
                    <dd className="num">{v}</dd>
                  </div>
                ))}
              </div>
            </>
          ) : <div style={{ color: 'var(--text-tertiary)', fontSize: 12, padding: 12 }}>Select a tick to inspect.</div>}
        </div>

        {/* Trade log */}
        <div className="card" style={{ padding: '12px 14px', overflow: 'auto', maxHeight: 480 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Trade log</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{trades.length} events</span>
          </div>
          {trades.length === 0 ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>No trades yet. Play the replay.</div>
          ) : (
            [...trades].reverse().map((t) => {
              const isCurrent = t.tickIndex === tickIdx;
              return (
                <div key={t.id}
                  className={styles.tradeEvent + ' ' + (isCurrent ? styles.tradeEventCurrent : '') + ' ' + (t.type === 'BUY' ? styles.tradeEventBuy : styles.tradeEventSell)}
                  onClick={() => { setIsPlaying(false); setTickIdx(t.tickIndex); }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span className={'pill ' + (t.type === 'BUY' ? 'pill--up' : 'pill--down')} style={{ fontSize: 10, padding: '1px 6px' }}>{t.type}</span>
                    {isCurrent && <span className="pill pill--brand" style={{ fontSize: 10, padding: '1px 6px' }}>Current</span>}
                    {t.pnl != null && (
                      <span className={'num ' + (t.pnl >= 0 ? styles.up : styles.down)} style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 500 }}>
                        {t.pnl >= 0 ? '+' : ''}₹{Math.abs(t.pnl).toFixed(0)} ({t.pnlPct?.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                  <div className="num" style={{ fontSize: 12 }}>{t.qty} @ {formatPrice(t.price)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {ticks[t.tickIndex]?.date ?? ''}
                    {t.daysHeld != null && ` · held ${t.daysHeld}d`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{t.reason}</div>
                </div>
              );
            })
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn--secondary btn--sm" onClick={() => exportTradeLog(
              trades.map((t) => ({ type: t.type, qty: t.qty, price: t.price, pnl: t.pnl, pnlPct: t.pnlPct, daysHeld: t.daysHeld, reason: t.reason, date: ticks[t.tickIndex]?.date ?? '' }))
            )}>
              <IconDownload size={12} /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* Performance row */}
      <div className={styles.perfRow}>
        {[
          { label: 'Equity now',     value: `₹${(perf.equityNow / 1e5).toFixed(2)} L`,   sub: `from ₹${(result.config.capital / 1e5).toFixed(0)} L start`, highlight: true },
          { label: 'Total return',   value: `${perf.returnPct >= 0 ? '+' : ''}${perf.returnPct.toFixed(1)}%`, sub: `CAGR ${perf.cagr.toFixed(1)}%` },
          { label: 'Max drawdown',   value: `${perf.maxDD.toFixed(1)}%`, sub: `B&H ${perf.bAndHMaxDD.toFixed(1)}%` },
          { label: 'Sharpe ratio',   value: perf.sharpe.toFixed(2),      sub: 'annualised' },
          { label: 'Win rate',       value: `${perf.winRate.wins}/${perf.winRate.total}`,  sub: `${perf.winRate.total > 0 ? ((perf.winRate.wins / perf.winRate.total) * 100).toFixed(0) : 0}% closed` },
          { label: 'Time in market', value: `${perf.timeInMarketPct.toFixed(0)}%`,         sub: `${perf.tradingDays} trading days` },
        ].map((tile) => (
          <div key={tile.label} className={styles.perfTile + (tile.highlight ? ' ' + styles.perfTileHighlight : '')}>
            <div className={styles.perfLabel + ' section-label'}>{tile.label}</div>
            <div className={styles.perfValue + ' num'}>{tile.value}</div>
            <div className={styles.perfSub}>{tile.sub}</div>
          </div>
        ))}
      </div>

      <div className="banner banner--info" style={{ marginTop: 8, fontSize: 11 }}>
        Past performance does not predict future results. Backtests use historical data and idealised execution; live results will differ.
      </div>

      {/* Configure drawer */}
      {configOpen && (
        <>
          <div className="modal-backdrop" onClick={onCloseConfig} />
          <div className="drawer">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '0.5px solid var(--border-tertiary)', flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Configure backtest</span>
              <button className="btn btn--ghost btn--sm" onClick={onCloseConfig}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Period — date pickers + quick presets */}
              <div>
                <div className="section-label" style={{ marginBottom: 8 }}>Backtest period</div>

                {/* Quick-pick presets */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  {[
                    { label: '1Y',  years: 1 },
                    { label: '2Y',  years: 2 },
                    { label: '3Y',  years: 3 },
                    { label: '5Y',  years: 5 },
                    { label: '10Y', years: 10 },
                  ].map(({ label, years }) => {
                    const presetFrom = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - years); return d.toISOString().slice(0, 10); })();
                    const presetTo   = new Date().toISOString().slice(0, 10);
                    const isActive   = configDraft.from === presetFrom && configDraft.to === presetTo;
                    return (
                      <button
                        key={label}
                        className={'chip' + (isActive ? ' chip--selected' : '')}
                        onClick={() => setConfigDraft({ ...configDraft, from: presetFrom, to: presetTo })}
                        style={{ fontSize: 12 }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Custom date inputs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>From</label>
                    <input
                      type="date"
                      className="input"
                      style={{ fontSize: 12, padding: '5px 8px' }}
                      value={configDraft.from}
                      max={configDraft.to}
                      onChange={(e) => setConfigDraft({ ...configDraft, from: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>To</label>
                    <input
                      type="date"
                      className="input"
                      style={{ fontSize: 12, padding: '5px 8px' }}
                      value={configDraft.to}
                      min={configDraft.from}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setConfigDraft({ ...configDraft, to: e.target.value })}
                    />
                  </div>
                </div>

                {/* Duration summary */}
                {configDraft.from && configDraft.to && (
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                    {Math.round((new Date(configDraft.to).getTime() - new Date(configDraft.from).getTime()) / (1000 * 60 * 60 * 24 * 365.25) * 10) / 10} years · EOD bars from Yahoo Finance
                  </p>
                )}
              </div>

              {/* Capital */}
              <div>
                <div className="section-label" style={{ marginBottom: 8 }}>Starting capital</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[100000, 500000, 1000000, 5000000].map((c) => (
                    <button key={c} className={'chip' + (configDraft.capital === c ? ' chip--selected' : '')} onClick={() => setConfigDraft({ ...configDraft, capital: c })} style={{ fontSize: 12 }}>
                      ₹{c >= 1e5 ? `${(c/1e5).toFixed(0)} L` : c.toLocaleString('en-IN')}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Custom ₹</span>
                  <input className="input" type="number" style={{ width: 140, padding: '5px 8px', fontSize: 12 }}
                    value={configDraft.capital} min={10000} step={10000}
                    onChange={(e) => setConfigDraft({ ...configDraft, capital: Math.max(10000, Number(e.target.value)) })} />
                </div>
              </div>

              {/* Slippage */}
              <div>
                <div className="section-label" style={{ marginBottom: 8 }}>Slippage assumption</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0.0005, 0.001, 0.002, 0.005].map((s) => (
                    <button key={s} className={'chip' + (configDraft.slippagePct === s ? ' chip--selected' : '')} onClick={() => setConfigDraft({ ...configDraft, slippagePct: s })} style={{ fontSize: 12 }}>
                      {(s * 100).toFixed(2)}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Strategy — RSI */}
              <div>
                <div className="section-label" style={{ marginBottom: 8 }}>Strategy: RSI momentum</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>RSI period</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[9, 14, 21].map((p) => (
                        <button key={p} className={'chip' + (configDraft.rsiPeriod === p ? ' chip--selected' : '')} onClick={() => setConfigDraft({ ...configDraft, rsiPeriod: p })} style={{ fontSize: 12 }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Signal threshold (buy when RSI / 100 &gt; threshold)</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[0.40, 0.45, 0.50, 0.55, 0.60].map((t) => (
                        <button key={t} className={'chip' + (configDraft.threshold === t ? ' chip--selected' : '')} onClick={() => setConfigDraft({ ...configDraft, threshold: t })} style={{ fontSize: 12 }}>
                          {t.toFixed(2)}
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>BUY when RSI / 100 crosses above this. SELL when it drops below.</p>
                  </div>
                </div>
              </div>

            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 16px', borderTop: '0.5px solid var(--border-tertiary)', flexShrink: 0 }}>
              <button className="btn btn--secondary btn--md" onClick={onCloseConfig}>Cancel</button>
              <button className="btn btn--primary btn--md" onClick={onApplyConfig}>
                Apply and re-run
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Backtest multi-panel chart ────────────────────────────── */
function BacktestMultiChart({ ticks, trades, currentIdx, onTickClick }: {
  ticks: TickState[]; trades: TradeEvent[]; currentIdx: number; onTickClick: (i: number) => void;
}) {
  if (ticks.length === 0) return null;
  const CW = 900, PL = 52, PR = 8, PRICE_H = 150, FS_H = 35, EQ_H = 60, DD_H = 45;
  const PRICE_Y = 20, FS_Y = PRICE_Y + PRICE_H + 10, EQ_Y = FS_Y + FS_H + 10, DD_Y = EQ_Y + EQ_H + 10;
  const TOTAL_H = DD_Y + DD_H + 24;
  const cw = CW - PL - PR;

  const prices   = ticks.map((t) => t.ohlcv.c);
  const minP = Math.min(...prices) * 0.995, maxP = Math.max(...prices) * 1.005, rngP = maxP - minP || 1;
  const eqs  = ticks.map((t) => t.equityCurves.strategy);
  const bhs  = ticks.map((t) => t.equityCurves.bAndH);
  const minE = Math.min(...eqs, ...bhs) * 0.995, maxE = Math.max(...eqs, ...bhs) * 1.005, rngE = maxE - minE || 1;
  const factors = ticks.map((t) => t.factorScore);
  const dds     = ticks.map((t) => t.drawdowns.strategy);
  const bhDDs   = ticks.map((t) => t.drawdowns.bAndH);
  const minDD = Math.min(...dds, ...bhDDs) * 1.05, maxDD = 0.5;

  const px   = (i: number) => PL + (i / (ticks.length - 1 || 1)) * cw;
  const pyP  = (v: number) => PRICE_Y + (1 - (v - minP) / rngP) * PRICE_H;
  const pyFS = (v: number) => FS_Y + (1 - v) * FS_H;
  const pyEQ = (v: number) => EQ_Y + (1 - (v - minE) / rngE) * EQ_H;
  const pyDD = (v: number) => DD_Y + (1 - (v - (minDD || -1)) / (-minDD || 1)) * DD_H;

  const path = (vals: number[], pyFn: (v: number) => number) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${pyFn(v).toFixed(1)}`).join(' ');

  const playX = px(currentIdx);

  return (
    <svg viewBox={`0 0 ${CW} ${TOTAL_H}`} width="100%"
      style={{ display: 'block', background: 'var(--bg-primary)', border: '0.5px solid var(--border-tertiary)', borderRadius: 8, cursor: 'pointer' }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const svgX = (e.clientX - rect.left) * (CW / rect.width);
        const idx  = Math.round((svgX - PL) / cw * (ticks.length - 1));
        onTickClick(Math.max(0, Math.min(ticks.length - 1, idx)));
      }}
    >
      {/* Section labels */}
      {[['PRICE · ₹', PRICE_Y], ['FACTOR SCORE', FS_Y], ['EQUITY CURVE', EQ_Y], ['DRAWDOWN', DD_Y]].map(([label, y]) => (
        <text key={String(label)} x={PL + 4} y={Number(y) + 11} fontSize="9" fill="var(--text-secondary)" fontFamily="var(--font-sans)" fontWeight="500" letterSpacing="0.4">{label}</text>
      ))}

      {/* Panel dividers */}
      {[FS_Y, EQ_Y, DD_Y].map((y) => <line key={y} x1={PL} x2={PL+cw} y1={y} y2={y} stroke="var(--border-tertiary)" strokeWidth="0.5" />)}

      {/* Price area */}
      <path d={path(prices, pyP) + ` L${px(ticks.length-1)},${pyP(minP)} L${px(0)},${pyP(minP)} Z`} fill="var(--chart-area-fill)" />
      <path d={path(prices, pyP)} fill="none" stroke="var(--brand)" strokeWidth="1.4" />

      {/* Buy/sell markers */}
      {trades.map((t, i) => (
        <g key={i}>
          <circle cx={px(t.tickIndex)} cy={pyP(ticks[t.tickIndex]?.ohlcv.c ?? 0)} r={3.5}
            fill={t.type === 'BUY' ? 'var(--up)' : 'var(--down)'}
            stroke="white" strokeWidth="1" />
          {t.tickIndex === currentIdx && <circle cx={px(t.tickIndex)} cy={pyP(ticks[t.tickIndex]?.ohlcv.c ?? 0)} r={7} fill="none" stroke={t.type === 'BUY' ? 'var(--up)' : 'var(--down)'} strokeWidth="1" strokeDasharray="2,2" opacity="0.7" />}
        </g>
      ))}

      {/* Factor score */}
      <path d={path(factors, pyFS)} fill="none" stroke="var(--brand)" strokeWidth="1" />
      <line x1={PL} x2={PL+cw} y1={pyFS(0.5)} y2={pyFS(0.5)} stroke="var(--brand)" strokeWidth="0.7" strokeDasharray="3,2" opacity="0.6" />

      {/* Equity curve */}
      <path d={path(eqs, pyEQ)} fill="none" stroke="var(--brand)" strokeWidth="1.6" />
      <path d={path(bhs, pyEQ)} fill="none" stroke="var(--chart-line-benchmark)" strokeWidth="1.2" />

      {/* Drawdown */}
      <path d={path(dds, pyDD) + ` L${px(ticks.length-1)},${pyDD(0)} L${px(0)},${pyDD(0)} Z`} fill="var(--chart-area-fill)" />
      <path d={path(dds, pyDD)} fill="none" stroke="var(--brand)" strokeWidth="1" />
      <path d={path(bhDDs, pyDD)} fill="none" stroke="var(--down)" strokeWidth="0.8" opacity="0.5" />

      {/* Playhead */}
      <line x1={playX} x2={playX} y1={PRICE_Y} y2={DD_Y + DD_H} stroke="var(--brand)" strokeWidth="1" strokeDasharray="3,3" opacity="0.8" />
      <rect x={playX - 22} y={PRICE_Y - 14} width={44} height={13} rx={3} fill="var(--brand)" />
      <text x={playX} y={PRICE_Y - 5} fontSize="8.5" fill="white" textAnchor="middle" fontFamily="var(--font-mono)">
        {ticks[currentIdx]?.date ?? ''}
      </text>

      {/* X-axis labels */}
      {ticks.filter((_, i) => i % Math.max(1, Math.floor(ticks.length / 8)) === 0).map((t, i) => {
        const idx = ticks.indexOf(t);
        return <text key={i} x={px(idx)} y={TOTAL_H - 6} fontSize="8" fill="var(--text-tertiary)" textAnchor="middle">{t.date.slice(0, 7)}</text>;
      })}

      {/* Price Y-axis */}
      {[0, 0.5, 1].map((f, i) => {
        const v = minP + f * rngP;
        return <text key={i} x={PL - 3} y={pyP(v) + 3} fontSize="8.5" fill="var(--text-tertiary)" textAnchor="end" fontFamily="var(--font-mono)">{v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}</text>;
      })}
    </svg>
  );
}

/* ─── Screen 11: Live Trading Tab ───────────────────────────── */
interface ZdSession { apiKey: string; accessToken: string; userName: string; userId: string; }
interface ExecLogEntry { time: string; type: 'BUY'|'SELL'|'INFO'|'ERROR'; symbol: string; qty?: number; price?: number; msg: string; orderId?: string; paper?: boolean; }

function LiveTradingTab({ symbol, rsiPeriod, threshold, capital }: { symbol: string; rsiPeriod: number; threshold: number; capital: number }) {
  const [session,       setSession]       = useState<ZdSession | null>(null);
  const [showConnect,   setShowConnect]   = useState(false);
  const [apiKeyInput,   setApiKeyInput]   = useState('');
  const [apiSecretInput,setApiSecretInput]= useState('');
  const [connecting,    setConnecting]    = useState(false);
  const [connectError,  setConnectError]  = useState<string|null>(null);
  const [funds,         setFunds]         = useState<Record<string,unknown>|null>(null);
  const [positions,     setPositions]     = useState<unknown[]|null>(null);
  const [orders,        setOrders]        = useState<unknown[]|null>(null);
  const [armed,         setArmed]         = useState(false);
  const [paused,        setPaused]        = useState(false);
  const [execLog,       setExecLog]       = useState<ExecLogEntry[]>([]);
  const [orderQty,      setOrderQty]      = useState(1);
  const [orderType,     setOrderType]     = useState<'MARKET'|'LIMIT'>('MARKET');
  const [limitPrice,    setLimitPrice]    = useState('');
  const [paperMode,     setPaperMode]     = useState(false);
  const [placingOrder,  setPlacingOrder]  = useState(false);
  const [paperPos,      setPaperPos]      = useState<{qty: number; avgCost: number; cash: number}>({ qty: 0, avgCost: 0, cash: capital });
  const [liveAutoQty,   setLiveAutoQty]   = useState(0);
  const [checkingSignal,setCheckingSignal]= useState(false);
  const [nextCheckIn,   setNextCheckIn]   = useState(0);
  const monitorRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const POLL_SECS = 300; // 5 minutes

  /* Load session from localStorage on mount */
  useEffect(() => {
    const ak = localStorage.getItem('zd_api_key');
    const at = localStorage.getItem('zd_access_token');
    const un = localStorage.getItem('zd_user_name') ?? '';
    const ui = localStorage.getItem('zd_user_id') ?? '';
    if (ak && at) setSession({ apiKey: ak, accessToken: at, userName: un, userId: ui });
  }, []);

  /* Fetch live data when connected */
  useEffect(() => {
    if (!session) return;
    const qs = `api_key=${session.apiKey}&access_token=${session.accessToken}`;
    Promise.all([
      fetch(`/api/broker/zerodha/funds?${qs}`).then(r => r.json()),
      fetch(`/api/broker/zerodha/positions?${qs}`).then(r => r.json()),
      fetch(`/api/broker/zerodha/orders?${qs}`).then(r => r.json()),
    ]).then(([f, p, o]) => {
      if (!f.error)  setFunds(f);
      if (!p.error)  setPositions((p.net ?? p) as unknown[]);
      if (!o.error)  setOrders(Array.isArray(o) ? o : []);
    }).catch(() => {});
  }, [session]);

  useEffect(() => {
    if (monitorRef.current)  { clearInterval(monitorRef.current);  monitorRef.current  = null; }
    if (countdownRef.current){ clearInterval(countdownRef.current); countdownRef.current = null; }
    if (!armed || paused) { setNextCheckIn(0); return; }

    // Snapshot current refs so callbacks use latest values
    const runCheck = () => checkAndAutoExecute(paperPos, paperMode, liveAutoQty);

    // Immediate check on arm
    runCheck();
    setNextCheckIn(POLL_SECS);

    monitorRef.current = setInterval(() => {
      runCheck();
      setNextCheckIn(POLL_SECS);
    }, POLL_SECS * 1000);

    countdownRef.current = setInterval(() => {
      setNextCheckIn(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (monitorRef.current)  clearInterval(monitorRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [armed, paused]);

  const disconnect = () => {
    ['zd_api_key','zd_api_secret','zd_access_token','zd_user_name','zd_user_id','zd_connected_at']
      .forEach(k => localStorage.removeItem(k));
    setSession(null); setFunds(null); setPositions(null); setOrders(null); setArmed(false);
  };

  const handleConnect = async () => {
    if (!apiKeyInput || !apiSecretInput) { setConnectError('Both fields required'); return; }
    setConnecting(true); setConnectError(null);
    localStorage.setItem('zd_api_key',    apiKeyInput);
    localStorage.setItem('zd_api_secret', apiSecretInput);
    const res  = await fetch(`/api/broker/zerodha/connect?api_key=${apiKeyInput}`);
    const data = await res.json();
    if (data.error) { setConnectError(data.error); setConnecting(false); return; }
    window.location.href = data.loginUrl;
  };

  const placeOrder = async (side: 'BUY' | 'SELL') => {
    if (!session && !paperMode) return;
    setPlacingOrder(true);
    const entry: ExecLogEntry = {
      time: new Date().toLocaleTimeString('en-IN'),
      type: side, symbol: symbol.toUpperCase(), qty: orderQty,
      price: orderType === 'LIMIT' ? Number(limitPrice) : undefined,
      msg: paperMode ? `Paper ${side} ${orderQty} ${symbol}` : `Live ${side} ${orderQty} ${symbol}`,
      paper: paperMode,
    };
    if (paperMode) {
      setExecLog(prev => [{ ...entry, orderId: 'PAPER-' + Date.now() }, ...prev]);
      setPlacingOrder(false);
      return;
    }
    try {
      const res = await fetch('/api/broker/zerodha/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: session!.apiKey, access_token: session!.accessToken,
          tradingsymbol: symbol.toUpperCase(), exchange: 'NSE',
          transaction_type: side, quantity: orderQty,
          order_type: orderType, product: 'CNC',
          price: orderType === 'LIMIT' ? Number(limitPrice) : undefined,
          tag: 'AlphaForge',
        }),
      });
      const d = await res.json() as Record<string,unknown>;
      if (d.error) throw new Error(d.error as string);
      setExecLog(prev => [{ ...entry, orderId: d.order_id as string }, ...prev]);
    } catch (e) {
      setExecLog(prev => [{ time: entry.time, type: 'ERROR', symbol: symbol.toUpperCase(), msg: String(e) }, ...prev]);
    }
    setPlacingOrder(false);
  };

  const autoPlaceOrder = async (signal: 'BUY' | 'SELL', price: number, qty: number, isPaper: boolean) => {
    const entry: ExecLogEntry = {
      time: new Date().toLocaleTimeString('en-IN'),
      type: signal,
      symbol: symbol.toUpperCase(),
      qty,
      price,
      msg: `AUTO ${isPaper ? 'PAPER ' : ''}${signal} ${qty} × ${symbol.toUpperCase()} @ ₹${price.toFixed(2)}`,
      paper: isPaper,
    };
    if (isPaper) {
      setPaperPos(prev => {
        if (signal === 'BUY') {
          const cost = qty * price;
          return { qty, avgCost: price, cash: prev.cash - cost };
        } else {
          return { qty: 0, avgCost: 0, cash: prev.cash + qty * price };
        }
      });
      setExecLog(prev => [{ ...entry, orderId: 'PAPER-' + Date.now() }, ...prev.slice(0, 99)]);
      return;
    }
    try {
      const res = await fetch('/api/broker/zerodha/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: session!.apiKey, access_token: session!.accessToken,
          tradingsymbol: symbol.toUpperCase(), exchange: 'NSE',
          transaction_type: signal, quantity: qty,
          order_type: 'MARKET', product: 'CNC',
          tag: 'AlphaForge-Auto',
        }),
      });
      const d = await res.json() as Record<string, unknown>;
      if (d.error) throw new Error(d.error as string);
      if (signal === 'BUY') setLiveAutoQty(qty);
      else setLiveAutoQty(0);
      setExecLog(prev => [{ ...entry, orderId: d.order_id as string }, ...prev.slice(0, 99)]);
    } catch (e) {
      setExecLog(prev => [{ time: entry.time, type: 'ERROR', symbol: symbol.toUpperCase(), msg: `Auto ${signal} failed: ${e}` }, ...prev.slice(0, 99)]);
    }
  };

  const checkAndAutoExecute = useCallback(async (pos: { qty: number; avgCost: number; cash: number }, isPaper: boolean, liveQty: number) => {
    setCheckingSignal(true);
    try {
      const res = await fetch(`/api/stock/${symbol}/chart?range=3mo`);
      const data = await res.json() as { bars?: Array<{ t: string; c: number }> };
      if (!data?.bars?.length || data.bars.length < rsiPeriod + 2) {
        setExecLog(prev => [{ time: new Date().toLocaleTimeString('en-IN'), type: 'INFO', symbol: symbol.toUpperCase(), msg: 'Signal check: not enough bars' }, ...prev.slice(0, 99)]);
        return;
      }
      const closes = data.bars.map((b) => b.c);
      const rsiVals = rsi(closes, rsiPeriod);
      const n = rsiVals.length - 1;
      const curr = rsiVals[n]; const prev2 = rsiVals[n - 1];
      if (curr == null || prev2 == null) return;

      const currScore = curr / 100;
      const prevScore = prev2 / 100;
      const price = closes[n];

      let signal: 'BUY' | 'SELL' | null = null;
      const heldQty = isPaper ? pos.qty : liveQty;
      if (currScore > threshold && prevScore <= threshold && heldQty === 0) signal = 'BUY';
      if (currScore <= threshold && prevScore > threshold && heldQty > 0) signal = 'SELL';

      if (signal === 'BUY') {
        const availCash = isPaper ? pos.cash : capital;
        const qty = Math.max(1, Math.floor(availCash / price));
        await autoPlaceOrder('BUY', price, qty, isPaper);
      } else if (signal === 'SELL') {
        await autoPlaceOrder('SELL', price, heldQty, isPaper);
      } else {
        setExecLog(prev => [{
          time: new Date().toLocaleTimeString('en-IN'),
          type: 'INFO', symbol: symbol.toUpperCase(),
          msg: `Signal check · RSI ${curr.toFixed(1)} · threshold ${(threshold * 100).toFixed(0)} · no crossover`,
          paper: isPaper,
        }, ...prev.slice(0, 99)]);
      }
    } catch (e) {
      setExecLog(prev => [{ time: new Date().toLocaleTimeString('en-IN'), type: 'ERROR', symbol: symbol.toUpperCase(), msg: `Signal check error: ${e}` }, ...prev.slice(0, 99)]);
    }
    setCheckingSignal(false);
  }, [symbol, rsiPeriod, threshold, capital, session]);

  const equityFunds = (funds as Record<string, Record<string,unknown>> | null)?.equity;
  const availableMargin = equityFunds?.available_margin ?? equityFunds?.net;
  const usedMargin      = equityFunds?.utilised_margin ?? 0;
  const todayPnl = positions
    ? (positions as Array<Record<string,unknown>>).reduce((s, p) => s + (Number(p.pnl) || 0), 0)
    : null;
  const openPositions = positions
    ? (positions as Array<Record<string,unknown>>).filter(p => Number(p.quantity) !== 0)
    : [];

  const chipStyle = (active: boolean, color: string): React.CSSProperties => ({
    padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${color}`,
    background: active ? color + '22' : 'transparent', color: active ? color : 'var(--text-secondary)',
    cursor: 'pointer', fontSize: 11, fontWeight: 600,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Broker strip */}
      <div className="strip" style={{ padding: '10px 0' }}>
        <div className="strip__cell">
          <div className="section-label" style={{ marginBottom: 6 }}>Brokers</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => session ? disconnect() : setShowConnect(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, border: session ? '1.5px solid var(--up-dark)' : '0.5px solid var(--border-secondary)', background: 'none', cursor: 'pointer' }}>
              <span style={{ width: 20, height: 20, background: 'var(--zerodha)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 600 }}>Z</span>
              <span style={{ fontSize: 12 }}>Zerodha</span>
              <span style={{ fontSize: 10, color: session ? 'var(--up-dark)' : 'var(--text-tertiary)' }}>
                {session ? `· ${session.userName || session.userId}` : '· click to connect'}
              </span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, border: '0.5px dashed var(--border-secondary)', opacity: 0.5 }} title="Groww — coming soon">
              <span style={{ width: 20, height: 20, background: 'var(--groww)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 600 }}>G</span>
              <span style={{ fontSize: 12 }}>Groww</span>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>· coming soon</span>
            </div>
          </div>
        </div>
        <div className="strip__cell">
          <div className="section-label" style={{ marginBottom: 6 }}>Mode</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={chipStyle(!paperMode, 'var(--down)')} onClick={() => setPaperMode(false)}>Live</button>
            <button style={chipStyle(paperMode,  'var(--brand)')} onClick={() => setPaperMode(true)}>Paper</button>
          </div>
        </div>
        <div className="strip__cell">
          <div className="section-label" style={{ marginBottom: 6 }}>Strategy state</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: armed && !paused ? 'var(--up-dark)' : 'var(--text-secondary)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: armed && !paused ? 'var(--up-dark)' : 'var(--text-tertiary)', display: 'inline-block' }} />
            {!session && !paperMode ? 'Not armed · connect a broker to begin' : armed ? (paused ? 'Paused' : checkingSignal ? 'Checking signal…' : `Armed · next check ${nextCheckIn > 0 ? `in ${nextCheckIn}s` : '…'}`) : 'Idle · click Arm to start'}
          </div>
        </div>
        <div className="strip__cell">
          <div className="section-label" style={{ marginBottom: 6 }}>Controls</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn--primary btn--sm" disabled={!session && !paperMode} onClick={() => {
              if (armed) {
                setArmed(false); setPaused(false);
                if (!paperMode) return;  // reset paper on disarm? Keep it. Don't reset paper pos on disarm.
              } else {
                if (paperMode) setPaperPos({ qty: 0, avgCost: 0, cash: capital });
                setArmed(true); setPaused(false);
              }
            }}>
              {armed ? 'Disarm' : 'Arm strategy'}
            </button>
            <button className="btn btn--secondary btn--sm" disabled={!armed} onClick={() => setPaused(p => !p)}>
              {paused ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>
      </div>

      {/* Risk monitor */}
      <div className="strip" style={{ padding: '10px 0' }}>
        {[
          { label: 'Available margin', value: availableMargin != null ? `₹${Number(availableMargin).toLocaleString('en-IN')}` : '—', sub: session ? 'equity segment' : 'Connect broker' },
          { label: 'Margin used',      value: usedMargin != null ? `₹${Number(usedMargin).toLocaleString('en-IN')}` : '—', sub: '—' },
          { label: 'Today P&L',        value: todayPnl != null ? `${todayPnl >= 0 ? '+' : ''}₹${todayPnl.toLocaleString('en-IN')}` : '—', sub: todayPnl != null ? (todayPnl >= 0 ? 'profit' : 'loss') : '—' },
          { label: 'Open positions',   value: String(openPositions.length), sub: 'of 5 max' },
          { label: 'Orders today',     value: orders != null ? String(orders.length) : '—', sub: paperMode ? 'paper' : 'live' },
        ].map((cell) => (
          <div key={cell.label} className="strip__cell">
            <div className="section-label" style={{ marginBottom: 4 }}>{cell.label}</div>
            <div style={{ fontSize: 15, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: cell.label === 'Today P&L' && todayPnl != null ? (todayPnl >= 0 ? 'var(--up-dark)' : 'var(--down)') : undefined }}>{cell.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{cell.sub}</div>
          </div>
        ))}
      </div>

      {/* Strategy config card */}
      <div style={{ background: 'var(--bg-primary)', border: '0.5px solid var(--border-tertiary)', borderRadius: 10, padding: '12px 16px' }}>
        <div className="section-label" style={{ marginBottom: 8 }}>Strategy config</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12 }}>
          <div><span style={{ color: 'var(--text-secondary)' }}>RSI period </span><span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{rsiPeriod}</span></div>
          <div><span style={{ color: 'var(--text-secondary)' }}>Buy threshold </span><span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>RSI &gt; {(threshold * 100).toFixed(0)}</span></div>
          <div><span style={{ color: 'var(--text-secondary)' }}>Sell threshold </span><span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>RSI &lt; {(threshold * 100).toFixed(0)}</span></div>
          <div><span style={{ color: 'var(--text-secondary)' }}>Strategy capital </span><span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>₹{capital.toLocaleString('en-IN')}</span></div>
          <div><span style={{ color: 'var(--text-secondary)' }}>Poll interval </span><span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>5 min</span></div>
        </div>
      </div>

      {/* Paper positions */}
      {paperMode && (
        <div style={{ background: 'var(--bg-primary)', border: '0.5px solid var(--border-tertiary)', borderRadius: 10, padding: '12px 16px' }}>
          <div className="section-label" style={{ marginBottom: 8 }}>Paper account</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12 }}>
            <div>
              <div style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>Cash</div>
              <div style={{ fontWeight: 500 }}>₹{paperPos.cash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>Position</div>
              <div style={{ fontWeight: 500 }}>{paperPos.qty > 0 ? `${paperPos.qty} shares @ ₹${paperPos.avgCost.toFixed(2)}` : 'Flat'}</div>
            </div>
            {paperPos.qty > 0 && (
              <div>
                <div style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>Total capital</div>
                <div style={{ fontWeight: 500 }}>₹{(paperPos.cash + paperPos.qty * paperPos.avgCost).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connect modal */}
      {showConnect && !session && (
        <div style={{ background: 'var(--bg-primary)', border: '1.5px solid var(--brand)', borderRadius: 10, padding: '20px 24px' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Connect Zerodha Kite</div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Requires a <a href="https://developers.kite.trade/" target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>Kite Connect</a> app. Set redirect URL to <code style={{ fontSize: 11, background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: 3 }}>{typeof window !== 'undefined' ? window.location.origin : ''}/api/broker/zerodha/callback</code>
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>API Key</label>
              <input className="input" placeholder="kite_api_key" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>API Secret</label>
              <input className="input" type="password" placeholder="api_secret" value={apiSecretInput} onChange={e => setApiSecretInput(e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>
          {connectError && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 8 }}>{connectError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--primary btn--sm" onClick={handleConnect} disabled={connecting}>
              {connecting ? <><IconLoader2 size={13} className={styles.spin} /> Redirecting…</> : 'Login with Zerodha →'}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowConnect(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Manual order ticket */}
      {(session || paperMode) && (
        <div style={{ background: 'var(--bg-primary)', border: '0.5px solid var(--border-tertiary)', borderRadius: 10, padding: '14px 16px' }}>
          <div className="section-label" style={{ marginBottom: 10 }}>Order ticket — {symbol.toUpperCase()} {paperMode && <span style={{ color: 'var(--brand)', marginLeft: 4 }}>(paper)</span>}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Qty</span>
              <input className="input" type="number" min={1} value={orderQty} onChange={e => setOrderQty(Number(e.target.value))} style={{ width: 80 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Order type</span>
              <select className="input" value={orderType} onChange={e => setOrderType(e.target.value as 'MARKET'|'LIMIT')} style={{ width: 100 }}>
                <option value="MARKET">Market</option>
                <option value="LIMIT">Limit</option>
              </select>
            </label>
            {orderType === 'LIMIT' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Price (₹)</span>
                <input className="input" type="number" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} style={{ width: 100 }} placeholder="0.00" />
              </label>
            )}
            <button className="btn btn--sm" style={{ background: 'var(--up-dark)', color: '#fff', border: 'none' }} onClick={() => placeOrder('BUY')} disabled={placingOrder}>
              {placingOrder ? <IconLoader2 size={13} className={styles.spin} /> : null} BUY
            </button>
            <button className="btn btn--sm" style={{ background: 'var(--down)', color: '#fff', border: 'none' }} onClick={() => placeOrder('SELL')} disabled={placingOrder}>
              {placingOrder ? <IconLoader2 size={13} className={styles.spin} /> : null} SELL
            </button>
          </div>
        </div>
      )}

      {/* Open positions */}
      {openPositions.length > 0 && (
        <div style={{ background: 'var(--bg-primary)', border: '0.5px solid var(--border-tertiary)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border-tertiary)' }}><span className="section-label">Open positions</span></div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>{['Symbol','Qty','Avg price','LTP','P&L','Product'].map(h => (
              <th key={h} style={{ padding: '6px 12px', textAlign: h === 'Symbol' || h === 'Product' ? 'left' : 'right', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontWeight: 500 }}>{h}</th>
            ))}</tr></thead>
            <tbody>{openPositions.map((p, i) => {
              const pos = p as Record<string,unknown>;
              const pnl = Number(pos.pnl) || 0;
              return (
                <tr key={i}>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{String(pos.tradingsymbol)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{String(pos.quantity)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹{Number(pos.average_price).toFixed(2)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹{Number(pos.last_price).toFixed(2)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: pnl >= 0 ? 'var(--up-dark)' : 'var(--down)' }}>{pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}</td>
                  <td style={{ padding: '8px 12px' }}>{String(pos.product)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      {/* Execution log */}
      <div style={{ background: 'var(--bg-primary)', border: '0.5px solid var(--border-tertiary)', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="section-label">Execution log</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{execLog.length === 0 ? 'No events today' : `${execLog.length} event${execLog.length > 1 ? 's' : ''}`}</span>
        </div>
        {execLog.length === 0 ? (
          <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
            Orders and signals will appear here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {execLog.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '6px 0', borderBottom: '0.5px solid var(--border-tertiary)' }}>
                <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', minWidth: 60 }}>{e.time}</span>
                <span style={{ fontWeight: 600, color: e.type === 'BUY' ? 'var(--up-dark)' : e.type === 'SELL' ? 'var(--down)' : e.type === 'ERROR' ? 'var(--down)' : 'var(--text-secondary)', minWidth: 40 }}>{e.type}</span>
                <span style={{ flex: 1 }}>{e.msg}{e.paper && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--brand)' }}>paper</span>}</span>
                {e.orderId && <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{e.orderId}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="banner banner--caution" style={{ fontSize: 11 }}>
        <IconAlertTriangle size={13} />
        Live trading involves real financial risk. AlphaForge signals are not investment advice. Past backtest performance does not guarantee live results.
      </div>
    </div>
  );
}

/* ─── Multi-pane chart (Screen 7) ────────────────────────────── */
const CWC = 900, PADL = 52, PADR = 10, PADT = 12, RSI_H = 70, MACD_H = 70, VOL_H = 40;

function MultiPaneChart({ bars, indicators, activeIndicators, chartType }: {
  bars: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>;
  indicators: Record<string, (number | null)[]>;
  activeIndicators: Set<string>;
  chartType: 'line' | 'candle';
}) {
  const showVol = activeIndicators.has('volume');
  const showRSI = activeIndicators.has('rsi14');
  const showMACD= activeIndicators.has('macd');
  const showBB  = activeIndicators.has('bb');
  const showS20 = activeIndicators.has('sma20');
  const showS50 = activeIndicators.has('sma50');
  const showS200= activeIndicators.has('sma200');

  const paneH    = 280;
  const volPaneH = showVol  ? VOL_H  : 0;
  const rsiPaneH = showRSI  ? RSI_H  : 0;
  const macdH    = showMACD ? MACD_H : 0;
  const totalH   = PADT + paneH + volPaneH + rsiPaneH + macdH + 24;
  const cw       = CWC - PADL - PADR;

  const prices = bars.map((b) => b.c);
  const highs  = bars.map((b) => b.h);
  const lows   = bars.map((b) => b.l);
  const minP   = Math.min(...lows) * 0.998, maxP = Math.max(...highs) * 1.002, rngP = maxP - minP || 1;

  const px   = (i: number) => PADL + (i / (bars.length - 1 || 1)) * cw;
  const pyP  = (v: number) => PADT + (1 - (v - minP) / rngP) * paneH;

  const vols   = indicators.volume ?? bars.map((b) => b.v);
  const maxVol = Math.max(...(vols.filter((v) => v != null) as number[])) || 1;
  const volBase= PADT + paneH + volPaneH;
  const pyV    = (v: number) => volBase - (v / maxVol) * volPaneH;

  const rsiBase= PADT + paneH + volPaneH + rsiPaneH;
  const pyRSI  = (v: number) => (PADT + paneH + volPaneH) + (1 - v / 100) * rsiPaneH;

  const macdLine   = indicators.macdLine   ?? [];
  const macdSignal = indicators.macdSignal ?? [];
  const macdHist   = indicators.macdHist   ?? [];
  const defMacd    = macdHist.filter((v): v is number => v != null);
  const maxMacdV   = Math.max(...defMacd.map(Math.abs)) || 1;
  const macdMid    = rsiBase + macdH / 2;
  const pyMacd     = (v: number) => macdMid - (v / maxMacdV) * (macdH / 2);

  const linePath = (vals: (number | null)[], pyFn: (v: number) => number) => {
    let d = '';
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] == null) continue;
      d += `${(d === '' || vals[i-1] == null) ? 'M' : 'L'}${px(i).toFixed(1)},${pyFn(vals[i]!).toFixed(1)} `;
    }
    return d.trim();
  };
  const barW = Math.max(1, cw / bars.length * 0.7);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const xStep  = Math.max(1, Math.floor(bars.length / 8));

  return (
    <svg viewBox={`0 0 ${CWC} ${totalH}`} width="100%" style={{ display: 'block', background: 'var(--bg-primary)', border: '0.5px solid var(--border-tertiary)', borderRadius: 8 }}>
      {[0,0.25,0.5,0.75,1].map((f, i) => { const y = pyP(minP + f * rngP); return <line key={i} x1={PADL} x2={PADL+cw} y1={y} y2={y} stroke="var(--border-tertiary)" strokeWidth="0.5" />; })}
      {[0,0.25,0.5,0.75,1].map((f, i) => { const v = minP + f * rngP; return <text key={i} x={PADL-3} y={pyP(v)+3} fontSize="8" fill="var(--text-tertiary)" textAnchor="end" fontFamily="var(--font-mono)">{v>=1000?`${(v/1000).toFixed(1)}k`:v.toFixed(0)}</text>; })}
      {showBB && (<><path d={linePath(indicators.bbUpper??[], pyP)} fill="none" stroke="var(--caution)" strokeWidth="0.8" opacity="0.6" strokeDasharray="3,2"/><path d={linePath(indicators.bbLower??[], pyP)} fill="none" stroke="var(--caution)" strokeWidth="0.8" opacity="0.6" strokeDasharray="3,2"/></>)}
      {chartType === 'candle' ? bars.map((b,i)=>{ const isUp=b.c>=b.o; const col=isUp?'var(--up)':'var(--down)'; const y1=pyP(Math.min(b.o,b.c)),y2=pyP(Math.max(b.o,b.c)); return <g key={i}><line x1={px(i)} x2={px(i)} y1={pyP(b.h)} y2={pyP(b.l)} stroke={col} strokeWidth="0.8"/><rect x={px(i)-barW/2} y={y1} width={barW} height={Math.max(1,y2-y1)} fill={col}/></g>; }) : <path d={linePath(prices, pyP)} fill="none" stroke="var(--brand)" strokeWidth="1.4"/>}
      {showS20  && <path d={linePath(indicators.sma20??[], pyP)} fill="none" stroke="#E2A33C" strokeWidth="1"/>}
      {showS50  && <path d={linePath(indicators.sma50??[], pyP)} fill="none" stroke="#9B59B6" strokeWidth="1"/>}
      {showS200 && <path d={linePath(indicators.sma200??[], pyP)} fill="none" stroke="#E74C3C" strokeWidth="1"/>}
      {showVol && (<><line x1={PADL} x2={PADL+cw} y1={PADT+paneH} y2={PADT+paneH} stroke="var(--border-tertiary)" strokeWidth="0.5"/><text x={PADL-3} y={PADT+paneH+10} fontSize="7" fill="var(--text-tertiary)" textAnchor="end">VOL</text>{bars.map((b,i)=>{ const vol=(vols[i] as number)??0; if(!vol) return null; const bH=Math.max(1,volBase-pyV(vol)); return <rect key={i} x={px(i)-barW/2} y={pyV(vol)} width={barW} height={bH} fill={b.c>=b.o?'var(--up-bg)':'var(--down-bg)'}/>;})}</>)}
      {showRSI && (<><line x1={PADL} x2={PADL+cw} y1={PADT+paneH+volPaneH} y2={PADT+paneH+volPaneH} stroke="var(--border-tertiary)" strokeWidth="0.5"/><text x={PADL-3} y={PADT+paneH+volPaneH+10} fontSize="7" fill="var(--text-tertiary)" textAnchor="end">RSI</text><line x1={PADL} x2={PADL+cw} y1={pyRSI(70)} y2={pyRSI(70)} stroke="var(--down)" strokeWidth="0.5" strokeDasharray="3,2" opacity="0.5"/><line x1={PADL} x2={PADL+cw} y1={pyRSI(30)} y2={pyRSI(30)} stroke="var(--up)" strokeWidth="0.5" strokeDasharray="3,2" opacity="0.5"/><path d={linePath(indicators.rsi14??[], pyRSI)} fill="none" stroke="var(--brand)" strokeWidth="1"/></>)}
      {showMACD && (<><line x1={PADL} x2={PADL+cw} y1={rsiBase} y2={rsiBase} stroke="var(--border-tertiary)" strokeWidth="0.5"/><text x={PADL-3} y={rsiBase+10} fontSize="7" fill="var(--text-tertiary)" textAnchor="end">MACD</text><line x1={PADL} x2={PADL+cw} y1={macdMid} y2={macdMid} stroke="var(--border-secondary)" strokeWidth="0.5"/>{macdHist.map((v,i)=>{ if(v==null)return null; const y1=pyMacd(0),y2=pyMacd(v); return <rect key={i} x={px(i)-barW/2} y={Math.min(y1,y2)} width={barW} height={Math.abs(y1-y2)||1} fill={v>=0?'var(--up-bg)':'var(--down-bg)'}/>;})}<path d={linePath(macdLine, pyMacd)} fill="none" stroke="var(--brand)" strokeWidth="1"/><path d={linePath(macdSignal, pyMacd)} fill="none" stroke="var(--caution)" strokeWidth="0.8"/></>)}
      {bars.filter((_,i)=>i%xStep===0).map((b,i)=>{ const idx=bars.indexOf(b); const d=new Date(b.t); return <text key={i} x={px(idx)} y={totalH-6} fontSize="8" fill="var(--text-tertiary)" textAnchor="middle">{`${d.getDate()} ${months[d.getMonth()]}`}</text>; })}
    </svg>
  );
}
