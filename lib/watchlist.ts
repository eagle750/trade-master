/* Watchlist — localStorage-backed, no backend required for MVP */

export interface WatchlistItem {
  symbol:  string;
  name:    string;
  addedAt: string; /* ISO */
}

export interface Watchlist {
  id:      string;
  name:    string;
  items:   WatchlistItem[];
  createdAt: string;
}

const KEY = 'af_watchlists';

export function getWatchlists(): Watchlist[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); }
  catch { return []; }
}

export function saveWatchlists(lists: Watchlist[]) {
  localStorage.setItem(KEY, JSON.stringify(lists));
}

export function createWatchlist(name: string): Watchlist {
  const lists = getWatchlists();
  const wl: Watchlist = { id: `wl_${Date.now()}`, name, items: [], createdAt: new Date().toISOString() };
  saveWatchlists([...lists, wl]);
  return wl;
}

export function deleteWatchlist(id: string) {
  saveWatchlists(getWatchlists().filter((w) => w.id !== id));
}

export function renameWatchlist(id: string, name: string) {
  saveWatchlists(getWatchlists().map((w) => w.id === id ? { ...w, name } : w));
}

export function addToWatchlist(listId: string, symbol: string, name: string) {
  const lists = getWatchlists();
  saveWatchlists(lists.map((w) => {
    if (w.id !== listId) return w;
    if (w.items.some((i) => i.symbol === symbol)) return w; /* already in */
    return { ...w, items: [...w.items, { symbol, name, addedAt: new Date().toISOString() }] };
  }));
}

export function removeFromWatchlist(listId: string, symbol: string) {
  saveWatchlists(getWatchlists().map((w) =>
    w.id === listId ? { ...w, items: w.items.filter((i) => i.symbol !== symbol) } : w
  ));
}

export function isInAnyWatchlist(symbol: string): boolean {
  return getWatchlists().some((w) => w.items.some((i) => i.symbol === symbol));
}
