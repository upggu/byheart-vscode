# Changelog

## 0.1.0 (unreleased)

First local-only version, installed from a `.vsix`.

- Commands **ByHeart: Start Practice** / **ByHeart: Open Books Folder**; QuickPick book → chapter.
- Books from `~/.byheart/books/<book>/`: `.byheart.json` (web app review schema, validated with the copied `parseReviewDocument`) and `.txt` (blank-line paragraphs, `# Title`).
- Typing practice webview: recall cue overlay, live error highlighting with word hints, strict answer comparison, translation toggle, explanation notes, section labels, IME-aware Enter handling.
- Hint-card mode (cue only, reveal on Enter).
- **Practice** toggle in typing mode: the whole sentence is the cue, for sentences you have not learned yet. Practice cards are left out of accuracy/WPM and recorded as `practiceCards`.
- No status bar item; the extension activates only when a command runs or a practice panel is restored.
- Action buttons pinned in the header so they keep their place; the translation also shows under the card before checking.
- Live WPM and round summary (cards, accuracy, average WPM); `byheart.showWpm` setting.
- Records in `~/.byheart/records/`: position, "hard" marks, completed rounds. Atomic writes with revision retry; corrupt files are never overwritten.
- Built-in "Quotes" book: 20 public-domain sentences on money, work, machines, and management with Korean translations and sources.
- Korean/English UI strings; `byheart.folder` setting; panel state restored after hide/restart.
- No network, telemetry, accounts, or keybinding contributions. `extensionKind: ["ui"]`.
