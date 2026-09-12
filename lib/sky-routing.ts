export type SkyRole = {
  label: string;
  toolId:
    | 'coconala'
    | 'mr-free-article'
    | 'mr-citations'
    | 'mr-delivery'
    | 'rockstar-ledger';
};

export const skyRoles: readonly SkyRole[] = [
  { label: '案件判断役', toolId: 'coconala' },
  { label: '記事編集役', toolId: 'mr-free-article' },
  { label: '出典整理役', toolId: 'mr-citations' },
  { label: '納品確認役', toolId: 'mr-delivery' },
  { label: '契約管理役', toolId: 'rockstar-ledger' },
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
  if (/サブスク|定期課金|更新日|支払い失敗|契約管理/.test(value))
    return skyRoles[5];
  if (/納品|成果物|レビュー/.test(value)) return skyRoles[4];
  if (/案件|応募|ココナラ|提案/.test(value)) return skyRoles[1];
  if (/出典|引用|url|リンク/.test(value)) return skyRoles[3];
  if (/記事|無料版|note|原稿/.test(value)) return skyRoles[2];
  return null;
}
