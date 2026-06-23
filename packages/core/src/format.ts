/**
 * Display formatting (DESIGN.md §14). Round on display only — never store rounded.
 * Missing values render as an em dash, never a fake 0.
 */
export const DASH = '—';

export function formatOrDash(
  value: number | null | undefined,
  fmt: (n: number) => string,
): string {
  return value === null || value === undefined || Number.isNaN(value) ? DASH : fmt(value);
}

export function formatCurrency(
  value: number | null | undefined,
  currency: string,
  locale = 'en',
  opts: { compact?: boolean; decimals?: number } = {},
): string {
  return formatOrDash(value, (n) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: opts.compact ? 'compact' : 'standard',
      // Show the real figure — $389.5 stays $389.5, never rounded up to $390.
      // Whole amounts still render clean ($219, not $219.00).
      minimumFractionDigits: opts.decimals ?? 0,
      maximumFractionDigits: opts.decimals ?? 2,
    }).format(n),
  );
}

export function formatNumber(
  value: number | null | undefined,
  locale = 'en',
  opts: { compact?: boolean } = {},
): string {
  return formatOrDash(value, (n) =>
    new Intl.NumberFormat(locale, {
      notation: opts.compact ? 'compact' : 'standard',
      maximumFractionDigits: 0,
    }).format(n),
  );
}

/** Ratios stored as 0..1 → "12.3%". */
export function formatPercent(value: number | null | undefined, locale = 'en'): string {
  return formatOrDash(value, (n) =>
    new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(n),
  );
}

/** ROAS → "4.0×". */
export function formatRoas(value: number | null | undefined, locale = 'en'): string {
  return formatOrDash(value, (n) => `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n)}×`);
}

/** ROAS quality band → heatmap key (DESIGN.md §2). Threshold is the default target. */
export type RoasBand = 'loss' | 'thin' | 'healthy' | 'winner';
export function roasBand(roas: number | null | undefined): RoasBand | null {
  if (roas === null || roas === undefined) return null;
  if (roas < 1) return 'loss';
  if (roas < 2) return 'thin';
  if (roas < 4) return 'healthy';
  return 'winner';
}
