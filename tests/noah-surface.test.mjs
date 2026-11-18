import test from 'node:test';
import assert from 'node:assert/strict';
import { noahActionHref, noahMacPath, noahLegacyHref, noahHomeView } from '../lib/noah-surface.ts';

void test('public management always goes through the Mac handoff, local operations stay local', () => {
  for (const target of ['library', 'register', 'work', 'marketplace', 'models', 'agent']) {
    const path = noahMacPath(target, 'anicca');
    assert.equal(noahActionHref('local', '/noah', target, 'anicca'), path);
    for (const base of ['/noah', '/noah/public']) {
      const href = new URL(noahActionHref('public', base, target, 'anicca'), 'https://avoado.si');
      assert.equal(href.pathname, `${base}/mac`);
      assert.equal(noahMacPath(href.searchParams.get('target'), href.searchParams.get('agent')), path);
    }
  }
});
void test('handoff parameters cannot select an external destination, traversal or script', () => {
  for (const target of ['__proto__', 'constructor', '../../secret', '//evil.test', 'https://evil.test', 'javascript:alert(1)'])
    assert.equal(noahMacPath(target), '/noah/library');
  for (const id of ['../secret', 'abc/stop', 'x?execute=1', 'x#start', '%2f..', 'x'.repeat(161)])
    assert.equal(noahMacPath('agent', id), '/noah/library');
});
void test('legacy discovery and management keep their purpose while community hashes remain intact', () => {
  assert.equal(noahLegacyHref('#sky', 'public', '/noah'), '/noah/agents');
  assert.equal(noahLegacyHref('#sky-manage', 'public', '/noah'), '/noah/mac?target=library');
  assert.equal(noahLegacyHref('#sky-manage', 'local', '/noah'), '/noah/library');
  for (const hash of ['#timeline', '#community=abc', '#social']) assert.equal(noahLegacyHref(hash, 'public', '/noah'), null);
  assert.equal(noahHomeView('#community=abc'), 'communities');
  assert.equal(noahHomeView('#following'), 'social');
});
