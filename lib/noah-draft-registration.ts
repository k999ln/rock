import type { DraftRow, NoahDraftContent } from './noah-drafts.ts';
import type { DraftBucket } from './noah-draft-storage.ts';
import { createNoahDraftStorage } from './noah-draft-storage.ts';
import { bundleUploadTest } from './noah-upload-bundle.ts';
import { NoahAgentError, noahSha256, noahUploadId, parseNoahAgentManifest, type NoahAgentManifest } from './noah-agent-upload.ts';

export type DraftRegistration = { id: string; revision: number };
type Db = Pick<D1Database, 'prepare'>;
export async function prepareDraftRegistration(db: Db, bucket: DraftBucket | undefined, owner: string, reference: unknown, upload: {id:string;manifest:NoahAgentManifest;source:{name:string;sha256:string}|null}) {
  if (reference === undefined) return null;
  const ref = reference as DraftRegistration;
  if (!ref || typeof ref !== 'object' || Array.isArray(ref) || Object.keys(ref).some(k=>!['id','revision'].includes(k)) || !Number.isSafeInteger(ref.revision) || ref.revision<1) throw new NoahAgentError('登録する下書きの版を確認してください。');
  noahUploadId(ref.id);
  const saved = await db.prepare('SELECT * FROM noah_agent_drafts WHERE id=? AND owner_id=?').bind(ref.id,owner).first<DraftRow>();
  if (!saved) throw new NoahAgentError('登録元の下書きが見つかりません。',404);
  if (saved.registered_upload_id===upload.id && saved.registered_draft_revision===ref.revision) return {ref,matching:true};
  // The upload can succeed, but a newer edit/restore is never consumed.
  if (saved.revision!==ref.revision || saved.deleted_at!==null || saved.purged_at!==null) return {ref,matching:false};
  const value = JSON.parse(saved.content) as NoahDraftContent;
  if (JSON.stringify(parseNoahAgentManifest(value.manifest))!==JSON.stringify(upload.manifest) || !value.rights) throw new NoahDraftMismatch();
  let file: File | null = null;
  if (value.codeMode==='paste') file=new File([value.code],value.codeName);
  else if (saved.source_key) {
    const object=await bucket?.get(saved.source_key);
    if (!object) throw new NoahAgentError('下書きの原本を照合できません。',503);
    const bytes=new Uint8Array(await new Response(object.body).arrayBuffer());
    if (bytes.length!==saved.source_bytes || await noahSha256(bytes)!==saved.source_sha256) throw new NoahAgentError('下書きの原本が一致しません。',409);
    file=new File([bytes],saved.source_name!);
  }
  if (file) {
    try { file=await bundleUploadTest(file,value.validation?.testName || '',value.validation?.testCode || ''); } catch { throw new NoahDraftMismatch(); }
    if (!upload.source || file.name!==upload.source.name || await noahSha256(new Uint8Array(await file.arrayBuffer()))!==upload.source.sha256) throw new NoahDraftMismatch();
  } else if (upload.source) throw new NoahDraftMismatch();
  return {ref,matching:true};
}
class NoahDraftMismatch extends NoahAgentError {
  constructor() { super('登録する原本・固定テスト・定義が下書きと一致しません。下書きを保存し直してください。',409); }
}
export async function finishDraftRegistration(db: Db, bucket: DraftBucket | undefined, owner: string, uploadId: string, prepared: Awaited<ReturnType<typeof prepareDraftRegistration>>, now = Date.now()) {
  if (!prepared) return undefined;
  const {ref}=prepared;
  if (prepared.matching) await db.prepare(`UPDATE noah_agent_drafts SET deleted_at=?,registered_upload_id=?,registered_draft_revision=?,revision=revision+1,updated_at=?
    WHERE id=? AND owner_id=? AND revision=? AND deleted_at IS NULL AND purged_at IS NULL
    AND EXISTS(SELECT 1 FROM noah_agent_uploads WHERE id=? AND owner_id=? AND upload_state='ready' AND deleted_at IS NULL) RETURNING id`)
    .bind(now,uploadId,ref.revision,now,ref.id,owner,ref.revision,uploadId,owner).all();
  const current=await db.prepare('SELECT registered_upload_id,registered_draft_revision FROM noah_agent_drafts WHERE id=? AND owner_id=?').bind(ref.id,owner).first<{registered_upload_id:string|null;registered_draft_revision:number|null}>();
  const archived=current?.registered_upload_id===uploadId && current.registered_draft_revision===ref.revision;
  try { await createNoahDraftStorage(db,bucket,()=>now).collect(owner,2); } catch { /* Registration is durable; collection can be retried independently. */ }
  return {id:ref.id,state:archived?'archived':'kept_newer'};
}
