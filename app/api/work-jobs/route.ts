import { resolveEveAgentResults } from '@/lib/eve-agent-repair';
import { inspectEveAgentResult } from '@/lib/eve-agent-result-check';
import type { AgentArtifactFence } from '@/lib/work-store';
import { env } from 'cloudflare:workers';
import { eveAgentWorkStore } from '@/lib/eve-agent-work';
import { eveHistoryKeys } from '@/lib/eve-history';
import { a2aDelegationStore } from '@/lib/a2a-delegation-store';
import { database, requestUser } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import {
  createWorkJob,
  applyWorkCommand,
  objectInput,
  parseWorkCommand,
  workId,
  type WorkCommand,
  WorkError,
} from '@/lib/workflow';

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
function failure(error: unknown) {
  if (error instanceof WorkError)
    return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインすると仕事を保存できます。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'このサイトから操作してください。' }, 403);
  if (error instanceof SyntaxError)
    return json({ error: '入力の形式を確認してください。' }, 400);
  return json(
    { error: '仕事を保存できませんでした。再試行してください。' },
    503,
  );
}
function rejected(request: Request, error: unknown) {
  // Release an unread body after an early auth/Origin rejection. Do not buffer
  // untrusted input or wait for it before replying, and never cancel a reader
  // already owned by the bounded parser.
  if (request.body && !request.bodyUsed && !request.body.locked)
    void request.body.cancel().catch(() => {});
  return failure(error);
}
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new WorkError('入力がありません。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 12000) {
      await reader.cancel();
      throw new WorkError('入力は12 KB以下にしてください。', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
export async function GET(request: Request) {
  try {
    const user = await requestUser(request);
    return json({ jobs: await workStore(database()).list(user) });
  } catch (error) {
    return rejected(request, error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requestUser(request);
    const db = database();
    if (!(await rockstarServiceScopeAllowed(
      db,
      user,
      'zema',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
      env, request,
    ))) return missingRockstarServiceScope('Eve');
    const candidate = createWorkJob(await body(request));
    const saved = await workStore(db).create(user, candidate);
    if (
      !saved ||
      saved.title !== candidate.title ||
      saved.templateId !== candidate.templateId
    )
      throw new WorkError('仕事IDが使用されています。', 409);
    return json({ job: saved }, 201);
  } catch (error) {
    return rejected(request, error);
  }
}
export async function PATCH(request: Request) {
  try {
    const user = await requestUser(request),
      input = objectInput(await body(request), [
        'jobId',
        'revision',
        'command',
      ]);
    const store = workStore(database()),
      current = await store.get(user, workId(input.jobId));
    if (!current) throw new WorkError('仕事が見つかりません。', 404);
    if (current.templateId === 'sky-linux-service')
      throw new WorkError('専用Linuxの仕事はSmithの実行・停止・成果確認から操作してください。', 409);
    const command = parseWorkCommand(input.command);
    if ((current.eveAgent?.repairs ?? []).some(r => r.commandId === command.id)) throw new WorkError('同じ操作IDを修正案と別の操作へ使えません。',409);
    if (current.eveTool && command.action !== 'cancel')
      throw new WorkError('Eveの仕事はEveの実行・成果確認から操作してください。', 409);
    if (current.skyApp && command.action !== 'cancel')
      throw new WorkError('Smith連携の仕事は専用の本人確認・実行経路を使ってください。', 409);
    if (current.eveAgent && command.action === 'cancel') {
      let keys;
      try { keys = eveHistoryKeys((env as unknown as { EVE_HISTORY_KEYRING?: string }).EVE_HISTORY_KEYRING); }
      catch { /* History availability must not prevent owner-authorized stopping. */ }
      return json(await eveAgentWorkStore(database(), user, keys, (env as unknown as { A2A_INPUT_ENCRYPTION_KEY?: string }).A2A_INPUT_ENCRYPTION_KEY, (env as unknown as { SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS?: string }).SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS).command({ jobId: current.id, revision: input.revision, commandId: command.id, action: 'stop' }));
    }
    if (current.eveAgent?.stopRequestedAt !== undefined) throw new WorkError('停止要求済みです。外部Agentの状態を照合してください。', 409);
    const artifactFence: AgentArtifactFence[] = [];
    const artifactKey = (env as unknown as { A2A_INPUT_ENCRYPTION_KEY?: string }).A2A_INPUT_ENCRYPTION_KEY;
    if (current.eveAgent && command.action === 'complete') {
      const children = await a2aDelegationStore(database()).listForParent(user, current.id);
      const receipts = await Promise.all(children.map(child => a2aDelegationStore(database()).getUsageReceipt(user, child.id)));
      if (children.length === 0 || children.some((child, index) => child.state !== 'remote_completed' || child.artifactsCaptured !== 1 || !receipts[index])) throw new WorkError('各Agentの完了・保存成果・利用receiptを照合してから完了してください。', 409);
      const results = await resolveEveAgentResults(database(), user, current, artifactKey);
      if (results.length !== children.length) throw new WorkError('Agentの状態が変わっています。再読込してください。',409);
      for (const { child, inspection, supersededBy } of results) {
        if (inspection.status !== 'passed' && !supersededBy) throw new WorkError('保存成果の独立検査が未達です。欠落・文字数・必須文言と鍵を確認してください。', 409);
        artifactFence.push({ delegationId: child.id, artifacts: inspection.artifacts });
      }
    }
    if (current.templateId === 'cloud-agent') {
      const reviewCommands = [
        ...current.events.map(({ command: event }) => event),
        command,
      ].filter((event): event is Extract<WorkCommand, { action: 'record' }> => event.action === 'record');
      const delegations = a2aDelegationStore(database());
      for (const event of reviewCommands) {
        if (!event.delegationId)
          throw new WorkError('親jobのAgent手順に委任IDがありません。再読込して状態を確認してください。', 409);
        const delegation = await delegations.get(user, event.delegationId);
        if (!delegation || delegation.parentJobId !== current.id)
          throw new WorkError('記録するAgent委任がこの親jobに属していません。', 409);
        if (event.stepId === 'agent-brief') {
          if (!delegation.priceQuote || !/^[a-f0-9]{64}$/i.test(delegation.priceQuoteDigest))
            throw new WorkError('Agentの署名付き見積が保存されていないため、計画手順を通過できません。', 409);
        } else if (event.stepId === 'agent-result') {
          const [artifacts, receipt] = await Promise.all([
            delegations.listArtifacts(user, delegation.id),
            delegations.getUsageReceipt(user, delegation.id),
          ]);
          if (delegation.state !== 'remote_completed' || delegation.artifactsCaptured !== 1 ||
            artifacts.length === 0 || !receipt || receipt.parentJobId !== current.id)
            throw new WorkError('Agentの完了状態・保存成果・利用receiptを確認できないため、計画を進められません。', 409);
          if (current.eveAgent) {
            const inspection = await inspectEveAgentResult(database(), user, current.id, delegation.id, current.eveAgent.acceptance, artifactKey);
            if (inspection.status !== 'passed') throw new WorkError('保存成果の独立検査が未達です。欠落・文字数・必須文言と鍵を確認してください。', 409);
            if (!artifactFence.some(f => f.delegationId === delegation.id)) artifactFence.push({ delegationId: delegation.id, artifacts: inspection.artifacts });
          }
        } else {
          throw new WorkError('Cloud Agent計画の手順が不正です。', 409);
        }
      }
    }
    const next = applyWorkCommand(current, command, input.revision);
    if (next !== current && !(await store.update(user, next, current.revision, artifactFence.length ? artifactFence : undefined)))
      throw new WorkError(
        '別の操作で更新されています。一覧を再読込してください。',
        409,
      );
    return json({ job: next });
  } catch (error) {
    return rejected(request, error);
  }
}
