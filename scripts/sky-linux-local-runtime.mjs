import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, stat, chmod, open, unlink } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beginLinuxRun, finishLinuxRun, cancelLinuxRun, confirmLinuxRun, parseLinuxAgent, linuxRunExport, linuxLocalPrice } from '../lib/sky-linux-local.ts';
import { isLocalRuntimeRequest } from '../lib/sky-private-loopback.mjs';
import { parseLinuxModel, parseLinuxAgentFile } from '../lib/sky-linux-models.ts';
import { inspectLinuxModelLink } from './sky-linux-model-link.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VM = 'sky-private';
const PINNED_RUNTIME_URL = 'https://github.com/ggml-org/llama.cpp/releases/download/b11723/llama-b11723-bin-ubuntu-arm64.tar.gz';
/** Local lock files may select only the reviewed public runtime, never a network destination. */
export function linuxRuntimeDownloadUrl(value) {
  if (value !== PINNED_RUNTIME_URL) throw new Error('実行環境の取得元が確認済みの版と一致しません。');
  return PINNED_RUNTIME_URL;
}

const PHASES = { none: 'モデルを追加してください', added: 'モデルを追加しました。Linuxの環境を準備してください', preparing: 'Linuxの環境を準備しています', ready: '使えます', stopped: 'Linuxは停止しています。再開するには環境を準備してください', failed: '準備できませんでした' };
const STATES = { active: '文章を作っています', review: '成果の確認待ち', completed: '確認済み', cancelled: '停止済み' };
async function sha(path) { const h = createHash('sha256'); for await (const c of createReadStream(path)) h.update(c); return h.digest('hex'); }
function command(args, { input, timeout = 240000 } = {}) {
  const child = spawn('limactl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  const promise = new Promise((done, fail) => {
    let out = '', err = ''; let overflow = false;
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('error', error => { clearTimeout(timer); fail(error); });
    child.stdout.on('data', c => { out += c; if (out.length > 150000) { overflow = true; child.kill('SIGKILL'); } });
    child.stderr.on('data', c => { err = (err + c).slice(-8000); });
    child.on('close', code => { clearTimeout(timer); if (code === 0 && !overflow) done(out.trim()); else fail(new Error('Linuxの処理が完了しませんでした。環境を確認してください。', { cause: err })); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
  return { child, promise };
}

/** The local OS account owns this private store. No account or raw prompt is shared with a cloud service. */
export async function createLinuxLocalManager({ root = ROOT, stateDir = join(ROOT, 'work/sky-linux-private'), exec = command, environment = null } = {}) {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await chmod(stateDir, 0o700);
  const lock = JSON.parse(await readFile(join(root, 'toolkits/sky-linux-local/runtime-lock.json'), 'utf8'));
  let catalog = [];
  try { catalog = JSON.parse(await readFile(join(root, 'toolkits/sky-linux-local/models.json'), 'utf8')).models.map(parseLinuxModel); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const worker = join(root, 'toolkits/sky-linux-local/worker.py');
  const owner = `local-uid:${userInfo().uid}`;
  // Fail closed on concurrent servers. A dead process lock is reclaimable, without restarting jobs.
  const guardPath = join(stateDir, 'manager.lock');
  const boot = process.platform === 'linux' ? (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim() : null;
  const identity = async pid => {
    try {
      try { process.kill(pid, 0); } catch (error) { if (error.code !== 'EPERM') throw error; }
      const start = boot ? (await readFile(`/proc/${pid}/stat`, 'utf8')).split(') ').slice(1).join(') ').split(' ')[19] : null;
      return { pid, boot, start };
    } catch (error) { if (['ESRCH', 'ENOENT'].includes(error.code)) return null; throw error; }
  };
  const ownGuard = JSON.stringify(await identity(process.pid));
  const acquire = async () => { const guard = await open(guardPath, 'wx', 0o600); await guard.writeFile(ownGuard); await guard.close(); };
  try { await acquire(); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const prior = JSON.parse(await readFile(guardPath, 'utf8'));
    const pid = typeof prior === 'number' ? prior : prior.pid;
    // A previous boot cannot own a live lock, even if its PID is now a protected system process.
    const actual = boot && typeof prior !== 'number' && prior.boot !== boot ? null : await identity(pid);
    let occupied = actual && (typeof prior !== 'number' ? JSON.stringify(prior) === JSON.stringify(actual) : true);
    if (occupied && boot && typeof prior === 'number') {
      // Migrate the earlier PID-only Pixel lock without confusing a reused PID
      // after guest reboot with this private Node server.
      occupied = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').includes(join(root, 'server.mjs'));
    }
    if (occupied) throw new Error('本人用Linuxは別のSky画面で使用中です。そちらを閉じてください。');
    await unlink(guardPath);
    await acquire();
  }
  const storePath = join(stateDir, 'state.json');
  let state;
  try { state = JSON.parse(await readFile(storePath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; state = { schema: 1, owner, phase: 'none', models: [], agents: [], runs: [], error: null }; }
  if (state.owner !== owner || state.schema !== 1) throw new Error('保存された本人情報を確認してください。');
  // Existing jobs and prompt agents keep their exact original model identity.
  state.selectedModelId ??= state.models[0]?.id ?? lock.model.id;
  state.preparedModels ??= state.phase === 'ready' && (!state.environment?.modelSha256 || state.environment.modelSha256 === lock.model.sha256) ? [lock.model.id] : [];
  state.models = state.models.map(m => ({ ...([lock.model, ...catalog].find(c => c.id === m.id && c.sha256 === m.sha256)), ...m }));
  const modelById = id => state.models.find(m => m.id === id);
  const candidateById = id => [lock.model, ...catalog].find(m => m.id === id);
  const runtimeLock = model => ({ ...lock, model });
  let writing = Promise.resolve(), preparation, prepareAbort, active, closed = false, mutating = false, inspecting = false;
  const persist = () => {
    const body = JSON.stringify(state);
    writing = writing.then(async () => { const temp = storePath + '.tmp'; await writeFile(temp, body, { mode: 0o600 }); await rename(temp, storePath); });
    return writing;
  };
  const spawnShell = (args, options) => environment ? environment.spawn(args, options) : exec(['shell', VM, '--', ...args], options);
  const shell = (args, options) => spawnShell(args, options).promise;
  const jsonShell = async (args, options) => JSON.parse(await shell(args, options));
  let home;
  const guestHome = async () => home ??= await shell(['python3', '-c', 'from pathlib import Path; print(Path.home())']);
  const stopProcess = async id => jsonShell(['python3', `${await guestHome()}/sky-private/worker.py`, 'stop', id], { timeout: 12000 });
  const snapshot = () => ({ schema: 'sky.private-linux-deployment/1', vm: environment?.id ?? VM, private: true,
    phase: state.phase, phaseLabel: environment?.phaseLabels?.[state.phase] ?? PHASES[state.phase], error: state.error,
    candidate: { ...lock.model, available: undefined, cacheBlob: undefined },
    candidates: [lock.model, ...catalog].filter(c => !state.models.some(m => m.sha256 === c.sha256 && m.id !== c.id)).map(m => ({ ...m, cacheBlob: undefined })),
    selectedModelId: state.selectedModelId, preparedModels: state.preparedModels,
    preparation: state.preparation ?? null,
    models: state.models, agents: state.agents, price: linuxLocalPrice, environment: state.environment ?? null,
    runs: state.runs.map(r => ({ ...r, stateLabel: r.stop === 'requested' ? '停止を確認しています' : r.stop === 'unconfirmed' ? '停止できたか未確認' : r.error ? '実行できませんでした' : STATES[r.job.status] })) });
  // Reconcile interrupted work before allowing another execution. Never retry inference automatically.
  for (const run of state.runs) {
    if (run.job.status === 'active' || ['requested', 'unconfirmed'].includes(run.stop)) {
      Object.assign(run, cancelLinuxRun(run));
      try { const stopped = await stopProcess(run.job.id); run.stop = stopped.confirmed ? 'confirmed' : 'unconfirmed'; }
      catch { run.stop = 'unconfirmed'; }
      run.error = '前のSkyが終了しました。同じ依頼は自動で再実行しません。';
    }
  }
  if (state.phase === 'preparing') { state.phase = 'failed'; state.error = '環境の準備が中断されました。もう一度準備してください。'; }
  if (state.phase === 'ready' && environment?.bootId && state.environment?.bootId !== environment.bootId) {
    state.phase = 'stopped'; state.error = 'Linuxが再起動しました。環境を準備してから依頼してください。';
    state.preparedModels = [];
  }
  await persist();

  async function prepare(model, signal) {
    if (environment) {
      const prepared = await environment.prepare(runtimeLock(model), worker, { signal, onProgress: progress => {
        state.preparation = { modelId: model.id, label: String(progress.label ?? '準備しています').slice(0, 140),
          receivedBytes: Number(progress.receivedBytes) || 0, totalBytes: model.bytes };
      } });
      if (prepared.errorCode === 'memory-too-small') throw new Error('Linuxのメモリが足りません。Terminalの詳細設定で4GBに変更して再起動してください。');
      if (!prepared.ready || prepared.platform !== 'linux' || prepared.architecture !== 'aarch64' || prepared.modelSha256 !== model.sha256)
        throw new Error('端末内Linuxの実行確認ができませんでした。');
      if (signal.aborted) throw new Error('準備を停止しました。');
      state.preparedModels = [...new Set([...state.preparedModels, model.id])];
      state.phase = 'ready'; state.error = null; state.environment = prepared;
      return;
    }
    if (model.id !== lock.model.id) throw new Error('追加したAIの準備は、今回のPixel内Linuxから行ってください。');
    const source = join(homedir(), '.ollama/models/blobs', lock.model.cacheBlob);
    const info = await stat(source);
    if (info.size !== lock.model.bytes || await sha(source) !== lock.model.sha256)
      throw new Error('追加するモデルを確認できません。このPCの対応モデルを用意してください。');
    const vms = await exec(['list', '--json']).promise;
    const listed = vms.split('\n').filter(Boolean).map(line => JSON.parse(line));
    const vm = listed.find(item => item.name === VM);
    if (!vm || vm.status !== 'Running') await exec(vm ? ['start', VM, '--tty=false'] : ['start', '--name=' + VM, '--vm-type=vz', '--cpus=2', '--memory=4', '--disk=16', '--containerd=none', '--mount-none', '--tty=false', 'template:debian'], { timeout: 600000 }).promise;
    // Fixed infrastructure commands only, never an Agent-supplied installer or shell.
    await shell(['sudo', 'apt-get', 'update']);
    await shell(['sudo', 'apt-get', 'install', '-y', '--no-install-recommends', 'libgomp1']);
    const base = `${await guestHome()}/sky-private`;
    await shell(['mkdir', '-p', base + '/runtime']);
    await shell(['chmod', '700', base]);
    const archive = join(stateDir, 'runtime.tar.gz');
    let cached = false;
    try { cached = (await stat(archive)).size === lock.bytes && await sha(archive) === lock.sha256; } catch { /* Fetch the exact pinned public file. */ }
    if (!cached) {
      const response = await fetch(linuxRuntimeDownloadUrl(lock.url), { signal: AbortSignal.timeout(120000) });
      if (!response.ok || !response.body) throw new Error('実行環境を取得できませんでした。');
      const file = await open(archive + '.part', 'w', 0o600);
      let size = 0;
      try { for await (const chunk of response.body) { size += chunk.length; if (size > lock.bytes) throw new Error('実行環境の容量が一致しません。'); await file.write(chunk); } }
      finally { await file.close(); }
      if (size !== lock.bytes || await sha(archive + '.part') !== lock.sha256) throw new Error('実行環境の確認に失敗しました。');
      await rename(archive + '.part', archive);
    }
    for (const [src, dest] of [[archive, 'runtime.tar.gz'], [source, 'model.gguf'], [worker, 'worker.py'], [join(root, 'toolkits/sky-linux-local/runtime-lock.json'), 'runtime-lock.json']])
      await exec(['copy', src, `${VM}:${base}/${dest}`]).promise;
    await shell(['tar', '-xzf', base + '/runtime.tar.gz', '-C', base + '/runtime']);
    const prepared = await jsonShell(['python3', base + '/worker.py', 'prepare']);
    if (!prepared.ready || prepared.platform !== 'linux' || prepared.architecture !== 'aarch64' || prepared.modelSha256 !== lock.model.sha256)
      throw new Error('Linuxの実行確認ができませんでした。');
    state.phase = 'ready'; state.error = null;
    state.environment = prepared;
    state.preparedModels = [...new Set([...state.preparedModels, model.id])];
  }
  async function stopRun(run) {
    if (!run || ['completed'].includes(run.job.status)) throw new Error('停止する仕事を選んでください。');
    if (run.job.status === 'cancelled' && run.stop === 'confirmed') return;
    Object.assign(run, cancelLinuxRun(run));
    run.stop = 'requested'; await persist();
    try { const result = await stopProcess(run.job.id); run.stop = result.confirmed ? 'confirmed' : 'unconfirmed'; }
    catch { run.stop = 'unconfirmed'; }
    await persist();
  }
  async function runAgent(agent, input, requestId, handoff) {
    if (state.phase !== 'ready' || active || preparation || state.runs.some(r => r.stop === 'unconfirmed')) throw new Error('準備中か、前の仕事の停止が未確認です。');
    if (state.runs.length >= 100) throw new Error('仕事の保存上限です。成果を持ち出してから保存先を整理してください。');
    const model = modelById(agent.modelId);
    if (!model || !state.preparedModels.includes(model.id)) throw new Error('この担当が使うAIを先に準備してください。担当・実行の設定から選べます。');
    const run = beginLinuxRun(agent, input, requestId, model.sha256);
    if (handoff) { run.surface = 'eve'; run.handoff = handoff; }
    run.modelName = model.name;
    state.runs.unshift(run); await persist();
    const child = spawnShell(['python3', `${await guestHome()}/sky-private/worker.py`, 'run'], {
      input: JSON.stringify({ jobId: requestId, modelId: model.id, modelSha256: run.modelSha256, instructions: agent.instructions, input }), timeout: 200000,
    });
    active = { id: run.job.id, child, done: null };
    const task = child.promise.then(async raw => {
      const output = JSON.parse(raw);
      if (run.stop === 'none' && run.job.status === 'active') {
        if (output.cancelled || output.platform !== 'linux' || output.architecture !== 'aarch64') throw new Error('Linuxでの成果を確認できませんでした。');
        Object.assign(run, finishLinuxRun(run, output));
      }
    }).catch(async () => {
      if (run.stop === 'none') {
        run.error = '文章を作れませんでした。依頼を短くするか、環境を準備し直してください。';
        await stopRun(run);
      }
    }).finally(async () => { active = null; await persist(); });
    active.done = task;
  }
  async function action(input) {
    if (closed || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('画面を開き直してください。');
    if (Object.keys(input).some(k => !['action', 'modelId', 'model', 'link', 'promptFormat', 'accepted', 'agent', 'agentFile', 'agentId', 'input', 'requestId', 'jobId', 'surface', 'agentSha256', 'modelSha256'].includes(k))) throw new Error('操作の項目を確認してください。');
    if (input.action === 'status') return snapshot();
    if (input.action === 'inspect-model') {
      if (active || preparation) throw new Error('今の仕事や準備が終わるか、停止してから別のAIを確認してください。');
      if (inspecting) throw new Error('前のAIの配布情報を確認しています。少しお待ちください。');
      inspecting = true;
      try { return { ...snapshot(), inspectedModel: await inspectLinuxModelLink(input.link, { promptFormat: input.promptFormat }) }; }
      finally { inspecting = false; }
    }
    if (mutating) throw new Error('前の操作を保存しています。少し待ってください。');
    mutating = true;
    try {
      if (input.action === 'add-model') {
        if (input.accepted !== true) throw new Error('AIの配布元と利用条件を確認してください。');
        const model = input.model ? parseLinuxModel(input.model) : candidateById(input.modelId);
        if (!model) throw new Error('追加するAIを選んでください。');
        const prior = modelById(model.id);
        if (prior && ['sha256', 'bytes', 'promptFormat', 'repository', 'revision', 'file', 'license', 'memoryMiB'].some(k => (prior[k] ?? null) !== (model[k] ?? null))) throw new Error('同じ名前のAIの設定が異なります。別の名前で追加してください。');
        if (!prior) {
          if (state.models.length >= 8 || state.models.reduce((sum, m) => sum + m.bytes, 0) + model.bytes > 6 * 1024 ** 3) throw new Error('AIの保存上限です。追加前に保存容量を確認してください。');
          state.models.push({ ...model });
        }
        state.selectedModelId = model.id;
        if (state.phase === 'none') state.phase = 'added';
      } else if (input.action === 'select-model') {
        if (!modelById(input.modelId)) throw new Error('追加済みのAIを選んでください。');
        state.selectedModelId = input.modelId;
      } else if (input.action === 'prepare') {
        if (!state.models.length || input.accepted !== true) throw new Error('モデルの追加と環境準備を確認してください。');
        if (active || preparation) throw new Error('実行中か、準備中です。');
        const model = modelById(input.modelId ?? state.selectedModelId);
        if (!model) throw new Error('準備するAIを選んでください。');
        state.selectedModelId = model.id;
        state.preparedModels = state.preparedModels.filter(id => id !== model.id);
        state.phase = 'preparing'; state.error = null; state.preparation = { modelId: model.id, label: '必要な環境を確認しています', receivedBytes: 0, totalBytes: model.bytes };
        prepareAbort = new AbortController();
        preparation = prepare(model, prepareAbort.signal).catch(error => { state.phase = prepareAbort.signal.aborted ? 'stopped' : 'failed'; state.error = prepareAbort.signal.aborted ? null : error.message; }).finally(async () => { preparation = null; state.preparation = null; await persist(); });
      } else if (input.action === 'add-agent' || input.action === 'import-agent') {
        if (input.action === 'import-agent' && input.accepted !== true) throw new Error('担当の名前・役割・使うAIを確認してください。');
        const agent = parseLinuxAgent(input.action === 'import-agent' ? parseLinuxAgentFile(input.agentFile) : input.agent);
        if (!state.models.some(m => m.id === agent.modelId)) throw new Error('この担当が使うAIを先に追加してください。');
        if (state.agents.length >= 32) throw new Error('担当は32件までです。保存する担当を整理してから追加してください。');
        const hash = createHash('sha256').update(JSON.stringify(agent)).digest('hex');
        if (!state.agents.some(a => a.sha256 === hash)) state.agents.push({ ...agent, id: randomUUID(), sha256: hash });
      } else if (input.action === 'run') {
        if (input.accepted !== true || typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.requestId)) throw new Error('料金・保存・実行を確認してください。');
        const agent = state.agents.find(a => a.id === input.agentId);
        if (!agent) throw new Error('担当を選んでください。');
        if (input.surface !== undefined && input.surface !== 'eve') throw new Error('依頼の入口を確認してください。');
        const handoff = input.surface === 'eve' ? { agentSha256: input.agentSha256, modelSha256: input.modelSha256 } : null;
        if (handoff && (handoff.agentSha256 !== agent.sha256 || handoff.modelSha256 !== modelById(agent.modelId)?.sha256))
          throw new Error('Skyで選んだ担当かAIが変わりました。内容と料金を確認し直してください。');
        const prior = state.runs.find(r => r.job.id === input.requestId);
        if (prior) {
          if (prior.agent.id !== agent.id || prior.inputSha256 !== createHash('sha256').update(String(input.input)).digest('hex')) throw new Error('同じ依頼番号の内容が異なります。');
          if ((prior.surface ?? null) !== (input.surface ?? null)) throw new Error('同じ依頼番号の入口が異なります。');
        } else {
          await runAgent(agent, input.input, input.requestId, handoff);
          state.runs[0].inputSha256 = createHash('sha256').update(input.input).digest('hex');
        }
      } else if (input.action === 'stop-environment') {
        if (preparation) { prepareAbort.abort(); await preparation; }
        if (active) { const done = active.done; await stopRun(state.runs.find(r => r.job.id === active.id)); await done; }
        if (environment) await environment.stop();
        else {
          await exec(['stop', VM, '--tty=false'], { timeout: 60000 }).promise;
          const listed = (await exec(['list', '--json']).promise).split('\n').filter(Boolean).map(line => JSON.parse(line));
          if (listed.find(v => v.name === VM)?.status !== 'Stopped') throw new Error('Linuxの停止を確認できませんでした。');
        }
        for (const run of state.runs) if (run.job.status === 'cancelled') run.stop = 'confirmed';
        state.phase = 'stopped';
        state.preparedModels = [];
      } else if (input.action === 'export-agent') {
        const agent = state.agents.find(a => a.id === input.agentId);
        if (!agent) throw new Error('保存する担当を選んでください。');
        return { filename: 'Skyの担当.json', text: JSON.stringify({ schema: 'sky.local-agent/1', name: agent.name, instructions: agent.instructions, modelId: agent.modelId }, null, 2) };
      } else if (input.action === 'export-model') {
        const model = modelById(input.modelId);
        if (!model?.repository) throw new Error('このAIは以前の専用形式です。配布元から対応する設定ファイルを用意してください。');
        return { filename: 'SkyのAI設定.json', text: JSON.stringify(parseLinuxModel(model), null, 2) };
      } else if (input.action === 'stop') {
        await stopRun(state.runs.find(r => r.job.id === input.jobId));
      } else if (input.action === 'confirm') {
        const run = state.runs.find(r => r.job.id === input.jobId);
        if (!run) throw new Error('確認する成果を選んでください。');
        Object.assign(run, confirmLinuxRun(run));
      } else if (input.action === 'export') {
        const run = state.runs.find(r => r.job.id === input.jobId);
        if (!run) throw new Error('保存する成果を選んでください。');
        return { filename: 'Skyの成果.txt', text: linuxRunExport(run), record: { ...run, schema: 'sky.owner-linux-work-export/1' } };
      } else throw new Error('対応する操作を選んでください。');
      await persist(); return snapshot();
    } finally { mutating = false; }
  }
  async function close() {
    if (closed) return;
    closed = true;
    if (preparation) { prepareAbort.abort(); await preparation; }
    if (active) { const done = active.done; await stopRun(state.runs.find(r => r.job.id === active.id)); await done; }
    await writing; await unlink(guardPath);
  }
  return { action, snapshot, close };
}

/** Development middleware only; never included in deployed Worker routes. */
export function createSkyLinuxLocalPlugin() {
  let managerPromise;
  const get = () => managerPromise ??= createLinuxLocalManager();
  return {
    name: 'sky-owner-linux-local', apply: 'serve',
    async buildEnd() { if (managerPromise) await (await managerPromise).close(); },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== '/__sky/linux') return next();
        const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(data)); };
        const address = server.httpServer?.address();
        if (!address || typeof address === 'string' || !isLocalRuntimeRequest(request, address.port)) return send(403, { error: 'このPCで開いているSkyから操作してください。' });
        if (request.method !== 'POST' || request.headers['content-type'] !== 'application/json') return send(405, { error: 'Skyの画面から操作してください。' });
        try {
          let raw = '';
          for await (const chunk of request) { raw += chunk.toString(); if (Buffer.byteLength(raw) > 32000) return send(413, { error: '入力が長すぎます。' }); }
          return send(200, await (await get()).action(JSON.parse(raw)));
        } catch (error) { return send(400, { error: error.message }); }
      });
    },
  };
}
