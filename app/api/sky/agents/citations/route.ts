import { env } from 'cloudflare:workers';
import { readBoundedStream } from '@/lib/bounded-stream';
import { database } from '@/lib/fund-store';
import { rejectChangedOwner } from '@/lib/owner-intent';
import { authorizeRemoteAiRequest, RemoteAiGuardError } from '@/lib/remote-ai-guard';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { workStore } from '@/lib/work-store';
import { WorkError, workId } from '@/lib/workflow';
import {
  citationInputSha256, completedCitationAgentJob, parseCitationAgentInput,
} from '@/lib/sky-citation-agent';

const json = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { 'Cache-Control': 'no-store' },
});

export async function POST(request: Request) {
  try {
    const db = database();
    const owner = await authorizeRemoteAiRequest(request, 'sky-citation-agent', db);
    const changed = await rejectChangedOwner(request, owner);
    if (changed) return changed;
    if (!(await rockstarServiceScopeAllowed(
      db, owner, 'agents',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
      env, request,
    ))) return missingRockstarServiceScope('Agent');

    const reader = request.body?.getReader();
    if (!reader) throw new WorkError('入力がありません。');
    const bytes = await readBoundedStream(reader, 85_000, () => new WorkError('入力は85 KB以下にしてください。', 413));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorkError('入力を確認してください。');
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some((key) => !['id', 'input', 'saveResult'].includes(key)) || body.saveResult !== true)
      throw new WorkError('保存内容を確認してから実行してください。');
    const id = workId(body.id);
    const input = parseCitationAgentInput(body.input);
    const inputSha256 = await citationInputSha256(input);
    const store = workStore(db);
    const previous = await store.get(owner, id);
    if (previous) {
      if (previous.standaloneAgent?.inputSha256 !== inputSha256)
        throw new WorkError('同じ仕事IDで異なる依頼を保存できません。', 409);
      return json({ jobId: previous.id, output: previous.standaloneAgent, replayed: true });
    }
    const completed = completedCitationAgentJob(id, input, inputSha256);
    const saved = await store.create(owner, completed);
    if (!saved || saved.standaloneAgent?.inputSha256 !== inputSha256)
      throw new WorkError('仕事IDが使用されています。', 409);
    return json({ jobId: saved.id, output: saved.standaloneAgent, replayed: false }, 201);
  } catch (error) {
    if (error instanceof RemoteAiGuardError) return json({ code: error.code }, error.status);
    if (error instanceof WorkError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: '入力の形式を確認してください。' }, 400);
    return json({ error: 'Agentの実行または成果保存を確認できません。再試行してください。' }, 503);
  }
}
