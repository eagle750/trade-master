'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IconPlus, IconX, IconPencil, IconCheck, IconDownload, IconExternalLink } from '@tabler/icons-react';
import { getWatchlists, createWatchlist, deleteWatchlist, renameWatchlist, removeFromWatchlist, type Watchlist } from '@/lib/watchlist';
import { exportWatchlist } from '@/lib/csvExport';
import styles from './WatchlistPanel.module.css';

interface Props { onClose: () => void }

export default function WatchlistPanel({ onClose }: Props) {
  const router = useRouter();
  const [lists, setLists]     = useState<Watchlist[]>([]);
  const [active, setActive]   = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const refresh = () => {
    const wls = getWatchlists();
    setLists(wls);
    if (!active && wls.length > 0) setActive(wls[0].id);
  };

  useEffect(() => { refresh(); }, []);

  const activeList = lists.find((w) => w.id === active);

  const handleCreate = () => {
    if (!newName.trim()) return;
    const wl = createWatchlist(newName.trim());
    setNewName(''); setCreating(false);
    refresh();
    setActive(wl.id);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this watchlist?')) return;
    deleteWatchlist(id);
    if (active === id) setActive(null);
    refresh();
  };

  const handleRename = () => {
    if (!renaming) return;
    renameWatchlist(renaming.id, renaming.name);
    setRenaming(null); refresh();
  };

  const handleRemoveItem = (symbol: string) => {
    if (!active) return;
    removeFromWatchlist(active, symbol);
    refresh();
  };

  const handleExport = () => {
    if (!activeList) return;
    exportWatchlist(activeList.name, activeList.items);
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>Watchlists</span>
          <button className="btn btn--ghost btn--sm" onClick={onClose}><IconX size={15} /></button>
        </div>

        <div className={styles.body}>
          {/* Sidebar — list names */}
          <div className={styles.sidebar}>
            {lists.map((wl) => (
              <div key={wl.id} className={styles.listItem + (wl.id === active ? ' ' + styles.listItemActive : '')}>
                {renaming?.id === wl.id ? (
                  <div className={styles.renameRow}>
                    <input className={'input ' + styles.renameInput} value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleRename()} autoFocus />
                    <button className="btn btn--ghost btn--xs" onClick={handleRename}><IconCheck size={12} /></button>
                  </div>
                ) : (
                  <>
                    <button className={styles.listName} onClick={() => setActive(wl.id)}>
                      {wl.name}
                      <span className={styles.listCount}>{wl.items.length}</span>
                    </button>
                    <div className={styles.listActions}>
                      <button className="btn btn--ghost btn--xs" onClick={() => setRenaming({ id: wl.id, name: wl.name })} title="Rename"><IconPencil size={11} /></button>
                      <button className="btn btn--ghost btn--xs" onClick={() => handleDelete(wl.id)} title="Delete"><IconX size={11} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Create new */}
            {creating ? (
              <div className={styles.createRow}>
                <input className={'input ' + styles.createInput} placeholder="Watchlist name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }} autoFocus />
                <button className="btn btn--primary btn--xs" onClick={handleCreate}>Add</button>
                <button className="btn btn--ghost btn--xs" onClick={() => setCreating(false)}><IconX size={11} /></button>
              </div>
            ) : (
              <button className={styles.newListBtn} onClick={() => setCreating(true)}>
                <IconPlus size={12} /> New watchlist
              </button>
            )}
          </div>

          {/* Main — stock rows */}
          <div className={styles.main}>
            {!activeList ? (
              <div className={styles.emptyState}>
                <p>Create a watchlist to track stocks</p>
                <button className="btn btn--primary btn--sm" onClick={() => setCreating(true)}><IconPlus size={13} /> Create watchlist</button>
              </div>
            ) : activeList.items.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No stocks in &ldquo;{activeList.name}&rdquo; yet</p>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Click + Watchlist on any stock page to add stocks here.</p>
              </div>
            ) : (
              <>
                <div className={styles.mainHeader}>
                  <span className={styles.mainTitle}>{activeList.name}</span>
                  <button className="btn btn--secondary btn--xs" onClick={handleExport}><IconDownload size={11} /> CSV</button>
                </div>
                <table className="table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Company</th>
                      <th>Added</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeList.items.map((item) => (
                      <tr key={item.symbol}>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--brand)', fontSize: 12 }}>{item.symbol}</span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</td>
                        <td style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{new Date(item.addedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button className="btn btn--ghost btn--xs" onClick={() => { router.push(`/stock/${item.symbol}`); onClose(); }} title="Open"><IconExternalLink size={11} /></button>
                            <button className="btn btn--ghost btn--xs" onClick={() => handleRemoveItem(item.symbol)} title="Remove"><IconX size={11} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
