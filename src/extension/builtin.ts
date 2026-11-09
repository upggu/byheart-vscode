import { join } from 'node:path';
import type { BookEntry } from './library';

export const BUILTIN_QUOTES_ID = '.builtin/quotes';

/** Design 5.4: the bundled public-domain quotes book, read-only. */
export function builtinBooks(extensionPath: string): BookEntry[] {
  return [{ id: BUILTIN_QUOTES_ID, title: 'Quotes', dir: join(extensionPath, 'content', 'quotes'), readOnly: true }];
}
