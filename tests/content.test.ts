import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardsFromByheartJson } from '../src/extension/adapters';
import { builtinBooks } from '../src/extension/builtin';
import { listChapters } from '../src/extension/library';

const repoRoot = resolve(__dirname, '..');
const book = builtinBooks(repoRoot)[0];

describe('built-in quotes', () => {
  it('모든 챕터가 파싱되고 각 카드에 translation과 출처 불릿이 있다', async () => {
    const chapters = await listChapters(book);
    expect(chapters).toHaveLength(2);
    expect(chapters.every((c) => !c.error)).toBe(true);
    let total = 0;
    for (const c of chapters) {
      const cards = cardsFromByheartJson(await fs.readFile(join(book.dir, c.ref.chapterId), 'utf8'));
      expect(cards).toHaveLength(10);
      total += cards.length;
      for (const card of cards) {
        expect(card.kind).toBe('study');
        expect(card.speaker).not.toBe('');
        expect(card.speaker.length).toBeLessThanOrEqual(40);
        expect(card.translation).toBeTruthy();
        expect(card.explanation!.trim().split('\n').at(-1)).toMatch(/^- 출처: .+ \(\d{3,4}\), https?:\/\//);
      }
    }
    expect(total).toBe(20);
  });

  it('SOURCES.md는 모든 저자를 포함한다', async () => {
    const sources = await fs.readFile(join(book.dir, 'SOURCES.md'), 'utf8');
    const chapters = await listChapters(book);
    for (const c of chapters) {
      const cards = cardsFromByheartJson(await fs.readFile(join(book.dir, c.ref.chapterId), 'utf8'));
      for (const card of cards) expect(sources).toContain(card.speaker);
    }
  });

  it('SOURCES.md는 챕터로 보이지 않는다', async () => {
    const chapters = await listChapters(book);
    expect(chapters.map((c) => c.ref.chapterId).every((id) => id.endsWith('.byheart.json'))).toBe(true);
  });
});
