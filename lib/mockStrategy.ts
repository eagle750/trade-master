/* Example strategy chip text — UI copy only, not market data */

export const EXAMPLE_STRATEGIES = [
  {
    label: 'Top 20 momentum',
    text: 'Top 20 momentum stocks from Nifty 500 with positive earnings growth, rebalanced monthly',
  },
  {
    label: 'Deep value',
    text: 'Deep value stocks — low P/E below 12, low P/B, high dividend yield above 3%, from large and mid-cap universe',
  },
  {
    label: 'Quality compounders',
    text: 'Quality compounders with ROE above 20%, low debt, consistent earnings growth over 3 years, from Nifty 200',
  },
];

export const EXTENDED_EXAMPLES = [
  { style: 'Momentum', label: 'High momentum, low volatility', text: 'Nifty 500 stocks with 6-month price momentum in top 20%, daily volatility below median, positive MACD crossover in last 5 days' },
  { style: 'Value',    label: 'Graham net-net',                text: 'Stocks trading below net current asset value, market cap under ₹5000 Cr, profitable in 2 of last 3 years' },
  { style: 'Quality',  label: 'Consistent ROE compounders',    text: 'ROE above 15% for 5 consecutive years, debt-to-equity below 0.5, revenue growth above 10%, Nifty 500' },
  { style: 'Dividend', label: 'High yield, low payout',        text: 'Dividend yield above 4%, payout ratio below 60%, no dividend cuts in 3 years, large-cap only' },
  { style: 'Sector',   label: 'IT sector breakout',            text: 'Nifty IT stocks with 52-week high breakout, volume surge above 2x average, RSI between 50 and 70' },
  { style: 'Contrarian', label: 'Beaten-down quality',         text: 'Stocks down 30%+ from 52-week high, ROE above 12%, no governance red flags, Nifty 500' },
];
