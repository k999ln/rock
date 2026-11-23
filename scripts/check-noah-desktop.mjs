import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeNoahArchive } from '../lib/noah-source-archive.ts';
import { configureNoahEngine, engineSocket } from './noah-isolated-runtime.mjs';
import { prepareTerminalRuntime } from './noah-terminal-runtime.mjs';
import { runCommand, sha256 } from './noah-source-fetch.mjs';

if (!process.argv.includes('--live')) throw new Error('Use --live to prepare and test the local isolated desktop.');
const root = path.resolve(import.meta.dirname, '..');
if (process.env.NOAH_TEST_ENGINE_HOME) configureNoahEngine(root, process.env.NOAH_TEST_ENGINE_HOME);
const bytes = writeNoahArchive([{ name: 'main.py', bytes: await readFile(path.join(root, 'tests/fixtures/noah-desktop-probe.py')), os: 0, attrs: 0 }]);
const signal = AbortSignal.timeout(1200000);
const runtime = await prepareTerminalRuntime({ root, name: 'desktop-probe.zip', bytes, expectedSha: sha256(bytes), signal,
  definition: { schema: 'noah-desktop/1', language: 'python', entrypoint: 'main.py', model: 'none' } });
const docker = args => runCommand('docker', ['--host', engineSocket(root), ...args], { timeout: 10000 });
const containers = async () => (await docker(['ps', '--filter', 'name=noah-terminal-run-', '--format', '{{.Names}}'])).trim().split('\n').filter(Boolean);
try {
  const result = await runtime.run('verify-guest-input', signal);
  assert.equal(result.exitCode, 0);
  assert.ok(Object.values(JSON.parse(result.text)).every(value => value === true));
  const before = new Set(await containers()), controller = new AbortController();
  let finished = false;
  const pending = runtime.run('hold-for-stop', AbortSignal.any([signal, controller.signal])).then(
    () => { finished = true; return { succeeded: true }; }, error => { finished = true; return { error }; });
  let launched;
  try {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline && !finished) {
      const current = (await containers()).filter(name => !before.has(name));
      if (current.length === 1 && (await docker(['top', current[0]])).includes('desktop_runner.py')) {
        const processes = await docker(['top', current[0]]);
        if (processes.includes('Xvfb') && processes.includes('desktop_session.py')) { launched = current[0]; break; }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (finished && !launched) throw (await pending).error || new Error('The stop probe exited before cancellation');
    assert.ok(launched, 'A live guest display and agent must exist before cancellation');
  } finally { controller.abort(); await pending; }
  const stopped = await pending;
  assert.ok(stopped.error && !stopped.error.unconfirmed, 'Cancellation must confirm teardown');
  assert.equal((await containers()).includes(launched), false);
  console.log(JSON.stringify({ passed: true, scope: 'synthetic-local-guest', checks: JSON.parse(result.text),
    cancellationConfirmed: true, image: runtime.execution.image, hostForegroundObserved: false, externalAgentAcceptance: 0 }));
} finally { await runtime.stop(); }
