import { skyHubStore } from './sky-hub-store.ts';
import { SkyHubError } from './sky-hub.ts';
import { eveSourcePin } from './eve-source-context.ts';
export async function eveSourceContext(db:Pick<D1Database,'prepare'>,owner:string,key:string) {
  if (!key || key.length>300) throw new SkyHubError('出典を選んでください。');
  const plugin=(await skyHubStore(db,owner).list()).find(p=>p.key===key && p.enabled && p.kind!=='x');
  if (!plugin) throw new SkyHubError('追加済みの出典が見つかりません。Skyで最新の状態を確認してください。',409);
  return {source:await eveSourcePin(plugin),plugin};
}
