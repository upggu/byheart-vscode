import { createHash } from 'node:crypto';
import type { PracticeCard } from '../../shared/types';

/** Design 5.3: blank-line paragraphs become cards; an initial `# ` line is the title. */
export function parseTxt(text: string): { title?: string; cards: PracticeCard[] } {
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = stripped.replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/[ \t\f\v]+$/, ''));

  let title: string | undefined;
  const firstContent = lines.findIndex((line) => line.trim() !== '');
  if (firstContent !== -1 && lines[firstContent].startsWith('# ')) {
    title = lines[firstContent].slice(2).trim();
    lines.splice(firstContent, 1);
  }

  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) paragraphs.push(current.join('\n'));
    current = [];
  };
  for (const line of lines) {
    if (line.trim() === '') flush();
    else current.push(line);
  }
  flush();

  if (!paragraphs.length) throw new Error('빈 파일');

  const seen = new Map<string, number>();
  const cards = paragraphs.map((body): PracticeCard => {
    const base = createHash('sha256').update(body).digest('hex').slice(0, 16);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { id: count === 1 ? base : `${base}-${count}`, kind: 'study', speaker: '', text: body };
  });
  return { ...(title !== undefined ? { title } : {}), cards };
}
