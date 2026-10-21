import assert from 'node:assert/strict';
import test from 'node:test';

const { evaluateSkyAddZoomOwnerBinding, macZoomUserId, macZoomLaunchContext } = await import('../lib/sky-add-owner-binding.server.ts');
const nowMs = 1_750_000_000_000;
const serverSecret = 'a-local-test-only-hmac-secret-with-32-bytes';
const launch = { type: 'meeting', zoomUserId: 'zoom-user-A', createdAtMs: nowMs - 1000,
  expiresAtMs: nowMs + 60_000, meetingUuid: 'meeting-A' };
const hostAppId = 'zoom-sky-add-dev';

async function fixture(overrides = {}) {
  const link = {
    hostAppId,
    hostUserMac: await macZoomUserId(hostAppId, launch.zoomUserId, serverSecret),
    launchContextMac: await macZoomLaunchContext(hostAppId, launch, serverSecret),
    skyOwnerUserId: 'sky-owner-A',
    allowedContextTypes: ['meeting'],
    issuedAtMs: nowMs - 1000,
    expiresAtMs: nowMs + 30_000,
    revokedAtMs: null,
  };
  return { verifiedLaunch: launch, hostAppId, serverSecret,
    authenticatedSkyOwnerUserId: 'sky-owner-A', link, nowMs, ...overrides };
}

void test('matching short-lived binding remains only eligible for later checks', async () => {
  assert.equal(await evaluateSkyAddZoomOwnerBinding(await fixture()), 'ready-for-capability-check');
  assert.notEqual(await macZoomUserId(hostAppId, 'zoom-user-B', serverSecret),
    await macZoomUserId(hostAppId, launch.zoomUserId, serverSecret));
});

void test('rejects different Sky owner or Zoom user', async () => {
  assert.equal(await evaluateSkyAddZoomOwnerBinding(await fixture({ authenticatedSkyOwnerUserId: 'sky-owner-B' })),
    'account-link-required');
  assert.equal(await evaluateSkyAddZoomOwnerBinding(await fixture({ verifiedLaunch: { ...launch, zoomUserId: 'zoom-user-B' } })),
    'host-user-mismatch');
});

void test('rejects app, surface, expiry and revocation changes', async () => {
  assert.equal(await evaluateSkyAddZoomOwnerBinding(await fixture({ hostAppId: 'another-app' })), 'host-app-mismatch');
  assert.equal(await evaluateSkyAddZoomOwnerBinding(await fixture({ verifiedLaunch: { ...launch, type: 'chat' } })),
    'host-context-mismatch');
  assert.equal(await evaluateSkyAddZoomOwnerBinding(await fixture({ verifiedLaunch: { ...launch, meetingUuid: 'meeting-B' } })),
    'host-context-mismatch');
  assert.equal(await evaluateSkyAddZoomOwnerBinding(await fixture({ nowMs: nowMs + 30_000 })),
    'host-session-expired');
  const overlong = await fixture();
  overlong.link.expiresAtMs = nowMs + 6 * 60_000;
  assert.equal(await evaluateSkyAddZoomOwnerBinding(overlong), 'host-session-expired');
  const revoked = await fixture();
  revoked.link.revokedAtMs = nowMs - 100;
  assert.equal(await evaluateSkyAddZoomOwnerBinding(revoked), 'host-session-revoked');
});
