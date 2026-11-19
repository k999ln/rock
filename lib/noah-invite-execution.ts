import { NoahAgentError, noahUploadId, parseNoahAgentManifest } from './noah-agent-upload.ts';
import { NOAH_INVITE_VALID, noahInviteAgentId } from './noah-invite-contract.mjs';
import { parseTerminalRuntime } from './noah-terminal-contract.mjs';

export async function resolveNoahInviteExecution(db: Pick<D1Database, 'prepare'>, recipient: string, inviteId: string, clock = Date.now) {
  const id = noahUploadId(inviteId);
  const r = await db.prepare(`SELECT i.*,a.manifest,a.source_name,a.source_bytes FROM noah_agent_invites i JOIN noah_agent_uploads a ON a.id=i.upload_id
    WHERE i.id=? AND ${NOAH_INVITE_VALID} AND i.execution_allowed=1 AND i.access_scope='source' AND a.source_key IS NOT NULL
    AND (i.owner_id=? OR ((i.recipient_id IS NULL OR i.recipient_id=?) AND EXISTS(SELECT 1 FROM noah_agent_invite_claims c WHERE c.invite_id=i.id AND c.recipient_id=?)))`)
    .bind(id, clock(), recipient, recipient, recipient).first<{ id: string; owner_id: string; upload_id: string; manifest: string; manifest_sha256: string; source_sha256: string; source_name: string; source_bytes: number; revision: number; expires_at: number }>();
  if (!r) throw new NoahAgentError('招待の実行許可を確認できません。受取先・期限・撤回を確認してください。', 403);
  const manifest = parseNoahAgentManifest(JSON.parse(r.manifest));
  let runtime: ReturnType<typeof parseTerminalRuntime>;
  try { runtime = parseTerminalRuntime(manifest.runtime); } catch { throw new NoahAgentError('招待の実行定義を確認できません。', 422); }
  const invite = { inviteId: id, uploadId: r.upload_id, manifestSha256: r.manifest_sha256, sourceSha256: r.source_sha256, runtime, revision: r.revision, expiresAt: r.expires_at };
  return { id: noahInviteAgentId(id)!, author: r.owner_id, manifest, manifestSha256: r.manifest_sha256,
    source: { name: r.source_name, bytes: r.source_bytes, sha256: r.source_sha256 }, invite, uploadState: 'ready' as const };
}
