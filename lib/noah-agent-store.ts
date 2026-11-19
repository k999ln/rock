import { NoahAgentError, type NoahAgentManifest } from './noah-agent-upload.ts';
import type { NoahSourceProcessing } from './noah-upload-refactor.ts';
type Source = { name: string; bytes: number; sha256: string };
export type NoahUpload = {
  id: string; manifest: NoahAgentManifest; manifestSha256: string;
  source: { name: string; bytes: number; sha256: string } | null;
  original: Source | null; processing: NoahSourceProcessing | null;
  uploadState: 'pending' | 'ready'; createdAt: number;
};
type Row = { id: string; manifest: string; manifest_sha256: string; source_key: string | null;
  source_name: string | null; source_bytes: number | null; source_sha256: string | null;
  original_key: string | null; original_name: string | null; original_bytes: number | null; original_sha256: string | null; processing_json: string | null;
  upload_state: 'pending' | 'ready'; created_at: number; deleted_at: number | null };
function present(row: Row): NoahUpload {
  return { id: row.id, manifest: JSON.parse(row.manifest), manifestSha256: row.manifest_sha256,
    source: row.source_key ? { name: row.source_name!, bytes: row.source_bytes!, sha256: row.source_sha256! } : null,
    original: row.original_key ? { name: row.original_name!, bytes: row.original_bytes!, sha256: row.original_sha256! } : null,
    processing: row.processing_json ? JSON.parse(row.processing_json) : null,
    uploadState: row.upload_state, createdAt: row.created_at };
}
export function noahAgentStore(db: Pick<D1Database, 'prepare'>, owner: string) {
  async function row(id: string) { return db.prepare('SELECT * FROM noah_agent_uploads WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').bind(id, owner).first<Row>(); }
  return {
    async list() {
      const result = await db.prepare('SELECT * FROM noah_agent_uploads WHERE owner_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 100').bind(owner).all<Row>();
      return result.results.map(present);
    },
    async get(id: string) { const r = await row(id); return r ? present(r) : null; },
    async sourceKey(id: string, original = false) { const r = await row(id); return original ? r?.original_key ?? null : r?.upload_state === 'ready' ? r.source_key : null; },
    async reserve(input: { id: string; manifest: NoahAgentManifest; manifestSha256: string; source: { key: string; name: string; bytes: number; sha256: string } | null }) {
      const source = input.source;
      const result = await db.prepare(`INSERT OR IGNORE INTO noah_agent_uploads
        (id, owner_id, manifest, manifest_sha256, source_key, source_name, source_bytes, source_sha256, upload_state, created_at, original_key, original_name, original_bytes, original_sha256)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM noah_agent_uploads WHERE owner_id = ?) < 100 RETURNING id`)
        .bind(input.id, owner, JSON.stringify(input.manifest), input.manifestSha256, source?.key ?? null, source?.name ?? null,
          source?.bytes ?? null, source?.sha256 ?? null, source ? 'pending' : 'ready', Date.now(), source?.key ?? null, source?.name ?? null, source?.bytes ?? null, source?.sha256 ?? null, owner).all();
      const existing = await row(input.id);
      if (!existing || existing.manifest_sha256 !== input.manifestSha256 || (existing.original_sha256 ?? existing.source_sha256) !== (source?.sha256 ?? null) || (existing.original_name ?? existing.source_name) !== (source?.name ?? null))
        throw new NoahAgentError('登録IDが使用済みか、保存上限（100件）に達しました。内容を変える場合は新しく登録してください。', 409);
      return { upload: present(existing), created: result.results.length === 1 };
    },
    async complete(id: string, source: Source & { key: string }, processing: NoahSourceProcessing) {
      const result = await db.prepare("UPDATE noah_agent_uploads SET upload_state = 'ready', source_key = ?, source_name = ?, source_bytes = ?, source_sha256 = ?, processing_json = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL AND upload_state = 'pending' RETURNING *")
        .bind(source.key, source.name, source.bytes, source.sha256, JSON.stringify(processing), id, owner).all<Row>();
      if (!result.results[0]) { const current = await row(id); if (current?.upload_state === 'ready') return present(current); }
      if (!result.results[0]) throw new NoahAgentError('登録が取り消されました。', 409);
      return present(result.results[0]);
    },
    async remove(id: string) {
      const result = await db.prepare('UPDATE noah_agent_uploads SET deleted_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL RETURNING id').bind(Date.now(), id, owner).all();
      if (!result.results.length) throw new NoahAgentError('Agentが見つかりません。', 404);
    },
  };
}
