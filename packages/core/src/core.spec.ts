import { describe, expect, it } from 'vitest';
import { deriveMetrics, ratio } from './metrics.js';
import { formatCurrency, formatPercent, formatRoas, roasBand, DASH } from './format.js';

describe('ratio', () => {
  it('divides', () => expect(ratio(10, 2)).toBe(5));
  it('returns null on zero denominator (renders as dash, never NaN)', () =>
    expect(ratio(1, 0)).toBeNull());
});

describe('deriveMetrics', () => {
  const m = deriveMetrics({
    spend: 1000,
    impressions: 10000,
    clicks: 200,
    leads: 100,
    qualifiedLeads: 40,
    sales: 10,
    revenue: 5000,
  });
  it('computes unit economics', () => {
    expect(m.cpl).toBe(10);
    expect(m.qlRate).toBeCloseTo(0.4);
    expect(m.costPerQl).toBe(25);
    expect(m.cac).toBe(100);
    expect(m.roas).toBe(5);
    expect(m.arpl).toBe(50);
    expect(m.convRate).toBeCloseTo(0.1);
    expect(m.ctr).toBeCloseTo(0.02);
  });
  it('guards against divide-by-zero', () => {
    const z = deriveMetrics({
      spend: 100,
      impressions: 0,
      clicks: 0,
      leads: 0,
      qualifiedLeads: 0,
      sales: 0,
      revenue: 0,
    });
    expect(z.cpl).toBeNull(); // leads = 0 → no cost-per-lead
    expect(z.roas).toBe(0); // revenue 0 / spend 100 = 0 (denominator non-zero)
    expect(z.cac).toBeNull(); // sales = 0
  });
});

describe('formatting', () => {
  it('formats currency without cents by default', () =>
    expect(formatCurrency(1240, 'USD')).toBe('$1,240'));
  it('formats roas with one decimal and ×', () => expect(formatRoas(4)).toBe('4.0×'));
  it('formats percent', () => expect(formatPercent(0.4)).toBe('40.0%'));
  it('renders dash for missing', () => expect(formatCurrency(null, 'USD')).toBe(DASH));
});

describe('roasBand', () => {
  it('bands by quality', () => {
    expect(roasBand(0.5)).toBe('loss');
    expect(roasBand(1.5)).toBe('thin');
    expect(roasBand(3)).toBe('healthy');
    expect(roasBand(5)).toBe('winner');
    expect(roasBand(null)).toBeNull();
  });
});
