import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '..', '..', '..');
    const extensionTestsPath = path.resolve(__dirname, 'suite', 'index');
    const workspacePath = path.resolve(
      extensionDevelopmentPath,
      'test',
      'fixtures',
      'monorepo-alias',
    );

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspacePath, '--disable-extensions'],
    });
  } catch (err) {
    console.error('Integration test run failed:', err);
    process.exit(1);
  }
}

void main();
