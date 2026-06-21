/**
 * Parse a creative naming convention (e.g. "Vid1-h2-c3") into structured
 * dimensions so the UI can aggregate by hook/concept/angle and learn which
 * *ideas* convert (PLAN §11 creative insights). Unknown tokens are ignored.
 */
export interface ParsedCreative {
  video?: string;
  hook?: string;
  concept?: string;
  angle?: string;
  format?: string;
  audience?: string;
}

// Order matters: longer/more-specific prefixes first (audience before angle).
const PREFIXES: ReadonlyArray<readonly [RegExp, keyof ParsedCreative]> = [
  [/^(?:vid|v)(.+)$/i, 'video'],
  [/^(?:hook|h)(.+)$/i, 'hook'],
  [/^(?:concept|con|c)(.+)$/i, 'concept'],
  [/^(?:audience|aud)(.+)$/i, 'audience'],
  [/^(?:angle|a)(.+)$/i, 'angle'],
  [/^(?:format|fmt|f)(.+)$/i, 'format'],
];

export function parseCreativeName(name: string): ParsedCreative {
  const out: ParsedCreative = {};
  for (const token of name.split(/[-_\s]+/).filter(Boolean)) {
    for (const [re, key] of PREFIXES) {
      const m = re.exec(token);
      if (m?.[1] && out[key] === undefined) {
        out[key] = m[1];
        break;
      }
    }
  }
  return out;
}
