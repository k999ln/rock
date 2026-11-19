import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseLinuxModel, parseLinuxAgentFile } from '../lib/sky-linux-models.ts';
import { createLinuxLocalManager } from '../scripts/sky-linux-local-runtime.mjs';
import { inspectLinuxModelLink } from '../scripts/sky-linux-model-link.mjs';
const model = JSON.parse(await readFile(new URL('../toolkits/sky-linux-local/models.json', import.meta.url))).models[0];
const wait = async manager => { for (let i = 0; i < 100 && manager.snapshot().phase === 'preparing'; i++) await new Promise(r => setTimeout(r, 3)); };
void test('model links resolve public metadata to immutable files; never fetch another host or installer', async () => {
  const calls = [];
  const fetcher = async (url, options) => { calls.push(url); assert.equal(options.redirect, 'error'); return new Response(JSON.stringify({ id: model.repository, sha: model.revision, cardData: { license: 'apache-2.0' }, siblings: [{ rfilename: model.file, size: model.bytes, lfs: { sha256: model.sha256 } }] })); };
  const link = `https://huggingface.co/${model.repository}/blob/main/${model.file}`;
  const result = await inspectLinuxModelLink(link, { fetcher });
  assert.equal(result.revision, model.revision); assert.equal(result.sha256, model.sha256); assert.equal(result.bytes, model.bytes); assert.equal(result.id, 'hf-74a4da8c9fdbcd15bd1f6d01-chatml');
  for (const invalid of ['http://127.0.0.1/model', 'https://huggingface.co.evil.test/a/b/blob/main/x.gguf', 'https://user:pass@huggingface.co/a/b/blob/main/x.gguf', 'https://huggingface.co/a/b/blob/main/install.sh', 'https://huggingface.co/a/b/blob/main/../x.gguf']) await assert.rejects(inspectLinuxModelLink(invalid, { fetcher }));
  assert.equal(calls.length, 1);
  await assert.rejects(inspectLinuxModelLink(link, { fetcher: async () => new Response('{}') }), /利用条件/);
  await assert.rejects(inspectLinuxModelLink(link, { fetcher: async () => new Response('x'.repeat(1024 * 1024 + 1)) }), /大きい/);
});
void test('model packages are bounded data, fixed HF revision, no installer or permissions', () => {
  assert.match(parseLinuxModel(model).source, /^https:\/\/huggingface.co\//);
  for (const patch of [{ id: '../escape' }, { id: 'x..y' }, { revision: 'main' }, { file: '../model.gguf' }, { file: 'model.safetensors' }, { bytes: 2 ** 40 }, { memoryMiB: 99999 }, { source: 'http://127.0.0.1/' }, { repository: 'x/../../x' }, { command: 'sh install.sh' }, { runtime: 'untrusted' }, { permissions: ['root'] }, { promptFormat: 'code' }])
    assert.throws(() => parseLinuxModel({ ...model, ...patch }));
  assert.throws(() => parseLinuxAgentFile({ schema: 'sky.local-agent/1', code: 'shell' }));
});
void test('two models prepare independently; portable agents execute pinned model, export and stop', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sky-models-'));
  let current; const preparations = [], dispatches = [];
  const environment = { id: 'pixel-linux',
    async prepare(lock, worker, { onProgress }) { current = lock.model; preparations.push(current.id); onProgress({ label: '中身を確認しています', receivedBytes: 123 }); return { ready: true, platform: 'linux', architecture: 'aarch64', modelSha256: current.sha256 }; },
    async stop() {},
    spawn(args, options) {
      if (args.includes('-c')) return { promise: Promise.resolve('/home/test') };
      if (args.includes('stop')) return { promise: Promise.resolve('{"confirmed":true}') };
      const input = JSON.parse(options.input); dispatches.push(input);
      return { promise: Promise.resolve(JSON.stringify({ text: '作成した文章', durationMs: 12, modelSha256: input.modelSha256, platform: 'linux', architecture: 'aarch64' })) };
    } };
  const manager = await createLinuxLocalManager({ stateDir: dir, environment });
  try {
    const old = manager.snapshot().candidate;
    await manager.action({ action: 'add-model', modelId: old.id, accepted: true });
    await manager.action({ action: 'prepare', accepted: true }); await wait(manager);
    const custom = { ...model, id: 'another-compatible-text-model' };
    await manager.action({ action: 'add-model', model: custom, accepted: true });
    await manager.action({ action: 'import-agent', accepted: true, agentFile: { schema: 'sky.local-agent/1', name: '追加した担当', instructions: '短く整理', modelId: custom.id } });
    const agent = manager.snapshot().agents[0];
    await assert.rejects(manager.action({ action: 'run', accepted: true, agentId: agent.id, requestId: randomUUID(), input: '依頼' }), /先に準備/);
    await manager.action({ action: 'prepare', modelId: custom.id, accepted: true }); await wait(manager);
    assert.deepEqual(preparations, [old.id, custom.id]);
    await manager.action({ action: 'run', accepted: true, agentId: agent.id, requestId: randomUUID(), input: '依頼' });
    for (let i=0;i<30&&manager.snapshot().runs[0].job.status==='active';i++) await new Promise(r=>setTimeout(r,3));
    assert.equal(dispatches[0].modelId, custom.id); assert.equal(dispatches[0].modelSha256, model.sha256);
    const run = manager.snapshot().runs[0]; assert.equal(run.job.status, 'review');
    const definition = JSON.parse((await manager.action({ action: 'export-agent', agentId: agent.id })).text);
    assert.equal(definition.modelId, custom.id); assert.equal(definition.schema, 'sky.local-agent/1');
    assert.equal(JSON.parse((await manager.action({ action: 'export-model', modelId: custom.id })).text).revision, model.revision);
    await assert.rejects(manager.action({ action: 'add-model', accepted: true, model: { ...custom, promptFormat: 'llama3' } }), /設定が異な/);
    await manager.action({ action: 'stop-environment' }); assert.deepEqual(manager.snapshot().preparedModels, []);
    const exported = await manager.action({ action: 'export', jobId: run.job.id }); assert.match(exported.text, /作成した文章/);
    assert.equal(manager.snapshot().models.length, 2); assert.equal(manager.snapshot().agents.length, 1);
  } finally { await manager.close(); await rm(dir, { recursive: true, force: true }); }
});
void test('preparation can be cancelled without declaring the model ready or replaying work', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sky-prep-stop-'));
  let aborted = false;
  const manager = await createLinuxLocalManager({ stateDir: dir, environment: { id: 'pixel-linux', spawn() { throw new Error('no work'); }, async stop() {},
    prepare(lock, worker, { signal }) { return new Promise((resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')); }, { once: true })); } } });
  try {
    await manager.action({ action: 'add-model', modelId: model.id, accepted: true });
    await manager.action({ action: 'prepare', accepted: true }); assert.equal(manager.snapshot().phase, 'preparing');
    await manager.action({ action: 'stop-environment' }); assert.equal(aborted, true); assert.equal(manager.snapshot().phase, 'stopped'); assert.equal(manager.snapshot().runs.length, 0); assert.deepEqual(manager.snapshot().preparedModels, []);
  } finally { await manager.close(); await rm(dir, { recursive: true, force: true }); }
});
void test('Pixel downloader rejects mismatched files and unapproved redirects and removes partial data', () => {
  const result = spawnSync('python3', ['-c', `
import importlib.util, tempfile, json, hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('prep','toolkits/sky-linux-local/prepare-pixel.py')
prep=importlib.util.module_from_spec(spec);spec.loader.exec_module(prep)
with tempfile.TemporaryDirectory() as d:
 prep.ROOT=Path(d);dist=Path(d)/'dist';dist.mkdir()
 data=b'BAD!'+b'x'*1020
 (dist/'model.gguf').write_bytes(data)
 model={'id':'fixture-model','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 try: prep.acquire(model,dist);raise AssertionError('bad GGUF accepted')
 except ValueError: pass
 assert not (Path(d)/'models/fixture-model/model.part').exists()
 handler=prep.ModelRedirect()
 for url in ['http://huggingface.co/x','https://127.0.0.1/x','https://huggingface.co.evil.test/x','https://evil.test/x']:
  try: handler.redirect_request(None,None,302,'',{},url);raise AssertionError('redirect accepted')
  except ValueError: pass
`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

void test('verified local model reuses its only copy and clears interrupted leftovers without network',()=>{
  const result=spawnSync('python3',['-c',`
import importlib.util,tempfile,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('prep','toolkits/sky-linux-local/prepare-pixel.py')
prep=importlib.util.module_from_spec(spec);spec.loader.exec_module(prep)
with tempfile.TemporaryDirectory() as d:
 prep.ROOT=Path(d);folder=Path(d)/'models/fixture-model';folder.mkdir(parents=True)
 data=b'GGUF'+b'x'*1020;target=folder/'model.gguf';target.write_bytes(data)
 (folder/'model.part').write_bytes(b'old interrupted bytes')
 prep.urllib.request.build_opener=lambda *a: (_ for _ in ()).throw(AssertionError('network must not be used'))
 assert prep.acquire({'id':'fixture-model','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()},Path(d)/'missing-transfer')==target
 assert target.read_bytes()==data
 assert sorted(p.name for p in folder.iterdir())==['model.gguf']
`],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
