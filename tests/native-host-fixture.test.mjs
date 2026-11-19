import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nodeServiceFixture } from '../packages/rockstaros-runtime/test/helpers/node-service-fixture.mjs';

void test('native host gate keeps actual auth and revocation in the same SQLite file across reopen',async t=>{
  const f=await nodeServiceFixture(t,{persisted:true});
  const request=await f.link.begin('Synthetic persistence test');
  await f.link.approve(request.userCode,'synthetic-owner');
  const session=await f.link.poll(request.deviceCode);assert.equal(session.status,'authorized');
  f.reopenDatabase();assert.equal((await f.link.identity(session.accessToken)).id,session.deviceId);
  assert.equal((await readFile(join(f.directory,'fixture.sqlite'))).includes(Buffer.from(session.accessToken)),false);
  assert.equal(await f.link.revoke('synthetic-owner',session.deviceId),true);
  f.reopenDatabase();await assert.rejects(f.link.identity(session.accessToken),/UNAUTHORIZED/);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM rockstar_device_sessions').get().n,1);
});
