import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { noahTerminalTemplate } from '../lib/noah-terminal-template.ts';
import { parseNoahAgentManifest, noahAgentTemplate } from '../lib/noah-agent-upload.ts';
import { parseTerminalRuntime } from '../lib/noah-terminal-contract.mjs';
import { createNoahWork, updateNoahWork } from '../lib/noah-execution.ts';
import { createExecutionManager } from '../scripts/noah-executions.mjs';
import { createTerminalInstallations, terminalSourceLoader } from '../scripts/noah-terminal-installations.mjs';
import { terminalSource, terminalContainerArgs } from '../scripts/noah-terminal-runtime.mjs';
import { createNoahLocalAppManager } from '../scripts/noah-local-apps.mjs';
import { aniccaContainerArgs } from '../scripts/noah-anicca-runtime.mjs';
import { sha256, InstallError } from '../scripts/noah-source-fetch.mjs';

const scope = 'owner-v1:' + 'a'.repeat(64);
const until = async fn => { for (let i = 0; i < 100; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 5)); } assert.fail('did not settle'); };

void test('templates declare headless Node/Python entrypoints and preserve legacy manifest hashes', async () => {
  assert.equal(JSON.stringify(parseNoahAgentManifest(noahAgentTemplate)), JSON.stringify(noahAgentTemplate));
  for (const language of ['node', 'python']) {
    const t = noahTerminalTemplate(language), m = parseNoahAgentManifest(t.manifest);
    const s = await terminalSource(t.name, t.bytes, sha256(t.bytes), m.runtime);
    assert.equal(s.runtime.language, language); assert.equal(s.project.tests.length, 1);
    assert.ok(s.project.files.some(f => f.name === s.entry));
    assert.ok(s.project.files.some(f => f.name === 'noah-agent.json'));
  }
});

void test('runtime cannot declare host commands, devices, display, network or external credentials', () => {
  const t = noahTerminalTemplate('node').manifest;
  for (const patch of [{ command: 'open Safari' }, { display: ':0' }, { model: 'https://elsewhere.example' }, { entrypoint: '../host.mjs' },
    { entrypoint: '/host.mjs' }, { entrypoint: '--eval.mjs' }, { entrypoint: 'a/../main.mjs' }, { entrypoint: 'a\\main.mjs' }, { language: 'shell' }]) {
    assert.throws(() => parseTerminalRuntime({ ...t.runtime, ...patch }));
  }
  for (const permissions of [['network'], ['external_account'], ['financial']]) assert.throws(() => parseNoahAgentManifest({ ...t, permissions }));
  assert.throws(() => parseNoahAgentManifest({ ...t, adapter: 'web', endpointUrl: 'https://example.com/' }));
});

void test('source bytes and declared entrypoint are checked before any process starts', async () => {
  const t = noahTerminalTemplate('node');
  await assert.rejects(terminalSource(t.name, t.bytes, '0'.repeat(64), t.manifest.runtime), { status: 409 });
  await assert.rejects(terminalSource(t.name, t.bytes, sha256(t.bytes), { ...t.manifest.runtime, entrypoint: 'missing.mjs' }), { status: 422 });
});

void test('template processes get only their readonly source volume, no host desktop and no network', async () => {
  const t = noahTerminalTemplate('python'), s = await terminalSource(t.name, t.bytes, sha256(t.bytes), t.manifest.runtime);
  const args = terminalContainerArgs('noah-unit', 'sha256:' + 'a'.repeat(64), 'noah-terminal-' + randomUUID(), s.project, s.entry, 'python');
  for (const [key, value] of [['--network', 'none'], ['--user', '10001:10001'], ['--cap-drop', 'ALL'], ['--security-opt', 'no-new-privileges']]) assert.equal(args[args.indexOf(key) + 1], value);
  assert.match(args[args.indexOf('--mount') + 1], /^type=volume,src=noah-terminal-[a-f0-9-]+,dst=\/input,volume-nocopy,readonly$/);
  assert.ok(args.includes('DISPLAY=')); assert.ok(args.includes('WAYLAND_DISPLAY=')); assert.ok(args.includes('DBUS_SESSION_BUS_ADDRESS='));
  for (const flag of ['--privileged', '--device', '--publish', '--volume', '-v', '--env-file']) assert.ok(!args.includes(flag));
  assert.throws(() => terminalContainerArgs('x', 'x', '/Users/host', s.project, s.entry, 'python'));
});

function fixture() {
  const t = noahTerminalTemplate('node'), id = randomUUID(); t.manifest.runtime.model = 'none';
  const agent = { id, manifest: t.manifest, manifestSha256: sha256(JSON.stringify(t.manifest)), source: { sha256: sha256(t.bytes), bytes: t.bytes.length, name: t.name }, uploadState: 'ready' };
  let preparations = 0, executions = 0, stops = 0, deleted = false;
  const runtime = { execution: { image: 'sha256:' + 'a'.repeat(64), model: 'none' }, async run() { executions++; return { text: 'actual test result', files: [], exitCode: 0 }; }, async stop() { stops++; } };
  const installations = createTerminalInstallations({ root: '/unused', prepare: async () => { preparations++; return runtime; } });
  const load = async () => { if (deleted) throw new InstallError('missing', 404); return { agent, bytes: t.bytes }; };
  return { id, agent, installations, load, get preparations() { return preparations; }, get executions() { return executions; }, get stops() { return stops; }, remove: () => { deleted = true; } };
}

void test('repeated connection prepares once; another owner cannot execute or stop it; deletion denies dispatch', async () => {
  const f = fixture();
  await Promise.all(Array.from({ length: 10 }, () => f.installations.connect(scope, f.id, f.load)));
  await until(async () => (await f.installations.get(scope, f.id)).state === 'connected');
  await f.installations.execution(scope, f.id);
  await assert.rejects(f.installations.execution('other', f.id));
  await f.installations.disconnect('other', f.id); assert.equal(f.stops, 0);
  f.remove(); await assert.rejects(f.installations.execution(scope, f.id), { status: 404 });
  await f.installations.disconnect(scope, f.id); assert.equal(f.stops, 1); await f.installations.close();
});

void test('template result uses existing Work and repeated start never reexecutes the pinned code', async () => {
  const f = fixture(); await f.installations.connect(scope, f.id, f.load); await until(async () => (await f.installations.get(scope, f.id)).state === 'connected');
  const manager = createExecutionManager(f.installations), saved = new Map();
  const work = async (action, input) => {
    if (action === 'get') { if (!saved.has(input.id)) throw new InstallError('missing', 404); return { job: saved.get(input.id) }; }
    const job = action === 'create' ? await createNoahWork(input.id, input.binding) : await updateNoahWork(saved.get(input.id), { ...input, action });
    saved.set(job.id, job); return { job };
  };
  const request = { id: randomUUID(), agentId: f.id, prompt: 'Test request' };
  await Promise.all(Array.from({ length: 10 }, () => manager.start(scope, request, work, async () => {})));
  await until(() => saved.get(request.id)?.noahExecution.state === 'returned');
  assert.equal(f.executions, 1);
  const job = saved.get(request.id); assert.equal(job.noahExecution.model, 'none'); assert.equal(job.noahExecution.source.sourceSha256, f.agent.source.sha256);
  const replay = await manager.start(scope, request, work, async () => {}); assert.equal(replay.job.revision, job.revision); assert.equal(replay.job.noahExecution.state, 'returned');
  assert.equal(job.noahExecution.calls, 0); assert.equal(job.status, 'review'); assert.equal(job.steps[0].passed, false);
  await assert.rejects(manager.start(scope, { ...request, prompt: 'different' }, work, async () => {}), { status: 409 });
  await manager.close(); await f.installations.close();
});

void test('owned source loader rejects changed account and wrong content pin without following redirects', async () => {
  const f = fixture(), incoming = { headers: { host: '127.0.0.1:3107' } };
  let downloads = 0;
  const fetcher = async (url, options) => { assert.equal(options.redirect, 'error'); if (!url.endsWith('/source')) return Response.json({ agent: f.agent, ownerScope: scope }); downloads++; return new Response('bad', { headers: { 'x-content-sha256': '0'.repeat(64) } }); };
  await assert.rejects(terminalSourceLoader(incoming, scope, f.id, async () => ({ ownerScope: 'other', localHostOwner: true }), fetcher)(true), { status: 403 });
  assert.equal(downloads, 0);
  await assert.rejects(terminalSourceLoader(incoming, scope, f.id, async () => ({ ownerScope: scope, localHostOwner: true }), fetcher)(true), { status: 409 });
});

void test('legacy Anicca path never spawns a Mac process; new adapter has no host desktop mount', async () => {
  const app = createNoahLocalAppManager({ root: '/unused' });
  await assert.rejects(app.connect(), /隔離/);
  assert.equal((await app.status()).state, 'setup_required'); assert.equal((await app.disconnect()).state, 'stopped');
  const args = aniccaContainerArgs('sha256:fixed');
  assert.equal(args.includes('--mount'), false); assert.ok(args.includes('DISPLAY='));
  assert.equal(args[args.indexOf('--network') + 1], 'none');
});
