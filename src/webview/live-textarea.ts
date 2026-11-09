// Vanilla rewrite of the web app's LiveTextarea.tsx (not a copy): a textarea with
// a mirrored highlight layer, a recall-cue overlay, and word hints under errors.
import { createLiveComparator } from '../core/lib/live-diff';
import type { LiveDiff } from '../core/lib/live-diff';
import type { Locale } from './i18n';
import { t } from './i18n';

export interface LiveTextareaHandlers {
  onInput(value: string): void;
  onEnter(): void;
}

const neutral: LiveDiff = { errors: [], missing: [], limited: false, hints: [] };

export class LiveTextarea {
  readonly element: HTMLElement;
  private readonly container: HTMLDivElement;
  private readonly cueLayer: HTMLDivElement;
  private readonly cueHidden: HTMLSpanElement;
  private readonly cueRest: Text;
  private readonly highlight: HTMLDivElement;
  private readonly hintsLayer: HTMLDivElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly limitedNote: HTMLParagraphElement;
  private readonly observer: ResizeObserver | undefined;
  private expected = '';
  private cue = '';
  private compare: ((actual: string, withHints?: boolean) => LiveDiff) | undefined;
  private isComposing = false;

  constructor(
    host: HTMLElement,
    private readonly handlers: LiveTextareaHandlers,
    private readonly locale: Locale,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'live-field';
    this.container = document.createElement('div');
    this.container.className = 'live-input has-word-hints';
    this.cueLayer = document.createElement('div');
    this.cueLayer.className = 'focus-input-cue';
    this.cueLayer.setAttribute('aria-hidden', 'true');
    this.cueHidden = document.createElement('span');
    this.cueHidden.style.visibility = 'hidden';
    this.cueRest = document.createTextNode('');
    this.cueLayer.append(this.cueHidden, this.cueRest);
    this.highlight = document.createElement('div');
    this.highlight.className = 'live-highlight';
    this.highlight.setAttribute('aria-hidden', 'true');
    this.highlight.lang = 'en';
    this.hintsLayer = document.createElement('div');
    this.hintsLayer.className = 'live-word-hints';
    this.hintsLayer.setAttribute('aria-hidden', 'true');
    this.textarea = document.createElement('textarea');
    this.textarea.rows = 4;
    this.textarea.spellcheck = false;
    this.textarea.autocapitalize = 'off';
    this.textarea.setAttribute('autocomplete', 'off');
    this.textarea.setAttribute('aria-label', 'typing input');
    this.container.append(this.cueLayer, this.highlight, this.hintsLayer, this.textarea);
    this.limitedNote = document.createElement('p');
    this.limitedNote.className = 'muted small live-limited';
    this.limitedNote.hidden = true;
    this.limitedNote.textContent = t(locale, 'limited');
    this.element.append(this.container, this.limitedNote);
    host.append(this.element);

    this.textarea.addEventListener('input', () => {
      this.handlers.onInput(this.textarea.value);
      this.render();
    });
    this.textarea.addEventListener('compositionstart', () => {
      this.isComposing = true;
      this.container.classList.add('is-composing');
      this.render();
    });
    this.textarea.addEventListener('compositionend', () => {
      this.isComposing = false;
      this.container.classList.remove('is-composing');
      this.handlers.onInput(this.textarea.value);
      this.render();
    });
    this.textarea.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      if (event.shiftKey) return; // newline
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (event.isComposing || this.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      this.handlers.onEnter();
    });
    this.textarea.addEventListener('scroll', () => this.sync());
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => this.sync());
      this.observer.observe(this.textarea);
    }
  }

  get composing(): boolean {
    return this.isComposing;
  }

  get value(): string {
    return this.textarea.value;
  }

  setExpected(text: string): void {
    if (text === this.expected && this.compare) return;
    this.expected = text;
    this.compare = createLiveComparator(text);
    this.render();
  }

  setValue(value: string): void {
    if (this.textarea.value === value) return;
    this.textarea.value = value;
    this.render();
  }

  setCue(cue: string): void {
    if (cue === this.cue) return;
    this.cue = cue;
    this.render();
  }

  focus(): void {
    this.textarea.focus();
    const end = this.textarea.value.length;
    this.textarea.setSelectionRange(end, end);
  }

  dispose(): void {
    this.observer?.disconnect();
    this.element.remove();
  }

  private render(): void {
    const value = this.textarea.value;
    this.cueHidden.textContent = this.cue.slice(0, value.length);
    this.cueRest.data = this.cue.slice(value.length);
    const diff = !this.isComposing && value && this.compare ? this.compare(value, true) : neutral;
    this.renderHighlight(value, diff);
    this.renderHints(diff);
    this.limitedNote.hidden = !diff.limited;
    this.sync();
  }

  private renderHighlight(value: string, diff: LiveDiff): void {
    const boundaries = [...new Set([0, value.length, ...diff.errors.flatMap((r) => [r.start, r.end]), ...diff.missing, ...(diff.hints ?? []).map((h) => h.start)])]
      .filter((b) => b >= 0 && b <= value.length)
      .sort((a, b) => a - b);
    const gaps = new Set(diff.missing);
    const fragment = document.createDocumentFragment();
    let errorIndex = 0;
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      while (errorIndex < diff.errors.length && diff.errors[errorIndex].end <= start) errorIndex++;
      const error = diff.errors[errorIndex];
      if (gaps.has(start)) {
        const gap = document.createElement('span');
        gap.className = 'live-missing';
        fragment.append(gap);
      }
      const span = document.createElement('span');
      span.dataset.liveStart = String(start);
      if (error && error.start <= start) span.className = 'live-error';
      span.textContent = value.slice(start, boundaries[i + 1]);
      fragment.append(span);
    }
    if (gaps.has(value.length)) {
      const gap = document.createElement('span');
      gap.className = 'live-missing';
      fragment.append(gap);
    }
    // A trailing newline needs an empty line, just like the native textarea.
    const tail = document.createElement('span');
    tail.dataset.liveStart = String(value.length);
    tail.textContent = '​';
    fragment.append(tail);
    this.highlight.replaceChildren(fragment);
  }

  private renderHints(diff: LiveDiff): void {
    const groups = new Map<number, string[]>();
    for (const hint of diff.hints ?? []) {
      const group = groups.get(hint.start) ?? [];
      group.push(hint.expected);
      groups.set(hint.start, group);
    }
    const fragment = document.createDocumentFragment();
    for (const [start, words] of groups) {
      const node = document.createElement('span');
      node.className = 'live-word-hint';
      node.dataset.hintStart = String(start);
      node.textContent = words.join(' ');
      fragment.append(node);
    }
    this.hintsLayer.replaceChildren(fragment);
  }

  /** Mirrors the textarea's size and scroll, then positions hints under their anchors. */
  private sync(): void {
    const textarea = this.textarea;
    const mirror = this.highlight;
    // clientWidth excludes the scrollbar, including non-overlay desktop scrollbars.
    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.style.height = `${textarea.clientHeight}px`;
    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;
    this.cueLayer.style.width = `${textarea.clientWidth}px`;
    this.cueLayer.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
    const bounds = this.hintsLayer.getBoundingClientRect();
    const positioned: { node: HTMLElement; left: number; top: number }[] = [];
    this.hintsLayer.querySelectorAll<HTMLElement>('[data-hint-start]').forEach((node) => {
      const anchor = mirror.querySelector<HTMLElement>(`[data-live-start="${node.dataset.hintStart}"]`);
      const rect = anchor?.getClientRects()[0];
      if (!rect) {
        node.style.display = 'none';
        return;
      }
      node.style.display = '';
      const left = Math.max(16, Math.min(rect.left - bounds.left, textarea.clientWidth - 32));
      const top = rect.bottom - bounds.top + 2;
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
      positioned.push({ node, left, top });
    });
    // Share a row's remaining space without letting adjacent hints overlap.
    positioned.forEach(({ node, left, top }, i) => {
      const next = positioned.slice(i + 1).find((p) => Math.abs(p.top - top) < 2);
      node.style.maxWidth = `${Math.max(0, (next?.left ?? textarea.clientWidth - 16) - left - 4)}px`;
    });
  }
}
