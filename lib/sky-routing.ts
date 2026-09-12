export type SkyRole = {
  label: string;
  toolId:
    | 'coconala'
    | 'mr-free-article'
    | 'mr-citations'
    | 'mr-delivery'
    | 'rockstar-ledger'
    | 'rockstar-legal-intake'
    | 'rockstar-patent-assistant';
};

export const skyRoles: readonly SkyRole[] = [
  { label: '案件判断役', toolId: 'coconala' },
  { label: '記事編集役', toolId: 'mr-free-article' },
  { label: '出典整理役', toolId: 'mr-citations' },
  { label: '納品確認役', toolId: 'mr-delivery' },
  { label: 'サブスク顧問', toolId: 'rockstar-ledger' },
  { label: '法務受付', toolId: 'rockstar-legal-intake' },
  { label: '特許出願担当', toolId: 'rockstar-patent-assistant' },
];

export function routeSkyRequest(request: string): SkyRole | null {
  const value = request.trim().toLowerCase();
  if (!value) return null;
  if (/特許|発明|先行技術|請求項|明細書/.test(value)) return skyRoles[6];
  if (/法律|弁護士|逮捕|裁判|移民|dv|法務/.test(value)) return skyRoles[5];
  if (/サブスク|定期課金|更新日|支払い失敗|月額/.test(value))
    return skyRoles[4];
  if (/納品|成果物|契約|レビュー/.test(value)) return skyRoles[3];
  if (/案件|応募|ココナラ|提案/.test(value)) return skyRoles[0];
  if (/出典|引用|url|リンク/.test(value)) return skyRoles[2];
  if (/記事|無料版|note|原稿/.test(value)) return skyRoles[1];
  return null;
}
