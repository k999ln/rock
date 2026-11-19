// UI routes only. API identifiers, authentication and persisted records stay unchanged.
export const NOAH_PAGES = [
  ['marketplace', 'marketplace', 'マーケットプレイス'],
  ['purchases', 'purchases', '購入履歴'], ['sell', 'sell', '販売管理'],
  ['publish', 'publish', 'コード・SDKを公開'], ['register', 'register', 'Toolの掲載申請'],
  ['devices', 'devices', '端末・実行先'], ['network', 'network', '接続の管理'],
  ['outputs', 'outputs', '保存した成果'], ['free-cloud', 'free-cloud', 'クラウドの設定'],
  ['linux', 'linux', 'Linuxの設定'], ['compute-grid', 'compute-grid', '計算資源'],
  ['esim', 'esim', '回線'], ['help', 'help', '使い方・制限'],
  ['billing', 'billing', '利用明細'], ['billing/provider-test', 'billing/provider-test', '課金接続テスト'],
  ['agents/citations', 'citations', '出典整理'], ['visual-scribe', 'visual-scribe', 'ビジュアル記録'],
  ['add/zoom', 'add/zoom', 'Zoom連携'], ['campus', 'campus', '大学別コミュニティー'],
  ['campus/:campusId', 'campus/:campusId', '大学別Noah'],
  ['campus/:campusId/hub', 'campus/:campusId/hub', '大学のホーム'],
  ['tools/:toolId', 'tools/:toolId', 'Toolの詳細'], ['code/:id', 'code/:id', '共有コード'],
];
export const NOAH_LOCAL_LABS = ['add/linux','add/zoom/device','add/zoom/interpret','add/zoom/lab','apps/planner/lab'];
export const NOAH_REDIRECTS = [
  ...['/sky', '/os/sky'].flatMap(prefix => [
    [prefix, '/noah'], [prefix + '/agents', '/noah/saved'],
    ...NOAH_PAGES.map(([from, to]) => [prefix + '/' + from, '/noah/' + to]),
  ]),
  ['/add', '/noah/add'], ['/add/data', '/noah/add/data'],
  ['/campus', '/noah/community'], ['/guide', '/rockstaros/guide'],
  ['/amc', '/os/eve?mode=tools&view=work'], ['/zema/amc', '/os/eve?mode=tools&view=work'],
  ['/zema/library', '/noah/saved'], ['/studio', '/noah/publish'],
  ['/noah/library', '/noah/launch#library'], ['/noah/work', '/noah/launch#work'],
  ['/noah/models', '/noah/mac?target=models'],
  ['/noah/public', '/noah'], ['/noah/public/agents', '/noah/agents'],
  ['/noah/public/agents/:id', '/noah/agents/:id'],
];
/** Exact segment matches: unknown pages remain 404; values never become redirect origins. */
export function noahPageRedirect(pathname) {
  const path = pathname.replace(/\/$/, '');
  for (const [from, to] of NOAH_REDIRECTS) {
    const names = [];
    const pattern = from.replace(/:([a-zA-Z]+)/g, (_, name) => { names.push(name); return '([^/]+)'; });
    const match = path.match(new RegExp('^' + pattern + '$'));
    if (!match) continue;
    return to.replace(/:([a-zA-Z]+)/g, (_, name) => match[names.indexOf(name) + 1]);
  }
  return null;
}
export function noahRedirectURL(source, destination) {
  const target = new URL(destination, source);
  // Keep shared selections, repeated filters and fragments. Fixed destinations
  // control only their own keys (e.g. the work view replacing retired AMC).
  const fixed = new URLSearchParams(target.search);
  target.search = source.search;
  for (const key of new Set(fixed.keys())) {
    target.searchParams.delete(key);
    for (const value of fixed.getAll(key)) target.searchParams.append(key, value);
  }
  if(!target.hash) target.hash = source.hash;
  return target;
}
