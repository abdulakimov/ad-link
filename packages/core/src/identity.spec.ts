import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizeIdentifiers, normalizePhoneNaive } from './identity.js';

describe('normalizeEmail', () => {
  it('lowercases + trims valid emails', () =>
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com'));
  it('rejects invalid', () => expect(normalizeEmail('nope')).toBeNull());
});

describe('normalizePhoneNaive', () => {
  it('keeps E.164-ish digits', () => expect(normalizePhoneNaive('+998 (90) 123-45-67')).toBe('+998901234567'));
  it('rejects too-short', () => expect(normalizePhoneNaive('123')).toBeNull());
});

describe('normalizeIdentifiers', () => {
  it('dedups and drops invalid', () => {
    const ids = normalizeIdentifiers({
      phones: ['+998901234567', '+998 90 123 45 67'],
      emails: ['A@b.com', 'bad'],
    });
    expect(ids).toHaveLength(2); // one phone (deduped) + one email
    expect(ids).toContainEqual({ type: 'EMAIL', normalized: 'a@b.com' });
  });
});
