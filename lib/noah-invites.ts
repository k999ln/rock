import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError, noahSha256, noahUploadId, type NoahAgentManifest } from './noah-agent-upload.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor } from './owner-intent.ts';
import { NOAH_INVITE_VALID } from './noah-invite-contract.mjs';
import { parseTerminalRuntime } from './noah-terminal-contract.mjs';

type InviteRow = { id: string; owner_id: string; upload_id: string; manifest_sha256: string; source_sha256: string | null; token_sha256: string; execution_allowed: number;
  input_sha256: string; recipient_id: string | null; access_scope: 'view' | 'source'; expires_at: number; max_uses: number; revision: number; revoked_at: number | null; created_at: number; used_count?: number };
type GrantRow = InviteRow & { manifest: string; source_key: string | null; source_name: string | null; source_bytes: number | null };
export type NoahInvite = { id: string; agentId: string; recipient: string | null; access: 'view' | 'source'; executionAllowed: boolean; expiresAt: number; maxUses: number; usedCount: number; revision: number; revokedAt: number | null; createdAt: number };
export type NoahSharedAgent = { inviteId: string; uploadId: string; revision: number; executionAllowed: boolean; manifest: NoahAgentManifest; manifestSha256: string; source: { name: string; bytes: number; sha256: string } | null; access: 'view' | 'source'; expiresAt: number };
const present = (r: InviteRow): NoahInvite => ({ id: r.id, agentId: r.upload_id, recipient: r.recipient_id, access: r.access_scope, executionAllowed: r.execution_allowed === 1, expiresAt: r.expires_at, maxUses: r.max_uses, usedCount: r.used_count ?? 0, revision: r.revision, revokedAt: r.revoked_at, createdAt: r.created_at });
const shared = (r: GrantRow): NoahSharedAgent => ({ inviteId: r.id, uploadId: r.upload_id, revision: r.revision, executionAllowed: r.execution_allowed === 1, manifest: JSON.parse(r.manifest), manifestSha256: r.manifest_sha256,
  access: r.access_scope, expiresAt: r.expires_at, source: r.access_scope === 'source' && r.source_sha256 ? { name: r.source_name!, bytes: r.source_bytes!, sha256: r.source_sha256 } : null });
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
const MAX_LIFETIME = 30 * 86400000;
function token(value: unknown) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new NoahAgentError('招待リンクを確認してください。'); return value; }
async function input(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new NoahAgentError('JSONで操作してください。', 415);
  let v: unknown;
  try { v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, 4096))); }
  catch (e) { if (e instanceof NoahAgentError) throw e; throw new NoahAgentError('入力形式を確認してください。'); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new NoahAgentError('入力形式を確認してください。');
  return v as Record<string, unknown>;
}
export function createNoahInviteApi(deps: { db: Pick<D1Database, 'prepare'>; authenticate: (r: Request) => Promise<string>; bucket?: Pick<R2Bucket, 'get'>; clock?: () => number }) {
  const now = deps.clock || Date.now;
  const count = '(SELECT COUNT(*) FROM noah_agent_invite_claims c WHERE c.invite_id=i.id)';
  const valid = NOAH_INVITE_VALID;
  const ownerRow = (owner: string, id: string) => deps.db.prepare(`SELECT i.*,${count} AS used_count FROM noah_agent_invites i WHERE i.id=? AND i.owner_id=?`).bind(id, owner).first<InviteRow>();
  const grant = (owner: string, id: string) => deps.db.prepare(`SELECT i.*,a.manifest,a.source_key,a.source_name,a.source_bytes FROM noah_agent_invites i JOIN noah_agent_uploads a ON a.id=i.upload_id
    WHERE i.id=? AND ${valid} AND (i.owner_id=? OR ((i.recipient_id IS NULL OR i.recipient_id=?) AND EXISTS(SELECT 1 FROM noah_agent_invite_claims c WHERE c.invite_id=i.id AND c.recipient_id=?)))`).bind(id, now(), owner, owner, owner).first<GrantRow>();
  async function handle(request: Request, mutate: boolean, fn: (owner: string) => Promise<Response>) {
    try {
      const owner = await deps.authenticate(request);
      if (mutate && request.headers.get('origin') !== new URL(request.url).origin) throw new NoahAgentError('同じNoahから操作してください。', 403);
      if (mutate && request.headers.get(OWNER_SCOPE_HEADER) !== await ownerScopeFor(owner)) throw new NoahAgentError('アカウントが変わりました。再読込してください。', 409);
      return await fn(owner);
    } catch (e) {
      if (e instanceof NoahAgentError) return json({ error: e.message }, e.status);
      if (e instanceof Error && e.message === 'UNAUTHORIZED') return json({ error: 'サインインして招待を確認してください。' }, 401);
      return json({ error: '招待を確認できません。再試行してください。' }, 503);
    }
  }
  return {
    list: (request: Request) => handle(request, false, async owner => {
      const params = new URL(request.url).searchParams;
      if (params.get('received') === '1') {
        const result = await deps.db.prepare(`SELECT i.*,a.manifest,a.source_key,a.source_name,a.source_bytes FROM noah_agent_invites i JOIN noah_agent_uploads a ON a.id=i.upload_id
          WHERE ${valid} AND (i.recipient_id IS NULL OR i.recipient_id=?) AND EXISTS(SELECT 1 FROM noah_agent_invite_claims c WHERE c.invite_id=i.id AND c.recipient_id=?) ORDER BY i.created_at DESC,i.id DESC LIMIT 100`).bind(now(),owner,owner).all<GrantRow>();
        return json({ shared: result.results.map(shared), ownerScope: await ownerScopeFor(owner) });
      }
      const agentId = params.get('agentId'); if (agentId) noahUploadId(agentId);
      const result = await deps.db.prepare(`SELECT i.*,${count} AS used_count FROM noah_agent_invites i WHERE i.owner_id=? AND (? IS NULL OR i.upload_id=?) ORDER BY i.created_at DESC,i.id DESC LIMIT 100`).bind(owner,agentId,agentId).all<InviteRow>();
      return json({ invites: result.results.map(present), ownerScope: await ownerScopeFor(owner) });
    }),
    create: (request: Request) => handle(request, true, async owner => {
      const v = await input(request);
      if (Object.keys(v).some(k => !['id','agentId','token','recipient','access','expiresAt','maxUses','executionAllowed'].includes(k)) || (v.executionAllowed !== undefined && typeof v.executionAllowed !== 'boolean') || (v.executionAllowed === true && v.access !== 'source') || !['view','source'].includes(String(v.access)) || !Number.isSafeInteger(v.maxUses) || Number(v.maxUses)<1 || Number(v.maxUses)>100 || !Number.isSafeInteger(v.expiresAt) || (v.recipient !== null && (typeof v.recipient !== 'string' || !/^[\w:@.-]{1,200}$/.test(v.recipient)))) throw new NoahAgentError('宛先・権限・期限・人数を確認してください。');
      const id = noahUploadId(v.id), agentId = noahUploadId(v.agentId), tokenHash = await noahSha256(new TextEncoder().encode(token(v.token)));
      const fingerprint = await noahSha256(new TextEncoder().encode(JSON.stringify([agentId, tokenHash, v.recipient, v.access, v.expiresAt, v.maxUses, ...(v.executionAllowed === true ? ['terminal-execution/1'] : [])])));
      const existing = await ownerRow(owner,id);
      if (existing) {
        if (existing.input_sha256 !== fingerprint) throw new NoahAgentError('招待IDが使用済みです。新しい招待を作ってください。',409);
        return json({ invite: present(existing), ownerScope: await ownerScopeFor(owner) });
      }
      if (Number(v.expiresAt)<=now() || Number(v.expiresAt)>now()+MAX_LIFETIME) throw new NoahAgentError('招待の期限は今から30日以内です。');
      let checkedManifest: string | null = null;
      if (v.executionAllowed === true) {
        const upload = await deps.db.prepare('SELECT manifest FROM noah_agent_uploads WHERE id=? AND owner_id=? AND deleted_at IS NULL AND upload_state=\'ready\'').bind(agentId, owner).first<{manifest:string}>();
        try { if (!upload) throw new Error(); parseTerminalRuntime(JSON.parse(upload.manifest).runtime); checkedManifest = upload.manifest; }
        catch { throw new NoahAgentError('実行定義のある保存済みコードだけを実行共有できます。', 422); }
      }
      const result = await deps.db.prepare(`INSERT OR IGNORE INTO noah_agent_invites(id,owner_id,upload_id,manifest_sha256,source_sha256,token_sha256,input_sha256,recipient_id,access_scope,expires_at,max_uses,revision,created_at,execution_allowed)
        SELECT ?,?,a.id,a.manifest_sha256,a.source_sha256,?,?,?,?,?,?,1,?,? FROM noah_agent_uploads a
        WHERE a.id=? AND a.owner_id=? AND a.deleted_at IS NULL AND a.upload_state='ready' AND (?='view' OR a.source_key IS NOT NULL)
          AND (SELECT COUNT(*) FROM noah_agent_invites WHERE owner_id=?)<100 AND (? IS NULL OR a.manifest=?) RETURNING id`).bind(id,owner,tokenHash,fingerprint,v.recipient,v.access,v.expiresAt,v.maxUses,now(),v.executionAllowed === true ? 1 : 0,agentId,owner,v.access,owner,checkedManifest,checkedManifest).all();
      const saved = await ownerRow(owner,id);
      if (!saved || saved.input_sha256 !== fingerprint) throw new NoahAgentError('登録内容を確認できないか、招待の保存上限（100件）に達しました。',409);
      return json({ invite: present(saved), ownerScope: await ownerScopeFor(owner) }, result.results.length ? 201 : 200);
    }),
    revoke: (request: Request, id: string) => handle(request,true,async owner => {
      const v = await input(request); id = noahUploadId(id);
      if (Object.keys(v).some(k => k !== 'revision') || !Number.isSafeInteger(v.revision) || Number(v.revision)<1) throw new NoahAgentError('招待の版を確認してください。');
      const result = await deps.db.prepare('UPDATE noah_agent_invites SET revoked_at=?,revision=revision+1 WHERE id=? AND owner_id=? AND revision=? AND revoked_at IS NULL RETURNING id').bind(now(),id,owner,v.revision).all();
      const saved = await ownerRow(owner,id);
      if (!saved || (!result.results.length && !(saved.revoked_at !== null && saved.revision===Number(v.revision)+1))) throw new NoahAgentError('招待が変更されたか、見つかりません。',409);
      return json({ invite: present(saved) });
    }),
    claim: (request: Request, id: string) => handle(request,true,async owner => {
      id = noahUploadId(id); const v = await input(request);
      if (Object.keys(v).some(k => k !== 'token')) throw new NoahAgentError('招待リンクを確認してください。');
      const digest = await noahSha256(new TextEncoder().encode(token(v.token)));
      // A single write statement atomically checks capacity and adds a unique recipient.
      await deps.db.prepare(`INSERT OR IGNORE INTO noah_agent_invite_claims(invite_id,recipient_id,claimed_at)
        SELECT i.id,?,? FROM noah_agent_invites i JOIN noah_agent_uploads a ON a.id=i.upload_id
        WHERE i.id=? AND i.token_sha256=? AND ${valid} AND (i.recipient_id IS NULL OR i.recipient_id=?)
          AND ${count}<i.max_uses RETURNING invite_id`).bind(owner,now(),id,digest,now(),owner).all();
      const row = await deps.db.prepare(`SELECT i.*,a.manifest,a.source_key,a.source_name,a.source_bytes FROM noah_agent_invites i JOIN noah_agent_uploads a ON a.id=i.upload_id
        WHERE i.id=? AND i.token_sha256=? AND ${valid} AND (i.recipient_id IS NULL OR i.recipient_id=?)
          AND EXISTS(SELECT 1 FROM noah_agent_invite_claims c WHERE c.invite_id=i.id AND c.recipient_id=?)`).bind(id,digest,now(),owner,owner).first<GrantRow>();
      if (!row) throw new NoahAgentError('招待が無効・期限切れ・人数上限か、対象のアカウントではありません。',404);
      return json({ agent: shared(row), ownerScope: await ownerScopeFor(owner) });
    }),
    get: (request: Request, id: string) => handle(request,false,async owner => {
      const row = await grant(owner,noahUploadId(id));
      if (!row) throw new NoahAgentError('有効な招待を確認できません。期限・撤回・受取アカウントを確認してください。',404);
      return json({ agent: shared(row), ownerScope: await ownerScopeFor(owner) });
    }),
    download: (request: Request, id: string) => handle(request,false,async owner => {
      id = noahUploadId(id); const row = await grant(owner,id);
      if (!row || row.access_scope !== 'source' || !row.source_key) throw new NoahAgentError('この招待ではコードを取得できません。',404);
      const object = await deps.bucket?.get(row.source_key); if (!object) throw new NoahAgentError('ファイル保存先を確認できません。',503);
      // Recheck after slow object-store reads so a revocation during preparation wins.
      const after = await grant(owner,id);
      if (!after || after.access_scope !== 'source' || after.revision !== row.revision || after.source_key !== row.source_key || after.source_sha256 !== row.source_sha256) throw new NoahAgentError('招待の有効期限が切れたか、撤回されました。',404);
      return new Response(object.body, { headers: { 'Cache-Control':'no-store, private','Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="agent-source"; filename*=UTF-8''${encodeURIComponent(row.source_name!)}`,
        'Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Content-SHA256':row.source_sha256! } });
    }),
  };
}
