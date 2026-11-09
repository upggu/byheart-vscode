import * as vscode from 'vscode';

export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.text = '$(book) ByHeart';
  item.tooltip = 'ByHeart: practice a chapter';
  item.command = 'byheart.start';
  item.show();
  context.subscriptions.push(item);
  return item;
}
