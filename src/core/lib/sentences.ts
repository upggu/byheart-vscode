// Copied from ../byheart src/lib/sentences.ts at commit 0ee9eaa78e40d6aded17d1d27913c13ed0492339 (2026-11-08). Do not edit; re-copy and update this line.
import {sliceEmphasis, type EmphasisRange} from './emphasis';
import type { Item } from './content-types';

export interface SentenceUnit {
  kind?: 'study' | 'explanation';
  id: string;
  lineId: string;
  lineIndex: number;
  speaker: string;
  english: string;
  emphasis?: EmphasisRange[];
}

// Keep segmentation independent of browser/ICU versions. Source lines and IDs
// remain intact; these units are only the presentation/input boundaries.
export function splitSentences(text: string): string[] {
  const parts: string[] = [];
  const boundary = /[.!?]+["'”’»)\]]*(?=\s|$)/g;
  let start = 0;
  for (const match of text.matchAll(boundary)) {
    const end = match.index + match[0].length;
    const before = text.slice(start, match.index + 1);
    if (match[0] === '.' && end < text.length) {
      if (/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|a\.m|p\.m)\.$/i.test(before)) continue;
      if (/(?:\b[A-Za-z]\.){2,}$/.test(before) || /\b[A-Z]\.$/.test(before)) continue;
    }
    const part = text.slice(start, end).trim();
    if (part) parts.push(part);
    start = end;
  }
  const tail = text.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

export function sentenceUnits(item: Item): SentenceUnit[] {
  return item.lines.flatMap((line, lineIndex) => {
    if(line.kind==='explanation')return [];
    let offset = 0;
    return splitSentences(line.english).map((english, index) => {
      const start = line.english.indexOf(english, offset);
      offset = start + english.length;
      const emphasis = sliceEmphasis(line.emphasis, start, offset);
      return {id: `${line.id}--s${index + 1}`, lineId: line.id, lineIndex, speaker: line.speaker, english,
        ...(emphasis.length ? {emphasis} : {})};
    });
  });
}

// A source row is one speaker turn, even when it contains several sentences.
export function turnUnits(item: Item): SentenceUnit[] {
  return item.lines.map((line, lineIndex) => ({
    ...(line.kind ? {kind:line.kind} : {}), id: line.id, lineId: line.id, lineIndex, speaker: line.speaker, english: line.english, ...(line.emphasis ? {emphasis:line.emphasis} : {}),
  }));
}

export function focusedUnits(item: Item, state?: { unit?: 'turn' }): SentenceUnit[] {
  return state?.unit === 'turn' ? turnUnits(item) : sentenceUnits(item);
}

export function leadingWords(english: string): string {
  const words = [...english.matchAll(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)];
  if (words.length <= 2) return english;
  const second = words[1];
  return `${english.slice(0, second.index + second[0].length)} …`;
}

// A minimal cue: preserve the source prefix through the next word's first character.
export function recallCue(english: string): string {
  const words = [...english.matchAll(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)];
  if (!words.length) return '';
  const second = words[1];
  const end = second ? second.index + [...second[0]][0].length : words[0].index + words[0][0].length;
  return english.slice(0, end);
}
