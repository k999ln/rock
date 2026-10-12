import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import worker from '../services/operator-dock/src/worker.ts';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

void test('operator management is absent from the user OS application routes', () => {
  for (const path of [
    'app/operator/page.tsx',
    'app/api/operator/devices/route.ts',
    'components/operator-console.tsx',
    'components/operator-console.module.css',
  ])
    assert.equal(existsSync(new URL(path, root)), false, path);
  assert.doesNotMatch(read('app/page.tsx'), /operator/i);
});

void test('the separate Operator Dock authenticates before every asset and API request', () => {
  const config = JSON.parse(read('services/operator-dock/wrangler.jsonc'));
  assert.equal(config.name, 'avocado-operator-dock');
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.d1_databases[0].database_name, 'avocado-operator-dock');
  const worker = read('services/operator-dock/src/worker.ts');
  assert.ok(worker.indexOf('authorizeOperator(request, env)') < worker.indexOf('env.ASSETS.fetch(request)'));
  const html = read('services/operator-dock/public/index.html');
  assert.doesNotMatch(html, /ホームへ|href="\/"/u);
  assert.match(html, /OPERATOR DOCK/u);
});

void test('an unauthenticated page request cannot reach private Dock assets', async () => {
  let assetRequests = 0;
  const response = await worker.fetch(new Request('https://operator.example/'), {
    ASSETS: {
      fetch() {
        assetRequests += 1;
        return Promise.resolve(new Response('private dock asset'));
      },
    },
    DB: {},
  });

  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'Not found');
  assert.equal(assetRequests, 0);
});
