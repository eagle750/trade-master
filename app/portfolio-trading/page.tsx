'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import GlobalNav from '@/components/GlobalNav';
import DisclaimerFooter from '@/components/DisclaimerFooter';
import { getMarketStatus } from '@/lib/marketStatus';
import { rsi } from '@/lib/indicators';
import { IconAlertTriangle, IconLoader2 } from '@tabler/icons-react';
import {
  getBasket, saveBasket, getConfig, saveConfig,
  getPaperPositions, savePaperPositions,
  importFromScreener,
  DEFAULT_CONFIG,
} from '@/lib/portfolioBasket';
import type { BasketStock, PortfolioConfig, PaperPos } from '@/lib/portfolioBasket';

interface MonitorRow {
  symbol:      string;
  name:        string;
  rsiValue:    number | null;
  signal:      'BUY' | 'SELL' | null;
  lastChecked: string | null;
  checking:    boolean;
  error:       string | null;
}

interface ExecLogEntry {
  time:     string;
  type:     'BUY' | 'SELL' | 'INFO' | 'ERROR';
  symbol:   string;
  qty?:     number;
  price?:   number;
  msg:      string;
  orderId?: string;
  paper:    boolean;
}

interface ZdSession { apiKey: string; accessToken: string; userName: string; userId: string; }

type Tab = 'basket' | 'configure' | 'monitor';

const POLL_SECS = 300;

export default function PortfolioTradingPage() {
  const { status, time, reason } = getMarketStatus();

  /* ── basket ── */
  const [basket,        setBasket]        = useState<BasketStock[]>([]);
  const [searchQ,       setSearchQ]       = useState('');
  const [searchRes,     setSearchRes]     = useState<Array<{ symbol: string; name: string; sub?: string }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── config ── */
  const [config,    setConfig]    = useState<PortfolioConfig>(DEFAULT_CONFIG);
  const [paperMode, setPaperMode] = useState(true);

  /* ── session ── */
  const [session, setSession] = useState<ZdSession | null>(null);

  /* ── monitor ── */
  const [tab,             setTab]             = useState<Tab>('basket');
  const [armed,           setArmed]           = useState(false);
  const [paused,          setPaused]          = useState(false);
  const [rows,            setRows]            = useState<MonitorRow[]>([]);
  const [paperPositions,  setPaperPositions]  = useState<Record<string, PaperPos>>({});
  const [liveQtys,        setLiveQtys]        = useState<Record<string, number>>({});
  const [execLog,         setExecLog]         = useState<ExecLogEntry[]>([]);
  const [nextCheckIn,     setNextCheckIn]     = useState(0);

  const monitorRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── load from localStorage on mount ── */
  useEffect(() => {
    setBasket(getBasket());
    setConfig(getConfig());
    setPaperPositions(getPaperPositions());
    const ak = localStorage.getItem('zd_api_key');
    const at = localStorage.getItem('zd_access_token');
    if (ak && at) setSession({
      apiKey: ak, accessToken: at,
      userName: localStorage.getItem('zd_user_name') ?? '',
      userId:   localStorage.getItem('zd_user_id')   ?? '',
    });
  }, []);

  /* ── search ── */
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!searchQ.trim()) { setSearchRes([]); return; }
    setSearchLoading(true);
    searchDebounce.current = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(searchQ)}`)
        .then((r) => r.json())
        .then((d) => setSearchRes((d.results ?? []).filter((r: { type: string }) => r.type === 'stock')))
        .catch(() => setSearchRes([]))
        .finally(() => setSearchLoading(false));
    }, 300);
  }, [searchQ]);

  /* ── basket actions ── */
  const addStock = (symbol: string, name: string) => {
    if (basket.some((b) => b.symbol === symbol)) return;
    const updated = [...basket, { symbol, name, addedAt: new Date().toISOString(), source: 'manual' as const }];
    setBasket(updated);
    saveBasket(updated);
    setSearchQ('');
    setSearchRes([]);
  };

  const removeStock = (symbol: string) => {
    const updated = basket.filter((b) => b.symbol !== symbol);
    setBasket(updated);
    saveBasket(updated);
  };

  const handleImport = () => {
    const { added, total } = importFromScreener();
    if (total === 0) { alert('No saved strategy found. Save a strategy from the Funnel page first.'); return; }
    setBasket(getBasket());
    alert(`Added ${added} new stocks (${total} in strategy).`);
  };

  const updateConfig = (patch: Partial<PortfolioConfig>) => {
    const updated = { ...config, ...patch };
    setConfig(updated);
    saveConfig(updated);
  };

  /* ── core signal check for one stock ── */
  const checkStock = useCallback(async (
    symbol: string,
    cfg:    PortfolioConfig,
    isPaper: boolean,
    paperPos: Record<string, PaperPos>,
    liveQ:    Record<string, number>,
    openCount: number,
  ) => {
    const res  = await fetch(`/api/stock/${symbol}/chart?range=3mo`);
    const data = await res.json() as { bars?: Array<{ c: number }> };
    if (!data?.bars?.length || data.bars.length < cfg.rsiPeriod + 2) return null;

    const closes  = data.bars.map((b) => b.c);
    const rsiVals = rsi(closes, cfg.rsiPeriod);
    const n       = rsiVals.length - 1;
    const curr    = rsiVals[n];
    const prev    = rsiVals[n - 1];
    if (curr == null || prev == null) return null;

    const threshScore = cfg.threshold;
    const price       = closes[n];
    const heldQty     = isPaper ? (paperPos[symbol]?.qty ?? 0) : (liveQ[symbol] ?? 0);

    let signal: 'BUY' | 'SELL' | null = null;
    if (curr > threshScore && prev <= threshScore && heldQty === 0 && openCount < cfg.maxPositions) signal = 'BUY';
    if (curr <= threshScore && prev > threshScore && heldQty > 0)                                   signal = 'SELL';

    return { rsiValue: curr, signal, price, heldQty };
  }, []);

  /* ── auto-execute an order ── */
  const autoExecute = useCallback(async (
    signal:  'BUY' | 'SELL',
    symbol:  string,
    price:   number,
    qty:     number,
    isPaper: boolean,
    avgCost: number,
  ) => {
    const entry: ExecLogEntry = {
      time: new Date().toLocaleTimeString('en-IN'),
      type: signal, symbol, qty, price,
      msg:  `AUTO ${isPaper ? 'PAPER ' : ''}${signal} ${qty} × ${symbol} @ ₹${price.toFixed(2)}${signal === 'SELL' ? ` · P&L ₹${((price - avgCost) * qty).toFixed(0)}` : ''}`,
      paper: isPaper,
    };

    if (isPaper) {
      setPaperPositions((prev) => {
        const updated = { ...prev };
        if (signal === 'BUY') updated[symbol] = { qty, avgCost: price };
        else                  delete updated[symbol];
        savePaperPositions(updated);
        return updated;
      });
      setExecLog((prev) => [{ ...entry, orderId: 'PAPER-' + Date.now() }, ...prev.slice(0, 99)]);
      return;
    }

    if (!session) return;
    try {
      const r = await fetch('/api/broker/zerodha/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: session.apiKey, access_token: session.accessToken,
          tradingsymbol: symbol, exchange: 'NSE',
          transaction_type: signal, quantity: qty,
          order_type: 'MARKET', product: 'CNC',
          tag: 'AlphaForge-Portfolio',
        }),
      });
      const d = await r.json() as Record<string, unknown>;
      if (d.error) throw new Error(d.error as string);
      setLiveQtys((prev) => signal === 'BUY' ? { ...prev, [symbol]: qty } : (() => { const n = { ...prev }; delete n[symbol]; return n; })());
      setExecLog((prev) => [{ ...entry, orderId: d.order_id as string }, ...prev.slice(0, 99)]);
    } catch (e) {
      setExecLog((prev) => [{ time: entry.time, type: 'ERROR', symbol, msg: `${signal} failed: ${e}`, paper: false }, ...prev.slice(0, 99)]);
    }
  }, [session]);

  /* ── check all stocks in basket ── */
  const checkAllSignals = useCallback(async () => {
    const currentBasket = getBasket();
    const cfg           = getConfig();
    if (!currentBasket.length) return;

    for (const stock of currentBasket) {
      setRows((prev) => prev.map((r) => r.symbol === stock.symbol ? { ...r, checking: true, error: null } : r));

      try {
        const currentPaperPos  = getPaperPositions();
        const openCount        = Object.values(currentPaperPos).filter((p) => p.qty > 0).length;
        const result           = await checkStock(stock.symbol, cfg, paperMode, currentPaperPos, liveQtys, openCount);

        if (result) {
          const { rsiValue, signal, price, heldQty } = result;

          if (signal === 'BUY' && price) {
            const capitalPerStock = cfg.capital / cfg.maxPositions;
            const qty = Math.max(1, Math.floor(capitalPerStock / price));
            await autoExecute('BUY', stock.symbol, price, qty, paperMode, price);
          } else if (signal === 'SELL' && price && heldQty > 0) {
            const avgCost = currentPaperPos[stock.symbol]?.avgCost ?? price;
            await autoExecute('SELL', stock.symbol, price, heldQty, paperMode, avgCost);
          } else if (rsiValue != null) {
            setExecLog((prev) => [{
              time: new Date().toLocaleTimeString('en-IN'), type: 'INFO',
              symbol: stock.symbol,
              msg: `Signal check · RSI ${rsiValue.toFixed(1)} · threshold ${cfg.threshold} · HOLD`,
              paper: paperMode,
            }, ...prev.slice(0, 99)]);
          }

          setRows((prev) => prev.map((r) => r.symbol === stock.symbol
            ? { ...r, rsiValue: rsiValue ?? null, signal, lastChecked: new Date().toISOString(), checking: false }
            : r));
        }
      } catch (e) {
        setRows((prev) => prev.map((r) => r.symbol === stock.symbol ? { ...r, checking: false, error: String(e) } : r));
      }

      /* stagger requests to avoid API rate limits */
      await new Promise<void>((res) => setTimeout(res, 600));
    }
  }, [paperMode, liveQtys, checkStock, autoExecute]);

  /* ── start / stop monitor ── */
  useEffect(() => {
    if (monitorRef.current)   { clearInterval(monitorRef.current);   monitorRef.current   = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (!armed || paused) { setNextCheckIn(0); return; }

    checkAllSignals();
    setNextCheckIn(POLL_SECS);

    monitorRef.current = setInterval(() => {
      checkAllSignals();
      setNextCheckIn(POLL_SECS);
    }, POLL_SECS * 1000);

    countdownRef.current = setInterval(() => setNextCheckIn((p) => Math.max(0, p - 1)), 1000);

    return () => {
      if (monitorRef.current)   clearInterval(monitorRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [armed, paused, checkAllSignals]);

  /* ── init rows when entering monitor tab ── */
  useEffect(() => {
    if (tab === 'monitor') {
      setRows(basket.map((b) => ({
        symbol: b.symbol, name: b.name,
        rsiValue: null, signal: null,
        lastChecked: null, checking: false, error: null,
      })));
    }
  }, [tab, basket]);

  /* ── derived ── */
  const openPaperCount  = Object.values(paperPositions).filter((p) => p.qty > 0).length;
  const totalInvested   = Object.values(paperPositions).reduce((s, p) => s + p.qty * p.avgCost, 0);
  const paperCashRemain = config.capital - totalInvested;
  const capitalPerStock = Math.floor(config.capital / config.maxPositions);

  /* ── styles ── */
  const card: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '0.5px solid var(--border-tertiary)',
    borderRadius: 10, padding: 16,
  };
  const chip = (active: boolean, color: string): React.CSSProperties => ({
    padding: '3px 12px', borderRadius: 20, border: `1.5px solid ${color}`,
    background: active ? color + '22' : 'transparent',
    color: active ? color : 'var(--text-secondary)',
    cursor: 'pointer', fontSize: 11, fontWeight: 600,
  });
  const th: React.CSSProperties = {
    padding: '7px 12px', textAlign: 'left', background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)', fontWeight: 500, fontSize: 11,
    borderBottom: '0.5px solid var(--border-tertiary)',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)' }}>
      <GlobalNav marketStatus={status} marketStatusTime={time} marketStatusReason={reason} />

      <div className="page-container" style={{ paddingTop: 24, paddingBottom: 48 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Portfolio Trading</h1>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Monitor a basket of stocks · auto-trade on RSI signals · {paperMode ? 'Paper mode' : 'Live mode'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <button style={chip(!paperMode, 'var(--down)')} onClick={() => { setPaperMode(false); setArmed(false); }}>Live</button>
            <button style={chip(paperMode, 'var(--brand)')} onClick={() => { setPaperMode(true);  setArmed(false); }}>Paper</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '0.5px solid var(--border-tertiary)', marginBottom: 20 }}>
          {(['basket', 'configure', 'monitor'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: tab === t ? '2px solid var(--text-primary)' : '2px solid transparent',
              marginBottom: -1, textTransform: 'capitalize',
            }}>
              {t === 'basket' ? `Basket (${basket.length})` : t}
            </button>
          ))}
        </div>

        {/* ─── BASKET TAB ─── */}
        {tab === 'basket' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={card}>
              <div className="section-label" style={{ marginBottom: 10 }}>Add stocks</div>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <input
                  className="input" style={{ width: '100%' }}
                  placeholder="Search NSE stocks (e.g. RELIANCE, INFY)…"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                />
                {searchLoading && (
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                    <IconLoader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-tertiary)' }} />
                  </span>
                )}
              </div>
              {searchRes.length > 0 && (
                <div style={{ border: '0.5px solid var(--border-tertiary)', borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
                  {searchRes.map((r) => (
                    <button key={r.symbol} onClick={() => addStock(r.symbol, r.name)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px',
                      background: 'none', border: 'none', borderBottom: '0.5px solid var(--border-tertiary)',
                      cursor: 'pointer', textAlign: 'left',
                    }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, minWidth: 90 }}>{r.symbol}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{r.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginRight: 8 }}>{r.sub ?? 'NSE'}</span>
                      <span style={{ fontSize: 10, color: 'var(--brand)' }}>+ Add</span>
                    </button>
                  ))}
                </div>
              )}
              <button className="btn btn--ghost btn--sm" onClick={handleImport}>
                Import from last saved strategy
              </button>
            </div>

            {basket.length === 0 ? (
              <div style={{ ...card, textAlign: 'center', padding: '40px 16px', color: 'var(--text-tertiary)', fontSize: 13 }}>
                No stocks in basket. Search above or import from your saved strategy in the Funnel page.
              </div>
            ) : (
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border-tertiary)' }}>
                  <span className="section-label">{basket.length} stocks in basket</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Symbol', 'Name', 'Source', 'Added', ''].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {basket.map((b) => (
                      <tr key={b.symbol} style={{ borderBottom: '0.5px solid var(--border-tertiary)' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          <a href={`/stock/${b.symbol}`} target="_blank" rel="noreferrer"
                            style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                            {b.symbol}
                          </a>
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{b.name}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            padding: '2px 7px', borderRadius: 10, fontSize: 10,
                            background: b.source === 'screener' ? 'var(--brand-bg)' : 'var(--bg-secondary)',
                            color: b.source === 'screener' ? 'var(--brand)' : 'var(--text-secondary)',
                          }}>
                            {b.source}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-tertiary)' }}>
                          {new Date(b.addedAt).toLocaleDateString('en-IN')}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <button onClick={() => removeStock(b.symbol)} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-tertiary)', fontSize: 14, padding: '0 4px',
                          }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── CONFIGURE TAB ─── */}
        {tab === 'configure' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={card}>
              <div className="section-label" style={{ marginBottom: 16 }}>Strategy parameters</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>RSI Period</span>
                  <input className="input" type="number" min={5} max={50}
                    value={config.rsiPeriod} onChange={(e) => updateConfig({ rsiPeriod: Number(e.target.value) })} />
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Default: 14. Shorter = more signals, more noise.</span>
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>RSI Threshold — {config.threshold}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="range" min={20} max={80} value={config.threshold}
                      onChange={(e) => updateConfig({ threshold: Number(e.target.value) })} style={{ flex: 1 }} />
                    <span style={{ fontWeight: 600, minWidth: 28 }}>{config.threshold}</span>
                  </div>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                    BUY when RSI crosses above {config.threshold} · SELL when crosses below
                  </span>
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Capital (₹)</span>
                  <input className="input" type="number" min={10000} step={10000}
                    value={config.capital} onChange={(e) => updateConfig({ capital: Number(e.target.value) })} />
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Split equally across max positions.</span>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Max Concurrent Positions</span>
                  <input className="input" type="number" min={1} max={Math.max(basket.length, 10)}
                    value={config.maxPositions} onChange={(e) => updateConfig({ maxPositions: Number(e.target.value) })} />
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                    Capital per stock: ₹{capitalPerStock.toLocaleString('en-IN')}
                  </span>
                </label>

              </div>
            </div>

            <div style={{ ...card, background: 'var(--bg-secondary)', fontSize: 12 }}>
              <div className="section-label" style={{ marginBottom: 8 }}>Summary</div>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', color: 'var(--text-secondary)' }}>
                <div>Basket: <strong style={{ color: 'var(--text-primary)' }}>{basket.length} stocks</strong></div>
                <div>Capital per stock: <strong style={{ color: 'var(--text-primary)' }}>₹{capitalPerStock.toLocaleString('en-IN')}</strong></div>
                <div>Signal: <strong style={{ color: 'var(--text-primary)' }}>RSI({config.rsiPeriod}) cross {config.threshold}</strong></div>
                <div>Mode: <strong style={{ color: paperMode ? 'var(--brand)' : 'var(--down)' }}>{paperMode ? 'Paper' : 'Live'}</strong></div>
                <div>Poll interval: <strong style={{ color: 'var(--text-primary)' }}>5 min</strong></div>
              </div>
            </div>

            <div className="banner banner--caution" style={{ fontSize: 11 }}>
              <IconAlertTriangle size={13} />
              Config changes take effect from the next signal check cycle. They are auto-saved to your browser.
            </div>
          </div>
        )}

        {/* ─── MONITOR TAB ─── */}
        {tab === 'monitor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Controls strip */}
            <div className="strip" style={{ padding: '10px 0' }}>
              <div className="strip__cell">
                <div className="section-label" style={{ marginBottom: 4 }}>Status</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: armed && !paused ? 'var(--up-dark)' : 'var(--text-secondary)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0, background: armed && !paused ? 'var(--up-dark)' : 'var(--text-tertiary)' }} />
                  {!armed
                    ? 'Idle · click Arm all to start'
                    : paused
                    ? 'Paused'
                    : nextCheckIn > 0
                    ? `Armed · next check in ${nextCheckIn}s`
                    : 'Armed · checking…'}
                </div>
              </div>
              <div className="strip__cell">
                <div className="section-label" style={{ marginBottom: 4 }}>Basket</div>
                <div style={{ fontSize: 12 }}>{basket.length} stocks</div>
              </div>
              {paperMode && (
                <>
                  <div className="strip__cell">
                    <div className="section-label" style={{ marginBottom: 4 }}>Open positions</div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{openPaperCount}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>of {config.maxPositions} max</div>
                  </div>
                  <div className="strip__cell">
                    <div className="section-label" style={{ marginBottom: 4 }}>Capital deployed</div>
                    <div style={{ fontSize: 15, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                      ₹{totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      ₹{paperCashRemain.toLocaleString('en-IN', { maximumFractionDigits: 0 })} free
                    </div>
                  </div>
                </>
              )}
              <div className="strip__cell">
                <div className="section-label" style={{ marginBottom: 4 }}>Controls</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn--primary btn--sm"
                    disabled={basket.length === 0}
                    onClick={() => {
                      if (armed) {
                        setArmed(false); setPaused(false);
                      } else {
                        if (paperMode) { savePaperPositions({}); setPaperPositions({}); }
                        setLiveQtys({}); setExecLog([]);
                        setArmed(true); setPaused(false);
                      }
                    }}
                  >
                    {armed ? 'Disarm' : 'Arm all'}
                  </button>
                  <button className="btn btn--secondary btn--sm" disabled={!armed} onClick={() => setPaused((p) => !p)}>
                    {paused ? 'Resume' : 'Pause'}
                  </button>
                </div>
              </div>
            </div>

            {/* Signal table */}
            {basket.length === 0 ? (
              <div style={{ ...card, textAlign: 'center', padding: '40px 16px', color: 'var(--text-tertiary)', fontSize: 13 }}>
                Add stocks to the basket first, then come back to monitor.
              </div>
            ) : (
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Symbol', `RSI(${config.rsiPeriod})`, 'Signal', 'Position', 'Avg Cost', 'Last Checked', 'Status'].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(rows.length > 0 ? rows : basket.map((b) => ({
                      symbol: b.symbol, name: b.name,
                      rsiValue: null, signal: null,
                      lastChecked: null, checking: false, error: null,
                    }))).map((row) => {
                      const pos = paperPositions[row.symbol];
                      return (
                        <tr key={row.symbol} style={{ borderBottom: '0.5px solid var(--border-tertiary)' }}>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            <a href={`/stock/${row.symbol}`} target="_blank" rel="noreferrer"
                              style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                              {row.symbol}
                            </a>
                          </td>
                          <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>
                            {row.rsiValue != null
                              ? <span style={{ color: row.rsiValue > config.threshold ? 'var(--up-dark)' : 'var(--down)' }}>{row.rsiValue.toFixed(1)}</span>
                              : '—'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {row.signal
                              ? <span style={{
                                  padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                                  background: row.signal === 'BUY' ? 'var(--up-bg)' : 'var(--down-bg)',
                                  color: row.signal === 'BUY' ? 'var(--up-dark)' : 'var(--down)',
                                }}>{row.signal}</span>
                              : row.rsiValue != null
                              ? <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>HOLD</span>
                              : '—'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {pos?.qty
                              ? <span style={{ color: 'var(--up-dark)' }}>{pos.qty} shares</span>
                              : <span style={{ color: 'var(--text-tertiary)' }}>Flat</span>}
                          </td>
                          <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>
                            {pos?.avgCost ? `₹${pos.avgCost.toFixed(2)}` : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-tertiary)' }}>
                            {row.lastChecked ? new Date(row.lastChecked).toLocaleTimeString('en-IN') : '—'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {row.checking
                              ? <span style={{ fontSize: 11, color: 'var(--brand)' }}>checking…</span>
                              : row.error
                              ? <span style={{ fontSize: 11, color: 'var(--down)' }} title={row.error}>error</span>
                              : <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Execution log */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="section-label">Execution log</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {execLog.length === 0 ? 'No events' : `${execLog.length} events`}
                </span>
              </div>
              {execLog.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                  Arm the portfolio to start monitoring. Signals and orders will appear here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
                  {execLog.map((e, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '6px 0', borderBottom: '0.5px solid var(--border-tertiary)' }}>
                      <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', minWidth: 60 }}>{e.time}</span>
                      <span style={{ fontWeight: 600, minWidth: 40, color: e.type === 'BUY' ? 'var(--up-dark)' : e.type === 'SELL' ? 'var(--down)' : e.type === 'ERROR' ? 'var(--down)' : 'var(--text-secondary)' }}>
                        {e.type}
                      </span>
                      <span style={{ flex: 1 }}>{e.msg}{e.paper && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--brand)' }}>paper</span>}</span>
                      {e.orderId && <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{e.orderId}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="banner banner--caution" style={{ fontSize: 11 }}>
              <IconAlertTriangle size={13} />
              {paperMode
                ? 'Paper mode — no real orders are placed. This simulates strategy execution only.'
                : 'Live trading involves real financial risk. AlphaForge signals are not investment advice.'}
            </div>
          </div>
        )}

      </div>

      <DisclaimerFooter />
    </div>
  );
}
