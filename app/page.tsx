'use client';

import { useState, useEffect, useCallback } from 'react';
import GlobalNav from '@/components/GlobalNav';
import TickerStrip from '@/components/TickerStrip';
import TodaysStory from '@/components/TodaysStory';
import SectorHeatmap from '@/components/SectorHeatmap';
import TopMovers from '@/components/TopMovers';
import FIIDIIFlows from '@/components/FIIDIIFlows';
import NewsRail from '@/components/NewsRail';
import StockFilter from '@/components/StockFilter';
import DisclaimerFooter from '@/components/DisclaimerFooter';
import { IconAlertTriangle, IconX } from '@tabler/icons-react';
import type { MarketPulseData, SectorCell, TickerCell } from '@/lib/types';
import { getMarketStatus } from '@/lib/marketStatus';
import { INDEX_YAHOO } from '@/lib/nseSymbols';
import styles from './page.module.css';

/* Placeholder ticker cells — labels only, values filled by API */
const EMPTY_INDICES: TickerCell[] = Object.values(INDEX_YAHOO).map((e) => ({
  name: e.name, symbol: e.symbol, value: 0, change: 0, changePct: 0,
}));

export default function MarketPulsePage() {
  const [isLoading, setIsLoading]       = useState(true);
  const [data, setData]                 = useState<MarketPulseData | null>(null);
  const [fetchError, setFetchError]     = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string | undefined>();
  const { status, time }                = getMarketStatus();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/market-pulse');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: MarketPulseData = await res.json();
      setData(json);
      setFetchError(null);
    } catch (err) {
      setData(null);
      setFetchError('Market data unavailable. Connect a data source to see live prices.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (status !== 'open') return;
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, [fetchData, status]);

  const handleSectorClick = (sector: SectorCell) => {
    setSectorFilter(sector.name);
    document.getElementById('stock-filter')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={styles.page}>
      <GlobalNav
        marketStatus={data?.marketStatus ?? status}
        marketStatusTime={data?.marketStatusTime ?? time}
      />

      {/* API / data error banner */}
      {fetchError && !isLoading && (
        <div className={styles.bannerWrap + ' page-container'}>
          <div className="banner banner--caution">
            <IconAlertTriangle size={14} />
            {fetchError}
            <button
              className="btn btn--ghost btn--xs"
              style={{ marginLeft: 'auto' }}
              onClick={() => setFetchError(null)}
              aria-label="Dismiss"
            >
              <IconX size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Ticker strip */}
      <TickerStrip
        indices={data?.indices ?? EMPTY_INDICES}
        isLoading={isLoading}
      />

      {/* Sector filter active banner */}
      {sectorFilter && (
        <div className={styles.sectorBannerWrap + ' page-container'}>
          <div className="banner banner--info">
            <span>Filter: <strong>{sectorFilter}</strong> only.</span>
            <button
              className="btn btn--link btn--xs"
              style={{ marginLeft: 6 }}
              onClick={() => setSectorFilter(undefined)}
            >
              Clear filter
            </button>
          </div>
        </div>
      )}

      {/* Main grid */}
      <main className={styles.main + ' page-container'}>
        {/* Left column */}
        <div className={styles.leftCol}>
          <TodaysStory
            body={data?.todaysStory.body ?? ''}
            generatedAt={data?.todaysStory.generatedAt ?? new Date().toISOString()}
            isLoading={isLoading}
          />

          <SectorHeatmap
            sectors={data?.sectors ?? []}
            onSectorClick={handleSectorClick}
            isLoading={isLoading}
          />

          <TopMovers
            gainers={data?.topMovers.gainers ?? []}
            losers={data?.topMovers.losers ?? []}
            isLoading={isLoading}
          />

          <FIIDIIFlows
            fii={data?.flows.fii ?? null}
            dii={data?.flows.dii ?? null}
            isLoading={isLoading}
          />
        </div>

        {/* Right column — news rail */}
        <div className={styles.rightCol}>
          <NewsRail items={data?.news ?? []} isLoading={isLoading} />
        </div>
      </main>

      {/* Stock filter — full width */}
      <div className={styles.filterSection + ' page-container'}>
        <StockFilter
          stocks={data?.stocks ?? []}
          initialSectorFilter={sectorFilter}
          onSectorFilterClear={() => setSectorFilter(undefined)}
        />
      </div>

      <DisclaimerFooter />
    </div>
  );
}
