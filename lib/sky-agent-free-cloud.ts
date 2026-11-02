import { bindSkyAgentLlmInput } from './sky-agent-library-store.ts';
import { SkyAgentLibraryError } from './sky-agent-library.ts';
/** An owner-owned role is model input. It grants no tools, execution rights or billing authority. */
export async function bindSkyAgentFreeCloud(db: Pick<D1Database, 'prepare'>, owner: string, value: Record<string, unknown>) {
  const bound = await bindSkyAgentLlmInput(db, owner, value);
  if (bound === value) return { prompt: value.prompt as string, agentBinding: undefined };
  if (bound.provider !== 'pollinations' || typeof value.prompt !== 'string' || typeof bound.system !== 'string')
    throw new SkyAgentLibraryError('保存した無料Cloudモデルと依頼が一致しません。', 409);
  const prompt = `${bound.system}\n\n以下は利用者の依頼です。\n${value.prompt}`;
  if (prompt.length > 12000) throw new SkyAgentLibraryError('担当の役割と依頼を合わせて12,000文字以内にしてください。', 413);
  return { prompt, agentBinding: { id: bound.agentId as string, revision: bound.agentRevision as number } };
}
