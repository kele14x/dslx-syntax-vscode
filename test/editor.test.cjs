const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vscode = require('vscode');

exports.run = async () => {
  const extension = vscode.extensions.getExtension('local.dslx-syntax');
  assert.ok(extension, 'DSLX extension is registered');
  assert.equal(extension.packageJSON.main, undefined, 'No runtime is required');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dslx-documents-'));
  try {
    for (const suffix of ['x', 'dslx']) {
      const filename = path.join(directory, `sample.${suffix}`);
      await fs.writeFile(filename, 'fn main() -> u32 { u32:42 }\n');
      const document = await vscode.workspace.openTextDocument(filename);
      assert.equal(document.languageId, 'dslx', `Recognizes .${suffix}`);
      const editor = await vscode.window.showTextDocument(document);
      editor.selection = new vscode.Selection(0, 0, 0, 0);
      await vscode.commands.executeCommand('editor.action.commentLine');
      assert.match(document.lineAt(0).text, /^\/\/\s*fn main/);
      await vscode.commands.executeCommand('editor.action.commentLine');
      assert.equal(document.lineAt(0).text, 'fn main() -> u32 { u32:42 }');
      console.log(`PASS: .${suffix} detection and line-comment toggling`);
    }

    const document = await vscode.workspace.openTextDocument({ language: 'dslx', content: '' });
    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('type', { text: '(' });
    assert.equal(document.getText(), '()', 'Auto-closes parentheses');
    await editor.edit((builder) => builder.replace(new vscode.Range(0, 0, 0, 2), 'value'));
    editor.selection = new vscode.Selection(0, 5, 0, 5);
    await vscode.commands.executeCommand('type', { text: "'" });
    assert.equal(document.getText(), "value'", 'Does not auto-close identifier primes');
    console.log('PASS: bracket pairing and primed identifiers');
  } finally {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    await fs.rm(directory, { recursive: true, force: true });
  }
};
