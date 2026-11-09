import { describe, expect, it } from 'vitest';
import { firstLetters, hintTokens } from '../../src/core/lib/hints';
import { defaultDiffOptions, passageDiff, splitPassage, wordDiff } from '../../src/core/lib/diff';

describe('단계별 힌트', () => {
  it('공백, Unicode, 숫자와 축약어 구두점을 유지한다', () => {
    expect(firstLetters("Don't  stop!\nÉlan 123 한글")).toBe("D__'_  s___!\nÉ___ 1__ 한_");
  });
  it.each([
    [0, "___'_ ____ _____."], [1, "L__'_ w___ h____."], [2, "L__'_ walk h____."], [3, "Let's walk homes."],
  ])('단계 %s의 공개 범위를 구분한다', (level, output) => {
    const text = "Let's walk homes.";
    expect(hintTokens(text, level as 0 | 1 | 2 | 3, [1]).map(t => t.text).join('')).toBe(output);
  });
  it('단어만 인덱스가 있고 부분 공개 시 선택된 단어만 노출한다', () => {
    expect(hintTokens('one, two!', 2, [1])).toEqual([
      { text: 'o__', hidden: true, index: 0 }, { text: ', ', hidden: false, index: -1 },
      { text: 'two', hidden: false, index: 1 }, { text: '!', hidden: false, index: -1 },
    ]);
    expect(hintTokens('', 0)).toEqual([]);
    expect(() => hintTokens('a', 4 as 3)).toThrow();
  });
});

describe('단어 Diff', () => {
  it('동일/누락/추가/변경을 원래 표기로 보여 준다', () => {
    expect(wordDiff('We walk home today.', 'We run home today.').changes).toEqual([
      { type: 'same', expected: ['We'], actual: ['We'] },
      { type: 'changed', expected: ['walk'], actual: ['run'] },
      { type: 'same', expected: ['home', 'today.'], actual: ['home', 'today.'] },
    ]);
    expect(wordDiff('We walk home', 'We home').changes[1].type).toBe('missing');
    expect(wordDiff('We walk home', 'We walk slowly home').changes[1].type).toBe('extra');
  });
  it('기본 옵션은 대소문자/구두점/공백 차이를 cosmetic으로 구분한다', () => {
    expect(wordDiff('Hello,  WORLD!', 'hello world')).toMatchObject({ equivalent: true, cosmetic: true, errors: 0 });
    expect(wordDiff('same', 'same').cosmetic).toBe(false);
    expect(wordDiff('é', 'e\u0301').equivalent).toBe(true);
  });
  it.each([
    ['ignoreCase', 'Hello', 'hello'], ['ignorePunctuation', 'Hello!', 'Hello'], ['ignoreWhitespace', 'a  b', 'a b'],
  ])('%s를 끄면 해당 차이를 센다', (option, expected, actual) => {
    expect(wordDiff(expected, actual, { ...defaultDiffOptions, [option]: false }).equivalent).toBe(false);
  });
  it('반복 단어, 빈 입력, 전부 다른 입력의 오류 수가 안정적이다', () => {
    expect(wordDiff('a b a', 'a a')).toMatchObject({ errors: 1, total: 3 });
    expect(wordDiff('one two', '')).toMatchObject({ errors: 2, equivalent: false });
    expect(wordDiff('', 'one two').changes[0].type).toBe('extra');
    expect(wordDiff('', '')).toMatchObject({ errors: 0, total: 0, equivalent: true });
    expect(wordDiff('one two', 'three four five').errors).toBe(3);
    expect(wordDiff('!?', '').equivalent).toBe(true);
  });
  it('과도한 토큰 입력을 거부한다', () => expect(() => wordDiff('x '.repeat(2001), '')).toThrow('2,000'));
});

describe('문단 정렬', () => {
  const rows = ['Let us go home.', 'We can follow the river.', 'I will bring my camera.'];
  it('중간 대사를 빠뜨려도 뒤 대사의 ID 인덱스를 유지한다', () => {
    const result = passageDiff(rows, [rows[0], rows[2]]);
    expect(result.map(l => l.type)).toEqual(['matched', 'missing', 'matched']);
    expect(result[2]).toMatchObject({ expectedIndex: 2, actualIndex: 1, diff: { equivalent: true } });
  });
  it('중간 추가 대사 뒤에도 원문과 다시 정렬한다', () => {
    const result = passageDiff(rows, [rows[0], 'My shoes are blue.', rows[1], rows[2]]);
    expect(result.map(l => l.type)).toEqual(['matched', 'extra', 'matched', 'matched']);
    expect(result[2]).toMatchObject({ expectedIndex: 1, actualIndex: 2, diff: { equivalent: true } });
  });
  it('변경된 대사와 완전히 다른 한 대사를 치환으로 정렬한다', () => {
    expect(passageDiff(rows, [rows[0], 'We should follow the river.', rows[2]])[1])
      .toMatchObject({ type: 'matched', expectedIndex: 1, actualIndex: 1, diff: { equivalent: false } });
    expect(passageDiff(['Good morning.'], ['Farewell everyone.'])[0]).toMatchObject({ type: 'matched', diff: { errors: 2 } });
  });
  it.each([' ', '\n'])('한 대사의 여러 문장과 자유 입력을 묶는다 (%j)', separator => {
    const expected = ['Hi! How are you? I am fine. Let us go. It is sunny.', 'Bring the camera.'];
    const input = ['Hi!', 'How are you?', 'I am fine.', 'Let us go.', 'It is sunny.', 'Bring the camera.'].join(separator);
    expect(passageDiff(expected, input).map(r => [r.expectedIndex, r.diff.equivalent])).toEqual([[0, true], [1, true]]);
  });
  it('문자열의 중간 누락/추가 대사도 정렬한다', () => {
    expect(passageDiff(rows, `${rows[0]} ${rows[2]}`).map(l => l.type)).toEqual(['matched', 'missing', 'matched']);
    expect(passageDiff(rows, `${rows[0]} My shoes are blue. ${rows[1]} ${rows[2]}`).map(l => l.type))
      .toEqual(['matched', 'extra', 'matched', 'matched']);
  });
  it('빈 문단, CRLF, 길이 제한을 처리한다', () => {
    expect(splitPassage('  Hello.\r\n\r\nBye! ')).toEqual(['Hello.', 'Bye!']);
    expect(passageDiff(rows, '').every(r => r.type === 'missing')).toBe(true);
    expect(passageDiff([], 'Hello.')[0].type).toBe('extra');
    expect(passageDiff([], '')).toEqual([]);
    expect(() => passageDiff(Array(151).fill('x'), '')).toThrow('150');
    expect(() => passageDiff(['x '.repeat(2001)], '')).toThrow('2,000');
  });
});
