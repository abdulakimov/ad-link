/**
 * Identity normalization for matching/dedup (PLAN §8). Phone is intentionally
 * naive here; Phase 4 swaps in a libphonenumber-backed E.164 normalizer.
 * ponytail: naive phone now (digits + leading +), upgrade to libphonenumber in Phase 4.
 */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  return EMAIL_RE.test(e) ? e : null;
}

export function normalizePhoneNaive(phone: string): string | null {
  const hasPlus = phone.trim().startsWith('+');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null; // E.164 bounds
  return hasPlus ? `+${digits}` : `+${digits}`;
}

export type IdentifierKind = 'PHONE' | 'EMAIL';
export interface NormalizedIdentifier {
  type: IdentifierKind;
  normalized: string;
}

/** Normalize all phones/emails on a contact-ish payload into unique identifiers. */
export function normalizeIdentifiers(input: {
  phones?: string[];
  emails?: string[];
}): NormalizedIdentifier[] {
  const out = new Map<string, NormalizedIdentifier>();
  for (const p of input.phones ?? []) {
    const n = normalizePhoneNaive(p);
    if (n) out.set(`PHONE:${n}`, { type: 'PHONE', normalized: n });
  }
  for (const e of input.emails ?? []) {
    const n = normalizeEmail(e);
    if (n) out.set(`EMAIL:${n}`, { type: 'EMAIL', normalized: n });
  }
  return [...out.values()];
}
