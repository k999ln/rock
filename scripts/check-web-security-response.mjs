import { readFileSync } from 'node:fs';
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

const request = async (path) => {
  const response = await fetch(new URL(path, base), {
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) {
    throw new Error(`web-security-response: ${path} HTTP ${response.status}`);
  }
  for (const [key, value] of Object.entries(policy.universalHeaders)) {
    exactHeader(response, key, value, path);
  }
  return response;
};

const home = await request('/');
await request('/sky');
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
  start_url: '/',
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
const requiredIcons = [
  { src: '/rock-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/rock-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/rock-icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
];
for (const required of requiredIcons) {
  const icon = manifestBody.icons?.find((candidate) => candidate.src === required.src);
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

console.log(
  JSON.stringify({
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
  }),
);
