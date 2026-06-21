'use client';

import { Building2, Lock, Mail, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { AuthField, AuthShell, AuthSwitch } from '@/components/auth/auth-shell';
import { SocialAuth } from '@/components/auth/social-auth';
import { useT } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';
import { setToken } from '@/lib/session';

export default function RegisterPage() {
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState({ tenantName: '', name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { token } = await api.register(form);
      setToken(token);
      router.push('/overview');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AuthShell>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.registerTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.registerSubtitle')}</p>
      </div>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <AuthField
          id="tenantName"
          label={t('auth.workspace')}
          icon={Building2}
          placeholder="Acme Inc."
          required
          value={form.tenantName}
          onChange={set('tenantName')}
        />
        <AuthField
          id="name"
          label={t('auth.name')}
          icon={User}
          placeholder="Jane Doe"
          value={form.name}
          onChange={set('name')}
        />
        <AuthField
          id="email"
          label={t('auth.email')}
          icon={Mail}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          value={form.email}
          onChange={set('email')}
        />
        <AuthField
          id="password"
          label={t('auth.password')}
          icon={Lock}
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          value={form.password}
          onChange={set('password')}
        />
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? t('auth.creating') : t('auth.createAccount')}
        </Button>
      </form>

      <SocialAuth />

      <AuthSwitch prompt={t('auth.haveAccount')} href="/login" action={t('auth.signIn')} />
    </AuthShell>
  );
}
