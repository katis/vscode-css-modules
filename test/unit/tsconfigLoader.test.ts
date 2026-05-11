import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import {
  clearTsconfigLoaderCache,
  loadTsconfig,
} from '../../src/core/tsconfigLoader';
import { fixture } from './helpers';

describe('tsconfigLoader', () => {
  beforeEach(() => clearTsconfigLoaderCache());

  it('loads paths from a tsconfig with extends', () => {
    const cfg = loadTsconfig(fixture('monorepo-alias/apps/web/tsconfig.json'));
    assert.ok(cfg, 'expected tsconfig to load');
    assert.equal(cfg.configPath, fixture('monorepo-alias/apps/web/tsconfig.json'));
    assert.equal(cfg.baseDir, fixture('monorepo-alias/apps/web'));
    assert.equal(cfg.paths.length, 1);
    const p = cfg.paths[0]!;
    assert.equal(p.pattern, '#*');
    assert.equal(p.prefix, '#');
    assert.equal(p.suffix, '');
    assert.equal(p.hasWildcard, true);
    assert.deepEqual(p.targets, [
      path.resolve(fixture('monorepo-alias/apps/web'), 'src'),
    ].map((s) => s + path.sep + '*'));
  });

  it('returns empty paths when none are declared', () => {
    const cfg = loadTsconfig(fixture('monorepo-relative/tsconfig.json'));
    assert.ok(cfg, 'expected tsconfig to load');
    assert.equal(cfg.paths.length, 0);
  });

  it('returns null for a missing tsconfig', () => {
    const cfg = loadTsconfig(fixture('does-not-exist/tsconfig.json'));
    assert.equal(cfg, null);
  });

  it('caches results keyed on mtime', () => {
    const a = loadTsconfig(fixture('monorepo-alias/apps/web/tsconfig.json'));
    const b = loadTsconfig(fixture('monorepo-alias/apps/web/tsconfig.json'));
    assert.strictEqual(a, b);
  });
});
