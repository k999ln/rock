import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import { objectInput, workId, WorkError } from '@/lib/workflow';
import { createSkyAppJob, executeSkyAppJob, confirmSkyAppJob, stopSkyAppJob } from '@/lib/sky-app-foundation';
import { parseSkyAppRequest } from '@/lib/sky-app-contract';
import { parseSkyPrivateAgentBinding, skyPrivateAgentMatchesRequest } from '@/lib/sky-private-agent';
import { skyPrivateAgentStore } from '@/lib/sky-private-agent-store';
import { skyPrivateOwner } from '@/lib/sky-private-owner.server';
import { rejectChangedOwner } from '@/lib/owner-intent';
import { rockstarServiceScopeAllowed, missingRockstarServiceScope } from '@/lib/rockstar-service-access';

function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } }); }
const manualBrowserFit = { surface: 'browser.preview', inputSource: 'manual.text', returnSlot: 'embedded.private' } as const;
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new WorkError('入力がありません。');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 40000) { await reader.cancel(); throw new WorkError('入力は40KBまでです。', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
function failure(request: Request, cause: unknown) {
  if (request.body && !request.bodyUsed && !request.body.locked) void request.body.cancel().catch(() => {});
  if (cause instanceof WorkError) return json({ error: cause.message }, cause.status);
  if (cause instanceof Error && cause.message === 'UNAUTHORIZED') return json({ error: '本人のサインインが必要です。' }, 401);
  if (cause instanceof Error && cause.message === 'ORIGIN') return json({ error: '同じサイトから操作してください。' }, 403);
  // Do not echo input or adapter exceptions containing private text.
  return json({ error: 'Sky連携の入力または状態を確認してください。' }, 400);
}
export async function GET(request: Request) {
  try {
    const user = await skyPrivateOwner(request), url = new URL(request.url);
    const mismatch = await rejectChangedOwner(request, user);
    if (mismatch) return mismatch;
    if (!url.search) {
      const jobs = await workStore(database()).listSkyApps(user);
      return json({ jobs: jobs.filter((job) => job.skyApp)
        .map((job) => ({ id: job.id, title: job.title, revision: job.revision,
          status: job.status, updatedAt: job.updatedAt })) });
    }
    if ([...url.searchParams.keys()].some((key) => key !== 'jobId') || url.searchParams.getAll('jobId').length !== 1) throw new WorkError('仕事IDを指定してください。');
    const job = await workStore(database()).get(user, workId(url.searchParams.get('jobId')));
    if (!job?.skyApp) throw new WorkError('仕事が見つかりません。', 404);
    const addDecision = job.skyApp.privateAgent
      ? (await skyPrivateAgentStore(database()).validateAdd(user, job.skyApp.privateAgent.id, job.skyApp.privateAgent.fit)).decision
      : null;
    return json({ job, addDecision });
  } catch (cause) { return failure(request, cause); }
}
export async function POST(request: Request) {
  try {
    const user = await skyPrivateOwner(request), db = database();
    const mismatch = await rejectChangedOwner(request, user);
    if (mismatch) return mismatch;
    const input = objectInput(await body(request), ['action', 'jobId', 'request', 'revision', 'commandId', 'saveMaterial', 'addId']);
    const store = workStore(db), id = workId(input.jobId);
    if (input.action !== 'stop' && !(await rockstarServiceScopeAllowed(db, user, 'zema',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED, env, request))) return missingRockstarServiceScope('Zema');
    if (input.action === 'create') {
      objectInput(input, ['action', 'jobId', 'request', 'saveMaterial', 'addId']);
      if (input.saveMaterial !== true) throw new WorkError('本人用の素材・成果保存に同意してください。');
      const appRequest = parseSkyAppRequest(input.request);
      const candidate = createSkyAppJob(appRequest, id);
      if (input.addId !== undefined) {
        const addId = workId(input.addId);
        const { agent, add, decision } = await skyPrivateAgentStore(db).validateAdd(user, addId, manualBrowserFit);
        if (decision !== 'candidate-only' || !agent || !add ||
          !skyPrivateAgentMatchesRequest(agent.spec, appRequest))
          throw new WorkError('Agentの設定と追加条件が変わりました。再読込してください。', 409);
        candidate.skyApp = { ...candidate.skyApp!, privateAgent: parseSkyPrivateAgentBinding({
          id: add.id, agentId: agent.id, agentRevision: agent.revision, agentDigest: agent.digest, fit: add.fit,
        }) };
      } else if (appRequest.appId !== 'planner') throw new WorkError('メモAgentの追加記録が必要です。', 409);
      const saved = await store.create(user, candidate);
      if (!saved?.skyApp || JSON.stringify(saved.skyApp.request) !== JSON.stringify(candidate.skyApp!.request)) throw new WorkError('仕事IDが使用されています。', 409);
      if (JSON.stringify(saved.skyApp.privateAgent) !== JSON.stringify(candidate.skyApp!.privateAgent)) throw new WorkError('仕事IDが使用されています。', 409);
      return json({ job: saved }, 201);
    }
    objectInput(input, ['action', 'jobId', 'revision', 'commandId']);
    const current = await store.get(user, id);
    if (!current?.skyApp) throw new WorkError('仕事が見つかりません。', 404);
    const commandId = workId(input.commandId);
    if (!Number.isInteger(input.revision)) throw new WorkError('仕事の版を指定してください。');
    let next;
    if (input.action === 'run') {
      const duplicate = current.events.find((event) => event.command.id === commandId);
      if (duplicate) {
        if (duplicate.command.action !== 'record' || duplicate.command.stepId !== 'extract' || current.status === 'cancelled' || !current.skyApp.result) throw new WorkError('同じ操作IDの実行状態が異なります。', 409);
        return json({ job: current });
      }
      if (current.revision !== input.revision) throw new WorkError('仕事の版が変わりました。', 409);
      if (current.status !== 'active' || current.revision !== 0) throw new WorkError('実行できる仕事の状態ではありません。', 409);
      const binding = current.skyApp.privateAgent;
      if (binding) {
        const { agent, decision } = await skyPrivateAgentStore(db).validateAdd(user, binding.id, binding.fit);
        if (decision !== 'candidate-only' || !agent || agent.id !== binding.agentId || agent.revision !== binding.agentRevision
          || agent.digest !== binding.agentDigest || !skyPrivateAgentMatchesRequest(agent.spec, current.skyApp.request))
          throw new WorkError('Agentの追加条件が変わりました。再読込してください。', 409);
      } else if (current.skyApp.request.appId !== 'planner') throw new WorkError('仕事とAgentの追加記録がありません。', 409);
      next = await executeSkyAppJob(current, { signal: request.signal, commandId });
    } else if (input.action === 'confirm') next = confirmSkyAppJob(current, commandId, input.revision as number);
    else if (input.action === 'stop') next = stopSkyAppJob(current, commandId, input.revision as number);
    else throw new WorkError('操作を確認してください。');
    // A concurrent stop/revision wins over late computation; no result is returned on CAS failure.
    if (next !== current && !(input.action === 'run' && current.skyApp.privateAgent
      ? await store.updateSkyAppBound(user, next, current.revision, current.skyApp.privateAgent!)
      : await store.update(user, next, current.revision))) throw new WorkError('仕事またはAgentの追加条件が更新されました。再読込してください。', 409);
    return json({ job: next });
  } catch (cause) { return failure(request, cause); }
}
