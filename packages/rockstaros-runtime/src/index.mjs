export { parseSkyObjectAttachment, skyObjectRequirements, negotiateSkyObjectAttachment } from '../../../lib/sky-object-attachment.ts';
export { observeSmisPixels, parseSmisVisualFingerprint, parseSmisVisualReference, matchSmisVisualObservation, smisVisualSimilarity } from '../../../lib/smis-visual-input.ts';
export { createSmisInputSession } from '../../../lib/smis-input-session.ts';
export { createSmisModuleSession, decodeMicrobitMotion, smisModuleRequestSuffix, SMIS_MODULE_MAX_AGE } from '../../../lib/smis-module-session.ts';
export { guardSmisModuleWorkPort, reviewSmisObjectPurpose } from '../../../lib/smis-module-work-port.ts';
export { smisObjectNeeds, suggestSmisObjectNeeds, assessSmisObjectPurpose, smisObjectPurposeRequest } from '../../../lib/smis-object-purpose.ts';
export { createEveInteractionSession, eveInteractionCommand, EVE_INTERACTION_PENDING } from '../../../lib/rockstar-eve-interaction.ts';
export { createLinkedTextWorker } from './linked-worker.mjs';
export { parseLinkedPresence } from '../../../lib/rockstar-linked-execution.ts';
export { parseLinuxAgent } from '../../../lib/sky-linux-record.ts';
import { applyWorkCommand, parseWorkCommand, workId } from '../../../lib/workflow.ts';
export { parseAdapterDescriptor, negotiateTextAdapters, negotiateCapabilityAdapters, describeAdapter, AdapterError } from '../../../lib/rockstar-adapters.ts';
export { createTextExecutor, parseLocalTextRequest, executionDigest, projectTextReceipt, projectPixelTextReceipt, ExecutorError } from './executor.mjs';

export const runtimeContract = Object.freeze({
  schema: 'rockstaros.portable-runtime/1', release: '1.0 Developer Preview',
  delivery: 'existing_os_client', authority: 'existing_authenticated_rockstaros_service',
  billing: 'existing_owner_contract_and_usage_ledger',
  duplicateBaseFeePerDevice: false, includesModelWeights: false,
  includesHardwareDrivers: false, nativeOsImageAccepted: false,
});

export class RuntimeError extends Error {
  constructor(code, status = 0, outcome = 'not_sent') {
    super(code); this.name = 'RuntimeError'; this.code = code;
    this.status = status; this.outcome = outcome;
  }
}
const fail = (condition, code) => { if (!condition) throw new RuntimeError(code); };
const id = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
const platforms = new Set(['linux', 'android', 'windows', 'macos', 'web', 'ios', 'ipados', 'firmware']);

/** Input comes from the host adapter. This observation never authenticates a device or grants a Tool. */
export function diagnoseHardware(snapshot, now = Date.now()) {
  fail(exact(snapshot, ['schema', 'deviceId', 'platform', 'adapterVersion', 'observedAt', 'expiresAt', 'features', 'evidenceKind']), 'INVALID_HARDWARE_OBSERVATION');
  fail(snapshot.schema === 'rockstaros.hardware-observation/1' && id(snapshot.deviceId) &&
    id(snapshot.adapterVersion) && platforms.has(snapshot.platform) &&
    ['synthetic', 'host_observation', 'physical_measurement'].includes(snapshot.evidenceKind) &&
    integer(now) && integer(snapshot.observedAt) && integer(snapshot.expiresAt) &&
    snapshot.observedAt <= now && now < snapshot.expiresAt &&
    snapshot.expiresAt - snapshot.observedAt <= 30000 &&
    object(snapshot.features) && Object.keys(snapshot.features).length <= 64 &&
    Object.entries(snapshot.features).every(([k, v]) => id(k) && [true, false, null].includes(v)), 'STALE_OR_INVALID_HARDWARE');
  const has = key => snapshot.features[key] === true;
  return Object.freeze({ deviceId: snapshot.deviceId, evidenceKind: snapshot.evidenceKind,
    eveHostCandidate: has('network.https') && (has('output.screen') || has('output.audio')),
    localModel: has('compute.local_inference'), spatialDisplay: has('output.spatial'),
    satelliteWifi: has('network.satellite_ip') && has('network.wifi_ap'),
    nativeOsAccepted: false, authorizationGranted: false });
}

/** Shared workflow semantics; the owner-scoped host store must commit with CAS. */
export function reduceEveCommand(job, command, revision, now) {
  const parsed = parseWorkCommand(command);
  fail(['edit_plan', 'cancel', 'complete'].includes(parsed.action), 'PROVIDER_RECEIPT_REQUIRED');
  return applyWorkCommand(job, parsed, revision, now);
}

function serviceOrigin(input) {
  const url = new URL(input);
  fail(!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, 'SERVICE_ORIGIN_REQUIRED');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  fail(url.protocol === 'https:' || (url.protocol === 'http:' && loopback), 'HTTPS_REQUIRED');
  return url.origin;
}

/** No secret is serialized; platform secure storage supplies a token for each request. */
export function createRockstarRuntime({ origin, getSessionToken, fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  const base = serviceOrigin(origin);
  fail(typeof getSessionToken === 'function' && typeof fetchImpl === 'function' &&
    integer(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 120000, 'INVALID_HOST_ADAPTER');
  async function request(path, method = 'GET', value, authenticated = true, maximumBytes = 640000) {
    const headers = new Headers({ Accept: 'application/json' });
    if (path === '/api/rockstar/device-authorizations') headers.set('X-Rockstar-Device-Binding', 'owner-device/v1');
    const encoded = value === undefined ? undefined : JSON.stringify(value);
    fail(encoded === undefined || new TextEncoder().encode(encoded).length <= maximumBytes, 'REQUEST_TOO_LARGE');
    if (authenticated) {
      const token = await getSessionToken();
      fail(typeof token === 'string' && /^rock_session_[A-Za-z0-9_-]{20,256}$/.test(token), 'RECONNECT_REQUIRED');
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (method !== 'GET') { headers.set('Origin', base); headers.set('Content-Type', 'application/json'); }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Never follow redirects carrying device credentials. Never retry a mutation.
      const response = await fetchImpl(`${base}${path}`, { method, headers, body: encoded,
        redirect: 'error', cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw new RuntimeError(response.status === 401 ? 'RECONNECT_REQUIRED' :
        response.status === 409 ? 'REVISION_OR_STATE_CONFLICT' : 'SERVICE_REQUEST_REJECTED', response.status,
        method === 'GET' || response.status < 500 ? 'rejected' : 'unknown');
      fail(response.headers.get('content-type')?.includes('application/json'), 'INVALID_SERVICE_RESPONSE');
      // Bound response size and keep the timeout active until the body has been read.
      const reader = response.body?.getReader();
      fail(reader, 'INVALID_SERVICE_RESPONSE');
      const parts = []; let size = 0;
      try { while (true) {
        const { done, value: bytes } = await reader.read(); if (done) break;
        size += bytes.byteLength;
        if (size > 1000000) { await reader.cancel(); throw new RuntimeError('SERVICE_RESPONSE_TOO_LARGE'); }
        parts.push(bytes);
      } } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (error) {
      if (error instanceof RuntimeError) {
        if (method !== 'GET' && error.outcome === 'not_sent') error.outcome = 'unknown';
        throw error;
      }
      throw new RuntimeError(controller.signal.aborted ? 'TIMEOUT' : 'CONNECTION_OR_RESPONSE_FAILED', 0,
        method === 'GET' ? 'read_failed' : 'unknown');
    } finally { clearTimeout(timer); }
  }
  const queryId = input => { fail(id(input), 'INVALID_ID'); return encodeURIComponent(input); };
  return Object.freeze({
    contract: runtimeContract,
    connection: Object.freeze({
      begin: deviceName => {
        fail(typeof deviceName === 'string' && deviceName.trim().length >= 1 && deviceName.length <= 80, 'INVALID_DEVICE_NAME');
        return request('/api/rockstar/device-authorizations', 'POST', { action: 'begin', deviceName }, false, 2048);
      },
      poll: deviceCode => {
        fail(typeof deviceCode === 'string' && deviceCode.length <= 256 && /^rock_device_[A-Za-z0-9_-]+$/.test(deviceCode), 'INVALID_DEVICE_CODE');
        return request('/api/rockstar/device-authorizations', 'POST', { action: 'poll', deviceCode }, false, 2048);
      },
      sessions: () => request('/api/rockstar/device-sessions'),
      revoke: sessionId => request('/api/rockstar/device-sessions', 'DELETE', { id: queryId(sessionId) }, true, 1024),
    }),
    entitlement: () => request('/api/rockstar/entitlements'),
    sky: Object.freeze({
      // Owner authentication and the saved revision stay in the existing Sky service.
      inspectAgent: agentId => request(`/api/sky/agents?id=${queryId(agentId)}`),
    }),
    eve: Object.freeze({
      list: () => request('/api/eve/history'),
      read: threadId => request(`/api/eve/history?id=${queryId(threadId)}`),
      save: value => {
        fail(exact(value, ['session', 'revision', 'remember']) && integer(value.revision) && typeof value.remember === 'boolean', 'INVALID_HISTORY_SAVE');
        return request('/api/eve/history', 'PUT', value);
      },
      recall: (query, exclude = '') => {
        fail(typeof query === 'string' && query.length <= 2000 && typeof exclude === 'string', 'INVALID_RECALL');
        return request('/api/eve/history', 'POST', { query, exclude });
      },
    }),
    jobs: Object.freeze({
      list: () => request('/api/work-jobs'),
      create: value => request('/api/work-jobs', 'POST', value, true, 12000),
      command: (jobId, revision, command) => {
        workId(jobId);
        fail(integer(revision), 'INVALID_JOB_REVISION');
        const parsed = parseWorkCommand(command);
        fail(['edit_plan', 'cancel', 'complete'].includes(parsed.action), 'PROVIDER_RECEIPT_REQUIRED');
        return request('/api/work-jobs', 'PATCH', { jobId, revision, command: parsed }, true, 12000);
      },
    }),
    executions: Object.freeze({
      inspect: () => request('/api/eve/runtime'),
      read: jobId => request(`/api/eve/runtime?id=${queryId(jobId)}`),
      announce: presence => request('/api/eve/runtime', 'PUT', { action: 'presence', presence }, true, 80000),
      claim: value => request('/api/eve/runtime', 'PUT', { action: 'claim', claim: value }, true, 2000),
      authorize: (jobId, claimId) => request('/api/eve/runtime', 'PUT', { action: 'authorize', id: queryId(jobId), claimId: queryId(claimId) }, true, 2000),
      publish: value => request('/api/eve/runtime', 'PUT', { action: 'report', value }, true, 100000),
      acknowledge: (jobId, claimId) => request('/api/eve/runtime', 'PUT', { action: 'ack', id: queryId(jobId), claimId: queryId(claimId) }, true, 2000),
    }),
    text: Object.freeze({
      quote: input => request('/api/llm/quotes', 'POST', input, true, 28000),
      status: quoteId => request(`/api/llm/quotes/${queryId(quoteId)}`),
      // Approval/reservation stays in the existing first-party confirmation UI/API.
      submitApproved: value => {
        fail(object(value) && value.provider === 'openai' && value.consent === true &&
          id(value.quoteId) && hash(value.approvalDigest) && typeof value.prompt === 'string' &&
          value.prompt.trim().length > 0 && !Object.hasOwn(value, 'baseUrl'), 'APPROVED_QUOTE_REQUIRED');
        return request('/api/llm/text', 'POST', value, true, 28000);
      },
    }),
  });
}
