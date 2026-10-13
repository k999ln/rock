import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function fixture() {
  let index = 0;
  const cells = [];
  const react = {
    useState(initial) {
      const cell = index++;
      if (!(cell in cells)) cells[cell] = initial;
      return [cells[cell], (next) => { cells[cell] = typeof next === 'function' ? next(cells[cell]) : next; }];
    },
    useRef(initial) {
      const cell = index++;
      if (!(cell in cells)) cells[cell] = { current: initial };
      return cells[cell];
    },
    useCallback(callback) { return callback; },
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../components/use-owner-memory-state.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, require(name) { assert.equal(name, 'react'); return react; } });
  const currentOwner = { current: null };
  return (owner) => {
    index = 0; currentOwner.current = owner;
    return exports.useOwnerMemoryState(owner, currentOwner, '');
  };
}

void test('authentication loss hides private drafts and restores only the original owner', () => {
  const render = fixture();
  let [value, edit] = render('owner-A');
  assert.equal(value, ''); edit('private A');
  [value, edit] = render('owner-A'); assert.equal(value, 'private A');
  const oldEdit = edit;
  [value, edit] = render(null); assert.equal(value, ''); edit('unauthenticated');
  [value, edit] = render('owner-B'); assert.equal(value, '');
  oldEdit('late A response'); edit('private B');
  [value] = render('owner-B'); assert.equal(value, 'private B');
  [value] = render('owner-A'); assert.equal(value, 'private A');
});

void test('old asynchronous snapshots cannot clear a newer edit', () => {
  const render = fixture();
  const [, edit, , stillCurrent] = render('owner-A');
  assert.equal(stillCurrent(), true);
  edit((previous) => `${previous}changed`);
  assert.equal(stillCurrent(), false);
  const [value, , retained, current] = render('owner-A');
  assert.equal(value, 'changed'); assert.equal(retained['owner-A'], 'changed');
  assert.equal(current(), true);
});
