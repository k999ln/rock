// Public document boundary for the Noah/Eve site. APIs, assets, stored work and
// other hardware/campus hosts have their own routing and authorization.
export const MAIN_PAGE_PATHS = [
  '/', '/noah', '/noah/my', '/noah/activity', '/noah/saved',
  '/noah/profile', '/noah/preferences', '/noah/help', '/noah/guides/cowagent-mac', '/noah/usage',
  '/noah/engineering', '/noah/engineering/combinations', '/noah/combinations',
  '/noah/agents/new', '/noah/agents/verified', '/noah/discover/agent', '/noah/ready/agent',
  '/noah/registration', '/noah/registration/browser', '/noah/publisher',
  '/noah/publish', '/noah/register', '/noah/developers',
  '/noah/devices', '/noah/network', '/noah/free-cloud', '/noah/linux', '/noah/esim',
  '/noah/mac/connect', '/noah/account', '/noah/purchases', '/noah/marketplace', '/noah/sell',
  '/noah/add', '/noah/add/data', '/noah/outbox', '/noah/my/cloud-results',
  '/noah/coconala/agent', '/noah/revenue-pack', '/noah/first-earning',
  '/noah/review', '/noah/review/intake', '/noah/review/business',
  '/noah/review/teikibin', '/noah/review/pins',
  '/os/eve', '/os/eve/remix', '/os/eve/combinations', '/account', '/account/import/pro',
  '/settings', '/settings/system', '/rockstaros/guide',
  '/legal', '/privacy', '/signin-with-chatgpt',
];

export const RETIRED_MAIN_PAGE_ROOTS = [
  '/campus', '/fitness', '/fund', '/csv', '/income', '/market', '/wallet',
  '/rocket-star', '/crowdfunding', '/preorder', '/zema/compose',
  '/sky/campus', '/os/sky/campus',
  '/noah/billing', '/noah/compute-grid', '/noah/citations',
  '/noah/visual-scribe', '/noah/add/zoom', '/noah/resale', '/noah/teikibin',
];

export const MAIN_DISCOVERY_PATHS = [
  '/', '/noah', '/noah/guides/cowagent-mac', '/noah/help', '/noah/engineering',
  '/noah/combinations', '/legal/', '/privacy/',
];

const exact = new Set(MAIN_PAGE_PATHS);
const below = (path, root) => path === root || path.startsWith(root + '/');
const dynamic = /^\/noah\/(?:agents|boards|code|combinations|feedback|invites|library|releases|tasks|tools)\/[^/]+$/;

export function normalizedMainPath(path) {
  try { return decodeURIComponent(path).replace(/\/+$/, '') || '/'; }
  catch { return null; }
}

// Call with the resolved legacy destination, so an old alias cannot expose a
// retired screen. Keep exact segment boundaries (e.g. /fitness is not /fitness2).
export function mainPageStatus(pathname) {
  const path = normalizedMainPath(pathname);
  if (!path) return 404;
  if (RETIRED_MAIN_PAGE_ROOTS.some(root => below(path, root))) return 410;
  if (exact.has(path) || dynamic.test(path) || /^\/(?:noah\/engineering|os\/eve)\/combinations\/[^/]+$/.test(path)) return 200;
  // Device claim callbacks and existing installation/deep-link handoffs.
  if (below(path, '/connect') || path === '/install') return 200;
  // These are not documents governed by this policy. Preserve all existing
  // authorization, streaming, callbacks, static assets and other products.
  if (below(path, '/api') || below(path, '/_next') || below(path, '/.well-known') ||
      path.startsWith('/MATOU') || ['/pro', '/mini', '/create', '/avocado-mini'].includes(path) ||
      path === '/offline.html' || /\.(?:js|mjs|css|map|json|xml|txt|vtt|webmanifest|wasm|png|jpg|jpeg|gif|svg|webp|avif|ico|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf|zip|sha256)$/.test(path)) return null;
  return 404;
}

export function mainPageUnavailable(status, method = 'GET') {
  return new Response(method === 'HEAD' ? null :
    (status === 410 ? 'このページの公開は終了しました。' : 'ページが見つかりません。') + '\nNoah: https://avoado.si/noah\n', {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}
