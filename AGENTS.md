# ByHeart for VS Code 작업 지침

저장소 전체에 적용한다. 작업 전 사용할 스킬의 `SKILL.md`를 읽고, 사용자 요청의 범위와 금지 사항을 스킬보다 우선한다.

## 기준 문서

- 제품 요구의 기준은 [PRD](docs/product-specs/PRD-byheart-vscode.md)다. 사용자 확인 결정·제안·미결정(7.4)을 구분한다.
- [탐색 문서](docs/discovery/2026-11-09-brainstorm-ideas.md)는 작성 당시의 기록이며 PRD보다 우선하지 않는다.
- 실행·구조·사용법은 [README](README.md)에서 갱신한다. `package.json`이 명령의 기준이다.
- 웹앱 원본은 `../byheart`다. 동작 근거는 그 저장소의 [PRD](../byheart/docs/product-specs/PRD-byheart.md)와 `src/lib/*.ts`에서 확인하되, **그 저장소의 파일을 수정할 때는 그 저장소의 `AGENTS.md`를 따른다.**

## 스킬

- 제품 탐색은 `pm-product-discovery`, PRD 작성·리뷰는 `create-prd`, 설계·계획·구현·검증은 `superpowers`(brainstorming → writing-plans → 실행 스킬)를 사용한다.
- 새 설계는 `docs/superpowers/specs/`, 새 계획은 `docs/superpowers/plans/`에 스킬의 파일명·양식으로 둔다. 완료한 설계·계획은 그 작업의 기록이며 후속 변경의 현재 사양으로 덮어쓰지 않는다. 지속할 결정은 PRD·README에 반영한다.

## 지켜야 할 원칙 (PRD 요약)

- 사용자 PC에서만 동작한다. 서버·계정·동기화·원격 측정·네트워크 요청을 추가하지 않는다. `extensionKind: ["ui"]`를 유지한다.
- 교재는 `~/.byheart/books/<교재>/`의 `.byheart.json`(웹앱 검수 스키마 그대로)과 `.txt`다. 기록은 `~/.byheart/records/`에 원자적으로 쓰고 덮어쓰기를 막는다.
- 타이핑 모드가 핵심이다. 힌트·실시간 비교·정답 비교 규칙은 웹앱과 같아야 한다. 웹앱 `src/lib`의 순수 모듈(hints, live-diff, diff, answer-diff, emphasis, sentences)은 **복사해서** 쓰고 복사본에 원본 커밋 해시를 남긴다. 패키지 추출은 하지 않는다.
- 자동 암기 판정·평점·복습 일정·개인 최고 기록·알림·보상·통계 대시보드를 추가하지 않는다. 실시간 WPM과 완료 요약만 보여 준다.
- 기본 명언은 공개 도메인 원문만 쓰고 출처를 파일에 남긴다. Warm Up(GPL-3.0)의 코드는 가져오지 않는다.
- 사용자 폴더(`~/.byheart`)의 파일을 삭제하거나 덮어쓰는 기능을 임의로 추가하지 않는다.

## 검증과 Git

- 현재 코드로 실행한 결과만 보고한다. 실행하지 않은 검증·설치·배포는 미확인으로 표시한다.
- 문서만 바꾸면 `git diff --check`와 참조 경로를 확인한다.
- 혼자 쓰는 저장소다. 작업 범위에 맞는 검증을 마친 변경은 `main`에 직접 커밋한다. 원격은 `origin`(github.com/upggu/byheart-vscode)이며, 푸시는 사용자가 요청할 때만 한다.
