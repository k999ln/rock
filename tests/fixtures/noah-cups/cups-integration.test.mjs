import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import { resumeQueue } from '../../../scripts/noah-cups-queue.mjs';

const exec = promisify(execFile);
const toolkitDir = fileURLToPath(new URL('.', import.meta.url));
const image = 'noah-cups-integration:bookworm';
const required = process.env.NOAH_CUPS_INTEGRATION === 'required';

async function docker(...args) {
  const options = args.at(-1);
  const commandArgs = options && !Array.isArray(options) && typeof options === 'object'
    ? args.slice(0, -1)
    : args;
  return exec('docker', commandArgs, {
    cwd: toolkitDir,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 180_000,
    ...(options && !Array.isArray(options) && typeof options === 'object' ? options : {}),
  });
}

async function dockerExec(container, program, args = [], options = {}) {
  return docker('exec', container, program, ...args, options);
}

async function output(container, program, args = []) {
  const result = await dockerExec(container, program, args);
  return result.stdout;
}

async function waitForScheduler(container, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await output(container, '/usr/bin/lpstat', ['-h', '127.0.0.1:631', '-r']);
      if (/scheduler is running/i.test(result)) return;
      lastError = new Error(`unexpected scheduler response: ${result}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`CUPS scheduler did not become ready: ${lastError?.message ?? 'unknown error'}`);
}

async function buildImage() {
  await docker(
    'build',
    '--file',
    'cups-integration.Dockerfile',
    '--tag',
    image,
    '.',
    { timeout: 300_000 },
  );
}

function assertQueueDisabled(status, queue) {
  assert.match(status, new RegExp(`^printer ${queue} disabled since`, 'm'));
}

function assertQueueEnabled(status, queue) {
  assert.match(status, new RegExp(`^printer ${queue} (?:is idle|now printing)`, 'm'));
}

let dockerError;
try {
  await docker('version', '--format', '{{.Server.Version}}', { timeout: 10_000 });
} catch (error) {
  dockerError = error;
}

test('CUPS queue repair accepts disable -> plan -> apply -> enabled and unknown mutation outcome', {
  timeout: 360_000,
}, async (t) => {
  if (dockerError) {
    if (required) throw new Error(`Docker is required for CUPS integration: ${dockerError.message}`);
    t.skip(`Docker unavailable; set NOAH_CUPS_INTEGRATION=required to make this failure-visible: ${dockerError.message}`);
    return;
  }

  await buildImage();

  const container = `noah-cups-${process.pid}-${randomUUID().slice(0, 8)}`;
  const queue = `noah_fake_${randomUUID().slice(0, 8)}`;
  let running = false;

  try {
    await docker('run', '--detach', '--rm', '--network', 'none', '--name', container, image, '/usr/sbin/cupsd', '-f');
    running = true;
    await waitForScheduler(container);

    // The destination is a loopback IPP URI owned by this same container. No
    // print job is submitted, so no physical printer or host queue is touched.
    await dockerExec(container, '/usr/sbin/lpadmin', [
      '-p', queue,
      '-E',
      '-v', `ipp://127.0.0.1:631/printers/${queue}`,
      '-m', 'raw',
    ]);
    await dockerExec(container, '/usr/sbin/cupsdisable', [queue]);

    const disabled = await output(container, '/usr/bin/lpstat', ['-h', '127.0.0.1:631', '-p', queue]);
    assertQueueDisabled(disabled, queue);

    const calls = [];
    const run = async (program, args, timeout) => {
      calls.push({ program, args: [...args], timeout });
      return output(container, program, args);
    };

    const plan = await resumeQueue(queue, { platform: 'linux', run });
    assert.equal(plan.status, 'ready-to-resume');
    assert.equal(plan.writes, 'none');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].program, '/usr/bin/lpstat');
    assert.deepEqual(calls[0].args, ['-h', '127.0.0.1:631', '-p', queue]);

    const applied = await resumeQueue(queue, { platform: 'linux', apply: true, run });
    assert.equal(applied.status, 'queue-resumed');
    assert.equal(applied.writes, 'queue-state');
    assert.deepEqual(calls.slice(1).map(({ program, args }) => [program, args]), [
      ['/usr/bin/lpstat', ['-h', '127.0.0.1:631', '-p', queue]],
      ['/usr/sbin/cupsenable', ['-h', '127.0.0.1:631', queue]],
      ['/usr/bin/lpstat', ['-h', '127.0.0.1:631', '-p', queue]],
    ]);
    assertQueueEnabled(
      await output(container, '/usr/bin/lpstat', ['-h', '127.0.0.1:631', '-p', queue]),
      queue,
    );

    // Exercise the real scheduler while simulating a transport timeout after
    // cupsenable has completed. The repair agent must not claim success when
    // its post-write read was skipped; the direct read proves the state is now
    // enabled and makes the uncertainty classification meaningful.
    await dockerExec(container, '/usr/sbin/cupsdisable', [queue]);
    assertQueueDisabled(
      await output(container, '/usr/bin/lpstat', ['-h', '127.0.0.1:631', '-p', queue]),
      queue,
    );

    let mutationAccepted = false;
    const uncertainRun = async (program, args, _timeout) => {
      if (program === '/usr/sbin/cupsenable' && !mutationAccepted) {
        await output(container, program, args);
        mutationAccepted = true;
        const error = new Error('synthetic transport timeout after scheduler accepted request');
        error.code = 'ETIMEDOUT';
        throw error;
      }
      return output(container, program, args);
    };

    const uncertain = await resumeQueue(queue, {
      platform: 'linux',
      apply: true,
      run: uncertainRun,
    });
    assert.equal(mutationAccepted, true);
    assert.equal(uncertain.status, 'result-unverified');
    assert.equal(uncertain.writes, 'unknown');
    assertQueueEnabled(
      await output(container, '/usr/bin/lpstat', ['-h', '127.0.0.1:631', '-p', queue]),
      queue,
    );
  } finally {
    if (running) {
      await docker('rm', '--force', container, { timeout: 20_000 }).catch(() => {});
    }
  }
});
