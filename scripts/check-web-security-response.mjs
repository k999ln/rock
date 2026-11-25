import { securityInputHashes, WEB_SECURITY_EVIDENCE_PATH } from './web-security-evidence.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(readFileSync(resolve(root, 'data/web-security-policy.json'), 'utf8'));
const requestedBase = process.argv[2] || 'http://127.0.0.1:8787';
const base = new URL(requestedBase);

if (
  !(
    base.protocol === 'https:' ||
    (base.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(base.hostname))
  )
) {
  throw new Error('web-security-response: HTTPSまたはloopback HTTPだけを検査できます');
}
if (base.username || base.password || base.search || base.hash) {
  throw new Error('web-security-response: credential/query/fragmentをURLへ含めないでください');
}

const exactHeader = (response, key, expected, path) => {
  const actual = response.headers.get(key);
  if (actual !== expected) {
    throw new Error(`web-security-response: ${path} ${key} expected=${expected} actual=${actual}`);
  }
};

const request = async (path, redirectTo = null) => {
  const response = await fetch(new URL(path, base), {
    cache: 'no-store',
    redirect: 'manual',
  });
  if (redirectTo) {
    const expectedLocation = new URL(redirectTo, base).href;
    if (response.status !== 308 || response.headers.get('location') !== expectedLocation)
      throw new Error(`web-security-response: ${path} must redirect within the same origin to ${expectedLocation}`);
  } else if (!response.ok) {
    throw new Error(`web-security-response: ${path} HTTP ${response.status}`);
  }
  for (const [key, value] of Object.entries(policy.universalHeaders)) {
    exactHeader(response, key, value, path);
  }
  return response;
};

const home = await request('/');
const localOrigin = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
const usesOsAlias = base.hostname === 'avoado.si' || base.hostname.endsWith('.avoado.si') ||
  localOrigin;
const unifiedNoah = base.hostname === 'avoado.si' || localOrigin;
await request('/sky', unifiedNoah ? '/noah' : usesOsAlias ? '/os/sky' : '/');
const worker = await request('/sw.js');
for (const [key, value] of Object.entries(policy.routeHeaders['/sw.js'])) {
  exactHeader(worker, key, value, '/sw.js');
}
const manifest = await request('/manifest.webmanifest');
for (const [key, value] of Object.entries(policy.routeHeaders['/manifest.webmanifest'])) {
  exactHeader(manifest, key, value, '/manifest.webmanifest');
}
const manifestBody = await manifest.json();
for (const [key, expected] of Object.entries({
  id: '/',
  start_url: '/noah',
  scope: '/',
  display: 'standalone',
  lang: 'ja',
  dir: 'ltr',
  prefer_related_applications: false,
})) {
  if (manifestBody[key] !== expected) {
    throw new Error(
      `web-security-response: manifest ${key} expected=${expected} actual=${manifestBody[key]}`,
    );
  }
}
const noahIcon = { src: '/brand/noah-icon-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any' };
const requiredIcons = [
  noahIcon,
  { src: '/rock-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/rock-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/rock-icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
];
for (const required of requiredIcons) {
  // Legacy OS assets stay measured, but the public manifest now belongs to Noah.
  const icon = required === noahIcon ? manifestBody.icons?.find((candidate) => candidate.src === required.src) : required;
  for (const [key, expected] of Object.entries(required)) {
    if (icon?.[key] !== expected) {
      throw new Error(
        `web-security-response: manifest icon ${required.src} ${key} expected=${expected} actual=${icon?.[key]}`,
      );
    }
  }
  const response = await request(required.src);
  if (!(response.headers.get('Content-Type') || '').toLowerCase().startsWith(required.type)) {
    throw new Error(
      `web-security-response: ${required.src} Content-Type expected=${required.type} actual=${response.headers.get('Content-Type')}`,
    );
  }
}

const html = await home.text();
const staticAsset = html.match(/\/_next\/static\/[^"'<>\s]+\.js/)?.[0];
if (!staticAsset) throw new Error('web-security-response: homeからhash付きJSを検出できません');
const staticResponse = await request(staticAsset);
for (const [key, value] of Object.entries(policy.routeHeaders['/_next/static/*'])) {
  exactHeader(staticResponse, key, value, staticAsset);
}

let evePwa;
if (localOrigin) {
  const eveManifestPath = '/connect/eve.webmanifest';
  const eveResponse = await request(eveManifestPath);
  if (!eveResponse.headers.get('content-type')?.startsWith('application/manifest+json'))
    throw new Error('web-security-response: Eve manifest content type');
  const eve = await eveResponse.json();
  if (manifestBody.name !== 'Noah' || eve.name !== 'Eve' || eve.short_name !== 'Eve' ||
      eve.id !== '/os/eve' || eve.start_url !== '/os/eve' || eve.display !== 'standalone')
    throw new Error('web-security-response: Eve or Noah manifest identity');
  const pages = ['/connect/done', '/os/eve'];
  for (const path of pages) {
    const page = await request(path);
    const tags = [...(await page.text()).matchAll(/<link\b[^>]*\brel="manifest"[^>]*>/gi)];
    if (tags.length !== 1 || !tags[0][0].includes(`href="${eveManifestPath}"`))
      throw new Error(`web-security-response: ${path} must reference only the Eve manifest`);
  }
  evePwa = { manifest: eveManifestPath, pages };
}

const result = {
    schema: 'rockstaros-web-security-response-check/1',
    status: 'PASS',
    baseOrigin: base.origin,
    universalHeaders: Object.keys(policy.universalHeaders).length,
    routes: [
      '/',
      '/sky',
      '/sw.js',
      '/manifest.webmanifest',
      ...requiredIcons.map(({ src }) => src),
      staticAsset,
    ],
    ...(evePwa ? { evePwa } : {}),
};
if (process.argv.includes('--record-local-production')) {
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1') throw new Error('Local production evidence requires an IPv4 loopback origin');
  const config = JSON.parse(readFileSync(resolve(root, 'dist/server/wrangler.json'), 'utf8'));
  if (!config.main || !config.assets) throw new Error('Production Worker build is required');
  writeFileSync(resolve(root, WEB_SECURITY_EVIDENCE_PATH), JSON.stringify({
    schema: 'rockstaros-web-security-response-evidence/1', observedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    scope: 'LOCAL_PRODUCTION_BUILD_NOT_SITES_DEPLOYMENT', server: { runtime: 'wrangler-local', origin: base.origin, productionBuild: true },
    inputs: securityInputHashes(root), result,
    boundary: { sitesDeploymentVerified: false, nextAction: 'Verify the authorized public deployment separately.' },
  }, null, 2) + '\n');
}
console.log(JSON.stringify(result));
