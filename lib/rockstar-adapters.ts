/** Wire compatibility and observation only. Never grants identity, budget or hardware acceptance. */
export type AdapterDescriptor = {
  schema: 'rockstaros.adapter/1'; id: string; role: 'host' | 'executor' | 'output';
  version: string; protocols: number[]; platform: string;
  observedAt: number; expiresAt: number; capabilities: Record<string, boolean | null>;
};
export class AdapterError extends Error {
  code: string;
  constructor(code: string) { super(code); this.name = 'AdapterError'; this.code = code; }
}
const fail = (condition: unknown, code: string) => { if (!condition) throw new AdapterError(code); };
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
export function parseAdapterDescriptor(value: unknown, now: number): AdapterDescriptor {
  fail(object(value), 'INVALID_ADAPTER'); const v = value as Record<string, unknown>;
  const keys = ['schema', 'id', 'role', 'version', 'protocols', 'platform', 'observedAt', 'expiresAt', 'capabilities'];
  fail(Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)), 'INVALID_ADAPTER');
  fail(v.schema === 'rockstaros.adapter/1' && id(v.id) && ['host', 'executor', 'output'].includes(String(v.role)) &&
    typeof v.version === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v.version) &&
    ['web', 'android', 'linux', 'macos', 'windows', 'ios', 'ipados', 'firmware'].includes(String(v.platform)) &&
    Array.isArray(v.protocols) && v.protocols.length > 0 && v.protocols.length <= 8 && new Set(v.protocols).size === v.protocols.length && v.protocols.every(n => integer(n) && n > 0), 'INVALID_ADAPTER');
  fail(integer(now) && integer(v.observedAt) && integer(v.expiresAt) && v.observedAt <= now && now < v.expiresAt && v.expiresAt - v.observedAt <= 30000, 'STALE_ADAPTER');
  fail(object(v.capabilities) && Object.keys(v.capabilities).length <= 64 && Object.entries(v.capabilities).every(([k, b]) => id(k) && [true, false, null].includes(b as boolean | null)), 'INVALID_CAPABILITIES');
  return structuredClone(v) as AdapterDescriptor;
}
export function negotiateTextAdapters(host: unknown, executor: unknown, output: unknown, now: number) {
  return negotiateCapabilityAdapters(host, executor, output, {
    host: ['identity.owner-local', 'store.cas'], executor: ['text.generate', 'model.pin'], output: ['output.text'],
  }, now);
}
/** Compatibility only. Actual dispatch keeps the existing owner, approval, budget and workflow checks. */
export function negotiateCapabilityAdapters(host: unknown, executor: unknown, output: unknown,
  requirements: Record<AdapterDescriptor['role'], readonly string[]>, now: number) {
  const descriptors = [host, executor, output].map(v => parseAdapterDescriptor(v, now));
  const roles = ['host', 'executor', 'output'] as const;
  fail(object(requirements) && Object.keys(requirements).length === 3 && roles.every(role =>
    Array.isArray(requirements[role]) && requirements[role].length > 0 && requirements[role].length <= 16 && requirements[role].every(id)), 'INVALID_CAPABILITIES');
  descriptors.forEach((d, i) => {
    fail(d.role === roles[i], 'ADAPTER_ROLE_MISMATCH');
    fail(d.protocols.includes(1), 'NO_COMMON_PROTOCOL');
    fail(requirements[roles[i]].every(k => d.capabilities[k] === true), 'CAPABILITY_UNAVAILABLE');
  });
  return Object.freeze({ schema: 'rockstaros.negotiated-adapters/1', protocol: 1,
    hostId: descriptors[0].id, executorId: descriptors[1].id, outputId: descriptors[2].id,
    expiresAt: Math.min(...descriptors.map(d => d.expiresAt)), authorizationGranted: false, physicalAcceptance: false });
}
export function describeAdapter(id: string, role: AdapterDescriptor['role'], platform: string,
  capabilities: AdapterDescriptor['capabilities'], now = Date.now()): AdapterDescriptor {
  return parseAdapterDescriptor({ schema: 'rockstaros.adapter/1', id, role, version: '1.0.0', protocols: [1], platform,
    observedAt: now, expiresAt: now + 30000, capabilities }, now);
}
