import { bindRevenueExecution, revenueDispatchMeta, revenueDispatchHash } from './noah-revenue-operation.ts';
import { NoahAgentError, noahSha256 } from './noah-agent-upload.ts';
import type { NoahConnectApiDependencies } from './noah-connect.ts';
import type { DirectoryEntry } from './noah-agent-directory.ts';
import { noahProjectDetail } from './noah-project-api.ts';
import { resolveNoahProvider } from './noah-provider-resolve.ts';
import { prepareProviderMcp, providerMcpInput, callProviderMcp } from './noah-provider-mcp.ts';
import { noahAllowed } from './noah-flags.ts';
import { noahHostedProviderHeld } from './noah-hosted-provider-policy.ts';
import { noahProviderManifest, noahReviewedAgentEndpoint, type AvailabilityObservation } from './noah-agent-availability.ts';
import {
  prepareProvider,
  providerInput,
  providerBytes,
  readProviderEvents,
  providerResult,
  type ProviderPlan,
} from './noah-gradio.ts';
import {
  createNoahRemoteWork,
  finishNoahRemoteWork,
  type NoahRemoteOutcome,
} from './noah-remote-work.ts';
import type { WorkJob } from './workflow.ts';
import type { NoahAskItem } from './noah-ask-view.ts';
import { noahRemoteUsageReceipt } from './noah-work-usage-receipt.ts';
import { workStore } from './work-store.ts';
export type ProviderDependencies = NoahConnectApiDependencies & {
  providerDirectory?: () => Promise<DirectoryEntry[]>;
  availability?: {
    prepared: (plan: ProviderPlan, observation?: AvailabilityObservation) => Promise<void>;
    succeeded: (projectId: string, digest: string, manifest: string, startedAt: number) => Promise<void>;
    failed: (projectId: string, observedAfter?: number, manifest?: string, leaseUntil?: number) => Promise<void>;
    claimDue: () => Promise<{ projectId: string; observation: AvailabilityObservation }[]>;
  };
};
const ACTIVE =
  "json_extract(payload,'$.noahRemote.provider.protocol') IN ('gradio','mcp') AND json_extract(payload,'$.noahRemote.state') IN ('queued','running')";
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const reject = (message: string, status = 409): never => {
  throw new NoahAgentError(message, status);
};
export function providerWorkView(
  job: WorkJob,
  includeResult = false,
): NoahAskItem {
  const r = job.noahRemote!,
    p = r.provider!,
    finished = !['queued', 'running'].includes(r.state);
  return {
    id: job.id,
    workId: job.id,
    connectionId: job.id,
    agentId: p.projectId,
    mode: 'provider',
    tool: r.tool ?? p.api,
    host: r.host ?? new URL(p.origin).hostname,
    state:
      r.state === 'returned'
        ? 'succeeded'
        : r.state === 'cancelled'
          ? 'stopped'
          : r.state,
    revision: job.revision,
    stopRequested: false,
    createdAt: Date.parse(job.createdAt),
    updatedAt: Date.parse(job.updatedAt),
    ...(finished
      ? { finishedAt: r.completedAt ?? Date.parse(job.updatedAt) }
      : {}),
    ...(r.error ? { error: r.error } : {}),
    ...(includeResult ? { usageReceipt: noahRemoteUsageReceipt('provider', r) } : {}),
    ...(includeResult && r.result ? { result: r.result, note: r.note } : {}),
  };
}
export function createNoahProviderRuntime(deps: ProviderDependencies) {
  const db = deps.db,
    jobs = workStore(db),
    now = deps.now ?? Date.now,
    fetcher = deps.fetcher ?? fetch;
  const get = async (owner: string, id: string) => {
    const job = UUID.test(id) ? await jobs.get(owner, id) : null;
    return job?.noahRemote?.provider && ['gradio', 'mcp'].includes(job.noahRemote.provider.protocol) ? job : null;
  };
  async function plan(projectId: string, observation: AvailabilityObservation = { startedAt: now() }): Promise<ProviderPlan> {
    if (!/^project-[a-f0-9]{64}$/.test(projectId))
      return reject('Agentを選び直してください。', 400);
    const entry = (await deps.providerDirectory?.())?.find(
      (e) => e.card.feedbackId === projectId || e.card.id === projectId,
    );
    if (!entry) return reject('このAgentは現在掲載されていません。', 404);
    const { connection } = noahProjectDetail(entry);
    const target = connection.kind === 'space' ? connection : await resolveNoahProvider(entry, fetcher);
    if (target.kind === 'space' && noahHostedProviderHeld(target.repository)) {
      await deps.availability?.failed(projectId, observation.startedAt, undefined, observation.leaseUntil).catch(() => undefined);
      return reject('この公開環境は、利用者ごとのデータ分離または外部操作の権限を確認する必要があります。本人専用の接続を準備してください。', 422);
    }
    const prepared = target.kind === 'space' ? await prepareProvider(target.repository, fetcher) : await prepareProviderMcp(target.url, fetcher, deps.probeCheck);
    for (const endpoint of prepared.endpoints)
      endpoint.digest = await noahSha256(
        new TextEncoder().encode(
          JSON.stringify([
            target.repository,
            target.kind,
            prepared.host,
            prepared.prefix,
            'sourceRevision' in prepared ? prepared.sourceRevision : null,
            endpoint.digest,
          ]),
        ),
      );
    const plan: ProviderPlan = {
      projectId,
      name: entry.card.name,
      repository: target.repository,
      ...prepared,
    };
    plan.availabilityManifest = await noahProviderManifest(plan);
    await deps.availability?.prepared(plan, observation).catch(() => undefined);
    return plan;
  }
  async function finish(
    owner: string,
    job: WorkJob,
    outcome: NoahRemoteOutcome,
  ) {
    // Compare-and-swap only. A concurrent stop or newer polling lease cannot be overwritten.
    const next = finishNoahRemoteWork(job, outcome, now());
    if (next === job) return false;
    next.noahRemote!.provider = {
      ...job.noahRemote!.provider!,
      data: [],
      phase: 'done',
      leaseUntil: 0,
    };
    const saved = await jobs.update(owner, next, job.revision);
    if (saved && outcome.state === 'returned' && job.noahRemote?.toolSha256 && job.noahRemote.provider?.availabilityManifest && noahReviewedAgentEndpoint(job.noahRemote.provider.repository, job.noahRemote.provider.api))
      await deps.availability?.succeeded(job.noahRemote.provider.projectId, job.noahRemote.toolSha256, job.noahRemote.provider.availabilityManifest, Date.parse(job.createdAt)).catch(() => undefined);
    if (saved && ['failed', 'unknown'].includes(outcome.state) && job.noahRemote?.provider?.availabilityManifest)
      await deps.availability?.failed(job.noahRemote.provider.projectId, now(), job.noahRemote.provider.availabilityManifest).catch(() => undefined);
    return saved;
  }
  async function poll(
    owner: string,
    id: string,
    waitMs = 600000,
  ): Promise<void> {
    let job = await get(owner, id);
    if (!job) return;
    const r = job.noahRemote!,
      p = r.provider!,
      at = now();
    if (
      !['queued', 'running'].includes(r.state) ||
      p.leaseUntil > at ||
      p.nextPollAt > at
    )
      return;
    if (at >= p.deadline) {
      await finish(owner, job, {
        state: 'unknown',
        error:
          '提供元の結果を期限内に取得できませんでした。二重実行を避けるため自動再送していません。',
      });
      return;
    }
    if (p.phase === 'queued' || p.phase === 'dispatching') {
      if (at - Date.parse(job.createdAt) > 60000)
        await finish(owner, job, {
          state: p.phase === 'queued' ? 'failed' : 'unknown',
          error:
            p.phase === 'queued'
              ? '実行前に中断しました。新しい依頼として試せます。'
              : '送信後の応答を確認できませんでした。二重実行を避けるため再送していません。',
        });
      return;
    }
    if (
      p.phase !== 'waiting' ||
      !p.eventId ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(p.eventId)
    )
      return;
    if (p.leaseUntil > 0) {
      await finish(owner, job, {
        state: 'unknown',
        error:
          '結果の通信が中断しました。二重実行を避けるため再送していません。',
      });
      return;
    }
    const locked = {
      ...job,
      revision: job.revision + 1,
      updatedAt: new Date(at).toISOString(),
      noahRemote: {
        ...r,
        provider: {
          ...p,
          leaseUntil: at + waitMs + 15000,
          nextPollAt: at + 3000,
        },
      },
    };
    if (!(await jobs.update(owner, locked, job.revision))) return;
    job = locked;
    try {
      // This GET observes the existing invocation. It never sends another inference request.
      const response = await fetcher(
        `${p.origin}${p.prefix}/call/${encodeURIComponent(p.api)}/${p.eventId}`,
        {
          redirect: 'manual',
          signal: AbortSignal.timeout(waitMs),
          headers: { Accept: 'text/event-stream' },
        },
      );
      const event = await readProviderEvents(response);
      if (event.state === 'error') {
        await finish(owner, job, {
          state: 'failed',
          error: event.error,
          used: [p.api],
        });
        return;
      }
      if (event.state === 'complete') {
        const result = await providerResult(event.data, p.origin, fetcher);
        await finish(owner, job, {
          state: 'returned',
          result,
          used: [p.api],
          note: '提供元から届いた成果です。Noahに保存しました。',
        });
        return;
      }
    } catch (e) {
      if (e instanceof NoahAgentError) {
        await finish(owner, job, {
          state: 'failed',
          error: e.message,
          used: [p.api],
        });
        return;
      }
      // Gradio deletes the session on SSE disconnect. Never reconnect or submit again.
    }
    await finish(owner, job, {
      state: 'unknown',
      error:
        '結果の通信が途切れました。提供元では処理された可能性があります。二重実行を避けるため再送していません。',
    });
  }
  async function reconcile(owner: string, id: string) {
    const job = await get(owner, id);
    if (!job || !['queued', 'running'].includes(job.noahRemote!.state)) return;
    const p = job.noahRemote!.provider!;
    if (
      now() > Math.max(p.leaseUntil, Date.parse(job.createdAt) + 60000) &&
      (p.phase !== 'waiting' || p.leaseUntil > 0 || now() >= p.deadline)
    ) {
      await finish(owner, job, {
        state: p.phase === 'queued' ? 'failed' : 'unknown',
        error:
          '結果を確認できませんでした。二重実行を避けるため再送していません。',
      });
    }
  }

  async function run(
    owner: string,
    id: string,
    reviewer: boolean,
  ): Promise<void> {
    let job = await get(owner, id);
    if (!job || job.noahRemote!.provider!.phase !== 'queued') return;
    const r = job.noahRemote!,
      p = r.provider!;
    // One claimant can POST; subsequent requests never reclaim dispatching, even after a crash.
    const claimed = {
      ...job,
      revision: job.revision + 1,
      updatedAt: new Date(now()).toISOString(),
      noahRemote: {
        ...r,
        state: 'running' as const,
        startedAt: now(),
        provider: {
          ...p,
          phase: 'dispatching' as const,
          leaseUntil: now() + (p.protocol === 'mcp' ? 120000 : 30000),
        },
      },
    };
    if (!(await jobs.update(owner, claimed, job.revision))) return;
    job = claimed;
    let sent = false;
    try {
      if (!noahAllowed(deps.flags, 'ask', reviewer))
        throw new NoahAgentError('新しい実行は停止中です。');
      const fresh = await plan(p.projectId),
        endpoint = fresh.endpoints.find((e) => e.name === p.api);
      if (
        !endpoint ||
        endpoint.digest !== r.toolSha256 ||
        fresh.host !== p.origin || (fresh.protocol ?? 'gradio') !== p.protocol
      )
        throw new NoahAgentError(
          '実行先や入力欄が変わりました。Agentを開き直してください。',
        );
      await deps.authorizeAction?.(
        owner,
        p.projectId,
        p.api,
        r.toolSha256!,
        true,
      );
      // Stop/owner permission changes during preparation must win before dispatch.
      const current = await get(owner, id);
      if (
        !current ||
        current.revision !== job.revision ||
        current.noahRemote!.state !== 'running'
      )
        return;
      const revenue = await revenueDispatchMeta(job, deps.revenueConfig, p.origin, p.api);
      if (p.protocol === 'mcp') {
        const result = await callProviderMcp(p.origin, endpoint, p.data[0], fetcher, deps.probeCheck, async () => {
          if (!noahAllowed(deps.flags, 'ask', reviewer)) return false;
          await deps.authorizeAction?.(owner, p.projectId, p.api, r.toolSha256!, true);
          const latest = await get(owner, id);
          return !!latest && latest.revision === job!.revision && latest.noahRemote!.state === 'running';
        }, () => { sent = true; }, revenue);
        if (result) await finish(owner, job, { state: 'returned', result, ...(revenue && { revenueDispatchSha256: await revenueDispatchHash(revenue.dispatchProof) }), used: [p.api], note: '提供元から届いた成果をNoahに保存しました。' });
        return;
      }
      sent = true;
      const response = await fetcher(
        `${p.origin}${p.prefix}/call/${encodeURIComponent(p.api)}`,
        {
          method: 'POST',
          redirect: 'manual',
          signal: AbortSignal.timeout(8000),
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(revenue && {
              'X-Noah-Revenue-Work': revenue.workId,
              'X-Noah-Revenue-Combination': revenue.combinationId,
              'X-Noah-Revenue-Version': String(revenue.version),
              'X-Noah-Revenue-Proof': revenue.dispatchProof,
            }),
          },
          body: JSON.stringify({ data: p.data }),
        },
      );
      if (!response.ok) {
        await providerBytes(response);
        return;
      }
      const result = JSON.parse(
        new TextDecoder().decode(await providerBytes(response, 4096)),
      ) as { event_id?: unknown };
      if (
        typeof result.event_id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(result.event_id)
      )
        throw Error('missing_event_id');
      const waiting = {
        ...job,
        revision: job.revision + 1,
        updatedAt: new Date(now()).toISOString(),
        noahRemote: {
          ...job.noahRemote!,
          ...(revenue && { revenueDispatchSha256: await revenueDispatchHash(revenue.dispatchProof) }),
          toolCalls: 1,
          used: [p.api],
          provider: {
            ...p,
            data: [],
            phase: 'waiting' as const,
            eventId: result.event_id,
            leaseUntil: 0,
            nextPollAt: 0,
          },
        },
      };
      await jobs.update(owner, waiting, job.revision);
    } catch (e) {
      await finish(owner, job, {
        state: sent && !(e instanceof NoahAgentError) ? 'unknown' : 'failed',
        error:
          e instanceof NoahAgentError
            ? e.message
            : sent
              ? '送信後の実行番号を確認できませんでした。二重実行を避けるため再送していません。'
              : '実行の準備に失敗しました。新しい依頼としてお試しください。',
        used: sent ? [p.api] : [],
      });
    }
  }
  async function accept(
    owner: string,
    reviewer: boolean,
    input: {
      id: string;
      projectId: string;
      api: string;
      digest: string;
      input: Record<string, unknown>;
      confirm: boolean;
    },
  ) {
    if (!UUID.test(input.id)) return reject('操作IDを確認してください。', 400);
    const requestHash = await noahSha256(
      new TextEncoder().encode(
        JSON.stringify([
          input.projectId,
          input.api,
          input.digest,
          Object.entries(input.input).sort(([a], [b]) => a.localeCompare(b)),
        ]),
      ),
    );
    const existing = await get(owner, input.id);
    if (existing) {
      if (existing.noahRemote!.inputSha256 !== requestHash)
        return reject('同じ操作IDで依頼内容は変更できません。');
      return { job: existing, replay: true };
    }
    if (!noahAllowed(deps.flags, 'ask', reviewer))
      return reject('新しい依頼は停止中です。', 503);
    if (!input.confirm)
      return reject('入力と送信先を確認してから実行してください。', 400);
    const prepared = await plan(input.projectId),
      endpoint = prepared.endpoints.find(
        (e) => e.name === input.api && e.digest === input.digest,
      );
    if (!endpoint)
      return reject('入力欄が更新されました。Agentを開き直してください。');
    const data = prepared.protocol === 'mcp' ? [providerMcpInput(endpoint, input.input)] : providerInput(endpoint, input.input);
    await deps.authorizeAction?.(
      owner,
      input.projectId,
      input.api,
      input.digest,
      true,
    );
    const at = now(),
      job = createNoahRemoteWork(
        input.id,
        {
          connectionId: input.id,
          familyKey: input.projectId,
          digest: input.digest,
          agentName: prepared.name,
          host: new URL(prepared.host).hostname,
          tool: input.api,
          toolSha256: input.digest,
          toolsSha256: input.digest,
          args: input.input,
          inputSha256: requestHash,
        },
        at,
      );
    job.noahRemote!.provider = {
      protocol: prepared.protocol ?? 'gradio',
      projectId: input.projectId,
      repository: prepared.repository,
      origin: prepared.host,
      prefix: prepared.prefix,
      api: input.api,
      data,
      phase: 'queued',
      leaseUntil: 0,
      nextPollAt: 0,
      deadline: at + 1800000,
      availabilityManifest: prepared.availabilityManifest,
    };
    bindRevenueExecution(job, owner, deps.revenueConfig, prepared.host, input.api);
    // Atomic limits also cover simultaneous browser requests. No schema migration is needed.
    const created = await db
      .prepare(`INSERT INTO work_jobs (id,user_id,payload,revision,updated_at) SELECT ?,?,?,?,?
      WHERE (SELECT COUNT(*) FROM work_jobs WHERE user_id=? AND ${ACTIVE})<3
      AND (SELECT COUNT(*) FROM work_jobs WHERE user_id=? AND json_extract(payload,'$.noahRemote.provider.protocol') IN ('gradio','mcp') AND updated_at>?)<6
      AND (SELECT COUNT(*) FROM work_jobs WHERE user_id=? AND json_extract(payload,'$.noahRemote.provider.protocol') IN ('gradio','mcp') AND json_extract(payload,'$.createdAt')>?)<100
      AND (SELECT COUNT(*) FROM work_jobs WHERE json_extract(payload,'$.noahRemote.provider.origin')=? AND updated_at>?)<12
      ON CONFLICT(id) DO NOTHING`)
      .bind(
        job.id,
        owner,
        JSON.stringify(job),
        job.revision,
        job.updatedAt,
        owner,
        owner,
        new Date(at - 60000).toISOString(),
        owner,
        new Date(at - 86400000).toISOString(),
        prepared.host,
        new Date(at - 60000).toISOString(),
      )
      .run();
    if (created.meta.changes !== 1) {
      const replay = await get(owner, input.id);
      if (replay && replay.noahRemote!.inputSha256 === requestHash)
        return { job: replay, replay: true };
      return reject(
        '依頼が重なっています。少し待ってからお試しください。',
        429,
      );
    }
    return { job, replay: false, run: () => run(owner, job.id, reviewer) };
  }
  async function list(owner: string, projectId: string | null = null) {
    const rows = await db
      .prepare(
        `SELECT payload FROM work_jobs WHERE user_id=? AND json_extract(payload,'$.noahRemote.provider.protocol') IN ('gradio','mcp') ${projectId ? "AND json_extract(payload,'$.noahRemote.provider.projectId')=?" : ''} ORDER BY updated_at DESC,id DESC LIMIT 50`,
      )
      .bind(...(projectId ? [owner, projectId] : [owner]))
      .all<{ payload: string }>();
    const list = rows.results.map((r) => JSON.parse(r.payload) as WorkJob);
    for (const job of list
      .filter((j) => ['queued', 'running'].includes(j.noahRemote!.state))
      .slice(0, 3))
      void wake(owner, job.id);
    return list.map((j) => providerWorkView(j));
  }
  function wake(owner: string, id: string) {
    const work = reconcile(owner, id).catch(() => undefined);
    if (deps.waitUntil) deps.waitUntil(work);
    return work;
  }
  async function stop(owner: string, id: string, revision: number) {
    const job = await get(owner, id);
    if (!job) return null;
    if (job.revision !== revision)
      return reject('状態が更新されました。もう一度お試しください。');
    await finish(owner, job, {
      state: 'cancelled',
      error:
        'Noahでの受取を停止しました。提供元ですでに始まった処理は停止できない場合があります。',
    });
    return get(owner, id);
  }
  async function sweep() {
    const rows = await db
      .prepare(
        `SELECT id,user_id FROM work_jobs WHERE ${ACTIVE} ORDER BY updated_at ASC LIMIT 10`,
      )
      .all<{ id: string; user_id: string }>();
    await Promise.allSettled(
      rows.results.map((row) => reconcile(row.user_id, row.id)),
    );
  }
  async function checkAvailability() {
    const due = await deps.availability?.claimDue() ?? [];
    for (const { projectId, observation } of due) {
      try { await plan(projectId, observation); }
      catch { await deps.availability?.failed(projectId, observation.startedAt, undefined, observation.leaseUntil).catch(() => undefined); }
    }
  }
  return { plan, accept, run, poll, get, list, wake, stop, sweep, checkAvailability };
}
