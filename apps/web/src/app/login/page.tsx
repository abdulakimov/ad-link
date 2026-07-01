'use client';

import { Lock, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AuthField, AuthShell, AuthSwitch } from '@/components/auth/auth-shell';
import { QrLogin } from '@/components/auth/qr-login';
import { SocialAuth } from '@/components/auth/social-auth';
import { useT } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';
import { setToken } from '@/lib/session';

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Surface social-login failures bounced back here by the API (?error=google|telegram|social).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('error')) {
      toast.error(t('auth.socialFailed'));
      router.replace('/login');
    }
  }, [router, t]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { token } = await api.login(email, password);
      setToken(token);
      router.push('/overview');
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401 ? t('auth.invalid') : (err as Error).message;
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell aside={<QrLogin />}>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.signInTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.signInSubtitle')}</p>
      </div>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <AuthField
          id="email"
          label={t('auth.email')}
          icon={Mail}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField
          id="password"
          label={t('auth.password')}
          icon={Lock}
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? t('auth.signingIn') : t('auth.signIn')}
        </Button>
      </form>

      <SocialAuth />

      <AuthSwitch prompt={t('auth.noAccount')} href="/register" action={t('auth.signUp')} />
    </AuthShell>
  );
}
