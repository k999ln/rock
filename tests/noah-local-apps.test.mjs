import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { noahLocalAppMiddleware } from '../scripts/noah-local-apps.mjs';
async function call({ path = 'connect', origin = 'http://127.0.0.1:3107', host = '127.0.0.1:3107', remote = '127.0.0.1', method = 'POST', body = '{}', site = 'same-origin' } = {}) {
  let started = 0, stopped = 0, data, status;
  const manager = { connect: async () => { started++; return { state: 'onboarding_open' }; }, disconnect: async () => { stopped++; return { state: 'stopped' }; }, status: () => ({ state: 'stopped' }) };
  const req = Readable.from([Buffer.from(body)]); Object.assign(req, { url: `/__noah/local-apps/anicca/${path}`, method, headers: { origin, host, 'sec-fetch-site': site }, socket: { remoteAddress: remote } });
  const response = { writeHead(code) { status = code; }, end(raw) { data = JSON.parse(raw); } };
  await noahLocalAppMiddleware(manager, 3107)(req, response, () => {}); return { status, data, started, stopped };
}
void test('local app starts only through same-host loopback POST with no client command', async () => {
  assert.equal((await call()).started, 1);
  for (const args of [{ origin: 'https://evil.example.com' }, { host: 'evil.example.com:3107' }, { remote: '192.168.1.2' }, { site: 'cross-site' }]) {
    const r = await call(args); assert.equal(r.status, 403); assert.equal(r.started, 0);
  }
  assert.equal((await call({ body: '{"command":"rm"}' })).status, 400);
  assert.equal((await call({ body: 'x'.repeat(65) })).status, 413);
  assert.equal((await call({ path: 'unknown' })).status, 404);
  assert.equal((await call({ method: 'GET' })).status, 405);
});
void test('status is read only and disconnect invokes only the owned manager', async () => {
  const status = await call({ path: 'status', method: 'GET' }); assert.equal(status.status, 200); assert.equal(status.started, 0);
  const stop = await call({ path: 'disconnect' }); assert.equal(stop.stopped, 1); assert.equal(stop.started, 0);
});
