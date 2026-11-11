// Holds the open chapter, its record, and the file watcher; turns webview
// messages into host messages (design 4.3). VS Code APIs arrive via deps so
// this file is unit-testable in Node.
import { resolve } from 'node:path';
import type { HostMessage, Locale, WebviewMessage } from '../shared/protocol';
import type { ChapterRef, Preferences, Settings } from '../shared/types';
import { listBooks, listChapters, neighbors, readChapter, type BookEntry, type ChapterEntry } from './library';
import { emptyRecord, RecordCorruptError, type RecordStore } from './records';

export interface Disposable {
  dispose(): void;
}

export interface SessionDeps {
  root: string;
  store: RecordStore;
  builtin: BookEntry[];
  post: (message: HostMessage) => void;
  settings: () => Settings;
  preferences: () => Preferences;
  setPreferences: (p: Partial<Preferences>) => Thenable<void>;
  locale: Locale;
  /** QuickPick flow; undefined when the user cancels. */
  pick: () => Promise<{ bookId: string; chapterId: string } | undefined>;
  /** Watches one file; `onChange` fires on change/create/delete. */
  watch: (dir: string, chapterId: string, onChange: () => void) => Disposable;
  /** Non-blocking user notification (showErrorMessage). */
  notify: (message: string) => void;
}

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** True when `fsPath` is exactly the chapter file (not a sibling or a nested file). */
export function isChapterFile(dir: string, chapterId: string, fsPath: string): boolean {
  return resolve(fsPath) === resolve(dir, chapterId);
}

export class PracticeSession {
  private current: { ref: ChapterRef; book: BookEntry; chapters: ChapterEntry[] } | undefined;
  private watcher: Disposable | undefined;

  constructor(private readonly deps: SessionDeps) {}

  private async findBook(bookId: string): Promise<BookEntry | undefined> {
    const books = await listBooks(this.deps.root, this.deps.builtin);
    return books.find((b) => b.id === bookId);
  }

  /**
   * `init` answers a webview `ready` (the webview may have just been recreated
   * without saved state and needs settings/preferences/locale); `chapter` is for
   * navigation and file changes, when the webview already has state.
   */
  async open(ref: ChapterRef, as: 'init' | 'chapter' = 'chapter'): Promise<void> {
    const book = await this.findBook(ref.bookId);
    if (!book) {
      this.deps.post({ type: 'error', message: `Book not found: ${ref.bookId}` });
      return;
    }
    let chapter;
    try {
      chapter = await readChapter(book, ref.chapterId);
    } catch (error) {
      this.deps.post({ type: 'error', message: `${ref.chapterId}: ${describe(error)}` });
      return;
    }
    const record = await this.loadRecord(ref);
    const chapters = await listChapters(book);
    this.current = { ref, book, chapters };
    this.rewatch(book, ref.chapterId);
    const nav = neighbors(chapters, ref.chapterId);
    const navigation = { hasPrevious: !!nav.previous, hasNext: !!nav.next };
    if (as === 'init') {
      this.deps.post({ type: 'init', chapter, record, settings: this.deps.settings(), preferences: this.deps.preferences(), locale: this.deps.locale, navigation });
    } else {
      this.deps.post({ type: 'chapter', chapter, record, navigation });
    }
  }

  /** Corrupt file → error message, then an empty in-memory record (design 6.1). */
  private async loadRecord(ref: ChapterRef) {
    try {
      return await this.deps.store.load(ref);
    } catch (error) {
      this.deps.post({ type: 'error', message: describe(error) });
      return emptyRecord(ref);
    }
  }

  private rewatch(book: BookEntry, chapterId: string): void {
    this.watcher?.dispose();
    this.watcher = this.deps.watch(book.dir, chapterId, () => void this.reload());
  }

  private async reload(): Promise<void> {
    const current = this.current;
    if (!current) return;
    try {
      const chapter = await readChapter(current.book, current.ref.chapterId);
      const record = await this.loadRecord(current.ref);
      current.chapters = await listChapters(current.book);
      const nav = neighbors(current.chapters, current.ref.chapterId);
      this.deps.post({ type: 'chapter', chapter, record, navigation: { hasPrevious: !!nav.previous, hasNext: !!nav.next } });
    } catch (error) {
      this.deps.post({ type: 'error', message: `${current.ref.chapterId}: ${describe(error)}` });
    }
  }

  pushSettings(settings: Settings): void {
    this.deps.post({ type: 'settings', settings });
  }

  async handle(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'ready': {
        const ref = message.chapterRef ?? this.current?.ref ?? (await this.deps.pick());
        if (ref) await this.open(ref, 'init');
        return;
      }
      case 'apply': {
        const current = this.current;
        if (!current) return;
        try {
          const record = await this.deps.store.apply(current.ref, message.ops);
          this.deps.post({ type: 'record', record });
        } catch (error) {
          this.deps.post({ type: 'error', message: error instanceof RecordCorruptError ? error.message : describe(error) });
        }
        return;
      }
      case 'navigate': {
        if (message.to === 'restart') return; // handled inside the webview
        if (message.to === 'pick') {
          const ref = await this.deps.pick();
          if (ref) await this.open(ref);
          return;
        }
        const current = this.current;
        if (!current) return;
        const next = neighbors(current.chapters, current.ref.chapterId).next;
        if (!next) return;
        try {
          const chapter = await readChapter(current.book, current.ref.chapterId);
          const first = chapter.cards[0];
          if (first) await this.deps.store.apply(current.ref, [{ op: 'setPosition', cardId: first.id }]);
        } catch (error) {
          this.deps.post({ type: 'error', message: describe(error) });
        }
        await this.open(next.ref);
        return;
      }
      case 'preferences':
        await this.deps.setPreferences(message.preferences);
        return;
    }
  }

  dispose(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    this.current = undefined;
  }
}
