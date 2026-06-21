import { describe, expect, it } from 'vitest';
import { recommend } from './recommendations.js';
import type { MetricRow } from './types.js';

function ad(over: Partial<MetricRow>): MetricRow {
  return {
    level: 'ad', id: 'a', name: 'Ad', parentId: null, status: null, currency: 'USD',
    spend: 100, impressions: 0, clicks: 0, leads: 0, qualifiedLeads: 0, sales: 0, revenue: 0,
    ctr: null, cpl: null, qlRate: null, costPerQl: null, cac: null, roas: null, arpl: null, convRate: null,
    ...over,
  };
}

describe('recommend', () => {
  it('pauses ads with leads but no sales', () => {
    const r = recommend([ad({ id: 'x', leads: 20, sales: 0, roas: 0 })]);
    expect(r[0]).toMatchObject({ id: 'x', type: 'pause' });
  });

  it('scales winners above target ROAS', () => {
    const r = recommend([ad({ id: 'w', leads: 20, sales: 3, roas: 5, qlRate: 0.5 })]);
    expect(r[0]).toMatchObject({ id: 'w', type: 'scale' });
  });

  it('flags low lead quality', () => {
    const r = recommend([ad({ id: 'q', leads: 50, sales: 2, roas: 2, qlRate: 0.1 })]);
    expect(r.find((x) => x.id === 'q')?.type).toBe('investigate');
  });

  it('ignores tiny-spend noise and non-ad levels', () => {
    expect(recommend([ad({ spend: 5, leads: 99, sales: 0 })])).toHaveLength(0);
    expect(recommend([ad({ level: 'campaign', leads: 99, sales: 0 })])).toHaveLength(0);
  });
});
