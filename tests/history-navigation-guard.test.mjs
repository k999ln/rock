import assert from 'node:assert/strict';
import test from 'node:test';
import { guardHistoryNavigation } from '../lib/history-navigation-guard.ts';

function fixture() {
  const navigation = new EventTarget();
  const committed = [];
  function traverse(key, patch = {}) {
    const event = new Event('navigate', { cancelable: true });
    Object.assign(event, { navigationType: 'traverse', destination: { sameDocument: true, key }, hashChange: false }, patch);
    navigation.dispatchEvent(event);
    if (!event.defaultPrevented) committed.push(key);
    return !event.defaultPrevented;
  }
  navigation.traverseTo = (key) => {
    const allowed = traverse(key);
    const result = allowed ? Promise.resolve() : Promise.reject(new Error('Blocked by another guard'));
    return { committed: result, finished: result };
  };
  return { host: { navigation }, navigation, traverse, committed };
}

void test('pending save blocks back and forward until resolved without modifying history', () => {
  const f = fixture();
  const release = guardHistoryNavigation(f.host, () => true);
  assert.equal(f.traverse('previous-entry'), false);
  assert.equal(f.traverse('next-entry'), false);
  assert.deepEqual(f.committed, []);
  release();
  assert.equal(f.traverse('previous-entry'), true);
  assert.deepEqual(f.committed, ['previous-entry']);
});

void test('explicit discard resumes the exact entry once; a later traversal still asks', () => {
  const f = fixture(); let resume, requests = 0;
  const release = guardHistoryNavigation(f.host, (proceed) => { resume = proceed; requests++; return true; });
  assert.equal(f.traverse('two-pages-back'), false);
  assert.equal(requests, 1);
  resume();
  assert.deepEqual(f.committed, ['two-pages-back']);
  assert.equal(requests, 1);
  assert.equal(f.traverse('two-pages-back'), false);
  assert.equal(requests, 2);
  release();
  resume();
  assert.deepEqual(f.committed, ['two-pages-back'], 'stale dialog cannot navigate after unmount');
});

void test('anchor, cross-document and non-cancelable navigation keep their existing browser handling', () => {
  const f = fixture(); let requests = 0;
  guardHistoryNavigation(f.host, () => { requests++; return true; });
  assert.equal(f.traverse('anchor', { hashChange: true }), true);
  assert.equal(f.traverse('document', { destination: { sameDocument: false, key: 'document' } }), true);
  assert.equal(f.traverse('push', { navigationType: 'push' }), true);
  const event = new Event('navigate'); Object.assign(event, { navigationType: 'traverse', destination: { sameDocument: true, key: 'fixed' } });
  f.navigation.dispatchEvent(event);
  assert.equal(requests, 0);
});

void test('no draft allows traversal and missing Navigation API does not alter legacy protection', () => {
  const f = fixture(); guardHistoryNavigation(f.host, () => false);
  assert.equal(f.traverse('previous'), true);
  assert.doesNotThrow(() => guardHistoryNavigation({}, () => true)());
});

void test('a rejected resume is consumed and does not waive the next navigation guard', async () => {
  const f = fixture(); let resume, requests = 0;
  guardHistoryNavigation(f.host, (proceed) => { resume = proceed; requests++; return true; });
  f.traverse('previous');
  f.navigation.traverseTo = () => ({ committed: Promise.reject(new Error('removed entry')), finished: Promise.reject(new Error('removed entry')) });
  resume(); await new Promise(setImmediate);
  assert.equal(f.traverse('previous'), false);
  assert.equal(requests, 2);
});
