import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class ConnectionError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}
const hash = value => createHash('sha256').update(value).digest('hex');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);

export function createNoahConnectionManager({ directory, adapters, clock = { now: Date.now, setTimeout, clearTimeout } }) {
  const entries = new Map(), queues = new Map();
  let closing = false;
  function identify(context) {
    if (!/^owner-v1:[a-f0-9]{64}$/.test(context.ownerScope) || !uuid(context.agent?.id)) throw new ConnectionError('所有者を確認できません。', 403);
    const adapter = adapters.find(a => a.manifestSha256 === context.agent.manifestSha256);
    if (!adapter || context.agent.uploadState !== 'ready') return null;
    return { adapter, key: hash(context.ownerScope + '\0' + context.agent.id) };
  }
  async function locked(context, action) {
    if (closing) throw new ConnectionError('接続ホストが停止しています。', 503);
    const identity = identify(context); if (!identity) return { supported: false };
    const { key, adapter } = identity;
    const previous = queues.get(key) || Promise.resolve();
    const work = previous.catch(() => {}).then(async () => {
      let entry = entries.get(key);
      if (!entry) {
        if (entries.size >= 100) throw new ConnectionError('このホストの接続数上限です。', 429);
        let runs = [], scheduledRuns = [], operation = null, operationStarts = [];
        try {
          const saved = JSON.parse(await readFile(path.join(directory, key + '.json'), 'utf8'));
          if (![1, 2].includes(saved.version) || !Array.isArray(saved.runs)) throw new Error('invalid journal');
          if (saved.runs.length > 1000) throw new Error('journal limit');
          runs = saved.runs.map(run => run.state === 'running' ? { ...run, state: 'unknown' } : run);
          if (saved.version === 2) {
            if (!Array.isArray(saved.scheduledRuns) || saved.scheduledRuns.length > 20 || !Array.isArray(saved.operationStarts) || saved.operationStarts.length > 1000) throw new Error('invalid operation journal');
            scheduledRuns = saved.scheduledRuns.map(run => run.state === 'running' ? { ...run, state: 'unknown' } : run);
            operationStarts = saved.operationStarts;
            operation = saved.operation;
            if (operation?.state === 'running') operation = { ...operation, state: 'interrupted', nextRunAt: null, error: 'ホストが再起動しました。内容を確認して運用を再開してください。' };
          }
        } catch (e) { if (e.code !== 'ENOENT') throw new ConnectionError('前回の実行記録を読めません。記録を確認してから再試行してください。', 503); }
        entry = { key, adapter, handle: null, connectionId: null, state: 'disconnected', checkedAt: null, error: null, runs, scheduledRuns, operation, operationStarts, timer: null, halt: false };
        entries.set(key, entry);
      }
      return action(entry);
    });
    queues.set(key, work);
    try { return await work; } finally { if (queues.get(key) === work) queues.delete(key); }
  }
  function view(entry) {
    return { supported: true, adapter: entry.adapter.id, state: entry.state, connectionId: entry.connectionId, checkedAt: entry.checkedAt, error: entry.error,
      operation: entry.operation ? { ...entry.operation } : null,
      runs: [...entry.runs.slice(-20), ...entry.scheduledRuns].sort((a, b) => a.createdAt - b.createdAt).slice(-20).map(({ inputHash: _hash, ...run }) => run) };
  }
  async function save(entry) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const target = path.join(directory, entry.key + '.json'), temporary = target + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify({ version: 2, runs: entry.runs, operation: entry.operation, scheduledRuns: entry.scheduledRuns, operationStarts: entry.operationStarts }), { mode: 0o600 });
    await rename(temporary, target);
  }
  async function stop(entry) {
    if (entry.handle) { await entry.adapter.stop(entry.handle); entry.handle = null; }
    entry.connectionId = null; entry.checkedAt = null;
  }
  async function probe(entry) {
    if (!entry.handle) return;
    try { await entry.adapter.probe(entry.handle); entry.state = 'ready'; entry.checkedAt = clock.now(); entry.error = null; }
    catch { await stop(entry); entry.state = 'failed'; entry.error = 'Agentの応答を確認できません。再接続してください。'; }
  }
  async function connectEntry(entry) {
      await probe(entry); if (entry.state === 'ready') return view(entry);
      if ([...entries.values()].filter(e => e.handle || e.state === 'connecting').length >= 8) throw new ConnectionError('同時接続は8件までです。不要な接続を停止してください。', 429);
      entry.state = 'connecting'; entry.error = null;
      try {
        entry.handle = await entry.adapter.start();
        await entry.adapter.probe(entry.handle);
        entry.connectionId = randomUUID(); entry.checkedAt = clock.now(); entry.state = 'ready';
      } catch {
        await stop(entry); entry.state = 'failed'; entry.error = '準備または接続確認に失敗しました。もう一度接続してください。';
      }
      return view(entry);
  }
  function cancelTimer(entry) { if (entry.timer !== null) clock.clearTimeout(entry.timer); entry.timer = null; }
  function haltNow(context) {
    const identity = identify(context), entry = identity && entries.get(identity.key);
    if (entry) { entry.halt = true; cancelTimer(entry); }
  }
  function changeOperation(entry, state, error = null) {
    cancelTimer(entry);
    if (entry.operation) { entry.operation.state = state; entry.operation.nextRunAt = null; entry.operation.error = error; entry.operation.stoppedAt = clock.now(); }
  }
  async function stopOperationEntry(entry) {
    entry.halt = true;
    if (entry.operation) { changeOperation(entry, 'stopped'); await save(entry); }
  }
  function arm(context, entry) {
    if (closing || entry.halt || entry.operation?.state !== 'running') return;
    cancelTimer(entry);
    const operationId = entry.operation.id;
    entry.timer = clock.setTimeout(() => {
      entry.timer = null;
      return locked(context, current => scheduledTick(context, current, operationId)).catch(async () => {
        // Any unhandled persistence/authorization failure stops scheduling.
        changeOperation(entry, 'blocked', '運用の記録を確認できません。保存先を確認してください。');
        try { await save(entry); } catch { /* No further work is scheduled. */ }
      });
    }, Math.max(0, entry.operation.nextRunAt - clock.now()));
  }
  async function scheduledTick(context, entry, operationId) {
    const op = entry.operation;
    if (closing || entry.halt || op?.state !== 'running' || op.id !== operationId) return;
    try {
      const fresh = await context.revalidate();
      if (fresh.ownerScope !== context.ownerScope || fresh.agent?.id !== context.agent.id || fresh.agent.manifestSha256 !== entry.adapter.manifestSha256 || fresh.agent.uploadState !== 'ready') throw new Error('revoked');
    } catch {
      changeOperation(entry, 'blocked', 'Agentの所有権または接続権限を確認できません。'); await save(entry); return;
    }
    if (closing || entry.halt) return;
    await probe(entry);
    if (entry.state !== 'ready') { changeOperation(entry, 'blocked', 'Agentの応答がありません。運用を再開してください。'); await save(entry); return; }
    if (closing || entry.halt) return;
    if (!Number.isSafeInteger(op.sequence + 1)) { changeOperation(entry, 'blocked', '実行回数の上限です。'); await save(entry); return; }
    const run = { requestId: randomUUID(), trigger: 'scheduled', operationId, sequence: ++op.sequence, state: 'running', createdAt: clock.now() };
    op.nextRunAt = null; entry.scheduledRuns = [...entry.scheduledRuns.slice(-19), run];
    try { await save(entry); } // Durable acceptance before dispatch, even without any UI.
    catch {
      run.state = 'skipped'; changeOperation(entry, 'blocked', '実行前の記録を保存できないため、処理を開始せず停止しました。');
      try { await save(entry); } catch { /* No further dispatch until explicit start. */ }
      return;
    }
    if (closing || entry.halt) {
      // Stop won the race before dispatch. It is explicitly a skipped tick.
      run.state = 'skipped'; await save(entry); return;
    }
    let counted = false;
    try {
      run.result = await entry.adapter.run(entry.handle, { text: op.text });
      run.state = 'succeeded'; run.completedAt = clock.now(); op.succeededCount++; counted = true;
      op.nextRunAt = clock.now() + op.intervalSeconds * 1000;
      await save(entry);
    } catch {
      if (counted) op.succeededCount--;
      delete run.result; run.state = 'unknown';
      changeOperation(entry, 'blocked', '処理結果を確認できないため運用を停止しました。履歴を確認してください。');
      await stop(entry); entry.state = 'failed';
      try { await save(entry); } catch { /* Disk still contains running: unknown on restart. */ }
      return;
    }
    arm(context, entry);
  }
  return {
    status: context => locked(context, async entry => {
      await probe(entry);
      if (entry.state === 'failed' && entry.operation?.state === 'running') {
        changeOperation(entry, 'blocked', 'Agentの応答がありません。運用を再開してください。'); await save(entry);
      }
      return view(entry);
    }),
    connect: context => locked(context, connectEntry),
    startOperation: (context, input) => locked(context, async entry => {
      if (!input || Object.keys(input).some(key => !['requestId', 'text', 'intervalSeconds'].includes(key)) || !uuid(input.requestId) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000 || ![10, 30, 60].includes(input.intervalSeconds))
        throw new ConnectionError('運用の入力と間隔（10・30・60秒）を確認してください。', 400);
      if (typeof context.revalidate !== 'function') throw new ConnectionError('継続運用の所有者確認が未設定です。', 503);
      const inputHash = hash(JSON.stringify([input.text, input.intervalSeconds]));
      const prior = entry.operationStarts.find(item => item.id === input.requestId);
      if (prior) {
        if (prior.inputHash !== inputHash || entry.operation?.id !== input.requestId) throw new ConnectionError('終了済みまたは内容が異なる運用要求です。画面を更新してください。');
        return view(entry);
      }
      if (entry.operation?.state === 'running') throw new ConnectionError('すでに運用中です。設定変更は停止してから行ってください。');
      if (entry.operationStarts.length >= 1000) throw new ConnectionError('このテストの運用開始記録は1000件までです。', 429);
      entry.halt = false;
      entry.operation = { id: input.requestId, state: 'running', text: input.text, intervalSeconds: input.intervalSeconds, sequence: 0, succeededCount: 0, startedAt: clock.now(), stoppedAt: null, nextRunAt: clock.now(), error: null };
      entry.operationStarts.push({ id: input.requestId, inputHash });
      try { await save(entry); await connectEntry(entry); }
      catch { changeOperation(entry, 'blocked', '運用の準備または保存に失敗しました。'); try { await save(entry); } catch { /* No timer has started. */ } throw new ConnectionError('運用の準備または保存に失敗しました。', 503); }
      if (entry.state !== 'ready') { changeOperation(entry, 'blocked', entry.error); await save(entry); return view(entry); }
      arm(context, entry); return view(entry);
    }),
    stopOperation: context => { haltNow(context); return locked(context, async entry => { await stopOperationEntry(entry); return view(entry); }); },
    disconnect: context => { haltNow(context); return locked(context, async entry => { await stopOperationEntry(entry); await stop(entry); entry.state = 'disconnected'; entry.error = null; return view(entry); }); },
    run: (context, input) => locked(context, async entry => {
      if (!input || Object.keys(input).some(key => !['requestId', 'text'].includes(key)) || !uuid(input.requestId) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000)
        throw new ConnectionError('実行IDと1〜4000文字の入力を確認してください。', 400);
      const inputHash = hash(input.text), prior = entry.runs.find(run => run.requestId === input.requestId);
      if (prior) {
        if (prior.inputHash !== inputHash) throw new ConnectionError('同じ実行IDの入力が変更されています。', 409);
        if (prior.state === 'expired') throw new ConnectionError('この実行の結果は保存期間外です。再実行はしていません。', 410);
        return { ...view(entry), run: { ...prior, inputHash: undefined } };
      }
      if (entry.runs.length >= 1000) throw new ConnectionError('この接続テストの記録上限（1000回）に達しました。', 429);
      if (entry.operation?.state === 'running') throw new ConnectionError('手動処理は運用を停止してから実行してください。');
      await probe(entry); if (entry.state !== 'ready') throw new ConnectionError('接続を確認してから実行してください。');
      const run = { requestId: input.requestId, inputHash, state: 'running', createdAt: Date.now() };
      entry.runs.push(run);
      // Keep old IDs as tombstones, so pruning result text never re-executes an
      // old retry. This fixture refuses new work at its bounded journal limit.
      for (const old of entry.runs.slice(0, -20)) { old.state = 'expired'; delete old.result; }
      try { await save(entry); } catch { entry.runs = entry.runs.filter(r => r !== run); throw new ConnectionError('実行記録を保存できません。処理は開始していません。', 503); }
      try {
        run.result = await entry.adapter.run(entry.handle, { text: input.text }); run.state = 'succeeded'; run.completedAt = Date.now();
        await save(entry);
      } catch {
        delete run.result; run.state = 'unknown'; await stop(entry); entry.state = 'failed'; entry.error = '処理結果を確認できません。新しく実行する前に履歴を確認してください。';
        try { await save(entry); } catch { /* The durable running record remains unknown after restart. */ }
      }
      return { ...view(entry), run: { ...run, inputHash: undefined } };
    }),
    async close() {
      closing = true;
      for (const entry of entries.values()) { entry.halt = true; cancelTimer(entry); }
      await Promise.allSettled(queues.values());
      for (const entry of entries.values()) if (entry.operation?.state === 'running') {
        changeOperation(entry, 'interrupted', 'Noahの実行ホストが終了しました。運用開始で再開できます。');
        try { await save(entry); } catch { /* A running journal also restores as interrupted. */ }
      }
      await Promise.allSettled([...entries.values()].map(stop));
    },
  };
}
