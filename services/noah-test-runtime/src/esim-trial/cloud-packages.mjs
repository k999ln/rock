// Operators register immutable adapter binding names. Browser input selects only
// a published package and destination ID. Credentials stay inside the adapter.
const defaults = [
  {
    id: 'text-check',
    name: '文章の文字数・行数を確認',
    routes: [
      {
        id: 'provider',
        kind: 'provider',
        label: '提供元の専用クラウド',
        binding: 'PROVIDER',
      },
      {
        id: 'registered',
        kind: 'registered',
        label: '登録済みの接続先',
        binding: 'REGISTERED',
      },
      { id: 'noah', kind: 'noah', label: 'Noahクラウド', binding: 'NOAH' },
    ],
  },
];
export const routeId = (value) =>
  typeof value === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(value);
const label = (value) =>
  typeof value === 'string' && value.trim() && value.length <= 100;
export function cloudPackages(env) {
  const packages =
    env.NOAH_AGENT_ROUTES === undefined
      ? defaults
      : JSON.parse(env.NOAH_AGENT_ROUTES);
  const seen = new Set();
  if (!Array.isArray(packages) || packages.length > 32)
    throw Error('Invalid package registry');
  return packages.map((pkg) => {
    if (
      !pkg ||
      !routeId(pkg.id) ||
      seen.has(pkg.id) ||
      !label(pkg.name) ||
      !Array.isArray(pkg.routes) ||
      pkg.routes.length > 16
    )
      throw Error('Invalid package');
    seen.add(pkg.id);
    const ids = new Set();
    const routes = pkg.routes.filter((route) => {
      if (
        !route ||
        !routeId(route.id) ||
        route.id === 'auto' ||
        ids.has(route.id) ||
        !label(route.label) ||
        !['provider', 'registered', 'noah'].includes(route.kind) ||
        typeof route.binding !== 'string' ||
        !/^(?:NOAH|PROVIDER|REGISTERED|AGENT_[A-Z0-9_]{1,48})$/.test(
          route.binding,
        )
      )
        throw Error('Invalid adapter');
      ids.add(route.id);
      return typeof env[route.binding]?.fetch === 'function';
    });
    return { id: pkg.id, name: pkg.name, routes };
  });
}

export function parseWorkReport(value) {
  if (!value || typeof value !== 'object') return null;
  const result = {};
  for (const key of ['done', 'incomplete', 'unverified']) {
    if (
      !Array.isArray(value[key]) ||
      value[key].length > 24 ||
      !value[key].every(
        (s) => typeof s === 'string' && s.trim() && s.length <= 400,
      )
    )
      return null;
    result[key] = value[key];
  }
  return result;
}
