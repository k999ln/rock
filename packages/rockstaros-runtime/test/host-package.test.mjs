import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { nodeServiceFixture, unlock } from './helpers/node-service-fixture.mjs';
const exec = promisify(execFile);
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');

void test('standalone host package pairs over HTTP and another process reconciles a lost publication without repeating inference', { timeout: 60000 }, async t => {
  const f = await nodeServiceFixture(t);
  await exec(process.execPath, ['build.mjs'], { cwd: packageRoot });
  const destination = join(f.directory, 'distribution');
  await mkdir(destination);
  const packed = JSON.parse((await exec('npm', ['--cache', join(destination, '.npm-cache'), 'pack', '--json', '--ignore-scripts', '--pack-destination', destination], { cwd: packageRoot, env: { ...process.env, COPYFILE_DISABLE: '1' } })).stdout)[0];
  const archive = join(destination, packed.filename);
  const files = (await exec('tar', ['-tzf', archive])).stdout.trim().split('\n');
  assert.ok(files.every(path => path.startsWith('package/') && !path.split('/').includes('..') && !path.split('/').some(part => part.startsWith('._'))));
  assert.ok(files.includes('package/dist/service-host.mjs'));
  assert.ok(files.includes('package/dist/host-cli.mjs'));
  await exec('tar', ['-xzf', archive, '-C', destination]);
  const bundle = join(destination, 'package', 'dist');
  const inputs = JSON.parse(await readFile(join(bundle, 'build-inputs.json'), 'utf8'));
  assert.equal(inputs.nodeServiceBundleSha256, sha(await readFile(join(bundle, 'service-host.mjs'))));
  assert.equal(inputs.hostCliBundleSha256, sha(await readFile(join(bundle, 'host-cli.mjs'))));
  assert.equal(inputs.linuxManagerBundleSha256, sha(await readFile(join(bundle, 'linux-manager-executor.mjs'))));
  assert.equal(typeof (await import(pathToFileURL(join(bundle, 'linux-manager-executor.mjs')).href)).createPixelLinuxExecutor, 'function');
  for (const file of ['index.mjs', 'node-host.mjs', 'service-host.mjs', 'host-cli.mjs', 'linux-manager-executor.mjs']) {
    const text = await readFile(join(bundle, file), 'utf8');
    assert.doesNotMatch(text, /from ["']\.\.\//);
  }
  let dropReport = true, droppedReports = 0;
  const server = createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const value = body.length ? JSON.parse(body) : null;
      const result = await f.fetchImpl(f.origin + request.url, { method: request.method, headers: request.headers, body: request.method === 'GET' ? undefined : body, redirect: 'error' });
      if (value?.action === 'report' && dropReport && result.ok) {
        dropReport = false; droppedReports++;
        // The existing SQL publication committed. Lose only its HTTP response.
        response.destroy(); return;
      }
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(500); response.end('{}'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  f.origin = 'http://127.0.0.1:' + server.address().port;
  const children = [];
  t.after(async () => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const service = await import(pathToFileURL(join(bundle, 'service-host.mjs')).href);
  const directory = join(f.directory, 'standalone-host');
  await service.prepareNodeServiceHost({ directory, origin: f.origin, configuration: f.configuration, driver: f.driver });
  await service.connectNodeServiceHost({ directory, unlockPhrase: unlock(), driver: f.driver, onAuthorization: async ({ userCode }) => {
    assert.equal((await f.link.approve(userCode, 'synthetic-owner')).approved, true);
  } });
  const childFile = join(destination, 'receiver.mjs');
  await writeFile(childFile, `
import { createInterface } from 'node:readline';
import { openNodeServiceHost } from ${JSON.stringify(pathToFileURL(join(bundle, 'service-host.mjs')).href)};
import { describeAdapter } from ${JSON.stringify(pathToFileURL(join(bundle, 'index.mjs')).href)};
let generated=0, host;
const driver={describe:async()=>describeAdapter('node-ollama','executor',process.platform==='darwin'?'macos':'linux',{'text.generate':true,'model.pin':true}),generate:async request=>{generated++;return {text:'合成の別プロセス成果',model:request.model,durationMs:1};}};
try {
 for await (const line of createInterface({input:process.stdin,crlfDelay:Infinity})) {
  const request=JSON.parse(line);
  if(request.action==='open') {
   const phrase=Buffer.from(request.unlock);
   try {host=await openNodeServiceHost({directory:request.directory,unlockPhrase:phrase,driver});} finally {phrase.fill(0);}
   console.log(JSON.stringify({ready:true}));
  } else if(request.action==='cycle') console.log(JSON.stringify({results:await host.cycle(),generated}));
  else if(request.action==='close') {await host.close();host=null;console.log(JSON.stringify({closed:true,generated}));break;}
  else throw Error('UNKNOWN_FIXTURE_COMMAND');
 }
} catch(error) {console.log(JSON.stringify({errorCode:error.code??'FIXTURE_FAILED'}));process.exitCode=1;}
finally {await host?.close();}
`);
  async function childReceiver() {
    const child = spawn(process.execPath, [childFile], { cwd: destination, stdio: ['pipe', 'pipe', 'pipe'] });
    children.push(child);
    const lines = [], pending = []; let ended = false, stderr = '';
    child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-4000); });
    const stream = createInterface({ input: child.stdout });
    stream.on('line', line => {
      const next = pending.shift();
      if (next) next.resolve(JSON.parse(line));
      else lines.push(JSON.parse(line));
    });
    const done = new Promise(resolve => child.once('exit', (code, signal) => {
      ended = true;
      for (const next of pending.splice(0)) next.reject(Error('Fixture child exited: ' + code + '/' + signal + ' ' + stderr));
      resolve(code);
    }));
    const command = async value => {
      const answer = lines.length ? Promise.resolve(lines.shift()) : new Promise((resolve, reject) => { assert.equal(ended, false); pending.push({ resolve, reject }); });
      child.stdin.write(JSON.stringify(value) + '\n');
      if (value.action === 'close') child.stdin.end();
      return answer;
    };
    assert.deepEqual(await command({ action: 'open', directory, unlock: unlock().toString() }), { ready: true });
    return { command, done, child };
  }
  const first = await childReceiver();
  assert.deepEqual(await first.command({ action: 'cycle' }), { results: [], generated: 0 });
  const [presence] = await f.store.devices();
  const created = await f.enqueue(presence.deviceId);
  const initial = await first.command({ action: 'cycle' });
  assert.equal(initial.results[0].state, 'report_unknown');
  assert.equal(initial.generated, 1);
  assert.equal(droppedReports, 1);
  const [before] = await f.store.list();
  const beforeHistory = await f.history.get(before.threadId);
  assert.equal(beforeHistory.session.messages.length, 2);
  assert.deepEqual(await first.command({ action: 'close' }), { closed: true, generated: 1 });
  assert.equal(await first.done, 0);
  const second = await childReceiver();
  const resumed = await second.command({ action: 'cycle' });
  assert.equal(resumed.results.length, 1);
  assert.equal(resumed.results[0].id, initial.results[0].id);
  assert.equal(resumed.results[0].state, 'reported');
  assert.equal(resumed.results[0].reportState, 'review');
  assert.equal(resumed.generated, 0);
  assert.deepEqual((await second.command({ action: 'cycle' })).results, []);
  assert.deepEqual(await f.history.get(before.threadId), beforeHistory);
  assert.deepEqual(await f.store.list(), [before]);
  assert.equal((await f.store.pendingOwner()).length, 0);
  assert.equal(created.id, before.id);
  assert.deepEqual(await second.command({ action: 'close' }), { closed: true, generated: 0 });
  assert.equal(await second.done, 0);
  const executable = join(destination, 'rockstar-host');
  await symlink(join(bundle, 'host-cli.mjs'), executable);
  const status = JSON.parse((await exec(process.execPath, [executable, 'status', '--state-dir', directory], { cwd: destination })).stdout);
  assert.equal(status.status, 'linked');
  assert.equal(status.receiverState, 'not_checked');
  assert.doesNotMatch(JSON.stringify(status), /rock_session_|Synthetic owner unlock/);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM rockstar_device_sessions').get().n, 1);
  t.diagnostic('host-package-proof ' + JSON.stringify({
    schema: 'rockstaros.standalone-host-proof/1',
    archiveSha256: sha(await readFile(archive)),
    buildInputsSha256: sha(await readFile(join(bundle, 'build-inputs.json'))),
    serviceBundleSha256: inputs.nodeServiceBundleSha256,
    cliBundleSha256: inputs.hostCliBundleSha256,
    linuxManagerBundleSha256: inputs.linuxManagerBundleSha256,
    lostPublicationResponses: droppedReports,
    fixtureGenerationCalls: [initial.generated, resumed.generated],
    jobCount: (await f.store.list()).length,
    historyMessages: beforeHistory.session.messages.length,
    outputSha256: before.report.outputSha256,
    sameJobAndHistory: true,
    installedBinLinkAccepted: true,
    newRealInference: 0,
    newActualHostGrants: 0,
    physicalAcceptance: false,
    publicAcceptance: false,
  }));
});
