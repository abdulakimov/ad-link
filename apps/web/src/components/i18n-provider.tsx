'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { defaultLocale, type Locale, locales, translate } from '@/i18n';

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = 'adlink_locale';

/** i18n (uz/ru/en) with client-side switching persisted to localStorage. */
export function I18nProvider({
  locale: initial = defaultLocale,
  children,
}: {
  locale?: Locale;
  children: ReactNode;
}) {
  // Start from the SSR default so first client render matches the server (no hydration mismatch),
  // then adopt the saved preference after mount.
  const [locale, setLocaleState] = useState<Locale>(initial);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved && locales.includes(saved)) setLocaleState(saved);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale: (next) => {
        setLocaleState(next);
        localStorage.setItem(STORAGE_KEY, next);
        document.documentElement.lang = next;
      },
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18nContext() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT/useI18n must be used within <I18nProvider>');
  return ctx;
}

export function useT() {
  return useI18nContext().t;
}

export function useI18n() {
  const { locale, setLocale } = useI18nContext();
  return { locale, setLocale };
}
