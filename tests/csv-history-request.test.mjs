import test from 'node:test';
import assert from 'node:assert/strict';
import { createCsvHistoryRequest } from '../lib/csv-history-request.ts';

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
void test('a slow pre-payment history response cannot roll back the completed job', async () => {
  const history = createCsvHistoryRequest(), response = deferred();
  let job = { status: 'quoted', revision: 0 };
  const request = history.begin();
  const refresh = response.promise.then(value => { if (request.current()) job = value; });
  history.invalidate();
  job = { status: 'completed', revision: 3 };
  response.resolve({ status: 'quoted', revision: 0 });
  await refresh;
  assert.deepEqual(job, { status: 'completed', revision: 3 });
  assert.equal(request.signal.aborted, true);
});
void test('a late successful response cannot clear a newer sign-in failure', async () => {
  const history = createCsvHistoryRequest(), response = deferred();
  let ready = false;
  const old = history.begin();
  const refresh = response.promise.then(() => { if (old.current()) ready = true; });
  const current = history.begin();
  ready = false; // Latest GET returned 401.
  response.resolve();
  await refresh;
  assert.equal(ready, false);
  assert.equal(old.signal.aborted, true);
  assert.equal(current.current(), true);
});
void test('late failures are ignored after a newer recovery response', async () => {
  const history = createCsvHistoryRequest(), response = deferred();
  let error = '';
  const old = history.begin();
  const refresh = response.promise.then(() => { if (old.current()) error = 'unavailable'; });
  const current = history.begin();
  response.resolve();
  await refresh;
  assert.equal(error, '');
  assert.equal(current.signal.aborted, false);
});
void test('unmount invalidates pending work and a new effect can safely recheck', () => {
  const history = createCsvHistoryRequest(), old = history.begin();
  history.invalidate();
  assert.equal(old.current(), false);
  assert.equal(old.signal.aborted, true);
  const recovery = history.begin();
  assert.equal(recovery.current(), true);
  assert.equal(recovery.signal.aborted, false);
});

void test('nested mutations suppress polling until both actions settle', () => {
  const history = createCsvHistoryRequest(), old = history.begin();
  const quoteDone = history.mutate(), acceptDone = history.mutate();
  assert.equal(old.current(), false);
  assert.equal(history.begin(), null);
  acceptDone();
  assert.equal(history.begin(), null);
  quoteDone();
  quoteDone();
  assert.equal(history.begin().current(), true);
});
