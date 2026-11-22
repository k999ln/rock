// Explicit local acceptance only: synthetic accounts/approval, real HTTP and containers.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  launchFixture,
  buyer,
  credential,
} from '../tests/helpers/noah-launch-fixture.mjs';
import { noahTerminalTemplate } from '../lib/noah-terminal-template.ts';
import { writeNoahArchive } from '../lib/noah-source-archive.ts';
import { createNoahLaunchApi } from '../lib/noah-launch.ts';
import { createNoahReleaseApi } from '../lib/noah-release.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';

if (!process.argv.includes('--live'))
  throw new Error(
    'Use --live for owned local acceptance. No production endpoint is used.',
  );
const option = (name) => process.argv[process.argv.indexOf(name) + 1];
for (const arg of ['--root', '--engine-home', '--runner'])
  if (!process.argv.includes(arg)) throw new Error('Missing ' + arg);
const root = path.resolve(option('--root')),
  engineDirectory = path.resolve(option('--engine-home'));
const { createMacRunner, runnerClient } = await import(
  pathToFileURL(path.resolve(option('--runner'))).href
);
const cleanups = [],
  template = noahTerminalTemplate('node');
template.manifest.runtime.model = 'none';
const code = `import {createHash} from 'node:crypto';import fs from 'node:fs';import net from 'node:net';import {createInterface} from 'node:readline';
const input=JSON.parse((await createInterface({input:process.stdin})[Symbol.asyncIterator]().next()).value);
if(input.prompt==='wait-for-stop'){setInterval(()=>{},1000);}
else {const checks={nonRoot:process.getuid()!==0,noDisplay:!process.env.DISPLAY&&!process.env.WAYLAND_DISPLAY,noHost:!fs.existsSync('/Users')&&!fs.existsSync('/Volumes'),noCredentials:!process.env.OPENAI_API_KEY&&!process.env.NOAH_RUNNER_HOME,noDaemon:!fs.existsSync('/var/run/docker.sock')};
checks.noNetwork=await new Promise(resolve=>{const s=net.connect({host:'1.1.1.1',port:443});s.setTimeout(1000);s.once('connect',()=>{s.destroy();resolve(false)});s.once('error',()=>resolve(true));s.once('timeout',()=>{s.destroy();resolve(true)});});
const bytes=Buffer.from('Noah Mac acceptance: '+input.prompt+'\\n');
const file={name:'result.txt',base64:bytes.toString('base64'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
console.log(JSON.stringify({type:'result',text:JSON.stringify(checks),files:[file],exitCode:Object.values(checks).every(Boolean)?0:1}));process.exit(0);}
`;
template.bytes = writeNoahArchive([
  { name: 'main.mjs', bytes: new TextEncoder().encode(code), os: 0, attrs: 0 },
]);
const f = await launchFixture(
  { after: (fn) => cleanups.push(fn) },
  { sourceTemplate: template, registerThroughApi: true },
);
assert.equal((await f.approved()).status, 200);
const auth = async (r) => {
  if (r.headers.get('authorization') !== 'Bearer ' + credential)
    throw new Error('UNAUTHORIZED');
  return buyer;
};
const deps = { ...f.deps, authenticate: auth },
  launch = createNoahLaunchApi(deps),
  release = createNoahReleaseApi(deps);
let address, runner;
const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 170000) throw new Error('too large');
      chunks.push(c);
    }
    const url = address + req.url,
      r = new Request(url, {
        method: req.method,
        headers: req.headers,
        ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
      }),
      u = new URL(url);
    let reply;
    if (u.pathname === '/api/noah/runner') reply = await launch(r, true);
    else if (u.pathname === '/api/noah/launch') reply = await launch(r);
    else if (u.pathname === '/api/noah/releases')
      reply = await release.describe(r);
    else
      reply = await release.download(
        r,
        decodeURIComponent(u.pathname.split('/')[4]),
      );
    res.writeHead(reply.status, Object.fromEntries(reply.headers));
    res.end(Buffer.from(await reply.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end('{}');
  }
});
const result = {
  at: new Date().toISOString(),
  scope:
    'synthetic accounts, local HTTP, real headless container; existing VM dependency',
  secondMac: false,
  phases: [],
};
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  address = 'http://127.0.0.1:' + server.address().port;
  const api = runnerClient(address, credential);
  runner = await createMacRunner({
    root,
    engineDirectory,
    api,
    platform: 'darwin-arm64',
  });
  const scope = await ownerScopeFor(buyer);
  async function post(body) {
    const r = await fetch(address + '/api/noah/launch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: address,
          Authorization: 'Bearer ' + credential,
          'X-Rock-Owner-Scope': scope,
        },
        body: JSON.stringify(body),
      }),
      data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));
    return data;
  }
  const connect = await post({
    action: 'connect',
    id: randomUUID(),
    deviceId: runner.deviceId,
    agentId: 'release-' + f.p.manifestSha256,
  });
  await runner.tick();
  assert.equal(
    (await f.service.overview(buyer)).commands.find((c) => c.id === connect.id)
      .state,
    'succeeded',
  );
  result.phases.push('connected-reviewed-release');
  const run = await post({
    action: 'run',
    id: randomUUID(),
    deviceId: runner.deviceId,
    connectionId: connect.id,
    prompt: 'isolation-check',
  });
  await runner.tick();
  const job = await f.jobs.get(buyer, run.id);
  assert.equal(job.noahExecution.state, 'returned', job.noahExecution.error);
  const checks = JSON.parse(job.noahExecution.result.text);
  assert.ok(Object.values(checks).every(Boolean));
  const detail = await fetch(address + '/api/noah/launch?work=' + run.id, {
    headers: { Authorization: 'Bearer ' + credential },
  });
  assert.equal(detail.status, 200);
  const saved = await detail.json();
  assert.equal(saved.ownerScope, scope);
  assert.equal(saved.commands[0].id, run.id);
  const expected = Buffer.from('Noah Mac acceptance: isolation-check\n');
  const [file] = saved.jobs[0].noahExecution.result.files;
  assert.equal(file.name, 'result.txt');
  assert.equal(file.bytes, expected.length);
  assert.deepEqual(Buffer.from(file.base64, 'base64'), expected);
  assert.equal(
    file.sha256,
    createHash('sha256').update(expected).digest('hex'),
  );
  result.phases.push({
    executed: checks,
    workId: run.id,
    file: file.name,
    sha256: file.sha256,
  });
  const stop = await post({
      action: 'run',
      id: randomUUID(),
      deviceId: runner.deviceId,
      connectionId: connect.id,
      prompt: 'wait-for-stop',
    }),
    active = runner.tick();
  for (let i = 0; i < 100; i++) {
    if ((await f.jobs.get(buyer, stop.id))?.noahExecution.state === 'running')
      break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(
    (await f.jobs.get(buyer, stop.id))?.noahExecution.state,
    'running',
  );
  await post({ action: 'stop', id: stop.id });
  await active;
  assert.equal(
    (await f.jobs.get(buyer, stop.id)).noahExecution.state,
    'cancelled',
  );
  result.phases.push('running-process-cancelled');
  await post({ action: 'stop', id: connect.id });
  await runner.tick();
  assert.equal(
    (await f.service.overview(buyer)).commands.find((c) => c.id === connect.id)
      .state,
    'cancelled',
  );
  result.phases.push('connection-disconnected');
  result.passed = true;
  console.log(JSON.stringify(result));
} catch (e) {
  result.error = e.message;
  throw e;
} finally {
  await runner?.close();
  await new Promise((resolve) => server.close(resolve));
  for (const cleanup of cleanups.reverse()) await cleanup();
  await mkdir(path.join(root, 'acceptance'), { recursive: true });
  await writeFile(
    path.join(root, 'acceptance/result.json'),
    JSON.stringify(result, null, 2),
  );
}
