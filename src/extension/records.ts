import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ChapterRecord, ChapterRef, RecordOp } from '../shared/types';

/** `<root>/records/<bookId>/<chapterId>.json` (design 6.1). */
export function recordPath(root: string, ref: ChapterRef): string {
  return join(root, 'records', ref.bookId, `${ref.chapterId}.json`);
}

export function emptyRecord(ref: ChapterRef): ChapterRecord {
  return { schemaVersion: 1, book: ref.bookId, chapter: ref.chapterId, revision: 0, updatedAt: '', position: null, marks: {}, rounds: [] };
}

/** Pure: applies ops, bumps revision, sets updatedAt. Never deletes a mark key. */
export function applyOps(record: ChapterRecord, ops: RecordOp[], now: string): ChapterRecord {
  const next: ChapterRecord = { ...record, marks: { ...record.marks }, rounds: [...record.rounds], revision: record.revision + 1, updatedAt: now };
  for (const op of ops) {
    switch (op.op) {
      case 'setMark':
        next.marks[op.cardId] = { difficult: op.difficult, at: now };
        break;
      case 'setPosition':
        next.position = { cardId: op.cardId };
        break;
      case 'addRound':
        next.rounds.push(op.round);
        break;
    }
  }
  return next;
}

export class RecordCorruptError extends Error {
  constructor(
    public readonly path: string,
    cause: unknown,
  ) {
    super(`Record file is not readable and was left untouched: ${path}`, { cause });
    this.name = 'RecordCorruptError';
  }
}

export class RecordConflictError extends Error {
  constructor(path: string) {
    super(`Record file changed concurrently three times: ${path}`);
    this.name = 'RecordConflictError';
  }
}

function isRecord(value: unknown): value is ChapterRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === 1 &&
    typeof v.book === 'string' &&
    typeof v.chapter === 'string' &&
    typeof v.revision === 'number' &&
    typeof v.updatedAt === 'string' &&
    (v.position === null || (typeof v.position === 'object' && v.position !== null)) &&
    typeof v.marks === 'object' && v.marks !== null && !Array.isArray(v.marks) &&
    Array.isArray(v.rounds)
  );
}

const MAX_ATTEMPTS = 3;

// Serializes writers to one path inside this process. The revision check below
// covers other processes (another VS Code window); in-process callers would
// otherwise both see "no file" and both rename, losing one op.
const queues = new Map<string, Promise<unknown>>();
function serialized<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  queues.set(key, run.catch(() => undefined));
  return run;
}

export class RecordStore {
  constructor(
    private readonly root: string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /** Missing file → empty record (revision 0). Unparseable → RecordCorruptError, file untouched. */
  async load(ref: ChapterRef): Promise<ChapterRecord> {
    const path = recordPath(this.root, ref);
    return (await this.read(path)) ?? emptyRecord(ref);
  }

  private async read(path: string): Promise<ChapterRecord | null> {
    let text: string;
    try {
      text = await fs.readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    try {
      const value: unknown = JSON.parse(text);
      if (!isRecord(value)) throw new Error('unexpected record shape');
      return value;
    } catch (error) {
      throw new RecordCorruptError(path, error);
    }
  }

  /**
   * Design 6.2: read → apply → write temp in the same directory (fsync) → re-read
   * and compare revision → rename. Retried up to three times. Two panels applying
   * ops to the same chapter both land; a read/rename race window remains, but the
   * file itself is never left half-written.
   */
  apply(ref: ChapterRef, ops: RecordOp[]): Promise<ChapterRecord> {
    const path = recordPath(this.root, ref);
    return serialized(path, () => this.applyUnlocked(path, ref, ops));
  }

  private async applyUnlocked(path: string, ref: ChapterRef, ops: RecordOp[]): Promise<ChapterRecord> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const current = (await this.read(path)) ?? emptyRecord(ref);
      const next = applyOps(current, ops, this.now());
      await fs.mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
      const handle = await fs.open(tmp, 'w');
      try {
        await handle.writeFile(JSON.stringify(next, null, 2) + '\n', 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      let unchanged = false;
      try {
        const latest = await this.read(path);
        unchanged = (latest?.revision ?? 0) === current.revision;
        if (unchanged) {
          await fs.rename(tmp, path);
          return next;
        }
      } finally {
        // Retry, corrupt re-read, or a failed rename: never leave a .tmp in the user's folder.
        await fs.rm(tmp, { force: true });
      }
      await new Promise((r) => setTimeout(r, Math.random() * 20));
    }
    throw new RecordConflictError(path);
  }
}
