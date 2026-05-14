/* NSE symbol reference data — public indices and constituent lists.
   Yahoo Finance uses .NS suffix for NSE-listed equities and ^ prefix for indices.
   This file contains ONLY symbol identifiers, never prices or market data. */

export const INDEX_YAHOO: Record<string, { name: string; symbol: string }> = {
  nifty50:   { name: 'Nifty 50',    symbol: '^NSEI' },
  sensex:    { name: 'Sensex',      symbol: '^BSESN' },
  bankNifty: { name: 'Bank Nifty',  symbol: '^NSEBANK' },
  vix:       { name: 'India VIX',   symbol: '^INDIAVIX' },
  usdinr:    { name: 'USD / INR',   symbol: 'USDINR=X' },
};

export const SECTOR_YAHOO: Array<{ name: string; symbol: string; index: string }> = [
  { name: 'IT',       symbol: '^CNXIT',      index: 'NIFTYIT' },
  { name: 'Pharma',   symbol: '^CNXPHARMA',  index: 'NIFTYPHARMA' },
  { name: 'Auto',     symbol: '^CNXAUTO',    index: 'NIFTYAUTO' },
  { name: 'FMCG',     symbol: '^CNXFMCG',   index: 'NIFTYFMCG' },
  { name: 'Realty',   symbol: '^CNXREALTY',  index: 'NIFTYREALTY' },
  { name: 'PSU Bank', symbol: '^CNXPSUBANK', index: 'NIFTYPSUBANK' },
  { name: 'Metal',    symbol: '^CNXMETAL',   index: 'NIFTYMETAL' },
  { name: 'Energy',   symbol: '^CNXENERGY',  index: 'NIFTYENERGY' },
];

/* Nifty 100 constituents (Nifty 50 + Nifty Next 50) — Yahoo Finance .NS symbols.
   Source: NSE website, updated periodically. */
export const NIFTY100_NS: string[] = [
  /* Nifty 50 */
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'BHARTIARTL.NS',
  'INFY.NS', 'SBIN.NS', 'HINDUNILVR.NS', 'ITC.NS', 'KOTAKBANK.NS',
  'LT.NS', 'HCLTECH.NS', 'BAJFINANCE.NS', 'AXISBANK.NS', 'WIPRO.NS',
  'ASIANPAINT.NS', 'MARUTI.NS', 'SUNPHARMA.NS', 'TITAN.NS', 'ULTRACEMCO.NS',
  'ADANIENT.NS', 'ADANIPORTS.NS', 'NTPC.NS', 'POWERGRID.NS', 'TATAMOTORS.NS',
  'TATASTEEL.NS', 'COALINDIA.NS', 'ONGC.NS', 'M&M.NS', 'BPCL.NS',
  'HEROMOTOCO.NS', 'HINDALCO.NS', 'BAJAJ-AUTO.NS', 'BAJAJFINSV.NS', 'NESTLEIND.NS',
  'DRREDDY.NS', 'CIPLA.NS', 'DIVISLAB.NS', 'GRASIM.NS', 'EICHERMOT.NS',
  'TECHM.NS', 'INDUSINDBK.NS', 'JSWSTEEL.NS', 'APOLLOHOSP.NS', 'BRITANNIA.NS',
  'HDFCLIFE.NS', 'SBILIFE.NS', 'LTIM.NS', 'TATACONSUM.NS', 'UPL.NS',
  /* Nifty Next 50 */
  'DMART.NS', 'HAVELLS.NS', 'PIDILITIND.NS', 'DABUR.NS', 'MARICO.NS',
  'BERGEPAINT.NS', 'COLPAL.NS', 'GODREJCP.NS', 'MUTHOOTFIN.NS', 'CHOLAFIN.NS',
  'IOC.NS', 'VEDL.NS', 'SAIL.NS', 'PNB.NS', 'NMDC.NS',
  'IRCTC.NS', 'NAUKRI.NS', 'OFSS.NS', 'SIEMENS.NS', 'BOSCHLTD.NS',
  'TRENT.NS', 'TORNTPHARM.NS', 'LUPIN.NS', 'BIOCON.NS', 'ALKEM.NS',
  'ZYDUSLIFE.NS', 'MAXHEALTH.NS', 'ACC.NS', 'AMBUJACEM.NS', 'ASTRAL.NS',
  'ICICIPRULI.NS', 'SRF.NS', 'PIIND.NS', 'PETRONET.NS', 'CONCOR.NS',
  'INDHOTEL.NS', 'OBEROIRLTY.NS', 'GODREJPROP.NS', 'RECLTD.NS', 'VOLTAS.NS',
];

/* Manual sector map for cases where Yahoo Finance returns no sector for an NSE stock */
export const NSE_SECTOR_MAP: Record<string, string> = {
  RELIANCE: 'Energy', TCS: 'IT', HDFCBANK: 'Banking', ICICIBANK: 'Banking',
  BHARTIARTL: 'Telecom', INFY: 'IT', SBIN: 'PSU Bank', HINDUNILVR: 'FMCG',
  ITC: 'FMCG', KOTAKBANK: 'Banking', LT: 'Infrastructure', HCLTECH: 'IT',
  BAJFINANCE: 'Finance', AXISBANK: 'Banking', WIPRO: 'IT', ASIANPAINT: 'Paints',
  MARUTI: 'Auto', SUNPHARMA: 'Pharma', TITAN: 'Jewellery', ULTRACEMCO: 'Cement',
  ADANIENT: 'Conglom.', ADANIPORTS: 'Logistics', NTPC: 'Utilities', POWERGRID: 'Utilities',
  TATAMOTORS: 'Auto', TATASTEEL: 'Metal', COALINDIA: 'Energy', ONGC: 'Energy',
  'M&M': 'Auto', BPCL: 'Energy', HEROMOTOCO: 'Auto', HINDALCO: 'Metal',
  'BAJAJ-AUTO': 'Auto', BAJAJFINSV: 'Finance', NESTLEIND: 'FMCG', DRREDDY: 'Pharma',
  CIPLA: 'Pharma', DIVISLAB: 'Pharma', GRASIM: 'Cement', EICHERMOT: 'Auto',
  TECHM: 'IT', INDUSINDBK: 'Banking', JSWSTEEL: 'Metal', APOLLOHOSP: 'Healthcare',
  BRITANNIA: 'FMCG', HDFCLIFE: 'Insurance', SBILIFE: 'Insurance', LTIM: 'IT',
  TATACONSUM: 'FMCG', UPL: 'Agri', DMART: 'Retail', HAVELLS: 'Electricals',
  PIDILITIND: 'Chemicals', DABUR: 'FMCG', MARICO: 'FMCG', BERGEPAINT: 'Paints',
  COLPAL: 'FMCG', GODREJCP: 'FMCG', MUTHOOTFIN: 'Finance', CHOLAFIN: 'Finance',
  IOC: 'Energy', VEDL: 'Metal', SAIL: 'Metal', PNB: 'PSU Bank', NMDC: 'Metal',
  IRCTC: 'Services', NAUKRI: 'IT', OFSS: 'IT', SIEMENS: 'Electricals', BOSCHLTD: 'Auto',
  TRENT: 'Retail', TORNTPHARM: 'Pharma', LUPIN: 'Pharma', BIOCON: 'Pharma', ALKEM: 'Pharma',
  ZYDUSLIFE: 'Pharma', MAXHEALTH: 'Healthcare', ACC: 'Cement', AMBUJACEM: 'Cement',
  ASTRAL: 'Pipes', ICICIPRULI: 'Insurance', SRF: 'Chemicals', PIIND: 'Chemicals',
  PETRONET: 'Energy', CONCOR: 'Logistics', INDHOTEL: 'Hospitality',
  OBEROIRLTY: 'Realty', GODREJPROP: 'Realty', RECLTD: 'Finance', VOLTAS: 'Electricals',
};
