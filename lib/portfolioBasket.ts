const BASKET_KEY  = 'af_portfolio_basket';
const CONFIG_KEY  = 'af_portfolio_config';
const PAPER_KEY   = 'af_portfolio_paper_positions';

export interface BasketStock {
  symbol:  string;
  name:    string;
  addedAt: string;
  source:  'manual' | 'screener';
}

export interface PortfolioConfig {
  rsiPeriod:    number;
  threshold:    number;  /* RSI value 0–100, e.g. 50 */
  capital:      number;  /* total ₹ */
  maxPositions: number;
}

export interface PaperPos {
  qty:     number;
  avgCost: number;
}

function safe<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; }
  catch { return fallback; }
}

export const DEFAULT_CONFIG: PortfolioConfig = { rsiPeriod: 14, threshold: 50, capital: 1000000, maxPositions: 5 };

export function getBasket(): BasketStock[]                    { return safe<BasketStock[]>(BASKET_KEY, []); }
export function saveBasket(b: BasketStock[])                  { localStorage.setItem(BASKET_KEY,  JSON.stringify(b)); }
export function getConfig(): PortfolioConfig                  { return { ...DEFAULT_CONFIG, ...safe<Partial<PortfolioConfig>>(CONFIG_KEY, {}) }; }
export function saveConfig(c: PortfolioConfig)                { localStorage.setItem(CONFIG_KEY,  JSON.stringify(c)); }
export function getPaperPositions(): Record<string, PaperPos> { return safe<Record<string, PaperPos>>(PAPER_KEY, {}); }
export function savePaperPositions(p: Record<string, PaperPos>) { localStorage.setItem(PAPER_KEY, JSON.stringify(p)); }

export function addToBasket(symbol: string, name: string, source: 'manual' | 'screener' = 'manual') {
  const b = getBasket();
  if (b.some((s) => s.symbol === symbol)) return;
  saveBasket([...b, { symbol, name, addedAt: new Date().toISOString(), source }]);
}

export function removeFromBasket(symbol: string) {
  saveBasket(getBasket().filter((s) => s.symbol !== symbol));
}

interface SavedStrategy { selection: string[]; }

export function importFromScreener(): { added: number; total: number } {
  try {
    const saves = JSON.parse(localStorage.getItem('af_saved_strategies') ?? '[]') as SavedStrategy[];
    if (!saves.length) return { added: 0, total: 0 };
    const latest = saves[0];
    let added = 0;
    for (const sym of latest.selection) {
      const before = getBasket().length;
      addToBasket(sym, sym, 'screener');
      if (getBasket().length > before) added++;
    }
    return { added, total: latest.selection.length };
  } catch { return { added: 0, total: 0 }; }
}
