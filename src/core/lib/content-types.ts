// Copied from ../byheart src/lib/content-types.ts at commit 0ee9eaa78e40d6aded17d1d27913c13ed0492339 (2026-11-08). Do not edit; re-copy and update this line.
import type { EmphasisRange } from './emphasis';
export interface Book {
  id: string; title: string; subtitle: string; description: string;
  color: 'sage' | 'clay' | 'sand';
}
export interface Line { kind?: 'study' | 'explanation'; id: string; seq: number; speaker: string; section?: string; korean: string; english: string; emphasis?: EmphasisRange[] }
// One learnable chapter contains ordered source lines. `chapter` is its display
// name (Day1, Chapter 1, or arbitrary text); `id` is its stable storage identity.
export interface Chapter {
  id: string; bookId: string; type: 'sentence' | 'passage'; chapter: string; title: string; lines: Line[];
}
export type Item = Chapter; // Compatibility name used by stored reviews and old drafts.
export interface Explanation {
  id: string; item_id: string; line_id: string;
  type: 'grammar' | 'expression' | 'memorization' | 'context';
  expression: string; explanation: string; example: string;
}
export interface Content { version: string; books: Book[]; items: Item[]; explanations: Explanation[] }
