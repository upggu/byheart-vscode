import { describe, expect, it } from 'vitest';
import { cardAccuracy, roundAccuracy } from '../../src/webview/logic/accuracy';

describe('accuracy', () => {
  it('cardAccuracy는 엄격 비교의 오류 문자소 비율', () => {
    expect(cardAccuracy('Hello, world.', 'Hello, world.')).toBe(1);
    expect(cardAccuracy('abcd', 'abXd')).toBe(0.75);
    expect(cardAccuracy('abcd', 'Abcd')).toBe(0.75);
    expect(cardAccuracy('abcd', 'abd')).toBe(0.75);
    expect(cardAccuracy('ab', 'abcdefgh')).toBe(0);
    expect(cardAccuracy('abc', '')).toBe(0);
    expect(cardAccuracy('x'.repeat(10001), 'x')).toBeNull();
    expect(cardAccuracy('abcdef', 'abcdxf')).toBe(0.833);
  });
  it('roundAccuracy는 null을 빼고 평균', () => {
    expect(roundAccuracy([1, 0.5, null])).toBe(0.75);
    expect(roundAccuracy([null])).toBeNull();
    expect(roundAccuracy([])).toBeNull();
    expect(roundAccuracy([1, 1, 0])).toBe(0.667);
  });
});
