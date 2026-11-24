import { createNoahDraftStorage, draftInputBytesSql, draftObjectBytesSql, NOAH_DRAFT_STORAGE, type DraftBucket } from './noah-draft-storage.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
import { NOAH_CODE_LIMIT, NOAH_SOURCE_LIMIT, NoahAgentError, noahSha256, noahUploadId } from './noah-agent-upload.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor } from './owner-intent.ts';

export type NoahDraftContent = {
  manifest: Record<string, unknown>; codeMode: 'file' | 'paste'; codeName: string; code: string; rights: boolean;
  validation?: { enabled: boolean; testName: string; testCode: string };
};
export type DraftRow = { id: string; owner_id: string; content: string; revision: number; command_id: string; input_sha256: string;
  source_key: string | null; source_name: string | null; source_sha256: string | null; source_bytes: number | null;
  created_at: number; updated_at: number; deleted_at: number | null; registered_upload_id: string | null; registered_draft_revision: number | null; restored_from_revision: number | null; purged_at: number | null };
export type NoahDraft = { id: string; content: NoahDraftContent; revision: number; updatedAt: number;
  source: { name: string; bytes: number; sha256: string } | null };
const present = (r: DraftRow): NoahDraft => ({ id: r.id, content: JSON.parse(r.content), revision: r.revision, updatedAt: r.updated_at,
  source: r.source_key ? { name: r.source_name!, bytes: r.source_bytes!, sha256: r.source_sha256! } : null });
const output = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
function content(value: unknown): NoahDraftContent {
  const v = value as NoahDraftContent;
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !['manifest','codeMode','codeName','code','rights','validation'].includes(k)) ||
    !v.manifest || typeof v.manifest !== 'object' || Array.isArray(v.manifest) || !['file','paste'].includes(v.codeMode) ||
    typeof v.codeName !== 'string' || v.codeName.length > 120 || typeof v.code !== 'string' || typeof v.rights !== 'boolean') throw new NoahAgentError('下書きの形式を確認してください。');
  const keys = ['schema','id','version','name','summary','author','license','sourceUrl','adapter','endpointUrl','permissions','priceNote','runtime','guideMarkdown'];
  for (const [key, val] of Object.entries(v.manifest)) {
    if (key === 'runtime') {
      if (!val || typeof val !== 'object' || Array.isArray(val) || Object.keys(val).some(k => !['schema','language','entrypoint','model'].includes(k)) ||
        Object.values(val).some(x => typeof x !== 'string' || x.length > 160)) throw new NoahAgentError('実行定義の下書きを確認してください。');
      continue;
    }
    if (!keys.includes(key) || (key === 'permissions' ? !Array.isArray(val) || val.length > 6 || val.some(p => typeof p !== 'string' || p.length > 40) : val !== null && (typeof val !== 'string' || val.length > 2000)))
      throw new NoahAgentError('定義の下書き項目を確認してください。');
  }
  if (new TextEncoder().encode(v.code).length > NOAH_CODE_LIMIT || new TextEncoder().encode(JSON.stringify(v.manifest)).length > 32768) throw new NoahAgentError('下書きの上限を超えています。', 413);
  if (v.code && !v.rights) throw new NoahAgentError('コードを保存する権利を確認してください。');
  if (v.validation !== undefined && (!v.validation || typeof v.validation !== 'object' || Array.isArray(v.validation) || Object.keys(v.validation).some(k => !['enabled','testName','testCode'].includes(k)) || typeof v.validation.enabled !== 'boolean' || typeof v.validation.testName !== 'string' || v.validation.testName.length > 120 || typeof v.validation.testCode !== 'string' || new TextEncoder().encode(v.validation.testCode).length > 32768 || v.validation.testCode && !v.rights)) throw new NoahAgentError('固定テストの下書きと保存権利を確認してください。');
  return { manifest: v.manifest, codeMode: v.codeMode, codeName: v.codeName, code: v.code, rights: v.rights, ...(v.validation ? { validation: v.validation } : {}) };
}
export function createNoahDraftApi(deps: { authenticate: (request: Request) => Promise<string>; db: Pick<D1Database, 'prepare'>; bucket?: DraftBucket; now?: () => number }) {
  const now = deps.now ?? (() => Date.now()), storage = createNoahDraftStorage(deps.db, deps.bucket, now);
  const maintain = async (owner: string) => { try { await storage.collect(owner, 2); } catch { /* Saved inputs remain authoritative; the storage screen retries collection. */ } };
  const row = (owner: string, id: string) => deps.db.prepare('SELECT * FROM noah_agent_drafts WHERE id=? AND owner_id=?').bind(id, owner).first<DraftRow>();
  async function handle(request: Request, mutation: boolean, operation: (owner: string) => Promise<Response>) {
    try {
      const owner = await deps.authenticate(request);
      if (mutation) {
        if (request.headers.get('origin') !== new URL(request.url).origin) throw new NoahAgentError('このNoahから操作してください。', 403);
        if (request.headers.get(OWNER_SCOPE_HEADER) !== await ownerScopeFor(owner)) throw new NoahAgentError('アカウントが変わりました。再確認してください。', 409);
      }
      return await operation(owner);
    } catch (e) {
      if (e instanceof NoahAgentError) return output({ error: e.message }, e.status);
      if (e instanceof SyntaxError) return output({ error: '下書きのJSON形式を確認してください。' }, 400);
      if (e instanceof Error && e.message === 'UNAUTHORIZED') return output({ error: 'サインインしてください。' }, 401);
      return output({ error: '下書きを保存・取得できません。入力を保持して再試行してください。' }, 503);
    }
  }
  async function input(request: Request) {
    const multipart = request.headers.get('content-type')?.startsWith('multipart/form-data;');
    if (!multipart && !request.headers.get('content-type')?.startsWith('application/json')) throw new NoahAgentError('JSONまたはフォームで送信してください。', 415);
    const bytes = await boundedNoahBody(request, multipart ? NOAH_SOURCE_LIMIT + 750000 : 750000);
    if (!multipart) return { data: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), file: null as File | null };
    const form = await new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData();
    if ([...form.keys()].some(k => !['draft','source'].includes(k) || form.getAll(k).length !== 1) || typeof form.get('draft') !== 'string') throw new NoahAgentError('下書きフォームを確認してください。');
    const file = form.get('source');
    if (file !== null && typeof file === 'string') throw new NoahAgentError('ファイルを選んでください。');
    return { data: JSON.parse(form.get('draft') as string), file };
  }
  return {
    list: (request: Request) => handle(request, false, async owner => {
      const rows = await deps.db.prepare('SELECT * FROM noah_agent_drafts WHERE owner_id=? AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC LIMIT 32').bind(owner).all<DraftRow>();
      return output({ drafts: rows.results.map(r => ({ id: r.id, revision: r.revision, updatedAt: r.updated_at, name: JSON.parse(r.content).manifest.name || '名前未設定' })), ownerScope: await ownerScopeFor(owner) });
    }),
    get: (request: Request, id: string) => handle(request, false, async owner => {
      const saved = await row(owner, noahUploadId(id));
      if (!saved || saved.deleted_at !== null) throw new NoahAgentError('下書きが見つかりません。', 404);
      return output({ draft: present(saved), ownerScope: await ownerScopeFor(owner) });
    }),
    put: (request: Request, id: string) => handle(request, true, async owner => {
      id = noahUploadId(id);
      const { data, file } = await input(request);
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !['revision','commandId','content','clearSource'].includes(k)) || !Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.clearSource !== 'boolean') throw new NoahAgentError('下書きの版を確認してください。');
      const command = noahUploadId(data.commandId), value = content(data.content), current = await row(owner, id);
      if (file && (data.clearSource || !value.rights || file.size < 4 || file.size > NOAH_SOURCE_LIMIT || !/^[^/\\]{1,120}$/u.test(file.name) || Array.from(file.name).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) || file.name.startsWith('.'))) throw new NoahAgentError('保存権利・ファイル名・サイズ（4バイト〜10MiB）を確認してください。');
      const bytes = file ? new Uint8Array(await file.arrayBuffer()) : null, digest = bytes ? await noahSha256(bytes) : null;
      const hash = await noahSha256(new TextEncoder().encode(JSON.stringify([value, data.revision, data.clearSource, file?.name ?? null, digest])));
      if (current?.deleted_at !== null && current?.deleted_at !== undefined) throw new NoahAgentError('削除済みの下書きです。新しい下書きを作成してください。', 409);
      if (current?.command_id === command) {
        if (current.input_sha256 !== hash) throw new NoahAgentError('同じ保存操作に異なる内容があります。', 409);
        return output({ draft: present(current) });
      }
      if ((current?.revision ?? 0) !== data.revision) throw new NoahAgentError('別の画面で下書きが更新されました。入力を残したまま保存版を確認してください。', 409);
      const quota = await deps.db.prepare('SELECT COUNT(*) AS count FROM noah_agent_drafts WHERE owner_id=? AND deleted_at IS NULL').bind(owner).first<{ count: number }>();
      if (!current && (quota?.count ?? 0) >= 32) throw new NoahAgentError('下書きは32件までです。不要な下書きを削除してください。', 429);
      let source = data.clearSource ? null : current?.source_key ? { key: current.source_key, name: current.source_name, bytes: current.source_bytes, sha256: current.source_sha256 } : null;
      if (file && bytes) {
        if (!deps.bucket) throw new NoahAgentError('ファイル保存先が未設定です。', 503);
        const key = current?.source_key && current.source_sha256 === digest && current.source_bytes === bytes.length ? current.source_key : await storage.write(owner, id, command, digest!, bytes);
        source = { key, name: file.name, bytes: file.size, sha256: digest };
      }
      const time = now(), serialized = JSON.stringify(value), contentBytes = new TextEncoder().encode(serialized).length;
      if (serialized.length > 500000) throw new NoahAgentError('下書き本文の保存上限を超えています。', 413);
      const result = await deps.db.prepare(`INSERT INTO noah_agent_drafts
        (id,owner_id,content,revision,command_id,input_sha256,source_key,source_name,source_bytes,source_sha256,created_at,updated_at)
        SELECT ?,?,?,1,?,?,?,?,?,?,?,? WHERE ((SELECT COUNT(*) FROM noah_agent_drafts WHERE owner_id=? AND deleted_at IS NULL)<32 OR EXISTS(SELECT 1 FROM noah_agent_drafts WHERE id=? AND owner_id=?))
        AND (${draftInputBytesSql}+${draftObjectBytesSql}-COALESCE((SELECT length(CAST(content AS BLOB)) FROM noah_agent_drafts WHERE id=? AND owner_id=? AND purged_at IS NULL),0)+?<=?
          OR ?<=COALESCE((SELECT length(CAST(content AS BLOB)) FROM noah_agent_drafts WHERE id=? AND owner_id=? AND purged_at IS NULL),0))
        AND (? IS NULL OR EXISTS(SELECT 1 FROM noah_draft_objects WHERE object_key=? AND owner_id=? AND state='ready'))
        ON CONFLICT(id) DO UPDATE SET content=excluded.content,revision=noah_agent_drafts.revision+1,command_id=excluded.command_id,input_sha256=excluded.input_sha256,
          source_key=excluded.source_key,source_name=excluded.source_name,source_bytes=excluded.source_bytes,source_sha256=excluded.source_sha256,updated_at=excluded.updated_at
        WHERE noah_agent_drafts.owner_id=excluded.owner_id AND noah_agent_drafts.revision=? AND noah_agent_drafts.deleted_at IS NULL RETURNING *`)
        .bind(id,owner,serialized,command,hash,source?.key ?? null,source?.name ?? null,source?.bytes ?? null,source?.sha256 ?? null,time,time,owner,id,owner,owner,owner,id,owner,contentBytes,NOAH_DRAFT_STORAGE.bytes,contentBytes,id,owner,source?.key ?? null,source?.key ?? null,owner,data.revision).all<DraftRow>();
      if (!result.results.length) {
        const latest = await row(owner, id);
        if (latest?.deleted_at === null && latest.command_id === command && latest.input_sha256 === hash) return output({ draft: present(latest) });
        throw new NoahAgentError('下書きが変更されたか、保存上限に達しました。保存版を確認してください。', 409);
      }
      if (source?.key) await deps.db.prepare("UPDATE noah_draft_objects SET orphaned_at=NULL WHERE object_key=? AND owner_id=? AND state='ready' RETURNING object_key").bind(source.key,owner).all();
      await maintain(owner);
      return output({ draft: present(result.results[0]) }, current ? 200 : 201);
    }),
    remove: (request: Request, id: string) => handle(request, true, async owner => {
      const { data, file } = await input(request);
      if (file || !data || Object.keys(data).some(k => k !== 'revision') || !Number.isSafeInteger(data.revision) || data.revision < 1) throw new NoahAgentError('削除する下書きの版を指定してください。');
      const result = await deps.db.prepare('UPDATE noah_agent_drafts SET deleted_at=?, revision=revision+1 WHERE id=? AND owner_id=? AND revision=? AND deleted_at IS NULL RETURNING id')
        .bind(now(), noahUploadId(id), owner, data.revision).all();
      if (!result.results.length) throw new NoahAgentError('下書きが変更・削除されたか、見つかりません。', 409);
      await maintain(owner);
      return output({ removed: true });
    }),
    storage: (request: Request) => handle(request, request.method === 'POST', async owner => {
      if (request.method === 'POST') {
        const { data, file } = await input(request);
        if (file || !data || Array.isArray(data) || typeof data !== 'object' || Object.keys(data).length) throw new NoahAgentError('保存管理に追加の入力は不要です。');
        await storage.inventory(owner); await storage.collect(owner);
      }
      return output({ storage: await storage.summary(owner, request.method==='GET' ? new URL(request.url).searchParams.get('trashAfter') : null), ownerScope: await ownerScopeFor(owner) });
    }),
    restore: (request: Request, id: string) => handle(request, true, async owner => {
      const { data, file } = await input(request);
      if (file || !data || Object.keys(data).some(k=>k!=='revision') || !Number.isSafeInteger(data.revision) || data.revision<1) throw new NoahAgentError('復元する下書きの版を確認してください。');
      const result = await deps.db.prepare(`UPDATE noah_agent_drafts SET deleted_at=NULL,registered_upload_id=NULL,registered_draft_revision=NULL,restored_from_revision=revision,updated_at=?,revision=revision+1
        WHERE id=? AND owner_id=? AND revision=? AND deleted_at>? AND purged_at IS NULL
        AND (SELECT COUNT(*) FROM noah_agent_drafts WHERE owner_id=? AND deleted_at IS NULL)<32 RETURNING *`).bind(now(),noahUploadId(id),owner,data.revision,now()-NOAH_DRAFT_STORAGE.trashMs,owner).all<DraftRow>();
      if (!result.results.length) {
        const current = await row(owner,id);
        if (current?.deleted_at === null && current.restored_from_revision === data.revision) return output({ draft:present(current), ownerScope:await ownerScopeFor(owner) });
        throw new NoahAgentError('復元期限・保存上限・変更された版を確認してください。',409);
      }
      return output({ draft:present(result.results[0]), ownerScope:await ownerScopeFor(owner) });
    }),
    download: (request: Request, id: string) => handle(request, false, async owner => {
      const saved = await row(owner, noahUploadId(id));
      if (!saved || saved.deleted_at !== null || !saved.source_key) throw new NoahAgentError('ファイルが見つかりません。', 404);
      const object = await deps.bucket?.get(saved.source_key);
      if (!object) throw new NoahAgentError('ファイル保存先に接続できません。', 503);
      return new Response(object.body, { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="agent-source"; filename*=UTF-8''${encodeURIComponent(saved.source_name!)}`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Content-SHA256': saved.source_sha256! } });
    }),
  };
}
