import test from 'node:test';
import assert from 'node:assert/strict';
import { noahActionHref, noahMacPath, noahLegacyHref, noahHomeView } from '../lib/noah-surface.ts';

void test('both Noah modes use the canonical saved/search destinations without Mac handoff', () => {
  for (const mode of ['local','public']) for (const base of ['/noah','/noah/public']) {
    assert.equal(noahActionHref(mode,base,'library'),base+'/saved?tab=agents');
    assert.equal(noahActionHref(mode,base,'work'),base+'/activity');
    assert.equal(noahActionHref(mode,base,'register'),'/noah/agents/new');
    assert.equal(noahActionHref(mode,base,'agent','anicca'),base+'/agents/anicca');
    for(const target of ['models','../../secret','https://evil.test']) assert.equal(noahActionHref(mode,base,target),base+'/explore');
  }
});
void test('handoff parameters cannot select an external destination, traversal or script', () => {
  for (const target of ['__proto__', 'constructor', '../../secret', '//evil.test', 'https://evil.test', 'javascript:alert(1)'])
    assert.equal(noahMacPath(target), '/noah/library');
  for (const id of ['../secret', 'abc/stop', 'x?execute=1', 'x#start', '%2f..', 'x'.repeat(161)])
    assert.equal(noahMacPath('agent', id), '/noah/library');
});
void test('legacy discovery and management keep their purpose while community hashes remain intact', () => {
  assert.equal(noahLegacyHref('#sky', 'public', '/noah'), '/noah/explore?tab=tools');
  assert.equal(noahLegacyHref('#sky-manage', 'public', '/noah'), '/noah/saved?tab=roles');
  assert.equal(noahLegacyHref('#sky-manage', 'local', '/noah'), '/noah/saved?tab=agents');
  for (const hash of ['#timeline', '#community=abc', '#social']) assert.equal(noahLegacyHref(hash, 'public', '/noah'), null);
  assert.equal(noahHomeView('#community=abc'), 'communities');
  assert.equal(noahHomeView('#following'), 'social');
});
