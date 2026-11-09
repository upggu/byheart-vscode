import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordConflictError, RecordCorruptError, RecordStore, applyOps, emptyRecord, recordPath } from '../src/extension/records';
import type { ChapterRef, RecordOp, RoundRecord } from '../src/shared/types';

const ref: ChapterRef = { bookId: 'my-book', chapterId: 'Day 1.byheart.json' };
const t1 = '2026-11-09T09:00:00.000Z';
const t2 = '2026-11-09T09:01:00.000Z';
const setMark: RecordOp = { op: 'setMark', cardId: 'a', difficult: true };
const round: RoundRecord = { mode: 'typing', startedAt: t1, finishedAt: t2, cards: 2, total: 2, accuracy: 0.9, averageWpm: 30 };

describe('applyOps', () => {
  it('setMark false는 키를 지우지 않는다', () => {
    const r = applyOps(applyOps(emptyRecord(ref), [setMark], t1), [{ op: 'setMark', cardId: 'a', difficult: false }], t2);
    expect(r.marks.a).toEqual({ difficult: false, at: t2 });
    expect(r.revision).toBe(2);
    expect(r.updatedAt).toBe(t2);
  });

  it('setPosition과 addRound', () => {
    const r = applyOps(emptyRecord(ref), [{ op: 'setPosition', cardId: 'b' }, { op: 'addRound', round }], t1);
    expect(r.position).toEqual({ cardId: 'b' });
    expect(r.rounds).toEqual([round]);
    expect(r.revision).toBe(1);
  });

  it('입력 기록을 바꾸지 않는다', () => {
    const base = emptyRecord(ref);
    applyOps(base, [setMark, { op: 'setPosition', cardId: 'b' }, { op: 'addRound', round }], t1);
    expect(base).toEqual(emptyRecord(ref));
  });

  it('emptyRecord', () => {
    expect(emptyRecord(ref)).toEqual({ schemaVersion: 1, book: 'my-book', chapter: 'Day 1.byheart.json', revision: 0, updatedAt: '', position: null, marks: {}, rounds: [] });
  });
});

describe('recordPath', () => {
  it('내장 교재의 기록 경로', () => {
    expect(recordPath('/r', { bookId: '.builtin/quotes', chapterId: '01.byheart.json' })).toBe('/r/records/.builtin/quotes/01.byheart.json.json');
    expect(recordPath('/r', ref)).toBe('/r/records/my-book/Day 1.byheart.json.json');
  });
});

describe('RecordStore', () => {
  let root: string;
  let store: RecordStore;
  let path: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'byheart-rec-'));
    store = new RecordStore(root, () => t1);
    path = recordPath(root, ref);
  });
  afterEach(() => fs.rm(root, { recursive: true, force: true }));

  it('load는 파일이 없으면 빈 기록', async () => {
    expect(await store.load(ref)).toMatchObject({ revision: 0, book: ref.bookId, chapter: ref.chapterId });
    await expect(fs.stat(path)).rejects.toThrow();
  });

  it('apply는 파일을 만들고 revision을 올리며 임시 파일을 남기지 않는다', async () => {
    const result = await store.apply(ref, [setMark]);
    expect(result.revision).toBe(1);
    const dir = await fs.readdir(dirname(path));
    expect(dir).toEqual([`${ref.chapterId}.json`]);
    const onDisk = JSON.parse(await fs.readFile(path, 'utf8'));
    expect(onDisk).toEqual(result);
    expect(onDisk.marks.a).toEqual({ difficult: true, at: t1 });
    expect((await store.apply(ref, [{ op: 'setPosition', cardId: 'z' }])).revision).toBe(2);
    expect(await store.load(ref)).toMatchObject({ revision: 2, position: { cardId: 'z' }, marks: { a: { difficult: true } } });
  });

  it('두 저장소가 번갈아 써도 두 연산이 모두 남는다', async () => {
    const a = new RecordStore(root);
    const b = new RecordStore(root);
    await Promise.all([
      a.apply(ref, [{ op: 'setMark', cardId: 'x', difficult: true }]),
      b.apply(ref, [{ op: 'setMark', cardId: 'y', difficult: true }]),
    ]);
    const r = await a.load(ref);
    expect(Object.keys(r.marks).sort()).toEqual(['x', 'y']);
    expect(r.revision).toBe(2);
    expect(await fs.readdir(dirname(path))).toEqual([`${ref.chapterId}.json`]);
  });

  it('손상된 파일은 덮어쓰지 않고 RecordCorruptError를 던진다', async () => {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, '{not json');
    await expect(store.load(ref)).rejects.toBeInstanceOf(RecordCorruptError);
    await expect(store.apply(ref, [setMark])).rejects.toBeInstanceOf(RecordCorruptError);
    expect(await fs.readFile(path, 'utf8')).toBe('{not json');
    expect(await fs.readdir(dirname(path))).toEqual([`${ref.chapterId}.json`]);
  });

  it('스키마가 다른 JSON도 손상으로 본다', async () => {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, '{"schemaVersion":2}');
    await expect(store.load(ref)).rejects.toBeInstanceOf(RecordCorruptError);
    await fs.writeFile(path, '[]');
    await expect(store.load(ref)).rejects.toBeInstanceOf(RecordCorruptError);
  });

  it('rename이 실패해도 임시 파일을 남기지 않는다', async () => {
    const spy = vi.spyOn(fs, 'rename').mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }));
    try {
      await expect(store.apply(ref, [setMark])).rejects.toThrow('EACCES');
    } finally {
      spy.mockRestore();
    }
    expect(await fs.readdir(dirname(path))).toEqual([]);
  });

  it('RecordConflictError는 Error다', () => {
    expect(new RecordConflictError('x')).toBeInstanceOf(Error);
  });
});
