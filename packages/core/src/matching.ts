import { MATCH_CONFIDENCE, type MatchMethod, type MatchStatus, REVIEW_THRESHOLD } from './enums.js';

export interface MatchCandidate {
  method: MatchMethod;
  adId: string;
}

export interface MatchDecision {
  method: MatchMethod | null;
  adId: string | null;
  confidence: number;
  status: MatchStatus;
}

/** Most → least reliable (PLAN §8). First confident hit wins. */
const PRIORITY: readonly MatchMethod[] = [
  'LEADGEN_ID',
  'FBCLID',
  'PHONE',
  'EMAIL',
  'UTM',
  'FUZZY',
  'MANUAL',
];

/**
 * Choose the best match among candidates and assign confidence/status. Low-confidence
 * matches (below the review threshold) are parked for manual review, never counted as
 * revenue automatically.
 */
export function decideMatch(candidates: MatchCandidate[]): MatchDecision {
  if (candidates.length === 0) {
    return { method: null, adId: null, confidence: 0, status: 'UNMATCHED' };
  }
  const best = [...candidates].sort(
    (a, b) => PRIORITY.indexOf(a.method) - PRIORITY.indexOf(b.method),
  )[0]!;
  const confidence = MATCH_CONFIDENCE[best.method];
  const status: MatchStatus = confidence >= REVIEW_THRESHOLD ? 'MATCHED' : 'REVIEW';
  return { method: best.method, adId: best.adId, confidence, status };
}
