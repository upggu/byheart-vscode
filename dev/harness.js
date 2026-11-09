// Browser stand-in for the VS Code webview API. Not part of the .vsix.
(function () {
  const logEl = document.getElementById('harness-log');
  const log = (line) => { logEl.textContent = `${new Date().toISOString().slice(11, 19)} ${line}\n` + logEl.textContent; };
  const STORAGE = 'byheart-harness-state';
  const RECORD = 'byheart-harness-record';
  const params = new URLSearchParams(location.search);
  const locale = params.get('locale') === 'en' ? 'en' : 'ko';
  const showWpm = params.get('wpm') !== 'off';
  const preferences = { mode: params.get('mode') === 'hint' ? 'hint' : 'typing', showTranslation: params.get('translation') === 'on' };

  let chapter = null;
  let record = JSON.parse(sessionStorage.getItem(RECORD) || 'null');
  const deliver = (message) => { log(`host → webview ${JSON.stringify(message).slice(0, 160)}`); window.postMessage(message, '*'); };

  function emptyRecord(ref) {
    return { schemaVersion: 1, book: ref.bookId, chapter: ref.chapterId, revision: 0, updatedAt: '', position: null, marks: {}, rounds: [] };
  }
  function applyOps(current, ops) {
    const now = new Date().toISOString();
    const next = { ...current, marks: { ...current.marks }, rounds: [...current.rounds], revision: current.revision + 1, updatedAt: now };
    for (const op of ops) {
      if (op.op === 'setMark') next.marks[op.cardId] = { difficult: op.difficult, at: now };
      else if (op.op === 'setPosition') next.position = { cardId: op.cardId };
      else if (op.op === 'addRound') next.rounds.push(op.round);
    }
    return next;
  }
  async function loadChapter() {
    if (chapter) return chapter;
    const response = await fetch('sample-chapter.json');
    chapter = await response.json();
    return chapter;
  }

  window.__byheartHarness = {
    postMessage(message) {
      log(`webview → host ${JSON.stringify(message).slice(0, 200)}`);
      switch (message.type) {
        case 'ready':
          loadChapter().then((ch) => {
            if (!record || record.chapter !== ch.ref.chapterId) record = emptyRecord(ch.ref);
            deliver({ type: 'init', chapter: ch, record, settings: { showWpm }, preferences, locale, navigation: { hasPrevious: false, hasNext: true } });
          });
          break;
        case 'apply':
          record = applyOps(record || emptyRecord(chapter.ref), message.ops);
          sessionStorage.setItem(RECORD, JSON.stringify(record));
          setTimeout(() => deliver({ type: 'record', record }), 30);
          break;
        case 'navigate':
          log(`navigate: ${message.to} (host would open ${message.to === 'next' ? 'the next chapter' : 'the chapter picker'})`);
          break;
        case 'preferences':
          Object.assign(preferences, message.preferences);
          break;
        case 'openFolder':
          log('host would open the books folder');
          break;
      }
    },
    getState() {
      return JSON.parse(sessionStorage.getItem(STORAGE) || 'null');
    },
    setState(state) {
      sessionStorage.setItem(STORAGE, JSON.stringify(state));
    },
  };
  window.__byheartHarnessReset = () => { sessionStorage.removeItem(STORAGE); sessionStorage.removeItem(RECORD); location.reload(); };
  window.__byheartHarnessError = (message) => deliver({ type: 'error', message });
  log(`harness ready (locale=${locale}, wpm=${showWpm}, mode=${preferences.mode}). Reset: __byheartHarnessReset()`);
})();
