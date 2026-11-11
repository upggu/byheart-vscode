import * as os from 'node:os';
import * as vscode from 'vscode';
import type { Preferences, Settings } from '../shared/types';
import { builtinBooks } from './builtin';
import { ensureLayout } from './library';
import { PracticePanel, VIEW_TYPE, type PanelDeps } from './panel';
import { openBooksFolder, pickChapter } from './picker';
import { RecordStore } from './records';
import { resolveRoot } from './settings';

const PREFS_KEY = 'byheart.preferences';

export function activate(context: vscode.ExtensionContext): void {
  const builtin = builtinBooks(context.extensionPath);
  const config = () => vscode.workspace.getConfiguration('byheart');
  const settings = (): Settings => ({ showWpm: config().get<boolean>('showWpm', true) });
  const preferences = (): Preferences => ({ mode: 'typing', showTranslation: false, practice: false, ...context.globalState.get<Partial<Preferences>>(PREFS_KEY, {}) });
  const locale = vscode.env.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';

  let root = resolveRoot(config().get<string>('folder', ''), os.homedir());
  let store = new RecordStore(root);
  const layoutReady = () => ensureLayout(root).catch((error) => void vscode.window.showErrorMessage(`ByHeart: ${error instanceof Error ? error.message : String(error)}`));
  void layoutReady();

  const deps = (): PanelDeps => ({
    root,
    store,
    builtin,
    settings,
    preferences,
    setPreferences: (p) => context.globalState.update(PREFS_KEY, { ...preferences(), ...p }),
    locale,
    pick: async () => {
      const picked = await pickChapter(root, builtin);
      return picked?.chapter.ref;
    },
    openFolder: async () => openBooksFolder(root),
    notify: (message) => void vscode.window.showErrorMessage(message),
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('byheart.start', async () => {
      await layoutReady();
      const picked = await pickChapter(root, builtin);
      if (!picked) return;
      PracticePanel.show(context, deps()).open(picked.chapter.ref);
    }),
    vscode.commands.registerCommand('byheart.openFolder', async () => {
      await layoutReady();
      await openBooksFolder(root);
    }),
    vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        PracticePanel.revive(panel, context, deps());
      },
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('byheart.showWpm')) PracticePanel.active?.pushSettings(settings());
      if (event.affectsConfiguration('byheart.folder')) {
        // The open panel's session holds the old root and store; close it so the
        // next pick (and its records) use the new folder consistently.
        PracticePanel.active?.dispose();
        root = resolveRoot(config().get<string>('folder', ''), os.homedir());
        store = new RecordStore(root);
        void layoutReady();
      }
    }),
    { dispose: () => PracticePanel.active?.dispose() },
  );
}

export function deactivate(): void {}
