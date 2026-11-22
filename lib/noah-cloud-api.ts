import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import type { DirectoryEntry } from './noah-agent-directory.ts';
import { NOAH_CLOUD_PROFILES, NOAH_CLOUD_LIMITS, noahCloudDigest, noahCloudId, noahCloudProfile, noahCloudResult, type NoahCloudJob, type NoahCloudProfile } from './noah-cloud-contract.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
import { createNoahRemoteWork, finishNoahRemoteWork, startNoahRemoteWork } from './noah-remote-work.ts';
import { workStore } from './work-store.ts';
import type { WorkJob } from './workflow.ts';
import { noahCloudReceipt, readNoahCloudReceipt } from './noah-cloud-receipt.ts';
import { noahProjectSources } from './noah-provider-resolve.ts';

type Dependencies = {
  authenticate: (request: Request) => Promise<string>;
  directory: () => Promise<DirectoryEntry[]>;
  db: Pick<D1Database, 'prepare'>;
  runtime: (body: Record<string, unknown>) => Promise<Response>;
  authorize: (owner: string, target: string, action: string, digest: string, confirmed: boolean) => Promise<void>;
  now?: () => number;
  receiptKey?: string;
  profiles?: readonly NoahCloudProfile[];
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization', 'X-Content-Type-Options': 'nosniff' } });
const active = (job: WorkJob) => ['queued', 'running'].includes(job.noahRemote?.state ?? '');
export function noahCloudEntry(entry: DirectoryEntry) {
  for (const url of noahProjectSources(entry)) {
    if (typeof url !== 'string') continue;
    const profile = noahCloudProfile(url); if (profile) return profile;
  }
  return null;
}
/** The only server-to-runtime path. Credentials never reach the browser or container. */
export function noahCloudRuntime(config: { url?: string; key?: string }, fetcher: typeof fetch = fetch) {
  return async (body: Record<string, unknown>) => {
    if (!config.url || !/^https:\/\/(?:noah-cloud-agents|noah-free-cloud-agents)\.[a-z0-9-]+\.workers\.dev$/.test(config.url) || !config.key || config.key.length < 32) throw new NoahAgentError('クラウド実行環境を準備しています。', 503);
    const response = await fetcher(`${config.url}/rpc`, { method: 'POST', headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new NoahAgentError('クラウド接続先の転送は許可されていません。', 502); }
    return response;
  };
}
async function receive(db: Dependencies['db'], owner: string, work: WorkJob, remote: NoahCloudJob, now: () => number) {
    const jobs = workStore(db);
    if (remote.id !== work.id || remote.profile !== work.noahRemote?.cloud?.profile || remote.mode !== 'run' || remote.distribution !== work.noahRemote.digest || remote.version !== work.noahRemote.cloud.version) throw new NoahAgentError('実行結果の宛先または配布版が一致しません。', 502);
    if (!active(work)) return work;
    let next = work;
    if (remote.state === 'running') next = startNoahRemoteWork(work, now());
    if (remote.state === 'returned') {
      const result = await noahCloudResult({ type: 'result', ...remote.result }, remote.calls);
      if (result.exitCode !== 0 || result.calls < 1) throw new NoahAgentError('実行器が正常な結果を返しませんでした。', 502);
      next = finishNoahRemoteWork(work, { state: 'returned', result: { text: result.text, truncated: false, attachments: result.files.length }, note: `${NOAH_CLOUD_PROFILES[remote.profile].name} ${remote.version} がNoahのクラウドで返した結果です。内容は未検証です。`, used: ['cloud-agent'] }, now());
      next.noahRemote = { ...next.noahRemote!, modelCalls: result.calls, cloud: { ...work.noahRemote!.cloud!, files: result.files } };
    } else if (['failed', 'cancelled', 'unknown'].includes(remote.state)) {
      next = finishNoahRemoteWork(work, { state: remote.state as 'failed' | 'cancelled' | 'unknown', error: remote.error || 'クラウド実行を完了できませんでした。' }, now());
    }
    if (next !== work) await jobs.update(owner, next, work.revision);
    return (await jobs.get(owner, work.id))!;
}
/** Server-only completion path persists results even with every customer browser closed. */
export function createNoahCloudResultApi(deps: Pick<Dependencies, 'db' | 'receiptKey' | 'now'>) {
  return async (request: Request) => {
    const secret = deps.receiptKey;
    if (request.method !== 'POST' || request.headers.has('origin') || !secret || secret.length < 32 || await noahCloudDigest(request.headers.get('authorization') ?? '') !== await noahCloudDigest(`Bearer ${secret}`)) return json({ error: 'unauthorized' }, 401);
    try {
      const body = JSON.parse(new TextDecoder().decode(await boundedNoahBody(request, 262144)));
      const ticket = await readNoahCloudReceipt(secret, body.ticket);
      const work = await workStore(deps.db).get(ticket.owner, ticket.jobId);
      if (!work || work.noahRemote?.cloud?.projectId !== ticket.project || work.noahRemote.inputSha256 !== ticket.inputHash || !['returned', 'failed', 'cancelled', 'unknown'].includes(body.job?.state)) return json({ error: 'receipt_mismatch' }, 409);
      const saved = await receive(deps.db, ticket.owner, work, body.job, deps.now ?? Date.now);
      return json({ saved: !active(saved) }, active(saved) ? 409 : 200);
    } catch { return json({ error: 'receipt_not_saved' }, 503); }
  };
}
export function createNoahCloudApi(deps: Dependencies) {
  const jobs = workStore(deps.db), now = deps.now ?? Date.now;
  const view = (job: WorkJob) => ({ id: job.id, name: job.title, state: job.noahRemote?.state, createdAt: job.createdAt, completedAt: job.noahRemote?.completedAt, prompt: job.noahRemote?.prompt, result: job.noahRemote?.result, files: job.noahRemote?.cloud?.files ?? [], error: job.noahRemote?.error, calls: job.noahRemote?.modelCalls ?? 0 });
  return async (request: Request) => {
    try {
      if (!['GET', 'POST'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
      const owner = await deps.authenticate(request), scope = await ownerScopeFor(owner), runtimeOwner = await noahCloudDigest(owner);
      const mutate = request.method === 'POST';
      if (mutate && (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site')) throw new NoahAgentError('同じNoahから操作してください。', 403);
      if (mutate && request.headers.get(OWNER_SCOPE_HEADER) !== scope) throw new NoahAgentError('利用者が変わりました。読み直してください。', 409);
      if (mutate && !request.headers.get('content-type')?.startsWith('application/json')) throw new NoahAgentError('JSONで操作してください。', 415);
      const input = mutate ? JSON.parse(new TextDecoder().decode(await boundedNoahBody(request, 16000))) as Record<string, unknown> : Object.fromEntries(new URL(request.url).searchParams);
      if (!input || Array.isArray(input) || Object.keys(input).some(key => !['action', 'projectId', 'id', 'jobId', 'connectionId', 'prompt', 'confirm'].includes(key)) || typeof input.projectId !== 'string' || !/^project-[a-f0-9]{64}$/.test(input.projectId)) throw new NoahAgentError('Agentの指定を確認してください。');
      const project = input.projectId;
      const action = mutate ? input.action : input.jobId ? 'job' : 'status';
      if (!['status', 'connect', 'disconnect', 'start', 'job', 'stop'].includes(String(action)) || !mutate && !['status', 'job'].includes(String(action))) throw new NoahAgentError('操作を確認してください。');
      // Existing owned work remains stoppable/readable after catalog removal or outage.
      const existing = ['job', 'stop'].includes(String(action)) && noahCloudId(input.jobId) ? await jobs.get(owner, input.jobId) : null;
      const existingCloud = existing?.noahRemote?.cloud;
      const existingAction = ['job', 'stop'].includes(String(action));
      if (existingAction && (!existingCloud || existingCloud.projectId !== project || !Object.hasOwn(NOAH_CLOUD_PROFILES, existingCloud.profile))) throw new NoahAgentError('依頼が見つかりません。', 404);
      const entry = existingAction ? undefined : (await deps.directory()).find(row => row.card.feedbackId === project || row.card.id === project);
      const profile = existingAction ? existingCloud!.profile : entry && noahCloudEntry(entry);
      if (!profile) throw new NoahAgentError('このAgentのクラウド実行は現在利用できません。', 404);
      if (!existingAction && deps.profiles && !deps.profiles.includes(profile)) throw new NoahAgentError('このAgentは無料クラウドの対応準備中です。', 403);
      const call = async (extra: Record<string, unknown>) => {
        const response = await deps.runtime({ owner: runtimeOwner, project, profile, distribution: NOAH_CLOUD_PROFILES[profile].sha256, ...extra });
        const body = JSON.parse(new TextDecoder().decode(await boundedNoahBody(new Request('https://runtime.invalid', { method: 'POST', body: response.body, duplex: 'half' } as RequestInit), 262144))) as Record<string, unknown>;
        if (!response.ok) throw new NoahAgentError(typeof body.error === 'string' ? body.error : 'クラウドに接続できませんでした。', response.status >= 400 && response.status < 600 ? response.status : 502);
        return body;
      };
      if (action === 'status') {
        const state = await call({ action });
        const history = (await jobs.list(owner)).filter(job => job.noahRemote?.cloud?.projectId === project).slice(0, 20);
        return json({ ...state, ownerScope: scope, jobs: history.map(view), profile: { key: profile, ...NOAH_CLOUD_PROFILES[profile] } });
      }
      if (['connect', 'start'].includes(String(action))) {
        try { await deps.authorize(owner, project, action === 'connect' ? 'connect' : 'run', await noahCloudDigest(JSON.stringify(NOAH_CLOUD_PROFILES[profile])), input.confirm === true); }
        catch (error) {
          if (error instanceof NoahAgentError && error.status === 409) return json({ error: error.message, confirmationRequired: true }, 409);
          throw error;
        }
      }
      if (action === 'connect') {
        if (!noahCloudId(input.id)) throw new NoahAgentError('操作IDを確認してください。');
        return json({ ...await call({ action, id: input.id }), ownerScope: scope }, 202);
      }
      if (action === 'disconnect') return json({ ...await call({ action }), ownerScope: scope });
      if (!noahCloudId(input.jobId)) throw new NoahAgentError('依頼IDを確認してください。');
      let work = await jobs.get(owner, input.jobId);
      if (action === 'start') {
        if (typeof input.prompt !== 'string' || !input.prompt.trim() || new TextEncoder().encode(input.prompt).length > NOAH_CLOUD_LIMITS.promptBytes || !noahCloudId(input.connectionId)) throw new NoahAgentError('依頼と接続を確認してください。');
        const hash = await noahCloudDigest(JSON.stringify([project, profile, NOAH_CLOUD_PROFILES[profile].sha256, input.connectionId, input.prompt]));
        if (work && (work.noahRemote?.cloud?.projectId !== project || work.noahRemote?.inputSha256 !== hash)) throw new NoahAgentError('同じ依頼IDの内容は変更できません。', 409);
        if (work && !active(work)) return json({ job: view(work), ownerScope: scope });
        if (!work) {
          const created = createNoahRemoteWork(input.jobId, { connectionId: input.connectionId, familyKey: project, digest: NOAH_CLOUD_PROFILES[profile].sha256, agentName: entry!.card.name, host: 'Noahクラウド', tool: 'cloud-agent', toolSha256: NOAH_CLOUD_PROFILES[profile].sha256, toolsSha256: NOAH_CLOUD_PROFILES[profile].sha256, args: { prompt: input.prompt }, inputSha256: hash }, now());
          created.noahRemote = { ...created.noahRemote!, prompt: input.prompt, cloud: { projectId: project, profile, version: NOAH_CLOUD_PROFILES[profile].version } };
          work = await jobs.create(owner, created);
          if (!work) throw new NoahAgentError('依頼IDが使用されています。', 409);
        }
        if (now() - Date.parse(work.createdAt) > NOAH_CLOUD_LIMITS.seconds * 1000) {
          // Read an already-admitted result before classifying an old lost response.
          // This path must never send another start, even if the runtime lost its record.
          try {
            const remote = await call({ action: 'job', jobId: work.id });
            return json({ job: view(await receive(deps.db, owner, work, remote as unknown as NoahCloudJob, now)), ownerScope: scope });
          } catch (error) { if (!(error instanceof NoahAgentError) || error.status !== 404) throw error; }
          const unknown = finishNoahRemoteWork(work, { state: 'unknown', error: '受付の期限を過ぎました。二重実行を避けるため自動再送していません。' }, now());
          await jobs.update(owner, unknown, work.revision); return json({ job: view(unknown), ownerScope: scope });
        }
        const receipt = deps.receiptKey ? await noahCloudReceipt(deps.receiptKey, { owner, project, jobId: work.id, inputHash: hash }) : undefined;
        let remote;
        try { remote = await call({ action, jobId: work.id, connectionId: input.connectionId, prompt: input.prompt, receipt }); }
        catch (error) {
          // A definitive admission rejection did not start a guest. Transport failures remain uncertain.
          if (error instanceof NoahAgentError && [400, 403, 409, 429].includes(error.status)) {
            const failed = finishNoahRemoteWork(work, { state: 'failed', error: error.message }, now());
            await jobs.update(owner, failed, work.revision);
          }
          throw error;
        }
        return json({ job: view(await receive(deps.db, owner, work, remote as unknown as NoahCloudJob, now)), ownerScope: scope }, 202);
      }
      if (!work || work.noahRemote?.cloud?.projectId !== project) throw new NoahAgentError('依頼が見つかりません。', 404);
      if (!active(work)) return json({ job: view(work), ownerScope: scope });
      let remote;
      try { remote = await call({ action, jobId: work.id }); }
      catch (error) {
        if (error instanceof NoahAgentError && error.status === 404 && now() - Date.parse(work.createdAt) > NOAH_CLOUD_LIMITS.seconds * 1000) {
          const unknown = finishNoahRemoteWork(work, { state: 'unknown', error: '実行結果を確認できません。自動で再実行していません。' }, now());
          await jobs.update(owner, unknown, work.revision); return json({ job: view(unknown), ownerScope: scope });
        }
        throw error;
      }
      return json({ job: view(await receive(deps.db, owner, work, remote as unknown as NoahCloudJob, now)), ownerScope: scope });
    } catch (error) {
      if (error instanceof NoahAgentError) return json({ error: error.message }, error.status);
      if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Noahを読み直して利用を開始してください。' }, 401);
      if (error instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
      return json({ error: 'クラウドに接続できません。時間をおいて再試行してください。' }, 503);
    }
  };
}
