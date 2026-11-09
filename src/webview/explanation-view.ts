// Same rules as the web app's ExplanationText.tsx: `- ` lines form a list, other
// runs form paragraphs; **bold**/*italic* only; never interpret HTML.
import { parseEmphasis } from '../core/lib/emphasis';
import { appendEmphasized } from './answer-view';

function appendMarkdown(parent: HTMLElement, source: string): void {
  const { text, ranges } = parseEmphasis(source);
  appendEmphasized(parent, text, 0, ranges);
}

export function renderExplanation(host: HTMLElement, text: string): void {
  const wrapper = document.createElement('div');
  wrapper.className = 'note-explanation';
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; ) {
    const list = lines[i].startsWith('- ');
    const group: string[] = [];
    while (i < lines.length && lines[i].startsWith('- ') === list) group.push(lines[i++]);
    if (list) {
      const ul = document.createElement('ul');
      for (const line of group) {
        const li = document.createElement('li');
        appendMarkdown(li, line.slice(2));
        ul.append(li);
      }
      wrapper.append(ul);
    } else {
      const p = document.createElement('p');
      group.forEach((line, index) => {
        if (index > 0) p.append(document.createElement('br'));
        appendMarkdown(p, line);
      });
      wrapper.append(p);
    }
  }
  host.replaceChildren(wrapper);
}
