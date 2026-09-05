import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Compile the real browser execution coordinator, then simulate HTTP response loss.
const built = await build({
  entryPoints: [
    new URL('../lib/operations-client.ts', import.meta.url).pathname,
  ],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});
const { executeTracked } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(built.outputFiles[0].text).toString('base64')
);
globalThis.window = new EventTarget();
const options = {
  tool: 'mr-citations',
  transport: 'browser',
  sample: false,
  inputBytes: 20,
};
const json = (value, status = 200) => Response.json(value, { status });

test('result report retries reuse the same payload and never run the tool twice', async () => {
  const reports = [];
  let executions = 0;
  globalThis.fetch = async (path, init) => {
    const body = JSON.parse(init.body);
    if (path === '/api/jobs') return json({ id: body.id, status: 'queued' });
    if (body.action === 'start') return json({ status: 'running' });
    reports.push(body);
    if (reports.length === 1) throw new Error('response lost');
    return json({ status: 'completed' });
  };
  const result = await executeTracked({
    ...options,
    task: () => {
      executions++;
      return { output: 'done' };
    },
  });
  assert.equal(executions, 1);
  assert.equal(result.warning, '');
  assert.deepEqual(reports[0], reports[1]);
});
test('ambiguous start stops execution and a later explicit run is allowed', async () => {
  let executions = 0;
  globalThis.fetch = async (path, init) =>
    path === '/api/jobs'
      ? json({ id: JSON.parse(init.body).id })
      : Promise.reject(new Error('start response lost'));
  await assert.rejects(() =>
    executeTracked({
      ...options,
      task: () => {
        executions++;
        return { output: 'no' };
      },
    }),
  );
  assert.equal(executions, 0);
  globalThis.fetch = async (path, init) =>
    json({ id: JSON.parse(init.body).id });
  await executeTracked({
    ...options,
    task: () => {
      executions++;
      return { output: 'yes' };
    },
  });
  assert.equal(executions, 1);
});
test('completion outage retains output with a warning and does not fabricate a failed result', async () => {
  const statuses = [];
  globalThis.fetch = async (path, init) => {
    const body = JSON.parse(init.body);
    if (body.action === 'finish') {
      statuses.push(body.status);
      return json({ error: 'offline' }, 503);
    }
    return json({ id: body.id });
  };
  const result = await executeTracked({
    ...options,
    task: () => ({ output: 'valuable result' }),
  });
  assert.equal(result.result.output, 'valuable result');
  assert.ok(result.warning);
  assert.deepEqual(statuses, ['completed', 'completed']);
});
test('input and output content stay off the management API, and the tab admits one task', async () => {
  const bodies = [];
  let release;
  let started;
  const ready = new Promise((r) => {
    started = r;
  });
  globalThis.fetch = async (path, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    return json({ id: body.id });
  };
  const first = executeTracked({
    ...options,
    task: async () => {
      started();
      await new Promise((r) => {
        release = r;
      });
      return { output: 'PRIVATE_RESULT' };
    },
  });
  await ready;
  await assert.rejects(() =>
    executeTracked({ ...options, task: () => ({ output: 'second' }) }),
  );
  release();
  await first;
  assert.ok(!JSON.stringify(bodies).includes('PRIVATE_RESULT'));
  assert.deepEqual(Object.keys(bodies[0]).sort(), [
    'deviceId',
    'id',
    'inputBytes',
    'sample',
    'tool',
    'transport',
  ]);
});
