import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { resolveImport } from '../../src/core/pathResolver';
import {
  clearTsconfigLoaderCache,
  loadTsconfig,
} from '../../src/core/tsconfigLoader';
import { fixture } from './helpers';

describe('pathResolver', () => {
  beforeEach(() => clearTsconfigLoaderCache());

  it('resolves a relative import against the importer directory', () => {
    const importer = fixture('monorepo-alias/apps/web/src/Button.tsx');
    const out = resolveImport(importer, null, './Button.module.css');
    assert.deepEqual(out, [
      path.resolve(path.dirname(importer), 'Button.module.css'),
    ]);
  });

  it('resolves a wildcard alias to all targets', () => {
    const importer = fixture('monorepo-alias/apps/web/src/Button.tsx');
    const cfg = loadTsconfig(fixture('monorepo-alias/apps/web/tsconfig.json'));
    const out = resolveImport(importer, cfg, '#components/Card.module.css');
    assert.deepEqual(out, [
      fixture('monorepo-alias/apps/web/src/components/Card.module.css'),
    ]);
  });

  it('returns empty for a bare specifier with no matching paths', () => {
    const importer = fixture('monorepo-alias/apps/web/src/Button.tsx');
    const cfg = loadTsconfig(fixture('monorepo-alias/apps/web/tsconfig.json'));
    const out = resolveImport(importer, cfg, 'unknown-package/x.module.css');
    assert.deepEqual(out, []);
  });

  it('returns empty for a bare specifier when no tsconfig is provided', () => {
    const importer = fixture('monorepo-relative/src/x.tsx');
    const out = resolveImport(importer, null, 'pkg/x.module.css');
    assert.deepEqual(out, []);
  });
});
