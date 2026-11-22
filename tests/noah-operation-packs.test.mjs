import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, symlink, unlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { noahOperationPacks, noahOperationCandidates } from '../lib/noah-operation-packs.ts';
import { parseSkyAgentSettings } from '../lib/sky-agent-library.ts';

void test('Noah operation packs ship existing runtimes and preserve their boundaries after extraction', { timeout: 90_000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'noah-packs-test-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const build = ['--experimental-strip-types', 'scripts/package-noah-operations.mjs', '--out', temporary];
  const info = JSON.parse(execFileSync(process.execPath, build, { encoding: 'utf8' }));
  const check = JSON.parse(execFileSync(process.execPath, [...build, '--check'], { encoding: 'utf8' }));
  assert.equal(info.sha256, check.sha256);
  assert.throws(() => execFileSync(process.execPath, build, { stdio: 'pipe' }), /Command failed/);
  execFileSync('python3', ['-c', 'import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:z.extractall(sys.argv[2])', info.path, temporary]);
  const root = join(temporary, 'noah-agent-operations-0.1.0');
  const runtime = await import(pathToFileURL(join(root, 'noah.mjs')).href);
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));

  await t.test('three packs contain seven valid disabled Agent settings and eleven unconnected candidates', async () => {
    const packs = noahOperationPacks();
    assert.equal(packs.length, 3);
    assert.equal(packs.flatMap(p => p.roles).length, 7);
    assert.equal(noahOperationCandidates().length, 11);
    assert.ok(noahOperationCandidates().every(c => c.runnable === false));
    for (const pack of packs) {
      assert.deepEqual(JSON.parse(await readFile(join(root, `packs/${pack.id}/manifest.json`), 'utf8')), pack);
      for (const role of pack.roles) {
        const settings = parseSkyAgentSettings(JSON.parse(await readFile(join(root, `packs/${pack.id}/agents/${role.id}.json`), 'utf8')));
        assert.equal(settings.enabled, false);
        assert.equal(settings.provider, 'local-model');
      }
    }
    assert.ok(Object.keys(lock.files).some(p => p === 'toolkits/mr/vendor/mr/provenance.json'));
    assert.ok(Object.keys(lock.files).every(p => !/(?:node_modules|\.env|\.db(?:-|$)|\.key$|pairing\.json)/.test(p)));
    assert.equal((await runtime.verifyBundle()).files, info.files - 1);
  });

  await t.test('isolated distribution runs all four MR tools over MCP and the brand planning fixture', async () => {
    const result = JSON.parse(execFileSync(process.execPath, [join(root, 'noah.mjs'), 'demo'], { encoding: 'utf8', timeout: 30_000 }));
    assert.equal(result.results.length, 5);
    assert.ok(result.results.every(r => r.passed));
    assert.equal(result.results.at(-1).externalEffects, 0);
    assert.equal(result.results.at(-1).duplicateRun, false);
    assert.equal(result.realModelInference, false);
  });

  await t.test('changed bytes and symlinks fail before starting a connector', async () => {
    const path = join(root, 'toolkits/mr/mcp_server.py');
    const original = await readFile(path);
    try {
      await writeFile(path, Buffer.concat([original, Buffer.from('\n# changed\n')]));
      await assert.rejects(runtime.startPack('article-editing', { origin: 'http://localhost:3000', port: 0 }), /hash mismatch/);
      await unlink(path);
      await symlink(resolve('toolkits/mr/mcp_server.py'), path);
      await assert.rejects(runtime.verifyBundle(), /Invalid package file/);
    } finally { await rm(path, { force: true }); await writeFile(path, original); }
    await assert.rejects(runtime.startPack('youtube-script-writer', { origin: 'http://localhost:3000' }), /Unknown operation pack/);
    await assert.rejects(runtime.startPack('article-editing', { origin: 'https://example.com/path' }), /exact HTTPS origin/);
  });

  async function client(session) {
    const base = `http://127.0.0.1:${session.port}`;
    const origin = 'http://localhost:3000';
    assert.equal((await fetch(`${base}/servers`, { headers: { Origin: origin } })).status, 401);
    assert.equal((await fetch(`${base}/health`, { headers: { Origin: 'https://other.example' } })).status, 403);
    const response = await fetch(`${base}/connect`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 200);
    const { token } = await response.json();
    const request = (path, body, method = 'POST') => fetch(`${base}${path}`, { method,
      headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return request;
  }

  await t.test('pack connector enforces authentication, origin and one-use approval and stops its child', async () => {
    const session = await runtime.startPack('article-editing', { origin: 'http://localhost:3000', port: 0 });
    let child;
    try {
      const request = await client(session);
      const listed = await (await request('/servers', undefined, 'GET')).json();
      assert.deepEqual(listed.servers.map(s => s.id), ['rock-star-mr']);
      const connected = await (await request('/servers/rock-star-mr/connect', {})).json();
      assert.equal(connected.passport.tools.length, 4);
      child = session.hub.entry('rock-star-mr').transport.process;
      const input = { name: 'coconala_check', arguments: { brief: '単発の記事。面談不要。', proposal: '文章を作ります。' } };
      assert.equal((await request('/servers/rock-star-mr/execute', { ...input, confirmed: true })).status, 403);
      const prepared = await (await request('/servers/rock-star-mr/prepare', input)).json();
      const call = { ...input, confirmed: true, approvalToken: prepared.approvalToken };
      assert.equal((await request('/servers/rock-star-mr/execute', call)).status, 200);
      assert.equal((await request('/servers/rock-star-mr/execute', call)).status, 403);
    } finally { await session.close(); }
    assert.ok(child.exitCode !== null || child.signalCode !== null);
    assert.equal(session.server.listening, false);
  });

  await t.test('brand state stays outside the package and resumes the same run after restart with no Provider effects', async () => {
    const stateDir = join(temporary, 'private-brand');
    const input = { run_id: 'persistent-package-example', worldview: '合成試験用の世界観', product_design: '合成試験のシャツ', region: '日本' };
    for (const repeat of [false, true]) {
      const session = await runtime.startPack('brand-operations', { origin: 'http://localhost:3000', port: 0, stateDir });
      try {
        const request = await client(session);
        const connected = await (await request('/servers/fashion-brand-ops/connect', {})).json();
        assert.ok(connected.passport.tools.length >= 41);
        const spec = session.hub.entry('fashion-brand-ops').spec;
        assert.deepEqual(spec.envNames, ['FASHION_BRAND_DB_PATH', 'ROCKSTAR_TENANT_ID']);
        const response = await session.hub.rpc('fashion-brand-ops', 'tools/call', { name: 'fashion.producer.start', arguments: input });
        assert.notEqual(response.isError, true);
        assert.equal(response.structuredContent.idempotent_replay, repeat);
        assert.equal(response.structuredContent.external_effects_executed, false);
      } finally { await session.close(); }
    }
    assert.ok((await readdir(stateDir)).includes('fashion.db'));
    await runtime.verifyBundle();
  });
});
