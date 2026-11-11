// Renders the practice screen (design 7.1) from PracticeState. DOM only; no
// state logic here. Text always goes through textContent.
import { recallCue } from '../core/lib/sentences';
import type { Navigation, PracticeCard } from '../shared/types';
import { renderAnswer, appendEmphasized } from './answer-view';
import { renderExplanation } from './explanation-view';
import type { Key, Locale } from './i18n';
import { t } from './i18n';
import { LiveTextarea } from './live-textarea';
import type { Action, CardState, PracticeState } from './logic/reducer';
import { wpm } from './logic/wpm';

type NavigateTarget = 'next' | 'restart' | 'pick';

export class PracticeView {
  private actionHandler: (action: Action) => void = () => undefined;
  private navigateHandler: (to: NavigateTarget) => void = () => undefined;
  private state: PracticeState | undefined;
  private navigation: Navigation = { hasPrevious: false, hasNext: false };
  private renderedKey = '';
  private readonly header: HTMLElement;
  private readonly title: HTMLSpanElement;
  private readonly position: HTMLSpanElement;
  private readonly translationToggle: HTMLButtonElement;
  private readonly modeTyping: HTMLButtonElement;
  private readonly modeHint: HTMLButtonElement;
  private readonly errorBanner: HTMLDivElement;
  private readonly card: HTMLElement;
  private readonly section: HTMLDivElement;
  private readonly speaker: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly actions: HTMLDivElement;
  private readonly footer: HTMLDivElement;
  private readonly textarea: LiveTextarea;
  private wpmLabel: HTMLSpanElement | undefined;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly root: HTMLElement,
    private readonly locale: Locale,
  ) {
    root.classList.add('byheart');
    this.header = el('header', 'bh-header');
    this.title = el('span', 'bh-title');
    this.position = el('span', 'bh-position');
    const toggles = el('div', 'bh-toggles');
    this.translationToggle = button(t(locale, 'translation'), 'bh-toggle', () => this.actionHandler({ type: 'toggleTranslation' }));
    const modeSwitch = el('div', 'bh-mode-switch');
    this.modeTyping = button(t(locale, 'modeTyping'), 'bh-toggle', () => this.actionHandler({ type: 'setMode', mode: 'typing' }));
    this.modeHint = button(t(locale, 'modeHint'), 'bh-toggle', () => this.actionHandler({ type: 'setMode', mode: 'hint' }));
    modeSwitch.append(this.modeTyping, this.modeHint);
    toggles.append(this.translationToggle, modeSwitch);
    // Actions live in the header so Reveal/Check/Next stay put no matter how
    // tall the card content is.
    this.actions = el('div', 'bh-actions');
    this.header.append(this.title, this.position, toggles, this.actions);

    this.errorBanner = el('div', 'bh-error');
    this.errorBanner.setAttribute('role', 'alert');
    this.errorBanner.hidden = true;

    this.card = el('main', 'bh-card');
    this.section = el('div', 'bh-section');
    this.speaker = el('div', 'bh-speaker');
    this.body = el('div', 'bh-body');
    this.card.append(this.section, this.speaker, this.body);
    this.footer = el('div', 'bh-footer muted small');
    this.footer.textContent = t(locale, 'shortcutHint');
    root.replaceChildren(this.header, this.errorBanner, this.card, this.footer);

    const detached = document.createElement('div');
    this.textarea = new LiveTextarea(detached, {
      onInput: (value) => this.actionHandler({ type: 'input', value, now: Date.now() }),
      onEnter: () => this.actionHandler({ type: 'check', now: Date.now() }),
    }, locale);

    root.addEventListener('keydown', (event) => this.onKeydown(event));
    this.timer = setInterval(() => this.updateWpm(), 500);
  }

  onAction(cb: (action: Action) => void): void {
    this.actionHandler = cb;
  }

  onNavigate(cb: (to: NavigateTarget) => void): void {
    this.navigateHandler = cb;
  }

  showError(message: string): void {
    this.errorBanner.textContent = `${t(this.locale, 'error')}: ${message}`;
    this.errorBanner.hidden = false;
  }

  clearError(): void {
    this.errorBanner.hidden = true;
  }

  dispose(): void {
    clearInterval(this.timer);
  }

  setState(state: PracticeState, navigation: Navigation): void {
    this.state = state;
    this.navigation = navigation;
    const { chapter, prefs } = state;
    this.title.textContent = `${chapter.bookTitle} · ${chapter.title}`;
    const studyTotal = chapter.cards.filter((c) => c.kind === 'study').length;
    const studyIndex = chapter.cards.slice(0, state.index + 1).filter((c) => c.kind === 'study').length;
    this.position.textContent = chapter.cards.length ? t(this.locale, 'position', { n: Math.max(1, studyIndex), total: studyTotal }) : '';
    const anyTranslation = chapter.cards.some((c) => c.translation);
    this.translationToggle.hidden = !anyTranslation;
    this.translationToggle.setAttribute('aria-pressed', String(prefs.showTranslation));
    this.modeTyping.setAttribute('aria-pressed', String(prefs.mode === 'typing'));
    this.modeHint.setAttribute('aria-pressed', String(prefs.mode === 'hint'));

    const card = chapter.cards[state.index];
    const cs = state.cards[state.index];
    const key = state.finished
      ? `finished:${navigation.hasNext}`
      : card && cs
        ? `${card.id}:${card.kind}:${cs.stage}:${cs.mode}:${prefs.showTranslation}:${state.settings.showWpm}:${state.chapter.cards.length}`
        : 'empty';
    const fullRender = key !== this.renderedKey;
    this.renderedKey = key;

    if (state.finished) {
      this.renderFinished(fullRender);
      return;
    }
    if (!card || !cs) {
      this.body.replaceChildren();
      this.actions.replaceChildren();
      return;
    }
    this.renderMeta(card, state.index);
    if (card.kind === 'explanation') this.renderExplanationCard(card, fullRender);
    else if (cs.stage === 'input') this.renderInput(card, cs, fullRender);
    else this.renderChecked(card, cs, fullRender);
    this.updateMarkButton(card);
    this.updateWpm();
  }

  private renderMeta(card: PracticeCard, index: number): void {
    const previous = this.state?.chapter.cards[index - 1];
    const showSection = !!card.section && card.section !== previous?.section;
    this.section.textContent = showSection ? card.section! : '';
    this.section.hidden = !showSection;
    this.speaker.textContent = card.speaker;
    this.speaker.hidden = !card.speaker;
  }

  private renderInput(card: PracticeCard, cs: CardState, fullRender: boolean): void {
    if (cs.mode === 'hint') {
      if (fullRender) {
        const hintCard = el('div', 'bh-hint-card');
        hintCard.tabIndex = 0;
        hintCard.setAttribute('role', 'button');
        const cue = el('p', 'bh-cue');
        cue.lang = 'en';
        cue.textContent = recallCue(card.text);
        hintCard.append(cue);
        hintCard.addEventListener('click', () => this.actionHandler({ type: 'reveal' }));
        this.body.replaceChildren(hintCard);
        this.actions.replaceChildren(
          this.markButton(),
          this.previousButton(),
          slot(t(this.locale, 'rehide'), 'bh-secondary bh-reset'),
          button(t(this.locale, 'reveal'), 'bh-primary', () => this.actionHandler({ type: 'reveal' })),
        );
        hintCard.focus();
      }
      return;
    }
    if (fullRender) {
      this.body.replaceChildren(this.textarea.element);
      this.wpmLabel = el('span', 'bh-wpm muted small');
      this.body.append(this.wpmLabel);
      this.actions.replaceChildren(
        this.markButton(),
        this.previousButton(),
        slot(t(this.locale, 'rewrite'), 'bh-secondary bh-reset'),
        button(t(this.locale, 'check'), 'bh-primary', () => this.actionHandler({ type: 'check', now: Date.now() })),
      );
    }
    this.textarea.setExpected(card.text);
    this.textarea.setCue(recallCue(card.text));
    this.textarea.setValue(cs.input);
    if (fullRender) this.textarea.focus();
  }

  private renderChecked(card: PracticeCard, cs: CardState, fullRender: boolean): void {
    if (!fullRender) return;
    const answer = el('div', 'bh-answer');
    if (cs.checkedMode === 'hint') {
      const text = el('p', 'answer-text');
      text.lang = 'en';
      appendEmphasized(text, card.text, 0, card.emphasis);
      answer.append(text);
    } else {
      renderAnswer(answer, card.text, cs.input, card.emphasis, this.locale);
    }
    this.body.replaceChildren(answer);
    this.appendNotes(card);
    const next = button(t(this.locale, 'nextEnter'), 'bh-primary', () => this.actionHandler({ type: 'next' }));
    const resetLabel: Key = cs.checkedMode === 'hint' ? 'rehide' : 'rewrite';
    this.actions.replaceChildren(
      this.markButton(),
      this.previousButton(),
      button(t(this.locale, resetLabel), 'bh-secondary bh-reset', () => this.actionHandler({ type: 'reset' })),
      next,
    );
    next.focus();
  }

  private renderExplanationCard(card: PracticeCard, fullRender: boolean): void {
    if (!fullRender) return;
    const text = el('p', 'answer-text bh-explanation-body');
    text.lang = 'en';
    appendEmphasized(text, card.text, 0, card.emphasis);
    this.body.replaceChildren(text);
    this.appendNotes(card, true);
    const next = button(t(this.locale, 'nextEnter'), 'bh-primary', () => this.actionHandler({ type: 'next' }));
    this.actions.replaceChildren(slot(t(this.locale, 'mark'), 'bh-mark'), this.previousButton(), slot(t(this.locale, 'rewrite'), 'bh-secondary bh-reset'), next);
    next.focus();
  }

  private appendNotes(card: PracticeCard, always = false): void {
    if (card.translation && (always || this.state?.prefs.showTranslation)) {
      const tr = el('p', 'bh-translation');
      tr.textContent = card.translation;
      this.body.append(tr);
    }
    if (card.explanation) {
      const host = el('div', 'bh-explanation');
      renderExplanation(host, card.explanation);
      this.body.append(host);
    }
  }

  private renderFinished(fullRender: boolean): void {
    if (!fullRender || !this.state) return;
    const state = this.state;
    const study = state.chapter.cards.map((c, i) => ({ c, cs: state.cards[i] })).filter(({ c }) => c.kind === 'study');
    const checked = study.filter(({ cs }) => cs.checkedMode !== undefined);
    const typing = checked.filter(({ cs }) => cs.checkedMode === 'typing');
    const accuracies = typing.map(({ cs }) => cs.accuracy).filter((a): a is number => typeof a === 'number');
    const accuracy = accuracies.length ? Math.round((accuracies.reduce((a, b) => a + b, 0) / accuracies.length) * 100) : null;
    const timed = typing.filter(({ cs }) => cs.chars !== undefined);
    const avg = state.settings.showWpm && timed.length
      ? wpm(timed.reduce((a, { cs }) => a + (cs.chars ?? 0), 0), timed.reduce((a, { cs }) => a + cs.elapsedMs, 0))
      : null;
    const summary = el('p', 'bh-summary');
    summary.textContent = accuracy === null
      ? t(this.locale, 'summaryHint', { cards: checked.length })
      : avg === null
        ? t(this.locale, 'summaryNoWpm', { cards: checked.length, accuracy })
        : t(this.locale, 'summary', { cards: checked.length, accuracy, wpm: avg });
    this.section.hidden = true;
    this.speaker.hidden = true;
    this.body.replaceChildren(summary);
    const buttons: HTMLButtonElement[] = [];
    if (this.navigation.hasNext) buttons.push(button(t(this.locale, 'nextChapter'), 'bh-primary', () => this.navigateHandler('next')));
    buttons.push(button(t(this.locale, 'restart'), this.navigation.hasNext ? 'bh-secondary' : 'bh-primary', () => this.navigateHandler('restart')));
    buttons.push(button(t(this.locale, 'pickChapter'), 'bh-secondary', () => this.navigateHandler('pick')));
    this.actions.replaceChildren(...buttons);
    buttons[0].focus();
  }

  private markButton(): HTMLButtonElement {
    const b = button(t(this.locale, 'mark'), 'bh-mark', () => this.actionHandler({ type: 'toggleMark' }));
    b.dataset.role = 'mark';
    return b;
  }

  private previousButton(): HTMLButtonElement {
    const b = button(t(this.locale, 'previous'), 'bh-secondary', () => this.actionHandler({ type: 'previous' }));
    b.dataset.role = 'previous';
    b.disabled = !this.state || this.state.index === 0;
    return b;
  }

  private updateMarkButton(card: PracticeCard): void {
    const marked = this.state?.record.marks[card.id]?.difficult ?? false;
    this.actions.querySelectorAll<HTMLButtonElement>('[data-role="mark"]').forEach((b) => {
      b.setAttribute('aria-pressed', String(marked));
      b.textContent = t(this.locale, marked ? 'marked' : 'mark');
    });
    this.actions.querySelectorAll<HTMLButtonElement>('[data-role="previous"]').forEach((b) => {
      b.disabled = !this.state || this.state.index === 0;
    });
  }

  private updateWpm(): void {
    const label = this.wpmLabel;
    const state = this.state;
    if (!label || !state || state.finished) return;
    const cs = state.cards[state.index];
    const card = state.chapter.cards[state.index];
    if (!cs || !card || card.kind !== 'study' || cs.stage !== 'input' || cs.mode !== 'typing' || !state.settings.showWpm || cs.startedAt === null) {
      label.textContent = '';
      return;
    }
    const value = wpm(cs.input.length, Date.now() - cs.startedAt);
    label.textContent = value === null ? '' : t(this.locale, 'wpm', { wpm: value });
  }

  private onKeydown(event: KeyboardEvent): void {
    const state = this.state;
    if (!state || event.repeat || event.isComposing || this.textarea.composing) return;
    const target = event.target as HTMLElement | null;
    const card = state.chapter.cards[state.index];
    const cs = state.cards[state.index];
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !state.finished) {
      const digit = event.code === 'Digit1' ? 1 : event.code === 'Digit2' ? 2 : event.code === 'Digit3' ? 3 : 0;
      if (!digit) return;
      event.preventDefault();
      if (digit === 1) this.actionHandler({ type: 'previous' });
      else if (digit === 2) this.actionHandler({ type: 'toggleMark' });
      else if (card?.kind === 'study') this.actionHandler({ type: 'reset' });
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (state.finished) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const buttons = [...this.actions.querySelectorAll<HTMLButtonElement>('button')];
        const index = buttons.findIndex((b) => b === document.activeElement);
        const next = buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1) + (index === -1 ? 1 : 0)) % buttons.length];
        next?.focus();
        event.preventDefault();
      }
      return;
    }
    if (event.key === 'Escape') {
      if (card?.kind === 'study' && cs?.stage === 'checked') {
        event.preventDefault();
        this.actionHandler({ type: 'reset' });
      }
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) return; // handled natively
      if (!card || !cs) return;
      event.preventDefault();
      if (cs.stage === 'checked') this.actionHandler({ type: 'next' });
      else if (cs.mode === 'hint') this.actionHandler({ type: 'reveal' });
    }
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

// Invisible stand-in that keeps header buttons in the same place across stages.
function slot(label: string, className: string): HTMLButtonElement {
  const b = button(label, `${className} bh-slot`, () => undefined);
  b.disabled = true;
  b.tabIndex = -1;
  b.setAttribute('aria-hidden', 'true');
  return b;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
