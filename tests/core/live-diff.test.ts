import { describe, expect, it } from 'vitest';
import { defaultDiffOptions } from '../../src/core/lib/diff';
import { createLiveComparator, liveDiff } from '../../src/core/lib/live-diff';

const clean = { errors: [], missing: [], limited: false };
const wrong = (expected: string, actual: string) => liveDiff(expected, actual).errors.map(r => actual.slice(r.start, r.end)).join('');

describe('입력 중 문자 비교', () => {
  it.each(['', 'm', 'mor', 'morning'])('미완성 접두사 %j의 뒷부분은 오류가 아니다', actual => {
    expect(liveDiff('morning', actual)).toEqual(clean);
  });
  it('입력한 오타만 표시하고 수정하면 즉시 해제한다', () => {
    const compare = createLiveComparator('morning');
    expect(compare('morx')).toEqual({ errors: [{ start: 3, end: 4 }], missing: [], limited: false });
    expect(compare('morn')).toEqual(clean);
    expect(wrong('morning', 'mornxng')).toBe('x');
  });
  it('중간 삽입 뒤의 올바른 문자는 다시 정렬된다', () => {
    expect(liveDiff('morning', 'moxrning')).toEqual({ errors: [{ start: 2, end: 3 }], missing: [], limited: false });
  });
  it('뒤의 일치 입력으로 확인된 누락만 위치를 표시한다', () => {
    expect(liveDiff('morning', 'mor')).toEqual(clean);
    expect(liveDiff('morning', 'moring')).toEqual({ errors: [], missing: [3], limited: false });
    expect(liveDiff('morning', 'mrning')).toEqual({ errors: [], missing: [1], limited: false });
  });
  it('여러 글자의 누락은 작은 위치 표시 하나로 합친다', () => {
    expect(liveDiff('abcdefghijk', 'abghijk')).toEqual({ errors: [], missing: [2], limited: false });
  });
  it('반복 글자와 문장 중간 삽입·누락을 정렬한다', () => {
    expect(wrong('I open the window every morning.', 'I oopen the window every morning.')).toBe('o');
    expect(liveDiff('I open the window every morning.', 'I open window every morning.').errors).toEqual([]);
    expect(liveDiff('I open the window every morning.', 'I open window every morning.').missing).toHaveLength(1);
    expect(liveDiff('aaaab', 'aaab').errors).toEqual([]);
  });
  it('빈 원문의 입력과 원문 뒤 추가 글자도 표시한다', () => {
    expect(wrong('', 'abc')).toBe('abc');
    expect(wrong('morning', 'morningx')).toBe('x');
  });
  it('기본 설정은 대소문자·구두점·공백량·줄바꿈 차이를 무시한다', () => {
    expect(liveDiff('Hello, WORLD! Next line.', '  hello\n\nworld  next')).toEqual(clean);
    expect(liveDiff("Don't stop!", 'dont stop')).toEqual(clean);
    expect(liveDiff('a ! b', 'a b')).toEqual(clean);
  });
  it('공백 무시도 단어 경계를 합치지는 않는다', () => {
    expect(liveDiff('a b c', 'ab c').missing).toEqual([1]);
    expect(wrong('ab c', 'a b c')).toBe(' ');
  });
  it.each([
    ['ignoreCase', 'Hello', 'hello', 'h'],
    ['ignorePunctuation', 'Hello world', 'Hello! world', '!'],
    ['ignoreWhitespace', 'a b', 'a  b', ' '],
  ] as const)('%s 비교 설정을 따른다', (option, expected, actual, error) => {
    const result = liveDiff(expected, actual, { ...defaultDiffOptions, [option]: false });
    expect(result.errors.map(r => actual.slice(r.start, r.end)).join('')).toBe(error);
  });
  it('엄격한 비교도 아직 안 쓴 구두점·공백은 오류가 아니다', () => {
    expect(liveDiff('Hello! ', 'Hello', { ignoreCase: false, ignorePunctuation: false, ignoreWhitespace: false })).toEqual(clean);
    expect(liveDiff('a  b', 'a b', { ...defaultDiffOptions, ignoreWhitespace: false }).missing).toHaveLength(1);
  });
  it('NFC, 결합 문자, 이모지의 원래 UTF-16 범위를 유지한다', () => {
    expect(liveDiff('Élan 👩‍💻 café', 'E\u0301lan 👩‍💻 cafe\u0301')).toEqual(clean);
    const actual = 'é 👨‍💻 x';
    const result = liveDiff('é 👩‍💻 x', actual);
    expect(result.errors.map(r => actual.slice(r.start, r.end))).toEqual(['👨‍💻']);
    expect(liveDiff('가나', '가다').errors).toEqual([{ start: 1, end: 2 }]);
  });
  it('누락한 문장 뒤에도 정렬하고 정답 내용은 결과에 포함하지 않는다', () => {
    const actual = 'First sentence.\nLast sentence.';
    const result = liveDiff('First sentence.\nThis middle sentence is missing.\nLast sentence.', actual);
    expect(result.errors).toEqual([]);
    expect(result.missing).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('middle');
  });
  it('긴 일치 입력과 국소 수정은 전체 행렬 없이 처리한다', () => {
    const expected = 'abcdefghij '.repeat(3000);
    const compare = createLiveComparator(expected);
    expect(compare(expected.slice(0, -4))).toEqual(clean);
    const actual = expected.slice(0, 15000) + 'X' + expected.slice(15000);
    expect(compare(actual)).toEqual({ errors: [{ start: 15000, end: 15001 }], missing: [], limited: false });
  });
  it('차이가 매우 많은 붙여넣기는 제한된 작업 뒤 중립 표시로 돌아간다', () => {
    expect(liveDiff('a'.repeat(10000), 'z'.repeat(10000))).toEqual({ ...clean, limited: true });
  });
});

describe('오타 단어 힌트', () => {
  const hints = (expected: string, actual: string) => createLiveComparator(expected)(actual, true).hints;
  it('삽입된 글자가 속한 단어를 정답에 연결한다', () => {
    expect(hints('We have a new student today!', 'We have a new stuxdent')).toEqual([
      { start: 14, end: 22, expected: 'student' },
    ]);
  });
  it('단어 중간에 들어간 공백에도 같은 정답 단어를 안내한다', () => {
    expect(hints('student today', 'stu dent today')).toEqual([{ start: 0, end: 8, expected: 'student' }]);
  });
  it('Unicode 범위와 비교 한도를 힌트에도 유지한다', () => {
    expect(hints('café', 'cafe\u0301x')).toEqual([{ start: 0, end: 6, expected: 'café' }]);
    expect(hints('a'.repeat(10000), 'z'.repeat(10000))).toEqual([]);
  });
  it('첫 글자부터 틀려도 현재 단어를 안내한다', () => {
    expect(hints('student today', 'x')).toEqual([{ start: 0, end: 1, expected: 'student' }]);
  });
  it('치환과 누락을 단어 하나의 힌트로 합친다', () => {
    expect(hints('morning', 'moring')).toEqual([{ start: 0, end: 6, expected: 'morning' }]);
    expect(hints('morning', 'morx')).toEqual([{ start: 0, end: 4, expected: 'morning' }]);
  });
  it('올바른 접두사와 고친 입력은 정답을 공개하지 않는다', () => {
    for (const actual of ['', 'stu', 'student']) expect(hints('student today', actual)).toEqual([]);
  });
  it('추가된 전체 단어에 다른 정답 단어를 붙이지 않는다', () => {
    expect(hints('We have a student today', 'We have extra a student today')).toEqual([]);
    expect(hints('student', 'student extra')).toEqual([]);
  });
  it('누락한 전체 단어는 다음 입력의 경계에 표시한다', () => {
    expect(hints('We have a student today', 'We have student today')).toEqual([{ start: 8, end: 8, expected: 'a' }]);
  });
  it('여러 오타의 힌트를 각각 표시하며 비교 설정을 따른다', () => {
    expect(hints('Hello student', 'Hxllo stuxdent')).toEqual([
      { start: 0, end: 5, expected: 'Hello' }, { start: 6, end: 14, expected: 'student' },
    ]);
    expect(hints('Hello!', 'hello')).toEqual([]);
    expect(createLiveComparator('Hello!', { ...defaultDiffOptions, ignoreCase: false })('hello', true).hints)
      .toEqual([{ start: 0, end: 5, expected: 'Hello' }]);
  });
});
