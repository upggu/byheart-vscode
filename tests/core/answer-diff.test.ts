import { describe, expect, it } from 'vitest';
import { answerDiff } from '../../src/core/lib/answer-diff';

describe('answerDiff', () => {
  it('keeps the original text and isolates capitalization and missing punctuation', () => {
    const diff = answerDiff('Hello, Sunny.', 'hello Sunny.');
    expect(diff.parts).toEqual([
      { text: 'H', kind: 'detail' }, { text: 'ello', kind: 'same' },
      { text: ',', kind: 'detail' }, { text: ' Sunny.', kind: 'same' },
    ]);
    expect(diff.extra).toBe('');
  });
  it('marks substitutions and missing words without losing the original spacing', () => {
    const diff = answerDiff('We have a new student.', 'We have a old student.');
    expect(diff.parts.filter(p => p.kind === 'changed').map(p => p.text).join('')).toBe('new');
    expect(diff.parts.map(p => p.text).join('')).toBe('We have a new student.');
    expect(answerDiff('Hello world.', '').parts.map(p => p.text).join('')).toBe('Hello world.');
    expect(answerDiff('Hello world.', '').parts.some(p => p.kind === 'changed')).toBe(true);
  });
  it('reports extra input even when the full original is otherwise correct', () => {
    const diff = answerDiff('Hello.', 'Hello. extra');
    expect(diff.extra).toBe(' extra');
    expect(diff.parts).toEqual([{ text: 'Hello.', kind: 'same' }]);
  });
  it('preserves line breaks and graphemes', () => {
    const diff = answerDiff('Hi,\n👋 café', 'Hi\n👋 café');
    expect(diff.parts.map(p => p.text).join('')).toBe('Hi,\n👋 café');
    expect(diff.parts.filter(p => p.kind !== 'same')).toEqual([{ text: ',', kind: 'detail' }]);
  });
  it('does not claim an exact match when work is bounded for huge input', () => {
    const diff = answerDiff('a'.repeat(1100), 'b'.repeat(1100));
    expect(diff.limited).toBe(true);
    expect(diff.parts.map(p => p.text).join('')).toBe('a'.repeat(1100));
  });
});
