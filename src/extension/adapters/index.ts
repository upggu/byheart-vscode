import type { ChapterRef, PracticeChapter } from '../../shared/types';
import { cardsFromByheartJson } from './byheart-json';
import { parseTxt } from './txt';

export { cardsFromByheartJson, toItem } from './byheart-json';
export { parseTxt } from './txt';

export const JSON_SUFFIX = '.byheart.json';
export const TXT_SUFFIX = '.txt';

export function chapterFormat(chapterId: string): PracticeChapter['format'] | undefined {
  if (chapterId.endsWith(JSON_SUFFIX)) return 'byheart.json';
  if (chapterId.endsWith(TXT_SUFFIX)) return 'txt';
  return undefined;
}

/** Chapter display name: the file name without its extension. */
export function chapterTitle(chapterId: string): string {
  const format = chapterFormat(chapterId);
  if (format === 'byheart.json') return chapterId.slice(0, -JSON_SUFFIX.length);
  if (format === 'txt') return chapterId.slice(0, -TXT_SUFFIX.length);
  return chapterId;
}

export function loadChapter(args: { ref: ChapterRef; bookTitle: string; readOnly: boolean; text: string }): PracticeChapter {
  const { ref, bookTitle, readOnly, text } = args;
  const format = chapterFormat(ref.chapterId);
  if (!format) throw new Error(`지원하지 않는 형식: ${ref.chapterId}`);
  const cards = format === 'byheart.json' ? cardsFromByheartJson(text, ref.chapterId, ref.bookId) : parseTxt(text).cards;
  return { ref, bookTitle, title: chapterTitle(ref.chapterId), format, readOnly, cards };
}
