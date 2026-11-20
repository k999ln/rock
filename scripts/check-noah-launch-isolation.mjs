import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  launchFixture,
  buyer,
  credential,
} from '../tests/helpers/noah-launch-fixture.mjs';
import { noahTerminalTemplate } from '../lib/noah-terminal-template.ts';
import { writeNoahArchive } from '../lib/noah-source-archive.ts';
import { createNoahLaunchApi } from '../lib/noah-launch.ts';
import { createNoahReleaseApi } from '../lib/noah-release.ts';
import { createMacRunner, runnerClient } from '../scripts/noah-mac-runner.mjs';
import { engineSocket } from './noah-isolated-runtime.mjs';
import { VALIDATION_IMAGES } from './noah-project-validation.mjs';
import { runCommand } from './noah-source-fetch.mjs';
import { createTerminalInstallations } from '../scripts/noah-terminal-installations.mjs';
// Opt-in integration check: uses an existing local engine and images only.
// API, identities, approval and source storage are synthetic and in memory.
const args = process.argv.slice(2),
  rootIndex = args.indexOf('--root');
const engineRoot = rootIndex >= 0 ? args[rootIndex + 1] : null;
if (!engineRoot || !engineRoot.startsWith('/'))
  throw new Error(
    'Usage: node --experimental-strip-types scripts/check-noah-launch-isolation.mjs --root /absolute/existing/noah/root',
  );
const dockerArgs = ['--host', engineSocket(engineRoot)];
await runCommand('docker', [...dockerArgs, 'info'], { timeout: 15000 });
await runCommand(
  'docker',
  [...dockerArgs, 'image', 'inspect', VALIDATION_IMAGES.node],
  { timeout: 15000 },
);
const cleanup = [];
try {
  const sourceTemplate = noahTerminalTemplate('node');
  sourceTemplate.manifest.runtime.model = 'none';
  const code = `import {createInterface} from 'node:readline';
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]();const input=JSON.parse((await lines.next()).value);if(input.prompt==='wait-for-stop'){setInterval(()=>{},1000);await new Promise(()=>{});}
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createConnection} from 'node:net';
const checks={nonRoot:process.getuid()!==0,noDisplay:!process.env.DISPLAY&&!process.env.WAYLAND_DISPLAY&&!process.env.DBUS_SESSION_BUS_ADDRESS&&!process.env.XAUTHORITY,noHostPaths:['/Users','/Volumes','/tmp/.X11-unix','/dev/input','/var/run/docker.sock'].every(p=>!existsSync(p)),noCapabilities:/CapEff:\\s+0+\\n/.test(readFileSync('/proc/self/status','utf8')),noNewPrivileges:/NoNewPrivs:\\s+1/.test(readFileSync('/proc/self/status','utf8'))};
try {writeFileSync('/input/unwanted','test');checks.readOnlySource=false;}catch{checks.readOnlySource=true;}
try {writeFileSync('/unwanted','test');checks.readOnlyRoot=false;}catch{checks.readOnlyRoot=true;}
checks.networkBlocked=await new Promise(resolve=>{const s=createConnection({host:'1.1.1.1',port:443});const done=x=>{s.destroy();resolve(x);};s.setTimeout(1200,()=>done(true));s.on('error',()=>done(true));s.on('connect',()=>done(false));});
console.log(JSON.stringify({type:'result',text:JSON.stringify(checks),files:[],exitCode:Object.values(checks).every(Boolean)?0:1}));process.exit(0);`;
  sourceTemplate.bytes = writeNoahArchive([
    {
      name: 'main.mjs',
      bytes: new TextEncoder().encode(code),
      os: 0,
      attrs: 0,
    },
  ]);
  const f = await launchFixture(
    { after: (fn) => cleanup.push(fn) },
    { sourceTemplate },
  );
  await f.approved();
  const root = await mkdtemp(tmpdir() + '/noah-cycle-');
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const deps = {
    ...f.deps,
    authenticate: async (r) => {
      assert.equal(r.headers.get('authorization'), 'Bearer ' + credential);
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
  const runner = await createMacRunner({
    root,
    api: runnerClient('https://avoado.si', credential, transport),
    platform: 'darwin-arm64',
    prepareTerminal: createTerminalInstallations({ root: engineRoot }),
    prepareCatalog: { close: async () => {} },
  });
  cleanup.push(() => runner.close());
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
  const state = async (id) =>
    (await f.service.overview(buyer)).commands.find((v) => v.id === id).state;
  assert.equal(await state(c.id), 'succeeded');
  console.log('connect: passed');
  const r = await enqueue({
    action: 'run',
    connectionId: c.id,
    prompt: 'Synthetic isolation verification',
  });
  await runner.tick();
  await runner.tick();
  const job = await f.jobs.get(buyer, r.id);
  assert.equal(
    job.noahExecution.state,
    'returned',
    JSON.stringify(job.noahExecution),
  );
  const checks = JSON.parse(job.noahExecution.result.text);
  assert.ok(Object.values(checks).every(Boolean), JSON.stringify(checks));
  console.log('execution and saved result:', checks);
  const processes = async () =>
    new Set(
      (
        await runCommand(
          'docker',
          [
            ...dockerArgs,
            'ps',
            '--filter',
            'name=noah-terminal-run-',
            '--format',
            '{{.ID}}',
          ],
          { timeout: 15000 },
        )
      )
        .trim()
        .split('\n')
        .filter(Boolean),
    );
  const before = await processes();
  const waiting = await enqueue({
    action: 'run',
    connectionId: c.id,
    prompt: 'wait-for-stop',
  });
  const active = runner.tick();
  let owned = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    owned = [...(await processes())].filter((id) => !before.has(id));
    if (owned.length) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(
    owned.length,
    'Test execution container must actually be running before stop',
  );
  assert.equal(await state(waiting.id), 'claimed');
  const stopAt = Date.now();
  await f.service.stop(buyer, waiting.id);
  await active;
  assert.equal(await state(waiting.id), 'cancelled');
  const stopMs = Date.now() - stopAt;
  const remaining = await processes();
  assert.ok(
    owned.every((id) => !remaining.has(id)),
    'Stopped execution containers must be gone',
  );
  console.log('active stop: passed', stopMs + 'ms');
  await f.service.stop(buyer, c.id);
  await runner.tick();
  assert.equal(await state(c.id), 'cancelled');
  console.log('disconnect: passed');
  console.log(
    JSON.stringify(
      {
        date: new Date().toISOString(),
        scope:
          'Real isolated Docker runtime; synthetic in-memory API/account/review; no external provider or production',
        connect: true,
        run: true,
        resultSaved: true,
        disconnect: true,
        activeStop: true,
        stopMs,
        checks,
      },
      null,
      2,
    ),
  );
} finally {
  for (const fn of cleanup.reverse()) await fn();
}
