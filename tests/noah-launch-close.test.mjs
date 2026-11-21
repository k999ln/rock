import assert from 'node:assert/strict';
import test from 'node:test';
import { buyer, credential, launchFixture, outcome } from './helpers/noah-launch-fixture.mjs';

void test('closing the browser after enqueue does not prevent the runner from saving Work results', async (t) => {
  const f = await launchFixture(t);
  const overview = t.mock.method(f.service, 'overview', () => {
    assert.fail('the browser must not refresh the overview to advance a job');
  });
  assert.equal((await f.approved()).status, 200);
  const connection = await f.connect();
  const queued = await f.enqueue({ action: 'run', connectionId: connection.id, prompt: 'Finish while the browser is closed' });

  // No browser API calls after this point. Only the authenticated runner advances Work.
  const { command } = await f.poll();
  assert.equal(command.id, queued.id);
  await f.service.start(buyer, credential, { ...f.base, id: command.id, lease: command.lease });
  assert.equal((await f.jobs.get(buyer, queued.id)).noahExecution.state, 'running');
  await f.finish(command, { state: 'succeeded', result: outcome, calls: 0 });

  const saved = await f.jobs.get(buyer, queued.id);
  assert.equal(saved.noahExecution.state, 'returned');
  assert.deepEqual(saved.noahExecution.result, outcome);
  assert.equal(await f.jobs.get('other-owner', queued.id), null);
  assert.equal((await f.poll()).command, null);
  assert.equal(overview.mock.callCount(), 0);
});
