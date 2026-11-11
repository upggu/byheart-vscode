// Pure practice state machine for the webview (design 6.4, 7.2–7.4). No DOM.
import type { ChapterRecord, PracticeCard, PracticeChapter, Preferences, RecordOp, RoundRecord, Settings } from '../../shared/types';
import { cardAccuracy, roundAccuracy } from './accuracy';
import { averageWpm } from './wpm';

export type Stage = 'input' | 'checked';
export type CardMode = 'typing' | 'hint';

export interface CardState {
  stage: Stage;
  input: string;
  mode: CardMode;
  startedAt: number | null;
  elapsedMs: number;
  /** Set when the card was checked (typing) or revealed (hint); cleared by reset. */
  checkedMode?: CardMode;
  accuracy?: number | null;
  chars?: number;
  /** Checked in typing mode with the full-text cue shown. */
  practice?: boolean;
}

export interface PracticeState {
  chapter: PracticeChapter;
  record: ChapterRecord;
  prefs: Preferences;
  settings: Settings;
  index: number;
  cards: CardState[];
  roundStartedAt: string;
  finished: boolean;
}

export type Action =
  | { type: 'input'; value: string; now: number }
  | { type: 'check'; now: number }
  | { type: 'reveal' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'reset' }
  | { type: 'toggleMark' }
  | { type: 'setMode'; mode: CardMode }
  | { type: 'toggleTranslation' }
  | { type: 'togglePractice' }
  | { type: 'restart'; nowIso: string }
  | { type: 'recordReplaced'; record: ChapterRecord }
  | { type: 'chapterReplaced'; chapter: PracticeChapter }
  | { type: 'settings'; settings: Settings };

export interface Reduction {
  state: PracticeState;
  ops: RecordOp[];
  prefs?: Partial<Preferences>;
}

function freshCard(card: PracticeCard, mode: CardMode): CardState {
  return { stage: card.kind === 'explanation' ? 'checked' : 'input', input: '', mode, startedAt: null, elapsedMs: 0 };
}

export function initialState(chapter: PracticeChapter, record: ChapterRecord, prefs: Preferences, settings: Settings, nowIso: string): PracticeState {
  const position = record.position ? chapter.cards.findIndex((c) => c.id === record.position!.cardId) : -1;
  return {
    chapter,
    record,
    prefs,
    settings,
    index: chapter.cards.length ? Math.max(0, position) : 0,
    cards: chapter.cards.map((c) => freshCard(c, prefs.mode)),
    roundStartedAt: nowIso,
    finished: false,
  };
}

function withCard(state: PracticeState, index: number, card: CardState): PracticeState {
  const cards = state.cards.slice();
  cards[index] = card;
  return { ...state, cards };
}

function currentCard(state: PracticeState): { card: PracticeCard; cs: CardState } | undefined {
  const card = state.chapter.cards[state.index];
  const cs = state.cards[state.index];
  return card && cs ? { card, cs } : undefined;
}

export function reduce(state: PracticeState, action: Action): Reduction {
  const none: Reduction = { state, ops: [] };
  const cur = currentCard(state);
  switch (action.type) {
    case 'input': {
      if (!cur || cur.card.kind !== 'study' || cur.cs.stage !== 'input') return none;
      const starts = state.settings.showWpm && cur.cs.startedAt === null && action.value !== '';
      return { state: withCard(state, state.index, { ...cur.cs, input: action.value, startedAt: starts ? action.now : cur.cs.startedAt }), ops: [] };
    }
    case 'check': {
      if (!cur || cur.card.kind !== 'study' || cur.cs.stage !== 'input') return none;
      if (cur.cs.mode === 'hint') return reduce(state, { type: 'reveal' });
      const timed = state.settings.showWpm && cur.cs.startedAt !== null;
      const next: CardState = {
        ...cur.cs,
        stage: 'checked',
        checkedMode: 'typing',
        accuracy: cardAccuracy(cur.card.text, cur.cs.input),
        elapsedMs: timed ? Math.max(0, action.now - cur.cs.startedAt!) : 0,
      };
      if (timed) next.chars = cur.cs.input.length;
      else delete next.chars;
      if (state.prefs.practice) next.practice = true;
      else delete next.practice;
      return { state: withCard(state, state.index, next), ops: [] };
    }
    case 'reveal': {
      if (!cur || cur.card.kind !== 'study' || cur.cs.stage !== 'input') return none;
      const { accuracy: _a, chars: _c, practice: _p, ...rest } = cur.cs;
      return { state: withCard(state, state.index, { ...rest, stage: 'checked', checkedMode: 'hint', startedAt: null, elapsedMs: 0 }), ops: [] };
    }
    case 'next': {
      if (!cur || cur.cs.stage !== 'checked' || state.finished) return none;
      if (state.index >= state.chapter.cards.length - 1) return { state: { ...state, finished: true }, ops: [] };
      const index = state.index + 1;
      return { state: { ...state, index }, ops: [{ op: 'setPosition', cardId: state.chapter.cards[index].id }] };
    }
    case 'previous': {
      if (state.index <= 0 || state.finished) return none;
      const index = state.index - 1;
      return { state: { ...state, index }, ops: [{ op: 'setPosition', cardId: state.chapter.cards[index].id }] };
    }
    case 'reset': {
      if (!cur || cur.card.kind !== 'study') return none;
      return { state: withCard(state, state.index, freshCard(cur.card, cur.cs.mode)), ops: [] };
    }
    case 'toggleMark': {
      if (!cur || cur.card.kind !== 'study') return none;
      const difficult = !(state.record.marks[cur.card.id]?.difficult ?? false);
      return { state, ops: [{ op: 'setMark', cardId: cur.card.id, difficult }] };
    }
    case 'setMode': {
      if (state.prefs.mode === action.mode) return none;
      const cards = state.cards.map((cs, i) => {
        const card = state.chapter.cards[i];
        if (i === state.index || (cs.stage === 'input' && cs.input === '')) return freshCard(card, action.mode);
        return cs;
      });
      return { state: { ...state, prefs: { ...state.prefs, mode: action.mode }, cards }, ops: [], prefs: { mode: action.mode } };
    }
    case 'toggleTranslation': {
      const showTranslation = !state.prefs.showTranslation;
      return { state: { ...state, prefs: { ...state.prefs, showTranslation } }, ops: [], prefs: { showTranslation } };
    }
    case 'togglePractice': {
      const practice = !state.prefs.practice;
      return { state: { ...state, prefs: { ...state.prefs, practice } }, ops: [], prefs: { practice } };
    }
    case 'restart': {
      const first = state.chapter.cards[0];
      return {
        state: { ...state, index: 0, cards: state.chapter.cards.map((c) => freshCard(c, state.prefs.mode)), roundStartedAt: action.nowIso, finished: false },
        ops: first ? [{ op: 'setPosition', cardId: first.id }] : [],
      };
    }
    case 'recordReplaced':
      return { state: { ...state, record: action.record }, ops: [] };
    case 'chapterReplaced': {
      const previous = new Map(state.chapter.cards.map((c, i) => [c.id, { card: c, cs: state.cards[i] }]));
      const cards = action.chapter.cards.map((c) => {
        const old = previous.get(c.id);
        return old && old.card.kind === c.kind ? old.cs : freshCard(c, state.prefs.mode);
      });
      const currentId = cur?.card.id;
      const found = currentId === undefined ? -1 : action.chapter.cards.findIndex((c) => c.id === currentId);
      const index = found !== -1 ? found : Math.max(0, Math.min(state.index, action.chapter.cards.length - 1));
      return { state: { ...state, chapter: action.chapter, cards, index }, ops: [] };
    }
    case 'settings':
      return { state: { ...state, settings: action.settings }, ops: [] };
  }
}

/** Design 6.4: null when the chapter has no study cards; otherwise the round as recorded. */
export function roundSummary(state: PracticeState, finishedAt: string): RoundRecord | null {
  const study = state.chapter.cards.map((card, i) => ({ card, cs: state.cards[i] })).filter(({ card }) => card.kind === 'study');
  if (!study.length) return null;
  const checked = study.filter(({ cs }) => cs.checkedMode !== undefined);
  const modes = new Set(checked.map(({ cs }) => cs.checkedMode));
  const mode: RoundRecord['mode'] = modes.size === 0 ? state.prefs.mode : modes.size === 1 ? [...modes][0]! : 'mixed';
  const typing = checked.filter(({ cs }) => cs.checkedMode === 'typing');
  // Practice cards were typed with the whole sentence visible; they say nothing
  // about recall, so accuracy and WPM come from the other typing cards only.
  const recall = typing.filter(({ cs }) => !cs.practice);
  const practiceCards = typing.length - recall.length;
  const timed = recall.filter(({ cs }) => cs.chars !== undefined).map(({ cs }) => ({ chars: cs.chars!, elapsedMs: cs.elapsedMs }));
  const round: RoundRecord = {
    mode,
    startedAt: state.roundStartedAt,
    finishedAt,
    cards: checked.length,
    total: study.length,
    accuracy: roundAccuracy(recall.map(({ cs }) => cs.accuracy ?? null)),
    averageWpm: state.settings.showWpm ? averageWpm(timed) : null,
  };
  if (practiceCards) round.practiceCards = practiceCards;
  return round;
}

const STATE_VERSION = 1;

export function serialize(state: PracticeState): unknown {
  return { v: STATE_VERSION, state };
}

export function restore(raw: unknown): PracticeState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const wrapper = raw as { v?: unknown; state?: unknown };
  if (wrapper.v !== STATE_VERSION || typeof wrapper.state !== 'object' || wrapper.state === null) return null;
  const s = wrapper.state as Partial<PracticeState>;
  if (!s.chapter || !Array.isArray(s.chapter.cards) || !s.record || !s.prefs || !s.settings || !Array.isArray(s.cards) || typeof s.index !== 'number') return null;
  if (s.cards.length !== s.chapter.cards.length) return null;
  return s as PracticeState;
}
