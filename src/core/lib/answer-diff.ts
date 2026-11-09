// Copied from ../byheart src/lib/answer-diff.ts at commit 0ee9eaa78e40d6aded17d1d27913c13ed0492339 (2026-11-08). Do not edit; re-copy and update this line.
export interface AnswerPart { text: string; kind: 'same' | 'detail' | 'changed' }
export interface AnswerDiff { parts: AnswerPart[]; extra: string; limited: boolean }
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const cosmetic = (s: string) => /^[\p{P}\s]*$/u.test(s);

/** Strict display-only comparison. Never changes the saved input or comparison settings. */
export function answerDiff(expected: string, actual: string): AnswerDiff {
  if (expected === actual) return { parts: [{ text: expected, kind: 'same' }], extra: '', limited: false };
  // Bound both segmentation and quadratic alignment for unusually long pasted input.
  if (expected.length > 10000 || actual.length > 10000)
    return { parts: [{ text: expected, kind: 'same' }], extra: '', limited: true };
  const a = Array.from(segmenter.segment(expected), s => s.segment);
  const b = Array.from(segmenter.segment(actual), s => s.segment);
  if ((a.length + 1) * (b.length + 1) > 1_000_000)
    return { parts: [{ text: expected, kind: 'same' }], extra: '', limited: true };
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length; i >= 0; i--) for (let j = b.length; j >= 0; j--) {
    if (i === a.length) dp[i][j] = b.length - j;
    else if (j === b.length) dp[i][j] = a.length - i;
    else dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1]
      : 1 + Math.min(dp[i + 1][j + 1], dp[i + 1][j], dp[i][j + 1]);
  }
  const parts: AnswerPart[] = [];
  let extra = '', i = 0, j = 0;
  function add(text: string, kind: AnswerPart['kind']) {
    const last = parts.at(-1);
    if (last?.kind === kind) last.text += text;
    else parts.push({ text, kind });
  }
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { add(a[i++], 'same'); j++; }
    else if (i < a.length && j < b.length && dp[i][j] === dp[i + 1][j + 1] + 1) {
      const detail = a[i].toLocaleLowerCase('en') === b[j].toLocaleLowerCase('en') || (cosmetic(a[i]) && cosmetic(b[j]));
      add(a[i++], detail ? 'detail' : 'changed'); j++;
    } else if (i < a.length && dp[i][j] === dp[i + 1][j] + 1) {
      add(a[i], cosmetic(a[i]) ? 'detail' : 'changed'); i++;
    } else { extra += b[j++]; }
  }
  return { parts, extra, limited: false };
}
