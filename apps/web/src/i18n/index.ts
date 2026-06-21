import en from './messages/en.json';
import ru from './messages/ru.json';
import uz from './messages/uz.json';

export const locales = ['en', 'ru', 'uz'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export const dictionaries = { en, ru, uz } as const;
export type Dictionary = typeof en;

/** Resolve a dot-path key against a dictionary, interpolating {vars}. */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string>,
): string {
  const raw = key
    .split('.')
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dictionaries[locale]);
  let str = typeof raw === 'string' ? raw : key;
  if (vars) for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, v);
  return str;
}
