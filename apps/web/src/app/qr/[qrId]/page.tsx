'use client';

import { CheckCircle2, Clock, Sparkles, TimerOff } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useT } from '@/components/i18n-provider';
import { api } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT;

type Phase = 'choose' | 'approved' | 'expired';

/**
 * Phone-side confirmation page reached by scanning the desktop QR. The user picks a provider to
 * confirm the desktop sign-in (Telegram bot deep-link, or Google OAuth). The countdown runs purely
 * from the `exp` query param so it works even when the API isn't reachable from the phone.
 */
export default function QrConfirmPage() {
  // useSearchParams needs a Suspense boundary in the App Router
  return (
    <Suspense fallback={null}>
      <QrConfirmInner />
    </Suspense>
  );
}

function QrConfirmInner() {
  const t = useT();
  const params = useParams<{ qrId: string }>();
  const search = useSearchParams();
  const qrId = params.qrId;
  const exp = Number(search.get('exp')) || 0;

  const [phase, setPhase] = useState<Phase>(search.get('done') ? 'approved' : 'choose');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // init + tick on the client only — calling Date.now() during render would mismatch SSR
  useEffect(() => {
    if (phase !== 'choose') return;
    setSecondsLeft(exp ? Math.max(0, exp - Math.floor(Date.now() / 1000)) : 300);
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setPhase('expired');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, exp]);

  // best-effort: if the phone can reach the API, flip to success once the desktop session is approved
  useEffect(() => {
    if (phase !== 'choose') return;
    pollRef.current = setInterval(async () => {
      try {
        const info = await api.qrInfo(qrId);
        if (info.status === 'approved') setPhase('approved');
        else if (info.status === 'expired') setPhase('expired');
      } catch {
        // API not reachable from the phone (e.g. localhost in dev) — ignore, the desktop still polls
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, qrId]);

  const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
  const telegramHref = BOT ? `https://t.me/${BOT}?start=${qrId}` : undefined;
  const googleHref = `${API}/auth/qr/google?qrId=${encodeURIComponent(qrId)}`;

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-5 py-10 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-indigo-500/20 blur-[120px]"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card/80 p-7 shadow-2xl shadow-black/10 backdrop-blur-xl">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg">
            <Sparkles className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">AdLink</span>
        </div>

        {phase === 'approved' ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="size-12 text-emerald-500" />
            <h1 className="text-lg font-semibold">{t('auth.qrApprovedTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('auth.qrApprovedHint')}</p>
          </div>
        ) : phase === 'expired' ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <TimerOff className="size-12 text-muted-foreground" />
            <h1 className="text-lg font-semibold">{t('auth.qrExpiredTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('auth.qrExpiredHint')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 text-center">
            <div className="space-y-1">
              <h1 className="text-lg font-semibold tracking-tight">{t('auth.qrConfirmTitle')}</h1>
              <p className="text-sm text-muted-foreground">{t('auth.qrConfirmSubtitle')}</p>
            </div>

            <div className="flex flex-col gap-3">
              {telegramHref && (
                <a
                  href={telegramHref}
                  className="flex h-12 items-center justify-center gap-2.5 rounded-xl bg-[#229ED9] px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                >
                  <TelegramIcon />
                  {t('auth.qrViaTelegram')}
                </a>
              )}
              <a
                href={googleHref}
                className="flex h-12 items-center justify-center gap-2.5 rounded-xl border border-input bg-background px-4 text-sm font-semibold transition-colors hover:bg-accent"
              >
                <GoogleIcon />
                {t('auth.qrViaGoogle')}
              </a>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              <span className="font-mono tabular-nums">{mmss}</span>
              {t('auth.qrLeft')}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M17.56 8.16 15.7 16.94c-.14.62-.5.77-1.02.48l-2.82-2.08-1.36 1.31c-.15.15-.28.28-.57.28l.2-2.87 5.23-4.73c.23-.2-.05-.31-.35-.11L8.4 13.3l-2.78-.87c-.6-.19-.62-.6.13-.9l10.86-4.19c.5-.18.94.12.78.81Z"
      />
    </svg>
  );
}
