import test from 'node:test';
import assert from 'node:assert/strict';
import { osEntryRedirect } from '../lib/os-entry.ts';

void test('only bare OS entries open Noah; existing navigation and handoffs keep their URL', () => {
  assert.equal(osEntryRedirect('/', '', ''), '/noah');
  assert.equal(osEntryRedirect('/os', '', ''), '/noah');
  for (const [path, search, hash] of [
    ['/', '', '#timeline'], ['/', '', '#communities'],
    ['/', '', '#community=example&invite=example'], ['/', '?thread=example', ''],
    ['/os', '?device=example', ''], ['/os/eve', '', ''],
  ]) assert.equal(osEntryRedirect(path, search, hash), null);
});
