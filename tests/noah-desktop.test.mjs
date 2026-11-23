import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseNoahRuntime, noahRuntimeWorkspace } from '../lib/noah-runtime-contract.mjs';
import { parseTerminalRuntime } from '../lib/noah-terminal-contract.mjs';
import { parseNoahAgentManifest } from '../lib/noah-agent-upload.ts';
import { noahTerminalTemplate } from '../lib/noah-terminal-template.ts';
import { terminalSource, terminalContainerArgs } from '../scripts/noah-terminal-runtime.mjs';
import { createTerminalInstallations } from '../scripts/noah-terminal-installations.mjs';
import { sha256 } from '../scripts/noah-source-fetch.mjs';
import { prepareManagedDesktopRuntime } from '../scripts/noah-managed-desktop.mjs';

const runtime = { schema: 'noah-desktop/1', language: 'python', entrypoint: 'main.py', model: 'none' };
void test('desktop is explicit and does not silently extend terminal declarations', async () => {
  assert.deepEqual(parseNoahRuntime(runtime), runtime);
  assert.throws(() => parseTerminalRuntime(runtime));
  const template = noahTerminalTemplate('python'); template.manifest.runtime = runtime;
  assert.deepEqual(parseNoahAgentManifest(template.manifest).runtime, runtime);
  const source = await terminalSource(template.name, template.bytes, sha256(template.bytes), runtime);
  assert.equal(source.runtime.schema, 'noah-desktop/1');
  const workspace = noahRuntimeWorkspace(runtime);
  assert.equal(workspace.surface, 'screen'); assert.equal(workspace.hostInput, false);
  assert.equal(workspace.hostClipboard, false); assert.equal(workspace.isolation.hostDesktop, false);
  for (const patch of [{ language: 'node' }, { display: ':0' }, { image: 'arbitrary' }, { entrypoint: '../host.py' }, { model: 'remote' }, { schema: 'noah-desktop/2' }])
    assert.throws(() => parseNoahRuntime({ ...runtime, ...patch }));
  assert.throws(() => parseNoahRuntime(Object.assign([], runtime)));
  assert.throws(() => parseNoahAgentManifest({ ...template.manifest, permissions: ['network'] }));
});
void test('guest display launches without host display sockets or viewer ports', () => {
  const volume = `noah-terminal-${randomUUID()}`;
  const args = terminalContainerArgs('run', 'image', volume, { root: '' }, 'main.py', 'python', false, true);
  assert.ok(args.includes('/opt/noah/desktop_runner.py')); assert.equal(args.at(-1), '/input/main.py');
  assert.equal(args[args.indexOf('--network') + 1], 'none');
  assert.equal(args[args.indexOf('--user') + 1], '10001:10001');
  assert.ok(args.includes('DISPLAY=')); assert.equal(args.includes('DISPLAY=:99'), false);
  assert.equal(args.includes('--publish'), false); assert.equal(args.includes('--device'), false);
  const stage = terminalContainerArgs('stage', 'image', volume, { root: '' }, 'main.py', 'python', true, true);
  assert.equal(stage.includes('/opt/noah/desktop_runner.py'), false);
});
void test('fixed desktop connection preserves revocation and owner-scoped stop', async () => {
  const template = noahTerminalTemplate('python'); template.manifest.runtime = runtime;
  const id = randomUUID(), scope = 'owner'; let revoked = false, stopped = 0, definition;
  const agent = { id, uploadState: 'ready', manifest: template.manifest, manifestSha256: 'a'.repeat(64), source: { name: template.name, sha256: sha256(template.bytes) } };
  const installations = createTerminalInstallations({ root: '/unused', prepare: async input => {
    definition = input.definition; return { execution: { image: 'sha256:' + 'b'.repeat(64), workspace: noahRuntimeWorkspace(runtime) }, stop: async () => { stopped++; } };
  } });
  const load = async () => { if (revoked) throw new Error('revoked'); return { agent, bytes: template.bytes }; };
  await installations.connect(scope, id, load);
  for (let i = 0; i < 100 && (await installations.get(scope, id)).busy; i++) await new Promise(r => setTimeout(r, 1));
  const connected = await installations.get(scope, id);
  assert.equal(connected.state, 'connected'); assert.match(connected.message, /仮想画面/); assert.deepEqual(definition, runtime);
  assert.match(connected.message, /ローカルLinux\/Pythonの試作/);
  assert.match(connected.message, /macOS・Windows専用アプリ、外部サイトの操作は未対応/);
  await assert.rejects(installations.execution('other', id));
  revoked = true; await assert.rejects(installations.execution(scope, id), /revoked/);
  await installations.disconnect(scope, id); assert.equal(stopped, 1); await installations.close();
});
void test('desktop preparation failure denies execution without replacing or stopping another task', async t => {
  const template = noahTerminalTemplate('python');
  const desktopId = randomUUID(), terminalId = randomUUID(), scope = 'owner';
  let desktopAttempts = 0, desktopRuns = 0, terminalStops = 0;
  const terminal = { execution: { image: 'sha256:' + 'b'.repeat(64) },
    run: async () => ({ text: 'original task remains usable', files: [], exitCode: 0 }),
    stop: async () => { terminalStops++; } };
  const installations = createTerminalInstallations({ root: '/unused', prepare: async input => {
    if (input.definition.schema === 'noah-desktop/1') { desktopAttempts++; throw new Error('Synthetic display preparation failure'); }
    return terminal;
  } });
  t.after(() => installations.close());
  const load = (id, definition) => async () => ({ bytes: template.bytes, agent: { id, uploadState: 'ready',
    manifest: { ...template.manifest, runtime: definition }, manifestSha256: 'a'.repeat(64),
    source: { name: template.name, sha256: sha256(template.bytes) } } });
  const settle = async id => {
    for (let n = 0; n < 100; n++) {
      const state = await installations.get(scope, id);
      if (!state.busy) return state;
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    assert.fail('connection did not settle');
  };
  await installations.connect(scope, terminalId, load(terminalId, template.manifest.runtime));
  assert.equal((await settle(terminalId)).state, 'connected');
  await installations.connect(scope, desktopId, load(desktopId, runtime));
  const failed = await settle(desktopId);
  assert.equal(failed.state, 'failed'); assert.equal(failed.busy, false); assert.equal(failed.execution, undefined);
  assert.match(failed.message, /Synthetic display preparation failure/);
  assert.match(failed.message, /ローカルLinux\/Pythonの試作/);
  assert.match(failed.message, /macOS・Windows専用アプリ、外部サイトの操作は未対応/);
  assert.match(failed.message, /本人の画面で代わりに実行することはありません。元の作業を続けられます/);
  await assert.rejects(async () => { const ready = await installations.execution(scope, desktopId); desktopRuns++; await ready.run('unused'); });
  assert.equal(desktopAttempts, 1); assert.equal(desktopRuns, 0);
  assert.equal((await (await installations.execution(scope, terminalId)).run()).text, 'original task remains usable');
  await installations.disconnect(scope, desktopId);
  assert.equal(terminalStops, 0);
  assert.equal((await installations.get(scope, terminalId)).state, 'connected');
});
void test('guest startup failure, display loss and cancellation are fail-closed', () => {
  execFileSync('python3', ['-B', 'tests/noah-desktop-guest.py'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 15000, stdio: 'pipe' });
});

void test('managed desktop accepts only desktop/1 jobs without a host model and never starts a local VM', async () => {
  const options = { root: '/unused', signal: AbortSignal.timeout(2000) };
  for (const definition of [{ ...runtime, schema: 'noah-terminal/1' }, { ...runtime, model: 'qwen3:4b' }]) {
    await assert.rejects(prepareManagedDesktopRuntime({ ...options, definition }), /運営専用画面/);
  }
  await assert.rejects(prepareManagedDesktopRuntime({ ...options, root: 'relative', definition: runtime }), /運営の専用Linux/);
});
