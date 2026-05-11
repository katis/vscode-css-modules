import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { resolveDefinitionAt } from '../../src/core/resolver';
import { indexCssModule, type CssIndex } from '../../src/core/cssIndex';
import {
  clearTsconfigLoaderCache,
  loadTsconfig,
  type LoadedTsconfig,
} from '../../src/core/tsconfigLoader';
import {
  clearTsconfigFinderCache,
  findTsconfigFor,
} from '../../src/core/tsconfigFinder';
import { fixture } from './helpers';

function loadTs(filePath: string): LoadedTsconfig | null {
  const p = findTsconfigFor(filePath);
  return p ? loadTsconfig(p) : null;
}

function loadCss(cssPath: string): CssIndex | null {
  try {
    const src = fs.readFileSync(cssPath, 'utf8');
    return indexCssModule(cssPath, src);
  } catch {
    return null;
  }
}

function readDoc(filePath: string): { documentPath: string; documentText: string } {
  return {
    documentPath: filePath,
    documentText: fs.readFileSync(filePath, 'utf8'),
  };
}

describe('resolveDefinitionAt', () => {
  beforeEach(() => {
    clearTsconfigFinderCache();
    clearTsconfigLoaderCache();
  });

  it('jumps from styles.primaryAction to the .primaryAction selector via tsconfig alias', () => {
    const buttonPath = fixture('monorepo-alias/apps/web/src/Button.tsx');
    const { documentText } = readDoc(buttonPath);
    const off = documentText.indexOf('styles.primaryAction') + 'styles.'.length;

    const r = resolveDefinitionAt({
      documentPath: buttonPath,
      documentText,
      cursorOffset: off,
      loadTsconfig: loadTs,
      loadCssIndex: loadCss,
    });

    assert.ok(r);
    assert.equal(r!.length, 1);
    assert.equal(r![0]!.filePath, fixture('monorepo-alias/apps/web/src/components/Card.module.css'));
    assert.equal(r![0]!.line, 1);
    assert.equal(r![0]!.column, 1);
  });

  it('jumps from a :global class reference to the inner selector', () => {
    const buttonPath = fixture('monorepo-alias/apps/web/src/Button.tsx');
    const { documentText } = readDoc(buttonPath);
    const off = documentText.indexOf('styles.globalClass') + 'styles.'.length;
    const r = resolveDefinitionAt({
      documentPath: buttonPath,
      documentText,
      cursorOffset: off,
      loadTsconfig: loadTs,
      loadCssIndex: loadCss,
    });
    assert.ok(r);
    assert.equal(r![0]!.filePath, fixture('monorepo-alias/apps/web/src/components/Card.module.css'));
    // :global(.globalClass) — class starts after `:global(` (1-based column 9)
    assert.ok(r![0]!.line >= 1);
    assert.ok(r![0]!.column > 1);
  });

  it('returns the CSS file at line 1 when the class is unknown', () => {
    const buttonPath = fixture('monorepo-alias/apps/web/src/Button.tsx');
    const { documentText } = readDoc(buttonPath);
    // Replace `primaryAction` with a non-existent class via inline edit
    const edited = documentText.replace('styles.primaryAction', 'styles.doesNotExist');
    const off = edited.indexOf('styles.doesNotExist') + 'styles.'.length;
    const r = resolveDefinitionAt({
      documentPath: buttonPath,
      documentText: edited,
      cursorOffset: off,
      loadTsconfig: loadTs,
      loadCssIndex: loadCss,
    });
    assert.ok(r);
    assert.equal(r![0]!.filePath, fixture('monorepo-alias/apps/web/src/components/Card.module.css'));
    assert.equal(r![0]!.line, 1);
    assert.equal(r![0]!.column, 1);
  });

  it('jumps from the import string to the CSS file', () => {
    const buttonPath = fixture('monorepo-alias/apps/web/src/Button.tsx');
    const { documentText } = readDoc(buttonPath);
    const litOffset = documentText.indexOf('#components/Card.module.css') + 5;
    const r = resolveDefinitionAt({
      documentPath: buttonPath,
      documentText,
      cursorOffset: litOffset,
      loadTsconfig: loadTs,
      loadCssIndex: loadCss,
    });
    assert.ok(r);
    assert.equal(r![0]!.filePath, fixture('monorepo-alias/apps/web/src/components/Card.module.css'));
    assert.equal(r![0]!.line, 1);
  });

  it('returns null when the import does not resolve to an existing file', () => {
    const path = fixture('monorepo-alias/apps/web/src/Button.tsx');
    const text = `import s from '#components/Missing.module.css';\nconst _ = s.foo;\n`;
    const off = text.indexOf('Missing') + 1;
    const r = resolveDefinitionAt({
      documentPath: path,
      documentText: text,
      cursorOffset: off,
      loadTsconfig: loadTs,
      loadCssIndex: loadCss,
    });
    assert.equal(r, null);
  });

  it('works with bracket access: styles["foo"]', () => {
    const path = fixture('monorepo-relative/src/x.tsx');
    const text = `import styles from './x.module.css';\nconst _ = styles["foo"];\n`;
    const off = text.indexOf('"foo"') + 2;
    const r = resolveDefinitionAt({
      documentPath: path,
      documentText: text,
      cursorOffset: off,
      loadTsconfig: loadTs,
      loadCssIndex: loadCss,
    });
    assert.ok(r);
    assert.equal(r![0]!.filePath, fixture('monorepo-relative/src/x.module.css'));
    assert.equal(r![0]!.line, 1);
  });

  it('jumps from the binding identifier itself (styles.foo, cursor on `styles`) to the CSS file', () => {
    const buttonPath = fixture('monorepo-alias/apps/web/src/Button.tsx');
    const { documentText } = readDoc(buttonPath);
    // Pick the second occurrence (inside JSX), not the binding declaration in `import styles ...`
    const useIdx = documentText.indexOf('styles.primaryAction');
    const off = useIdx + 'styl'.length;
    const r = resolveDefinitionAt({
      documentPath: buttonPath,
      documentText,
      cursorOffset: off,
      loadTsconfig: loadTs,
      loadCssIndex: loadCss,
    });
    assert.ok(r);
    assert.equal(r![0]!.filePath, fixture('monorepo-alias/apps/web/src/components/Card.module.css'));
    assert.equal(r![0]!.line, 1);
    assert.equal(r![0]!.column, 1);
  });

  it('also works on a namespace binding identifier (`* as s`)', () => {
    const path = fixture('monorepo-relative/src/x.tsx');
    const text = `import * as s from './x.module.css';\nconst _ = s;\n`;
    const useIdx = text.lastIndexOf('s;');
    const r = resolveDefinitionAt({
      documentPath: path,
      documentText: text,
      cursorOffset: useIdx,
      loadTsconfig: loadTs,
      loadCssIndex: loadCss,
    });
    assert.ok(r);
    assert.equal(r![0]!.filePath, fixture('monorepo-relative/src/x.module.css'));
    assert.equal(r![0]!.line, 1);
  });

  it('does not trigger on the binding identifier inside its own import declaration', () => {
    const path = fixture('monorepo-relative/src/x.tsx');
    const text = `import styles from './x.module.css';\nconst _ = styles.foo;\n`;
    const declIdx = text.indexOf('styles');
    const r = resolveDefinitionAt({
      documentPath: path,
      documentText: text,
      cursorOffset: declIdx + 2,
      loadTsconfig: loadTs,
      loadCssIndex: loadCss,
    });
    assert.equal(r, null);
  });

  it('returns null when the cursor is on neither an import string nor a property access', () => {
    const path = fixture('monorepo-relative/src/x.tsx');
    const text = `import styles from './x.module.css';\nconst foo = 42;\n`;
    const off = text.indexOf('foo = 42') + 1;
    const r = resolveDefinitionAt({
      documentPath: path,
      documentText: text,
      cursorOffset: off,
      loadTsconfig: loadTs,
      loadCssIndex: loadCss,
    });
    assert.equal(r, null);
  });
});
