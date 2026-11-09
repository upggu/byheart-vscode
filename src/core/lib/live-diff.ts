// Copied from ../byheart src/lib/live-diff.ts at commit 0ee9eaa78e40d6aded17d1d27913c13ed0492339 (2026-11-08). Do not edit; re-copy and update this line.
import { defaultDiffOptions, type DiffOptions } from './diff';

export interface LiveRange { start: number; end: number }
export interface LiveHint extends LiveRange { expected: string }
export interface LiveDiff { errors: LiveRange[]; missing: number[]; limited: boolean; hints?: LiveHint[] }
interface Character extends LiveRange { key: string }
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

// UTF-16 offsets refer to the untouched textarea value, including combining marks.
// Like wordDiff, ignored whitespace still separates words: "a b" is not "ab".
function characters(text: string, options: DiffOptions): Character[] {
  const result: Character[] = [];
  for (const { segment, index } of segmenter.segment(text)) {
    let key = segment.normalize('NFC');
    if (options.ignorePunctuation) key = key.replace(/\p{P}/gu, '');
    if (!key) continue;
    if (options.ignoreCase) key = key.toLocaleLowerCase('en');
    if (options.ignoreWhitespace && /^\s+$/u.test(key)) {
      if (!result.length) continue;
      if (result.at(-1)!.key === ' ') { result.at(-1)!.end = index + segment.length; continue; }
      key = ' ';
    }
    result.push({ key, start: index, end: index + segment.length });
  }
  if (options.ignoreWhitespace && result.at(-1)?.key === ' ') result.pop();
  return result;
}

type Edit = 'changed' | 'extra' | 'missing';
interface Path {
  x: number; y: number; matches: number;
  previous?: Path; edit?: Edit; startY: number;
}
const empty = (limited = false): LiveDiff => ({ errors: [], missing: [], limited });
const anchorSize = 12;
const signature = (text: Character[], start: number) => JSON.stringify(text.slice(start, start + anchorSize).map(c => c.key));

/** Unique exact runs anchor large gaps; a Levenshtein wavefront aligns the small
 * regions between them. The unfinished reference suffix is free. No N×M matrix:
 * equal runs are scanned directly and pathological edits have a fixed work budget.
 * Runs in a worker; normalized reference and anchor index survive keystrokes.
 */
export function createLiveComparator(expected: string, options: DiffOptions = defaultDiffOptions) {
  const a = characters(expected, options);
  let anchors: Map<string, number> | undefined;
  function referenceAnchors() {
    if (anchors) return anchors;
    anchors = new Map();
    for (let x = 0; x + anchorSize <= a.length; x++) {
      const key = signature(a, x);
      anchors.set(key, anchors.has(key) ? -1 : x);
    }
    return anchors;
  }
  return (actual: string, withHints = false): LiveDiff => {
    const neutral = (limited = false): LiveDiff => ({ ...empty(limited), ...(withHints ? { hints: [] } : {}) });
    const matches = new Map<number, number>();
    const edits: { x: number; y: number; type: Edit }[] = [];
    const match = (x: number, y: number) => { if (withHints) matches.set(y, x); };
    const edit = (x: number, y: number, type: Edit) => { if (withHints) edits.push({ x, y, type }); };
    const b = characters(actual, options);
    if (!b.length) return neutral();
    let work = 0, states = 0;
    const errors: LiveRange[] = [], missing: number[] = [];
    function markError(index: number) {
      const { start, end } = b[index];
      const last = errors.at(-1);
      if (last?.end === start) last.end = end;
      else errors.push({ start, end });
    }
    function align(startX: number, endX: number, startY: number, endY: number, anchored: boolean): boolean {
      if (startY === endY) {
        if (anchored && startX < endX) {
          missing.push(b[endY].start);
          for (let x = startX; x < endX; x++) edit(x, endY, 'missing');
        }
        return true;
      }
      if (startX === endX) {
        for (let y = startY; y < endY; y++) { markError(y); edit(startX, y, 'extra'); }
        return true;
      }
      const extend = (path: Path) => {
        while (path.x < endX && path.y < endY && a[path.x].key === b[path.y].key) {
          path.x++; path.y++; path.matches++; work++;
        }
        return path;
      };
      const complete = (p: Path) => p.y === endY && (!anchored || p.x === endX);
      const first = extend({ x: startX, y: startY, matches: 0, startY });
      for (let y = startY; y < first.y; y++) match(startX + y - startY, y);
      if (complete(first)) return true;
      let frontier = new Map<number, Path>([[0, first]]);
      let winner: Path | undefined;
      for (let distance = 1; !winner; distance++) {
        const next = new Map<number, Path>();
        const candidates: Path[] = [];
        for (let diagonal = -distance; diagonal <= distance; diagonal++) {
          if (++states > 100_000 || work > 1_000_000) return false;
          let best: Path | undefined;
          const consider = (previous: Path | undefined, edit: Edit) => {
            if (!previous) return;
            const dx = edit === 'extra' ? 0 : 1, dy = edit === 'missing' ? 0 : 1;
            if (previous.x + dx > endX || previous.y + dy > endY) return;
            const path = extend({ x: previous.x + dx, y: previous.y + dy,
              startY: previous.y, matches: previous.matches, previous, edit });
            if (!best || path.x > best.x || (path.x === best.x && path.matches > best.matches)) best = path;
          };
          consider(frontier.get(diagonal), 'changed');
          consider(frontier.get(diagonal + 1), 'extra');
          consider(frontier.get(diagonal - 1), 'missing');
          if (best) {
            next.set(diagonal, best);
            if (complete(best)) candidates.push(best);
          }
        }
        winner = candidates.sort((p, q) => q.matches - p.matches || p.x - q.x)[0];
        frontier = next;
      }
      const path: Path[] = [];
      for (let step: Path | undefined = winner; step?.previous; step = step.previous) path.push(step);
      path.reverse();
      let lastMatch = anchored ? path.length : -1;
      if (!anchored) path.forEach((p, i) => { if (p.y > p.startY + (p.edit === 'missing' ? 0 : 1)) lastMatch = i; });
      path.forEach((step, i) => {
        if (step.edit === 'missing') {
          if (i <= lastMatch && b[step.startY]) {
            missing.push(b[step.startY].start);
            edit(step.previous!.x, step.startY, 'missing');
          }
        } else {
          markError(step.startY);
          edit(step.previous!.x, step.startY, step.edit!);
          if (step.edit === 'changed') match(step.previous!.x, step.startY);
        }
        const fromY = step.startY + (step.edit === 'missing' ? 0 : 1);
        for (let y = fromY; y < step.y; y++) match(step.x - step.y + y, y);
      });
      return true;
    }
    let x = 0, y = 0;
    while (y < b.length) {
      while (x < a.length && y < b.length && a[x].key === b[y].key) { match(x, y); x++; y++; }
      if (y === b.length) break;
      let anchor: { x: number; y: number } | undefined;
      if (a.length - x >= anchorSize && b.length - y >= anchorSize) {
        const index = referenceAnchors();
        for (let j = y; j + anchorSize <= b.length; j++) {
          const i = index.get(signature(b, j));
          if (i !== undefined && i >= x) { anchor = { x: i, y: j }; break; }
        }
      }
      if (!align(x, anchor?.x ?? a.length, y, anchor?.y ?? b.length, !!anchor)) return neutral(true);
      if (!anchor) break;
      for (let i = 0; i < anchorSize; i++) match(anchor.x + i, anchor.y + i);
      x = anchor.x + anchorSize; y = anchor.y + anchorSize;
    }
    const result: LiveDiff = { errors, missing: [...new Set(missing)], limited: false };
    if (withHints) result.hints = wordHints(expected, actual, a, b, matches, edits);
    return result;
  };
}

export function liveDiff(expected: string, actual: string, options: DiffOptions = defaultDiffOptions): LiveDiff {
  return createLiveComparator(expected, options)(actual);
}

/** Use the winning alignment, not positional word indices: inserted words must
 * not shift every following hint. Word ranges always refer to the original text. */
function wordHints(expected: string, actual: string, a: Character[], b: Character[],
  matches: Map<number, number>, edits: { x: number; y: number; type: Edit }[]): LiveHint[] {
  const words = (text: string) => [...text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu)]
    .map(m => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
  const reference = words(expected), input = words(actual);
  const indexWords = (chars: Character[], tokens: LiveRange[]) => {
    let i = 0;
    return chars.map(c => {
      while (i < tokens.length && tokens[i].end <= c.start) i++;
      return tokens[i]?.start <= c.start ? i : -1;
    });
  };
  const aw = indexWords(a, reference), bw = indexWords(b, input);
  const links = new Map<number, Set<number>>();
  const referenceRanges = new Map<number, LiveRange>();
  for (const [y, x] of matches) {
    if (bw[y] < 0 || aw[x] < 0) continue;
    const targets = links.get(bw[y]) ?? new Set<number>();
    targets.add(aw[x]); links.set(bw[y], targets);
    const range = referenceRanges.get(aw[x]), word = input[bw[y]];
    referenceRanges.set(aw[x], { start: Math.min(range?.start ?? word.start, word.start),
      end: Math.max(range?.end ?? word.end, word.end) });
  }
  const hints = new Map<string, LiveHint>();
  let lastMatchedY = -1;
  for (const y of matches.keys()) lastMatchedY = Math.max(lastMatchedY, y);
  for (const e of edits) {
    const inputWord = bw[e.y] ?? -1;
    let targets = links.get(inputWord);
    if (e.type === 'extra' && inputWord < 0) {
      // A mistyped separator can split one reference word into two fragments.
      const right = input.findIndex(w => w.start > b[e.y].start);
      const leftTargets = links.get(right - 1), rightTargets = links.get(right);
      targets = new Set([...(leftTargets ?? [])].filter(r => rightTargets?.has(r)));
    }
    // At an unfinished, entirely mistyped word the free-suffix alignment may
    // prefer insertion to substitution. There is no later match proving a whole
    // extra word, so offer the current reference word (never a following suffix).
    const unfinished = e.type === 'extra' && !targets?.size && inputWord >= 0
      && inputWord === input.length - 1 && e.y > lastMatchedY && (aw[e.x] ?? -1) >= 0;
    const referenceWords = e.type === 'extra' && !unfinished ? [...(targets ?? [])] : [aw[e.x] ?? -1];
    for (const r of referenceWords) {
      if (r < 0) continue;
      const attached = inputWord >= 0 && (unfinished || targets?.has(r));
      const range = referenceRanges.get(r);
      const start = range?.start ?? (attached ? input[inputWord].start : b[e.y]?.start ?? actual.length);
      const end = range?.end ?? (attached ? input[inputWord].end : start);
      hints.set(`${r}:${start}`, { start, end, expected: reference[r].text });
    }
  }
  return [...hints.values()].sort((p, q) => p.start - q.start);
}
