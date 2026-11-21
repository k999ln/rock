import { canonicalJson, sha256Hex } from './noah-connect-requirements.ts';
import {
  noahPlanSha256,
  planNoahConnection,
  type NoahConnectionState,
} from './noah-connect-plan.ts';
import { noahConnectGate, NOAH_HOST_BUSY } from './noah-form.ts';
import {
  candidateListing,
  candidateTarget,
  remoteCandidate,
  type RemoteCandidate,
} from './noah-remote-candidate.ts';
import {
  noahMcpHandshake,
  noahMcpClose,
  NoahMouthError,
} from './noah-mouth-mcp-remote.ts';
import { remoteContext, remoteFailure } from './noah-probe.ts';
import { intakeStatement } from './noah-intake-db.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { REMOTE_GATE_SQL } from './noah-remote-sql.ts';
import {
  remoteResponse,
  remoteJson,
  remoteIdentity,
  remoteBody,
  remoteUuid,
  remoteHash,
  requireRemoteEnabled,
  type RemoteDependencies,
} from './noah-remote-api.ts';

export type RemoteConnection = {
  id: string;
  owner_id: string;
  family_key: string;
  agent_id: string;
  digest: string;
  request_sha256: string;
  connect_json: string;
  connect_sha256: string;
  plan_sha256: string;
  tools_sha256: string | null;
  confirmed_tools_json: string;
  state: NoahConnectionState;
  revision: number;
  error: string | null;
  created_at: number;
  updated_at: number;
  connected_at: number | null;
  disconnected_at: number | null;
  last_used_at: number | null;
  place: 'provider';
};
export async function takeRemoteHost(deps: RemoteDependencies, host: string) {
  const claim = await intakeStatement(deps.db, REMOTE_GATE_SQL.host_take, {
    host,
    now: (deps.now ?? Date.now)(),
    limit: deps.flags.askLimits.hostHandshakes,
  }).first();
  if (!claim) throw new NoahAgentError(NOAH_HOST_BUSY, 429);
}
export function remoteErrorMessage(error: unknown) {
  if (error instanceof NoahAgentError) return error.message;
  if (error instanceof NoahMouthError) {
    if (error.code === 'auth_required')
      return 'このAgentは、相手の許可が要るようになりました。まだ対応していません。';
    if (error.code === 'payment_required')
      return 'このAgentは、呼ぶたびの支払いが要るようになりました。まだ対応していません。';
    if (error.code === 'rate_limited')
      return '相手のサーバーが混んでいます。少し待ってから試してください。';
    if (error.code === 'forbidden')
      return '相手のサーバーが、この依頼を断りました。';
    if (error.code === 'incompatible')
      return '相手のサーバーの応答を読めませんでした。';
    if (error.code === 'blocked') return 'この接続先にはつなげません。';
  }
  return '相手のサーバーが応答しません。時間をおいて試してください。';
}
export function presentConnection(row: RemoteConnection) {
  const host = new URL(JSON.parse(row.connect_json).target.url as string).host;
  return {
    id: row.id,
    agentId: row.agent_id,
    state: row.state,
    revision: row.revision,
    place: row.place,
    placeLabel: `相手のサーバー（${host}）`,
    host,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export function createNoahConnectService(deps: RemoteDependencies) {
  const { db } = deps,
    now = deps.now ?? Date.now;
  const get = async (owner: string, id: string) => {
    const row = await db
      .prepare(
        "SELECT * FROM noah_connections WHERE owner_id=? AND id=? AND place='provider'",
      )
      .bind(owner, id)
      .first<RemoteConnection>();
    if (!row) throw new NoahAgentError('接続が見つかりません。', 404);
    return row;
  };
  async function usable(row: RemoteConnection) {
    if (row.state !== 'connected')
      throw new NoahAgentError('接続を確かめてください。', 409);
    const candidate = await remoteCandidate(db, row.family_key);
    if (
      !candidate ||
      candidate.state !== 'active' ||
      candidate.withdrawn_at !== null ||
      ['auth_required', 'payment_required', 'blocked'].includes(
        candidate.result,
      ) ||
      candidate.record_sha256 !== row.digest ||
      candidate.connect_sha256 !== row.connect_sha256
    ) {
      const error =
        'このAgentの内容が変わったか、取り下げられました。接続を切り、最新の内容を確かめてください。';
      await db
        .prepare(
          "UPDATE noah_connections SET state='blocked',error=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
        )
        .bind(error, now(), row.id, row.revision)
        .run();
      throw new NoahAgentError(error, 409);
    }
    return candidate;
  }
  async function plan(agentId: string, owner: string | null) {
    const candidate = await remoteCandidate(db, agentId);
    if (!candidate) throw new NoahAgentError('Agentが見つかりません。', 404);
    if (!candidateListing(candidate).listed)
      throw new NoahAgentError('このAgentは、今はつなげません。', 422);
    const { req } = candidateTarget(candidate);
    const value = planNoahConnection(req, {
      signedIn: !!owner,
      entitlement: 'free',
      price: { model: 'free' },
      hasPaymentMethod: false,
      devices: [],
      cloudEnabled: false,
      ownAccountReady: false,
      grantedServices: [],
      serviceRegistration: {},
      consentedSha256: null,
      connectSha256: candidate.connect_sha256,
      permissions: ['read_user_input', 'write_results'],
      preference: 'auto',
      intakeLevel: candidate.level,
    });
    return {
      candidate,
      plan: value,
      planSha256: await noahPlanSha256(value, candidate.connect_sha256, {
        model: 'free',
      }),
    };
  }
  async function probe(row: RemoteConnection, candidate: RemoteCandidate) {
    // Claim the entire handshake before any outbound traffic; duplicate POSTs only read the row.
    const claimed = await db
      .prepare(
        "UPDATE noah_connections SET state='probing',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND state='planned' RETURNING *",
      )
      .bind(now(), row.id, row.revision)
      .first<RemoteConnection>();
    if (!claimed) return get(row.owner_id, row.id);
    let toolsHash: string | null = null,
      error: string | null = null;
    const context = remoteContext(deps, false, AbortSignal.timeout(8000)),
      started = now();
    try {
      await takeRemoteHost(deps, candidate.host);
      const hello = await noahMcpHandshake(
        candidateTarget(candidate).url,
        context,
      );
      toolsHash = hello.toolsSha256;
      deps.defer(noahMcpClose(hello.session, context));
    } catch (e) {
      error = remoteErrorMessage(e);
      if (e instanceof NoahMouthError) await remoteFailure(deps, candidate, e);
    }
    await db
      .prepare(
        'UPDATE noah_connections SET state=?,tools_sha256=?,probe_ms=?,error=?,connected_at=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?',
      )
      .bind(
        error ? 'failed' : 'connected',
        toolsHash,
        Math.max(0, now() - started),
        error,
        error ? null : now(),
        now(),
        row.id,
        claimed.revision,
      )
      .run();
    return get(row.owner_id, row.id);
  }
  async function connect(owner: string, value: Record<string, unknown>) {
    requireRemoteEnabled(deps, owner, 'ask');
    if (
      !remoteUuid(value.id) ||
      typeof value.agentId !== 'string' ||
      value.agentId.length > 400 ||
      !remoteHash(value.planSha256) ||
      Object.keys(value).some(
        (k) => !['id', 'agentId', 'planSha256'].includes(k),
      )
    )
      throw new NoahAgentError('接続の指定を確認してください。');
    const digest = await sha256Hex(
      canonicalJson({ agentId: value.agentId, planSha256: value.planSha256 }),
    );
    const previous = await db
      .prepare('SELECT * FROM noah_connections WHERE id=?')
      .bind(value.id)
      .first<RemoteConnection>();
    if (previous) {
      if (previous.owner_id !== owner)
        throw new NoahAgentError('接続が見つかりません。', 404);
      if (previous.request_sha256 !== digest)
        throw new NoahAgentError('同じ操作IDの内容は変更できません。', 409);
      return previous;
    }
    const {
      candidate,
      plan: valuePlan,
      planSha256,
    } = await plan(value.agentId, owner);
    if (planSha256 !== value.planSha256)
      throw new NoahAgentError(
        '接続条件が変わりました。内容を読み直してください。',
        409,
      );
    if (
      valuePlan.badge === 'blocked' ||
      valuePlan.cost.typed ||
      valuePlan.place !== 'provider'
    )
      throw new NoahAgentError('このAgentは、今はつなげません。', 422);
    const existing = await db
      .prepare(
        'SELECT * FROM noah_connections WHERE owner_id=? AND family_key=? AND disconnected_at IS NULL',
      )
      .bind(owner, value.agentId)
      .first<RemoteConnection>();
    if (existing) return existing;
    const counts = await intakeStatement(db, REMOTE_GATE_SQL.connect_gate, {
      owner,
      minute_ago: now() - 60000,
      day_ago: now() - 86400000,
    }).first<{ live: number; last_minute: number; last_day: number }>();
    const gate = noahConnectGate(
      {
        live: counts!.live,
        lastMinute: counts!.last_minute,
        lastDay: counts!.last_day,
      },
      deps.flags.askLimits,
    );
    if (!gate.ok) throw new NoahAgentError(gate.message, gate.status);
    const l = deps.flags.askLimits,
      at = now();
    const row = await db
      .prepare(`INSERT OR IGNORE INTO noah_connections(id,owner_id,family_key,agent_id,digest,request_sha256,connect_json,connect_sha256,plan_sha256,place,state,consent_json,price_json,cost_taps,cost_typed,revision,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?, 'provider','planned',?, '{"model":"free"}',?,0,1,?,?
      WHERE (SELECT COUNT(*) FROM noah_connections WHERE owner_id=? AND disconnected_at IS NULL)<?
      AND (SELECT COUNT(*) FROM noah_connections WHERE owner_id=? AND created_at>?)<?
      AND (SELECT COUNT(*) FROM noah_connections WHERE owner_id=? AND created_at>?)<? RETURNING *`)
      .bind(
        value.id,
        owner,
        value.agentId,
        value.agentId,
        candidate.record_sha256,
        digest,
        candidate.connect_json,
        candidate.connect_sha256,
        planSha256,
        JSON.stringify({
          permissions: ['read_user_input', 'write_results'],
          sendsTo: candidate.host,
          at,
        }),
        valuePlan.cost.taps,
        at,
        at,
        owner,
        l.connectLive,
        owner,
        at - 60000,
        l.connectPerMinute,
        owner,
        at - 86400000,
        l.connectPerDay,
      )
      .first<RemoteConnection>();
    if (!row) {
      const raced = await db
        .prepare(
          'SELECT * FROM noah_connections WHERE owner_id=? AND family_key=? AND disconnected_at IS NULL',
        )
        .bind(owner, value.agentId)
        .first<RemoteConnection>();
      if (raced) return raced;
      throw new NoahAgentError(
        '接続が増えています。少し待ってから試してください。',
        409,
      );
    }
    return probe(row, candidate);
  }
  async function action(
    owner: string,
    id: string,
    input: Record<string, unknown>,
  ) {
    const row = await get(owner, id);
    if (
      !Number.isSafeInteger(input.revision) ||
      input.revision !== row.revision
    )
      throw new NoahAgentError('状態が変わりました。読み直してください。', 409);
    if (input.action === 'disconnect') {
      await db
        .prepare(
          "UPDATE noah_connections SET state='disconnected',disconnected_at=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?",
        )
        .bind(now(), now(), id, row.revision)
        .run();
      // No remote cancellation guarantee: queued jobs never start; running results are discarded.
      await db
        .prepare(
          'UPDATE noah_asks SET stop_requested=1,revision=revision+1,updated_at=? WHERE connection_id=? AND owner_id=? AND finished_at IS NULL',
        )
        .bind(now(), id, owner)
        .run();
    } else if (input.action === 'retry' && row.state === 'failed') {
      requireRemoteEnabled(deps, owner, 'ask');
      if (now() - row.updated_at < 5000)
        throw new NoahAgentError('少し待ってから試してください。', 429);
      const current = await plan(row.agent_id, owner);
      if (current.candidate.connect_sha256 !== row.connect_sha256)
        throw new NoahAgentError(
          '接続条件が変わりました。接続を切って、内容を確かめてください。',
          409,
        );
      await db
        .prepare(
          "UPDATE noah_connections SET state='planned',error=NULL,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
        )
        .bind(now(), id, row.revision)
        .run();
      return probe(await get(owner, id), current.candidate);
    } else throw new NoahAgentError('この操作は、今はできません。', 409);
    return get(owner, id);
  }
  return { get, plan, connect, action, usable };
}
export function createNoahConnectApi(deps: RemoteDependencies) {
  const service = createNoahConnectService(deps);
  return (request: Request, id?: string) =>
    remoteResponse(async () => {
      if (!['GET', 'POST'].includes(request.method))
        return remoteJson({ error: '対応しない操作です。' }, 405);
      const { owner, ownerScope } = await remoteIdentity(deps, request);
      if (request.method === 'POST') {
        const body = await remoteBody(request, ownerScope);
        return remoteJson({
          ...presentConnection(
            await (id
              ? service.action(owner!, id, body)
              : service.connect(owner!, body)),
          ),
          ownerScope,
        });
      }
      if (id)
        return remoteJson({
          ...presentConnection(await service.get(owner!, id)),
          ownerScope,
        });
      const items = (
        await deps.db
          .prepare(
            "SELECT * FROM noah_connections WHERE owner_id=? AND place='provider' AND disconnected_at IS NULL ORDER BY updated_at DESC LIMIT 50",
          )
          .bind(owner)
          .all<RemoteConnection>()
      ).results;
      return remoteJson({ items: items.map(presentConnection), ownerScope });
    });
}
export function createNoahConnectPlanApi(deps: RemoteDependencies) {
  return (request: Request) =>
    remoteResponse(async () => {
      if (request.method !== 'GET')
        return remoteJson({ error: '対応しない操作です。' }, 405);
      const { owner, ownerScope } = await remoteIdentity(deps, request, true);
      requireRemoteEnabled(deps, owner, 'list');
      const { plan, planSha256, candidate } = await createNoahConnectService(
        deps,
      ).plan(new URL(request.url).searchParams.get('agent') ?? '', owner);
      return remoteJson({
        plan,
        planSha256,
        agentId: candidate.family_id,
        ownerScope,
      });
    });
}
