import { NoahAgentError, noahSha256, noahUploadId } from './noah-agent-upload.ts';
import { createNoahBrowserQuota, NOAH_BROWSER_QUOTA_MESSAGE, noahBrowserOwner } from './noah-browser-quota.ts';

export const NOAH_DRAFT_STORAGE = { bytes: 64 * 1024 * 1024, objects: 512, drafts: 32, trashMs: 7 * 86400000, orphanMs: 86400000, writeMs: 15 * 60000 } as const;
export type DraftBucket = Pick<R2Bucket, 'get' | 'put'> & Partial<Pick<R2Bucket, 'list' | 'delete'>>;
type Db = Pick<D1Database, 'prepare'>;
type ObjectRow = { object_key: string; owner_id: string; draft_id: string; bytes: number; sha256: string; state: string; write_expires_at: number; orphaned_at: number | null; created_at: number; updated_at: number };
export type NoahDraftStorage = {
  inputBytes: number; objectBytes: number; allocatedBytes: number; reservedBytes: number; pendingBytes: number; objects: number;
  limitBytes: number; limitObjects: number; activeDrafts: number; limitDrafts: number; lastScanAt: number | null; scanPending: boolean;
  nextTrash: string | null;
  trash: { id: string; name: string; revision: number; restoreUntil: number; registeredUploadId: string | null }[];
};
export const draftInputBytesSql = '(SELECT COALESCE(SUM(length(CAST(content AS BLOB))),0) FROM noah_agent_drafts WHERE owner_id=? AND purged_at IS NULL)';
export const draftObjectBytesSql = "(SELECT COALESCE(SUM(bytes),0) FROM noah_draft_objects WHERE owner_id=? AND state!='deleted')";
// Includes trash until its retention ends; a reference is never inferred from age.
const unreferenced = `NOT EXISTS(SELECT 1 FROM noah_agent_drafts d WHERE d.source_key=o.object_key AND d.purged_at IS NULL)
  AND NOT EXISTS(SELECT 1 FROM noah_agent_uploads a WHERE a.source_key=o.object_key OR a.original_key=o.object_key)`;
export function createNoahDraftStorage(db: Db, bucket?: DraftBucket, now = () => Date.now()) {
  const prefix = async (owner: string) => `noah/drafts/${await noahSha256(new TextEncoder().encode(owner))}/`;
  const reconcileReferences = (owner: string) => db.prepare(`INSERT OR IGNORE INTO noah_draft_objects(object_key,owner_id,draft_id,bytes,sha256,state,write_expires_at,created_at,updated_at)
    SELECT source_key,owner_id,id,source_bytes,source_sha256,'ready',0,created_at,updated_at FROM noah_agent_drafts WHERE owner_id=? AND source_key IS NOT NULL AND purged_at IS NULL RETURNING object_key`).bind(owner).all();
  const object = (owner: string, key: string) => db.prepare('SELECT * FROM noah_draft_objects WHERE owner_id=? AND object_key=?').bind(owner, key).first<ObjectRow>();
  return {
    async summary(owner: string, before?: string | null): Promise<NoahDraftStorage> {
      await reconcileReferences(owner);
      let after: {at:number;id:string} | null=null;
      if (before) {
        try { if (before.length>200) throw new Error(); after=JSON.parse(before); if (!after || !Number.isSafeInteger(after.at) || after.at<0) throw new Error(); noahUploadId(after.id); } catch { throw new NoahAgentError('復元一覧の続き位置を確認してください。'); }
      }
      const input = await db.prepare(`SELECT COALESCE(SUM(CASE WHEN purged_at IS NULL THEN length(CAST(content AS BLOB)) ELSE 0 END),0) AS bytes,
        COALESCE(SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END),0) AS active FROM noah_agent_drafts WHERE owner_id=?`).bind(owner).first<{ bytes: number; active: number }>();
      const blobs = await db.prepare(`SELECT COALESCE(SUM(bytes),0) AS bytes, COUNT(*) AS count,
        COALESCE(SUM(CASE WHEN state='writing' THEN bytes ELSE 0 END),0) AS reserved,
        COALESCE(SUM(CASE WHEN state='deleting' OR orphaned_at IS NOT NULL THEN bytes ELSE 0 END),0) AS pending
        FROM noah_draft_objects WHERE owner_id=? AND state!='deleted'`).bind(owner).first<{ bytes: number; count: number; reserved: number; pending: number }>();
      const scan = await db.prepare('SELECT cursor,last_scan_at FROM noah_draft_storage_scans WHERE owner_id=?').bind(owner).first<{cursor: string | null; last_scan_at: number | null}>();
      const trash = await db.prepare('SELECT id,content,revision,deleted_at,registered_upload_id FROM noah_agent_drafts WHERE owner_id=? AND deleted_at>? AND purged_at IS NULL AND (? IS NULL OR deleted_at<? OR (deleted_at=? AND id>?)) ORDER BY deleted_at DESC,id LIMIT 33').bind(owner, now()-NOAH_DRAFT_STORAGE.trashMs,after?.at ?? null,after?.at ?? null,after?.at ?? null,after?.id ?? null).all<{id:string;content:string;revision:number;deleted_at:number;registered_upload_id:string|null}>();
      return { inputBytes: input?.bytes ?? 0, objectBytes: blobs?.bytes ?? 0, allocatedBytes: (input?.bytes ?? 0)+(blobs?.bytes ?? 0), reservedBytes: blobs?.reserved ?? 0, pendingBytes: blobs?.pending ?? 0, objects: blobs?.count ?? 0,
        limitBytes: NOAH_DRAFT_STORAGE.bytes, limitObjects: NOAH_DRAFT_STORAGE.objects, activeDrafts: input?.active ?? 0, limitDrafts: NOAH_DRAFT_STORAGE.drafts, lastScanAt: scan?.last_scan_at ?? null, scanPending: !scan?.last_scan_at || Boolean(scan.cursor),
        nextTrash: trash.results.length>32 ? JSON.stringify({at:trash.results[31].deleted_at,id:trash.results[31].id}) : null,
        trash: trash.results.slice(0,32).map(r=>({id:r.id,name:JSON.parse(r.content).manifest?.name || '名前未設定',revision:r.revision,restoreUntil:r.deleted_at+NOAH_DRAFT_STORAGE.trashMs,registeredUploadId:r.registered_upload_id})) };
    },
    async write(owner: string, draftId: string, command: string, sha256: string, bytes: Uint8Array) {
      if (!bucket) throw new NoahAgentError('ファイル保存先が未設定です。', 503);
      await reconcileReferences(owner);
      const key = `${await prefix(owner)}${draftId}/${command}/${sha256}`, time = now();
      // 新しいファイルだけ、ブラウザだけの本人を全員まとめた 1 日の上限に数える（task 128 の D1）。同じファイルの送り直しは数えない。
      if (noahBrowserOwner(owner) && !(await object(owner, key))) {
        const quota = createNoahBrowserQuota(db, now);
        if (!(await quota.take(owner, 'draftObjects')) || !(await quota.take(owner, 'uploadBytes', bytes.length))) throw new NoahAgentError(NOAH_BROWSER_QUOTA_MESSAGE, 429);
      }
      await db.prepare(`INSERT OR IGNORE INTO noah_draft_objects(object_key,owner_id,draft_id,bytes,sha256,state,write_expires_at,created_at,updated_at)
        SELECT ?,?,?,?,?,'writing',?,?,? WHERE ${draftInputBytesSql}+${draftObjectBytesSql}+?<=?
        AND (SELECT COUNT(*) FROM noah_draft_objects WHERE owner_id=? AND state!='deleted')<? RETURNING object_key`)
        .bind(key,owner,draftId,bytes.length,sha256,time+NOAH_DRAFT_STORAGE.writeMs,time,time,owner,owner,bytes.length,NOAH_DRAFT_STORAGE.bytes,owner,NOAH_DRAFT_STORAGE.objects).all();
      const saved = await object(owner,key);
      if (!saved) throw new NoahAgentError('下書きの保存量上限です。保存管理で不要な下書きと回収待ちを確認してください。', 429);
      if (saved.draft_id !== draftId || saved.sha256 !== sha256 || saved.bytes !== bytes.length || !['writing','ready'].includes(saved.state)) throw new NoahAgentError('この保存操作は回収済みです。保存・再試行で新しい予約を取得してください。',410);
      if (saved.state === 'ready') return key;
      if (saved.write_expires_at <= now()) throw new NoahAgentError('ファイルの保存予約が期限切れです。保存・再試行で新しい予約を取得してください。',410);
      await bucket.put(key,bytes,{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{sha256}});
      const result = await db.prepare("UPDATE noah_draft_objects SET state='ready',updated_at=? WHERE object_key=? AND owner_id=? AND state='writing' AND write_expires_at>? RETURNING object_key").bind(now(),key,owner,now()).all();
      if (!result.results.length && (await object(owner,key))?.state !== 'ready') throw new NoahAgentError('保存予約が失効しました。入力を保持して再試行してください。',410);
      return key;
    },
    async inventory(owner: string) {
      if (!bucket?.list) throw new NoahAgentError('保存先の再確認機能に接続できません。',503);
      await db.prepare('INSERT OR IGNORE INTO noah_draft_storage_scans(owner_id) VALUES(?) RETURNING owner_id').bind(owner).all();
      const scan = await db.prepare('SELECT cursor,revision FROM noah_draft_storage_scans WHERE owner_id=?').bind(owner).first<{cursor:string|null;revision:number}>();
      const ownPrefix = await prefix(owner), page = await bucket.list({prefix:ownPrefix,limit:100,...(scan!.cursor ? {cursor:scan!.cursor} : {})});
      for (const blob of page.objects) {
        const match = /^([a-f0-9-]{36})\/(?:[a-f0-9-]{36}\/)?([a-f0-9]{64})$/.exec(blob.key.slice(ownPrefix.length));
        if (!blob.key.startsWith(ownPrefix) || !match || blob.size < 4 || blob.size > 10485760) continue;
        await db.prepare(`INSERT OR IGNORE INTO noah_draft_objects(object_key,owner_id,draft_id,bytes,sha256,state,write_expires_at,created_at,updated_at)
          VALUES(?,?,?,?,?,'ready',0,?,?) RETURNING object_key`).bind(blob.key,owner,match[1],blob.size,match[2],now(),now()).all();
        // An expired writer can finish after deletion. It can never attach to a
        // draft; keep its tombstone and collect the late object again.
        await db.prepare("UPDATE noah_draft_objects SET state='deleting',updated_at=? WHERE object_key=? AND owner_id=? AND state='deleted' RETURNING object_key").bind(now(),blob.key,owner).all();
      }
      const cursor = page.truncated ? page.cursor : null;
      if (page.truncated && !cursor) throw new NoahAgentError('保存先の続きが確認できません。再試行してください。',503);
      await db.prepare('UPDATE noah_draft_storage_scans SET cursor=?,last_scan_at=CASE WHEN ? IS NULL THEN ? ELSE last_scan_at END,revision=revision+1 WHERE owner_id=? AND revision=? RETURNING owner_id').bind(cursor,cursor,now(),owner,scan!.revision).all();
    },
    async collect(owner: string, limit = 8) {
      const time = now();
      await db.prepare(`UPDATE noah_agent_drafts SET purged_at=?,content='{}',source_key=NULL,source_name=NULL,source_bytes=NULL,source_sha256=NULL,updated_at=?,revision=revision+1
        WHERE owner_id=? AND deleted_at<=? AND purged_at IS NULL RETURNING id`).bind(time,time,owner,time-NOAH_DRAFT_STORAGE.trashMs).all();
      await db.prepare(`UPDATE noah_draft_objects AS o SET orphaned_at=NULL WHERE owner_id=? AND state IN ('writing','ready') AND NOT (${unreferenced}) RETURNING object_key`).bind(owner).all();
      await db.prepare(`UPDATE noah_draft_objects AS o SET orphaned_at=COALESCE(orphaned_at,?),updated_at=? WHERE owner_id=? AND (state='ready' OR (state='writing' AND write_expires_at<=?)) AND ${unreferenced} RETURNING object_key`).bind(time,time,owner,time).all();
      if (!bucket?.delete) return { deleted: 0, available: false };
      const candidates = await db.prepare(`SELECT * FROM noah_draft_objects AS o WHERE owner_id=? AND ${unreferenced} AND
        (state='deleting' OR (state IN ('writing','ready') AND orphaned_at<=? AND (state!='writing' OR write_expires_at<=?))) ORDER BY updated_at,object_key LIMIT ?`).bind(owner,time-NOAH_DRAFT_STORAGE.orphanMs,time,limit).all<ObjectRow>();
      const ownPrefix = await prefix(owner); let deleted = 0;
      for (const candidate of candidates.results) {
        if (!candidate.object_key.startsWith(ownPrefix) || !/^[a-f0-9-]{36}\/(?:[a-f0-9-]{36}\/)?[a-f0-9]{64}$/.test(candidate.object_key.slice(ownPrefix.length))) continue;
        const claimed = await db.prepare(`UPDATE noah_draft_objects AS o SET state='deleting',updated_at=? WHERE owner_id=? AND object_key=? AND (state='deleting' OR (state IN ('writing','ready') AND orphaned_at<=? AND (state!='writing' OR write_expires_at<=?))) AND ${unreferenced} RETURNING object_key`).bind(time,owner,candidate.object_key,time-NOAH_DRAFT_STORAGE.orphanMs,time).all();
        if (!claimed.results.length) continue;
        await bucket.delete(candidate.object_key);
        await db.prepare("UPDATE noah_draft_objects SET state='deleted',updated_at=? WHERE owner_id=? AND object_key=? AND state='deleting' RETURNING object_key").bind(now(),owner,candidate.object_key).all();
        deleted++;
      }
      return { deleted, available: true };
    },
  };
}
