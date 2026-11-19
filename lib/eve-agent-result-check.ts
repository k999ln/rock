import { a2aDelegationStore } from './a2a-delegation-store.ts';
import { decryptA2AArtifact } from './a2a-input-crypto.ts';
import { objectInput, WorkError } from './workflow.ts';

export type EveAgentCriteria = { schema: 'eve.agent-criteria/1'; minChars: number; maxChars: number; requiredText: string[] };
export type EveAgentResultInspection = {
  delegationId: string; status: 'passed' | 'failed' | 'unavailable' | 'pending';
  artifacts: Array<{ id: string; sha256: string; taskId: string }>;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
};
export function parseEveAgentCriteria(raw?: unknown): EveAgentCriteria {
  if (raw === undefined) return { schema: 'eve.agent-criteria/1', minChars: 1, maxChars: 24000, requiredText: [] };
  const v = objectInput(raw, ['schema', 'minChars', 'maxChars', 'requiredText']);
  if (v.schema !== 'eve.agent-criteria/1' || !Number.isSafeInteger(v.minChars) || !Number.isSafeInteger(v.maxChars) ||
      Number(v.minChars) < 1 || Number(v.maxChars) > 24000 || Number(v.maxChars) < Number(v.minChars) ||
      !Array.isArray(v.requiredText) || v.requiredText.length > 20 || v.requiredText.some(t => typeof t !== 'string' || !t.trim() || t.length > 200))
    throw new WorkError('成果の文字数・必須文言を確認してください。');
  return { schema: 'eve.agent-criteria/1', minChars: Number(v.minChars), maxChars: Number(v.maxChars), requiredText: [...v.requiredText] as string[] };
}
function textDocument(raw: unknown): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('document');
  const d = raw as Record<string, unknown>;
  if (d.schemaVersion !== 1 || d.truncated !== false || d.omittedNonTextParts !== 0 || !Array.isArray(d.artifacts) || d.artifacts.length < 1 || d.artifacts.length > 16) throw new Error('incomplete');
  let parts = 0;
  return d.artifacts.map(a => {
    if (!a || typeof a !== 'object' || !Array.isArray(a.textParts) || a.textParts.some((t: unknown) => typeof t !== 'string') || (parts += a.textParts.length) > 128) throw new Error('parts');
    return (a.textParts as string[]).join('\n');
  }).join('\n');
}
/** Deterministic text constraints only. Does not evaluate truth, grant authority,
 * fetch URLs, execute artifacts, or accept an Agent's own quality claim. */
export async function inspectEveAgentResult(db: Pick<D1Database, 'prepare' | 'batch'>, owner: string, parentId: string, delegationId: string, rawCriteria?: unknown, key?: string): Promise<EveAgentResultInspection> {
  const store = a2aDelegationStore(db);
  const child = await store.get(owner, delegationId);
  if (!child || child.parentJobId !== parentId) throw new WorkError('この仕事のAgent成果が見つかりません。', 404);
  const result: EveAgentResultInspection = { delegationId, status: 'pending', artifacts: [], checks: [] };
  let criteria: EveAgentCriteria;
  try { criteria = parseEveAgentCriteria(rawCriteria); }
  catch { return { ...result, status: 'failed', checks: [{ name: '固定した成果条件', passed: false, detail: '保存条件を読み取れません。停止と復旧を確認してください。' }] }; }
  if (child.state !== 'remote_completed' || child.artifactsCaptured !== 1 || !child.remoteTaskId) return result;
  const records = await store.listArtifacts(owner, child.id);
  const count = await db.prepare('SELECT COUNT(*) AS n FROM agent_delegation_artifacts WHERE owner_user_id = ? AND delegation_id = ?').bind(owner, child.id).first<{ n: number }>();
  if (!count || count.n !== records.length) return { ...result, status: 'failed', checks: [{ name: '保存本文の完全性', passed: false, detail: '全保存成果を読み取れません。上限・保存状態を確認してください。' }] };
  result.artifacts = records.map(a => ({ id: a.id, sha256: a.artifactSha256, taskId: a.remoteTaskId }));
  if (!key) return { ...result, status: 'unavailable', checks: [{ name: '成果の復号', passed: false, detail: '鍵の復旧後に再検査してください。停止は可能です。' }] };
  let text = '';
  try {
    if (!records.length) throw new Error('empty');
    const texts = [];
    for (const a of records) {
      if (a.remoteTaskId !== child.remoteTaskId) throw new Error('task');
      const serialized = await decryptA2AArtifact({ ...a, keyVersion: a.keyVersion as 'aes-256-gcm-v1' }, key, owner, child.id, child.remoteTaskId);
      texts.push(textDocument(JSON.parse(serialized)));
    }
    text = texts.join('\n');
    result.checks.push({ name: '保存本文の完全性', passed: true, detail: '所有者・task・復号・hash・本文schemaを照合。省略や切詰めのないテキストだけを検査。' });
  } catch {
    return { ...result, status: 'failed', checks: [{ name: '保存本文の完全性', passed: false, detail: '本文の復号・hash・schema・taskを確認できないか、欠落・省略があります。再実行せず保存成果を確認してください。' }] };
  }
  const chars = Array.from(text).length;
  result.checks.push({ name: '文字数', passed: text.trim().length > 0 && chars >= criteria.minChars && chars <= criteria.maxChars, detail: `${chars}文字 / ${criteria.minChars}〜${criteria.maxChars}文字` },
    ...criteria.requiredText.map(phrase => ({ name: '必須文言', passed: text.includes(phrase), detail: phrase })));
  result.status = result.checks.every(c => c.passed) ? 'passed' : 'failed';
  return result;
}
