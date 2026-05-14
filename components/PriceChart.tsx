'use client';

import { useState, useCallback, useRef } from 'react';
import styles from './PriceChart.module.css';

interface Bar { t: string; c: number; h: number; l: number; o: number; v: number }

interface Props {
  symbol:    string;
  bars:      Bar[];
  high52w:   number;
  low52w:    number;
  currentPrice: number;
  isLoading?:boolean;
}

const TIMEFRAMES = ['1D','5D','1M','3M','6M','1Y','5Y','Max'] as const;
type TF = typeof TIMEFRAMES[number];

const W = 800, H = 200;
const PAD = { l: 50, r: 60, t: 16, b: 28 };

function formatAxisPrice(v: number) {
  if (v >= 100000) return `${(v/1000).toFixed(0)}k`;
  if (v >= 1000)   return `${(v/1000).toFixed(1)}k`;
  return v.toFixed(0);
}

function formatAxisDate(iso: string, tf: TF) {
  const d = new Date(iso);
  if (tf === '1D' || tf === '5D') return `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`;
  if (tf === '1M' || tf === '3M' || tf === '6M') return `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`;
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
}

export default function PriceChart({ symbol, bars, high52w, low52w, currentPrice, isLoading }: Props) {
  const [tf, setTf] = useState<TF>('1Y');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; price: number; date: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const onTimeframeChange = useCallback((newTf: TF) => setTf(newTf), []);

  if (isLoading || bars.length === 0) {
    return (
      <div className={styles.card}>
        <div className={styles.toolbar}>
          <span className={styles.symbolLabel + ' section-label'}>{symbol}</span>
          <div className={styles.tfPills}>
            {TIMEFRAMES.map((t) => (
              <button key={t} className={'btn btn--ghost btn--xs ' + styles.tfBtn + (t === tf ? ' ' + styles.tfActive : '')} onClick={() => onTimeframeChange(t)}>{t}</button>
            ))}
          </div>
        </div>
        <div className="skeleton" style={{ height: H + PAD.t + PAD.b, borderRadius: 4 }} />
      </div>
    );
  }

  /* --- Compute chart geometry --- */
  const prices = bars.map((b) => b.c);
  const minP   = Math.min(...prices) * 0.995;
  const maxP   = Math.max(...prices) * 1.005;
  const rangeP = maxP - minP || 1;

  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const px = (i: number) => PAD.l + (i / (bars.length - 1)) * chartW;
  const py = (price: number) => PAD.t + (1 - (price - minP) / rangeP) * chartH;

  const points = bars.map((b, i) => `${px(i).toFixed(1)},${py(b.c).toFixed(1)}`).join(' ');
  const areaPath = `M${px(0).toFixed(1)},${py(bars[0].c).toFixed(1)} ${bars.slice(1).map((b, i) => `L${px(i + 1).toFixed(1)},${py(b.c).toFixed(1)}`).join(' ')} L${px(bars.length-1).toFixed(1)},${(PAD.t+chartH).toFixed(1)} L${PAD.l},${(PAD.t+chartH).toFixed(1)} Z`;

  /* Y-axis ticks */
  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minP + (i / yTicks) * rangeP);

  /* X-axis ticks — sample ~6 */
  const xStep  = Math.max(1, Math.floor(bars.length / 6));
  const xTicks = bars.filter((_, i) => i % xStep === 0 || i === bars.length - 1);

  /* 52W lines (only if in visible range) */
  const show52H = high52w >= minP && high52w <= maxP;
  const show52L = low52w  >= minP && low52w  <= maxP;

  /* Current price tag */
  const lastPy = py(currentPrice);

  /* Hover */
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = (e.clientX - rect.left) * (W / rect.width);
    const idx  = Math.min(bars.length - 1, Math.max(0, Math.round((svgX - PAD.l) / chartW * (bars.length - 1))));
    setTooltip({ x: px(idx), y: py(bars[idx].c), price: bars[idx].c, date: bars[idx].t });
  };

  const isUp = bars.length > 1 ? bars[bars.length - 1].c >= bars[0].c : true;

  return (
    <div className={styles.card}>
      <div className={styles.toolbar}>
        <span className={styles.symbolLabel + ' section-label'}>{symbol} · {tf}</span>
        <div className={styles.tfPills}>
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              className={'btn btn--ghost btn--xs ' + styles.tfBtn + (t === tf ? ' ' + styles.tfActive : '')}
              onClick={() => onTimeframeChange(t)}
            >{t}</button>
          ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid lines */}
        {yTickVals.map((v, i) => (
          <line key={i}
            x1={PAD.l} x2={PAD.l + chartW}
            y1={py(v).toFixed(1)} y2={py(v).toFixed(1)}
            stroke="var(--border-tertiary)" strokeWidth="0.5"
          />
        ))}

        {/* 52W high/low dashed lines */}
        {show52H && (
          <>
            <line x1={PAD.l} x2={PAD.l + chartW} y1={py(high52w)} y2={py(high52w)} stroke="var(--chart-line-benchmark)" strokeWidth="0.8" strokeDasharray="4,3" opacity="0.7"/>
            <text x={PAD.l + chartW + 3} y={py(high52w) + 4} fontSize="8" fill="var(--text-tertiary)">52W H</text>
          </>
        )}
        {show52L && (
          <>
            <line x1={PAD.l} x2={PAD.l + chartW} y1={py(low52w)} y2={py(low52w)} stroke="var(--chart-line-benchmark)" strokeWidth="0.8" strokeDasharray="4,3" opacity="0.7"/>
            <text x={PAD.l + chartW + 3} y={py(low52w) + 4} fontSize="8" fill="var(--text-tertiary)">52W L</text>
          </>
        )}

        {/* Area fill */}
        <path d={areaPath} fill={isUp ? 'var(--chart-area-fill)' : 'var(--chart-area-down)'} />

        {/* Price line */}
        <polyline points={points} fill="none"
          stroke={isUp ? 'var(--brand)' : 'var(--down)'}
          strokeWidth="1.5" />

        {/* Y-axis labels */}
        {yTickVals.map((v, i) => (
          <text key={i} x={PAD.l - 4} y={py(v) + 3} fontSize="9" fill="var(--text-tertiary)" textAnchor="end" fontFamily="var(--font-mono)">{formatAxisPrice(v)}</text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((b, i) => (
          <text key={i} x={px(bars.indexOf(b))} y={H - 4} fontSize="9" fill="var(--text-tertiary)" textAnchor="middle">{formatAxisDate(b.t, tf)}</text>
        ))}

        {/* Current price tag */}
        <circle cx={px(bars.length - 1)} cy={lastPy} r={3.5} fill={isUp ? 'var(--brand)' : 'var(--down)'} />
        <rect x={px(bars.length - 1) + 5} y={lastPy - 8} width={42} height={14} rx={3} fill={isUp ? 'var(--brand)' : 'var(--down)'} />
        <text x={px(bars.length - 1) + 26} y={lastPy + 3} fontSize="8" fill="white" textAnchor="middle" fontFamily="var(--font-mono)">
          ₹{currentPrice >= 1000 ? (currentPrice/1000).toFixed(1)+'k' : currentPrice.toFixed(0)}
        </text>

        {/* Hover crosshair */}
        {tooltip && (
          <>
            <line x1={tooltip.x} x2={tooltip.x} y1={PAD.t} y2={PAD.t + chartH} stroke="var(--text-secondary)" strokeWidth="0.8" strokeDasharray="3,2" />
            <circle cx={tooltip.x} cy={tooltip.y} r={3.5} fill={isUp ? 'var(--brand)' : 'var(--down)'} stroke="white" strokeWidth="1.5" />
            <rect x={Math.min(tooltip.x + 6, W - 100)} y={Math.max(PAD.t, tooltip.y - 20)} width={90} height={30} rx={4} fill="var(--bg-primary)" stroke="var(--border-secondary)" strokeWidth="0.5" />
            <text x={Math.min(tooltip.x + 51, W - 55)} y={Math.max(PAD.t, tooltip.y - 20) + 11} fontSize="8.5" fill="var(--text-primary)" textAnchor="middle" fontFamily="var(--font-mono)">
              ₹{tooltip.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </text>
            <text x={Math.min(tooltip.x + 51, W - 55)} y={Math.max(PAD.t, tooltip.y - 20) + 23} fontSize="8" fill="var(--text-tertiary)" textAnchor="middle">
              {new Date(tooltip.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
            </text>
          </>
        )}
      </svg>

      {/* 52W footer */}
      <div className={styles.footer52w}>
        <span className="num">52W high <strong>₹{high52w.toLocaleString('en-IN')}</strong></span>
        <span className="num">52W low <strong>₹{low52w.toLocaleString('en-IN')}</strong></span>
      </div>
    </div>
  );
}
