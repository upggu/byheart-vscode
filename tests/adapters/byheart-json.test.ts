import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardsFromByheartJson, toItem } from '../../src/extension/adapters/byheart-json';
import { parseReviewDocument } from '../../src/core/review/model';

const read = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

describe('cardsFromByheartJson', () => {
  it('turn을 2.2 규칙으로 카드로 만든다', () => {
    const cards = cardsFromByheartJson(read('day1.byheart.json'));
    expect(cards.map((c) => c.kind)).toEqual(['study', 'explanation', 'study']);
    expect(cards[0]).toMatchObject({
      id: 't1',
      text: 'The only way out is through.',
      emphasis: [{ start: 4, end: 8, kind: 'bold' }],
      translation: '유일한 출구는 통과하는 것이다.',
    });
    expect(cards[0].explanation).toContain('way out');
    expect(cards[1].section).toBe('Part 1');
    expect(cards[2]).not.toHaveProperty('translation');
    expect(cards[2]).not.toHaveProperty('explanation');
    expect(cards[2].speaker).toBe('Teacher');
  });

  it('음원 문서도 열리며 시각은 버린다', () => {
    const cards = cardsFromByheartJson(read('audio.byheart.json'));
    expect(cards).toHaveLength(2);
    expect(JSON.stringify(cards)).not.toContain('startMs');
  });

  it('BOM이 있어도 파싱한다', () => {
    expect(cardsFromByheartJson('﻿' + read('day1.byheart.json'))).toHaveLength(3);
  });

  it('스키마 오류는 경로와 첫 문제를 한 줄로 알린다', () => {
    expect(() => cardsFromByheartJson('{"schemaVersion":1}')).toThrow(/documentId/);
    let message = '';
    try { cardsFromByheartJson('{"schemaVersion":1}'); } catch (e) { message = (e as Error).message; }
    expect(message).not.toContain('\n');
  });

  it('JSON 문법 오류도 Error로 알린다', () => {
    expect(() => cardsFromByheartJson('{not json')).toThrow(Error);
  });

  it('toItem은 Line 필드를 채운다', () => {
    const { item, extras } = toItem(parseReviewDocument(JSON.parse(read('day1.byheart.json'))), 'Day 1.byheart.json', 'book');
    expect(item.lines[0]).toMatchObject({ seq: 1, english: 'The only way out is through.', korean: '유일한 출구는 통과하는 것이다.' });
    expect(item.lines[0]).not.toHaveProperty('kind');
    expect(item.lines[1]).toMatchObject({ kind: 'explanation', section: 'Part 1', korean: '' });
    expect(item).toMatchObject({ id: 'Day 1.byheart.json', bookId: 'book', type: 'passage', chapter: 'Day 1.byheart.json' });
    expect(extras.get('t1')).toEqual({ translation: '유일한 출구는 통과하는 것이다.', explanation: '- **way out**: 출구, 해결책' });
  });
});
