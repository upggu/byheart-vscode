import { describe, expect, it } from 'vitest';
import { defaultDiffOptions } from '../../src/core/lib/diff';
import { createLiveComparator } from '../../src/core/lib/live-diff';

describe('live comparison on the main thread (design 3.3)', () => {
  it('2,000자 입력의 실시간 비교 1회가 50ms 미만', () => {
    const expected = 'the quick brown fox jumps over the lazy dog '.repeat(45).trim();
    const compare = createLiveComparator(expected, defaultDiffOptions);
    const actual = expected.slice(0, 2000).replace(/o/g, '0');
    const t0 = performance.now();
    compare(actual, true);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
