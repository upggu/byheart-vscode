// Integration test for @vscode/test-cli (mocha). Needs a VS Code download; unverified on machines without it.
import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('ByHeart extension', () => {
  test('activates and registers commands', async () => {
    const ext = vscode.extensions.getExtension('byheart-placeholder.byheart');
    assert.ok(ext, 'extension not found');
    // No status bar item: nothing should activate the extension at startup.
    assert.strictEqual(ext.isActive, false, 'extension activated before any command ran');
    await ext.activate();
    const cmds = await vscode.commands.getCommands(true);
    assert.ok(cmds.includes('byheart.start'));
    assert.ok(cmds.includes('byheart.editBooks'));
  });
});
