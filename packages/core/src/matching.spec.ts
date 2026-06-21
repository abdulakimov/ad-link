import { describe, expect, it } from 'vitest';
import { decideMatch } from './matching.js';

describe('decideMatch', () => {
  it('returns UNMATCHED with no candidates', () => {
    expect(decideMatch([])).toMatchObject({ status: 'UNMATCHED', adId: null, method: null });
  });

  it('prefers the highest-priority method (leadgen over email)', () => {
    const d = decideMatch([
      { method: 'EMAIL', adId: 'ad-email' },
      { method: 'LEADGEN_ID', adId: 'ad-leadgen' },
    ]);
    expect(d).toMatchObject({ method: 'LEADGEN_ID', adId: 'ad-leadgen', confidence: 1, status: 'MATCHED' });
  });

  it('routes low-confidence (UTM) matches to review', () => {
    const d = decideMatch([{ method: 'UTM', adId: 'ad-1' }]);
    expect(d.status).toBe('REVIEW');
    expect(d.confidence).toBeLessThan(0.7);
  });

  it('phone/email are matched (above threshold)', () => {
    expect(decideMatch([{ method: 'PHONE', adId: 'a' }]).status).toBe('MATCHED');
    expect(decideMatch([{ method: 'EMAIL', adId: 'a' }]).status).toBe('MATCHED');
  });
});
