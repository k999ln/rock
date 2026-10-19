import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSkyAddCapabilityEnvelope } from '../lib/sky-add-capability-envelope.ts';

const fit = { surface: 'zoom.meeting.panel', inputSource: 'manual.text', returnSlot: 'embedded.private' };
const candidate = {
  agentId: 'fixture.notes/1',
  hostAppId: 'fixture.zoom.app',
  purposeId: 'manual-notes',
  fits: [fit],
  requiredScopes: [],
  requiredDataClasses: ['manual.text'],
  requiredSdkMethods: [],
};
const envelope = {
  hostAppId: 'fixture.zoom.app',
  appVersion: '1',
  disclosedPurposeIds: ['manual-notes'],
  approvedScopes: [],
  approvedDataClasses: ['manual.text'],
  approvedFits: [fit],
};
const grant = { hostAppId: 'fixture.zoom.app', appVersion: '1', scopes: [], supportedSdkMethods: [], userContextStatus: 'authorized', expiresAtEpochMs: 2000 };
const base = { candidate, requestedFit: fit, envelope, grant, nowEpochMs: 1000 };

void test('Sky Add discovery returns a candidate only inside the declared host envelope', () => {
  assert.equal(evaluateSkyAddCapabilityEnvelope(base), 'candidate-only');
  assert.equal(evaluateSkyAddCapabilityEnvelope({ ...base, envelope: null }), 'host-app-update-required');
  assert.equal(evaluateSkyAddCapabilityEnvelope({ ...base, candidate: { ...candidate, purposeId: 'future-media' } }), 'host-app-update-required');
  assert.equal(evaluateSkyAddCapabilityEnvelope({ ...base, candidate: { ...candidate, requiredDataClasses: ['host.meeting-transcript'] } }), 'host-app-update-required');
  assert.equal(evaluateSkyAddCapabilityEnvelope({ ...base, requestedFit: { ...fit, returnSlot: 'host.chat-message' } }), 'host-app-update-required');
});

void test('new Zoom scopes require App review before a user grant can make the candidate available', () => {
  const scopedCandidate = { ...candidate, requiredScopes: ['meeting:read'] };
  assert.equal(evaluateSkyAddCapabilityEnvelope({ ...base, candidate: scopedCandidate, grant: { ...grant, scopes: ['meeting:read'] } }), 'host-app-update-required');
  assert.equal(evaluateSkyAddCapabilityEnvelope({ ...base, candidate: scopedCandidate, envelope: { ...envelope, approvedScopes: ['meeting:read'] } }), 'host-reauthorization-required');
});

void test('missing, expired, and version-mismatched host grants do not pass discovery', () => {
  assert.equal(evaluateSkyAddCapabilityEnvelope({ ...base, grant: null }), 'host-session-required');
  assert.equal(evaluateSkyAddCapabilityEnvelope({ ...base, grant: { ...grant, expiresAtEpochMs: 1000 } }), 'host-session-required');
  assert.equal(evaluateSkyAddCapabilityEnvelope({ ...base, grant: { ...grant, appVersion: '0' } }), 'host-session-required');
  assert.equal(evaluateSkyAddCapabilityEnvelope({ ...base, grant: { ...grant, userContextStatus: 'authenticated' } }), 'host-session-required');
});

void test('role-dependent SDK methods are checked separately from OAuth scopes', () => {
  const chatCandidate = { ...candidate, requiredSdkMethods: ['sendMessageToChat'] };
  assert.equal(evaluateSkyAddCapabilityEnvelope({ ...base, candidate: chatCandidate }), 'host-action-unavailable');
  assert.equal(evaluateSkyAddCapabilityEnvelope({ ...base, candidate: chatCandidate, grant: { ...grant, supportedSdkMethods: ['sendMessageToChat'] } }), 'candidate-only');
});
