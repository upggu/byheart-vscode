# ByHeart 교재 만들기

이 폴더(`books/`)가 ByHeart가 교재를 읽는 곳입니다. 여기에 폴더와 파일을 만들면 **ByHeart: 연습 시작** 목록에 나옵니다.

## 구조

```
books/
  영어 명언/                  ← 교재 (폴더 이름이 교재 이름)
    01 Day 1.txt              ← 챕터 (확장자를 뺀 파일 이름이 챕터 이름)
    02 Day 2.byheart.json     ← 챕터. 두 형식을 섞어도 됩니다
```

1. 이 폴더 안에 교재 폴더를 만듭니다.
2. 그 안에 `.txt`나 `.byheart.json` 파일을 넣습니다. 순서는 파일 이름 앞의 번호(`01`, `02`)로 정합니다. 숫자는 숫자로 비교합니다(`1, 2, 10`).
3. 명령 팔레트에서 **ByHeart: 연습 시작**을 실행해 교재 → 챕터를 고릅니다.

교재 폴더 바로 안의 `.txt`·`.byheart.json`만 챕터입니다. 다른 파일(이 안내처럼 `.md`), `.`으로 시작하는 파일·폴더, 교재 안의 하위 폴더는 읽지 않으니 메모를 같이 둬도 됩니다.

## `.txt` (가장 간단)

빈 줄로 나눈 단락 하나가 카드 하나입니다. 단락 안의 줄바꿈은 그대로 쳐야 합니다. 첫 줄을 `# `로 시작하면 카드가 아니라 목록에서 챕터 이름 옆에 붙는 설명이 됩니다.

```text
# 일과 돈

The only way out is through.

Well begun is half done.
```

단락을 고치면 그 카드의 미암기 표시가 끊깁니다. 해석·해설을 넣으려면 `.byheart.json`을 쓰세요.

## `.byheart.json` (해석·해설 포함)

ByHeart 웹앱과 같은 형식입니다. 아래 요청문과 원문을 AI에게 붙여 넣고, 결과를 `<교재>/<챕터>.byheart.json`으로 저장하세요.

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

## 이 파일에 대해

- **ByHeart: 교재 편집** 명령이 이 파일이 없을 때만 만듭니다. 있으면 덮어쓰지 않으니 자유롭게 고치거나 지워도 됩니다.
- 확장을 업데이트한 뒤 최신 안내를 보려면 이 파일을 지우고 **ByHeart: 교재 편집**을 다시 실행하세요.
- 확장은 이 파일 말고는 `books/` 안의 파일을 만들거나 고치거나 지우지 않습니다.
