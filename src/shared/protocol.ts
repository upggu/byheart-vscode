// Messages between the extension host and the webview (design 4.3).
import type { ChapterRecord, ChapterRef, Navigation, PracticeChapter, Preferences, RecordOp, Settings } from './types';

export type Locale = 'ko' | 'en';

export type HostMessage =
  | {
      type: 'init';
      chapter: PracticeChapter;
      /** Empty record (revision 0) when the file is corrupt; an `error` message precedes it. */
      record: ChapterRecord;
      settings: Settings;
      preferences: Preferences;
      locale: Locale;
      navigation: Navigation;
    }
  | { type: 'chapter'; chapter: PracticeChapter; record: ChapterRecord; navigation: Navigation }
  | { type: 'record'; record: ChapterRecord }
  | { type: 'settings'; settings: Settings }
  | { type: 'error'; message: string };

export type WebviewMessage =
  | { type: 'ready'; chapterRef?: ChapterRef }
  | { type: 'apply'; ops: RecordOp[] }
  | { type: 'navigate'; to: 'next' | 'restart' | 'pick' }
  | { type: 'preferences'; preferences: Partial<Preferences> }
  | { type: 'openFolder' };
