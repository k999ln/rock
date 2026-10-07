export const ADDONS_STORAGE_KEY = 'rockstaros.addons.v1';
export const ADDONS_CHANGED_EVENT = 'rockstaros-addons-changed';
export const optionalAddons = [
  { id: 'data', name: 'データ回収', href: '/add/data', description: '選んだファイルとメモをまとめ、暗号化して持ち運ぶ。' },
  { id: 'llm', name: 'LLM', href: '/chat', description: 'Zemaで文章を相談する。接続先と利用条件を確認して始める。' },
] as const;
export type AddonId = typeof optionalAddons[number]['id'];
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export function readAddons(storage: Pick<Store, 'getItem'>): AddonId[] {
  const raw = storage.getItem(ADDONS_STORAGE_KEY);
  if (raw === null) return [];
  if (raw.length > 256) throw new Error('追加機能の設定が大きすぎます。');
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > optionalAddons.length || value.some(id => !optionalAddons.some(a => a.id === id)))
    throw new Error('追加機能の設定を読み取れません。');
  return [...new Set(value)] as AddonId[];
}
export function setAddon(storage: Store, id: AddonId, enabled: boolean) {
  if (!optionalAddons.some(a => a.id === id) || typeof enabled !== 'boolean') throw new Error('不明な追加機能です。');
  const current = readAddons(storage);
  const next = enabled ? [...new Set([...current, id])] : current.filter(value => value !== id);
  storage.setItem(ADDONS_STORAGE_KEY, JSON.stringify(next));
  return next;
}
