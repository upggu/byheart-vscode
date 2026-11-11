import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ChapterRef, PracticeChapter } from '../shared/types';
import { chapterFormat, chapterTitle, loadChapter, parseTxt } from './adapters';

export interface BookEntry {
  id: string;
  title: string;
  dir: string;
  readOnly: boolean;
}

export interface ChapterEntry {
  ref: ChapterRef;
  title: string;
  /** `.txt` heading (`# Title`), shown as QuickPick detail only. */
  description?: string;
  /** First line of the read/parse failure; the chapter stays listed. */
  error?: string;
}

// Same ordering as the web app's scripts/content-discovery.ts.
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'variant' });
export const compareNames = (a: string, b: string): number =>
  collator.compare(a.normalize('NFC'), b.normalize('NFC')) || (a < b ? -1 : a > b ? 1 : 0);

export function booksDir(root: string): string {
  return join(root, 'books');
}

/** Guide written into books/ by the Edit Books command. `.md`, so never read as a chapter. */
export const GUIDE_NAME = 'BYHEART-GUIDE.md';

/**
 * The one file the extension writes into the user's books folder: created only
 * when missing (exclusive create), never overwritten. Returns whether it wrote.
 */
export async function writeGuideIfMissing(root: string, content: string): Promise<boolean> {
  try {
    await fs.writeFile(join(booksDir(root), GUIDE_NAME), content, { flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

/** Creates books/ and records/ when missing. Never writes a file. */
export async function ensureLayout(root: string): Promise<void> {
  await fs.mkdir(booksDir(root), { recursive: true });
  await fs.mkdir(join(root, 'records'), { recursive: true });
}

export async function listBooks(root: string, builtin: BookEntry[]): Promise<BookEntry[]> {
  const dir = booksDir(root);
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [...builtin];
  }
  const folders = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort(compareNames)
    .map((name): BookEntry => ({ id: name, title: name, dir: join(dir, name), readOnly: false }));
  return [...builtin, ...folders];
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0] || 'unknown error';
}

export async function listChapters(book: BookEntry): Promise<ChapterEntry[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(book.dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = entries
    .filter((e) => e.isFile() && !e.name.startsWith('.') && chapterFormat(e.name) !== undefined)
    .map((e) => e.name)
    .sort(compareNames);
  return Promise.all(
    names.map(async (chapterId): Promise<ChapterEntry> => {
      const ref: ChapterRef = { bookId: book.id, chapterId };
      const entry: ChapterEntry = { ref, title: chapterTitle(chapterId) };
      try {
        const text = await fs.readFile(join(book.dir, chapterId), 'utf8');
        if (chapterFormat(chapterId) === 'txt') {
          const { title } = parseTxt(text);
          if (title) entry.description = title;
        } else {
          loadChapter({ ref, bookTitle: book.title, readOnly: book.readOnly, text });
        }
      } catch (error) {
        entry.error = firstLine(error);
      }
      return entry;
    }),
  );
}

export async function readChapter(book: BookEntry, chapterId: string): Promise<PracticeChapter> {
  const text = await fs.readFile(join(book.dir, chapterId), 'utf8');
  return loadChapter({ ref: { bookId: book.id, chapterId }, bookTitle: book.title, readOnly: book.readOnly, text });
}

/** Previous/next among chapters without errors. */
export function neighbors(chapters: ChapterEntry[], chapterId: string): { previous?: ChapterEntry; next?: ChapterEntry } {
  const valid = chapters.filter((c) => !c.error);
  const index = valid.findIndex((c) => c.ref.chapterId === chapterId);
  if (index === -1) return {};
  return {
    ...(index > 0 ? { previous: valid[index - 1] } : {}),
    ...(index < valid.length - 1 ? { next: valid[index + 1] } : {}),
  };
}
