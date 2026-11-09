// Strict answer comparison screen (design 7.2): answerDiff parts with emphasis.
import { answerDiff } from '../core/lib/answer-diff';
import type { EmphasisRange } from '../core/lib/emphasis';
import type { Locale } from './i18n';
import { t } from './i18n';

/** Appends `text` to `parent`, wrapping emphasised ranges (absolute offsets) in strong/em. */
export function appendEmphasized(parent: HTMLElement, text: string, offset: number, ranges: EmphasisRange[] | undefined): void {
  let cursor = 0;
  const end = text.length;
  for (const range of ranges ?? []) {
    const a = Math.max(0, range.start - offset);
    const b = Math.min(end, range.end - offset);
    if (a >= b) continue;
    if (cursor < a) parent.append(text.slice(cursor, a));
    const node = document.createElement(range.kind === 'bold' ? 'strong' : 'em');
    node.textContent = text.slice(a, b);
    parent.append(node);
    cursor = b;
  }
  if (cursor < end) parent.append(text.slice(cursor));
}

export function renderAnswer(host: HTMLElement, expected: string, input: string, emphasis: EmphasisRange[] | undefined, locale: Locale): void {
  const diff = answerDiff(expected, input);
  const text = document.createElement('p');
  text.className = 'answer-text';
  text.lang = 'en';
  let offset = 0;
  for (const part of diff.parts) {
    const span = document.createElement('span');
    span.className = `answer-${part.kind}`;
    appendEmphasized(span, part.text, offset, emphasis);
    offset += part.text.length;
    text.append(span);
  }
  host.replaceChildren(text);
  if (diff.limited) {
    const note = document.createElement('p');
    note.className = 'muted small';
    note.textContent = t(locale, 'limited');
    host.append(note);
    return;
  }
  if (diff.extra) {
    const extra = document.createElement('p');
    extra.className = 'answer-extra-line';
    const label = document.createElement('span');
    label.className = 'muted small';
    label.textContent = `${t(locale, 'extraInput')}: `;
    const s = document.createElement('s');
    s.className = 'answer-extra';
    s.textContent = diff.extra;
    extra.append(label, s);
    host.append(extra);
  }
}
