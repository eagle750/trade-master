'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { IconLoader2, IconCheck, IconAlertTriangle } from '@tabler/icons-react';

export default function ZerodhaCompletePage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Completing Zerodha login…');

  useEffect(() => {
    const request_token = searchParams.get('request_token');
    if (!request_token) { setStatus('error'); setMessage('Missing request token.'); return; }

    const api_key    = localStorage.getItem('zd_api_key');
    const api_secret = localStorage.getItem('zd_api_secret');

    if (!api_key || !api_secret) {
      setStatus('error');
      setMessage('API key not found. Please reconnect from the trading tab.');
      return;
    }

    fetch('/api/broker/zerodha/session', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ api_key, api_secret, request_token }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        localStorage.setItem('zd_access_token', d.access_token);
        localStorage.setItem('zd_user_name',    d.user_name ?? '');
        localStorage.setItem('zd_user_id',      d.user_id ?? '');
        localStorage.setItem('zd_connected_at', new Date().toISOString());
        setStatus('success');
        setMessage(`Connected as ${d.user_name ?? d.user_id}. Redirecting…`);
        setTimeout(() => router.back(), 1500);
      })
      .catch((e) => { setStatus('error'); setMessage(String(e)); });
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)' }}>
      <div style={{ background: 'var(--bg-primary)', border: '0.5px solid var(--border-tertiary)', borderRadius: 12, padding: '40px 48px', textAlign: 'center', maxWidth: 400 }}>
        {status === 'loading' && <IconLoader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--brand)' }} />}
        {status === 'success' && <IconCheck size={32} color="var(--up-dark)" />}
        {status === 'error'   && <IconAlertTriangle size={32} color="var(--down)" />}
        <p style={{ marginTop: 16, fontSize: 14, color: status === 'error' ? 'var(--down)' : 'var(--text-primary)' }}>{message}</p>
        {status === 'error' && (
          <button className="btn btn--secondary btn--sm" style={{ marginTop: 16 }} onClick={() => router.back()}>Go back</button>
        )}
      </div>
    </div>
  );
}
