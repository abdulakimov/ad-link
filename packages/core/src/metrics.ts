import type { MetricRow } from './types.js';

/** Safe divide — null when denominator is 0 so the UI renders "—", never NaN/Infinity. */
export function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export interface MetricInputs {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualifiedLeads: number;
  sales: number;
  revenue: number;
}

/** Derive all unit-economics metrics from raw counts. Single source of truth (PLAN §10). */
export function deriveMetrics(i: MetricInputs): Pick<
  MetricRow,
  'ctr' | 'cpl' | 'qlRate' | 'costPerQl' | 'cac' | 'roas' | 'arpl' | 'convRate'
> {
  return {
    ctr: ratio(i.clicks, i.impressions),
    cpl: ratio(i.spend, i.leads),
    qlRate: ratio(i.qualifiedLeads, i.leads),
    costPerQl: ratio(i.spend, i.qualifiedLeads),
    cac: ratio(i.spend, i.sales),
    roas: ratio(i.revenue, i.spend),
    arpl: ratio(i.revenue, i.leads),
    convRate: ratio(i.sales, i.leads),
  };
}
