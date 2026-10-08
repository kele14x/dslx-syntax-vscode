const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  const root = path.resolve(__dirname, '..');
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'dslx-editor-'));
  try {
    await runTests({
      extensionDevelopmentPath: root,
      extensionTestsPath: path.join(__dirname, 'editor.test.cjs'),
      ...(process.env.VSCODE_EXECUTABLE_PATH
        ? { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH }
        : {}),
      launchArgs: [
        '--disable-extensions',
        '--skip-welcome',
        '--skip-release-notes',
        '--user-data-dir', path.join(temporaryDirectory, 'profile'),
        '--extensions-dir', path.join(temporaryDirectory, 'extensions'),
      ],
    });
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
