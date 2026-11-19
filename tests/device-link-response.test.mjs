import test from 'node:test';
import assert from 'node:assert/strict';
import { negotiatedDeviceBinding, deviceAuthorizationResponse } from '../lib/rockstar-device-link.ts';

void test('binding negotiation retains the exact legacy Android response and never relaxes its parser', () => {
  assert.equal(negotiatedDeviceBinding(null), false);
  assert.equal(negotiatedDeviceBinding('owner-device/v1'), true);
  for (const value of ['', 'owner-device/v2', ' owner-device/v1', 'OWNER-device/v1']) assert.throws(() => negotiatedDeviceBinding(value), /DEVICE_BINDING_INVALID/);
  const begin = { deviceCode: 'code', userCode: 'ABCD2345', sessionBinding: 'owner-device/v1', expiresIn: 600, interval: 5 };
  assert.deepEqual(deviceAuthorizationResponse(begin, false), { deviceCode: 'code', userCode: 'ABCD2345', expiresIn: 600, interval: 5 });
  assert.deepEqual(deviceAuthorizationResponse(begin, true), begin);
  const grant = { status: 'authorized', accessToken: 'synthetic', expiresAt: 100, ownerUserId: 'owner', deviceId: 'device' };
  assert.deepEqual(deviceAuthorizationResponse(grant, false), { status: 'authorized', accessToken: 'synthetic', expiresAt: 100, ownerUserId: 'owner' });
  assert.deepEqual(deviceAuthorizationResponse(grant, true), grant);
  assert.deepEqual(deviceAuthorizationResponse({ status: 'access_denied', reason: 'owner_denied' }, false), { status: 'access_denied' });
  assert.deepEqual(deviceAuthorizationResponse({ status: 'access_denied' }, true), { status: 'access_denied' });
  assert.equal(begin.sessionBinding, 'owner-device/v1');
});
