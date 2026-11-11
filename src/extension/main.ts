import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { Preferences, Settings } from '../shared/types';
import { builtinBooks } from './builtin';
import { booksDir, ensureLayout, writeGuideIfMissing } from './library';
import { PracticePanel, VIEW_TYPE, type PanelDeps } from './panel';
import { pickChapter } from './picker';
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

  // Writes the guide only if it is missing, then opens books/ in a new window
  // so the user can add chapter files with the editor.
  const editBooks = async (): Promise<void> => {
    await layoutReady();
    try {
      const guide = await fs.readFile(join(context.extensionPath, 'media', `guide.${locale}.md`), 'utf8');
      await writeGuideIfMissing(root, guide);
    } catch (error) {
      void vscode.window.showErrorMessage(`ByHeart: ${error instanceof Error ? error.message : String(error)}`);
    }
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(booksDir(root)), { forceNewWindow: true });
  };

  const deps = (): PanelDeps => ({
    root,
    store,
    builtin,
    settings,
    preferences,
    setPreferences: (p) => context.globalState.update(PREFS_KEY, { ...preferences(), ...p }),
    locale,
    pick: async () => {
      const picked = await pickChapter(root, builtin, editBooks);
      return picked?.chapter.ref;
    },
    notify: (message) => void vscode.window.showErrorMessage(message),
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('byheart.start', async () => {
      await layoutReady();
      const picked = await pickChapter(root, builtin, editBooks);
      if (!picked) return;
      PracticePanel.show(context, deps()).open(picked.chapter.ref);
    }),
    vscode.commands.registerCommand('byheart.editBooks', editBooks),
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
