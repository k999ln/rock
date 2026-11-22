import assert from 'node:assert/strict';
import test from 'node:test';
import { visiblePollingFixture } from './helpers/noah-visible-polling-fixture.mjs';

const flush = () => new Promise(setImmediate);
void test('hidden views make no periodic requests; returning reads once and disposal removes timers/listeners', async () => {
  const f = visiblePollingFixture('hidden'); let calls = 0;
  const stop = f.start(async () => { calls++; return 2000; }, 10000);
  await flush(); assert.equal(calls, 0); assert.equal(f.timers.size, 0);
  f.change('visible'); await flush(); assert.equal(calls, 1);
  assert.equal([...f.timers.values()][0].delay, 2000);
  f.change('hidden'); await flush(); assert.equal(f.timers.size, 0); assert.equal(calls, 1);
  f.change('visible'); await flush(); assert.equal(calls, 2);
  stop(); assert.equal(f.listeners.size, 0); assert.equal(f.timers.size, 0);
  f.change('visible'); await flush(); assert.equal(calls, 2);
});

void test('visibility aborts only the read and prevents overlap even when its transport ignores abort', async () => {
  const f = visiblePollingFixture(); const reads = [], rendered = []; let finish;
  const stop = f.start(async signal => {
    reads.push(signal);
    if (reads.length === 1) await new Promise(resolve => { finish = resolve; });
    if (!signal.aborted) rendered.push(reads.length);
  }, 10000);
  f.change('hidden'); assert.equal(reads[0].aborted, true);
  f.change('visible'); f.change('hidden'); f.change('visible');
  assert.equal(reads.length, 1); finish(); await flush();
  assert.equal(reads.length, 2); assert.deepEqual(rendered, [2]);
  assert.equal(f.timers.size, 1); stop();
});

void test('failed reads can recover, invalid intervals cannot create a busy loop, cleanup wins over late settlement', async () => {
  const f = visiblePollingFixture(); let calls = 0, finish;
  const stop = f.start(async () => {
    calls++;
    if (calls === 1) throw new Error('temporary disconnect');
    if (calls === 2) return 0;
    await new Promise(resolve => { finish = resolve; });
  }, 10000);
  await flush(); assert.equal([...f.timers.values()][0].delay, 10000);
  await f.next(); await flush(); assert.equal([...f.timers.values()][0].delay, 10000);
  await f.next(); stop(); finish(); await flush();
  assert.equal(f.timers.size, 0); assert.equal(f.listeners.size, 0); assert.equal(calls, 3);
});
