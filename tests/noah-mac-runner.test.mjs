import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readFile, mkdir, writeFile, chmod, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  launchFixture,
  buyer,
  credential,
} from './helpers/noah-launch-fixture.mjs';
import { createNoahLaunchApi } from '../lib/noah-launch.ts';
import { createNoahReleaseApi } from '../lib/noah-release.ts';
import {
  createMacRunner,
  runnerClient,
  runnerOrigin,
  boundedResponse,
  saveRunnerConfig,
  readRunnerConfig,
} from '../scripts/noah-mac-runner.mjs';
import { createTerminalInstallations } from '../scripts/noah-terminal-installations.mjs';
import { installMacRunner } from '../scripts/noah-mac-install.mjs';
import { runnerPlist } from '../scripts/noah-mac-service.mjs';

async function folder(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'noah-launch-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
void test('runner prepares reviewed bytes, executes only one claimed request, and acknowledges teardown', async (t) => {
  const f = await launchFixture(t);
  await f.approved();
  const root = await folder(t);
  let count = 0,
    stops = 0;
  // These synthetic credentials belong only to this test's in-memory database.
  const deps = {
    ...f.deps,
    authenticate: async (r) => {
      if (r.headers.get('authorization') !== 'Bearer ' + credential)
        throw new Error('UNAUTHORIZED');
      return buyer;
    },
  };
  const launch = createNoahLaunchApi(deps),
    release = createNoahReleaseApi(deps);
  const transport = async (url, options) => {
    assert.equal(options.redirect, 'error');
    const r = new Request(url, options),
      u = new URL(url);
    if (u.pathname === '/api/noah/runner') return launch(r, true);
    if (u.pathname === '/api/noah/releases') return release.describe(r);
    return release.download(r, decodeURIComponent(u.pathname.split('/')[4]));
  };
  const terminal = createTerminalInstallations({
    root,
    prepare: async (options) => {
      assert.equal(options.expectedSha, f.hash);
      return {
        execution: { image: 'sha256:' + 'a'.repeat(64) },
        run: async (_p, signal) => {
          signal.throwIfAborted();
          count++;
          return { text: 'Synthetic runner output', files: [], exitCode: 0 };
        },
        stop: async () => {
          stops++;
        },
      };
    },
  });
  const catalog = { close: async () => {} };
  const runner = await createMacRunner({
    root,
    api: runnerClient('https://avoado.si', credential, transport),
    platform: 'darwin-arm64',
    prepareTerminal: terminal,
    prepareCatalog: catalog,
  });
  t.after(() => runner.close());
  const enqueue = (values) =>
    f.service.enqueue(buyer, {
      id: randomUUID(),
      deviceId: runner.deviceId,
      ...values,
    });
  const c = await enqueue({
    action: 'connect',
    agentId: 'release-' + f.p.manifestSha256,
  });
  await runner.tick();
  assert.equal(
    (await f.service.overview(buyer)).commands.find((v) => v.id === c.id).state,
    'succeeded',
  );
  const r = await enqueue({
    action: 'run',
    connectionId: c.id,
    prompt: 'fixture',
  });
  await runner.tick();
  await runner.tick();
  assert.equal(count, 1);
  assert.equal(
    (await f.jobs.get(buyer, r.id)).noahExecution.result.text,
    'Synthetic runner output',
  );
  await f.service.stop(buyer, c.id);
  await runner.tick();
  assert.equal(stops, 1);
  assert.equal(
    (await f.service.overview(buyer)).commands.find((v) => v.id === c.id).state,
    'cancelled',
  );
});

void test('origin and response limits prevent credential redirects or unbounded source reads', async () => {
  assert.equal(runnerOrigin('https://avoado.si'), 'https://avoado.si');
  assert.equal(
    runnerOrigin('http://127.0.0.1:3999', true),
    'http://127.0.0.1:3999',
  );
  for (const value of [
    'http://avoado.si',
    'https://avoado.si:444',
    'https://user@avoado.si',
    'https://avoado.si.evil.test',
    'http://127.0.0.1:3999',
    'https://avoado.si/path',
  ])
    assert.throws(() => runnerOrigin(value));
  await assert.rejects(boundedResponse(new Response('oversize'), 4));
  await assert.rejects(
    runnerClient('https://avoado.si', credential).json('https://wrong.example'),
  );
});

void test('runner credentials reject links and group-readable files', async (t) => {
  const dir = await folder(t), file = path.join(dir, 'account.json');
  await saveRunnerConfig(file, { token: credential });
  await symlink(file, path.join(dir, 'symbolic.json'));
  await assert.rejects(readRunnerConfig(path.join(dir, 'symbolic.json')));
  await link(file, path.join(dir, 'hard.json'));
  await assert.rejects(readRunnerConfig(file), /通常ファイル/);
  await rm(path.join(dir, 'hard.json'));
  await chmod(file, 0o640);
  await assert.rejects(readRunnerConfig(file), /権限600/);
  await chmod(file, 0o600);
  assert.equal((await readRunnerConfig(file)).token, credential);
});

void test('installation validates hashes, handles spaced paths, and needs no repository or SSD', async (t) => {
  const dir = await folder(t),
    source = path.join(dir, 'source'),
    target = path.join(dir, 'new account', 'Noah');
  await mkdir(path.join(source, 'scripts/noah-agent-runtime'), {
    recursive: true,
  });
  const files = {
    'scripts/noah-mac-runner.mjs': 'export const fixture=true;',
    'scripts/noah-agent-runtime/README.txt': 'fixture',
  };
  for (const [name, bytes] of Object.entries(files))
    await writeFile(path.join(source, name), bytes);
  await writeFile(
    path.join(source, 'manifest.json'),
    JSON.stringify({
      schema: 'noah-mac-distribution/1',
      platform: 'darwin-arm64',
      files: Object.fromEntries(
        Object.entries(files).map(([n, b]) => [
          n,
          createHash('sha256').update(b).digest('hex'),
        ]),
      ),
    }),
  );
  const installed = await installMacRunner({
    source,
    target,
    platform: 'darwin',
    arch: 'arm64',
  });
  assert.match(await readFile(installed.bin, 'utf8'), /NOAH_RUNNER_HOME=/);
  assert.equal(
    await readFile(
      path.join(target, 'scripts/noah-agent-runtime/README.txt'),
      'utf8',
    ),
    'fixture',
  );
  await saveRunnerConfig(path.join(target, 'account.json'), {
    token: credential,
  });
  assert.equal(
    (await readRunnerConfig(path.join(target, 'account.json'))).token,
    credential,
  );
  await writeFile(path.join(source, 'scripts/noah-mac-runner.mjs'), 'tampered');
  await assert.rejects(
    installMacRunner({ source, target, platform: 'darwin', arch: 'arm64' }),
    /hash/,
  );
  const plist = runnerPlist({
    root: target,
    node: '/usr/bin/node',
    entry: '/tmp/a & b/run.mjs',
  });
  assert.ok(plist.includes('a &amp; b'));
  assert.ok(!plist.includes('<key>KeepAlive</key><true/>'));
});
