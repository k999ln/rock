export type GameProfile = 'low' | 'standard';
export function gameLaunchUrl(profile: GameProfile): string {
  if (profile !== 'low' && profile !== 'standard') throw new Error('Unknown game profile');
  const url = new URL('https://fiveplay.lol/');
  if (profile === 'low') {
    url.searchParams.set('low', '1');
    url.searchParams.set('res', '1280x720');
    url.searchParams.set('fps', '30');
  }
  return url.href;
}
export function gameTestIntent(profile: GameProfile, note: string): string {
  if (!note.trim() || note.trim().length > 1200) throw new Error('試験メモを1〜1200文字で入力してください。');
  return `GTA Webプレイ試験の記録を整理する。\n設定: ${gameLaunchUrl(profile)}\n本人の手動記録（ゲームからの自動取得・実機合格ではない）:\n${note.trim()}`;
}
