// Copied from ../byheart src/lib/diff.ts at commit 0ee9eaa78e40d6aded17d1d27913c13ed0492339 (2026-11-08). Do not edit; re-copy and update this line.
export interface DiffOptions { ignoreCase: boolean; ignorePunctuation: boolean; ignoreWhitespace: boolean }
export const defaultDiffOptions: DiffOptions = { ignoreCase: true, ignorePunctuation: true, ignoreWhitespace: true };
export interface WordChange { type: 'same' | 'missing' | 'extra' | 'changed'; expected: string[]; actual: string[] }
export interface WordDiff { changes: WordChange[]; errors: number; total: number; equivalent: boolean; cosmetic: boolean }
function tokens(text: string, options: DiffOptions): string[] {
  // Compare normalized keys, but retain the original spelling/punctuation for display.
  return (text.match(options.ignoreWhitespace ? /\S+/gu : /\s+|\S+/gu) ?? [])
    .filter(token => !options.ignorePunctuation || token.replace(/\p{P}/gu, '').length > 0);
}
const key = (s: string, o: DiffOptions) => {
  let value = s.normalize('NFC');
  if (o.ignorePunctuation) value = value.replace(/\p{P}/gu, '');
  return o.ignoreCase ? value.toLocaleLowerCase('en') : value;
};
export function wordDiff(expected: string, actual: string, options: DiffOptions = defaultDiffOptions): WordDiff {
  const a = tokens(expected, options), b = tokens(actual, options);
  const ak = a.map(t => key(t, options)), bk = b.map(t => key(t, options));
  // Bound quadratic work for manually edited/imported content and unusually long input.
  if (a.length > 2000 || b.length > 2000) throw new Error('한 문장은 2,000개 토큰 이내로 비교할 수 있습니다.');
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = ak[i] === bk[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const changes: WordChange[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && ak[i] === bk[j]) {
      const prev = changes.at(-1);
      if (prev?.type === 'same') { prev.expected.push(a[i]); prev.actual.push(b[j]); }
      else changes.push({ type: 'same', expected: [a[i]], actual: [b[j]] });
      i++; j++; continue;
    }
    const missing: string[] = [], extra: string[] = [];
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && ak[i] === bk[j]) break;
      if (i < a.length && (j === b.length || dp[i + 1][j] >= dp[i][j + 1])) missing.push(a[i++]);
      else extra.push(b[j++]);
    }
    changes.push({ type: missing.length && extra.length ? 'changed' : missing.length ? 'missing' : 'extra', expected: missing, actual: extra });
  }
  const errors = changes.reduce((n, c) => n + (c.type === 'same' ? 0 : Math.max(c.expected.length, c.actual.length)), 0);
  return { changes, errors, total: Math.max(a.length, b.length), equivalent: errors === 0, cosmetic: errors === 0 && expected !== actual };
}
export interface LineDiff { type: 'matched' | 'missing' | 'extra'; expectedIndex?: number; actualIndex?: number; expected: string; actual: string; diff: WordDiff }
export function splitPassage(text: string): string[] {
  // Free input may wrap arbitrarily; a CSV dialogue row may contain many sentences.
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  return text.split(/\r?\n/).flatMap(line => [...segmenter.segment(line)].map(s => s.segment.trim()).filter(Boolean));
}

export function passageDiff(expected: string[], input: string | string[], options: DiffOptions = defaultDiffOptions): LineDiff[] {
  const actual = typeof input === 'string' ? splitPassage(input) : input;
  const a = expected.length, b = actual.length;
  const spans = expected.map(line => typeof input === 'string' ? Math.max(1, splitPassage(line).length) : 1);
  const tokenCount = [...expected, ...actual].reduce((n, text) => n + tokens(text, options).length, 0);
  if (tokenCount > 2000) throw new Error('문단 비교는 원문과 입력을 합쳐 2,000개 토큰 이내로 제한합니다.');
  if (a > 150 || b > 150) throw new Error('한 번에 150개 문장 이내로 입력해 주세요.');
  const dp = Array.from({ length: a + 1 }, () => new Float64Array(b + 1).fill(Infinity));
  const prev = Array.from({ length: a + 1 }, () => new Array<{ i: number; j: number; type: LineDiff['type'] } | undefined>(b + 1));
  dp[0][0] = 0;
  const update = (i: number, j: number, ni: number, nj: number, cost: number, type: LineDiff['type']) => {
    if (dp[i][j] + cost < dp[ni][nj]) { dp[ni][nj] = dp[i][j] + cost; prev[ni][nj] = { i, j, type }; }
  };
  for (let i = 0; i <= a; i++) for (let j = 0; j <= b; j++) {
    if (i < a && j < b) {
      const maxSpan = spans[i];
      for (let span = 1; span <= maxSpan && j + span <= b; span++) {
        const d = wordDiff(expected[i], actual.slice(j, j + span).join(' '), options);
        const matches = d.changes.filter(c => c.type === 'same').reduce((n, c) => n + c.expected.length, 0);
        const similarity = d.total ? matches / d.total : 1;
        // Substitution costs less than delete+insert; exact later rows remain alignment anchors.
        const cost = (1 - similarity) * 1.8 + (span - 1) * 0.06;
        update(i, j, i + 1, j + span, cost, 'matched');
      }
    }
    if (i < a) update(i, j, i + 1, j, 1, 'missing');
    if (j < b) update(i, j, i, j + 1, 1, 'extra');
  }
  const result: LineDiff[] = [];
  let i = a, j = b;
  while (i || j) {
    const p = prev[i][j]!;
    const e = p.type === 'extra' ? '' : expected[p.i];
    const v = p.type === 'missing' ? '' : actual.slice(p.j, j).join(' ');
    result.push({ type: p.type, expectedIndex: p.type === 'extra' ? undefined : p.i, actualIndex: p.type === 'missing' ? undefined : p.j, expected: e, actual: v, diff: wordDiff(e, v, options) });
    i = p.i; j = p.j;
  }
  return result.reverse();
}
