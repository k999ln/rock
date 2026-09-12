export type SkyRole = {
  label: string;
  toolId: 'coconala' | 'mr-free-article' | 'mr-citations' | 'mr-delivery';
};

export const skyRoles: readonly SkyRole[] = [
  { label: '案件判断役', toolId: 'coconala' },
  { label: '記事編集役', toolId: 'mr-free-article' },
  { label: '出典整理役', toolId: 'mr-citations' },
  { label: '納品確認役', toolId: 'mr-delivery' },
];

export function routeSkyRequest(request: string): SkyRole | null {
  const value = request.trim().toLowerCase();
  if (!value) return null;
  if (/納品|成果物|契約|レビュー/.test(value)) return skyRoles[3];
  if (/案件|応募|ココナラ|提案/.test(value)) return skyRoles[0];
  if (/出典|引用|url|リンク/.test(value)) return skyRoles[2];
  if (/記事|無料版|note|原稿/.test(value)) return skyRoles[1];
  return null;
}
