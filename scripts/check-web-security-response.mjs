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
    routes: ['/', '/sky', '/sw.js', '/manifest.webmanifest', staticAsset],
  }),
);
