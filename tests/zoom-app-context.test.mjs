import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyZoomAppContextHeader } from '../lib/zoom-app-context.server.ts';
import { inspectZoomHomeLaunch } from '../lib/sky-add-zoom-launch.server.ts';

const secret = 'fixture-zoom-secret';

async function makeHeader(claims) {
  const iv = Uint8Array.from({ length: 12 }, (_, index) => index + 1);
  const aad = new TextEncoder().encode('fixture');
  const keyDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey('raw', keyDigest, 'AES-GCM', false, ['encrypt']);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
    key, new TextEncoder().encode(JSON.stringify(claims))));
  const buffer = new Uint8Array(1 + iv.length + 2 + aad.length + 4 + encrypted.length);
  const view = new DataView(buffer.buffer);
  let offset = 0;
  view.setUint8(offset++, iv.length);
  buffer.set(iv, offset); offset += iv.length;
  view.setUint16(offset, aad.length, true); offset += 2;
  buffer.set(aad, offset); offset += aad.length;
  view.setUint32(offset, encrypted.length - 16, true); offset += 4;
  buffer.set(encrypted, offset);
  return Buffer.from(buffer).toString('base64url');
}

void test('Zoom context preserves breakout and parent meeting UUIDs', async () => {
  const header = await makeHeader({ typ: 'meeting', uid: 'zoom-user', mid: 'breakout-uuid', pid: 'main-meeting-uuid', ts: 900, exp: 2000 });
  const verified = await verifyZoomAppContextHeader(header, secret, 1000);
  assert.equal(verified.meetingUuid, 'breakout-uuid');
  assert.equal(verified.parentMeetingUuid, 'main-meeting-uuid');
  assert.equal(verified.zoomUserId, 'zoom-user');
});

void test('guest context without uid cannot be linked to a Sky owner', async () => {
  const header = await makeHeader({ typ: 'meeting', mid: 'meeting-uuid', ts: 900, exp: 2000 });
  await assert.rejects(verifyZoomAppContextHeader(header, secret, 1000), { name: 'ZoomAppContextError' });
});

void test('Zoom Home presentation exposes only context status and type', async () => {
  const header = await makeHeader({ typ: 'meeting', uid: 'private-zoom-user', mid: 'private-meeting', ts: 900, exp: 2000 });
  assert.deepEqual(await inspectZoomHomeLaunch(null, secret, 1000), { status: 'browser-demo' });
  assert.deepEqual(await inspectZoomHomeLaunch(header, undefined, 1000), { status: 'secret-unconfigured' });
  assert.deepEqual(await inspectZoomHomeLaunch(header, 'wrong-secret', 1000), { status: 'invalid-context' });
  assert.deepEqual(await inspectZoomHomeLaunch(header, secret, 1000), { status: 'verified-context', contextType: 'meeting' });
  assert.deepEqual(await inspectZoomHomeLaunch(header, secret, 2000), { status: 'invalid-context' });
});
