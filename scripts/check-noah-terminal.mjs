import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { noahTerminalTemplate } from '../lib/noah-terminal-template.ts';
import { writeNoahArchive } from '../lib/noah-source-archive.ts';
import { engineSocket } from './noah-isolated-runtime.mjs';
import { runCommand } from './noah-source-fetch.mjs';

if (!process.argv.includes('--live')) throw new Error('Use --live against the owned localhost preview.');
const base = new URL(process.env.NOAH_TEST_BASE_URL || 'http://127.0.0.1:3107');
if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.pathname !== '/' || base.search || base.username || base.password) throw new Error('Localhost only.');
const outputIndex = process.argv.indexOf('--output');
const output = path.resolve((outputIndex >= 0 ? process.argv[outputIndex + 1] : null) || 'work/verification/noah-terminal-20261117/live.json');
const evidence = { at: new Date().toISOString(), base: base.origin, scope: 'owned-local-preview', stages: [], externalAgentAcceptance: 0 };
let owner;
async function api(url, options = {}) {
  const response = await fetch(base.origin + url, { ...options, headers: { ...(options.method ? { Origin: base.origin, 'X-Rock-Owner-Scope': owner.ownerScope } : {}), ...options.headers }, signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${url}: ${response.status}: ${data.error}`);
  return data;
}
const post = (url, value) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
async function wait(check, timeout = 270000) {
  const start = Date.now();
  for (;;) { const result = await check(); if (result) return result; if (Date.now() - start > timeout) throw new Error('Observation timeout; inspect saved job before retrying.'); await new Promise(r => setTimeout(r, 1000)); }
}
async function register(t) {
  const id = randomUUID(), form = new FormData();
  form.set('id', id); form.set('manifest', JSON.stringify(t.manifest)); form.set('rightsConfirmed', 'true'); form.set('source', new File([t.bytes], t.name));
  const { agent } = await api('/api/noah/agents', { method: 'POST', body: form });
  evidence.stages.push({ phase: 'registered', id, manifestSha256: agent.manifestSha256, sourceSha256: agent.source.sha256 });
  await post(`/__noah/installations/${id}/connect`, {});
  await wait(async () => { const { installation: s } = await api(`/__noah/installations/${id}`); if (s.state === 'failed') throw new Error(s.message); return s.state === 'connected'; });
  return id;
}
async function execute(id, prompt) {
  const input = { id: randomUUID(), agentId: id, prompt };
  await post('/__noah/executions', input);
  evidence.stages.push({ phase: 'started', uploadId: id, jobId: input.id });
  const job = await wait(async () => { const { job } = await api(`/__noah/executions/${input.id}`); return ['queued', 'running'].includes(job.noahExecution.state) ? null : job; });
  assert.equal(job.noahExecution.state, 'returned', job.noahExecution.error);
  assert.equal(job.noahExecution.result.exitCode, 0);
  const repeated = await post('/__noah/executions', input); assert.equal(repeated.job.id, job.id); assert.equal(repeated.job.revision, job.revision);
  evidence.stages.push({ phase: 'returned', uploadId: id, jobId: job.id, source: job.noahExecution.source,
    calls: job.noahExecution.calls, text: job.noahExecution.result.text, files: job.noahExecution.result.files.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })), replaySameRevision: true });
  return job;
}
try {
  owner = await api('/api/noah/catalog/owner'); assert.ok(owner.localHostOwner);
  if (!process.argv.includes('--only-stop')) {
  const security = noahTerminalTemplate('node'); security.manifest.name = '画面非接続の隔離確認（合成試験）'; security.manifest.runtime.model = 'none';
  const code = `import fs from 'node:fs'; import net from 'node:net';
const checks = {nonRoot:process.getuid()!==0, noDisplay:!process.env.DISPLAY&&!process.env.WAYLAND_DISPLAY, noBus:!process.env.DBUS_SESSION_BUS_ADDRESS,
noHostHome:!fs.existsSync('/Users')&&!fs.existsSync('/Volumes'), noDesktopSocket:!fs.existsSync('/tmp/.X11-unix'), noDaemonSocket:!fs.existsSync('/var/run/docker.sock'), noInputDevice:!fs.existsSync('/dev/input')};
checks.networkBlocked=await new Promise(resolve=>{const s=net.connect({host:'1.1.1.1',port:443});s.setTimeout(1000);s.once('connect',()=>{s.destroy();resolve(false)});s.once('error',()=>resolve(true));s.once('timeout',()=>{s.destroy();resolve(true)});});
console.log(JSON.stringify({type:'result',text:JSON.stringify(checks),files:[],exitCode:Object.values(checks).every(Boolean)?0:1}));
`;
  security.bytes = writeNoahArchive([{ name: 'main.mjs', bytes: new TextEncoder().encode(code), os: 0, attrs: 0 }]);
  const securityId = await register(security);
  try { const job = await execute(securityId, '画面・host・networkの隔離を確認する'); assert.ok(Object.values(JSON.parse(job.noahExecution.result.text)).every(Boolean)); }
  finally { await post(`/__noah/installations/${securityId}/disconnect`, {}); }
  for (const language of ['node', 'python']) {
    const t = noahTerminalTemplate(language); t.manifest.name = `ターミナル${language}・実モデル確認`;
    const id = await register(t);
    try { const job = await execute(id, '日本語で短い挨拶を一文だけ書いてください。'); assert.equal(job.noahExecution.calls, 1); assert.ok(job.noahExecution.result.text.trim()); assert.equal(job.noahExecution.result.files[0].name, 'result.txt'); }
    finally { await post(`/__noah/installations/${id}/disconnect`, {}); }
  }
  }
  const stoppable = noahTerminalTemplate('node'); stoppable.manifest.name = '停止確認・画面なし（合成試験）'; stoppable.manifest.runtime.model = 'none';
  stoppable.bytes = writeNoahArchive([{ name: 'main.mjs', bytes: new TextEncoder().encode('setInterval(()=>{},1000);'), os: 0, attrs: 0 }]);
  const stopId = await register(stoppable), stopJob = randomUUID();
  const containers = async () => (await runCommand('docker', ['--host', engineSocket(process.env.NOAH_TEST_ROOT || '/Volumes/avokado'), 'ps', '--filter', 'name=noah-terminal-run-', '--format', '{{.Names}}'], { timeout: 10000 })).trim().split('\n').filter(Boolean);
  try {
    assert.equal((await containers()).length, 0);
    await post('/__noah/executions', { id: stopJob, agentId: stopId, prompt: '停止を検証する' });
    const liveContainers = await wait(async () => { const list = await containers(); return list.length ? list : null; }, 30000);
    const stopped = await post(`/__noah/executions/${stopJob}/stop`, {});
    assert.equal(stopped.job.noahExecution.state, 'cancelled');
    assert.equal((await containers()).length, 0);
    evidence.stages.push({ phase: 'stop-confirmed', uploadId: stopId, jobId: stopJob, liveContainers, remainingContainers: 0 });
  } finally { await post(`/__noah/installations/${stopId}/disconnect`, {}); }
  evidence.passed = true;
} catch (e) { evidence.passed = false; evidence.error = e.message; process.exitCode = 1; }
finally { await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(evidence, null, 2)); }
console.log(JSON.stringify({ passed: evidence.passed, error: evidence.error, stages: evidence.stages.length, output }));
