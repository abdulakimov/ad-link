import { CanonicalStatus } from '@adlink/db';

/**
 * A deal's canonical status from its full stage history. WON and QUALIFIED are "sticky":
 * if the deal was *ever* in a won/qualifying stage it stays won/qualified even after it
 * moves on (e.g. to Lost). Otherwise it takes its current stage's mapping.
 */
export function rollupCanonical(
  stages: string[],
  mapping: Map<string, CanonicalStatus>,
  currentStage: string,
): CanonicalStatus {
  const reached = stages.map((s) => mapping.get(s)).filter((c): c is CanonicalStatus => !!c);
  if (reached.includes(CanonicalStatus.WON)) return CanonicalStatus.WON;
  if (reached.includes(CanonicalStatus.QUALIFIED)) return CanonicalStatus.QUALIFIED;
  return mapping.get(currentStage) ?? CanonicalStatus.LEAD;
}
