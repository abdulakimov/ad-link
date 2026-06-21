import { describe, expect, it } from 'vitest';
import { parseCreativeName } from './creative.js';

describe('parseCreativeName', () => {
  it('parses video/hook/concept', () => {
    expect(parseCreativeName('Vid1-h2-c3')).toEqual({ video: '1', hook: '2', concept: '3' });
  });

  it('handles underscores and angle/format/audience', () => {
    expect(parseCreativeName('v1_a2_f3_audUS')).toEqual({
      video: '1',
      angle: '2',
      format: '3',
      audience: 'US',
    });
  });

  it('ignores unknown tokens', () => {
    expect(parseCreativeName('promo-xyz-h7')).toEqual({ hook: '7' });
  });

  it('returns empty for unstructured names', () => {
    expect(parseCreativeName('Summer Sale')).toEqual({});
  });
});
