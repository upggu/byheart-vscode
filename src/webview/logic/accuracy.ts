import { answerDiff } from '../../core/lib/answer-diff';

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const graphemes = (text: string): number => (text ? Array.from(segmenter.segment(text)).length : 0);
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Design 7.4: 1 − (error graphemes / expected graphemes), floored at 0, rounded
 * to three decimals. Strict comparison, so case and punctuation count as errors.
 * `limited` comparisons are excluded (null).
 */
export function cardAccuracy(expected: string, input: string): number | null {
  const diff = answerDiff(expected, input);
  if (diff.limited) return null;
  const total = graphemes(expected);
  if (total === 0) return null;
  let errors = graphemes(diff.extra);
  for (const part of diff.parts) if (part.kind !== 'same') errors += graphemes(part.text);
  return round3(Math.max(0, 1 - errors / total));
}

/** Mean of the non-null values, three decimals; null when nothing counts. */
export function roundAccuracy(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (!present.length) return null;
  return round3(present.reduce((a, b) => a + b, 0) / present.length);
}
