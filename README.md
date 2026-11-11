# ByHeart for VS Code

Memorize sentences by typing them, inside VS Code.

ByHeart shows you a short cue, you type the sentence from memory, and the editor marks errors while you type. Press Enter to compare against the original, then move on. Books are plain files in a folder on your machine (`~/.byheart/books/`). Nothing leaves your computer: no accounts, no sync, no telemetry, no network requests.

**Status:** first version, packaged as a `.vsix` you install yourself. Not on the Marketplace yet. (한국어 안내는 아래에 있습니다.)

## Install

Prerequisites: Node.js 20+ and VS Code 1.144 or newer.

```bash
npm install
npm run package            # → byheart-0.1.0.vsix
code --install-extension byheart-0.1.0.vsix
```

## Use

1. Run **ByHeart: Start Practice** from the Command Palette (⇧⌘P / Ctrl+Shift+P). There is no status bar item and no default shortcut; to bind one, open **Preferences: Open Keyboard Shortcuts**, search `byheart.start`, and assign a key.
2. Pick a book, then a chapter. With only the built-in book present, the picker goes straight to its chapters.
3. Type the sentence. The faint cue shows the first word and the first letter of the second; errors are underlined in red with the expected word beneath. For a sentence you have not learned yet, turn on **Practice** in the header: the whole sentence shows as the faint cue and you type over it. The setting is remembered.
4. **Enter** checks the answer (Shift+Enter inserts a newline). The original is shown with wrong letters underlined, case/punctuation differences dotted, and extra input struck through. **Enter** again goes to the next card.
5. Buttons sit in the header, right of the Typing / Hint switch, and keep their place on every card (Alt+1 / Alt+2 / Alt+3): Previous, Mark as hard, Rewrite. Esc on the answer screen rewrites. **Hint** mode shows the cue only and reveals the sentence on Enter, no typing.
6. After the last card you see a summary: cards, accuracy, average WPM. Then Next chapter, Restart, or Choose a chapter.

**ByHeart: Open Books Folder** opens `~/.byheart/books` in your file manager.

## Books folder

```
~/.byheart/
  books/
    English Quotes/             ← a book (the folder name is the book name)
      01 Day 1.txt              ← a chapter (the file name without extension is the chapter name)
      02 Day 2.byheart.json     ← another chapter; formats can be mixed in one book
  records/<book>/<chapter file name>.json   ← written by the extension
```

To add your own book:

1. Create a folder under `~/.byheart/books/`, e.g. `English Quotes`.
2. Put one or more `.txt` or `.byheart.json` files in it (formats below). Start file names with numbers (`01`, `02`) to control the order.
3. Run **ByHeart: Start Practice** and pick the book, then the chapter. The folder is read each time you open the picker.

What is read:

- Only folders directly under `books/` are books. Folders starting with `.` are skipped, and files placed directly in `books/` are ignored.
- Only `.txt` and `.byheart.json` files directly in a book folder are chapters. Other files (notes, `.md`, images), files starting with `.`, and subfolders inside a book are ignored, so you can keep notes next to your chapters.
- Chapters are sorted by file name with numbers compared as numbers (`1, 2, 10`).
- Change the root with the `byheart.folder` setting (empty = `~/.byheart`; `~/x` and relative paths resolve from your home directory). The extension creates `books/` and `records/` on first run and never deletes or overwrites your files.
- A chapter that fails to parse stays in the list with a warning and the first line of the error.

### `.txt` chapters

Plain UTF-8 text. Paragraphs separated by one or more blank lines become cards. Line breaks inside a paragraph are kept and must be typed. If the first non-empty line starts with `# `, it is not a card; its text is shown next to the chapter name in the picker (the chapter name itself stays the file name). Markdown emphasis is not interpreted.

Card identity is a hash of the paragraph text, so **editing a paragraph resets that card's "hard" mark** (position and round history of other cards are unaffected). Use `.byheart.json` if you want stable IDs with translations and notes.

### `.byheart.json` chapters

The same schema the ByHeart web app uses for reviewed chapters. Minimal text chapter:

```json
{
  "schemaVersion": 1,
  "documentId": "<UUID>",
  "revision": 0,
  "source": { "kind": "text", "basename": "Day 1" },
  "turns": [
    {
      "id": "<UUID>",
      "speaker": "",
      "text": "The **only** way out is through.",
      "translation": "유일한 출구는 통과하는 것이다.",
      "explanation": "- **way out**: 출구, 해결책"
    }
  ],
  "retiredTurnIds": []
}
```

Required: `schemaVersion`, `documentId`, `revision`, `source.basename`, `turns[].id`, `turns[].speaker` (may be `""`), `turns[].text`, `retiredTurnIds`. Optional per turn: `kind` (`"study"` default, or `"explanation"` for a card that is shown, not typed), `section` (a label shown when it changes), `translation` (shown via the Translation toggle), `explanation` (shown after checking; `- ` bullets, `**bold**`, `*italic*` only). `**bold**` and `*italic*` in `text` are display-only; you type the plain words. Audio-based documents from the web app also open; timings are ignored.

### Let an AI write a chapter for you

Paste the following with your source text (a `.txt`, an article, a dialogue) into any AI assistant and save the result as `~/.byheart/books/<book>/<chapter>.byheart.json`.

```text
Convert the text below into a ByHeart chapter JSON. Output only the JSON.

Rules:
- Top level: {"schemaVersion":1,"documentId":"<new UUID v4>","revision":0,"source":{"kind":"text","basename":"<chapter name>"},"turns":[...],"retiredTurnIds":[]}
- One turn per sentence or short speaker turn. Keep the original order and wording; do not correct the source.
- Each turn: {"id":"<new UUID v4>","speaker":"<name or empty string>","text":"<original>","translation":"<natural Korean translation>","explanation":"<notes>"}
- "speaker": at most 40 characters, no [ ] or : characters. Use "" when unknown.
- "text": the original sentence. Single line breaks are allowed, blank lines inside a turn are not. You may mark a key phrase with **bold** or *italic*; do not nest them.
- "explanation": 1–3 bullets, each line starting with "- ", one learning point per bullet, e.g. "- **give me a moment**: 잠시 기다려 달라는 뜻". Only "- " bullets, **bold**, *italic*, and \n line breaks; no HTML, links, headings, tables, or code.
- For a note that should be shown rather than typed, add "kind":"explanation" and put the note in "text".
- Escape quotes and backslashes correctly. Every id must be unique.

Text:
<paste here>
```

## WPM and accuracy

- Live WPM = (characters typed / 5) ÷ minutes since your first keystroke on the card. It stops when you check. Because you are recalling, not copying, the number is lower than a typing-test WPM and is not comparable to tools like Warm Up.
- The round summary shows the time-weighted average WPM over typed cards and the mean accuracy (strict: case and punctuation count). Cards checked with **Practice** on are left out of both and counted separately ("· 2 practice").
- Set `byheart.showWpm` to `false` to hide WPM and record `null` instead. Accuracy is always recorded.

## Records

`~/.byheart/records/<book>/<chapter file name>.json` holds the last position, per-card "hard" marks, and completed rounds (mode, start/end time, cards, total, accuracy, average WPM, and `practiceCards` when some cards were typed with Practice on). Nothing per keystroke. Files are written atomically (temp file + rename) with a revision check, and a corrupt record file is never overwritten: you get an error banner and the session continues in memory.

There is no scheduling, scoring, streaks, or dashboard, by design.

## Privacy

Runs only on your machine: `extensionKind: ["ui"]`, no network requests, no telemetry, no accounts. The webview receives chapter text through messages and cannot read your file system. The only files the extension writes are under `~/.byheart/records/` (plus creating the two folders).

## Development

| Command | What it does |
| --- | --- |
| `npm run build` / `npm run watch` | esbuild: `dist/extension.js` (Node, cjs) and `dist/webview.js` (browser, iife) |
| `npm run typecheck` | `tsc --noEmit` for host, webview, and integration tests |
| `npm test` | Vitest unit tests (`tests/**`) |
| `npm run test:integration` | `@vscode/test-cli`: downloads VS Code into `.vscode-test/` and runs `src/test/**` |
| `npm run core:check` | Verifies `src/core/**` is byte-identical to `../byheart` (skips if absent) |
| `npm run dev:webview` | Builds and serves the webview harness at http://127.0.0.1:5179/dev/harness.html |
| `npm run package` | typecheck + build + `vsce package` |

### Try it in VS Code

- **F5:** open this folder in VS Code and press F5 (**Run ByHeart (Extension Development Host)** in `.vscode/launch.json`). It runs `npm run build` and opens a second window with the extension loaded from `dist/`, without installing it. Same from a terminal: `npm run build && code --extensionDevelopmentPath="$PWD"`.
- **After a change:** keep `npm run watch` running, then run **Developer: Reload Window** in the development window. **Developer: Open Webview Developer Tools** shows webview errors.
- **As installed:** `npm run package && code --install-extension byheart-0.1.0.vsix --force`, then reload the window. Remove with `code --uninstall-extension byheart-placeholder.byheart`.
- **Keep your real records clean:** both ways use `~/.byheart`. Set `byheart.folder` to a scratch folder (e.g. `/tmp/byheart-test`); the built-in book still shows. The development window shares your user settings, so clear the setting when you are done.

Targets `engines.vscode ^1.144.0` with `@types/vscode ~1.144.0`. Comparison logic (`src/core/lib/*`, `src/core/review/model.ts`) is copied from the ByHeart web app at commit `0ee9eaa`; each file's first line records the source and it must not be edited here.

## License

MIT (see `LICENSE`). The built-in "Quotes" book contains public-domain English sentences; sources, dates, and URLs are in `content/quotes/SOURCES.md`. Their Korean translations and notes were written for this project and are MIT-licensed.

## Documents

| Document | Contents |
| --- | --- |
| [AI 작업 지침](AGENTS.md) | 기준 문서, 스킬 연결, 지켜야 할 원칙, 검증·Git 규칙 |
| [제품 요구사항](docs/product-specs/PRD-byheart-vscode.md) | 1차 lean PRD |
| [1차 설계](docs/superpowers/specs/2026-11-09-vscode-extension-v1-design.md) | 확장 구조, 메시지 프로토콜, 어댑터·기록 스키마, 웹뷰 UI (2026-11-09 승인) |
| [1차 구현 계획](docs/superpowers/plans/2026-11-09-vscode-extension-v1.md) | 11개 작업과 검증 기록 |
| [초기 탐색 아이디어](docs/discovery/2026-11-09-brainstorm-ideas.md) | 기회 정의와 후보, 사용자 확인 답변 |

Web app reference: [ByHeart PRD](../byheart/docs/product-specs/PRD-byheart.md). Warm Up (GPL-3.0) was studied for UX only; no code was taken from it.

---

# 한국어 안내

문장을 타이핑해서 외우는 VS Code 확장입니다. 짧은 힌트를 보고 문장을 떠올려 치면 입력 중에 틀린 글자를 표시하고, Enter로 원문과 비교한 뒤 다음 카드로 넘어갑니다. 교재는 내 PC의 `~/.byheart/books/` 폴더에 둔 파일이며, 서버·계정·동기화·원격 측정·네트워크 요청이 없습니다.

**상태:** 1차 버전, 직접 설치하는 `.vsix`. 마켓플레이스 미공개.

## 설치

```bash
npm install
npm run package            # → byheart-0.1.0.vsix
code --install-extension byheart-0.1.0.vsix
```

## 사용

1. 명령 팔레트(⇧⌘P / Ctrl+Shift+P)에서 **ByHeart: 연습 시작**을 실행합니다. 상태바 항목과 기본 단축키는 없습니다. 단축키를 쓰려면 **기본 설정: 바로 가기 키 열기**에서 `byheart.start`를 찾아 키를 지정하세요.
2. 교재 → 챕터를 고릅니다. 내장 교재만 있으면 바로 챕터 선택으로 갑니다.
3. 문장을 타이핑합니다. 반투명 힌트는 첫 단어와 둘째 단어의 첫 글자까지 보여 주고, 틀린 글자는 빨간 밑줄과 함께 정답 단어가 아래에 작게 보입니다. 아직 외우지 않은 문장은 헤더의 **연습**을 켜면 문장 전체가 반투명 힌트로 깔리고 그 위에 따라 칩니다. 켜고 끈 상태는 기억합니다.
4. **Enter**로 정답을 확인합니다(Shift+Enter는 줄바꿈). 틀린 글자는 밑줄, 대소문자·구두점 차이는 점선, 불필요한 입력은 취소선으로 보입니다. 다시 **Enter**로 다음 카드.
5. 버튼은 헤더의 타이핑 / 힌트 전환 오른쪽에 있고 카드가 바뀌어도 같은 자리에 있습니다(Alt+1 / Alt+2 / Alt+3): 이전, 미암기, 다시 쓰기. 확인 화면에서 Esc는 다시 쓰기. **힌트** 모드는 입력 없이 힌트만 보고 Enter로 원문을 엽니다.
6. 마지막 카드 뒤 완료 요약(카드 수·정확도·평균 WPM)과 다음 챕터 / 처음부터 반복 / 챕터 선택 버튼이 나옵니다.

## 교재 폴더

```
~/.byheart/
  books/
    영어 명언/                  ← 교재 (폴더 이름이 교재 이름)
      01 Day 1.txt              ← 챕터 (확장자를 뺀 파일 이름이 챕터 이름)
      02 Day 2.byheart.json     ← 챕터. 한 교재 안에 두 형식을 섞어도 됩니다
  records/<교재>/<챕터 파일명>.json   ← 확장이 쓰는 기록
```

내 교재 추가하기:

1. `~/.byheart/books/` 아래에 교재 폴더를 만듭니다(예: `영어 명언`).
2. 그 안에 `.txt`나 `.byheart.json` 파일을 하나 이상 넣습니다(형식은 아래). 순서를 정하려면 파일 이름 앞에 `01`, `02`처럼 번호를 붙입니다.
3. **ByHeart: 연습 시작**을 실행해 교재 → 챕터를 고릅니다. 목록을 열 때마다 폴더를 다시 읽습니다.

읽는 규칙:

- `books/` 바로 아래 폴더만 교재입니다. `.`으로 시작하는 폴더는 건너뛰고, `books/` 바로 밑에 둔 파일은 무시합니다.
- 교재 폴더 바로 안의 `.txt`·`.byheart.json`만 챕터입니다. 다른 파일(메모, `.md`, 이미지), `.`으로 시작하는 파일, 교재 안의 하위 폴더는 무시하므로 메모를 챕터 옆에 같이 둬도 됩니다.
- 파일 이름의 숫자는 숫자로 비교해 정렬합니다(`1, 2, 10`).
- 위치는 `byheart.folder` 설정으로 바꿀 수 있고(비우면 `~/.byheart`), 확장은 `books/`·`records/` 폴더를 만들 뿐 사용자 파일을 지우거나 덮어쓰지 않습니다. 읽지 못한 챕터는 목록에 경고와 오류 첫 줄을 붙여 보여 줍니다.

형식:

- **`.txt`**: 빈 줄로 나눈 단락 하나가 카드 하나. 단락 안 줄바꿈은 유지되어 그대로 쳐야 합니다. 첫 줄이 `# `로 시작하면 카드가 아니라, 선택 목록에서 챕터 이름 옆에 붙는 설명이 됩니다(챕터 이름은 그대로 파일 이름). 카드 ID는 본문 해시이므로 **단락을 고치면 그 카드의 미암기 표시가 끊깁니다.**
- **`.byheart.json`**: 웹앱 검수 스키마 그대로(위 영문 예시). `translation`은 해석 토글, `explanation`은 정답 확인 뒤 해설, `kind: "explanation"`은 입력 없이 보여 주는 카드, `section`은 값이 바뀔 때 라벨로 표시됩니다. 위 영문 절의 **AI 요청문**을 복사해 쓰면 텍스트를 이 형식으로 바꿀 수 있습니다.

## WPM·정확도·기록

- 실시간 WPM = (입력 글자 수 / 5) ÷ 첫 글자 입력 후 경과 분. 떠올리는 시간이 포함되므로 Warm Up 같은 타자 속도 측정과 다르고 더 낮게 나옵니다. `byheart.showWpm`을 끄면 재지도 기록하지도 않습니다.
- 완료 요약의 평균 WPM은 타이핑한 카드의 시간 가중 평균, 정확도는 엄격 비교(대소문자·구두점 포함) 평균입니다. **연습**을 켜고 확인한 카드는 둘 다에서 빼고 따로 셉니다("· 연습 2"). 기록에는 `practiceCards`로 남습니다.
- 기록은 `~/.byheart/records/<교재>/<챕터 파일명>.json`에 마지막 위치·미암기·완료한 바퀴만 남습니다. 임시 파일 + rename으로 원자적으로 쓰며, 손상된 기록 파일은 덮어쓰지 않고 오류 배너를 보여 준 뒤 메모리에서만 진행합니다. 자동 암기 판정·평점·복습 일정·개인 최고 기록·알림·대시보드는 의도적으로 없습니다.

## 개발

명령은 위 영문 표와 `package.json`을 따릅니다. `npm run test:integration`은 `.vscode-test/`에 VS Code를 내려받아 자동 테스트를 실행합니다. 웹뷰 UI만 빠르게 볼 때는 `npm run dev:webview` 하네스를 브라우저로 엽니다.

VS Code에서 직접 확인하기:

- **F5:** 이 폴더를 VS Code로 열고 F5(`.vscode/launch.json`의 **Run ByHeart (Extension Development Host)**). `npm run build` 뒤 확장을 설치하지 않고 `dist/`에서 불러온 새 창이 열립니다. 터미널에서는 `npm run build && code --extensionDevelopmentPath="$PWD"`.
- **고친 뒤:** `npm run watch`를 켜 두고 개발용 창에서 **Developer: Reload Window**. 웹뷰 오류는 **Developer: Open Webview Developer Tools**에서 봅니다.
- **설치한 상태로:** `npm run package && code --install-extension byheart-0.1.0.vsix --force` 뒤 창을 다시 불러옵니다. 제거는 `code --uninstall-extension byheart-placeholder.byheart`.
- **실제 기록 보호:** 두 방법 모두 `~/.byheart`를 씁니다. 설정에서 `byheart.folder`를 임시 폴더(예: `/tmp/byheart-test`)로 바꾸면 실제 기록이 바뀌지 않고, 내장 교재는 그대로 보입니다. 개발용 창은 평소 VS Code와 사용자 설정을 공유하므로 끝나면 이 설정을 비워 두세요. 비교 로직은 웹앱 커밋 `0ee9eaa`의 복사본이며 `npm run core:check`로 동일성을 확인합니다.

## 라이선스

MIT. 내장 명언 교재는 공개 도메인 원문이며 출처·연도·URL은 `content/quotes/SOURCES.md`에 있습니다. 한국어 해석과 해설은 이 프로젝트가 작성했고 MIT입니다.
