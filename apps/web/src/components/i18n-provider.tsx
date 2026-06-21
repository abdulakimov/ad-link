'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { defaultLocale, type Locale, translate } from '@/i18n';

interface I18nValue {
  locale: Locale;
  t: (key: string, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/** Minimal i18n skeleton (uz/ru/en). Locale routing + a switcher land in a later phase. */
export function I18nProvider({
  locale = defaultLocale,
  children,
}: {
  locale?: Locale;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(
    () => ({ locale, t: (key, vars) => translate(locale, key, vars) }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used within <I18nProvider>');
  return ctx.t;
}
