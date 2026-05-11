import * as assert from 'node:assert/strict';
import {
  isCssModuleSpecifier,
  scanTsxForCssModules,
} from '../../src/core/tsImportScanner';

describe('tsImportScanner', () => {
  it('detects css module specifiers', () => {
    assert.equal(isCssModuleSpecifier('./x.module.css'), true);
    assert.equal(isCssModuleSpecifier('#components/y.module.css'), true);
    assert.equal(isCssModuleSpecifier('./x.module.css?inline'), true);
    assert.equal(isCssModuleSpecifier('./x.css'), false);
    assert.equal(isCssModuleSpecifier('./x.module.scss'), false);
  });

  it('extracts a default import binding', () => {
    const src = `import styles from './x.module.css';\n`;
    const r = scanTsxForCssModules(src, 'foo.tsx');
    assert.equal(r.bindings.length, 1);
    assert.deepEqual(r.bindings[0], {
      kind: 'default',
      localName: 'styles',
      specifier: './x.module.css',
    });
    assert.equal(r.stringLiterals.length, 1);
    const lit = r.stringLiterals[0]!;
    assert.equal(lit.specifier, './x.module.css');
    assert.equal(src.slice(lit.start, lit.end), './x.module.css');
  });

  it('extracts a namespace import binding', () => {
    const src = `import * as s from './x.module.css';\n`;
    const r = scanTsxForCssModules(src, 'foo.tsx');
    assert.deepEqual(r.bindings, [
      { kind: 'namespace', localName: 's', specifier: './x.module.css' },
    ]);
  });

  it('extracts named import bindings', () => {
    const src = `import { foo, bar as baz } from './x.module.css';\n`;
    const r = scanTsxForCssModules(src, 'foo.tsx');
    assert.deepEqual(r.bindings, [
      { kind: 'named', localName: 'foo', importedName: 'foo', specifier: './x.module.css' },
      { kind: 'named', localName: 'baz', importedName: 'bar', specifier: './x.module.css' },
    ]);
  });

  it('ignores imports whose specifier is not a css module', () => {
    const src = `import x from './x.css';\nimport y from './y.module.scss';\n`;
    const r = scanTsxForCssModules(src, 'foo.tsx');
    assert.equal(r.bindings.length, 0);
    assert.equal(r.stringLiterals.length, 0);
  });

  it('handles multiple imports in one file', () => {
    const src = [
      `import a from './a.module.css';`,
      `import b from '#shared/b.module.css';`,
      `import c from './c.module.css';`,
      ``,
    ].join('\n');
    const r = scanTsxForCssModules(src, 'foo.tsx');
    assert.equal(r.bindings.length, 3);
    assert.equal(r.stringLiterals.length, 3);
  });
});
