// Types shared by the extension host and the webview. No runtime code.
import type { EmphasisRange } from '../core/lib/emphasis';

export type { EmphasisRange };

export interface ChapterRef {
  /** Folder name under books/, or '.builtin/quotes' for the bundled book. */
  bookId: string;
  /** File name including extension. */
  chapterId: string;
}

export interface PracticeCard {
  id: string;
  kind: 'study' | 'explanation';
  speaker: string;
  section?: string;
  /** Body with emphasis markers removed; used for hints and comparison. */
  text: string;
  emphasis?: EmphasisRange[];
  translation?: string;
  explanation?: string;
}

export interface PracticeChapter {
  ref: ChapterRef;
  bookTitle: string;
  title: string;
  format: 'byheart.json' | 'txt';
  readOnly: boolean;
  cards: PracticeCard[];
}

export type RoundMode = 'typing' | 'hint' | 'mixed';

export interface RoundRecord {
  mode: RoundMode;
  startedAt: string;
  finishedAt: string;
  /** Study cards checked in this round. */
  cards: number;
  /** Study cards in the chapter. */
  total: number;
  /** Recall typing only: practice cards are excluded. */
  accuracy: number | null;
  averageWpm: number | null;
  /** Typing cards checked with the full text shown (practice). Omitted when 0. */
  practiceCards?: number;
}

export interface ChapterRecord {
  schemaVersion: 1;
  book: string;
  chapter: string;
  revision: number;
  updatedAt: string;
  position: { cardId: string } | null;
  marks: Record<string, { difficult: boolean; at: string }>;
  rounds: RoundRecord[];
}

export type RecordOp =
  | { op: 'setMark'; cardId: string; difficult: boolean }
  | { op: 'setPosition'; cardId: string }
  | { op: 'addRound'; round: RoundRecord };

export interface Settings {
  showWpm: boolean;
}

export interface Preferences {
  mode: 'typing' | 'hint';
  showTranslation: boolean;
  /** Typing mode shows the whole sentence as the cue (extension only, off by default). */
  practice: boolean;
}

export interface Navigation {
  hasPrevious: boolean;
  hasNext: boolean;
}
