/* AlphaForge — core TypeScript types (PRD §2 vocabulary + Part B data shapes) */

export type MarketStatus = 'pre-open' | 'open' | 'closed' | 'holiday';

export interface TickerCell {
  name: string;
  value: number;
  change: number;
  changePct: number;
  symbol?: string;
}

export interface SectorCell {
  name: string;
  changePct: number;
  index: string;
}

export interface Mover {
  symbol: string;
  name: string;
  ltp: number;
  changePct: number;
  circuit?: 'UC' | 'LC';
  sector?: string;
}

export interface FlowCell {
  type: 'fii' | 'dii';
  netCr: number;   /* in ₹ Cr; negative = net seller */
  segment: 'cash';
  asOf: string;    /* ISO date */
}

export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface NewsItem {
  id: string;
  headline: string;
  sentiment: Sentiment;
  category: string;       /* Macro | Stock | Regulatory | Sector */
  ticker?: string;
  source: string;
  publishedAt: string;    /* ISO */
  url: string;
}

export interface MarketPulseData {
  marketStatus: MarketStatus;
  marketStatusTime: string;
  indices: TickerCell[];
  todaysStory: {
    generatedAt: string;
    body: string;
    sources: { type: 'news' | 'index' | 'flow'; id: string }[];
  };
  sectors: SectorCell[];
  topMovers: { gainers: Mover[]; losers: Mover[] };
  flows: { fii: FlowCell | null; dii: FlowCell | null };
  news: NewsItem[];
  stocks: StockRow[];
}

/* ---- Filter types ---- */
export type CapCategory = 'mega' | 'large' | 'mid' | 'small';

export interface FilterState {
  cap: CapCategory[];
  sector: string[];
  index: string[];
  peMin?: number;
  peMax?: number;
  roeMin?: number;
  excludeT2T: boolean;
  excludeASM: boolean;
  excludeGSM: boolean;
}

export interface StockRow {
  symbol: string;
  name: string;
  sector: string;
  ltp: number;
  changePct: number;
  mcapCr: number;
  pe?: number;
  roe?: number;
  circuit?: 'UC' | 'LC';
}
