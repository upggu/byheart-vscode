import { describe, expect, it } from 'vitest';
import { averageWpm, wpm } from '../../src/webview/logic/wpm';

describe('wpm', () => {
  it('글자 수/5를 분으로 나눠 반올림한다', () => {
    expect(wpm(50, 60000)).toBe(10);
    expect(wpm(53, 60000)).toBe(11);
    expect(wpm(0, 1000)).toBeNull();
    expect(wpm(10, 0)).toBeNull();
    expect(wpm(10, -5)).toBeNull();
  });
  it('averageWpm은 시간 가중 평균', () => {
    expect(averageWpm([{ chars: 50, elapsedMs: 60000 }, { chars: 100, elapsedMs: 60000 }])).toBe(15);
    expect(averageWpm([])).toBeNull();
    expect(averageWpm([{ chars: 0, elapsedMs: 0 }])).toBeNull();
  });
});
