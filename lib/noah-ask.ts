import {
  createNoahConnectService,
  takeRemoteHost,
  remoteErrorMessage,
} from './noah-connect.ts';
import {
  noahFormSummary,
  noahToolMenu,
  noahToolForm,
  noahFormArgs,
  checkNoahToolArgs,
  noahToolSha256,
  noahFormRequestSha256,
  noahResultText,
  noahAskGate,
  type NoahConfirmedTool,
} from './noah-form.ts';
import {
  noahMcpHandshake,
  noahMcpCall,
  noahMcpClose,
  NoahMouthError,
  type NoahMcpSession,
} from './noah-mouth-mcp-remote.ts';
import { remoteContext, remoteFailure } from './noah-probe.ts';
import { candidateTarget, touchRemoteFamily } from './noah-remote-candidate.ts';
import { intakeStatement } from './noah-intake-db.ts';
import { REMOTE_GATE_SQL } from './noah-remote-sql.ts';
import {
  createNoahRemoteWork,
  updateNoahRemoteWork,
  type NoahRemoteExecution,
} from './noah-remote-work.ts';
import { workStore } from './work-store.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import {
  remoteResponse,
  remoteJson,
  remoteIdentity,
  remoteBody,
  remoteUuid,
  remoteHash,
  remoteObject,
  requireRemoteEnabled,
  type RemoteDependencies,
} from './noah-remote-api.ts';
export type RemoteAsk = {
  id: string;
  owner_id: string;
  connection_id: string;
  work_id: string;
  request_sha256: string;
  tool: string;
  tool_sha256: string;
  host: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'stopped' | 'unknown';
  stop_requested: number;
  revision: number;
  lease_until: number;
  created_at: number;
  updated_at: number;
  finished_at: number | null;
  error: string | null;
};
const present = (row: RemoteAsk) => ({
  id: row.id,
  workId: row.work_id,
  connectionId: row.connection_id,
  state: row.state,
  mode: 'form',
  revision: row.revision,
  tool: row.tool,
  host: row.host,
  stopRequested: !!row.stop_requested,
  error: row.error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
export function createNoahAskService(deps: RemoteDependencies) {
  const { db } = deps,
    now = deps.now ?? Date.now,
    connect = createNoahConnectService(deps),
    works = workStore(db);
  async function get(owner: string, id: string) {
    const row = await db
      .prepare('SELECT * FROM noah_asks WHERE owner_id=? AND id=?')
      .bind(owner, id)
      .first<RemoteAsk>();
    if (!row) throw new NoahAgentError('依頼が見つかりません。', 404);
    return row;
  }
  async function tools(owner: string, id: string, toolName?: string | null) {
    requireRemoteEnabled(deps, owner, 'ask');
    const connection = await connect.get(owner, id),
      candidate = await connect.usable(connection);
    if (
      connection.last_used_at !== null &&
      now() - connection.last_used_at < 5000
    )
      throw new NoahAgentError('少し待ってから開いてください。', 429);
    const claimed = await db
      .prepare(
        "UPDATE noah_connections SET last_used_at=? WHERE id=? AND owner_id=? AND state='connected' AND (last_used_at IS NULL OR last_used_at<=?) RETURNING id",
      )
      .bind(now(), id, owner, now() - 5000)
      .first();
    if (!claimed)
      throw new NoahAgentError('少し待ってから開いてください。', 429);
    await takeRemoteHost(deps, candidate.host);
    const context = remoteContext(deps, false, AbortSignal.timeout(8000));
    try {
      const hello = await noahMcpHandshake(
        candidateTarget(candidate).url,
        context,
      );
      deps.defer(noahMcpClose(hello.session, context));
      await connect.usable(await connect.get(owner, id));
      const confirmed = JSON.parse(
        connection.confirmed_tools_json,
      ) as NoahConfirmedTool[];
      const menu = await noahToolMenu(hello.tools, confirmed);
      let forms = 0;
      const withForms = menu.map((item) => ({
        ...item,
        form:
          item.usable && forms++ < 100
            ? noahToolForm(hello.tools.find((t) => t.name === item.name)!)
            : null,
      }));
      const selected = toolName
        ? hello.tools.find((t) => t.name === toolName)
        : null;
      if (toolName && !selected)
        throw new NoahAgentError(
          '道具が見つかりません。入力欄を開き直してください。',
          404,
        );
      return {
        host: candidate.host,
        toolsSha256: hello.toolsSha256,
        tools: selected
          ? [
              {
                ...menu.find((t) => t.name === selected.name)!,
                form: noahToolForm(selected),
                summary: selected.description.slice(0, 4000),
              },
            ]
          : withForms,
      };
    } catch (e) {
      if (e instanceof NoahAgentError) throw e;
      if (e instanceof NoahMouthError) await remoteFailure(deps, candidate, e);
      throw new NoahAgentError(
        remoteErrorMessage(e),
        e instanceof NoahMouthError && e.code === 'rate_limited'
          ? 429
          : e instanceof NoahMouthError &&
              ['auth_required', 'payment_required'].includes(e.code)
            ? 409
            : 502,
      );
    }
  }
  async function finish(
    owner: string,
    id: string,
    state: RemoteAsk['state'],
    result?: NoahRemoteExecution['result'],
    error?: string,
    called = false,
    attempt = 0,
    hello?: Awaited<ReturnType<typeof noahMcpHandshake>>,
  ): Promise<void> {
    const row = await get(owner, id);
    if (row.finished_at !== null) return;
    const connection = await connect.get(owner, row.connection_id);
    if (row.stop_requested || connection.state === 'disconnected') {
      state = 'stopped';
      result = undefined;
      error =
        row.state === 'running'
          ? '止めました。相手のサーバーで実行されたかは分かりません。'
          : '止めました。';
    }
    const job = await works.get(owner, row.work_id);
    if (!job?.noahRemote) throw new Error('Missing remote Work');
    const at = now(),
      workState =
        state === 'succeeded'
          ? 'returned'
          : state === 'stopped'
            ? 'cancelled'
            : (state as 'failed' | 'unknown');
    const next = updateNoahRemoteWork(
      job,
      workState,
      at,
      result,
      error,
      called ? row.tool : undefined,
    );
    const updates = await db.batch([
      db
        .prepare(
          `UPDATE noah_asks SET state=?,error=?,finished_at=?,updated_at=?,revision=revision+1,tool_calls=? WHERE id=? AND owner_id=? AND revision=? AND finished_at IS NULL AND (stop_requested=0 OR ?='stopped') AND (?='stopped' OR EXISTS(SELECT 1 FROM noah_connections WHERE id=noah_asks.connection_id AND state<>'disconnected'))`,
        )
        .bind(
          state,
          error?.slice(0, 300) ?? null,
          at,
          at,
          Number(called),
          id,
          owner,
          row.revision,
          state,
          state,
        ),
      db
        .prepare(`UPDATE work_jobs SET payload=?,revision=?,updated_at=? WHERE id=? AND user_id=? AND revision=?
        AND EXISTS(SELECT 1 FROM noah_asks WHERE id=? AND revision=? AND state=? AND finished_at=?)`)
        .bind(
          JSON.stringify(next),
          next.revision,
          next.updatedAt,
          row.work_id,
          owner,
          job.revision,
          id,
          row.revision + 1,
          state,
          at,
        ),
    ]);
    if (!updates[0].meta.changes && attempt < 3)
      return finish(
        owner,
        id,
        state,
        result,
        error,
        called,
        attempt + 1,
        hello,
      );
    if (updates[0].meta.changes && state === 'succeeded') {
      await db
        .prepare('UPDATE noah_connections SET last_used_at=? WHERE id=?')
        .bind(at, connection.id)
        .run();
      const candidate = await connect
        .usable(await connect.get(owner, connection.id))
        .catch(() => null);
      if (candidate) {
        const summary = hello ? noahFormSummary(hello.tools) : null;
        await db
          .prepare(
            "UPDATE noah_intake_checks SET l2_at=CASE WHEN level=2 THEN l2_at ELSE ? END,level=2,result='ok',tools_sha256=COALESCE(?,tools_sha256),tool_count=COALESCE(?,tool_count),read_only=COALESCE(?,read_only),form_tools=COALESCE(?,form_tools),one_tap_tools=COALESCE(?,one_tap_tools),l1_at=COALESCE(l1_at,?),failures=0,first_failure_at=NULL WHERE candidate_id=? AND connect_sha256=?",
          )
          .bind(
            at,
            hello?.toolsSha256 ?? null,
            hello?.tools.length ?? null,
            hello ? Number(hello.allReadOnly) : null,
            summary?.formTools ?? null,
            summary?.oneTapTools ?? null,
            at,
            candidate.id,
            candidate.connect_sha256,
          )
          .run();
        await touchRemoteFamily(db, candidate.family_id, at);
      }
    }
  }
  async function run(
    owner: string,
    id: string,
    input: Record<string, unknown>,
    confirm: boolean,
  ) {
    const before = await get(owner, id);
    if (before.stop_requested) {
      await finish(owner, id, 'stopped');
      return;
    }
    const row = await db
      .prepare(
        "UPDATE noah_asks SET state='running',lease_until=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND state='queued' AND stop_requested=0 RETURNING *",
      )
      .bind(now() + 30000, now(), id, owner)
      .first<RemoteAsk>();
    if (!row) return;
    let session: NoahMcpSession | undefined,
      called = false;
    const context = remoteContext(deps);
    try {
      const job = await works.get(owner, row.work_id);
      if (!job) throw new Error('Missing remote Work');
      const started = updateNoahRemoteWork(job, 'running', now());
      if (!(await works.update(owner, started, job.revision)))
        throw new Error('Work changed');
      let connection = await connect.get(owner, row.connection_id);
      const candidate = await connect.usable(connection);
      const hello = await noahMcpHandshake(candidateTarget(candidate).url, {
        ...context,
        signal: AbortSignal.timeout(8000),
      });
      session = hello.session;
      const tool = hello.tools.find((t) => t.name === row.tool);
      if (!tool || (await noahToolSha256(tool)) !== row.tool_sha256)
        throw new NoahAgentError(
          'この道具の内容が変わりました。入力欄を開き直してください。',
          409,
        );
      connection = await connect.get(owner, row.connection_id);
      await connect.usable(connection);
      const form = noahToolForm(tool);
      if (!form.usable)
        throw new NoahAgentError('この道具は、入力欄では使えません。', 422);
      const args = noahFormArgs(form, input);
      if (!args.ok) throw new NoahAgentError(args.message);
      if (checkNoahToolArgs(tool.inputSchema, args.args))
        throw new NoahAgentError('入力の形が、道具の定義と合いません。');
      const confirmed = JSON.parse(
        connection.confirmed_tools_json,
      ) as NoahConfirmedTool[];
      if (
        !tool.readOnly &&
        !confirmed.some(
          (t) => t.name === tool.name && t.sha256 === row.tool_sha256,
        )
      ) {
        if (!confirm)
          throw new NoahAgentError(
            'この道具は、最初の1回、内容を確かめてから使います。',
            409,
          );
        const updated = await db
          .prepare(
            "UPDATE noah_connections SET confirmed_tools_json=?,revision=revision+1 WHERE id=? AND revision=? AND state='connected'",
          )
          .bind(
            JSON.stringify([
              ...confirmed.filter((t) => t.name !== tool.name),
              { name: tool.name, sha256: row.tool_sha256 },
            ]),
            connection.id,
            connection.revision,
          )
          .run();
        if (updated.meta.changes !== 1)
          throw new NoahAgentError(
            '接続の状態が変わりました。入力欄を開き直してください。',
            409,
          );
      }
      if (
        (await get(owner, id)).stop_requested ||
        (await connect.get(owner, row.connection_id)).state !== 'connected'
      ) {
        await finish(owner, id, 'stopped');
        return;
      }
      called = true;
      const response = await noahMcpCall(
        session,
        tool.name,
        args.args,
        context,
        20000,
      );
      const result = noahResultText(response);
      await finish(
        owner,
        id,
        response.ok ? 'succeeded' : 'failed',
        response.ok ? result : undefined,
        response.ok ? undefined : result.text.slice(0, 240),
        true,
        0,
        hello,
      );
    } catch (e) {
      let state: RemoteAsk['state'] = 'failed',
        message = remoteErrorMessage(e);
      if (e instanceof NoahMouthError) {
        const c = await connect.get(owner, row.connection_id),
          candidate = await connect.usable(c).catch(() => null);
        if (candidate) await remoteFailure(deps, candidate, e);
        if (
          called &&
          (e.code === 'unreachable' ||
            (e.code === 'incompatible' && !e.detail.rpc))
        ) {
          state = 'unknown';
          message =
            '結果を確かめられませんでした。相手のサーバーで実行されたかは分かりません。';
        } else if (e.code === 'too_large')
          message = '成果が大きすぎて、受け取れませんでした。';
        else if (e.code === 'incompatible')
          message = '相手のサーバーが、この入力を受け付けませんでした。';
      } else if (!(e instanceof NoahAgentError) && called) {
        state = 'unknown';
        message =
          '結果を保存できませんでした。相手のサーバーで実行された可能性があります。';
      }
      await finish(owner, id, state, undefined, message, called);
    } finally {
      if (session) await noahMcpClose(session, context);
    }
  }
  async function ask(owner: string, value: Record<string, unknown>) {
    requireRemoteEnabled(deps, owner, 'ask');
    if ('prompt' in value)
      throw new NoahAgentError(
        '1文で頼む機能は、まだ使えません。入力欄から使えます。',
        422,
      );
    const f = value.form;
    if (
      !remoteUuid(value.id) ||
      !remoteUuid(value.connectionId) ||
      !remoteObject(f) ||
      typeof f.tool !== 'string' ||
      !/^[A-Za-z0-9_.:/-]{1,128}$/.test(f.tool) ||
      !remoteHash(f.toolSha256) ||
      !remoteObject(f.input) ||
      (f.confirm !== undefined && f.confirm !== true) ||
      (value.screen !== undefined &&
        (typeof value.screen !== 'string' ||
          !['narrow', 'wide'].includes(value.screen))) ||
      Object.keys(value).some(
        (k) => !['id', 'connectionId', 'form', 'screen'].includes(k),
      ) ||
      Object.keys(f).some(
        (k) => !['tool', 'toolSha256', 'input', 'confirm'].includes(k),
      )
    )
      throw new NoahAgentError('依頼の入力を確認してください。');
    const hash = await noahFormRequestSha256({
      connectionId: value.connectionId,
      tool: f.tool,
      toolSha256: f.toolSha256,
      args: f.input,
    });
    const previous = await db
      .prepare('SELECT * FROM noah_asks WHERE id=?')
      .bind(value.id)
      .first<RemoteAsk>();
    if (previous) {
      if (previous.owner_id !== owner)
        throw new NoahAgentError('依頼が見つかりません。', 404);
      if (previous.request_sha256 !== hash)
        throw new NoahAgentError('同じ操作IDの内容は変更できません。', 409);
      return { row: previous, created: false };
    }
    const connection = await connect.get(owner, value.connectionId),
      candidate = await connect.usable(connection),
      at = now();
    const counts = await intakeStatement(db, REMOTE_GATE_SQL.gate, {
      owner,
      host: candidate.host,
      minute_ago: at - 60000,
      day_ago: at - 86400000,
    }).first<{
      open: number;
      last_minute: number;
      last_day: number;
      host_last_minute: number;
    }>();
    const gate = noahAskGate(
      {
        open: counts!.open,
        lastMinute: counts!.last_minute,
        lastDay: counts!.last_day,
        hostLastMinute: counts!.host_last_minute,
      },
      deps.flags.askLimits,
    );
    if (!gate.ok) throw new NoahAgentError(gate.message, gate.status);
    await takeRemoteHost(deps, candidate.host);
    const job = createNoahRemoteWork(
        value.id,
        {
          connectionId: connection.id,
          familyKey: connection.family_key,
          digest: connection.digest,
          prompt: `${f.tool} ${JSON.stringify(f.input)}`.slice(0, 1000),
          inputSha256: hash,
          toolsSha256: f.toolSha256,
        },
        at,
      ),
      l = deps.flags.askLimits;
    const inserted = await db.batch([
      db
        .prepare(`INSERT OR IGNORE INTO noah_asks(id,owner_id,connection_id,work_id,request_sha256,mode,host,tool,tool_sha256,screen,state,revision,created_at,updated_at)
        SELECT ?,?,?,?,?,'form',?,?,?,?,'queued',1,?,? WHERE
        (SELECT COUNT(*) FROM noah_asks WHERE owner_id=? AND finished_at IS NULL)<?
        AND (SELECT COUNT(*) FROM noah_asks WHERE owner_id=? AND created_at>?)<?
        AND (SELECT COUNT(*) FROM noah_asks WHERE owner_id=? AND created_at>?)<?
        AND (SELECT COUNT(*) FROM noah_asks WHERE host=? AND created_at>?)<?
        AND EXISTS(SELECT 1 FROM noah_connections WHERE id=? AND owner_id=? AND state='connected')
        AND NOT EXISTS(SELECT 1 FROM work_jobs WHERE id=?)`)
        .bind(
          value.id,
          owner,
          connection.id,
          job.id,
          hash,
          candidate.host,
          f.tool,
          f.toolSha256,
          value.screen ?? null,
          at,
          at,
          owner,
          l.open,
          owner,
          at - 60000,
          l.perMinute,
          owner,
          at - 86400000,
          l.perDay,
          candidate.host,
          at - 60000,
          l.hostPerMinute,
          connection.id,
          owner,
          job.id,
        ),
      db
        .prepare(`INSERT OR IGNORE INTO work_jobs(id,user_id,payload,revision,updated_at) SELECT ?,?,?,?,?
        WHERE EXISTS(SELECT 1 FROM noah_asks WHERE id=? AND owner_id=? AND request_sha256=?)`)
        .bind(
          job.id,
          owner,
          JSON.stringify(job),
          job.revision,
          job.updatedAt,
          value.id,
          owner,
          hash,
        ),
    ]);
    const row = await get(owner, value.id).catch(() => null);
    if (!row)
      throw new NoahAgentError(
        '依頼が増えています。少し待ってから試してください。',
        409,
      );
    if (row.request_sha256 !== hash)
      throw new NoahAgentError('同じ操作IDの内容は変更できません。', 409);
    if (inserted[0].meta.changes)
      deps.defer(run(owner, row.id, f.input, f.confirm === true));
    return { row, created: !!inserted[0].meta.changes };
  }
  async function stop(owner: string, id: string, revision: unknown) {
    const row = await get(owner, id);
    if (!Number.isSafeInteger(revision) || revision !== row.revision)
      throw new NoahAgentError('状態が変わりました。読み直してください。', 409);
    if (row.finished_at !== null) return row;
    const updated = await db
      .prepare(
        'UPDATE noah_asks SET stop_requested=1,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND finished_at IS NULL',
      )
      .bind(now(), id, owner, revision)
      .run();
    if (!updated.meta.changes)
      throw new NoahAgentError('状態が変わりました。読み直してください。', 409);
    if (row.state === 'queued') await finish(owner, id, 'stopped');
    return get(owner, id);
  }
  return { get, tools, ask, stop, run, finish };
}
export function createNoahAskApi(deps: RemoteDependencies) {
  const service = createNoahAskService(deps);
  return (request: Request, id?: string) =>
    remoteResponse(async () => {
      if (!['GET', 'POST'].includes(request.method))
        return remoteJson({ error: '対応しない操作です。' }, 405);
      const { owner, ownerScope } = await remoteIdentity(deps, request);
      if (request.method === 'POST') {
        const input = await remoteBody(request, ownerScope);
        if (id) {
          if (
            input.action !== 'stop' ||
            Object.keys(input).some((k) => !['action', 'revision'].includes(k))
          )
            throw new NoahAgentError('操作を確認してください。');
          return remoteJson({
            ...present(await service.stop(owner!, id, input.revision)),
            ownerScope,
          });
        }
        const { row, created } = await service.ask(owner!, input);
        return remoteJson({ ...present(row), ownerScope }, created ? 202 : 200);
      }
      if (id) {
        const row = await service.get(owner!, id),
          work = await workStore(deps.db).get(owner!, row.work_id);
        return remoteJson({
          ...present(row),
          ...(row.state === 'succeeded'
            ? { result: work?.noahRemote?.result }
            : {}),
          ownerScope,
        });
      }
      const connection = new URL(request.url).searchParams.get('connection');
      if (connection)
        await createNoahConnectService(deps).get(owner!, connection);
      const rows = await deps.db
        .prepare(
          `SELECT * FROM noah_asks WHERE owner_id=? ${connection ? 'AND connection_id=?' : ''} ORDER BY created_at DESC,id DESC LIMIT 50`,
        )
        .bind(...(connection ? [owner, connection] : [owner]))
        .all<RemoteAsk>();
      return remoteJson({ items: rows.results.map(present), ownerScope });
    });
}
export function createNoahToolsApi(deps: RemoteDependencies) {
  return (request: Request, id: string) =>
    remoteResponse(async () => {
      if (request.method !== 'GET')
        return remoteJson({ error: '対応しない操作です。' }, 405);
      const { owner, ownerScope } = await remoteIdentity(deps, request);
      return remoteJson({
        ...(await createNoahAskService(deps).tools(
          owner!,
          id,
          new URL(request.url).searchParams.get('tool'),
        )),
        ownerScope,
      });
    });
}
