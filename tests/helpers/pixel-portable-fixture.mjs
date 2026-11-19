import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { createLinuxLocalManager } from '../../scripts/sky-linux-local-runtime.mjs';
import { createPixelLinuxExecutor } from '../../packages/rockstaros-runtime/src/linux-manager-executor.mjs';
import { createTextExecutor, executionDigest } from '../../packages/rockstaros-runtime/src/executor.mjs';
import { openNodeExecutorJournal } from '../../packages/rockstaros-runtime/src/node-host.mjs';
import { describeAdapter } from '../../lib/rockstar-adapters.ts';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
export async function pixelPortableFixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'rock-pixel-common-'));
  const model = JSON.parse(await readFile(new URL('../../toolkits/sky-linux-local/runtime-lock.json', import.meta.url))).model;
  const recipe = { name: '合成の担当', instructions: '下書きだけ作る', modelId: model.id };
  const agent = { id: crypto.randomUUID(), ...recipe, sha256: await executionDigest(JSON.stringify(recipe)) };
  const initial = { schema: 1, owner: `local-uid:${userInfo().uid}`, phase: 'ready', models: [model], agents: [agent], runs: [], error: null, preparedModels: [model.id], environment: { platform: 'linux', architecture: 'aarch64', bootId: 'fixture-boot', modelSha256: model.sha256 } };
  await writeFile(join(dir, 'state.json'), JSON.stringify(initial), { mode: 0o600 });
  const pending = [], counters = { dispatched: 0, stopped: 0, authorized: 0, environmentsStopped: 0 };
  let abi = 1, stopConfirmed = true;
  const environment = { id: 'pixel-linux', bootId: 'fixture-boot', async stop() { counters.environmentsStopped++; }, spawn(args, options) {
    if (args.includes('-c')) return { promise: Promise.resolve('/home/synthetic') };
    if (args.at(-1) === 'capabilities') return { promise: Promise.resolve(JSON.stringify({ schema: 'rockstaros.linux-text-capability/1', protocol: abi, maximumOutputTokens: 1024, maximumDeadlineMs: 120000, platform: 'linux', architecture: 'aarch64' })) };
    if (args.at(-1) === 'run') {
      counters.dispatched++; const task = deferred(); pending.push({ ...task, request: JSON.parse(options.input), timeout: options.timeout });
      return { promise: task.promise };
    }
    if (args.includes('stop')) { counters.stopped++; return { promise: Promise.resolve(JSON.stringify({confirmed:stopConfirmed})) }; }
    throw Error('Unexpected fixture process');
  } };
  let manager = await createLinuxLocalManager({ stateDir: dir, environment });
  const journalDir = join(dir, 'common-journal');
  const journal = await openNodeExecutorJournal(journalDir);
  t.after(async () => { for (const p of pending) p.resolve('{"cancelled":true}'); await manager.close(); await journal.close(); await rm(dir, { recursive: true, force: true }); });
  const request = () => ({ id: crypto.randomUUID(), threadId: crypto.randomUUID(), input: '合成の依頼', agent, model: { id: model.id, scheme: 'gguf-sha256', sha256: model.sha256 }, deadline: Date.now() + 60000, maxOutputTokens: 64 });
  const driver = () => createPixelLinuxExecutor({ manager });
  const kernel = () => createTextExecutor({ owner: journal.owner, journal, driver: driver(), authorize: async binding => { counters.authorized++; return binding; },
    host: async () => describeAdapter('synthetic-linux', 'host', 'linux', { 'identity.owner-local': true, 'store.cas': true }), output: { describe: async () => describeAdapter('synthetic-screen', 'output', 'linux', { 'output.text': true }) } });
  const wait = async () => { for (let i = 0; i < 100 && !pending.length; i++) await new Promise(resolve => setTimeout(resolve, 2)); assert.ok(pending.length); return pending.at(-1); };
  const finish = p => p.resolve(JSON.stringify({ text: '合成のPixel成果', modelSha256: model.sha256, durationMs: 2, platform: 'linux', architecture: 'aarch64' }));
  return { dir, model, agent, journal, request, driver, kernel, counters, pending, wait, finish, setAbi(value) { abi = value; }, setStopConfirmed(value) { stopConfirmed = value; }, setExecutionGuard(value) { environment.assertExecutionAllowed = value; }, get manager() { return manager; }, async reopen() { await manager.close(); manager = await createLinuxLocalManager({ stateDir: dir, environment }); } };
}

