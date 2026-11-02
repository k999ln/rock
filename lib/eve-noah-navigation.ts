/** UI destinations only. These helpers never grant access or start work. */
export function eveToolPath(query: string | URLSearchParams = '') {
  const params = new URLSearchParams(query);
  params.set('mode', 'tools');
  return '/os/eve?' + params.toString();
}

export function accountReturnNavigation(query: string) {
  const value = new URLSearchParams(query).get('returnTo');
  let href = '/#timeline';
  if (value && /^\/(?!\/)/.test(value) && !/[\\\r\n]/.test(value) && value.length < 2048) {
    const url = new URL(value, 'https://navigation.invalid');
    if (url.origin === 'https://navigation.invalid' && !url.pathname.startsWith('/account')) {
      href = url.pathname + url.search + url.hash;
    }
  }
  const target = new URL(href, 'https://navigation.invalid');
  const label = target.pathname === '/settings' ? '設定へ戻る'
    : target.pathname.startsWith('/connect') ? '接続に戻る'
    : target.pathname === '/os/eve' ? target.hash === '#eve-work-results' ? 'Eveの仕事と成果へ戻る' : 'Eveへ戻る'
    : href === '/#timeline' ? 'Noahへ進む'
    : target.pathname === '/' || /^\/(os\/)?sky(?:\/|$)/.test(target.pathname) ? 'Noahへ戻る'
    : '元の画面へ戻る';
  return { href, label };
}

export function newsSourceNavigation(query: string) {
  const params = new URLSearchParams(query);
  try {
    const url = new URL(params.get('newsSource') ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) return null;
    return { href: url.href, title: (params.get('sourceTitle') || url.hostname).slice(0, 240) };
  } catch { return null; }
}

/** Tool workspace uses a query view; the regular Eve workspace uses hashes. */
export function eveWorkspaceNavigation(query: string) {
  const params = new URLSearchParams(query);
  if (params.get('mode') !== 'tools') return { compose: '#eve-compose', results: '#eve-work-results', workView: false };
  const workView = params.get('view') === 'work';
  params.delete('view');
  const compose = eveToolPath(params);
  params.set('view', 'work');
  return { compose, results: eveToolPath(params), workView };
}
