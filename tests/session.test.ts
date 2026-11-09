import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecordStore, recordPath } from '../src/extension/records';
import { PracticeSession, isChapterFile, type SessionDeps } from '../src/extension/session';
import type { HostMessage } from '../src/shared/protocol';
import type { Preferences } from '../src/shared/types';

let root: string;
let posted: HostMessage[];
let prefs: Preferences;
let watchers: { chapterId: string; onChange: () => void; disposed: boolean }[];
let picked: { bookId: string; chapterId: string } | undefined;
let opened: string[];
let session: PracticeSession;

function deps(): SessionDeps {
  return {
    root,
    store: new RecordStore(root, () => '2026-11-09T00:00:00.000Z'),
    builtin: [],
    post: (m) => posted.push(m),
    settings: () => ({ showWpm: true }),
    preferences: () => prefs,
    setPreferences: async (p) => { prefs = { ...prefs, ...p }; },
    locale: 'ko',
    pick: async () => picked,
    watch: (_dir, chapterId, onChange) => { const w = { chapterId, onChange, disposed: false }; watchers.push(w); return { dispose: () => { w.disposed = true; } }; },
    openFolder: async (dir) => { opened.push(dir); },
    notify: () => undefined,
  };
}

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'byheart-session-'));
  const dir = join(root, 'books', 'alpha');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, '1.txt'), 'one');
  await fs.writeFile(join(dir, '2.txt'), 'two');
  await fs.writeFile(join(dir, '3.txt'), '');
  posted = []; watchers = []; opened = []; picked = undefined;
  prefs = { mode: 'typing', showTranslation: false };
  session = new PracticeSession(deps());
});
afterEach(async () => { session.dispose(); await fs.rm(root, { recursive: true, force: true }); });

describe('PracticeSession', () => {
  it('open(ref, init)은 init을 보내고 navigation·locale을 채운다', async () => {
    await session.open({ bookId: 'alpha', chapterId: '1.txt' }, 'init');
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: 'init', locale: 'ko', navigation: { hasPrevious: false, hasNext: true }, chapter: { title: '1', bookTitle: 'alpha' }, record: { revision: 0 }, preferences: prefs, settings: { showWpm: true } });
    expect(watchers).toHaveLength(1);
  });

  it('navigate로 여는 챕터는 chapter를 보내고 이전 감시를 해제한다', async () => {
    await session.open({ bookId: 'alpha', chapterId: '1.txt' });
    await session.handle({ type: 'navigate', to: 'next' });
    expect(posted.at(-1)).toMatchObject({ type: 'chapter', chapter: { title: '2' }, navigation: { hasPrevious: true, hasNext: false } });
    expect(watchers[0].disposed).toBe(true);
    expect(watchers[1].disposed).toBe(false);
  });

  it('ready는 ref가 있으면 그 챕터, 없으면 마지막 챕터, 그것도 없으면 pick 결과를 연다', async () => {
    picked = { bookId: 'alpha', chapterId: '1.txt' };
    await session.handle({ type: 'ready' });
    expect(posted[0]).toMatchObject({ type: 'init', chapter: { title: '1' } });
    await session.handle({ type: 'ready', chapterRef: { bookId: 'alpha', chapterId: '2.txt' } });
    expect(posted[1]).toMatchObject({ type: 'init', chapter: { title: '2' } });
    picked = undefined;
    await session.handle({ type: 'ready' });
    expect(posted[2]).toMatchObject({ type: 'init', chapter: { title: '2' } });
  });

  it('ready는 매번 init으로 답한다 (웹뷰가 저장 상태 없이 다시 뜬 경우)', async () => {
    await session.handle({ type: 'ready', chapterRef: { bookId: 'alpha', chapterId: '1.txt' } });
    await session.handle({ type: 'ready' });
    expect(posted.map((m) => m.type)).toEqual(['init', 'init']);
  });

  it('watch 필터: 글롭 특수문자가 있는 파일명도 그 파일만 고른다', async () => {
    const dir = join(root, 'books', 'alpha');
    await fs.writeFile(join(dir, 'Lesson [1].txt'), 'x');
    await session.open({ bookId: 'alpha', chapterId: 'Lesson [1].txt' });
    expect(watchers.at(-1)!.chapterId).toBe('Lesson [1].txt');
    expect(isChapterFile(dir, 'Lesson [1].txt', join(dir, 'Lesson [1].txt'))).toBe(true);
    expect(isChapterFile(dir, 'Lesson [1].txt', join(dir, 'Lesson 1.txt'))).toBe(false);
    expect(isChapterFile(dir, 'a.txt', join(dir, 'sub', 'a.txt'))).toBe(false);
  });

  it('ready에 ref가 없고 pick도 없으면 아무것도 보내지 않는다', async () => {
    await session.handle({ type: 'ready' });
    expect(posted).toEqual([]);
  });

  it('apply는 기록을 저장하고 record를 보낸다', async () => {
    await session.open({ bookId: 'alpha', chapterId: '1.txt' });
    await session.handle({ type: 'apply', ops: [{ op: 'setMark', cardId: 'x', difficult: true }] });
    expect(posted[1]).toMatchObject({ type: 'record', record: { revision: 1, marks: { x: { difficult: true } } } });
    expect(JSON.parse(await fs.readFile(recordPath(root, { bookId: 'alpha', chapterId: '1.txt' }), 'utf8')).revision).toBe(1);
  });

  it('손상된 기록은 error 후 빈 기록으로 진행하고 apply도 error', async () => {
    const path = recordPath(root, { bookId: 'alpha', chapterId: '1.txt' });
    await fs.mkdir(join(root, 'records', 'alpha'), { recursive: true });
    await fs.writeFile(path, '{broken');
    await session.open({ bookId: 'alpha', chapterId: '1.txt' }, 'init');
    expect(posted[0].type).toBe('error');
    expect(posted[1]).toMatchObject({ type: 'init', record: { revision: 0 } });
    await session.handle({ type: 'apply', ops: [{ op: 'setPosition', cardId: 'x' }] });
    expect(posted[2].type).toBe('error');
    expect(await fs.readFile(path, 'utf8')).toBe('{broken');
  });

  it('파일 변경 시 다시 읽어 chapter를 보내고, 읽기 실패면 error', async () => {
    await session.open({ bookId: 'alpha', chapterId: '1.txt' });
    await fs.writeFile(join(root, 'books', 'alpha', '1.txt'), 'uno\n\ndos');
    await watchers[0].onChange();
    await new Promise((r) => setTimeout(r, 50));
    expect(posted[1]).toMatchObject({ type: 'chapter', chapter: { cards: [{ text: 'uno' }, { text: 'dos' }] } });
    await fs.writeFile(join(root, 'books', 'alpha', '1.txt'), '');
    await watchers[0].onChange();
    await new Promise((r) => setTimeout(r, 50));
    expect(posted[2].type).toBe('error');
  });

  it('navigate next는 현재 position을 첫 카드로 되돌리고 다음 챕터를 연다', async () => {
    await session.open({ bookId: 'alpha', chapterId: '1.txt' });
    await session.handle({ type: 'apply', ops: [{ op: 'setPosition', cardId: 'zzz' }] });
    await session.handle({ type: 'navigate', to: 'next' });
    const last = posted.at(-1);
    expect(last).toMatchObject({ type: 'chapter', chapter: { title: '2' } });
    const first = JSON.parse(await fs.readFile(recordPath(root, { bookId: 'alpha', chapterId: '1.txt' }), 'utf8'));
    expect(first.position.cardId).not.toBe('zzz');
  });

  it('navigate next는 마지막 챕터(오류 챕터 제외)에서 아무것도 하지 않는다', async () => {
    await session.open({ bookId: 'alpha', chapterId: '2.txt' });
    expect(posted[0]).toMatchObject({ navigation: { hasNext: false } });
    await session.handle({ type: 'navigate', to: 'next' });
    expect(posted).toHaveLength(1);
  });

  it('navigate pick은 pick 결과를 열고, preferences·openFolder를 처리한다', async () => {
    await session.open({ bookId: 'alpha', chapterId: '1.txt' });
    picked = { bookId: 'alpha', chapterId: '2.txt' };
    await session.handle({ type: 'navigate', to: 'pick' });
    expect(posted.at(-1)).toMatchObject({ type: 'chapter', chapter: { title: '2' } });
    await session.handle({ type: 'preferences', preferences: { mode: 'hint' } });
    expect(prefs.mode).toBe('hint');
    await session.handle({ type: 'openFolder' });
    expect(opened).toEqual([join(root, 'books')]);
    await session.handle({ type: 'navigate', to: 'restart' });
  });

  it('open 실패는 error를 보낸다', async () => {
    await session.open({ bookId: 'alpha', chapterId: 'missing.txt' });
    expect(posted[0].type).toBe('error');
  });

  it('settings 변경을 보낸다', async () => {
    await session.open({ bookId: 'alpha', chapterId: '1.txt' });
    session.pushSettings({ showWpm: false });
    expect(posted[1]).toEqual({ type: 'settings', settings: { showWpm: false } });
  });
});
