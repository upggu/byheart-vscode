# ByHeart for VS Code 1차 설계

상태: 2026-11-09 사용자 승인(10절의 구현자 결정 포함). 기준은 [PRD](../../product-specs/PRD-byheart-vscode.md) 7.2의 1~9번(1차 범위)이며, PRD의 사용자 확인 결정은 바꾸지 않았다. "구현자 결정"으로 표시한 항목은 PRD가 열어 둔 것을 이 문서에서 정한 것이다. 이 문서는 승인 후 해당 작업의 설계 기록이 되며 PRD를 대체하지 않는다.

## 1. 목적

문장을 타이핑해서 외우는 웹앱 ByHeart의 핵심 흐름(힌트가 겹친 입력칸 → 입력 중 오류 표시 → Enter로 정답 비교 → 다음)을 VS Code 웹뷰 안에서 그대로 쓰게 한다. 교재는 사용자 PC의 `~/.byheart/books/`에 둔 `.byheart.json`·`.txt`이고, 기록은 `~/.byheart/records/`에 남긴다. 1차 산출물은 사용자 본인이 설치하는 `.vsix`다.

### 목표

- 웹앱과 같은 힌트·실시간 비교·정답 비교 결과. 비교 로직은 웹앱 모듈을 복사해 쓴다.
- 상태바 클릭 → 교재 → 챕터 → 입력칸까지 키보드만으로 이어진다.
- 파일을 폴더에 넣으면 교재가 된다. 읽지 못하는 파일은 이유를 보여 준다.
- 실시간 WPM과 완료 요약(카드 수·정확도·평균 WPM)만 보여 준다.

### 하지 않는 것 (PRD 8절 그대로)

계정·서버·동기화·백업, 알림·보상·스트릭·통계 대시보드, 자동 암기 판정과 복습 일정, 웹앱 교재 자동 공유, WPM 개인 최고 기록·추이·순위, vscode.dev 지원, 원격 측정, 키바인딩 기여. 사용자 폴더의 파일을 삭제하거나 덮어쓰는 기능.

### 제약

- `extensionKind: ["ui"]`, `browser` 진입점 없음, 네트워크 요청 없음.
- 웹앱 `../byheart`의 파일은 읽기만 한다.
- Warm Up(GPL-3.0)의 코드를 가져오지 않는다.
- 이 PC에는 VS Code가 설치되어 있지 않다(2026-11-09 확인). 단위 테스트는 Node에서 돌고, 확장 통합 테스트와 `.vsix` 설치 확인은 VS Code가 있는 환경에서만 가능하다. 계획에서는 그 검증을 "미확인"으로 구분한다.

## 2. 설계 전 확인 결과 (2026-11-09, `../byheart` 커밋 `0ee9eaa`)

### 2.1 복사할 모듈의 의존 관계

| 파일 | import | 런타임 의존 |
| --- | --- | --- |
| `hints.ts` | 없음 | 없음 |
| `diff.ts` | 없음 | `Intl.Segmenter`(문장 단위, `splitPassage`) |
| `live-diff.ts` | `./diff`(`defaultDiffOptions`, `DiffOptions`) | `Intl.Segmenter`(문자소 단위) |
| `answer-diff.ts` | 없음 | `Intl.Segmenter`(문자소 단위) |
| `emphasis.ts` | 없음 | 없음 |
| `sentences.ts` | `./emphasis`(`sliceEmphasis`, `EmphasisRange`), `./content-types`(**타입** `Item`) | 없음 |
| `content-types.ts` | `./emphasis`(타입 `EmphasisRange`) | 없음(타입만) |
| `live-diff-client.ts` | 타입 `LiveDiff`, 타입 `LiveRequest`, `new Worker(new URL('./live-diff.worker.ts', import.meta.url), {type:'module'})` | **Vite 전용 Worker 번들 규칙** |
| `live-diff.worker.ts` | `./live-diff`(`createLiveComparator`), 타입 `DiffOptions` | `self.onmessage` |

여섯 모듈은 DOM·React 참조가 없다. `sentences.ts`의 `Item`은 타입 전용 import이므로 `content-types.ts`(타입만 있는 파일)를 함께 복사하면 `sentences.ts`를 한 글자도 고치지 않고 쓸 수 있다.

### 2.2 `Item` 타입을 채우는 방법

`sentences.ts`가 읽는 필드는 `item.lines[]`의 `kind`·`id`·`speaker`·`english`·`emphasis`뿐이다. 웹앱 `scripts/content.ts`(44~53행)는 `ReviewDocument.turns`를 다음 규칙으로 `Line`으로 바꾼다. 확장의 어댑터도 같은 규칙을 쓴다.

```text
Line.kind      = turn.kind (있을 때만)
Line.id        = turn.id
Line.seq       = index + 1
Line.speaker   = turn.speaker
Line.section   = turn.section (있을 때만)
Line.english   = parseEmphasis(turn.text).text
Line.emphasis  = parseEmphasis(turn.text).ranges (비어 있지 않을 때만)
Line.korean    = turn.translation ?? ''
Item           = { id: 챕터 ID, bookId: 교재 ID, type: 'passage', chapter: 챕터 이름, title: 챕터 이름, lines }
```

카드 목록은 `turnUnits(item)`(대사 한 행 = 카드 한 장)으로 만들고, 짧은 힌트는 `recallCue(unit.english)`로 만든다. 웹앱의 현재 연습 화면(`FocusedPractice.tsx`)과 같다. `turn.explanation`은 `Item`에 들어가지 않으므로 어댑터가 카드 ID별로 따로 들고 간다.

### 2.3 웹뷰 안에서 Worker

VS Code 웹뷰 가이드(2026-11-09 확인)에 따르면 웹뷰의 Web Worker는 `data:`·`blob:` URI로만 만들 수 있고, Worker 안에서 `importScripts`와 동적 `import()`를 쓸 수 없으며, Worker 코드는 한 파일로 번들해야 한다. 따라서

- `live-diff-client.ts`의 `new Worker(new URL(..., import.meta.url))`은 Vite가 변환해 주는 규칙이라 esbuild 번들과 VS Code 웹뷰에서 그대로 동작하지 않는다. **이 파일은 복사 대상이 아니다.**
- `live-diff.worker.ts`를 쓰려면 별도 번들 → 문자열 → `Blob` → `URL.createObjectURL` → `new Worker`와 CSP `worker-src blob:`이 필요하다. 가능하지만 번들 단계와 CSP 항목이 늘어난다.
- `createLiveComparator`는 상태 수 100,000·작업량 1,000,000의 고정 예산이 있고, 넘으면 `limited: true`로 즉시 반환한다. 카드 하나는 대사 한 행이므로 메인 스레드에서 동기 호출해도 입력 지연이 체감되지 않을 것으로 본다.

결정은 4.4에 둔다.

### 2.4 기타

- `Intl.Segmenter`는 VS Code의 Chromium과 Node 24 모두에서 쓸 수 있다. 단위 테스트(Node)와 웹뷰(Chromium) 결과가 같은지는 복사한 웹앱 테스트로 확인한다.
- 웹앱의 `parseReviewDocument`(`src/review/model.ts`)는 zod 4를 쓰고 `../lib/emphasis`만 import한다. 문서 최상위·`source`·`turns[]`는 알 수 없는 키를 **조용히 버린다**(strict 아님). 따라서 `.byheart.json`에 새 필드를 넣으면 웹앱이 읽을 수는 있지만 다시 저장할 때 사라진다.
- 웹앱의 `turns[].speaker`는 40자 이내, `[` `]` `:` 금지. 명언의 저자 이름은 이 조건에 맞는다.
- 웹앱 폴더 정렬은 `Intl.Collator('en', {numeric: true, sensitivity: 'variant'})`로 NFC 정규화 후 비교한다(`scripts/content-discovery.ts`).

## 3. Approaches

### 3.1 연습 화면을 어디에 두는가

| 안 | 내용 | 평가 |
| --- | --- | --- |
| **A. 웹뷰 패널(선택)** | 에디터 영역에 WebviewPanel 하나. 입력칸은 textarea이고 그 위에 힌트·오류 레이어를 겹친다. | 웹앱의 textarea 기반 UI(`LiveTextarea.tsx`)를 그대로 옮길 수 있다. IME·오버레이·테마 색 모두 웹 기술로 해결. PRD가 선택한 방식. |
| B. 읽기 전용 에디터 탭에서 타이핑 | TextEditor 데코레이션으로 오류 표시 | 에디터 폰트·키 처리와 가장 잘 어울리지만 IME 조합 보류·오버레이 힌트를 에디터 API로 재현하기 어렵다. PRD가 "이후 후보"로 미뤘다. |
| C. 사이드바 WebviewView | 보조 영역에 상주 | 좁고, 포커스 전환이 어색하다. PRD가 QuickPick으로 대체하기로 했다. |

A를 쓴다.

### 3.2 `.byheart.json` 검증

| 안 | 평가 |
| --- | --- |
| **복사(선택)**: `src/review/model.ts`를 그대로 복사하고 zod 4를 호스트 의존성으로 추가 | 웹앱 검수 스키마와 바이트 단위로 같다. 예전 `translationKo`·`learning` 필드 승격, 음원 문서 검사, ID 중복 검사까지 동일. 비용은 zod 하나. |
| 직접 작성: 최소 필드만 손으로 검사 | 의존성이 없지만 웹앱과 어긋날 수 있다. "스키마 그대로"라는 PRD 결정과 맞지 않는다. |

**구현자 결정:** `model.ts`도 복사한다. PRD가 지정한 여섯 모듈에 `content-types.ts`(타입만)와 `review/model.ts`를 더해 **여덟 파일**을 복사하며, 모두 같은 규칙(원본 커밋 해시 기록)을 따른다. 사용자 확인이 필요한 항목이다.

### 3.3 실시간 비교의 실행 위치

| 안 | 평가 |
| --- | --- |
| **메인 스레드 동기 호출(선택)** | `createLiveComparator`를 웹뷰에서 직접 부른다. 번들·CSP 추가 없음. 고정 작업 예산 덕에 최악의 경우도 수 ms 뒤 `limited`로 끝난다. |
| Blob Worker | 웹앱과 같은 비동기 구조. esbuild로 Worker를 따로 번들하고 문자열로 포함해 Blob으로 띄운다. CSP `worker-src blob:`. 입력 지연이 체감되면 이 안으로 바꾼다. |

**구현자 결정:** 동기 호출. 비교 **규칙**은 같은 코드이므로 같다. `live-diff-client.ts`·`live-diff.worker.ts`는 복사하지 않고, 계획에 "2,000자 입력에서 비교 1회가 50ms 미만"을 확인하는 테스트를 넣는다. 넘으면 Blob Worker로 바꾼다.

### 3.4 `.txt` 카드 ID

| 안 | 평가 |
| --- | --- |
| **본문 해시(선택)** | 단락을 고치면 그 카드의 기록만 끊긴다. 단락 추가·삭제·순서 변경은 다른 카드에 영향 없음. |
| 위치(순번) | 본문을 고쳐도 유지되지만, 앞에 단락을 하나 넣으면 뒤 카드 전부가 다른 기록을 가리킨다. 더 위험하다. |

**구현자 결정:** 본문 해시. 끊김은 허용하고 README와 완료 요약 근처가 아닌 가이드에 명시한다. 기록에 남은 옛 ID는 지우지 않고 무시한다(7.4 참고).

### 3.5 기본 명언 교재의 출처 위치

| 안 | 평가 |
| --- | --- |
| **각 turn의 `explanation` 마지막 불릿(선택)** | 스키마 안에 있어 웹앱으로 복사해도 보존된다. 정답 확인 뒤 해설로 보여서 사용자가 출처를 본다. |
| 최상위 새 필드(`attribution`) | 웹앱 `parseReviewDocument`가 알 수 없는 키를 버리므로 웹앱에서 다시 저장하면 사라진다. |
| 사이드카 `SOURCES.md`만 | 파일과 출처가 분리된다. PRD는 "교재 파일에 보존"을 요구한다. |

**구현자 결정:** turn `explanation`의 마지막 줄을 `- 출처: <저작> (<연도>), <URL>`로 쓴다. 패키지의 `content/quotes/SOURCES.md`에 저자 사망 연도·출판 연도·공개 도메인 근거를 표로 함께 둔다.

## 4. 확장 구조

### 4.1 두 실행 환경과 역할

```text
확장 호스트 (Node, src/extension/)              웹뷰 (Chromium, src/webview/)
─────────────────────────────────               ────────────────────────────────
상태바 항목 [$(book) ByHeart]                    연습 화면 전체
명령 byheart.start / byheart.openFolder          타이핑 입력칸 + 힌트·오류 레이어
QuickPick 교재 → 챕터                             실시간 비교(live-diff) · 정답 비교(answer-diff)
교재 폴더 스캔, .byheart.json/.txt 어댑터         힌트 카드 모드, 해석 토글, 해설 표시
기록 읽기·원자적 쓰기·revision 충돌 처리          WPM 계산, 완료 요약
파일 변경 감시 → 챕터 다시 보내기                  미암기 토글·완료 → 기록 연산 요청
설정 읽기(byheart.folder, byheart.showWpm)        getState/setState로 숨김 중 입력 유지
내장 명언 교재 읽기(읽기 전용)
```

웹뷰는 파일 시스템·설정에 직접 닿지 않는다. 호스트는 UI를 그리지 않는다. 둘 사이의 모든 데이터는 `src/shared/`의 타입을 통과한다.

### 4.2 패널 수명

- 패널은 하나만 둔다(`byheart.practice`). 이미 있으면 `reveal`. `ViewColumn.Active`에 연다.
- `retainContextWhenHidden`은 쓰지 않는다. 웹뷰는 입력 초안·현재 위치·모드·바퀴 시작 시각을 `setState`에 저장하고, 다시 보일 때 `getState`로 복원한 뒤 호스트에 `ready {chapterRef}`를 보낸다. 호스트는 챕터와 기록을 다시 보낸다. VS Code 문서가 권장하는 방식이며 PRD 7.2.1 "패널을 숨겨도 입력을 유지한다"를 만족한다.
- VS Code 재시작 후 복원은 `WebviewPanelSerializer`로 같은 경로를 탄다. **구현자 결정.**
- 패널을 닫으면 완료되지 않은 바퀴의 입력은 사라진다. 기록 파일에는 미암기·위치·완료한 바퀴만 남는다(6절).

### 4.3 메시지 프로토콜 (`src/shared/protocol.ts`)

판별 유니온 두 개. 모든 메시지는 `type` 필드로 구분한다.

호스트 → 웹뷰

| type | 내용 | 시점 |
| --- | --- | --- |
| `init` | `{ chapter, record, settings, preferences, locale, navigation }` | `ready`를 받았을 때. `navigation = { hasPrevious, hasNext }` |
| `chapter` | `{ chapter, record }` | 파일 변경 감시로 현재 챕터가 바뀌었을 때, 다음 챕터·반복 이동 결과 |
| `record` | `{ record }` | 기록 연산 적용 뒤 최신 상태 |
| `settings` | `{ showWpm }` | 설정이 바뀌었을 때 |
| `error` | `{ message }` | 기록 쓰기 실패 등. 웹뷰는 배너로 보여 주고 입력은 유지한다 |

웹뷰 → 호스트

| type | 내용 |
| --- | --- |
| `ready` | `{ chapterRef?: ChapterRef }` — 스크립트 로드 완료. ref가 있으면 그 챕터를, 없으면 호스트가 고른 챕터를 보낸다 |
| `apply` | `{ ops: RecordOp[] }` — 기록 연산(6.3). 호스트가 적용 후 `record`로 응답 |
| `navigate` | `{ to: 'next' \| 'restart' \| 'pick' }` — 다음 챕터, 처음부터 반복, 챕터 선택(QuickPick) |
| `preferences` | `{ mode?: 'typing' \| 'hint', showTranslation?: boolean }` — 호스트가 `globalState`에 저장(Settings Sync 제외) |
| `openFolder` | 교재 폴더를 OS 파일 탐색기로 연다 |

### 4.4 공유 타입 (`src/shared/types.ts`)

```ts
interface ChapterRef { bookId: string; chapterId: string }          // bookId = 폴더 이름 또는 '.builtin/quotes', chapterId = 파일 이름(확장자 포함)
interface PracticeCard {
  id: string; kind: 'study' | 'explanation'; speaker: string; section?: string;
  text: string; emphasis?: EmphasisRange[]; translation?: string; explanation?: string;
}
interface PracticeChapter {
  ref: ChapterRef; bookTitle: string; title: string; format: 'byheart.json' | 'txt';
  readOnly: boolean; cards: PracticeCard[];
}
```

`PracticeCard`는 `turnUnits(item)`의 `SentenceUnit`에 `translation`·`explanation`을 붙인 것이다(2.2). `text`는 강조 기호를 제거한 본문, `emphasis`는 표시용 범위다. 힌트·비교에는 `text`만 쓴다(웹앱 규칙).

### 4.5 `package.json` 골자

- `name: "byheart"`, `displayName: "ByHeart"`, `description: "Memorize sentences by typing them, inside VS Code."`, `license: "MIT"`, `publisher`는 자리 표시자(사용자가 만든 뒤 교체).
- `engines.vscode`: 구현 시점의 최신 안정 버전 마이너 하나 아래(`^1.N.0`). `main: "./dist/extension.js"`. `browser` 없음. `extensionKind: ["ui"]`.
- `activationEvents: ["onStartupFinished"]` — 상태바 항목을 띄우기 위해 필요. 명령은 자동 등록.
- `contributes.commands`: `byheart.start`("ByHeart: Start Practice"), `byheart.openFolder`("ByHeart: Open Books Folder"). 제목은 `package.nls.json`(en)·`package.nls.ko.json`(ko).
- `contributes.configuration`: `byheart.folder`(string, 기본 `""` = `~/.byheart`, scope `machine`), `byheart.showWpm`(boolean, 기본 `true`).
- `capabilities`: `untrustedWorkspaces.supported: true`(작업 영역을 읽지 않는다), `virtualWorkspaces: false`.
- `keybindings` 없음.

## 5. 콘텐츠

### 5.1 폴더와 교재 목록

```text
~/.byheart/
  books/<교재 폴더>/<챕터>.byheart.json | <챕터>.txt
  records/<교재 ID>/<챕터 파일명>.json
```

- `byheart.folder`가 비어 있으면 `os.homedir()/.byheart`. 값이 `~/`로 시작하면 홈으로 치환하고, 상대 경로는 홈 기준으로 해석한다. 첫 실행 시 `books/`·`records/`가 없으면 만든다(디렉터리 생성만 하며 파일은 쓰지 않는다).
- 교재 = `books/` 바로 아래 폴더. `.`으로 시작하는 폴더는 무시한다. 챕터 = 교재 폴더 바로 아래의 `*.byheart.json`과 `*.txt`. 하위 폴더는 보지 않는다. 같은 이름의 두 형식이 있으면 둘 다 챕터로 보이며 챕터 ID가 파일명(확장자 포함)이므로 충돌하지 않는다.
- 정렬은 2.4의 Collator 규칙. 교재 이름 = 폴더 이름, 챕터 이름 = 확장자를 뺀 파일명(`.byheart.json`은 두 단계 모두 뺀다). `.txt`의 `# 제목`이 있으면 QuickPick 상세(description)에 보여 주고, 목록 라벨은 파일명을 유지한다. **구현자 결정**(파일명 정렬과 표시가 어긋나지 않게).
- 읽기에 실패한 챕터는 목록에 `$(warning)` 아이콘과 첫 줄 오류 메시지를 붙여 보여 주고, 선택하면 메시지 전체를 알림으로 보여 준다. 숨기지 않는다(KR3 대응).
- 교재가 하나도 없고 내장 교재만 있으면 QuickPick의 첫 항목은 내장 교재, 마지막 항목은 "교재 폴더 열기"다. 교재가 하나뿐이면 교재 선택을 건너뛰고 챕터 선택으로 간다.
- 파일 변경 감시: `workspace.createFileSystemWatcher(new RelativePattern(Uri.file(booksDir), '**/*.{txt,byheart.json}'))`. 현재 챕터 파일이 바뀌면 다시 읽어 `chapter` 메시지를 보낸다. 웹뷰는 카드 ID가 같은 카드의 입력·단계를 유지하고, 현재 카드 ID가 사라졌으면 같은 순번 또는 첫 카드로 간다.

### 5.2 `.byheart.json` 어댑터

- 복사한 `parseReviewDocument`로 파싱한다. 실패 메시지는 zod 오류를 한 줄로 요약해 보여 준다(경로 + 첫 문제).
- 음원 기반 문서(`source.kind: 'audio'`, `startMs`·`endMs` 있음)도 통과하며 시각은 무시한다.
- `kind: 'explanation'` 카드는 입력 없이 본문·해설을 처음부터 보여 주고 Enter로 넘긴다. 카드 수·정확도·WPM·미암기에서 제외한다. 설명 카드만 있는 챕터는 완료 화면을 보여 주되 바퀴를 기록하지 않는다(웹앱 규칙).
- `translation`은 해석 토글, `explanation`은 정답 확인 뒤 해설. `section`은 값이 이전 카드와 다를 때 카드 위에 작은 라벨로 보여 준다. **구현자 결정.**
- `retiredTurnIds`·`retiredLearning`은 읽기만 하고 쓰지 않는다.

### 5.3 `.txt` 어댑터

- UTF-8로 읽고 BOM 제거, `\r\n`→`\n`, 각 줄 끝 공백 제거.
- 첫 번째 비어 있지 않은 줄이 `# `로 시작하면 챕터 제목이며 카드가 아니다. 그 밖의 `#` 줄은 본문이다.
- 빈 줄(공백만 있는 줄 포함) 하나 이상으로 단락을 나눈다. 단락 하나 = 카드 하나. 단락 안의 줄바꿈은 그대로 둔다. 웹앱의 `text`도 줄바꿈을 허용하므로 비교 규칙은 같다.
- 강조 기호(`**`, `*`)는 해석하지 않고 그대로 본문이다. 번역·해설·화자 없음. **구현자 결정.**
- 카드 ID = `sha256(단락 본문).hex.slice(0, 16)`. 같은 본문이 두 번 나오면 두 번째부터 `-2`, `-3`을 붙인다.
- 카드가 하나도 없으면 "빈 파일" 오류로 목록에 표시한다.

### 5.4 내장 명언 교재

- 패키지 `content/quotes/` 아래 `.byheart.json` 파일들. 1차는 명언 20개를 10개씩 두 챕터로 나눈다(`01 ….byheart.json`, `02 ….byheart.json`). 챕터 이름은 주제 또는 시대이며 구현 시 정한다.
- 교재 ID `.builtin/quotes`, 교재 이름 "Quotes". 사용자 폴더의 `.` 시작 폴더를 무시하므로 충돌하지 않는다. 기록은 `records/.builtin/quotes/<파일명>.json`.
- `readOnly: true`. 웹뷰는 이 교재에서 "파일 열기" 같은 편집 동선을 보여 주지 않는다. `~/.byheart`에 복사하지 않는다.
- 각 turn: `speaker` = 저자 이름(영문), `text` = 원문 영어, `translation` = 자체 작성 한국어 해석, `explanation` = `- **표현**: 뜻` 불릿 0개 이상 + 마지막 `- 출처: <저작> (<연도>), <Wikisource·Gutenberg URL>`.
- 공개 도메인 기준: 저자 사망 70년 경과(2026년 기준 1955년 이전 사망) **그리고** 미국 출판 1930년 이전. 둘 다 만족하는 원문만 쓴다. `content/quotes/SOURCES.md`에 저자·사망 연도·저작·출판 연도·URL 표를 둔다.
- 명언 선정·출처 확인·한국어 해석 작성은 **이 구현 계획의 마지막 작업**이다. 그 전 작업은 샘플 교재(`dev/sample-chapter.json`과 테스트 픽스처)로 진행한다. 작성된 20개는 커밋 전에 사용자가 검토한다. **구현자 결정.**

## 6. 기록

### 6.1 파일 스키마 (`records/<교재 ID>/<챕터 파일명>.json`)

```json
{
  "schemaVersion": 1,
  "book": "my-book",
  "chapter": "Day 1.byheart.json",
  "revision": 7,
  "updatedAt": "2026-11-09T09:30:00.000Z",
  "position": { "cardId": "a1b2…" },
  "marks": { "a1b2…": { "difficult": true, "at": "2026-11-09T09:28:10.000Z" } },
  "rounds": [
    { "mode": "typing", "startedAt": "…", "finishedAt": "…", "cards": 12, "total": 12, "accuracy": 0.92, "averageWpm": 31 },
    { "mode": "hint", "startedAt": "…", "finishedAt": "…", "cards": 5, "total": 12, "accuracy": null, "averageWpm": null }
  ]
}
```

- `position`은 다음에 열 때 이어 갈 카드. 카드 ID가 없으면 첫 카드.
- `marks`는 카드 ID별 미암기. `false`로 바꾸면 키를 지우지 않고 `difficult: false`로 둔다(사용자 기록을 지우지 않는다).
- `rounds`는 완료한 바퀴만. 카드별 결과는 남기지 않는다(대시보드로 번지지 않게). `averageWpm`은 `byheart.showWpm`이 꺼져 있던 바퀴에서 `null`.
- 파일이 없으면 `revision: 0`인 빈 기록으로 시작한다. 파싱 실패(손상)하면 덮어쓰지 않고 `error`로 알린 뒤 그 세션은 메모리에서만 진행한다.

### 6.2 원자적 쓰기와 충돌

```text
apply(ops):
  최대 3회 반복:
    current = 파일 읽기 (없으면 빈 기록, revision 0)
    next    = ops를 current에 적용, revision + 1, updatedAt 갱신
    임시 파일 records/<교재>/<챕터>.json.<pid>-<random>.tmp 에 쓰기 (fsync)
    다시 읽어 revision이 current.revision과 같은지 확인 → 다르면 임시 파일 삭제 후 반복
    rename(임시, 최종)
  성공: 웹뷰에 record 전송 / 3회 실패: error 전송
```

- 웹뷰는 문서 전체가 아니라 **연산**을 보낸다. 두 창이 같은 챕터를 열어도 각자의 연산이 최신 파일에 적용되므로 덮어쓰기가 일어나지 않는다. 읽기와 rename 사이의 짧은 경쟁은 남지만 파일이 깨지지는 않는다. 이 한계는 README에 적지 않고 코드 주석에만 둔다.
- `rename`은 같은 디렉터리 안에서만 한다(Windows 포함 원자적 교체). 임시 파일은 항상 최종 파일과 같은 폴더에 만든다.

### 6.3 연산 (`RecordOp`)

| op | 효과 |
| --- | --- |
| `setMark { cardId, difficult }` | `marks[cardId] = { difficult, at }` |
| `setPosition { cardId }` | `position` 갱신 |
| `addRound { mode, startedAt, finishedAt, cards, total, accuracy, averageWpm }` | `rounds`에 추가 |

웹뷰는 미암기 토글마다 `setMark`, 카드 이동마다 `setPosition`, 마지막 카드 확인 뒤 `addRound`를 보낸다. 입력 초안은 보내지 않는다.

### 6.4 바퀴의 경계 (구현자 결정)

- 바퀴는 웹뷰가 챕터를 열 때 시작한다. 시작 카드는 `position`의 카드(없으면 첫 카드)이며, 바퀴 상태(시작 시각, 카드별 확인 여부·모드·입력 글자 수·경과 시간·정확도)는 웹뷰 `setState`에 있다. 패널을 숨겼다 보여도 이어지고, 패널을 닫거나 `navigate`로 다른 챕터에 가면 사라진다.
- 마지막 카드를 확인(설명 카드는 넘김)한 순간 바퀴가 끝나고 `addRound`를 보낸다. `cards`는 **이번 바퀴에서 확인한 학습 카드 수**, `total`은 챕터의 학습 카드 수다. 중간부터 이어 했으면 `cards < total`이며 그대로 기록한다. 정확도·평균 WPM은 이번 바퀴에서 확인한 카드로만 낸다. KR1의 "한 바퀴"는 `cards === total`인 바퀴로 센다.
- `이전`으로 돌아가 다시 확인한 카드는 마지막 시도만 집계한다.
- 바퀴 도중 타이핑↔힌트를 바꾸면 현재 카드는 빈 입력·가린 상태로 다시 시작하고 다른 카드의 결과는 유지한다. 기록의 `mode`는 확인한 카드가 모두 같은 모드면 그 모드, 섞였으면 `'mixed'`다. `averageWpm`은 타이핑으로 확인한 카드로만 내고, 그런 카드가 없으면 `null`.
- 완료 화면에서 `처음부터 반복`은 `setPosition(첫 카드)` 후 새 바퀴를 시작한다. `다음 챕터`는 현재 챕터의 `position`을 첫 카드로 되돌리고 다음 챕터를 연다. 마지막 챕터에서는 `다음 챕터` 버튼이 없다(교재를 넘어가지 않는다).

## 7. 웹뷰 연습 화면

### 7.1 화면

```text
┌──────────────────────────────────────────────────────────────┐
│ Quotes · 01 Stoics          3 / 10      [해석] [타이핑|힌트]   │
│                                                              │
│ Marcus Aurelius                                              │  ← speaker (비어 있으면 생략)
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ You h                                                    │ │  ← textarea. recallCue가 반투명으로 겹침
│ │                                                          │ │
│ │                                                  34 WPM  │ │  ← 첫 글자 입력 후, showWpm일 때
│ └──────────────────────────────────────────────────────────┘ │
│ [미암기 Alt+2]            [이전 Alt+1]          [정답 확인 ⏎] │
└──────────────────────────────────────────────────────────────┘

정답 확인 뒤 (같은 자리):
│ You have power over your mind — not outside events.          │  ← 원문. 다른 글자 붉은 밑줄, 대소문자·구두점·공백 차이 황갈색 점선
│ ~~outsid~~                                                   │  ← 불필요한 입력, 취소선
│ 당신은 마음을 다스릴 힘이 있다. 바깥일이 아니라.                  │  ← 해석 토글이 켜져 있을 때
│ • power over: ~에 대한 지배력  • 출처: Meditations (c. 180), https://…  │
│ [미암기 Alt+2]   [이전 Alt+1]   [다시 쓰기 Alt+3]     [다음 ⏎] │

완료:
│ 한 바퀴 완료 — 카드 10 · 정확도 92% · 평균 31 WPM               │
│ [다음 챕터 ⏎]   [처음부터 반복]   [챕터 선택]                    │  ← 마지막 챕터면 [처음부터 반복]이 기본
```

- 색·폰트는 `--vscode-*` 변수만 쓴다. 입력칸은 `--vscode-editor-font-family`·`--vscode-editor-font-size`, 오류는 `--vscode-errorForeground`, 세부 차이는 `--vscode-editorWarning-foreground`, 힌트 오버레이는 `--vscode-input-placeholderForeground`. 강조(`**`·`*`)는 굵게·기울임에 `--vscode-textLink-foreground`. 정확한 변수는 구현자가 고른다.
- 문자열은 `vscode.env.language`가 `ko`로 시작하면 한국어, 아니면 영어. 두 언어 표를 처음부터 둔다. **구현자 결정.**

### 7.2 타이핑 모드 동작 (웹앱 PRD 7절과 같다)

- 입력칸은 textarea 하나. 뒤에 같은 폰트·여백의 미러 레이어를 두고 `createLiveComparator(text)(input, true)` 결과로 오류 범위를 빨갛게, 빠진 자리를 표시하고, 틀린 단어의 정답을 그 단어 아래에 작고 반투명하게 보여 준다. 공간이 부족하면 말줄임. 웹앱 `LiveTextarea.tsx`의 동기화 규칙(scroll, clientWidth, ResizeObserver)을 바닐라 TS로 옮긴다. 이 UI 코드는 복사가 아니라 재작성이다.
- 힌트 오버레이는 `recallCue(text)`를 입력 길이만큼 가리고 나머지를 반투명으로 보여 준다.
- 비교 옵션은 웹앱 기본값(대소문자·구두점·공백 무시) 고정. 설정 UI는 두지 않는다.
- IME: `compositionstart`~`compositionend` 사이와 `keyCode === 229`·`isComposing`에서는 비교를 보류하고 Enter를 무시한다. 조합이 끝나면 비교한다.
- Enter = 정답 확인(입력 단계) / 다음(확인 단계). Shift+Enter = 줄바꿈. 키 반복(`repeat`)은 무시. 빈 입력도 확인할 수 있다.
- 정답 확인 화면은 `answerDiff(text, input)`로 그린다. `limited`면 원문과 "차이 표시를 생략했다"는 안내. 원래 입력은 유지하며 `다시 쓰기`로 돌아오면 입력칸을 비우고 WPM을 다시 잰다.
- Alt+1 이전, Alt+2 미암기, Alt+3 다시 쓰기. VS Code 자체 키바인딩이 먼저 잡으면 동작하지 않을 수 있으므로 버튼으로도 모두 가능해야 한다. Esc는 확인 단계에서 `다시 쓰기`, 입력 단계에서는 아무 것도 하지 않는다. **구현자 결정.**
- 포커스: 카드 이동 뒤 입력칸, 확인 뒤 `다음` 버튼, 완료 뒤 기본 버튼. ↑·↓로 완료 화면의 버튼 사이를 옮긴다.

### 7.3 힌트 카드 모드 (1차 포함)

PRD 7.4가 "1차 포함을 기본 가정"으로 두었고 웹앱 코드 재사용으로 비용이 작아 포함한다. 카드에 `recallCue`만 보이고 Enter·클릭으로 원문(강조 포함)·해석·해설을 연다. Enter로 다음. 미암기 가능. 바퀴 완료는 `accuracy`·`averageWpm`이 `null`인 `hint` 바퀴로 기록한다. 타이핑 구현이 흔들리면 계획에서 마지막 작업으로 미뤄 뺄 수 있게 독립 작업으로 둔다. 복사한 `hints.ts`(`firstLetters`·`hintTokens`)는 1차 UI에서 쓰지 않는다. 웹앱과의 동등성을 위해 복사만 한다.

### 7.4 WPM과 정확도 (`src/webview/logic/`, DOM 없음)

- 카드 타이머는 입력이 비어 있다가 처음 글자가 들어온 순간(IME 조합 시작 포함) 시작하고 정답 확인에 멈춘다. `다시 쓰기`로 초기화. 표시는 500ms마다 갱신하며 `wpm = (입력 글자 수 / 5) / 경과 분`. 첫 글자 전에는 표시하지 않는다.
- 바퀴 평균 WPM은 바퀴 안의 모든 타이핑 카드의 `입력 글자 수 합 / 5 / 경과 분 합`(시간 가중)이며 카드별 WPM의 평균이 아니다.
- 카드 정확도 = `max(0, 1 − 오류 문자소 수 / 원문 문자소 수)`. 오류 문자소 수 = `answerDiff` 결과에서 `kind !== 'same'`인 부분의 문자소 수 + `extra`의 문자소 수. 엄격 비교이므로 대소문자·구두점 차이도 오류다. `limited`인 카드는 제외한다. 바퀴 정확도는 바퀴 안의 학습 카드 정확도 평균이다.
- `byheart.showWpm`이 꺼져 있으면 WPM을 재지도 표시하지도 않고 `averageWpm: null`로 기록한다. 정확도는 항상 기록한다.
- 암기 타이핑의 WPM은 떠올리는 시간을 포함하므로 Warm Up 같은 속도 측정과 다르다고 README에 적는다.

### 7.5 웹뷰 보안

- CSP: `default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}'; font-src ${cspSource}; img-src ${cspSource}`. 인라인 스크립트·스타일 없음. JS가 `element.style.left`를 바꾸는 것은 CSP와 무관하다.
- `localResourceRoots`는 `dist/`와 `media/`만. 교재 본문은 메시지로 전달하므로 사용자 폴더를 웹뷰에 노출하지 않는다.
- 본문·해설은 항상 `textContent`로 넣고, 강조·불릿은 토큰을 DOM 요소로 만든다. HTML 해석 없음(웹앱 `emphasis.ts` 주석과 같은 원칙).

## 8. 코드 구조와 도구

```text
package.json  package.nls.json  package.nls.ko.json  tsconfig.json  esbuild.mjs  vitest.config.ts
LICENSE(MIT)  README.md  CHANGELOG.md  .vscodeignore  icon.png(2차)
src/core/lib/{hints,live-diff,diff,answer-diff,emphasis,sentences,content-types}.ts   ← 웹앱 복사본
src/core/review/model.ts                                                             ← 웹앱 복사본
src/shared/{protocol,types}.ts
src/extension/{main,statusbar,picker,panel,library,records,settings,builtin}.ts
src/extension/adapters/{byheart-json,txt,to-chapter}.ts
src/webview/{main,view,live-textarea,answer-view,explanation-view,i18n,state}.ts
src/webview/logic/{wpm,accuracy,reducer}.ts
media/webview.css
content/quotes/*.byheart.json  content/quotes/SOURCES.md
tests/**/*.test.ts            ← Vitest (Node)
src/test/**/*.test.ts         ← @vscode/test-cli 통합 테스트
scripts/check-core.mjs        ← 복사본이 ../byheart와 같은지 확인
```

- **복사본 표기:** 각 복사 파일의 첫 줄에 `// Copied from ../byheart src/lib/<file>.ts at commit 0ee9eaa78e40d6aded17d1d27913c13ed0492339 (2026-11-08). Do not edit; re-copy and update this line.`를 둔다. 그 아래는 바이트 단위로 같다. `npm run core:check`는 첫 줄을 떼고 `../byheart`의 현재 파일과 비교해 다른 파일과 기록된 커밋을 보고한다(`../byheart`가 없으면 건너뛴다). 웹앱 테스트 `hints-diff`·`live-diff`·`answer-diff`·`emphasis`도 import 경로만 바꿔 `tests/core/`에 복사한다.
- **번들:** esbuild. 진입점 둘 — `src/extension/main.ts` → `dist/extension.js`(platform node, cjs, external `vscode`), `src/webview/main.ts` → `dist/webview.js`(platform browser, iife). `--sourcemap`은 개발 빌드만.
- **타입:** TypeScript 5.x, `strict`. `tsconfig`는 `src/extension`+`src/shared`+`src/core`(lib `ES2022`, types `node`)와 `src/webview`+`src/shared`+`src/core`(lib `DOM`)를 나눈다.
- **테스트:** Vitest로 `src/core`·`src/shared`·`src/extension/adapters`·`records`·`src/webview/logic`을 검사한다. `@vscode/test-cli`+`@vscode/test-electron`으로 활성화·명령 등록·임시 폴더 스캔·기록 쓰기 통합 테스트를 둔다(VS Code를 내려받으므로 개발 시에만 네트워크를 쓴다. 이 PC에는 VS Code가 없어 1차 실행은 미확인으로 남는다).
- **패키징:** `@vscode/vsce package`. `.vscodeignore`로 `src/`·`tests/`·`node_modules/`를 뺀다. 런타임 의존성은 zod 하나이며 번들에 포함되므로 `dependencies`에 두되 `.vsix`에는 `dist/`만 들어간다.
- **웹뷰 개발 하네스:** `dev/harness.html`이 `dist/webview.js`·`media/webview.css`를 일반 브라우저에서 띄운다. `acquireVsCodeApi`를 스텁으로 두고 `init` 메시지에 샘플 챕터(`dev/sample-chapter.json`)를 넣는다. 이 PC에 VS Code가 없으므로 입력칸·오버레이·IME·정답 비교 화면은 이 하네스에서 브라우저로 확인하고, VS Code 안의 확인은 "미확인"으로 남긴다. 하네스는 `.vsix`에 들어가지 않는다. **구현자 결정.**
- **스크립트:** `build`, `watch`, `typecheck`, `test`, `test:integration`, `core:check`, `package`, `dev:webview`(하네스를 여는 정적 서버, 로컬 전용).
- 린터는 두지 않는다. `tsc --noEmit`과 테스트로 대신한다. **구현자 결정.**

## 9. 구현자에게 남기는 것

- 테마 변수의 정확한 선택, 힌트 말줄임 폭, 버튼 배치의 세부.
- 명언 20개의 선정·챕터 이름·한국어 해석 문안(5.4 규칙 안에서). 사용자 검토를 거친다.
- esbuild 설정 세부, Vitest 환경(`node`), 통합 테스트의 VS Code 버전.
- README의 AI 교재 작성 요청문 본문(PRD 7.2.9의 제약을 포함).
- 상태바 항목 문구와 툴팁.

## 10. 사용자 확인이 필요한 구현자 결정 (요약)

1. 복사 파일을 여섯에서 **여덟**으로(`content-types.ts`, `review/model.ts` 추가) 하고 zod를 호스트 의존성으로 둔다(3.2).
2. 실시간 비교를 Worker 없이 웹뷰 메인 스레드에서 동기 호출한다(3.3).
3. `.txt` 카드 ID는 본문 해시이며 본문 수정 시 기록 끊김을 허용한다(3.4).
4. 명언 출처는 각 turn `explanation`의 마지막 `- 출처:` 불릿에 둔다(3.5).
5. 힌트 카드 모드를 1차에 포함하되 독립 작업으로 두어 뺄 수 있게 한다(7.3).
6. 내장 교재 ID `.builtin/quotes`, 기록 위치 `records/.builtin/quotes/`(5.4).
7. 모드·해석 토글 선호는 `globalState`(동기화 제외)에 저장한다(4.3).
8. 바퀴는 챕터를 열 때 시작하고 마지막 카드 확인에 끝나며, 중간부터 이어 한 바퀴도 `cards < total`로 기록한다(6.4).
9. 웹뷰 UI는 브라우저용 개발 하네스로 확인하고 VS Code 안의 확인은 미확인으로 남긴다(8절).
10. 명언 20개 작성은 계획의 마지막 작업이며 사용자가 검토한 뒤 커밋한다(5.4).

빌더 검토(2026-11-09, 서브에이전트)에서 나온 질문 네 개 중 셋(바퀴 경계, UI 검증 방법, 명언 작업 위치)은 8~10번으로 정했고, 나머지 하나는 이 문서의 승인 자체다.
