import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { noahRunnerRequestAllowed } from '../lib/noah-runner-access.ts';

const origin = 'https://avoado.si';
void test('Noah browser pairs a Mac without membership; grant is private, bounded, single-use and revocable', { timeout: 60000 }, async t => {
  const { outputFiles } = await build({ stdin: { contents: `
    import {env} from 'cloudflare:workers';
    import {requestUser} from './lib/request-auth.ts';
    import {noahSessionApi} from './lib/noah-session-server.ts';
    import {createNoahDevicePairing} from './lib/noah-device-pairing.ts';
    import {rockstarDeviceLinkStore} from './lib/rockstar-device-link.ts';
    export default {async fetch(request){
      const path=new URL(request.url).pathname;
      if(path==='/api/noah/session')return noahSessionApi()(request);
      if(path.startsWith('/api/noah/devices'))return createNoahDevicePairing(env.DB,requestUser)(request);
      try {
        if(path==='/legacy-store')return Response.json({owner:await rockstarDeviceLinkStore(env.DB).authenticate(request.headers.get('authorization').slice(7))});
        return Response.json({owner:await requestUser(request)});
      }catch{return Response.json({denied:true},{status:401});}
    }};`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['cloudflare:workers', 'node:*'] });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-04-01', compatibilityFlags: ['nodejs_compat'], script: outputFiles[0].text,
    d1Databases: { DB: 'pairing' }, bindings: { NOAH_PROFILE_KEYS: JSON.stringify({ active: 'a', keys: { a: randomBytes(32).toString('hex') } }) } }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const schema = readFileSync(new URL('../drizzle/0021_sites_schema_convergence.sql', import.meta.url), 'utf8');
  for (const table of ['rockstar_device_authorizations', 'rockstar_device_sessions']) {
    const sql = schema.match(new RegExp('CREATE TABLE IF NOT EXISTS `' + table + '` \\([\\s\\S]*?\\);'))[0];
    await db.prepare(sql).run();
  }
  const send = (path, { body, cookie, token, source = origin, method } = {}) => mf.dispatchFetch(origin + path, {
    method: method ?? (body ? 'POST' : 'GET'), headers: {
      ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(source ? { Origin: source } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const browser = async () => {
    const reply = await send('/api/noah/session', { body: {} }); assert.equal(reply.status, 200);
    return reply.headers.get('set-cookie').split(';')[0];
  };
  const cookie = await browser(), other = await browser();
  const start = await send('/api/noah/devices/pair', { body: { action: 'begin', deviceName: 'Noah Mac Runner' }, source: null });
  assert.equal(start.status, 201); const grant = await start.json(); assert.match(grant.deviceCode, /^noah_device_/);
  assert.match(grant.verificationUriComplete, /\/noah\/mac\/connect\?user_code=/);
  const decision = { action: 'approve', userCode: grant.userCode };
  assert.equal((await send('/api/noah/devices', { body: decision })).status, 401);
  assert.equal((await send('/api/noah/devices', { body: decision, cookie, source: 'https://other.test' })).status, 403);
  const inspection = await send('/api/noah/devices?user_code=' + grant.userCode, { cookie });
  assert.equal((await inspection.json()).authorization.clientName, 'Noah Mac Runner');
  assert.equal((await send('/api/noah/devices', { body: decision, cookie })).status, 200);
  assert.equal((await send('/api/noah/devices', { body: decision, cookie: other })).status, 404);
  const polled = await send('/api/noah/devices/pair', { body: { action: 'poll', deviceCode: grant.deviceCode }, source: null });
  const result = await polled.json(); assert.equal(result.status, 'authorized'); assert.match(result.accessToken, /^noah_runner_/);
  const token = result.accessToken;
  for (const path of ['/api/noah/launch', '/api/noah/agents/' + randomUUID(), '/api/noah/releases'])
    assert.equal((await send(path, { token, source: null })).status, 200);
  assert.equal((await send('/api/noah/runner', { token, body: {}, source: null })).status, 200);
  assert.equal((await send('/api/noah/runner', { cookie, body: {} })).status, 401);
  for (const path of ['/legacy-store', '/api/os/access', '/api/billing', '/api/noah/profile', '/api/noah/review', '/api/noah/devices', '/api/eve/runtime', '/api/rockstar/device-sessions'])
    assert.equal((await send(path, { token, source: null })).status, 401, path);
  assert.equal((await send('/api/noah/launch', { token, body: {}, source: null })).status, 401);
  assert.equal((await send('/api/noah/runner', { token, body: {} })).status, 401);
  assert.equal((await (await send('/api/noah/devices/pair', { body: { action: 'poll', deviceCode: grant.deviceCode }, source: null })).json()).status, 'access_denied');
  assert.equal((await (await send('/api/noah/devices', { cookie: other })).json()).sessions.length, 0);
  const sessions = (await (await send('/api/noah/devices', { cookie })).json()).sessions;
  assert.equal(sessions.length, 1);
  assert.equal((await send('/api/noah/devices', { body: { action: 'revoke', id: sessions[0].id }, cookie: other })).status, 404);
  assert.equal((await send('/api/noah/devices', { body: { action: 'revoke', id: sessions[0].id }, cookie })).status, 200);
  assert.equal((await send('/api/noah/launch', { token, source: null })).status, 401);
});

void test('runner route scope excludes mutations, credentials, encoded alternate routes and browser origins', () => {
  for (const [path, method] of [['/api/noah/launch','POST'],['/api/noah/agents','POST'],['/api/noah/releases/x/source/more','GET'],['/api/noah/runner','GET'],['/api/noah/review','GET'],['/api/noah/%72unner','POST']])
    assert.equal(noahRunnerRequestAllowed(new Request(origin + path, { method })), false);
  assert.equal(noahRunnerRequestAllowed(new Request(origin + '/api/noah/runner', { method:'POST', headers:{Origin:origin} })), false);
});
