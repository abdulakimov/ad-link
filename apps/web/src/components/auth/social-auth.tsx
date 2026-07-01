'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useT } from '@/components/i18n-provider';
import { api } from '@/lib/api';
import { setToken } from '@/lib/session';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TG_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT;

const btn =
  'flex h-10 w-full items-center justify-center gap-2 rounded-md border border-input bg-background text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60';

/** Social sign-in: an "or" divider, then Google + Telegram side by side. */
export function SocialAuth() {
  const t = useT();
  const router = useRouter();
  const [tgPending, setTgPending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  // never leave the poll running after the page unmounts
  useEffect(() => stop, [stop]);

  /**
   * Telegram sign-in via our bot (not the phone-number OAuth widget): open a QR-login session,
   * deep-link the user into @{bot}?start={qrId}, and poll until they tap Start in the chat — the
   * bot then approves the session server-side and we receive the JWT on the next poll.
   */
  const startTelegram = useCallback(async () => {
    if (tgPending) return;
    stop();
    setTgPending(true);
    try {
      const { qrId, secret, expiresIn } = await api.qrStart();
      // opens Telegram (Desktop/Web/app); pressing Start in the chat confirms this session
      window.open(`https://t.me/${TG_BOT}?start=${qrId}`, '_blank', 'noopener,noreferrer');
      toast.info(t('auth.telegramConfirm'));

      const deadline = Date.now() + expiresIn * 1000;
      pollRef.current = setInterval(async () => {
        if (Date.now() > deadline) {
          stop();
          setTgPending(false);
          return;
        }
        try {
          const res = await api.qrStatus(qrId, secret);
          if (res.status === 'approved' && res.token) {
            stop();
            setToken(res.token);
            router.push('/overview');
          } else if (res.status === 'expired') {
            stop();
            setTgPending(false);
          }
        } catch {
          // transient — keep polling until the deadline
        }
      }, 2000);
    } catch {
      stop();
      setTgPending(false);
      toast.error(t('auth.socialFailed'));
    }
  }, [router, t, tgPending, stop]);

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t('auth.orContinue')}
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <a href={`${API}/auth/google`} className={btn}>
          <GoogleIcon />
          Google
        </a>

        {TG_BOT && (
          <button type="button" onClick={startTelegram} disabled={tgPending} className={btn}>
            {tgPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('auth.telegramWaiting')}
              </>
            ) : (
              <>
                <TelegramIcon />
                Telegram
              </>
            )}
          </button>
        )}
      </div>
    </div>
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
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#229ED9"
        d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm5.56 8.16-1.86 8.78c-.14.62-.5.77-1.02.48l-2.82-2.08-1.36 1.31c-.15.15-.28.28-.57.28l.2-2.87 5.23-4.73c.23-.2-.05-.31-.35-.11L8.4 13.3l-2.78-.87c-.6-.19-.62-.6.13-.9l10.86-4.19c.5-.18.94.12.78.81Z"
      />
    </svg>
  );
}
