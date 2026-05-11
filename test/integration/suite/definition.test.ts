import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as vscode from 'vscode';

function fixtureUri(...segments: string[]): vscode.Uri {
  const root = path.resolve(__dirname, '..', '..', '..', '..', 'test', 'fixtures');
  return vscode.Uri.file(path.join(root, ...segments));
}

async function openDoc(uri: vscode.Uri): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
  return doc;
}

function positionOf(doc: vscode.TextDocument, search: string, after = 0): vscode.Position {
  const idx = doc.getText().indexOf(search);
  if (idx === -1) throw new Error(`Could not find ${JSON.stringify(search)} in ${doc.fileName}`);
  return doc.positionAt(idx + after);
}

async function definitionsAt(
  doc: vscode.TextDocument,
  pos: vscode.Position,
): Promise<readonly (vscode.Location | vscode.LocationLink)[]> {
  const result = await vscode.commands.executeCommand<
    (vscode.Location | vscode.LocationLink)[]
  >('vscode.executeDefinitionProvider', doc.uri, pos);
  return result ?? [];
}

function uriOf(d: vscode.Location | vscode.LocationLink): vscode.Uri {
  return 'targetUri' in d ? d.targetUri : d.uri;
}

function rangeOf(d: vscode.Location | vscode.LocationLink): vscode.Range {
  return 'targetRange' in d ? d.targetRange : d.range;
}

describe('CSS Modules: Go to Definition', function () {
  this.timeout(20_000);

  before(async () => {
    const ext = vscode.extensions.getExtension('katis.vscode-css-modules');
    if (!ext) throw new Error('extension katis.vscode-css-modules not found');
    if (!ext.isActive) await ext.activate();
  });

  it('jumps from styles.primaryAction to the .primaryAction selector', async () => {
    const buttonUri = fixtureUri('monorepo-alias/apps/web/src/Button.tsx');
    const doc = await openDoc(buttonUri);
    const pos = positionOf(doc, 'styles.primaryAction', 'styles.'.length + 1);
    const defs = await definitionsAt(doc, pos);
    assert.ok(defs.length > 0, 'expected at least one definition');
    const d = defs[0]!;
    const targetUri = uriOf(d);
    const targetRange = rangeOf(d);
    assert.ok(
      targetUri.fsPath.endsWith('components/Card.module.css'),
      `unexpected target: ${targetUri.fsPath}`,
    );
    assert.equal(targetRange.start.line, 0);
    assert.equal(targetRange.start.character, 0);
  });

  it('jumps from the import string to the CSS file', async () => {
    const buttonUri = fixtureUri('monorepo-alias/apps/web/src/Button.tsx');
    const doc = await openDoc(buttonUri);
    const pos = positionOf(doc, '#components/Card.module.css', 5);
    const defs = await definitionsAt(doc, pos);
    assert.ok(defs.length > 0);
    const targetUri = uriOf(defs[0]!);
    assert.ok(targetUri.fsPath.endsWith('components/Card.module.css'));
  });

  it('returns an empty list when the import does not resolve', async () => {
    const tmp = fixtureUri('monorepo-alias/apps/web/src/Unresolved.tsx');
    const content = `import s from '#components/DoesNotExist.module.css';\nconst _ = s.foo;\n`;
    await vscode.workspace.fs.writeFile(tmp, Buffer.from(content, 'utf8'));
    try {
      const doc = await openDoc(tmp);
      const pos = positionOf(doc, 'DoesNotExist', 2);
      const defs = await definitionsAt(doc, pos);
      assert.equal(defs.length, 0);
    } finally {
      try {
        await vscode.workspace.fs.delete(tmp);
      } catch {
        // ignore
      }
    }
  });
});
