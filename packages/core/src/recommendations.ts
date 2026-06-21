import type { MetricRow } from './types.js';

export type RecommendationType = 'scale' | 'pause' | 'investigate';

export interface Recommendation {
  type: RecommendationType;
  level: 'campaign' | 'adset' | 'ad';
  id: string;
  name: string;
  title: string;
  reason: string;
  roas: number | null;
  spend: number;
}

export interface RecommendOptions {
  /** ROAS at/above which an ad is a "winner" worth scaling. */
  targetRoas?: number;
  /** Ignore ads spending less than this (noise). */
  minSpend?: number;
  /** Lead count above which "no sales" / "low quality" is a real signal. */
  minLeads?: number;
}

/**
 * The intelligence layer (PLAN §16): turn metrics into "scale this / pause that"
 * actions. Rule-based + explainable — every recommendation states its reason.
 * ponytail: explainable rules ship the wow; ML only when rules plateau.
 */
export function recommend(rows: MetricRow[], opts: RecommendOptions = {}): Recommendation[] {
  const targetRoas = opts.targetRoas ?? 3;
  const minSpend = opts.minSpend ?? 50;
  const minLeads = opts.minLeads ?? 10;

  const recs: Recommendation[] = [];
  for (const r of rows) {
    if (r.level !== 'ad' || r.spend < minSpend) continue;
    const base = { level: r.level, id: r.id, name: r.name, roas: r.roas, spend: r.spend };

    if (r.sales === 0 && r.leads >= minLeads) {
      recs.push({ ...base, type: 'pause', title: 'Pause — cheap leads, no sales', reason: `${r.leads} leads but 0 sales` });
    } else if (r.roas !== null && r.roas < 1) {
      recs.push({ ...base, type: 'pause', title: 'Pause — losing money', reason: `ROAS ${r.roas.toFixed(1)}× (below 1.0)` });
    } else if (r.roas !== null && r.roas >= targetRoas && r.sales >= 1) {
      recs.push({ ...base, type: 'scale', title: 'Scale — winner', reason: `ROAS ${r.roas.toFixed(1)}× with ${r.sales} sale${r.sales > 1 ? 's' : ''}` });
    } else if (r.qlRate !== null && r.qlRate < 0.2 && r.leads >= minLeads) {
      recs.push({ ...base, type: 'investigate', title: 'Low lead quality', reason: `Only ${Math.round(r.qlRate * 100)}% of leads qualified` });
    }
  }

  // waste first (pause, by spend desc), then winners (scale, by ROAS desc), then investigate
  const order: Record<RecommendationType, number> = { pause: 0, scale: 1, investigate: 2 };
  return recs.sort(
    (a, b) =>
      order[a.type] - order[b.type] ||
      (a.type === 'scale' ? (b.roas ?? 0) - (a.roas ?? 0) : b.spend - a.spend),
  );
}
