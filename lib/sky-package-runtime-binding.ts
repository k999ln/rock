/** Provider-signed proof that one A2A Agent can execute one exact Sky Package. */
export const SKY_PACKAGE_RUNTIME_BINDING_SCHEMA = 'rockstar-sky-package-runtime-binding/2' as const;
const DOMAIN = new TextEncoder().encode('rockstar-sky-package-runtime-binding-signature/1\0');
const SIGNED_FIELDS = [
  'schema', 'providerId', 'keyId', 'bindingId', 'agentOrigin', 'agentName',
  'agentVersion', 'agentCardSha256', 'packageKey', 'manifestSha256', 'operationId',
  'runtime', 'runtimeExtensionUri', 'inputSchemaSha256', 'outputSchemaSha256', 'pricingVersion',
  'requiredUsage', 'issuedAt', 'expiresAt',
] as const;
const MAX_BINDING_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export type SkyPackageRuntimeBinding = {
  schema: typeof SKY_PACKAGE_RUNTIME_BINDING_SCHEMA;
  providerId: string;
  keyId: string;
  bindingId: string;
  agentOrigin: string;
  agentName: string;
  agentVersion: string;
  agentCardSha256: string;
  packageKey: string;
  manifestSha256: string;
  operationId: string;
  runtime: 'a2a-jsonrpc-1.0';
  runtimeExtensionUri: string;
  inputSchemaSha256: string;
  outputSchemaSha256: string;
  pricingVersion: string;
  requiredUsage: Array<{ meter: string; unit: string }>;
  issuedAt: number;
  expiresAt: number;
  signature: string;
};

export type SkyPackageRuntimeBindingIntent = Pick<SkyPackageRuntimeBinding,
  'agentOrigin' | 'agentName' | 'agentVersion' | 'agentCardSha256' | 'packageKey' |
  'manifestSha256' | 'runtimeExtensionUri' | 'inputSchemaSha256' | 'outputSchemaSha256'>;

type TrustedBindingKey = {
  providerId: string;
  keyId: string;
  agentOrigin: string;
  publicKeyHex: string;
  packagePins: Array<{ packageKey: string; manifestSha256: string }>;
  status: 'active' | 'revoked';
};

export type SkyPackageRuntimeBindingKeyResolver = (identity: {
  providerId: string; keyId: string; agentOrigin: string; packageKey: string; manifestSha256: string;
}) => Promise<Uint8Array | null>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

function sha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function validOrigin(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && url.pathname === '/' &&
      !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

function validExtensionUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      !url.search && !url.hash && url.origin + url.pathname === value;
  } catch { return false; }
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]{86}$/.test(value)) return null;
  try {
    const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/') + '=='), (ch) => ch.charCodeAt(0));
    if (bytes.length !== 64 || btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== value) return null;
    return bytes;
  } catch { return null; }
}

export function skyPackageRuntimeBindingSigningBytes(binding: SkyPackageRuntimeBinding) {
  const payload = new TextEncoder().encode(JSON.stringify(Object.fromEntries(
    SIGNED_FIELDS.map((field) => [field, field === 'requiredUsage'
      ? binding.requiredUsage.map(({ meter, unit }) => ({ meter, unit }))
      : binding[field]]),
  )));
  const bytes = new Uint8Array(DOMAIN.length + payload.length);
  bytes.set(DOMAIN);
  bytes.set(payload, DOMAIN.length);
  return bytes;
}

export async function skyPackageRuntimeBindingDigest(binding: SkyPackageRuntimeBinding) {
  const digest = await crypto.subtle.digest('SHA-256', skyPackageRuntimeBindingSigningBytes(binding));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseTrustedSkyPackageRuntimeBindingKeys(configuration: unknown): TrustedBindingKey[] | null {
  if (typeof configuration !== 'string' || configuration.length > 65_536) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(configuration); } catch { return null; }
  if (!Array.isArray(parsed) || parsed.length > 256) return null;
  const output: TrustedBindingKey[] = [];
  const identities = new Set<string>();
  for (const value of parsed) {
    if (!record(value) || Object.keys(value).length !== 6 ||
      !['providerId', 'keyId', 'agentOrigin', 'publicKeyHex', 'packagePins', 'status'].every((key) => key in value) ||
      !safeId(value.providerId) || !safeId(value.keyId) || !validOrigin(value.agentOrigin) ||
      typeof value.publicKeyHex !== 'string' || !/^[a-f0-9]{64}$/.test(value.publicKeyHex) ||
      !Array.isArray(value.packagePins) || value.packagePins.length < 1 || value.packagePins.length > 256 ||
      value.packagePins.some((pin) => !record(pin) || Object.keys(pin).length !== 2 ||
        typeof pin.packageKey !== 'string' || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+@(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pin.packageKey) ||
        !sha256(pin.manifestSha256)) ||
      new Set(value.packagePins.map((pin) => record(pin) ? `${String(pin.packageKey)}\0${String(pin.manifestSha256)}` : '')).size !== value.packagePins.length ||
      (value.status !== 'active' && value.status !== 'revoked')) return null;
    const identity = `${String(value.providerId)}\0${String(value.keyId)}\0${String(value.agentOrigin)}`;
    if (identities.has(identity)) return null;
    identities.add(identity);
    output.push(value as unknown as TrustedBindingKey);
  }
  return output;
}

export function trustedSkyPackageRuntimeBindingKeyResolver(configuration: unknown): SkyPackageRuntimeBindingKeyResolver {
  const keys = parseTrustedSkyPackageRuntimeBindingKeys(configuration);
  return async (identity) => {
    if (!keys) return null;
    const match = keys.find((key) => key.status === 'active' &&
      key.providerId === identity.providerId && key.keyId === identity.keyId &&
      key.agentOrigin === identity.agentOrigin && key.packagePins.some((pin) =>
        pin.packageKey === identity.packageKey && pin.manifestSha256 === identity.manifestSha256));
    if (!match) return null;
    const bytes = Uint8Array.from(match.publicKeyHex.match(/../g)!.map((byte) => Number.parseInt(byte, 16)));
    return bytes.length === 32 ? bytes : null;
  };
}

export async function verifySkyPackageRuntimeBinding(
  value: unknown,
  intent: SkyPackageRuntimeBindingIntent,
  resolveKey: SkyPackageRuntimeBindingKeyResolver,
  now = Date.now(),
): Promise<SkyPackageRuntimeBinding | null> {
  if (!record(value)) return null;
  const expected = [...SIGNED_FIELDS, 'signature'].sort();
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return null;
  const binding = value as unknown as SkyPackageRuntimeBinding;
  if (binding.schema !== SKY_PACKAGE_RUNTIME_BINDING_SCHEMA ||
    !safeId(binding.providerId) || !safeId(binding.keyId) || !safeId(binding.bindingId) ||
    !validOrigin(binding.agentOrigin) || typeof binding.agentName !== 'string' || !binding.agentName.trim() || binding.agentName.length > 128 ||
    !safeId(binding.agentVersion) || !sha256(binding.agentCardSha256) ||
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)+@(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(binding.packageKey) ||
    !sha256(binding.manifestSha256) || !safeId(binding.operationId) || binding.runtime !== 'a2a-jsonrpc-1.0' ||
    !validExtensionUri(binding.runtimeExtensionUri) ||
    !sha256(binding.inputSchemaSha256) || !sha256(binding.outputSchemaSha256) || !safeId(binding.pricingVersion) ||
    !Array.isArray(binding.requiredUsage) || binding.requiredUsage.length < 1 || binding.requiredUsage.length > 16 ||
    binding.requiredUsage.some((line) => !record(line) || Object.keys(line).length !== 2 || !safeId(line.meter) || !safeId(line.unit)) ||
    new Set(binding.requiredUsage.map((line) => `${line.meter}\0${line.unit}`)).size !== binding.requiredUsage.length ||
    !Number.isSafeInteger(binding.issuedAt) || binding.issuedAt > now + 30_000 ||
    !Number.isSafeInteger(binding.expiresAt) || binding.expiresAt <= now || binding.expiresAt <= binding.issuedAt ||
    binding.expiresAt - binding.issuedAt > MAX_BINDING_LIFETIME_MS ||
    typeof binding.signature !== 'string' || !decodeBase64Url(binding.signature)) return null;
  if (binding.agentOrigin !== intent.agentOrigin || binding.agentName !== intent.agentName ||
    binding.agentVersion !== intent.agentVersion || binding.agentCardSha256 !== intent.agentCardSha256 ||
    binding.packageKey !== intent.packageKey || binding.manifestSha256 !== intent.manifestSha256 ||
    binding.runtimeExtensionUri !== intent.runtimeExtensionUri ||
    binding.inputSchemaSha256 !== intent.inputSchemaSha256 || binding.outputSchemaSha256 !== intent.outputSchemaSha256) return null;
  let publicKey: Uint8Array | null;
  try {
    publicKey = await resolveKey({ providerId: binding.providerId, keyId: binding.keyId,
      agentOrigin: binding.agentOrigin, packageKey: binding.packageKey, manifestSha256: binding.manifestSha256 });
  } catch { return null; }
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) return null;
  try {
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(publicKey).buffer as ArrayBuffer, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, decodeBase64Url(binding.signature)!, skyPackageRuntimeBindingSigningBytes(binding))
      ? binding : null;
  } catch { return null; }
}

export function packageRuntimeQuoteRequirementsMatch(
  binding: SkyPackageRuntimeBinding,
  quote: { pricingVersion: string; usage: Array<{ meter: string; unit: string }> },
) {
  return quote.pricingVersion === binding.pricingVersion &&
    binding.requiredUsage.every((required) => quote.usage.some((line) => line.meter === required.meter && line.unit === required.unit));
}
