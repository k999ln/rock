import { SkyHubError, skyHubKey, skyHubKind, skyHubResource, X_TIMELINE_CONSENT, type SkyHubMetadata, type SkyHubPlugin } from './sky-hub.ts';
type Database = Pick<D1Database,'prepare'>;
type Row = { key: string; kind: SkyHubPlugin['kind']; resource: string; enabled: number; revision: number; metadata: string; consentVersion: string | null; updatedAt: number };
export function skyHubStore(db: Database, owner: string) {
  async function list(): Promise<SkyHubPlugin[]> {
    const rows = await db.prepare('SELECT plugin_key AS key,kind,resource,enabled,revision,metadata,consent_version AS consentVersion,updated_at AS updatedAt FROM sky_hub_plugins WHERE owner_user_id=? ORDER BY updated_at DESC LIMIT 100').bind(owner).all<Row>();
    return rows.results.map(r=>({...r,enabled:r.enabled===1,metadata:JSON.parse(r.metadata) as SkyHubMetadata}));
  }
  async function save(input: unknown, metadataFor: (kind: SkyHubPlugin['kind'], resource: string)=>Promise<SkyHubMetadata>) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SkyHubError('追加する内容を確認してください。');
    const v=input as Record<string,unknown>;
    if (Object.keys(v).some(k=>!['kind','resource','enabled','revision','consentVersion'].includes(k)) || typeof v.enabled !== 'boolean' || !Number.isSafeInteger(v.revision) || (v.revision as number)<0) throw new SkyHubError('設定と現在の版を確認してください。');
    const kind=skyHubKind(v.kind), resource=skyHubResource(kind,v.resource), key=skyHubKey(kind,resource);
    const before=(await list()).find(p=>p.key===key);
    if ((before?.revision ?? 0)!==v.revision) throw new SkyHubError('別の画面で変更されています。最新の状態を確認してください。',409);
    if (!before && !v.enabled) throw new SkyHubError('追加した項目が見つかりません。',404);
    if (kind==='x' && v.enabled && v.consentVersion!==X_TIMELINE_CONSENT) throw new SkyHubError('Xへの接続と利用条件を確認してから追加してください。',400);
    const metadata=v.enabled ? await metadataFor(kind,resource) : before!.metadata;
    const now=Date.now(), consent=kind==='x' && v.enabled ? X_TIMELINE_CONSENT : before?.consentVersion ?? null;
    const result=!before
      ? await db.prepare('INSERT INTO sky_hub_plugins(owner_user_id,plugin_key,kind,resource,enabled,revision,metadata,consent_version,updated_at) SELECT ?,?,?,?,1,1,?,?,? WHERE (SELECT COUNT(*) FROM sky_hub_plugins WHERE owner_user_id=?)<100 ON CONFLICT(owner_user_id,plugin_key) DO NOTHING').bind(owner,key,kind,resource,JSON.stringify(metadata),consent,now,owner).run()
      : await db.prepare('UPDATE sky_hub_plugins SET enabled=?,revision=revision+1,metadata=?,consent_version=?,updated_at=? WHERE owner_user_id=? AND plugin_key=? AND revision=?').bind(Number(v.enabled),JSON.stringify(metadata),consent,now,owner,key,v.revision).run();
    if(result.meta.changes!==1) throw new SkyHubError('追加上限または設定の変更を確認してください。最新の状態を読み直せます。',409);
    return list();
  }
  return {list,save};
}
