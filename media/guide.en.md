# Making ByHeart books

This folder (`books/`) is where ByHeart reads books. Folders and files you create here show up in **ByHeart: Start Practice**.

## Layout

```
books/
  English Quotes/             ← a book (the folder name is the book name)
    01 Day 1.txt              ← a chapter (the file name without extension is the chapter name)
    02 Day 2.byheart.json     ← another chapter; formats can be mixed
```

1. Create a book folder in this folder.
2. Put `.txt` or `.byheart.json` files in it. Number the file names (`01`, `02`) to set the order; numbers compare as numbers (`1, 2, 10`).
3. Run **ByHeart: Start Practice** from the Command Palette and pick the book, then the chapter.

Only `.txt` and `.byheart.json` files directly in a book folder are chapters. Other files (like this `.md`), files and folders starting with `.`, and subfolders inside a book are ignored, so notes can live next to your chapters.

## `.txt` (simplest)

Each paragraph separated by blank lines is one card. Line breaks inside a paragraph are kept and must be typed. A first line starting with `# ` is not a card; it is shown next to the chapter name in the picker.

```text
# Work and money

The only way out is through.

Well begun is half done.
```

Editing a paragraph resets that card's "hard" mark. Use `.byheart.json` for translations and notes.

## `.byheart.json` (with translations and notes)

The same format as the ByHeart web app. Paste the request below with your source text into an AI assistant and save the result as `<book>/<chapter>.byheart.json`.

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

## About this file

- **ByHeart: Edit Books** creates this file only when it is missing and never overwrites it, so edit or delete it freely.
- To get the latest guide after an update, delete this file and run **ByHeart: Edit Books** again.
- Apart from this file, the extension never creates, changes, or deletes anything in `books/`.
