import {eveAgentPreparationQueue} from './eve-agent-preparation-sync.ts';
import { eveDeviceReplicas } from './eve-device-replicas.ts';
import { EveHistoryError, type EveHistoryKeys } from './eve-history.ts';
import { negotiateTextAdapters } from './rockstar-adapters.ts';
import { linuxLocalPrice } from './sky-linux-record.ts';
import {
  linkedCanonical,
  linkedDigest,
  linkedFields,
  linkedHash,
  linkedId,
  LinkedExecutionError,
  parseLinkedPresence,
  parseLinkedReport,
  type LinkedCommand,
  type LinkedPresence,
  type LinkedReport,
} from './rockstar-linked-execution.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
type CommandRow = {
  id: string;
  device_id: string;
  thread_id: string;
  digest: string;
  envelope: string;
  state: string;
  created_at: number;
  expires_at: number;
};
type StartFence = {
  schema: 'rockstaros.runtime-start-fence/1';
  owner: string;
  request: Record<string, unknown>;
};
type Replica = {
  kind: 'runtime-text';
  command: LinkedCommand;
  report: LinkedReport;
};
export type EveRuntimeExecution = {
  id: string;
  threadId: string;
  deviceId: string;
  revision: number;
  digest: string;
  input: string;
  updatedAt: number;
  request: LinkedCommand['request'];
  report: LinkedReport;
  provenance: 'linked-device-report';
  externalToolSuccess: false;
  usage: typeof linuxLocalPrice;
};
export type EveRuntimePending = {
  id: string;
  threadId: string;
  deviceId: string;
  input: string;
  agentName: string;
  agentId: string;
  agentSha256: string;
  model: LinkedCommand['request']['model'];
  state:
    | 'pending'
    | 'received'
    | 'cancelled-before-start'
    | 'stop-requested'
    | 'stop-confirmed'
    | 'stop-finished'
    | 'stop-unknown';
  canStop: boolean;
  expiresAt: number;
};
export function eveRuntimeSyncStore(
  db: Database,
  owner: string,
  keys: EveHistoryKeys,
  recoveryPaused = false,
) {
  const replicas = eveDeviceReplicas(db, owner, keys),
    history = replicas.history;
  function dispatchAllowed() { if(recoveryPaused)throw new LinkedExecutionError('RUNTIME_RECOVERY_REQUIRED',503); }
  async function active(deviceId: string) {
    dispatchAllowed();
    linkedId(deviceId);
    if (
      !(await db
        .prepare(
          'SELECT id FROM rockstar_device_sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?',
        )
        .bind(deviceId, owner, Date.now())
        .first())
    )
      throw new LinkedExecutionError('DEVICE_RECONNECT_REQUIRED', 401);
  }
  const find = (id: string) =>
    db
      .prepare('SELECT * FROM eve_device_commands WHERE owner_id=? AND id=?')
      .bind(owner, linkedId(id))
      .first<CommandRow>();
  async function command(row: CommandRow): Promise<LinkedCommand> {
    const value = await history.unsealRecord<LinkedCommand>(
      row.envelope,
      `command:${row.id}`,
    );
    if (
      value.schema !== 'rockstaros.runtime-command/1' ||
      value.owner !== owner ||
      value.deviceId !== row.device_id ||
      value.request.id !== row.id ||
      value.request.threadId !== row.thread_id ||
      (await linkedDigest(value.request)) !== value.requestSha256
    )
      throw new LinkedExecutionError('RUNTIME_COMMAND_CORRUPT', 409);
    return value;
  }
  async function devices() {
    if(recoveryPaused)return [];
    const rows = await db
      .prepare(
        'SELECT p.device_id,p.envelope,p.updated_at FROM eve_runtime_presence p JOIN rockstar_device_sessions s ON s.id=p.device_id AND s.user_id=p.owner_id WHERE p.owner_id=? AND s.revoked_at IS NULL AND s.expires_at>? ORDER BY p.updated_at DESC LIMIT 50',
      )
      .bind(owner, Date.now())
      .all<{ device_id: string; envelope: string; updated_at: number }>();
    const result: Array<
      LinkedPresence & { deviceId: string; updatedAt: number }
    > = [];
    for (const row of rows.results) {
      const value = await history.unsealRecord<LinkedPresence>(
        row.envelope,
        `runtime-presence:${row.device_id}`,
      );
      if (value.schema === 'rockstaros.runtime-presence/1')
        result.push({
          ...value,
          deviceId: row.device_id,
          updatedAt: row.updated_at,
        });
    }
    return result;
  }
  async function presence(raw: unknown, deviceId: string) {
    await active(deviceId);
    const value = await parseLinkedPresence(raw, Date.now());
    await db
      .prepare(
        'INSERT INTO eve_runtime_presence(owner_id,device_id,envelope,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner_id,device_id) DO UPDATE SET envelope=excluded.envelope,updated_at=excluded.updated_at',
      )
      .bind(
        owner,
        deviceId,
        await history.sealRecord(value, `runtime-presence:${deviceId}`),
        Date.now(),
      )
      .run();
    return { ok: true, protocol: 1 };
  }
  async function available(deviceId: string) {
    const p = (await devices()).find((p) => p.deviceId === deviceId);
    if (!p || p.phase !== 'ready' || Date.now() - p.updatedAt >= 30000)
      throw new LinkedExecutionError('RUNTIME_NOT_READY', 409);
    return {
      presence: p,
      negotiation: negotiateTextAdapters(
        p.host,
        p.executor,
        p.output,
        Date.now(),
      ),
    };
  }
  function startFields(raw: unknown) {
    const v = linkedFields(raw, [
      'id',
      'threadId',
      'deviceId',
      'agentId',
      'agentSha256',
      'modelSha256',
      'modelScheme',
      'input',
      'maxOutputTokens',
      'confirm',
    ]);
    const id = linkedId(v.id),
      threadId = linkedId(v.threadId),
      deviceId = linkedId(v.deviceId),
      agentId = linkedId(v.agentId);
    linkedHash(v.agentSha256);
    linkedHash(v.modelSha256);
    if (
      v.confirm !== 'run-owner-local-text' ||
      typeof v.input !== 'string' ||
      !v.input.trim() ||
      v.input.length > 2000 ||
      Array.from(v.input).some(
        (c) => c.charCodeAt(0) < 32 && !['\t', '\r', '\n'].includes(c),
      ) ||
      !Number.isSafeInteger(v.maxOutputTokens) ||
      Number(v.maxOutputTokens) < 1 ||
      Number(v.maxOutputTokens) > 1024
    )
      throw new LinkedExecutionError('RUNTIME_APPROVAL_REQUIRED');
    if (!['gguf-sha256', 'ollama-manifest-sha256'].includes(String(v.modelScheme)))
      throw new LinkedExecutionError('RUNTIME_SELECTION_CHANGED', 409);
    return {v: v as typeof v & {input:string},id,threadId,deviceId,agentId};
  }
  async function enqueue(raw: unknown) {
    dispatchAllowed();
    const {v,id,threadId,deviceId,agentId} = startFields(raw);
    await history.assertWritable(threadId);
    const digest = await linkedDigest(v),
      prior = await find(id);
    if (prior) {
      if (prior.digest !== digest || prior.device_id !== deviceId)
        throw new LinkedExecutionError('RUNTIME_REQUEST_CONFLICT', 409);
      if (prior.state === 'runtime-fenced') await startFence(prior);
      else await command(prior);
      return { id, state: prior.state };
    }
    const { presence: p, negotiation } = await available(deviceId),
      agent = p.agents.find((a) => a.id === agentId),
      model = p.models.find((m) => m.id === agent?.modelId);
    if (
      !agent ||
      !model ||
      !p.preparedModels.includes(model.id) ||
      agent.sha256 !== v.agentSha256 ||
      model.sha256 !== v.modelSha256 ||
      model.scheme !== v.modelScheme
    )
      throw new LinkedExecutionError('RUNTIME_SELECTION_CHANGED', 409);
    let context = '';
    try {
      context = (await history.get(threadId)).session.messages
        .slice(-4)
        .map((m) => `${m.side === 'me' ? '本人' : 'Eve'}: ${m.text}`)
        .join('\n')
        .slice(-1200);
    } catch (error) {
      if (!(error instanceof EveHistoryError) || error.status !== 404)
        throw error;
    }
    const now = Date.now(),
      request = {
        id,
        threadId,
        input: context
          ? `過去の会話（参照情報）:\n${context}\n\n今回の依頼:\n${v.input.trim()}`
          : v.input.trim(),
        agent,
        model: { id: model.id, scheme: model.scheme, sha256: model.sha256 },
        deadline: now + 120000,
        maxOutputTokens: Number(v.maxOutputTokens),
      };
    const payload: LinkedCommand = {
      schema: 'rockstaros.runtime-command/1',
      displayInput: v.input.trim(),
      owner,
      deviceId,
      request,
      requestSha256: await linkedDigest(request),
      executorId: negotiation.executorId,
    };
    // A separate state namespace keeps old Pixel consumers on their accepted ABI.
    await db
      .prepare(
        "INSERT INTO eve_device_commands(owner_id,id,device_id,thread_id,digest,envelope,state,created_at,expires_at) VALUES(?,?,?,?,?,?,'runtime-pending',?,?) ON CONFLICT(owner_id,id) DO NOTHING",
      )
      .bind(
        owner,
        id,
        deviceId,
        threadId,
        digest,
        await history.sealRecord(payload, `command:${id}`),
        now,
        request.deadline,
      )
      .run();
    const row = await find(id);
    if (!row || row.digest !== digest)
      throw new LinkedExecutionError('RUNTIME_REQUEST_CONFLICT', 409);
    return { id, state: row.state };
  }
  function ownerState(state: string): EveRuntimePending['state'] {
    if (state === 'runtime-pending') return 'pending';
    if (state === 'runtime-cancelled') return 'cancelled-before-start';
    if (state.startsWith('runtime-stop:')) return 'stop-requested';
    if (state.startsWith('runtime-stopped:')) return 'stop-confirmed';
    if (state.startsWith('runtime-stop-finished:')) return 'stop-finished';
    if (state.startsWith('runtime-stop-unknown:')) return 'stop-unknown';
    return 'received';
  }
  async function startFence(row: CommandRow): Promise<StartFence> {
    const value = await history.unsealRecord<StartFence>(row.envelope, `command:${row.id}`);
    if (value.schema !== 'rockstaros.runtime-start-fence/1' || value.owner !== owner)
      throw new LinkedExecutionError('RUNTIME_COMMAND_CORRUPT', 409);
    const {v,id,threadId,deviceId} = startFields(value.request);
    if (id !== row.id || threadId !== row.thread_id || deviceId !== row.device_id || await linkedDigest(v) !== row.digest)
      throw new LinkedExecutionError('RUNTIME_COMMAND_CORRUPT', 409);
    return value;
  }
  // Negative authority only: this record can never be dispatched or granted.
  async function fenceStart(raw: unknown) {
    dispatchAllowed();
    const {v,id,threadId,deviceId} = startFields(raw);
    await history.assertWritable(threadId);
    const digest = await linkedDigest(v), now = Date.now();
    await db.prepare(
      "INSERT INTO eve_device_commands(owner_id,id,device_id,thread_id,digest,envelope,state,created_at,expires_at) SELECT ?,?,?,?,?,?,'runtime-fenced',?,? WHERE EXISTS(SELECT 1 FROM rockstar_device_sessions WHERE id=? AND user_id=?) AND NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at<>0) ON CONFLICT(owner_id,id) DO NOTHING",
    ).bind(owner,id,deviceId,threadId,digest,await history.sealRecord({schema:'rockstaros.runtime-start-fence/1',owner,request:v},`command:${id}`),now,now,deviceId,owner,owner,threadId).run();
    const row = await find(id);
    if (!row || row.digest !== digest || row.device_id !== deviceId)
      throw new LinkedExecutionError('RUNTIME_REQUEST_CONFLICT', 409);
    if (row.state !== 'runtime-fenced') return requestStop({id,confirm:'stop-owner-local-text'});
    await startFence(row);
    await history.assertWritable(threadId);
    return {id,state:'cancelled-before-start',stopConfirmed:true};
  }
  async function fenceProjection(row: CommandRow): Promise<EveRuntimePending> {
    const {request:v} = await startFence(row);
    return {id:row.id,threadId:row.thread_id,deviceId:row.device_id,input:String(v.input).trim(),agentName:'',agentId:String(v.agentId),agentSha256:String(v.agentSha256),model:{id:'',scheme:v.modelScheme as LinkedCommand['request']['model']['scheme'],sha256:String(v.modelSha256)},state:recoveryPaused?'stop-unknown':'cancelled-before-start',canStop:false,expiresAt:row.expires_at};
  }
  async function requestStop(raw: unknown) {
    dispatchAllowed();
    const v = linkedFields(raw, ['id', 'confirm']),
      id = linkedId(v.id);
    if (v.confirm !== 'stop-owner-local-text')
      throw new LinkedExecutionError('RUNTIME_STOP_CONFIRMATION_REQUIRED');
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await find(id);
      if (!row)
        throw new LinkedExecutionError('RUNTIME_COMMAND_NOT_FOUND', 404);
      if (row.state === 'runtime-fenced') {
        await startFence(row);
        await history.assertWritable(row.thread_id);
        return {id,state:'cancelled-before-start',stopConfirmed:true};
      }
      const c = await command(row),
        prior = await replicas.find(id);
      await history.assertWritable(c.request.threadId);
      if (
        prior &&
        (await replicas.unpack<Replica>(prior)).report.state === 'review'
      )
        return { id, state: 'result-retained', stopConfirmed: false };
      let next = row.state;
      if (row.state === 'runtime-pending') next = 'runtime-cancelled';
      else if (/^runtime-(claimed|done):/.test(row.state)) {
        const p = (await devices()).find((p) => p.deviceId === row.device_id);
        if (p?.executor.capabilities['execution.stop'] !== true)
          throw new LinkedExecutionError('RUNTIME_STOP_UNAVAILABLE', 409);
        next = 'runtime-stop:' + linkedId(row.state.split(':')[1]);
      } else if (ownerState(row.state) === 'received') {
        throw new LinkedExecutionError('RUNTIME_STOP_STATE_CONFLICT', 409);
      }
      if (next !== row.state) {
        // Pin the observed replica in the same statement: a report which won
        // first is retained; a stop which won first fences later publication.
        const observed = prior
          ? 'EXISTS(SELECT 1 FROM eve_device_jobs WHERE owner_id=? AND job_id=? AND revision=? AND digest=?)'
          : 'NOT EXISTS(SELECT 1 FROM eve_device_jobs WHERE owner_id=? AND job_id=?)';
        const args = prior
          ? [owner, id, prior.revision, prior.digest]
          : [owner, id];
        const r = await db
          .prepare(
            'UPDATE eve_device_commands SET state=? WHERE owner_id=? AND id=? AND state=? AND ' +
              observed +
              ' AND NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at<>0)',
          )
          .bind(next, owner, id, row.state, ...args, owner, row.thread_id)
          .run();
        if (r.meta.changes !== 1) continue;
      }
      await replicas.append({
        jobId: id,
        threadId: row.thread_id,
        input: c.displayInput,
        text: null,
        createdAt: row.created_at,
        prefix: 'runtime',
      });
      return {
        id,
        state: ownerState(next),
        stopConfirmed:
          next === 'runtime-cancelled' || next.startsWith('runtime-stopped:'),
      };
    }
    throw new LinkedExecutionError('RUNTIME_STOP_STATE_CONFLICT', 409);
  }
  async function stopReceipt(deviceId: string, raw: unknown) {
    await active(deviceId);
    const v = linkedFields(raw, ['id', 'claimId', 'requestSha256', 'state']);
    const id = linkedId(v.id),
      claimId = linkedId(v.claimId),
      row = await find(id);
    if (!row || row.device_id !== deviceId)
      throw new LinkedExecutionError('RUNTIME_COMMAND_NOT_FOUND', 404);
    const c = await command(row);
    if (
      linkedHash(v.requestSha256) !== c.requestSha256 ||
      !['pending', 'confirmed', 'finished', 'unknown'].includes(String(v.state))
    )
      throw new LinkedExecutionError('RUNTIME_STOP_RECEIPT_MISMATCH', 409);
    const states = [
      `runtime-stop:${claimId}`,
      `runtime-stop-unknown:${claimId}`,
    ];
    const next =
      v.state === 'confirmed'
        ? `runtime-stopped:${claimId}`
        : v.state === 'finished'
          ? `runtime-stop-finished:${claimId}`
          : v.state === 'unknown'
            ? `runtime-stop-unknown:${claimId}`
            : `runtime-stop:${claimId}`;
    if (row.state === next) return { ok: true, state: ownerState(next) };
    if (!states.includes(row.state))
      throw new LinkedExecutionError('RUNTIME_STOP_RECEIPT_MISMATCH', 409);
    const r = await db
      .prepare(
        'UPDATE eve_device_commands SET state=? WHERE owner_id=? AND id=? AND device_id=? AND state=? AND NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at<>0)',
      )
      .bind(next, owner, id, deviceId, row.state, owner, row.thread_id)
      .run();
    if (r.meta.changes !== 1)
      throw new LinkedExecutionError('RUNTIME_STOP_STATE_CONFLICT', 409);
    return { ok: true, state: ownerState(next) };
  }
  async function commands(deviceId: string) {
    await active(deviceId);
    const rows = await db
      .prepare(
        "SELECT * FROM eve_device_commands WHERE owner_id=? AND device_id=? AND ((state='runtime-pending' AND expires_at>?) OR state LIKE 'runtime-claimed:%' OR state LIKE 'runtime-stop:%' OR state LIKE 'runtime-stop-unknown:%') ORDER BY CASE WHEN state LIKE 'runtime-stop:%' OR state LIKE 'runtime-stop-unknown:%' THEN 0 ELSE 1 END,created_at,id LIMIT 8",
      )
      .bind(owner, deviceId, Date.now())
      .all<CommandRow>();
    return Promise.all(
      rows.results.map(async (row) => ({
        command: await command(row),
        state: row.state,
        expiresAt: row.expires_at,
      })),
    );
  }
  async function claim(deviceId: string, raw: unknown) {
    await active(deviceId);
    const v = linkedFields(raw, ['id', 'claimId', 'requestSha256']),
      id = linkedId(v.id),
      claimId = linkedId(v.claimId),
      row = await find(id);
    if (!row || row.device_id !== deviceId)
      throw new LinkedExecutionError('RUNTIME_COMMAND_NOT_FOUND', 404);
    const c = await command(row);
    if (linkedHash(v.requestSha256) !== c.requestSha256)
      throw new LinkedExecutionError('RUNTIME_REQUEST_CONFLICT', 409);
    const state = `runtime-claimed:${claimId}`;
    if (row.state === state) return { claimId, requestSha256: c.requestSha256 };
    const { presence: p } = await available(deviceId),
      agent = p.agents.find((a) => a.id === c.request.agent.id),
      model = p.models.find((m) => m.id === c.request.model.id);
    if (
      agent?.sha256 !== c.request.agent.sha256 ||
      !model ||
      linkedCanonical({
        id: model.id,
        scheme: model.scheme,
        sha256: model.sha256,
      }) !== linkedCanonical(c.request.model) ||
      !p.preparedModels.includes(model.id) ||
      p.executor.id !== c.executorId
    )
      throw new LinkedExecutionError('RUNTIME_SELECTION_CHANGED', 409);
    const r = await db
      .prepare(
        "UPDATE eve_device_commands SET state=? WHERE owner_id=? AND id=? AND device_id=? AND state='runtime-pending' AND expires_at>? AND NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at<>0)",
      )
      .bind(state, owner, id, deviceId, Date.now(), owner, c.request.threadId)
      .run();
    if (r.meta.changes !== 1)
      throw new LinkedExecutionError('RUNTIME_ALREADY_CLAIMED_OR_EXPIRED', 409);
    return { claimId, requestSha256: c.requestSha256 };
  }
  async function authorize(deviceId: string, id: string, claimId: string) {
    await active(deviceId);
    const row = await find(id);
    if (
      !row ||
      row.device_id !== deviceId ||
      row.state !== `runtime-claimed:${linkedId(claimId)}` ||
      row.expires_at <= Date.now()
    )
      throw new LinkedExecutionError('RUNTIME_AUTHORIZATION_EXPIRED', 409);
    const c = await command(row);
    await history.assertWritable(c.request.threadId);
    return {
      owner,
      jobId: id,
      requestSha256: c.requestSha256,
      executorId: c.executorId,
      permission: 'text.generate',
      maximumCostMinor: 0,
      expiresAt: c.request.deadline,
    };
  }
  async function publish(deviceId: string, raw: unknown) {
    await active(deviceId);
    const v = linkedFields(raw, ['report', 'revision']);
    if (!Number.isSafeInteger(v.revision) || Number(v.revision) < 0)
      throw new LinkedExecutionError('INVALID_RUNTIME_REVISION');
    const id = linkedId((v.report as LinkedReport)?.id),
      row = await find(id);
    if (!row || row.device_id !== deviceId)
      throw new LinkedExecutionError('RUNTIME_COMMAND_NOT_FOUND', 404);
    const c = await command(row),
      report = await parseLinkedReport(v.report, c);
    if (
      ![
        `runtime-claimed:${report.claimId}`,
        `runtime-done:${report.claimId}`,
        `runtime-stop-finished:${report.claimId}`,
      ].includes(row.state)
    )
      throw new LinkedExecutionError('RUNTIME_CLAIM_MISMATCH', 409);
    const prior = await replicas.find(id),
      payload: Replica = { kind: 'runtime-text', command: c, report };
    if (prior) {
      const old = await replicas.unpack<Replica>(prior);
      if (
        old.kind !== 'runtime-text' ||
        old.command.requestSha256 !== c.requestSha256 ||
        old.report.claimId !== report.claimId ||
        (old.report.state === 'review' &&
          linkedCanonical(old.report) !== linkedCanonical(report))
      )
        throw new LinkedExecutionError('RUNTIME_RESULT_IMMUTABLE', 409);
    }
    const result = await replicas.commit({
      id,
      threadId: c.request.threadId,
      deviceId,
      revision: Number(v.revision),
      digest: await linkedDigest(payload),
      payload,
      prior,
      commandStates: [
        `runtime-claimed:${report.claimId}`,
        `runtime-done:${report.claimId}`,
        `runtime-stop-finished:${report.claimId}`,
      ],
    });
    await replicas.append({
      jobId: id,
      threadId: c.request.threadId,
      input: c.displayInput,
      text: report.text,
      createdAt: row.created_at,
      prefix: 'runtime',
    });
    return result;
  }
  async function acknowledge(deviceId: string, id: string, claimId: string) {
    await active(deviceId);
    linkedId(claimId);
    const prior = await replicas.find(id);
    if (!prior || prior.device_id !== deviceId)
      throw new LinkedExecutionError('RUNTIME_REPORT_NOT_SAVED', 409);
    const payload = await replicas.unpack<Replica>(prior);
    if (payload.kind !== 'runtime-text' || payload.report.claimId !== claimId)
      throw new LinkedExecutionError('RUNTIME_CLAIM_MISMATCH', 409);
    await db
      .prepare(
        'UPDATE eve_device_commands SET state=? WHERE owner_id=? AND device_id=? AND id=? AND state=?',
      )
      .bind(
        `runtime-done:${claimId}`,
        owner,
        deviceId,
        id,
        `runtime-claimed:${claimId}`,
      )
      .run();
    return { ok: true };
  }
  function projection(
    row: {
      job_id: string;
      thread_id: string;
      device_id: string;
      revision: number;
      digest: string;
      updated_at: number;
    },
    p: Replica,
  ): EveRuntimeExecution {
    return {
      id: row.job_id,
      threadId: row.thread_id,
      deviceId: row.device_id,
      revision: row.revision,
      digest: row.digest,
      input: p.command.displayInput,
      updatedAt: row.updated_at,
      request: p.command.request,
      report: p.report,
      provenance: 'linked-device-report',
      externalToolSuccess: false,
      usage: {
        ...linuxLocalPrice,
        resources:
          '選択した実行先の資源を使います。電気代・機器代は未計測です。',
        subscription:
          '月額基本プラン16米ドルとは別の端末内プレビューです。この実行で契約・請求は開始しません。',
        idle: '保存した成果は残ります。画面を閉じた後の実行継続は、選んだ実行先の状態によります。',
      },
    };
  }
  function pendingProjection(row: CommandRow, c: LinkedCommand, supported: Set<string>): EveRuntimePending {
    return {
        id: row.id,
        threadId: row.thread_id,
        deviceId: row.device_id,
        input: c.displayInput,
        agentName: c.request.agent.name,
        agentId: c.request.agent.id,
        agentSha256: c.request.agent.sha256,
        model: c.request.model,
        state: recoveryPaused?'stop-unknown':ownerState(row.state),
        canStop: !recoveryPaused && (
          row.state === 'runtime-pending' ||
          (supported.has(row.device_id) &&
            (row.state.startsWith('runtime-claimed:') ||
              row.state.startsWith('runtime-done:') ||
              row.state.startsWith('runtime-stop-unknown:')))),
        expiresAt: row.expires_at,
    };
  }
  async function pendingOwner(threadId = '') {
    if (threadId) linkedId(threadId);
    const rows = await db
      .prepare(
        `SELECT * FROM eve_device_commands WHERE owner_id=? ${threadId ? 'AND thread_id=?' : ''} AND (state='runtime-fenced' OR state='runtime-pending' OR state LIKE 'runtime-claimed:%' OR state LIKE 'runtime-done:%' OR state='runtime-cancelled' OR state LIKE 'runtime-stop:%' OR state LIKE 'runtime-stopped:%' OR state LIKE 'runtime-stop-finished:%' OR state LIKE 'runtime-stop-unknown:%') ORDER BY created_at DESC LIMIT 50`,
      )
      .bind(...(threadId ? [owner, threadId] : [owner]))
      .all<CommandRow>();
    const result: EveRuntimePending[] = [];
    const supported = new Set(
      (await devices())
        .filter((p) => p.executor.capabilities['execution.stop'] === true)
        .map((p) => p.deviceId),
    );
    for (const row of rows.results) {
      if (row.state === 'runtime-fenced') { result.push(await fenceProjection(row)); continue; }
      const c = await command(row);
      if (row.state.startsWith('runtime-done:')) {
        const saved = await replicas.find(row.id);
        if (
          saved &&
          (await replicas.unpack<Replica>(saved)).report.state === 'review'
        )
          continue;
      }
      result.push(pendingProjection(row, c, supported));
    }
    return result;
  }
  /** Bounded discovery only. Cursors never authorize reads or execution. */
  async function ownerPage(threadId: string, cursor = '') {
    linkedId(threadId);
    await history.assertWritable(threadId);
    let before: [number,string] | null = null;
    if (cursor) {
      try {
        if (cursor.length > 2048) throw Error();
        const value = JSON.parse(cursor);
        if (!Array.isArray(value) || value.length !== 4 || value[0] !== owner || value[1] !== threadId || !Number.isSafeInteger(value[2]) || value[2] < 0) throw Error();
        linkedId(value[3]); before = [value[2], value[3]];
      } catch { throw new LinkedExecutionError('INVALID_RUNTIME_HISTORY_CURSOR'); }
    }
    const rows = (await db.prepare(`SELECT c.* FROM eve_device_commands c WHERE c.owner_id=? AND c.thread_id=? AND c.state LIKE 'runtime-%' AND NOT EXISTS(SELECT 1 FROM eve_conversations t WHERE t.owner_id=c.owner_id AND t.id=c.thread_id AND t.deleted_at<>0) ${before ? 'AND (c.created_at<? OR (c.created_at=? AND c.id<?))' : ''} ORDER BY c.created_at DESC,c.id DESC LIMIT 51`)
      .bind(owner,threadId,...(before ? [before[0],before[0],before[1]] : [])).all<CommandRow>()).results;
    const supported = new Set((await devices()).filter(p=>p.executor.capabilities['execution.stop']===true).map(p=>p.deviceId));
    const pending: EveRuntimePending[] = [], executions: EveRuntimeExecution[] = [];
    for (const row of rows.slice(0,50)) {
      if (row.state === 'runtime-fenced') { pending.push(await fenceProjection(row)); continue; }
      pending.push(pendingProjection(row,await command(row),supported));
      try { executions.push(await read(row.id)); }
      catch (error) { if (!(error instanceof LinkedExecutionError) || error.status !== 404) throw error; }
    }
    await history.assertWritable(threadId);
    const last=rows[Math.min(rows.length,50)-1];
    return {ownerUserId:owner,threadId,pending,executions,cursor:rows.length>50&&last?JSON.stringify([owner,threadId,last.created_at,last.id]):null};
  }
  async function list(threadId = '') {
    const results: EveRuntimeExecution[] = [];
    for (const row of await replicas.rows(threadId)) {
      const p = await replicas.unpack<Replica>(row);
      if (p.kind === 'runtime-text') results.push(projection(row, p));
    }
    return results;
  }
  async function read(id: string, deviceId?: string) {
    if (deviceId) await active(deviceId);
    const row = await replicas.find(id);
    if (!row || (deviceId && row.device_id !== deviceId))
      throw new LinkedExecutionError('RUNTIME_REPORT_NOT_FOUND', 404);
    const payload = await replicas.unpack<Replica>(row);
    if (payload.kind !== 'runtime-text')
      throw new LinkedExecutionError('RUNTIME_REPORT_NOT_FOUND', 404);
    return projection(row, payload);
  }
  async function inspectOwnerRequest(id: string, deviceId?: string) {
    if (deviceId) await active(deviceId);
    const row = await find(id);
    if (!row || !row.state.startsWith('runtime-') || (deviceId && row.device_id !== deviceId))
      throw new LinkedExecutionError('RUNTIME_COMMAND_NOT_FOUND', 404);
    if (row.state === 'runtime-fenced') {
      await history.assertWritable(row.thread_id);
      return {ownerUserId:owner,pending:await fenceProjection(row),execution:null};
    }
    const c = await command(row);
    await history.assertWritable(c.request.threadId);
    const supported = new Set((await devices()).filter(p => p.executor.capabilities['execution.stop'] === true).map(p => p.deviceId));
    let execution: EveRuntimeExecution | null = null;
    try { execution = await read(id, deviceId); }
    catch (error) { if (!(error instanceof LinkedExecutionError) || error.status !== 404) throw error; }
    return { ownerUserId: owner, pending: pendingProjection(row, c, supported), execution };
  }
  return {
    preparations: eveAgentPreparationQueue({db,owner,history,active,available,find}),
    presence,
    devices,
    enqueue,
    requestStop,
    fenceStart,
    stopReceipt,
    commands,
    claim,
    authorize,
    publish,
    acknowledge,
    list,
    pendingOwner,
    ownerPage,
    inspectOwnerRequest,
    read,
  };
}
