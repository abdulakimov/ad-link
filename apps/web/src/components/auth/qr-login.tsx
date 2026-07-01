'use client';

import { RefreshCw, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/components/i18n-provider';
import { api } from '@/lib/api';
import { setToken } from '@/lib/session';

type Phase = 'loading' | 'ready' | 'expired' | 'error';

/**
 * QR sign-in: open a session, render its Telegram deep-link as a QR, and poll until the user
 * approves on their phone — then store the JWT and redirect. Mirrors the desktop flow where you
 * scan with the phone camera and confirm in Telegram.
 */
export function QrLogin() {
  const t = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setPhase('loading');
    setDataUrl(null);
    try {
      const { qrId, secret, expiresIn } = await api.qrStart();
      // QR points at our phone-side confirmation page; window.location.origin means it carries the
      // exact host the desktop is on (e.g. a LAN IP), so a phone on the same network can reach it.
      const exp = Math.floor(Date.now() / 1000) + expiresIn;
      const url = `${window.location.origin}/qr/${qrId}?exp=${exp}`;
      setDataUrl(await QRCode.toDataURL(url, { margin: 1, width: 240 }));
      setSecondsLeft(expiresIn);
      setPhase('ready');

      tickRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            stop();
            setPhase('expired');
            return 0;
          }
          return s - 1;
        });
      }, 1000);

      pollRef.current = setInterval(async () => {
        try {
          const res = await api.qrStatus(qrId, secret);
          if (res.status === 'approved' && res.token) {
            stop();
            setToken(res.token);
            router.push('/overview');
          } else if (res.status === 'expired') {
            stop();
            setPhase('expired');
          }
        } catch {
          // transient — keep polling until the countdown expires
        }
      }, 2000);
    } catch {
      setPhase('error');
    }
  }, [router, stop]);

  useEffect(() => {
    void start();
    return stop;
  }, [start, stop]);

  const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="text-sm font-semibold tracking-tight">{t('auth.qrTitle')}</div>

      <div className="relative grid size-[212px] place-items-center rounded-xl bg-white p-3 shadow-sm ring-1 ring-border">
        {phase === 'ready' && dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt={t('auth.qrScan')} className="size-full" />
        ) : phase === 'loading' ? (
          <span className="text-xs text-muted-foreground">{t('auth.qrLoading')}</span>
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            className="flex flex-col items-center gap-2 px-4 text-xs font-medium text-foreground"
          >
            <RefreshCw className="size-6 text-indigo-500" />
            {phase === 'expired' ? t('auth.qrExpired') : t('auth.qrError')}
            <span className="text-indigo-500">{t('auth.qrRefresh')}</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Smartphone className="size-4 text-indigo-500" />
        {t('auth.qrScan')}
      </div>
      <p className="max-w-[15rem] text-xs text-muted-foreground">{t('auth.qrHint')}</p>
      {phase === 'ready' && (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">⏱ {mmss}</span>
      )}
    </div>
  );
}
