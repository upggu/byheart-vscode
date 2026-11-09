import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTxt } from '../../src/extension/adapters/txt';
import { loadChapter } from '../../src/extension/adapters/index';

const read = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

describe('parseTxt', () => {
  it('빈 줄 단락 = 카드, # 첫 줄 = 제목, BOM·CRLF를 제거한다', () => {
    const { title, cards } = parseTxt(read('poem.txt'));
    expect(title).toBe('Ozymandias');
    expect(cards).toHaveLength(3);
    expect(cards[1].text).toMatch(/\n/);
    expect(cards[1].text).not.toMatch(/\r/);
    expect(cards[0].text).toBe('I met a traveller from an antique land');
    expect(cards[0]).toMatchObject({ kind: 'study', speaker: '' });
    expect(cards[0]).not.toHaveProperty('emphasis');
    expect(cards[0]).not.toHaveProperty('translation');
  });

  it('카드 ID는 본문 sha256 앞 16자이고 중복 본문은 -2를 붙인다', () => {
    const { cards } = parseTxt('a\n\na');
    expect(cards[0].id).toBe(createHash('sha256').update('a').digest('hex').slice(0, 16));
    expect(cards[1].id).toBe(cards[0].id + '-2');
    expect(parseTxt(read('poem.txt')).cards[2].id).toMatch(/-2$/);
  });

  it('제목이 아닌 # 줄은 본문이고 ** 는 해석하지 않는다', () => {
    const { title, cards } = parseTxt('x\n\n# not title\n\n**bold**');
    expect(title).toBeUndefined();
    expect(cards[1].text).toBe('# not title');
    expect(cards[2].text).toBe('**bold**');
  });

  it('공백만 있는 줄도 단락 구분이고 줄 끝 공백은 지운다', () => {
    const { cards } = parseTxt('one  \n   \ntwo\t\n');
    expect(cards.map((c) => c.text)).toEqual(['one', 'two']);
  });

  it('카드가 없으면 빈 파일 오류', () => {
    expect(() => parseTxt('# only title\n\n')).toThrow('빈 파일');
    expect(() => parseTxt('')).toThrow('빈 파일');
  });
});

describe('loadChapter', () => {
  it('확장자로 형식을 고른다', () => {
    const json = loadChapter({ ref: { bookId: 'b', chapterId: 'Day 1.byheart.json' }, bookTitle: 'Book', readOnly: false, text: read('day1.byheart.json') });
    expect(json).toMatchObject({ format: 'byheart.json', title: 'Day 1', bookTitle: 'Book', readOnly: false, ref: { bookId: 'b', chapterId: 'Day 1.byheart.json' } });
    expect(json.cards).toHaveLength(3);
    const txt = loadChapter({ ref: { bookId: 'b', chapterId: 'poem.txt' }, bookTitle: 'b', readOnly: true, text: read('poem.txt') });
    expect(txt).toMatchObject({ format: 'txt', title: 'poem', readOnly: true });
    expect(() => loadChapter({ ref: { bookId: 'b', chapterId: 'x.md' }, bookTitle: 'b', readOnly: false, text: '' })).toThrow();
  });
});
