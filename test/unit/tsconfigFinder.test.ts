import * as assert from 'node:assert/strict';
import {
  clearTsconfigFinderCache,
  findTsconfigFor,
} from '../../src/core/tsconfigFinder';
import { fixture } from './helpers';

describe('tsconfigFinder', () => {
  beforeEach(() => clearTsconfigFinderCache());

  it('finds the nearest tsconfig walking up from a source file', () => {
    const tsx = fixture('monorepo-alias/apps/web/src/components/Card.tsx');
    const found = findTsconfigFor(tsx);
    assert.equal(found, fixture('monorepo-alias/apps/web/tsconfig.json'));
  });

  it('finds the leaf tsconfig in monorepo-relative', () => {
    const tsx = fixture('monorepo-relative/src/x.tsx');
    const found = findTsconfigFor(tsx);
    assert.equal(found, fixture('monorepo-relative/tsconfig.json'));
  });

  it('returns the correct tsconfig per package in multi-tsconfig', () => {
    const web = findTsconfigFor(fixture('multi-tsconfig/apps/web/src/.gitkeep'));
    const api = findTsconfigFor(fixture('multi-tsconfig/apps/api/src/.gitkeep'));
    assert.equal(web, fixture('multi-tsconfig/apps/web/tsconfig.json'));
    assert.equal(api, fixture('multi-tsconfig/apps/api/tsconfig.json'));
  });
});
