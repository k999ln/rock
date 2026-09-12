export type SkyRole = {
  label: string;
  toolId:
    | 'fashion-brand-ops'
    | 'coconala'
    | 'mr-free-article'
    | 'mr-citations'
    | 'mr-delivery'
    | 'rockstar-ledger'
    | 'rockstar-legal-intake'
    | 'rockstar-patent-assistant';
};

export const skyRoles: readonly SkyRole[] = [
  { label: 'ブランド運営役', toolId: 'fashion-brand-ops' },
  { label: '案件判断役', toolId: 'coconala' },
  { label: '記事編集役', toolId: 'mr-free-article' },
  { label: '出典整理役', toolId: 'mr-citations' },
  { label: '納品確認役', toolId: 'mr-delivery' },
  { label: '契約管理役', toolId: 'rockstar-ledger' },
  { label: '法務受付', toolId: 'rockstar-legal-intake' },
  { label: '特許出願担当', toolId: 'rockstar-patent-assistant' },
];

export function routeSkyRequest(request: string): SkyRole | null {
  const value = request.trim().toLowerCase();
  if (!value) return null;
  if (
    /ブランド|ファッション|instagram|インスタ|広告|dm|受注|注文|決済|商品|制作|発送/.test(
      value,
    )
  )
    return skyRoles[0];
  if (/特許|発明|先行技術|請求項|明細書/.test(value)) return skyRoles[7];
  if (/法律|弁護士|逮捕|裁判|移民|dv|法務/.test(value)) return skyRoles[6];
  if (/サブスク|定期課金|更新日|支払い失敗|契約管理/.test(value))
    return skyRoles[5];
  if (/納品|成果物|レビュー/.test(value)) return skyRoles[4];
  if (/案件|応募|ココナラ|提案/.test(value)) return skyRoles[1];
  if (/出典|引用|url|リンク/.test(value)) return skyRoles[3];
  if (/記事|無料版|note|原稿/.test(value)) return skyRoles[2];
  return null;
}
