import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { HostMessage, WebviewMessage } from '../shared/protocol';
import type { ChapterRef } from '../shared/types';
import { PracticeSession, isChapterFile, type SessionDeps } from './session';

export const VIEW_TYPE = 'byheart.practice';

export type PanelDeps = Omit<SessionDeps, 'post' | 'watch'>;

/** One practice panel at a time (design 4.2). */
export class PracticePanel {
  private static current: PracticePanel | undefined;
  private readonly session: PracticeSession;
  private readonly disposables: vscode.Disposable[] = [];

  static show(context: vscode.ExtensionContext, deps: PanelDeps): PracticePanel {
    if (PracticePanel.current) {
      PracticePanel.current.panel.reveal(vscode.ViewColumn.Active);
      return PracticePanel.current;
    }
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'ByHeart', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: false,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist'), vscode.Uri.joinPath(context.extensionUri, 'media')],
    });
    return new PracticePanel(panel, context, deps);
  }

  static revive(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, deps: PanelDeps): PracticePanel {
    PracticePanel.current?.dispose();
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist'), vscode.Uri.joinPath(context.extensionUri, 'media')],
    };
    return new PracticePanel(panel, context, deps);
  }

  static get active(): PracticePanel | undefined {
    return PracticePanel.current;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    deps: PanelDeps,
  ) {
    PracticePanel.current = this;
    this.session = new PracticeSession({
      ...deps,
      post: (message: HostMessage) => void this.panel.webview.postMessage(message),
      watch: (dir, chapterId, onChange) => {
        // A static glob: file names may contain glob metacharacters ([, ], {, }, ?, *).
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(dir), '*.{txt,byheart.json}'));
        const onEvent = (uri: vscode.Uri) => {
          if (isChapterFile(dir, chapterId, uri.fsPath)) onChange();
        };
        watcher.onDidChange(onEvent);
        watcher.onDidCreate(onEvent);
        watcher.onDidDelete(onEvent);
        return watcher;
      },
    });
    this.panel.webview.html = this.html(context);
    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((message: WebviewMessage) => void this.session.handle(message)),
      this.panel.onDidDispose(() => this.dispose()),
    );
  }

  open(ref: ChapterRef): void {
    void this.session.open(ref, 'init');
  }

  pushSettings(settings: { showWpm: boolean }): void {
    this.session.pushSettings(settings);
  }

  dispose(): void {
    if (PracticePanel.current === this) PracticePanel.current = undefined;
    this.session.dispose();
    for (const d of this.disposables.splice(0)) d.dispose();
    this.panel.dispose();
  }

  private html(context: vscode.ExtensionContext): string {
    const webview = this.panel.webview;
    const nonce = randomBytes(16).toString('base64');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'webview.css'));
    const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource}`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${style}">
<title>ByHeart</title>
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}
