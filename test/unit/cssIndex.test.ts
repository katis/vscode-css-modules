import * as assert from 'node:assert/strict';
import { indexCssModule } from '../../src/core/cssIndex';

describe('cssIndex', () => {
  it('indexes a single class', () => {
    const idx = indexCssModule('a.module.css', '.foo { color: red; }');
    assert.equal(idx.selectors.size, 1);
    assert.deepEqual(idx.selectors.get('foo'), { line: 1, column: 1 });
  });

  it('indexes multiple classes in a list', () => {
    const idx = indexCssModule('a.module.css', '.foo, .bar { color: red; }');
    assert.equal(idx.selectors.size, 2);
    assert.deepEqual(idx.selectors.get('foo'), { line: 1, column: 1 });
    assert.deepEqual(idx.selectors.get('bar'), { line: 1, column: 7 });
  });

  it('indexes classes nested under @media', () => {
    const src = '@media (max-width: 600px) {\n  .nested { color: red; }\n}\n';
    const idx = indexCssModule('a.module.css', src);
    assert.ok(idx.selectors.get('nested'), 'expected .nested to be indexed');
    const pos = idx.selectors.get('nested')!;
    assert.equal(pos.line, 2);
    assert.equal(pos.column, 3);
  });

  it('indexes classes inside :global()', () => {
    const idx = indexCssModule('a.module.css', ':global(.globalClass) { color: red; }');
    assert.deepEqual(idx.selectors.get('globalClass'), { line: 1, column: 9 });
  });

  it('indexes classes inside :local()', () => {
    const idx = indexCssModule('a.module.css', ':local(.localClass) { color: red; }');
    assert.deepEqual(idx.selectors.get('localClass'), { line: 1, column: 8 });
  });

  it('does not pick up attribute selector values as class names', () => {
    const idx = indexCssModule('a.module.css', '[data-x="foo"] { color: red; }');
    assert.equal(idx.selectors.size, 0);
  });

  it('keeps the first occurrence when a class appears twice', () => {
    const src = '.dup { color: red; }\n.dup { color: blue; }\n';
    const idx = indexCssModule('a.module.css', src);
    const pos = idx.selectors.get('dup');
    assert.ok(pos);
    assert.equal(pos!.line, 1);
  });

  it('returns an empty index for invalid CSS without throwing', () => {
    const idx = indexCssModule('a.module.css', '{ this is not real css');
    assert.ok(idx);
  });

  it('records column for a class on a later line', () => {
    const src = '.first,\n.second {\n  color: red;\n}\n';
    const idx = indexCssModule('a.module.css', src);
    assert.deepEqual(idx.selectors.get('first'), { line: 1, column: 1 });
    assert.deepEqual(idx.selectors.get('second'), { line: 2, column: 1 });
  });
});
