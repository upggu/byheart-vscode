import { ZodError } from 'zod';
import type { Item, Line } from '../../core/lib/content-types';
import { parseEmphasis } from '../../core/lib/emphasis';
import { turnUnits } from '../../core/lib/sentences';
import { parseReviewDocument, type ReviewDocument } from '../../core/review/model';
import type { PracticeCard } from '../../shared/types';

export interface CardExtras {
  translation?: string;
  explanation?: string;
}

/** Design 2.2: the same turn → Line mapping as the web app's scripts/content.ts. */
export function toItem(doc: ReviewDocument, chapterId: string, bookId: string): { item: Item; extras: Map<string, CardExtras> } {
  const extras = new Map<string, CardExtras>();
  const lines: Line[] = doc.turns.map((turn, index) => {
    const { text, ranges } = parseEmphasis(turn.text);
    extras.set(turn.id, {
      ...(turn.translation !== undefined ? { translation: turn.translation } : {}),
      ...(turn.explanation !== undefined ? { explanation: turn.explanation } : {}),
    });
    return {
      ...(turn.kind ? { kind: turn.kind } : {}),
      id: turn.id,
      seq: index + 1,
      speaker: turn.speaker,
      ...(turn.section ? { section: turn.section } : {}),
      english: text,
      ...(ranges.length ? { emphasis: ranges } : {}),
      korean: turn.translation ?? '',
    };
  });
  return { item: { id: chapterId, bookId, type: 'passage', chapter: chapterId, title: chapterId, lines }, extras };
}

function firstIssueLine(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'invalid document';
  const path = issue.path.map((p) => (typeof p === 'number' ? `[${p}]` : String(p))).join('.').replace(/\.\[/g, '[');
  return path ? `${path}: ${issue.message}` : issue.message;
}

export function cardsFromByheartJson(text: string, chapterId = 'chapter', bookId = 'book'): PracticeCard[] {
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let value: unknown;
  try {
    value = JSON.parse(stripped);
  } catch (error) {
    throw new Error(`JSON: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
  let doc: ReviewDocument;
  try {
    doc = parseReviewDocument(value);
  } catch (error) {
    if (error instanceof ZodError) throw new Error(firstIssueLine(error));
    throw new Error(error instanceof Error ? error.message.split('\n')[0] : String(error));
  }
  const { item, extras } = toItem(doc, chapterId, bookId);
  const sections = new Map(item.lines.map((line) => [line.id, line.section] as const));
  return turnUnits(item).map((unit) => {
    const extra = extras.get(unit.id) ?? {};
    const section = sections.get(unit.id);
    return {
      id: unit.id,
      kind: unit.kind ?? 'study',
      speaker: unit.speaker,
      ...(section ? { section } : {}),
      text: unit.english,
      ...(unit.emphasis ? { emphasis: unit.emphasis } : {}),
      ...(extra.translation !== undefined ? { translation: extra.translation } : {}),
      ...(extra.explanation !== undefined ? { explanation: extra.explanation } : {}),
    };
  });
}
