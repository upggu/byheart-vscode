import { describe, expect, it } from 'vitest';
import { t, table } from '../../src/webview/i18n';

describe('i18n', () => {
  it('모든 키가 두 언어에 있고 변수 치환이 된다', () => {
    expect(Object.keys(table.ko).sort()).toEqual(Object.keys(table.en).sort());
    expect(t('ko', 'position', { n: 3, total: 12 })).toBe('3 / 12');
    expect(t('en', 'summary', { cards: 10, accuracy: 92, wpm: 31 })).toBe('Round complete — 10 cards · 92% accuracy · 31 WPM avg');
    expect(t('ko', 'summary', { cards: 10, accuracy: 92, wpm: 31 })).toBe('한 바퀴 완료 — 카드 10 · 정확도 92% · 평균 31 WPM');
  });
  it('필수 키가 모두 있다', () => {
    const keys = ['check', 'next', 'previous', 'mark', 'marked', 'rewrite', 'rehide', 'reveal', 'translation', 'modeTyping', 'modeHint', 'position', 'wpm', 'summary', 'summaryNoWpm', 'nextChapter', 'restart', 'pickChapter', 'limited', 'extraInput', 'error', 'openFolder'];
    for (const key of keys) expect(table.en).toHaveProperty(key);
  });
  it('빈 문자열은 그대로 두고 없는 변수는 비운다', () => {
    expect(t('en', 'next')).toBe('Next');
  });
});
