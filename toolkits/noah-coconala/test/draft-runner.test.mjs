import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { draftRunner } from '../draft-runner.mjs';
const candidate = {
  listingId: '123',
  title: '集計表',
  reason: '表計算の依頼',
  body: '週ごとの売上を集計する表を作ります。',
};
test('a retried run has one worker; stop awaits the active pass, fences late drafts and timers, and keeps completed drafts', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'noah-anicca-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'test.sqlite'),
    id = randomUUID();
  let count = 0,
    reached;
  const second = new Promise((resolve) => {
    reached = resolve;
  });
  const runner = draftRunner(
    path,
    async ({ seen }, signal) => {
      if (++count === 1) return { scanned: 4, drafts: [candidate] };
      assert.deepEqual(seen, ['123']);
      reached();
      await new Promise((resolve) =>
        signal.addEventListener('abort', resolve, { once: true }),
      );
      return { scanned: 1, drafts: [{ ...candidate, listingId: '987' }] };
    },
    15,
  );
  runner.start(id);
  runner.start(id);
  assert.throws(() => runner.start(randomUUID()), /実行中/);
  await second;
  const result = await runner.stop(id);
  assert.equal(result.state, 'stopped');
  assert.deepEqual(
    result.drafts.map((d) => d.listingId),
    ['123'],
  );
  await pause(35);
  assert.equal(count, 2);
  assert.equal(runner.start(id).state, 'stopped');
  await runner.close();
  const again = draftRunner(path, () => assert.fail('unexpected restart'));
  assert.equal(again.status(id).drafts[0].body, candidate.body);
  await again.close();
});
