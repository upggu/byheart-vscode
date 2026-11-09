// Minimal subset of ../byheart tests/fixtures.ts: only the `passage` item that
// the copied emphasis test imports. The web app's fixtures file also imports
// types from modules we do not copy (db, study).
import type { Item } from '../../src/core/lib/content-types';
export const passage: Item = {
  id: 'walk', bookId: 'book', type: 'passage', chapter: 'ch', title: 'Walk', lines: [
    { id: 'walk-a', seq: 1, speaker: 'A', korean: '가자', english: "Let's walk home today." },
    { id: 'walk-b', seq: 2, speaker: 'B', korean: '좋아', english: 'Good idea. We could follow the river.' },
  ],
};
