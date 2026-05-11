import * as path from 'node:path';
import * as fs from 'node:fs';
import Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 20_000 });

  const testsRoot = __dirname;
  const files: string[] = [];
  for (const f of fs.readdirSync(testsRoot)) {
    if (f.endsWith('.test.js')) files.push(path.join(testsRoot, f));
  }
  for (const f of files) mocha.addFile(f);

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) reject(new Error(`${failures} tests failed.`));
        else resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}
