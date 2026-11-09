// Webview entry: wires host messages, the reducer, and the view (design 4.2–4.3).
import type { HostMessage } from '../shared/protocol';
import type { Navigation } from '../shared/types';
import type { Locale } from './i18n';
import { initialState, reduce, restore, roundSummary, serialize, type Action, type PracticeState } from './logic/reducer';
import { PracticeView } from './view';
import { api } from './vscode-api';

interface Saved {
  practice: unknown;
  locale: Locale;
  navigation: Navigation;
}

function readSaved(): { state: PracticeState; locale: Locale; navigation: Navigation } | undefined {
  const raw = api.getState() as Partial<Saved> | null | undefined;
  if (!raw || typeof raw !== 'object') return undefined;
  const state = restore(raw.practice);
  if (!state) return undefined;
  const locale: Locale = raw.locale === 'ko' ? 'ko' : 'en';
  const navigation = raw.navigation ?? { hasPrevious: false, hasNext: false };
  return { state, locale, navigation };
}

const saved = readSaved();
let state: PracticeState | undefined = saved?.state;
let locale: Locale = saved?.locale ?? (navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en');
let navigation: Navigation = saved?.navigation ?? { hasPrevious: false, hasNext: false };
let view: PracticeView | undefined;
const root = document.getElementById('app') ?? document.body;

function ensureView(): PracticeView {
  if (view) return view;
  view = new PracticeView(root, locale);
  view.onAction(dispatch);
  view.onNavigate((to) => {
    if (to === 'restart') dispatch({ type: 'restart', nowIso: new Date().toISOString() });
    else api.postMessage({ type: 'navigate', to });
  });
  return view;
}

function persist(): void {
  if (!state) return;
  api.setState({ practice: serialize(state), locale, navigation } satisfies Saved);
}

function render(): void {
  if (!state) return;
  ensureView().setState(state, navigation);
  persist();
}

function dispatch(action: Action): void {
  if (!state) return;
  const wasFinished = state.finished;
  const result = reduce(state, action);
  state = result.state;
  const ops = [...result.ops];
  if (state.finished && !wasFinished) {
    const round = roundSummary(state, new Date().toISOString());
    if (round) ops.push({ op: 'addRound', round });
  }
  if (ops.length) api.postMessage({ type: 'apply', ops });
  if (result.prefs) api.postMessage({ type: 'preferences', preferences: result.prefs });
  render();
}

function sameRef(a: PracticeState | undefined, ref: { bookId: string; chapterId: string }): boolean {
  return !!a && a.chapter.ref.bookId === ref.bookId && a.chapter.ref.chapterId === ref.chapterId;
}

function onHostMessage(message: HostMessage): void {
  switch (message.type) {
    case 'init': {
      if (locale !== message.locale && view) {
        view.dispose();
        view = undefined;
        root.replaceChildren();
      }
      locale = message.locale;
      navigation = message.navigation;
      if (sameRef(state, message.chapter.ref)) {
        state = reduce(state!, { type: 'chapterReplaced', chapter: message.chapter }).state;
        state = reduce(state, { type: 'recordReplaced', record: message.record }).state;
        state = reduce(state, { type: 'settings', settings: message.settings }).state;
      } else {
        state = initialState(message.chapter, message.record, message.preferences, message.settings, new Date().toISOString());
      }
      ensureView().clearError();
      render();
      return;
    }
    case 'chapter': {
      navigation = message.navigation;
      if (sameRef(state, message.chapter.ref)) {
        state = reduce(state!, { type: 'chapterReplaced', chapter: message.chapter }).state;
        state = reduce(state, { type: 'recordReplaced', record: message.record }).state;
      } else {
        // No local state (e.g. restored state was unusable): start fresh with defaults.
        const prefs = state?.prefs ?? { mode: 'typing' as const, showTranslation: false };
        const settings = state?.settings ?? { showWpm: true };
        state = initialState(message.chapter, message.record, prefs, settings, new Date().toISOString());
      }
      ensureView().clearError();
      render();
      return;
    }
    case 'record':
      if (state) {
        state = reduce(state, { type: 'recordReplaced', record: message.record }).state;
        render();
      }
      return;
    case 'settings':
      if (state) {
        state = reduce(state, { type: 'settings', settings: message.settings }).state;
        render();
      }
      return;
    case 'error':
      ensureView().showError(message.message);
      return;
  }
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  if (event.data && typeof event.data === 'object' && 'type' in event.data) onHostMessage(event.data);
});

if (state) render();
api.postMessage({ type: 'ready', ...(state ? { chapterRef: state.chapter.ref } : {}) });
