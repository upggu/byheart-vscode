# ByHeart for VS Code 1차 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `~/.byheart/books/`의 `.byheart.json`·`.txt`를 교재로 읽어 VS Code 웹뷰에서 웹앱과 같은 규칙으로 타이핑 암기 연습을 하고, 실시간 WPM·완료 요약을 보여 주며 기록을 `~/.byheart/records/`에 원자적으로 남기는 확장을 `.vsix`로 만든다.

**Architecture:** 확장 호스트(Node)가 폴더 스캔·어댑터·기록·상태바·QuickPick을 맡고, 웹뷰(Chromium)가 연습 UI를 맡는다. 둘은 `src/shared/protocol.ts`의 판별 유니온 메시지로만 통신한다. 힌트·비교 로직은 웹앱 `../byheart` 커밋 `0ee9eaa78e40d6aded17d1d27913c13ed0492339`의 모듈을 `src/core/`에 복사해 쓰며, 실시간 비교는 웹뷰 메인 스레드에서 동기 호출한다.

**Tech Stack:** TypeScript 5 (strict), esbuild(진입점 둘), Vitest(Node), zod 4(호스트, `.byheart.json` 검증), `@vscode/test-cli`+`@vscode/test-electron`(통합 테스트, 이 PC에서는 미확인), `@vscode/vsce`(패키징). 런타임 의존성은 zod 하나.

**Spec:** `docs/superpowers/specs/2026-11-09-vscode-extension-v1-design.md` (2026-11-09 승인). 절 번호 인용은 이 문서 기준이다.

**실행 방식:** 2026-11-09 사용자 선택 — Native(`superpowers:executing-plans`, 한 세션에서 작업 순서대로 구현, 마지막에 전체 검토 한 번). 작업 10의 명언 해석문은 커밋 전에 사용자 검토를 받는다.

## Global Constraints

- `package.json`: `name: "byheart"`, `displayName: "ByHeart"`, `license: "MIT"`, `extensionKind: ["ui"]`, `browser` 필드 없음, `keybindings` 기여 없음, `activationEvents: ["onStartupFinished"]`(+ 패널 복원용 `onWebviewPanel:byheart.practice`).
- 네트워크 요청·원격 측정 코드 없음. `../byheart`의 파일은 읽기만 한다.
- 복사 파일(`src/core/lib/{hints,live-diff,diff,answer-diff,emphasis,sentences,content-types}.ts`, `src/core/review/model.ts`)은 첫 줄 주석 `// Copied from ../byheart src/<path> at commit 0ee9eaa78e40d6aded17d1d27913c13ed0492339 (2026-11-08). Do not edit; re-copy and update this line.` 아래가 원본과 바이트 단위로 같아야 한다. `model.ts`의 `import {parseEmphasis} from '../lib/emphasis'`는 디렉터리 구조를 같게 두어 그대로 유효하게 한다.
- 사용자 폴더(`~/.byheart`)에서 확장이 쓰는 파일은 `records/` 아래뿐이다. 삭제·덮어쓰기 기능 없음. 디렉터리 생성은 허용.
- 기록 쓰기는 같은 디렉터리의 임시 파일 → `rename`이며 revision 비교로 3회 재시도한다(6.2).
- 비교 옵션은 `defaultDiffOptions`(대소문자·구두점·공백 무시) 고정. 정답 확인 화면은 `answerDiff`(엄격).
- 웹뷰 CSP: `default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}'; font-src ${cspSource}; img-src ${cspSource}`. 인라인 스크립트·스타일 없음. 본문은 `textContent`로만 넣는다.
- 모든 UI 문자열은 `src/webview/i18n.ts`의 ko/en 표를 거친다. `vscode.env.language`가 `ko`로 시작하면 ko.
- Vitest 환경은 `node`. 테스트는 `tests/**/*.test.ts`. 커밋은 작업마다 한다. 검증 명령을 실행하지 못한 항목은 "미확인"으로 보고한다.

## Review Focus

- **CRLF와 BOM이 있는 `.byheart.json`/`.txt`(Windows에서 만든 파일).** 파싱되어야 하며 본문에 `\r`이 남지 않아야 한다. → Task 3 `parseTxt` 테스트 "BOM·CRLF를 제거한다"와 Task 3 `cardsFromByheartJson` 테스트 "BOM이 있어도 파싱한다".
- **교재 폴더 안의 하위 폴더·숨김 파일·다른 확장자(`.md`, `.DS_Store`).** 챕터로 보이지 않아야 한다. → Task 4 `listChapters` 테스트 "다른 확장자와 하위 폴더를 무시한다".
- **기록 파일이 손상된 JSON일 때.** 덮어쓰지 않고 `error`를 보내며 세션은 메모리에서 진행한다. → Task 5 `RecordStore.apply` 테스트 "손상된 파일은 덮어쓰지 않고 RecordCorruptError를 던진다".
- **현재 챕터 파일이 연습 중 수정되어 현재 카드 ID가 사라졌을 때.** 같은 순번 또는 첫 카드로 가고 다른 카드의 입력은 유지된다. → Task 6 `reduce` 테스트 "chapterReplaced: 사라진 카드는 같은 순번으로, 남은 카드 입력은 유지".
- **설명 카드만 있는 챕터.** 완료 화면은 보이되 `addRound`가 생기지 않는다. → Task 6 `roundSummary` 테스트 "학습 카드가 없으면 null".

---

### Task 1: 프로젝트 골격과 빈 확장

**Files:**
- Create: `package.json`, `package.nls.json`, `package.nls.ko.json`, `tsconfig.base.json`, `tsconfig.json`(호스트), `src/webview/tsconfig.json`, `esbuild.mjs`, `vitest.config.ts`, `.vscodeignore`, `.gitignore`, `LICENSE`, `CHANGELOG.md`
- Create: `src/extension/main.ts`, `src/extension/statusbar.ts`, `src/webview/main.ts`(빈 진입점)
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: `npm run build` → `dist/extension.js`(cjs, node, external `vscode`)와 `dist/webview.js`(iife, browser). `npm test` → Vitest. `npm run typecheck` → `tsc --noEmit -p tsconfig.json && tsc --noEmit -p src/webview/tsconfig.json`. 호스트 `activate(context)`는 `statusbar.createStatusBar(context): vscode.StatusBarItem`를 호출해 `$(book) ByHeart` 항목(우측, command `byheart.start`)을 띄우고 명령 `byheart.start`·`byheart.openFolder`를 등록한다(본문은 Task 8에서 채운다).

- [ ] **Step 1: `npm init`과 개발 의존성 설치**

Run:
```bash
npm init -y
npm install -D typescript esbuild vitest @types/node @types/vscode @vscode/vsce
```
`engines.vscode`는 `npm view @types/vscode version`의 `major.minor`에서 minor를 1 내린 `^1.<minor>.0`으로 쓰고 `@types/vscode`를 같은 minor로 맞춘다. 선택한 값을 README(Task 11)에 적는다.

- [ ] **Step 2: `package.json` 작성**

Global Constraints의 필드에 더해 `publisher: "byheart-placeholder"`, `description: "Memorize sentences by typing them, inside VS Code."`, `main: "./dist/extension.js"`, `categories: ["Education", "Other"]`, `capabilities: { untrustedWorkspaces: { supported: true }, virtualWorkspaces: false }`, `contributes.commands`(`byheart.start` → `%command.start%`, `byheart.openFolder` → `%command.openFolder%`), `contributes.configuration`(`byheart.folder`: string, default `""`, scope `machine`, `%config.folder%`; `byheart.showWpm`: boolean, default `true`, `%config.showWpm%`), scripts: `build`(`node esbuild.mjs`), `watch`(`node esbuild.mjs --watch`), `typecheck`, `test`(`vitest run`), `test:integration`(Task 8), `core:check`(Task 2), `package`(`npm run typecheck && npm run build && vsce package`), `dev:webview`(Task 7). `package.nls.json`에 영어, `package.nls.ko.json`에 한국어 문구("ByHeart: Start Practice"/"ByHeart: 연습 시작", "ByHeart: Open Books Folder"/"ByHeart: 교재 폴더 열기", 설정 설명 두 개).

- [ ] **Step 3: tsconfig·esbuild·vitest 설정**

`tsconfig.base.json`: `strict`, `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `isolatedModules`, `noEmit`. `tsconfig.json`: base 확장, `lib: ["ES2022"]`, `types: ["node"]`, include `src/extension`, `src/shared`, `src/core`, `tests`, `scripts`. `src/webview/tsconfig.json`: base 확장, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `types: []`, include `src/webview`, `src/shared`, `src/core`. `esbuild.mjs`: 진입점 둘(`src/extension/main.ts` → `dist/extension.js`, platform node, format cjs, external `vscode`, target node20; `src/webview/main.ts` → `dist/webview.js`, platform browser, format iife, target chrome120), `--watch` 플래그 처리, 개발 빌드에서만 sourcemap. `vitest.config.ts`: `test.include: ['tests/**/*.test.ts']`, `environment: 'node'`.

- [ ] **Step 4: 빈 확장 작성**

`src/extension/statusbar.ts`: `export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem` — `StatusBarAlignment.Right`, 우선순위 100, text `$(book) ByHeart`, tooltip은 i18n 없이 영어 "ByHeart: practice a chapter", command `byheart.start`, `show()`, `context.subscriptions`에 추가. `src/extension/main.ts`: `export function activate(context)`에서 상태바 생성과 두 명령 등록(임시 본문은 `vscode.window.showInformationMessage('ByHeart')`), `export function deactivate() {}`. `src/webview/main.ts`는 `document.body.dataset.ready = 'true'` 한 줄.

- [ ] **Step 5: smoke 테스트 작성**

```ts
// tests/smoke.test.ts
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
describe('package.json', () => {
  it('keeps the local-only contract', () => {
    expect(pkg.extensionKind).toEqual(['ui']);
    expect(pkg).not.toHaveProperty('browser');
    expect(pkg.contributes).not.toHaveProperty('keybindings');
    expect(pkg.license).toBe('MIT');
    expect(pkg.name).toBe('byheart');
  });
});
```
`tsconfig.json`에 `resolveJsonModule: true`.

- [ ] **Step 6: 빌드·타입·테스트 실행**

Run: `npm run build && npm run typecheck && npm test`
Expected: `dist/extension.js`·`dist/webview.js` 생성, 타입 오류 0, 테스트 1 passed.

- [ ] **Step 7: `.vscodeignore`·`.gitignore`·LICENSE·CHANGELOG, 커밋**

`.vscodeignore`: `src/**`, `tests/**`, `scripts/**`, `dev/**`, `docs/**`, `node_modules/**`, `tsconfig*.json`, `esbuild.mjs`, `vitest.config.ts`, `.vscode-test/**`, `**/*.map`. `.gitignore`: `node_modules/`, `dist/`, `.vscode-test/`, `*.vsix`. `LICENSE`: MIT, 저작권자 `sshim`. `CHANGELOG.md`: `## 0.1.0 (unreleased)`.

```bash
git add -A && git commit -m "chore: scaffold the byheart extension with esbuild and vitest"
```

### Task 2: 웹앱 핵심 모듈 복사와 동일성 검사

**Files:**
- Create: `src/core/lib/{hints,live-diff,diff,answer-diff,emphasis,sentences,content-types}.ts`, `src/core/review/model.ts`
- Create: `tests/core/{hints-diff,live-diff,answer-diff,emphasis}.test.ts`(웹앱 `tests/` 복사, import 경로만 `../../src/core/lib/...`로 변경)
- Create: `scripts/check-core.mjs`
- Modify: `package.json`(zod 의존성, `core:check` 스크립트)

**Interfaces:**
- Produces: 웹앱과 같은 export — `recallCue(text)`, `turnUnits(item): SentenceUnit[]`, `parseEmphasis(source)`, `createLiveComparator(expected, options)`, `liveDiff`, `answerDiff(expected, actual): AnswerDiff`, `defaultDiffOptions`, `parseReviewDocument(value): ReviewDocument`, 타입 `Item`·`Line`·`EmphasisRange`·`LiveDiff`·`LiveHint`·`AnswerPart`·`ReviewTurn`.

- [ ] **Step 1: zod 설치**

Run: `npm install zod@^4`

- [ ] **Step 2: 여덟 파일 복사와 헤더 추가**

```bash
mkdir -p src/core/lib src/core/review
for f in hints live-diff diff answer-diff emphasis sentences content-types; do
  { echo "// Copied from ../byheart src/lib/$f.ts at commit 0ee9eaa78e40d6aded17d1d27913c13ed0492339 (2026-11-08). Do not edit; re-copy and update this line."; cat ../byheart/src/lib/$f.ts; } > src/core/lib/$f.ts
done
{ echo "// Copied from ../byheart src/review/model.ts at commit 0ee9eaa78e40d6aded17d1d27913c13ed0492339 (2026-11-08). Do not edit; re-copy and update this line."; cat ../byheart/src/review/model.ts; } > src/core/review/model.ts
```
`../byheart`의 현재 HEAD가 `0ee9eaa`인지 `git -C ../byheart rev-parse HEAD`로 먼저 확인한다. 다르면 멈추고 보고한다.

- [ ] **Step 3: 웹앱 테스트 네 개 복사**

`../byheart/tests/{hints-diff,live-diff,answer-diff,emphasis}.test.ts`를 `tests/core/`로 복사하고 `'../src/lib/x'` → `'../../src/core/lib/x'`만 바꾼다.

- [ ] **Step 4: 테스트와 타입 검사 실행**

Run: `npm test -- tests/core && npm run typecheck`
Expected: 네 파일 모두 passed(웹앱과 같은 테스트 수), 타입 오류 0. `Intl.Segmenter`가 Node 24에서 동작함을 이 통과로 확인한다.

- [ ] **Step 5: `scripts/check-core.mjs` 작성**

헤더 줄의 경로·커밋을 파싱해 `../byheart/<path>`가 있으면 첫 줄을 뗀 본문과 바이트 비교한다. 출력: 파일별 `same`/`DIFFERS`와 기록된 커밋, `../byheart`가 없으면 `skipped: ../byheart not found` 후 종료 코드 0. 하나라도 `DIFFERS`면 종료 코드 1. `package.json`에 `"core:check": "node scripts/check-core.mjs"`.

- [ ] **Step 6: 검사 실행**

Run: `npm run core:check`
Expected: 8 `same`, 종료 코드 0.

- [ ] **Step 7: 커밋**

```bash
git add -A && git commit -m "feat: copy byheart core modules and tests from 0ee9eaa"
```

### Task 3: 공유 타입과 콘텐츠 어댑터

**Files:**
- Create: `src/shared/types.ts`, `src/shared/protocol.ts`
- Create: `src/extension/adapters/byheart-json.ts`, `src/extension/adapters/txt.ts`, `src/extension/adapters/index.ts`
- Test: `tests/adapters/byheart-json.test.ts`, `tests/adapters/txt.test.ts`, `tests/fixtures/day1.byheart.json`, `tests/fixtures/audio.byheart.json`, `tests/fixtures/poem.txt`

**Interfaces:**
- Consumes: Task 2의 `parseReviewDocument`, `parseEmphasis`, `turnUnits`, 타입 `Item`·`Line`.
- Produces (`src/shared/types.ts`):
```ts
export interface ChapterRef { bookId: string; chapterId: string }
export interface PracticeCard { id: string; kind: 'study' | 'explanation'; speaker: string; section?: string; text: string; emphasis?: EmphasisRange[]; translation?: string; explanation?: string }
export interface PracticeChapter { ref: ChapterRef; bookTitle: string; title: string; format: 'byheart.json' | 'txt'; readOnly: boolean; cards: PracticeCard[] }
export type RoundMode = 'typing' | 'hint' | 'mixed';
export interface RoundRecord { mode: RoundMode; startedAt: string; finishedAt: string; cards: number; total: number; accuracy: number | null; averageWpm: number | null }
export interface ChapterRecord { schemaVersion: 1; book: string; chapter: string; revision: number; updatedAt: string; position: { cardId: string } | null; marks: Record<string, { difficult: boolean; at: string }>; rounds: RoundRecord[] }
export type RecordOp = { op: 'setMark'; cardId: string; difficult: boolean } | { op: 'setPosition'; cardId: string } | { op: 'addRound'; round: RoundRecord };
export interface Settings { showWpm: boolean }
export interface Preferences { mode: 'typing' | 'hint'; showTranslation: boolean }
export interface Navigation { hasPrevious: boolean; hasNext: boolean }
```
- Produces (`src/shared/protocol.ts`): `HostMessage` = `{type:'init'; chapter; record: ChapterRecord; settings; preferences; locale: 'ko'|'en'; navigation}`(기록 파일이 손상되었으면 호스트가 `error`와 함께 빈 기록을 보낸다) | `{type:'chapter'; chapter; record; navigation}` | `{type:'record'; record}` | `{type:'settings'; settings}` | `{type:'error'; message}`. `WebviewMessage` = `{type:'ready'; chapterRef?: ChapterRef}` | `{type:'apply'; ops: RecordOp[]}` | `{type:'navigate'; to:'next'|'restart'|'pick'}` | `{type:'preferences'; preferences: Partial<Preferences>}` | `{type:'openFolder'}`.
- Produces (adapters): `cardsFromByheartJson(text: string): PracticeCard[]`(실패 시 `Error`, 메시지는 zod 첫 issue를 `turns[3].text: …` 형식 한 줄로), `toItem(doc: ReviewDocument, chapterId: string, bookId: string): { item: Item; extras: Map<string, { translation?: string; explanation?: string }> }`, `parseTxt(text: string): { title?: string; cards: PracticeCard[] }`(카드 0개면 `Error('빈 파일')`), `loadChapter(args: { ref: ChapterRef; bookTitle: string; readOnly: boolean; text: string }): PracticeChapter`(`chapterId`가 `.byheart.json`으로 끝나면 json, `.txt`면 txt, 그 외 `Error`; `title`은 확장자를 뺀 파일명이며 txt의 `# 제목`은 쓰지 않는다 — 제목 표시는 QuickPick description 전용, Task 4).

- [ ] **Step 1: 픽스처 작성**

`day1.byheart.json`: 탐색 문서 6.3의 최소 문서에 turn 3개 — `kind` 없음(study, `text: "The **only** way out is through."`, translation·explanation 있음), `kind: 'explanation'`(`text: "Section note"`, `section: "Part 1"`), study(`section: "Part 1"`, translation 없음). `audio.byheart.json`: `source.kind: 'audio'`, `srtText`·`srtSha256`(64자 hex)·`audioSize`·`audioLastModified`, turn 2개 모두 `startMs`/`endMs`. `poem.txt`: `# Ozymandias`, 빈 줄, 3개 단락(둘째 단락은 두 줄, 셋째는 첫째와 같은 본문), CRLF와 BOM 포함.

- [ ] **Step 2: 실패하는 어댑터 테스트 작성**

```ts
// tests/adapters/byheart-json.test.ts
it('turn을 2.2 규칙으로 카드로 만든다', () => {
  const cards = cardsFromByheartJson(read('day1.byheart.json'));
  expect(cards.map(c => c.kind)).toEqual(['study', 'explanation', 'study']);
  expect(cards[0]).toMatchObject({ text: 'The only way out is through.', emphasis: [{ start: 4, end: 8, kind: 'bold' }], translation: '유일한 출구는 통과하는 것이다.' });
  expect(cards[0].explanation).toContain('way out');
  expect(cards[1].section).toBe('Part 1');
  expect(cards[2]).not.toHaveProperty('translation');
});
it('음원 문서도 열리며 시각은 버린다', () => { expect(cardsFromByheartJson(read('audio.byheart.json'))).toHaveLength(2); expect(JSON.stringify(cardsFromByheartJson(read('audio.byheart.json')))).not.toContain('startMs'); });
it('BOM이 있어도 파싱한다', () => { expect(cardsFromByheartJson('﻿' + read('day1.byheart.json'))).toHaveLength(3); });
it('스키마 오류는 경로와 첫 문제를 한 줄로 알린다', () => { expect(() => cardsFromByheartJson('{"schemaVersion":1}')).toThrow(/documentId/); });
it('toItem은 Line 필드를 채운다', () => { const { item } = toItem(parseReviewDocument(JSON.parse(read('day1.byheart.json'))), 'Day 1.byheart.json', 'book'); expect(item.lines[0]).toMatchObject({ seq: 1, english: 'The only way out is through.', korean: '유일한 출구는 통과하는 것이다.' }); expect(item.type).toBe('passage'); });
```
```ts
// tests/adapters/txt.test.ts
it('빈 줄 단락 = 카드, # 첫 줄 = 제목, BOM·CRLF를 제거한다', () => {
  const { title, cards } = parseTxt(read('poem.txt'));
  expect(title).toBe('Ozymandias'); expect(cards).toHaveLength(3);
  expect(cards[1].text).toMatch(/\n/); expect(cards[1].text).not.toMatch(/\r/);
  expect(cards[0]).toMatchObject({ kind: 'study', speaker: '' }); expect(cards[0]).not.toHaveProperty('emphasis');
});
it('카드 ID는 본문 sha256 앞 16자이고 중복 본문은 -2를 붙인다', () => {
  const { cards } = parseTxt('a\n\na');
  expect(cards[0].id).toBe(createHash('sha256').update('a').digest('hex').slice(0, 16));
  expect(cards[1].id).toBe(cards[0].id + '-2');
});
it('제목이 아닌 # 줄은 본문이고 ** 는 해석하지 않는다', () => { const { cards } = parseTxt('x\n\n# not title\n\n**bold**'); expect(cards[1].text).toBe('# not title'); expect(cards[2].text).toBe('**bold**'); });
it('카드가 없으면 빈 파일 오류', () => { expect(() => parseTxt('# only title\n\n')).toThrow('빈 파일'); });
it('loadChapter는 확장자로 형식을 고른다', () => { expect(loadChapter({ ref: { bookId: 'b', chapterId: 'Day 1.byheart.json' }, bookTitle: 'b', readOnly: false, text: read('day1.byheart.json') })).toMatchObject({ format: 'byheart.json', title: 'Day 1' }); expect(() => loadChapter({ ref: { bookId: 'b', chapterId: 'x.md' }, bookTitle: 'b', readOnly: false, text: '' })).toThrow(); });
```

- [ ] **Step 3: 실패 확인**

Run: `npm test -- tests/adapters`
Expected: FAIL, 모듈 없음.

- [ ] **Step 4: `types.ts`·`protocol.ts`·어댑터 구현**

`toItem`은 설계 2.2의 표를 그대로 적용한다. `cardsFromByheartJson`은 BOM 제거 → `JSON.parse` → `parseReviewDocument` → `toItem` → `turnUnits(item)` → 각 unit에 `extras`의 translation/explanation을 붙인다(`undefined`는 키 생략). zod 오류는 `ZodError.issues[0]`의 `path.join('.')`와 `message`로 한 줄을 만든다. `parseTxt`의 ID는 `node:crypto`의 `createHash('sha256')`.

- [ ] **Step 5: 통과 확인과 커밋**

Run: `npm test -- tests/adapters && npm run typecheck`
Expected: 모두 PASS.
```bash
git add -A && git commit -m "feat: add shared types, protocol, and content adapters"
```

### Task 4: 교재 폴더 스캔과 내장 교재

**Files:**
- Create: `src/extension/library.ts`, `src/extension/builtin.ts`, `src/extension/settings.ts`
- Test: `tests/library.test.ts`

**Interfaces:**
- Consumes: Task 3 `loadChapter`, `parseTxt`(txt 제목용).
- Produces:
```ts
// settings.ts
export function resolveRoot(folderSetting: string, homedir: string): string  // '' → <home>/.byheart, '~/x' → <home>/x, 상대 → <home>/<rel>, 절대 → 그대로
// library.ts
export interface BookEntry { id: string; title: string; dir: string; readOnly: boolean }
export interface ChapterEntry { ref: ChapterRef; title: string; description?: string; error?: string }
export const compareNames: (a: string, b: string) => number  // Intl.Collator('en',{numeric:true,sensitivity:'variant'}) on NFC, tie → codepoint
export async function ensureLayout(root: string): Promise<void>  // mkdir -p books, records
export async function listBooks(root: string, builtin: BookEntry[]): Promise<BookEntry[]>  // builtin 먼저, 그다음 books/ 하위 폴더(`.`시작 제외) compareNames 순
export async function listChapters(book: BookEntry): Promise<ChapterEntry[]>  // *.byheart.json | *.txt, 하위 폴더·기타 무시, 읽기 실패는 error에 메시지
export async function readChapter(book: BookEntry, chapterId: string): Promise<PracticeChapter>
export function neighbors(chapters: ChapterEntry[], chapterId: string): { previous?: ChapterEntry; next?: ChapterEntry }  // error 없는 챕터만 대상
// builtin.ts
export function builtinBooks(extensionPath: string): BookEntry[]  // [{ id: '.builtin/quotes', title: 'Quotes', dir: <ext>/content/quotes, readOnly: true }]
```

- [ ] **Step 1: 실패하는 테스트 작성**

임시 폴더(`fs.mkdtemp`)에 `books/alpha/{2.txt,10.txt,1.byheart.json,notes.md,sub/x.txt,.hidden.txt}`, `books/.cache/x.txt`, `books/empty/`를 만든다.

```ts
it('resolveRoot', () => { expect(resolveRoot('', '/h')).toBe('/h/.byheart'); expect(resolveRoot('~/b', '/h')).toBe('/h/b'); expect(resolveRoot('rel', '/h')).toBe('/h/rel'); expect(resolveRoot('/abs', '/h')).toBe('/abs'); });
it('compareNames는 숫자순', () => { expect(['10', '2', '1'].sort(compareNames)).toEqual(['1', '2', '10']); });
it('listBooks는 내장 교재를 먼저, 점 폴더를 제외하고, 빈 폴더도 포함한다', async () => { const books = await listBooks(root, builtinBooks(ext)); expect(books.map(b => b.id)).toEqual(['.builtin/quotes', 'alpha', 'empty']); });
it('listChapters는 다른 확장자와 하위 폴더를 무시한다', async () => { const ch = await listChapters(alpha); expect(ch.map(c => c.ref.chapterId)).toEqual(['1.byheart.json', '2.txt', '10.txt']); expect(ch[0].title).toBe('1'); });
it('읽기 실패는 error로 남기고 목록에서 빼지 않는다', async () => { /* 1.byheart.json을 '{}'로 두었을 때 */ expect(ch[0].error).toMatch(/schemaVersion/); });
it('txt의 # 제목은 description에 들어간다', async () => { /* 2.txt = '# Two\n\nx' */ expect(ch[1].description).toBe('Two'); });
it('neighbors는 error 챕터를 건너뛴다', () => { expect(neighbors(ch, '2.txt')).toMatchObject({ next: { ref: { chapterId: '10.txt' } } }); expect(neighbors(ch, '2.txt').previous).toBeUndefined(); });
it('ensureLayout은 books/와 records/를 만들고 파일은 쓰지 않는다', async () => { /* readdir 결과가 정확히 두 디렉터리 */ });
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/library`
Expected: FAIL.

- [ ] **Step 3: 구현**

`listChapters`는 `fs.readdir(dir, { withFileTypes: true })`에서 `isFile()`이고 이름이 `.byheart.json` 또는 `.txt`로 끝나며 `.`으로 시작하지 않는 것만 고른다. 각 파일을 읽어 `loadChapter`로 검증하고, 실패하면 `error`에 메시지 첫 줄을 둔다. txt는 `parseTxt(...).title`을 `description`으로. 파일은 모두 `utf8`로 읽는다.

- [ ] **Step 4: 통과 확인과 커밋**

Run: `npm test -- tests/library && npm run typecheck`
```bash
git add -A && git commit -m "feat: scan ~/.byheart books and chapters with built-in quotes entry"
```

### Task 5: 기록 저장소

**Files:**
- Create: `src/extension/records.ts`
- Test: `tests/records.test.ts`

**Interfaces:**
- Consumes: Task 3 `ChapterRecord`, `RecordOp`, `ChapterRef`.
- Produces:
```ts
export function recordPath(root: string, ref: ChapterRef): string           // <root>/records/<bookId>/<chapterId>.json
export function emptyRecord(ref: ChapterRef): ChapterRecord                 // revision 0, position null, marks {}, rounds []
export function applyOps(record: ChapterRecord, ops: RecordOp[], now: string): ChapterRecord  // 순수, revision + 1, updatedAt = now
export class RecordCorruptError extends Error { constructor(public path: string, cause: unknown) }
export class RecordConflictError extends Error {}                           // 3회 재시도 실패
export class RecordStore {
  constructor(root: string, now: () => string = () => new Date().toISOString())
  load(ref: ChapterRef): Promise<ChapterRecord>                             // 없으면 emptyRecord, 손상이면 RecordCorruptError
  apply(ref: ChapterRef, ops: RecordOp[]): Promise<ChapterRecord>           // 6.2 알고리즘
}
```

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('applyOps: setMark false는 키를 지우지 않는다', () => { const r = applyOps(applyOps(emptyRecord(ref), [{ op: 'setMark', cardId: 'a', difficult: true }], t1), [{ op: 'setMark', cardId: 'a', difficult: false }], t2); expect(r.marks.a).toEqual({ difficult: false, at: t2 }); expect(r.revision).toBe(2); });
it('applyOps: setPosition과 addRound', () => { /* position {cardId}, rounds.length 1, revision 1 */ });
it('load는 파일이 없으면 빈 기록', async () => { expect(await store.load(ref)).toMatchObject({ revision: 0, book: ref.bookId, chapter: ref.chapterId }); });
it('apply는 파일을 만들고 revision을 올리며 임시 파일을 남기지 않는다', async () => { await store.apply(ref, [setMark]); const dir = await fs.readdir(dirname(recordPath(root, ref))); expect(dir).toEqual([`${ref.chapterId}.json`]); expect(JSON.parse(await fs.readFile(recordPath(root, ref), 'utf8')).revision).toBe(1); });
it('두 저장소가 번갈아 써도 두 연산이 모두 남는다', async () => { const a = new RecordStore(root), b = new RecordStore(root); await Promise.all([a.apply(ref, [{ op: 'setMark', cardId: 'x', difficult: true }]), b.apply(ref, [{ op: 'setMark', cardId: 'y', difficult: true }])]); const r = await a.load(ref); expect(Object.keys(r.marks).sort()).toEqual(['x', 'y']); expect(r.revision).toBe(2); });
it('손상된 파일은 덮어쓰지 않고 RecordCorruptError를 던진다', async () => { await fs.writeFile(path, '{not json'); await expect(store.apply(ref, [setMark])).rejects.toBeInstanceOf(RecordCorruptError); expect(await fs.readFile(path, 'utf8')).toBe('{not json'); });
it('내장 교재의 기록 경로', () => { expect(recordPath('/r', { bookId: '.builtin/quotes', chapterId: '01.byheart.json' })).toBe('/r/records/.builtin/quotes/01.byheart.json.json'); });
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/records`
Expected: FAIL.

- [ ] **Step 3: 구현**

`apply`: 최대 3회 — `load` → `applyOps` → `mkdir -p` → 임시 파일 `<final>.<pid>-<random 8 hex>.tmp`에 `JSON.stringify(next, null, 2) + '\n'`을 `fs.open`/`writeFile`/`fsync`로 쓰고 → 최종 파일을 다시 읽어 revision이 `current.revision`과 같으면(또는 없으면) `fs.rename(tmp, final)`, 다르면 tmp 삭제 후 재시도 → 3회 실패 시 `RecordConflictError`. 손상 파일은 `load`에서 `RecordCorruptError`로 던지고 쓰지 않는다. 동시성 테스트가 간헐적으로 실패하면 재시도 전 0~20ms 무작위 대기를 넣는다.

- [ ] **Step 4: 통과 확인과 커밋**

Run: `npm test -- tests/records && npm run typecheck`
```bash
git add -A && git commit -m "feat: store chapter records atomically with revision retry"
```

### Task 6: 웹뷰 로직 (WPM·정확도·연습 상태)

**Files:**
- Create: `src/webview/logic/wpm.ts`, `src/webview/logic/accuracy.ts`, `src/webview/logic/reducer.ts`
- Test: `tests/webview/wpm.test.ts`, `tests/webview/accuracy.test.ts`, `tests/webview/reducer.test.ts`

**Interfaces:**
- Consumes: Task 2 `answerDiff`, `AnswerDiff`; Task 3 타입.
- Produces:
```ts
// wpm.ts
export function wpm(chars: number, elapsedMs: number): number | null         // elapsedMs <= 0 또는 chars 0 → null, 아니면 Math.round((chars/5) / (elapsedMs/60000))
export function averageWpm(cards: { chars: number; elapsedMs: number }[]): number | null  // 시간 가중, 빈 배열 → null
// accuracy.ts
export function cardAccuracy(expected: string, input: string): number | null  // answerDiff 기반, limited → null, 1 − 오류 문자소/원문 문자소, 소수 3자리, 0 이상
export function roundAccuracy(values: (number | null)[]): number | null       // null 제외 평균, 소수 3자리, 전부 null → null
// reducer.ts
export type Stage = 'input' | 'checked';
export interface CardState { stage: Stage; input: string; mode: 'typing' | 'hint'; startedAt: number | null; elapsedMs: number; checkedMode?: 'typing' | 'hint'; accuracy?: number | null; chars?: number }
export interface PracticeState { chapter: PracticeChapter; record: ChapterRecord; prefs: Preferences; settings: Settings; index: number; cards: CardState[]; roundStartedAt: string; finished: boolean }
export type Action =
  | { type: 'input'; value: string; now: number } | { type: 'check'; now: number } | { type: 'reveal' }
  | { type: 'next' } | { type: 'previous' } | { type: 'reset' } | { type: 'toggleMark' }
  | { type: 'setMode'; mode: 'typing' | 'hint' } | { type: 'toggleTranslation' }
  | { type: 'restart'; nowIso: string } | { type: 'recordReplaced'; record: ChapterRecord }
  | { type: 'chapterReplaced'; chapter: PracticeChapter } | { type: 'settings'; settings: Settings }
export function initialState(chapter, record, prefs, settings, nowIso: string): PracticeState  // index = record.position의 카드(없으면 0), 설명 카드는 stage 'checked'
export function reduce(state: PracticeState, action: Action): { state: PracticeState; ops: RecordOp[]; prefs?: Partial<Preferences> }
export function roundSummary(state: PracticeState, finishedAt: string): RoundRecord | null  // 학습 카드가 없으면 null
export function serialize(state: PracticeState): unknown; export function restore(raw: unknown): PracticeState | null
```

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// wpm.test.ts
expect(wpm(50, 60000)).toBe(10); expect(wpm(0, 1000)).toBeNull(); expect(wpm(10, 0)).toBeNull();
expect(averageWpm([{ chars: 50, elapsedMs: 60000 }, { chars: 100, elapsedMs: 60000 }])).toBe(15); expect(averageWpm([])).toBeNull();
// accuracy.test.ts
expect(cardAccuracy('Hello, world.', 'Hello, world.')).toBe(1);
expect(cardAccuracy('abcd', 'abXd')).toBe(0.75);          // changed 1 of 4
expect(cardAccuracy('abcd', 'Abcd')).toBe(0.75);          // 대소문자도 오류(엄격)
expect(cardAccuracy('ab', 'abcdefgh')).toBe(0);           // extra 6 → 음수 → 0
expect(cardAccuracy('x'.repeat(10001), 'x')).toBeNull();  // limited
expect(roundAccuracy([1, 0.5, null])).toBe(0.75); expect(roundAccuracy([null])).toBeNull();
// reducer.test.ts (챕터: study A, explanation E, study B)
it('input은 첫 글자에 타이머를 시작하고 check에 멈춘다', ...);           // startedAt = now, check 후 elapsedMs = 차이, chars = input.length, accuracy 계산
it('check 후 next는 setPosition op을 내고 설명 카드는 바로 checked', ...);
it('마지막 카드 check 후 next는 finished=true', ...);
it('roundSummary: 카드 수·total·시간 가중 WPM·평균 정확도', ...);         // cards 2, total 2, mode 'typing'
it('roundSummary: 중간부터 이어 하면 cards < total', ...);               // initialState에 position=B → cards 1, total 2
it('roundSummary: 학습 카드가 없으면 null', ...);
it('roundSummary: 모드가 섞이면 mixed, averageWpm은 타이핑 카드만', ...);
it('showWpm이 꺼져 있으면 averageWpm null, accuracy는 기록', ...);
it('setMode는 현재 카드만 비우고 다른 카드는 유지하며 prefs를 낸다', ...);
it('toggleMark는 setMark op을 내고 기록이 돌아오면 recordReplaced로 반영', ...);
it('previous 후 다시 check하면 마지막 시도만 남는다', ...);
it('restart는 index 0, 새 roundStartedAt, setPosition(첫 카드) op', ...);
it('chapterReplaced: 사라진 카드는 같은 순번으로, 남은 카드 입력은 유지', ...);
it('serialize/restore 왕복', ...);
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/webview`
Expected: FAIL.

- [ ] **Step 3: 구현**

`reduce`는 순수 함수다. `check`는 `input` 단계의 타이핑 카드에서만 `accuracy`·`chars`·`elapsedMs`를 확정하고 `checkedMode = 'typing'`; 힌트 모드의 `reveal`은 `checkedMode = 'hint'`, accuracy·chars 없음. `next`는 `index + 1`(마지막이면 `finished = true`)과 `setPosition` op. `settings.showWpm === false`면 `chars`·`elapsedMs`를 기록하지 않는다. `roundSummary`의 `cards`는 `checkedMode`가 있는 학습 카드 수, `total`은 학습 카드 수, `mode`는 checkedMode 집합이 하나면 그 값, 둘이면 `'mixed'`. `chapterReplaced`는 카드 ID로 `CardState`를 재배치하고 현재 카드 ID가 없으면 `min(index, cards.length - 1)`.

- [ ] **Step 4: 통과 확인과 커밋**

Run: `npm test -- tests/webview && npm run typecheck`
```bash
git add -A && git commit -m "feat: add webview practice reducer with wpm and accuracy"
```

### Task 7: 웹뷰 UI와 개발 하네스

**Files:**
- Create: `src/webview/main.ts`(교체), `src/webview/view.ts`, `src/webview/live-textarea.ts`, `src/webview/answer-view.ts`, `src/webview/explanation-view.ts`, `src/webview/i18n.ts`, `src/webview/vscode-api.ts`
- Create: `media/webview.css`, `dev/harness.html`, `dev/harness.js`, `dev/sample-chapter.json`, `dev/serve.mjs`
- Test: `tests/webview/i18n.test.ts`, `tests/webview/perf.test.ts`
- Modify: `package.json`(`dev:webview` 스크립트)

**Interfaces:**
- Consumes: Task 6 전체, Task 2 `createLiveComparator`·`recallCue`·`answerDiff`·`parseEmphasis`, Task 3 `HostMessage`·`WebviewMessage`.
- Produces:
```ts
// vscode-api.ts
export const api: { postMessage(m: WebviewMessage): void; getState(): unknown; setState(s: unknown): void }   // acquireVsCodeApi() 래퍼; 없으면 window.__byheartHarness 사용
// i18n.ts
export type Locale = 'ko' | 'en'; export function t(locale: Locale, key: Key, vars?: Record<string, string | number>): string
// live-textarea.ts
export class LiveTextarea { constructor(host: HTMLElement, handlers: { onInput(value: string): void; onEnter(): void }); setExpected(text: string): void; setValue(value: string): void; setCue(cue: string): void; focus(): void; get composing(): boolean }
// answer-view.ts
export function renderAnswer(host: HTMLElement, expected: string, input: string, emphasis: EmphasisRange[] | undefined, locale: Locale): void  // same/detail/changed 클래스, extra 취소선, limited 안내
// explanation-view.ts
export function renderExplanation(host: HTMLElement, text: string): void   // '- ' 줄은 <ul><li>, 나머지는 <p>, 강조는 parseEmphasis로 <strong>/<em>
// view.ts
export class PracticeView { constructor(root: HTMLElement, locale: Locale); setState(state: PracticeState, navigation: Navigation): void; onAction(cb: (a: Action) => void): void; onNavigate(cb: (to: 'next' | 'restart' | 'pick') => void): void }
```

- [ ] **Step 1: i18n 테스트와 표**

```ts
it('모든 키가 두 언어에 있고 변수 치환이 된다', () => { expect(Object.keys(table.ko).sort()).toEqual(Object.keys(table.en).sort()); expect(t('ko', 'position', { n: 3, total: 12 })).toBe('3 / 12'); expect(t('en', 'summary', { cards: 10, accuracy: 92, wpm: 31 })).toBe('Round complete — 10 cards · 92% accuracy · 31 WPM avg'); });
```
키: `check`, `next`, `previous`, `mark`, `marked`, `rewrite`, `rehide`, `reveal`, `translation`, `modeTyping`, `modeHint`, `position`, `wpm`, `summary`, `summaryNoWpm`, `nextChapter`, `restart`, `pickChapter`, `limited`, `extraInput`, `error`, `openFolder`. ko 문구는 설계 7.1의 스케치를 따른다(`한 바퀴 완료 — 카드 {cards} · 정확도 {accuracy}% · 평균 {wpm} WPM`).

- [ ] **Step 2: 성능 테스트(3.3의 기준)**

```ts
// tests/webview/perf.test.ts
it('2,000자 입력의 실시간 비교 1회가 50ms 미만', () => { const expected = 'the quick brown fox jumps over the lazy dog '.repeat(45).trim(); const compare = createLiveComparator(expected, defaultDiffOptions); const actual = expected.slice(0, 2000).replace(/o/g, '0'); const t0 = performance.now(); compare(actual, true); expect(performance.now() - t0).toBeLessThan(50); });
```
Run: `npm test -- tests/webview/perf` → PASS여야 동기 호출 결정이 유지된다. 실패하면 멈추고 보고한다(Blob Worker 전환은 설계 변경).

- [ ] **Step 3: `live-textarea.ts` 구현**

웹앱 `../byheart/src/components/LiveTextarea.tsx`의 구조를 바닐라로 다시 쓴다(복사 아님): `.live-input` 컨테이너 안에 `.focus-input-cue`(힌트 오버레이: 입력 길이만큼 `visibility:hidden` span + 나머지), `.live-highlight`(미러, `data-live-start` span들, `.live-error`, `.live-missing`), `.live-word-hints`(`data-hint-start` span, 위치는 미러의 anchor `getClientRects()[0]`로 계산, 같은 줄 이웃과 겹치지 않게 `maxWidth`), `textarea`. `compositionstart/end`로 `composing` 관리, 조합 중에는 비교·Enter 보류. `input` 이벤트마다 `createLiveComparator(expected)`(expected별 캐시 1개)를 `withHints = true`로 호출. `keydown`: `Enter`이고 `shiftKey/alt/ctrl/meta`·`isComposing`·`keyCode 229`·`repeat`가 아니면 `preventDefault` 후 `onEnter`. `ResizeObserver`·`scroll`로 미러 크기·스크롤 동기화. `limited`면 컨테이너 아래 `.muted` 안내(`t('limited')`).

- [ ] **Step 4: `answer-view.ts`·`explanation-view.ts` 구현**

`renderAnswer`: `answerDiff` 결과의 `parts`를 `<span class="answer-same|answer-detail|answer-changed">`로, `emphasis` 범위는 겹치는 part를 `<strong>/<em>`으로 감싼다(오류 클래스가 우선). `extra`는 `<s class="answer-extra">`. `limited`면 원문만 + 안내. 모든 텍스트는 `textContent`. `renderExplanation`은 웹앱 `ExplanationText.tsx` 규칙.

- [ ] **Step 5: `view.ts`·`main.ts`·CSS 구현**

`PracticeView.setState`는 설계 7.1 스케치의 세 화면(입력·확인·완료)을 그린다. 헤더: `bookTitle · title`, `position`, 해석 토글(어느 카드에도 translation이 없으면 숨김), 모드 토글. 카드: `section`이 이전 카드와 다르면 라벨, `speaker`가 비어 있지 않으면 표시. 입력 단계: `LiveTextarea`에 `setExpected(card.text)`, `setCue(recallCue(card.text))`; WPM 표시는 `settings.showWpm`이고 `startedAt`이 있을 때 500ms 타이머로 `wpm(input.length, now - startedAt)`. 확인 단계: `renderAnswer`, translation(토글 켜짐), `renderExplanation`(있을 때), 버튼 `[미암기] [이전] [다시 쓰기] [다음 ⏎]`. 설명 카드: 본문·해설 바로 표시, `[다음 ⏎]`만. 완료: `t('summary')` 또는 `summaryNoWpm`, 버튼 `[다음 챕터]`(`navigation.hasNext`일 때, 기본) `[처음부터 반복]`(hasNext가 아니면 기본) `[챕터 선택]`; ↑↓로 버튼 포커스 이동. 키: 루트 `keydown`에서 `Alt+Digit1/2/3`(조합 중·repeat 제외) → previous/toggleMark/reset, `Escape`는 checked 단계에서 reset. 포커스 규칙은 설계 7.2. `main.ts`: `api.getState()`로 `restore`, `ready {chapterRef}` 전송, `HostMessage` 수신 → `initialState`/`chapterReplaced`/`recordReplaced`/`settings`, `reduce` 결과의 `ops`는 `apply`로, `prefs`는 `preferences`로 전송, `finished`가 되는 순간 `roundSummary`가 null이 아니면 `addRound` op 전송, 매 상태 변화마다 `api.setState(serialize(state))`. `media/webview.css`는 `--vscode-*` 변수만 쓴다(설계 7.1의 변수 후보).

- [ ] **Step 6: 개발 하네스**

`dev/harness.html`: `<link href="../media/webview.css">`, `<div id="app">`, `<script src="harness.js">`, `<script src="../dist/webview.js">`. `dev/harness.js`: `window.__byheartHarness = { postMessage(m) { 로그 + 'ready'면 init 응답, 'apply'면 applyOps 흉내 후 record 응답, 'navigate'면 로그 }, state: null }`, `init`에는 `dev/sample-chapter.json`(Task 3 픽스처와 같은 구조, 카드 5개: 강조·설명 카드·translation 없는 카드 포함)과 `record: null`, `settings {showWpm:true}`, `preferences {mode:'typing', showTranslation:false}`, `locale 'ko'`, `navigation {hasPrevious:false, hasNext:true}`. `vscode-api.ts`는 `typeof acquireVsCodeApi === 'function'`이면 그것, 아니면 `__byheartHarness`를 쓴다. `dev/serve.mjs`: `node:http`로 저장소 루트를 `127.0.0.1:5179`에 정적 서빙(외부 바인딩 금지). `package.json`: `"dev:webview": "npm run build && node dev/serve.mjs"`.

- [ ] **Step 7: 하네스로 확인**

Run: `npm run dev:webview` 후 브라우저(세션의 브라우저 도구 또는 수동)로 `http://127.0.0.1:5179/dev/harness.html`을 연다. 확인 항목과 기대: (1) 힌트 `recallCue`가 반투명으로 보이고 타이핑한 만큼 가려진다. (2) 오타 글자가 빨갛게, 그 아래 정답 단어가 작게 보인다. (3) Enter로 확인 화면이 뜨고 대소문자 차이는 점선, 틀린 글자는 밑줄, 불필요 입력은 취소선이다. (4) Enter로 다음 카드, 설명 카드는 입력칸 없이 Enter로 넘어간다. (5) 첫 글자 뒤 WPM이 보이고 확인 시 멈춘다. (6) 마지막 카드 뒤 완료 요약과 `addRound` 로그가 보인다. (7) 새로고침 뒤 `getState`로 입력이 복원된다. 한글 IME 조합 보류는 실기기 입력이 필요하므로 **미확인**으로 적는다. 결과를 이 계획 파일의 Task 7 아래에 한 줄로 기록한다.

- [ ] **Step 8: 커밋**

Run: `npm test && npm run typecheck && npm run build`
```bash
git add -A && git commit -m "feat: build the practice webview UI with a browser dev harness"
```

> **Task 7 검증 기록 (2026-11-09):** `npm run dev:webview` 하네스를 Google Chrome(headless, Playwright)으로 자동 조작해 확인했다. (1) `recallCue` 오버레이가 입력 길이만큼 가려짐 ✓ (2) 오타 `powr`가 빨간 밑줄, 아래에 `power` 힌트 ✓ (3) Enter 후 확인 화면: 틀린 글자 밑줄, 대소문자·구두점 차이 점선 ✓ (4) Enter로 다음 카드, 설명 카드는 입력칸 없이 Enter로 넘어감 ✓ (5) 첫 글자 뒤 WPM 표시 ✓ (6) 마지막 카드 뒤 완료 요약과 `addRound` 로그 ✓ (7) 새로고침 뒤 입력·위치 복원 ✓. 2,000자 비교 1회 5~8ms(기준 50ms). 한글 IME 조합 보류와 VS Code 안의 표시는 **미확인**.

### Task 8: 호스트 연결 (패널·QuickPick·설정·감시)

**Files:**
- Create: `src/extension/panel.ts`, `src/extension/picker.ts`, `src/extension/session.ts`
- Modify: `src/extension/main.ts`, `src/extension/statusbar.ts`(툴팁 i18n 없음 유지), `package.json`(`activationEvents`에 `onWebviewPanel:byheart.practice`, `test:integration`)
- Create: `.vscode-test.mjs`, `src/test/extension.test.ts`

**Interfaces:**
- Consumes: Task 4 `listBooks`·`listChapters`·`readChapter`·`neighbors`·`builtinBooks`·`resolveRoot`·`ensureLayout`, Task 5 `RecordStore`, Task 3 프로토콜.
- Produces:
```ts
// picker.ts
export async function pickChapter(root: string, builtin: BookEntry[]): Promise<{ book: BookEntry; chapter: ChapterEntry } | undefined>  // 교재가 하나면 교재 선택 생략, 마지막 항목 '$(folder) Open books folder', error 챕터는 $(warning)+description, 선택 시 showErrorMessage 후 undefined
// session.ts — 현재 챕터·기록·감시를 들고 HostMessage를 만든다
export class PracticeSession { constructor(deps: { root: string; store: RecordStore; builtin: BookEntry[]; post: (m: HostMessage) => void; settings: () => Settings; preferences: () => Preferences; setPreferences: (p: Partial<Preferences>) => Thenable<void>; locale: 'ko' | 'en' }); open(ref: ChapterRef): Promise<void>; handle(m: WebviewMessage): Promise<void>; dispose(): void }
// panel.ts
export class PracticePanel { static show(context, deps): PracticePanel; static revive(panel: vscode.WebviewPanel, context, deps): PracticePanel; open(ref: ChapterRef): void; dispose(): void }  // viewType 'byheart.practice', ViewColumn.Active, retainContextWhenHidden false, localResourceRoots [dist, media], CSP는 Global Constraints
```

- [ ] **Step 1: 통합 테스트 작성(이 PC에서는 실행 미확인)**

```ts
// src/test/extension.test.ts (mocha, @vscode/test-cli)
test('activates and registers commands', async () => { const ext = vscode.extensions.getExtension('byheart-placeholder.byheart')!; await ext.activate(); const cmds = await vscode.commands.getCommands(true); assert.ok(cmds.includes('byheart.start')); assert.ok(cmds.includes('byheart.openFolder')); });
```
`.vscode-test.mjs`: `defineConfig({ files: 'out-test/**/*.test.js' })`; 테스트는 esbuild로 `src/test/**/*.ts` → `out-test/`에 cjs로 번들(`esbuild.mjs`에 `--tests` 모드 추가). `package.json`: `"test:integration": "node esbuild.mjs --tests && vscode-test"`, devDependencies `@vscode/test-cli`, `@vscode/test-electron`, `@types/mocha`, `mocha`.

- [ ] **Step 2: `picker.ts` 구현**

`vscode.window.showQuickPick`을 두 번. 교재 항목 label은 `title`, 내장 교재는 description `built-in`. 챕터 항목 label은 `title`, description은 txt 제목 또는 `$(warning) <error 첫 줄>`. 마지막 항목 선택 시 `vscode.env.openExternal(vscode.Uri.file(<root>/books))`.

- [ ] **Step 3: `session.ts` 구현**

`open(ref)`: `readChapter` → `store.load`(손상이면 `error` 메시지 후 `emptyRecord`로 메모리 진행) → `init` 또는 `chapter` 전송(`navigation`은 `neighbors`). 열린 파일에 `createFileSystemWatcher(new RelativePattern(Uri.file(book.dir), chapterId))`를 걸고 변경 시 다시 읽어 `chapter` 전송(실패면 `error`). `handle`: `ready` → `open(chapterRef ?? 마지막 ref)`(없으면 `pickChapter`); `apply` → `store.apply` 후 `record`(`RecordConflictError`/`RecordCorruptError`는 `error`); `navigate.next` → 현재 챕터 `setPosition(첫 카드)` 적용 후 `neighbors().next`를 `open`; `navigate.restart` → 웹뷰가 처리하므로 no-op(프로토콜 호환용); `navigate.pick` → `pickChapter` 후 `open`; `preferences` → `setPreferences`; `openFolder` → `openExternal`.

- [ ] **Step 4: `panel.ts`·`main.ts` 구현**

`show`: 기존 패널이 있으면 `reveal`, 없으면 `createWebviewPanel('byheart.practice', 'ByHeart', ViewColumn.Active, { enableScripts: true, localResourceRoots: [dist, media] })`, HTML은 nonce 생성 후 CSP meta + `<link>`(`asWebviewUri(media/webview.css)`) + `<script nonce src=asWebviewUri(dist/webview.js)>`. `onDidReceiveMessage` → `session.handle`. `onDidDispose` → `session.dispose`. `registerWebviewPanelSerializer('byheart.practice', { deserializeWebviewPanel })`로 `revive`. `main.ts`: `resolveRoot(config.get('byheart.folder'), os.homedir())` → `ensureLayout` → `RecordStore` → 명령 `byheart.start`(`pickChapter` → `PracticePanel.show(...).open(ref)`), `byheart.openFolder`; `workspace.onDidChangeConfiguration`으로 `byheart.showWpm` 변경 시 `settings` 전송, `byheart.folder` 변경 시 root 재계산(열린 패널은 닫지 않고 다음 선택부터 반영). preferences는 `context.globalState`의 키 `byheart.preferences`(`setKeysForSync` 호출하지 않음). `locale`은 `vscode.env.language.startsWith('ko') ? 'ko' : 'en'`.

- [ ] **Step 5: 빌드·타입·단위 테스트 실행, 통합 테스트는 가능하면 실행**

Run: `npm run build && npm run typecheck && npm test`
Expected: PASS. 그다음 `npm run test:integration`을 시도한다. 이 PC에는 VS Code가 없고 테스트 러너가 VS Code를 내려받아야 한다. 실행이 되면 결과를, 안 되면 "미확인(VS Code 다운로드 불가/미설치)"을 계획 파일 Task 8 아래에 적는다.

- [ ] **Step 6: 커밋**

```bash
git add -A && git commit -m "feat: wire status bar, quick pick, practice panel, and record session"
```

> **Task 8 검증 기록 (2026-11-09):** `npm run build && npm run typecheck && npm test` 통과(131 tests). `npm run test:integration`은 `@vscode/test-electron`이 VS Code를 `.vscode-test/`에 내려받아 **실행됨** — "activates and registers commands" 1 passing. 패널 열기·QuickPick·기록 쓰기의 VS Code 안 동작은 통합 테스트 범위 밖이라 **미확인**. `session.ts`는 vscode API를 의존성으로 주입받아 Vitest 12개로 검사했다.

### Task 9: 힌트 카드 모드

**Files:**
- Modify: `src/webview/view.ts`, `src/webview/logic/reducer.ts`(필요 시), `media/webview.css`
- Test: `tests/webview/reducer.test.ts`(추가)

**Interfaces:**
- Consumes: Task 6 `Action.reveal`, `setMode`, `CardState.checkedMode = 'hint'`.

- [ ] **Step 1: 리듀서 테스트 추가**

```ts
it('hint 모드: reveal은 checked로 바꾸고 accuracy 없이 checkedMode hint', ...);
it('hint 모드: 다시 가리기(reset)는 input 단계로 돌아간다', ...);
it('hint 바퀴의 roundSummary는 accuracy·averageWpm null, mode hint', ...);
```
Run: `npm test -- tests/webview/reducer` → 새 테스트가 FAIL이면 리듀서 보강, 이미 PASS면 다음으로.

- [ ] **Step 2: 화면 구현**

모드 토글이 `hint`일 때 입력칸 대신 `.hint-card`에 `recallCue(card.text)`만 보이고, 카드 클릭·Enter → `reveal` → 원문(강조 포함)·translation(토글)·explanation 표시, 버튼 `[미암기] [이전] [다시 가리기 Alt+3] [다음 ⏎]`. WPM 표시 없음.

- [ ] **Step 3: 하네스 확인과 커밋**

Run: `npm run dev:webview`로 모드 전환 → 힌트 카드 → Enter 공개 → Enter 다음 → 완료 요약에 WPM이 없음을 확인한다.
```bash
git add -A && git commit -m "feat: add hint-card practice mode"
```

> **Task 9 검증 기록 (2026-11-09):** 리듀서 힌트 테스트 4개는 Task 7 구현으로 이미 PASS. 하네스(Chrome/Playwright)에서 모드 전환 → `recallCue`만 보이는 힌트 카드 → Enter 공개(강조 포함) → Alt+3 다시 가리기 → 클릭 공개 → Enter 다음 → 완료 요약 `한 바퀴 완료 — 카드 4`(WPM·정확도 없음), `addRound {mode:'hint', accuracy:null, averageWpm:null}` 로그 확인 ✓. `preferences {mode:'hint'}` 전송 ✓.

### Task 10: 내장 명언 교재

**Files:**
- Create: `content/quotes/01 <주제>.byheart.json`, `content/quotes/02 <주제>.byheart.json`, `content/quotes/SOURCES.md`
- Test: `tests/content.test.ts`

**Interfaces:**
- Consumes: Task 3 `cardsFromByheartJson`, Task 4 `builtinBooks`·`listChapters`.

- [ ] **Step 1: 콘텐츠 테스트 작성**

```ts
it('내장 교재의 모든 챕터가 파싱되고 각 카드에 translation과 출처 불릿이 있다', async () => {
  const chapters = await listChapters(builtinBooks(repoRoot)[0]);
  expect(chapters).toHaveLength(2); expect(chapters.every(c => !c.error)).toBe(true);
  for (const c of chapters) { const cards = cardsFromByheartJson(await fs.readFile(join(dir, c.ref.chapterId), 'utf8')); expect(cards).toHaveLength(10);
    for (const card of cards) { expect(card.speaker).not.toBe(''); expect(card.translation).toBeTruthy(); expect(card.explanation!.trim().split('\n').at(-1)).toMatch(/^- 출처: .+ \(\d{3,4}\), https?:\/\//); } }
});
it('SOURCES.md는 모든 저자를 포함한다', ...);  // speaker 집합 ⊆ SOURCES.md 본문
```
Run: `npm test -- tests/content` → FAIL(파일 없음).

- [ ] **Step 2: 명언 선정과 파일 작성**

기준(설계 5.4): 저자 사망 1955년 이전 **그리고** 출판 1930년 이전, Wikisource·Project Gutenberg URL. 20개를 주제 둘로 나눠 10개씩. 각 turn: `id` UUID v4, `speaker` 저자(40자 이내, `[]:` 금지), `text` 원문(필요하면 `**강조**`), `translation` 한국어 해석, `explanation` = 표현 불릿 0개 이상 + `- 출처: <저작> (<연도>), <URL>`. `documentId` UUID, `revision 0`, `source {kind:'text', basename: <파일명에서 .byheart.json 제외>}`, `retiredTurnIds []`. `SOURCES.md`: 표(저자 | 사망 연도 | 저작 | 출판 연도 | URL | 비고). 번역문은 작업자가 쓰고 **커밋 전에 사용자 검토를 받는다**(이 작업은 여기서 멈추고 20개 목록과 해석을 보여 준다).

- [ ] **Step 3: 검토 반영 후 테스트·커밋**

Run: `npm test -- tests/content`
```bash
git add -A && git commit -m "content: add 20 public-domain quotes with Korean notes and sources"
```

### Task 11: README·CHANGELOG·패키징

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `AGENTS.md`(명령 기준이 `package.json`이 되었음을 반영하는 한 줄), `docs/superpowers/plans/2026-11-09-vscode-extension-v1.md`(검증 결과 기록)

- [ ] **Step 1: README 재작성**

영문을 먼저, 한국어를 이어서. 내용: 한 줄 소개("Memorize sentences by typing them, inside VS Code"), 상태(1차 `.vsix`, 마켓플레이스 미공개), 설치(`npm install && npm run package` → `code --install-extension byheart-*.vsix`), 사용(상태바 → 교재 → 챕터 → Enter), 교재 폴더 구조(`~/.byheart/books/<book>/<chapter>.byheart.json|.txt`, 설정 `byheart.folder`), `.txt` 규칙(빈 줄 단락, `# 제목`, 본문 수정 시 기록 끊김), `.byheart.json` 최소 스키마와 **AI 작성 요청문**(입력 텍스트를 최소 스키마로 바꾸게 하며 UUID 생성·`text` 안 빈 줄 금지·해설 서식 `- ` 불릿·`**굵게**`·`*이탤릭*`만 허용·`speaker` 40자·`[]:` 금지 제약 포함), WPM 설명(떠올리는 시간을 포함하므로 Warm Up 같은 속도 측정과 다르다, `byheart.showWpm`), 기록 위치와 형식, 개인정보(네트워크 요청·원격 측정 없음, `extensionKind: ["ui"]`), 개발(`build`/`watch`/`test`/`test:integration`/`core:check`/`dev:webview`/`package`, 선택한 `engines.vscode`), 라이선스(MIT; 내장 명언은 공개 도메인, 해석은 MIT), 문서 표(기존 유지 + 계획 링크).

- [ ] **Step 2: CHANGELOG·AGENTS 갱신**

`CHANGELOG.md` 0.1.0 항목에 1차 기능 목록. `AGENTS.md` "기준 문서"의 "코드가 생기면 `package.json`을 명령의 기준으로 삼는다"를 "`package.json`이 명령의 기준이다"로.

- [ ] **Step 3: 패키징**

Run: `npm run package`
Expected: `byheart-0.1.0.vsix` 생성. `npx vsce ls`로 포함 파일에 `dist/`, `media/`, `content/`, `package.nls*.json`, `LICENSE`, `README.md`만 있고 `src/`·`dev/`·`tests/`가 없음을 확인한다. `.vsix` 설치는 VS Code가 있어야 하므로 미확인으로 적는다.

- [ ] **Step 4: 문서 검증과 커밋**

Run: `git diff --check && npm test && npm run typecheck`
```bash
git add -A && git commit -m "docs: write README with usage, AI textbook prompt, and packaging"
```

> **Task 10 검증 기록 (2026-11-09):** 사용자 요청으로 명언을 경제·기술·경영 주제(1758~1923년 공개 도메인 영어 원저)로 교체. 20개 모두 Gutenberg 평문과 대조(대소문자·구두점 무시) 확인. `npm test -- tests/content` 3 passed. 사용자 검토 후 커밋.

> **Task 11 검증 기록 (2026-11-09):** `npm run package` → `byheart-0.1.0.vsix`(14 files, 129 KB). 포함 파일: dist/, media/, content/quotes/(2 챕터+SOURCES.md), package.json, package.nls*.json, LICENSE, README, CHANGELOG — src/·dev/·tests/ 없음. `vsce`가 저장소 URL 없이 상대 링크를 거부해 `--no-rewrite-relative-links --allow-missing-repository`를 추가. `.vsix` 설치는 test-electron이 내려받은 VS Code 1.145.2의 CLI로 임시 user-data/extensions 디렉터리에 설치해 `byheart-placeholder.byheart@0.1.0`이 목록에 뜨는 것까지 확인. 실제 VS Code 창에서 패널·QuickPick 동작은 **미확인**. `git diff --check` 통과, 138 tests, typecheck 통과.

---

## 검증 기록

작업자가 각 작업의 실행 결과를 여기에 한 줄씩 적는다(실행하지 않은 것은 "미확인").

- 2026-11-09 Task 1~11 완료(각 작업 아래 검증 기록 참조). 최종: `npm test` 141 passed(16 files), `npm run typecheck` 통과, `npm run build` 통과, `npm run test:integration` 1 passing(VS Code 1.145.2를 `.vscode-test/`에 내려받아 실행), `npm run package` → `byheart-0.1.0.vsix`, 내려받은 VS Code CLI로 임시 디렉터리에 설치 확인.
- 2026-11-09 전체 코드 리뷰(새 컨텍스트 리뷰어): Critical 0, Important 3(설정 폴더 변경 시 열린 패널의 옛 root, `ready`에 `chapter`로 응답해 빈 패널, 챕터 파일명을 glob으로 사용) + 임시 파일 잔류를 Important로 올려 네 건 수정(커밋 `ea159ab`). 나머지 Minor는 미뤄 둠(목록은 작업 보고 참조).
- **미확인:** 실제 VS Code 창에서 패널·QuickPick·파일 감시 동작, 한글 IME 조합 보류, Windows 경로.

