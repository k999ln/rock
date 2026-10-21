export const skyOptionalFeatures = [
  { id: 'wallet', name: 'Wallet', href: '/wallet', description: '収支を見える形に。必要なときに報酬の受取設定へ。', initialPurpose: 'records', purposes: [{ id: 'records', label: '収支を記録したい' }, { id: 'earnings', label: '作者報酬の受取を準備したい' }], detail: '記録だけなら銀行情報は不要です。実際の受取には別の接続・確認が必要です。' },
  { id: 'market', name: 'Market', href: '/market', description: '作品・サービス・稼働枠の価値を、見つけて試す。', initialPurpose: 'explore', purposes: [{ id: 'explore', label: '市場を見て、PAPERで試したい' }, { id: 'publish', label: '自分の取引対象を登録したい' }], detail: '現在はPAPER専用です。実資金や外部への注文は発生しません。' },
] as const;
export type SkyFeatureId = typeof skyOptionalFeatures[number]['id'];
export type SkyFeatureAddition = { id: SkyFeatureId; enabled: boolean; purpose: string; revision: number };
export class SkyFeatureError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function skyFeatureDefinition(id: unknown) { return skyOptionalFeatures.find(f => f.id === id); }
export function skyFeatureStore(db: Pick<D1Database, 'prepare'>, owner: string) {
  async function list(): Promise<SkyFeatureAddition[]> {
    const rows = await db.prepare('SELECT feature AS id,enabled,purpose,revision FROM sky_feature_additions WHERE owner_user_id=?').bind(owner).all<{ id: SkyFeatureId; enabled: number; purpose: string; revision: number }>();
    return skyOptionalFeatures.map(f => { const row = rows.results.find(r => r.id === f.id); return row ? { ...row, enabled: row.enabled === 1 } : { id: f.id, enabled: false, purpose: f.initialPurpose, revision: 0 }; });
  }
  async function save(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SkyFeatureError('追加する機能を確認してください。');
    const v = input as Record<string, unknown>; const feature = skyFeatureDefinition(v.id);
    if (Object.keys(v).length !== 4 || Object.keys(v).some(k => !['id','enabled','purpose','revision'].includes(k)) || !feature || typeof v.enabled !== 'boolean' || !feature.purposes.some(p => p.id === v.purpose) || !Number.isSafeInteger(v.revision) || (v.revision as number) < 0) throw new SkyFeatureError('使い道と設定を確認してください。');
    const result = v.revision === 0
      ? await db.prepare('INSERT INTO sky_feature_additions(owner_user_id,feature,enabled,purpose,revision,updated_at) VALUES(?,?,?,?,1,?) ON CONFLICT(owner_user_id,feature) DO NOTHING').bind(owner,feature.id,Number(v.enabled),v.purpose,Date.now()).run()
      : await db.prepare('UPDATE sky_feature_additions SET enabled=?,purpose=?,revision=revision+1,updated_at=? WHERE owner_user_id=? AND feature=? AND revision=?').bind(Number(v.enabled),v.purpose,Date.now(),owner,feature.id,v.revision).run();
    if (result.meta.changes !== 1) throw new SkyFeatureError('別の画面で変更されています。最新の設定を読み込んでください。', 409);
    return list();
  }
  return { list, save };
}
