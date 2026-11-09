import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builtinBooks } from '../src/extension/builtin';
import { compareNames, ensureLayout, listBooks, listChapters, neighbors, readChapter, type BookEntry, type ChapterEntry } from '../src/extension/library';
import { resolveRoot } from '../src/extension/settings';

let root: string;
let alpha: BookEntry;
let ch: ChapterEntry[];
const ext = '/ext';

beforeAll(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'byheart-lib-'));
  const a = join(root, 'books', 'alpha');
  await fs.mkdir(join(a, 'sub'), { recursive: true });
  await fs.mkdir(join(root, 'books', '.cache'), { recursive: true });
  await fs.mkdir(join(root, 'books', 'empty'), { recursive: true });
  await fs.writeFile(join(a, '2.txt'), '# Two\n\nx');
  await fs.writeFile(join(a, '10.txt'), 'ten');
  await fs.writeFile(join(a, '1.byheart.json'), '{}');
  await fs.writeFile(join(a, 'notes.md'), '# md');
  await fs.writeFile(join(a, 'sub', 'x.txt'), 'nested');
  await fs.writeFile(join(a, '.hidden.txt'), 'hidden');
  await fs.writeFile(join(root, 'books', '.cache', 'x.txt'), 'cache');
  await fs.writeFile(join(root, 'books', 'stray.txt'), 'not a book');
  alpha = { id: 'alpha', title: 'alpha', dir: a, readOnly: false };
  ch = await listChapters(alpha);
});
afterAll(() => fs.rm(root, { recursive: true, force: true }));

describe('settings', () => {
  it('resolveRoot', () => {
    expect(resolveRoot('', '/h')).toBe('/h/.byheart');
    expect(resolveRoot('   ', '/h')).toBe('/h/.byheart');
    expect(resolveRoot('~/b', '/h')).toBe('/h/b');
    expect(resolveRoot('~', '/h')).toBe('/h');
    expect(resolveRoot('rel', '/h')).toBe('/h/rel');
    expect(resolveRoot('/abs', '/h')).toBe('/abs');
  });
});

describe('library', () => {
  it('compareNames는 숫자순', () => {
    expect(['10', '2', '1'].sort(compareNames)).toEqual(['1', '2', '10']);
    expect(['b', 'B', 'a'].sort(compareNames)).toEqual(['a', 'b', 'B']);
  });

  it('builtinBooks는 내장 교재 하나', () => {
    expect(builtinBooks(ext)).toEqual([{ id: '.builtin/quotes', title: 'Quotes', dir: join(ext, 'content', 'quotes'), readOnly: true }]);
  });

  it('listBooks는 내장 교재를 먼저, 점 폴더와 파일을 제외하고, 빈 폴더도 포함한다', async () => {
    const books = await listBooks(root, builtinBooks(ext));
    expect(books.map((b) => b.id)).toEqual(['.builtin/quotes', 'alpha', 'empty']);
    expect(books[1]).toEqual({ id: 'alpha', title: 'alpha', dir: join(root, 'books', 'alpha'), readOnly: false });
  });

  it('listBooks는 books/가 없어도 내장 교재만 돌려준다', async () => {
    expect((await listBooks(join(root, 'nope'), builtinBooks(ext))).map((b) => b.id)).toEqual(['.builtin/quotes']);
  });

  it('listChapters는 다른 확장자와 하위 폴더·숨김 파일을 무시한다', () => {
    expect(ch.map((c) => c.ref.chapterId)).toEqual(['1.byheart.json', '2.txt', '10.txt']);
    expect(ch[0].title).toBe('1');
    expect(ch[0].ref).toEqual({ bookId: 'alpha', chapterId: '1.byheart.json' });
  });

  it('읽기 실패는 error로 남기고 목록에서 빼지 않는다', () => {
    expect(ch[0].error).toMatch(/schemaVersion/);
    expect(ch[0].error).not.toContain('\n');
    expect(ch[2].error).toBeUndefined();
  });

  it('txt의 # 제목은 description에 들어간다', () => {
    expect(ch[1].description).toBe('Two');
    expect(ch[2].description).toBeUndefined();
  });

  it('neighbors는 error 챕터를 건너뛴다', () => {
    expect(neighbors(ch, '2.txt')).toMatchObject({ next: { ref: { chapterId: '10.txt' } } });
    expect(neighbors(ch, '2.txt').previous).toBeUndefined();
    expect(neighbors(ch, '10.txt')).toMatchObject({ previous: { ref: { chapterId: '2.txt' } } });
    expect(neighbors(ch, '10.txt').next).toBeUndefined();
  });

  it('readChapter는 PracticeChapter를 돌려주고 실패는 던진다', async () => {
    const chapter = await readChapter(alpha, '2.txt');
    expect(chapter).toMatchObject({ title: '2', bookTitle: 'alpha', format: 'txt', readOnly: false });
    expect(chapter.cards.map((c) => c.text)).toEqual(['x']);
    await expect(readChapter(alpha, '1.byheart.json')).rejects.toThrow(/schemaVersion/);
    await expect(readChapter(alpha, 'missing.txt')).rejects.toThrow();
  });

  it('ensureLayout은 books/와 records/를 만들고 파일은 쓰지 않는다', async () => {
    const fresh = join(root, 'fresh');
    await ensureLayout(fresh);
    await ensureLayout(fresh);
    const entries = await fs.readdir(fresh, { withFileTypes: true });
    expect(entries.map((e) => e.name).sort()).toEqual(['books', 'records']);
    expect(entries.every((e) => e.isDirectory())).toBe(true);
    expect(await fs.readdir(join(fresh, 'books'))).toEqual([]);
  });
});
