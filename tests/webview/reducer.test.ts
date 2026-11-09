import { describe, expect, it } from 'vitest';
import { initialState, reduce, restore, roundSummary, serialize, type PracticeState } from '../../src/webview/logic/reducer';
import { emptyRecord } from '../../src/extension/records';
import type { ChapterRecord, PracticeChapter, Preferences, Settings } from '../../src/shared/types';

const chapter: PracticeChapter = {
  ref: { bookId: 'b', chapterId: 'c.txt' }, bookTitle: 'b', title: 'c', format: 'txt', readOnly: false,
  cards: [
    { id: 'A', kind: 'study', speaker: '', text: 'Hello world.' },
    { id: 'E', kind: 'explanation', speaker: '', text: 'Note', explanation: '- tip' },
    { id: 'B', kind: 'study', speaker: '', text: 'Good night.' },
  ],
};
const record: ChapterRecord = emptyRecord(chapter.ref);
const prefs: Preferences = { mode: 'typing', showTranslation: false };
const settings: Settings = { showWpm: true };
const T0 = '2026-11-09T10:00:00.000Z';
const T1 = '2026-11-09T10:05:00.000Z';

function start(overrides: { record?: ChapterRecord; prefs?: Preferences; settings?: Settings } = {}) {
  return initialState(chapter, overrides.record ?? record, overrides.prefs ?? prefs, overrides.settings ?? settings, T0);
}
function run(state: PracticeState, ...actions: Parameters<typeof reduce>[1][]) {
  let ops: ReturnType<typeof reduce>['ops'] = [];
  let out: ReturnType<typeof reduce> = { state, ops: [] };
  for (const a of actions) { out = reduce(out.state, a); ops = [...ops, ...out.ops]; }
  return { ...out, ops };
}
/** Types card `input` at t=1000, checks at t=1000+elapsed, moves on. */
function typeCheckNext(state: PracticeState, input: string, elapsed: number, at = 1000) {
  return run(state, { type: 'input', value: input, now: at }, { type: 'check', now: at + elapsed }, { type: 'next' });
}

describe('initialState', () => {
  it('position의 카드에서 시작하고 설명 카드는 바로 checked', () => {
    const s = start();
    expect(s.index).toBe(0);
    expect(s.cards.map((c) => c.stage)).toEqual(['input', 'checked', 'input']);
    expect(s.roundStartedAt).toBe(T0);
    expect(s.finished).toBe(false);
    expect(start({ record: { ...record, position: { cardId: 'B' } } }).index).toBe(2);
    expect(start({ record: { ...record, position: { cardId: 'gone' } } }).index).toBe(0);
  });
});

describe('reduce', () => {
  it('input은 첫 글자에 타이머를 시작하고 check에 멈춘다', () => {
    const { state } = run(start(), { type: 'input', value: 'H', now: 1000 }, { type: 'input', value: 'Hello world.', now: 4000 }, { type: 'check', now: 7000 });
    const card = state.cards[0];
    expect(card).toMatchObject({ stage: 'checked', startedAt: 1000, elapsedMs: 6000, chars: 12, accuracy: 1, checkedMode: 'typing' });
  });

  it('input이 비어 있으면 타이머를 시작하지 않는다', () => {
    const { state } = run(start(), { type: 'input', value: '', now: 1000 });
    expect(state.cards[0].startedAt).toBeNull();
  });

  it('check 후 next는 setPosition op을 내고 설명 카드는 바로 checked', () => {
    const r = typeCheckNext(start(), 'Hello world.', 1000);
    expect(r.ops).toEqual([{ op: 'setPosition', cardId: 'E' }]);
    expect(r.state.index).toBe(1);
    expect(r.state.cards[1].stage).toBe('checked');
    const r2 = run(r.state, { type: 'next' });
    expect(r2.ops).toEqual([{ op: 'setPosition', cardId: 'B' }]);
    expect(r2.state.index).toBe(2);
  });

  it('input 단계에서 next는 무시된다', () => {
    const r = run(start(), { type: 'next' });
    expect(r.state.index).toBe(0);
    expect(r.ops).toEqual([]);
  });

  it('마지막 카드 check 후 next는 finished=true', () => {
    const r = typeCheckNext(run(typeCheckNext(start(), 'Hello world.', 1000).state, { type: 'next' }).state, 'Good night.', 2000);
    expect(r.state.finished).toBe(true);
    expect(r.state.index).toBe(2);
    expect(r.ops.at(-1)).toBeUndefined();
  });

  it('roundSummary: 카드 수·total·시간 가중 WPM·평균 정확도', () => {
    // A: 12 chars in 60s → 2.4 wpm-equivalent; B: 'Good night!' 11 chars in 30s, 1 error of 11 graphemes
    let s = typeCheckNext(start(), 'Hello world.', 60000).state;
    s = run(s, { type: 'next' }).state;
    s = typeCheckNext(s, 'Good night!', 30000).state;
    expect(roundSummary(s, T1)).toEqual({
      mode: 'typing', startedAt: T0, finishedAt: T1, cards: 2, total: 2,
      accuracy: 0.955, // (1 + 0.909) / 2
      averageWpm: 3, // (12 + 11) / 5 = 4.6 chars-words over 1.5 min → 3.07
    });
  });

  it('roundSummary: 중간부터 이어 하면 cards < total', () => {
    const s = typeCheckNext(start({ record: { ...record, position: { cardId: 'B' } } }), 'Good night.', 1000).state;
    expect(s.finished).toBe(true);
    expect(roundSummary(s, T1)).toMatchObject({ cards: 1, total: 2, accuracy: 1 });
  });

  it('roundSummary: 학습 카드가 없으면 null', () => {
    const only: PracticeChapter = { ...chapter, cards: [chapter.cards[1]] };
    const s = run(initialState(only, record, prefs, settings, T0), { type: 'next' }).state;
    expect(s.finished).toBe(true);
    expect(roundSummary(s, T1)).toBeNull();
  });

  it('roundSummary: 모드가 섞이면 mixed, averageWpm은 타이핑 카드만', () => {
    let s = typeCheckNext(start(), 'Hello world.', 60000).state;
    s = run(s, { type: 'next' }).state;
    s = run(s, { type: 'setMode', mode: 'hint' }, { type: 'reveal' }, { type: 'next' }).state;
    expect(s.finished).toBe(true);
    expect(roundSummary(s, T1)).toMatchObject({ mode: 'mixed', cards: 2, total: 2, accuracy: 1, averageWpm: 2 });
  });

  it('showWpm이 꺼져 있으면 averageWpm null, accuracy는 기록', () => {
    let s = typeCheckNext(start({ settings: { showWpm: false } }), 'Hello world.', 60000).state;
    expect(s.cards[0].chars).toBeUndefined();
    expect(s.cards[0].startedAt).toBeNull();
    s = run(s, { type: 'next' }).state;
    s = typeCheckNext(s, 'Good night.', 30000).state;
    expect(roundSummary(s, T1)).toMatchObject({ averageWpm: null, accuracy: 1, cards: 2 });
  });

  it('setMode는 현재 카드만 비우고 다른 카드는 유지하며 prefs를 낸다', () => {
    let s = typeCheckNext(start(), 'Hello world.', 1000).state;
    s = run(s, { type: 'next' }).state;
    s = run(s, { type: 'input', value: 'Goo', now: 5000 }).state;
    const r = reduce(s, { type: 'setMode', mode: 'hint' });
    expect(r.prefs).toEqual({ mode: 'hint' });
    expect(r.state.prefs.mode).toBe('hint');
    expect(r.state.cards[2]).toMatchObject({ stage: 'input', input: '', mode: 'hint', startedAt: null });
    expect(r.state.cards[0]).toMatchObject({ stage: 'checked', checkedMode: 'typing', accuracy: 1 });
    expect(r.ops).toEqual([]);
  });

  it('toggleTranslation은 prefs를 낸다', () => {
    const r = reduce(start(), { type: 'toggleTranslation' });
    expect(r.prefs).toEqual({ showTranslation: true });
    expect(r.state.prefs.showTranslation).toBe(true);
  });

  it('toggleMark는 setMark op을 내고 기록이 돌아오면 recordReplaced로 반영', () => {
    const r = reduce(start(), { type: 'toggleMark' });
    expect(r.ops).toEqual([{ op: 'setMark', cardId: 'A', difficult: true }]);
    const marked: ChapterRecord = { ...record, revision: 1, marks: { A: { difficult: true, at: T0 } } };
    const r2 = reduce(r.state, { type: 'recordReplaced', record: marked });
    expect(r2.state.record.marks.A.difficult).toBe(true);
    expect(reduce(r2.state, { type: 'toggleMark' }).ops).toEqual([{ op: 'setMark', cardId: 'A', difficult: false }]);
  });

  it('previous 후 다시 check하면 마지막 시도만 남는다', () => {
    let s = typeCheckNext(start(), 'Hello world!', 1000).state;
    expect(s.cards[0].accuracy).toBeCloseTo(0.917, 3);
    const r = run(s, { type: 'previous' });
    expect(r.ops).toEqual([{ op: 'setPosition', cardId: 'A' }]);
    expect(r.state.index).toBe(0);
    expect(r.state.cards[0].stage).toBe('checked');
    s = run(r.state, { type: 'reset' }).state;
    expect(s.cards[0]).toMatchObject({ stage: 'input', input: '', startedAt: null });
    s = run(s, { type: 'input', value: 'Hello world.', now: 9000 }, { type: 'check', now: 12000 }).state;
    expect(s.cards[0]).toMatchObject({ accuracy: 1, elapsedMs: 3000, chars: 12 });
    expect(roundSummary(run(run(s, { type: 'next' }, { type: 'next' }).state, { type: 'input', value: 'Good night.', now: 1 }, { type: 'check', now: 2 }, { type: 'next' }).state, T1)).toMatchObject({ cards: 2, accuracy: 1 });
  });

  it('previous는 첫 카드에서 무시된다', () => {
    const r = run(start(), { type: 'previous' });
    expect(r.state.index).toBe(0);
    expect(r.ops).toEqual([]);
  });

  it('restart는 index 0, 새 roundStartedAt, setPosition(첫 카드) op', () => {
    let s = typeCheckNext(start({ record: { ...record, position: { cardId: 'B' } } }), 'Good night.', 1000).state;
    const r = reduce(s, { type: 'restart', nowIso: T1 });
    expect(r.ops).toEqual([{ op: 'setPosition', cardId: 'A' }]);
    expect(r.state).toMatchObject({ index: 0, roundStartedAt: T1, finished: false });
    expect(r.state.cards[2]).toMatchObject({ stage: 'input', input: '' });
    expect(r.state.cards[2].checkedMode).toBeUndefined();
  });

  it('chapterReplaced: 사라진 카드는 같은 순번으로, 남은 카드 입력은 유지', () => {
    let s = typeCheckNext(start(), 'Hello world.', 1000).state; // index 1 (E)
    s = run(s, { type: 'next' }, { type: 'input', value: 'Goo', now: 5000 }).state; // index 2 (B), typing
    const replaced: PracticeChapter = { ...chapter, cards: [chapter.cards[0], { id: 'N', kind: 'study', speaker: '', text: 'New card.' }] };
    const r = reduce(s, { type: 'chapterReplaced', chapter: replaced });
    expect(r.state.chapter).toBe(replaced);
    expect(r.state.index).toBe(1); // min(2, 1)
    expect(r.state.cards[0]).toMatchObject({ stage: 'checked', accuracy: 1 });
    expect(r.state.cards[1]).toMatchObject({ stage: 'input', input: '' });
    // current card survives → follow it
    const moved: PracticeChapter = { ...chapter, cards: [chapter.cards[2], chapter.cards[0]] };
    const r2 = reduce(s, { type: 'chapterReplaced', chapter: moved });
    expect(r2.state.index).toBe(0);
    expect(r2.state.cards[0]).toMatchObject({ input: 'Goo', startedAt: 5000 });
    expect(r2.state.cards[1]).toMatchObject({ stage: 'checked' });
  });

  it('settings는 교체된다', () => {
    expect(reduce(start(), { type: 'settings', settings: { showWpm: false } }).state.settings).toEqual({ showWpm: false });
  });

  it('serialize/restore 왕복', () => {
    const s = run(start(), { type: 'input', value: 'Hel', now: 1000 }).state;
    expect(restore(JSON.parse(JSON.stringify(serialize(s))))).toEqual(s);
    expect(restore(null)).toBeNull();
    expect(restore({ foo: 1 })).toBeNull();
    expect(restore(undefined)).toBeNull();
  });

  describe('hint mode (Task 9)', () => {
    const hintPrefs: Preferences = { mode: 'hint', showTranslation: false };
    it('reveal은 checked로 바꾸고 accuracy 없이 checkedMode hint', () => {
      const r = reduce(start({ prefs: hintPrefs }), { type: 'reveal' });
      expect(r.state.cards[0]).toMatchObject({ stage: 'checked', checkedMode: 'hint' });
      expect(r.state.cards[0].accuracy).toBeUndefined();
      expect(r.state.cards[0].chars).toBeUndefined();
      expect(r.ops).toEqual([]);
    });
    it('hint 모드에서 check는 reveal과 같다', () => {
      const r = reduce(start({ prefs: hintPrefs }), { type: 'check', now: 5 });
      expect(r.state.cards[0]).toMatchObject({ stage: 'checked', checkedMode: 'hint' });
    });
    it('다시 가리기(reset)는 input 단계로 돌아간다', () => {
      const s = run(start({ prefs: hintPrefs }), { type: 'reveal' }, { type: 'reset' }).state;
      expect(s.cards[0]).toMatchObject({ stage: 'input', mode: 'hint' });
      expect(s.cards[0].checkedMode).toBeUndefined();
    });
    it('hint 바퀴의 roundSummary는 accuracy·averageWpm null, mode hint', () => {
      const s = run(start({ prefs: hintPrefs }), { type: 'reveal' }, { type: 'next' }, { type: 'next' }, { type: 'reveal' }, { type: 'next' }).state;
      expect(s.finished).toBe(true);
      expect(roundSummary(s, T1)).toEqual({ mode: 'hint', startedAt: T0, finishedAt: T1, cards: 2, total: 2, accuracy: null, averageWpm: null });
    });
  });
});
