// Copied from ../byheart src/lib/hints.ts at commit 0ee9eaa78e40d6aded17d1d27913c13ed0492339 (2026-11-08). Do not edit; re-copy and update this line.
export type HintLevel = 0 | 1 | 2 | 3;
const wordPattern = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

// A contraction is one word: don't -> d__'_. Preserve spacing and punctuation.
function mask(word: string, initial: boolean): string {
  let seen = false;
  return [...word].map(c => {
    if (!/[\p{L}\p{N}]/u.test(c)) return c;
    const visible = initial && !seen;
    seen = true;
    return visible ? c : '_';
  }).join('');
}
export function firstLetters(text: string): string {
  return text.replace(wordPattern, word => mask(word, true));
}
export function hintTokens(text: string, level: HintLevel, selected: number[] = []): { text: string; hidden: boolean; index: number }[] {
  if (!Number.isInteger(level) || level < 0 || level > 3) throw new Error('힌트 단계는 0~3이어야 합니다.');
  let index = 0;
  return (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\p{L}\p{N}]+/gu) ?? []).map(part => {
    if (!/^[\p{L}\p{N}]/u.test(part)) return { text: part, hidden: false, index: -1 };
    const i = index++;
    const reveal = level === 3 || (level === 2 && selected.includes(i));
    return { text: reveal ? part : mask(part, level > 0), hidden: !reveal, index: i };
  });
}
