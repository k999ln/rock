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
  model: LinkedCommand['request']['model'];
  state: 'pending' | 'received';
  expiresAt: number;
};
export function eveRuntimeSyncStore(
  db: Database,
  owner: string,
  keys: EveHistoryKeys,
) {
  const replicas = eveDeviceReplicas(db, owner, keys),
    history = replicas.history;
  async function active(deviceId: string) {
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
  async function enqueue(raw: unknown) {
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
    await history.assertWritable(threadId);
    const digest = await linkedDigest(v),
      prior = await find(id);
    if (prior) {
      if (prior.digest !== digest || prior.device_id !== deviceId)
        throw new LinkedExecutionError('RUNTIME_REQUEST_CONFLICT', 409);
      await command(prior);
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
  async function commands(deviceId: string) {
    await active(deviceId);
    const rows = await db
      .prepare(
        "SELECT * FROM eve_device_commands WHERE owner_id=? AND device_id=? AND ((state='runtime-pending' AND expires_at>?) OR state LIKE 'runtime-claimed:%') ORDER BY created_at,id LIMIT 8",
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
  async function pendingOwner() {
    const rows = await db
      .prepare(
        "SELECT * FROM eve_device_commands WHERE owner_id=? AND (state='runtime-pending' OR state LIKE 'runtime-claimed:%') ORDER BY created_at DESC LIMIT 50",
      )
      .bind(owner)
      .all<CommandRow>();
    const result: EveRuntimePending[] = [];
    for (const row of rows.results) {
      const c = await command(row);
      result.push({
        id: row.id,
        threadId: row.thread_id,
        deviceId: row.device_id,
        input: c.displayInput,
        agentName: c.request.agent.name,
        model: c.request.model,
        state: row.state === 'runtime-pending' ? 'pending' : 'received',
        expiresAt: row.expires_at,
      });
    }
    return result;
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
  return {
    presence,
    devices,
    enqueue,
    commands,
    claim,
    authorize,
    publish,
    acknowledge,
    list,
    pendingOwner,
    read,
  };
}
