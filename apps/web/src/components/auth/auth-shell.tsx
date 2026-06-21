'use client';

import { BarChart3, Eye, EyeOff, type LucideIcon, Sparkles, Target, Zap } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { formatCurrency, formatRoas, roasBand } from '@adlink/core';
import { useT } from '@/components/i18n-provider';
import { LocaleThemeControls } from '@/components/locale-theme-controls';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const SHOWCASE = { spend: 2480, revenue: 11900, roas: 11900 / 2480 };
const BAND_BG: Record<string, string> = {
  loss: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200',
  thin: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
  healthy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
  winner: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-400/25 dark:text-emerald-100',
};

/**
 * World-class split-screen auth layout: an animated brand/visual panel on the left
 * (lg+), the form on the right. Shared by /login and /register.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const band = roasBand(SHOWCASE.roas) ?? 'healthy';
  const features: Array<{ icon: LucideIcon; title: string; desc: string }> = [
    { icon: Target, title: t('auth.feat1'), desc: t('auth.feat1Desc') },
    { icon: BarChart3, title: t('auth.feat2'), desc: t('auth.feat2Desc') },
    { icon: Zap, title: t('auth.feat3'), desc: t('auth.feat3Desc') },
  ];

  return (
    // Theme-aware: tokens drive every surface, so the page adapts to light & dark.
    <main className="relative grid min-h-dvh overflow-hidden bg-background text-foreground lg:grid-cols-2">
      {/* ---- shared background: aurora + grid spanning the whole page ---- */}
      <div
        aria-hidden
        className="animate-aurora pointer-events-none absolute -left-24 -top-24 size-[30rem] rounded-full bg-indigo-500/25 blur-[120px] dark:bg-indigo-600/35"
      />
      <div
        aria-hidden
        className="animate-aurora pointer-events-none absolute -bottom-40 left-1/3 size-[32rem] rounded-full bg-fuchsia-500/20 blur-[130px] [animation-delay:-6s] dark:bg-fuchsia-600/25"
      />
      <div
        aria-hidden
        className="animate-aurora pointer-events-none absolute -right-24 top-1/4 size-[28rem] rounded-full bg-sky-400/15 blur-[130px] [animation-delay:-12s] dark:bg-sky-500/15"
      />
      {/* grid: dark lines on light bg, light lines on dark bg */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,#000_20%,transparent_80%)] dark:opacity-0"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,#000_20%,transparent_80%)] dark:opacity-[0.06]"
      />

      {/* theme + language switchers */}
      <div className="absolute right-6 top-6 z-20">
        <LocaleThemeControls />
      </div>

      {/* ---- Left: brand showcase ---- */}
      <aside className="relative z-10 hidden flex-col justify-between p-12 lg:flex">
        {/* brand mark */}
        <div className="flex items-center gap-2.5 auth-rise">
          <span className="grid size-9 place-items-center rounded-md bg-gradient-to-br from-indigo-400 to-fuchsia-500 text-white shadow-lg shadow-indigo-900/20">
            <Sparkles className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">{t('app.name')}</span>
        </div>

        {/* headline + floating metric card */}
        <div className="space-y-8">
          <div className="space-y-4 auth-rise [animation-delay:80ms]">
            <h2 className="max-w-md text-balance text-4xl font-semibold leading-[1.1] tracking-tight">
              {t('auth.brandTitle')}
            </h2>
            <p className="max-w-sm text-base leading-relaxed text-muted-foreground">
              {t('auth.brandSubtitle')}
            </p>
          </div>

          <div className="animate-float auth-rise [animation-delay:160ms] w-full max-w-sm rounded-xl border border-border bg-card/60 p-5 backdrop-blur-xl">
            <div className="grid grid-cols-3 gap-4">
              <Metric label={t('auth.statSpend')} value={formatCurrency(SHOWCASE.spend, 'USD')} />
              <Metric
                label={t('auth.statRevenue')}
                value={formatCurrency(SHOWCASE.revenue, 'USD')}
              />
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">{t('auth.statRoas')}</div>
                <span
                  className={cn(
                    'inline-flex rounded px-1.5 py-0.5 font-mono text-lg font-semibold',
                    BAND_BG[band],
                  )}
                >
                  {formatRoas(SHOWCASE.roas)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* features */}
        <ul className="space-y-4">
          {features.map(({ icon: Icon, title, desc }, i) => (
            <li
              key={title}
              className="auth-rise flex items-start gap-3"
              style={{ animationDelay: `${240 + i * 80}ms` }}
            >
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-border bg-card/60">
                <Icon className="size-4 text-indigo-500 dark:text-indigo-300" />
              </span>
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{title}</div>
                <div className="text-sm text-muted-foreground">{desc}</div>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      {/* ---- Right: form (same background, sits on a glass card) ---- */}
      <section className="relative z-10 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/70 p-8 shadow-2xl shadow-black/10 backdrop-blur-xl auth-rise dark:shadow-black/40">
          {/* mobile brand mark (left panel hidden) */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg">
              <Sparkles className="size-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">{t('app.name')}</span>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}

/** Labeled input with a leading icon; password fields get a show/hide toggle. */
export function AuthField({
  id,
  label,
  icon: Icon,
  type = 'text',
  ...props
}: React.ComponentProps<typeof Input> & { label: string; icon: LucideIcon }) {
  const [reveal, setReveal] = React.useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && reveal ? 'text' : type;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input id={id} type={inputType} className={cn('h-10 pl-9', isPassword && 'pr-9')} {...props} />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
          >
            {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

/** Auth footer link row (e.g. "No account? Sign up"). */
export function AuthSwitch({ prompt, href, action }: { prompt: string; href: string; action: string }) {
  return (
    <p className="mt-6 text-center text-sm text-muted-foreground">
      {prompt}{' '}
      <Link href={href} className="font-medium text-primary hover:underline">
        {action}
      </Link>
    </p>
  );
}
