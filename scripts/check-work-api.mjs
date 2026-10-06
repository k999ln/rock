import { prepareSkyGoal } from './amc-sky-plan.mjs';
// Protocol checks only. Synthetic identity headers simulate the Sites gateway on
// a loopback-only Worker; never send these headers to a deployed site.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomUUID, sign, webcrypto } from 'node:crypto';
import {
  mkdtempSync,
  cpSync,
  copyFileSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
  ANDROID_KEY_ATTESTATION_AUTHORITY,
  ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT,
} from '../lib/android-key-attestation-client.ts';
import { encryptA2AArtifact } from '../lib/a2a-input-crypto.ts';
import {
  a2aDelegationStore,
  A2A_MAX_ACTIVE_DELEGATIONS_PER_PARENT_JOB,
  A2A_MAX_DELEGATIONS_PER_PARENT_JOB,
} from '../lib/a2a-delegation-store.ts';
import {
  a2aUsageReceiptSigningBytes,
  A2A_USAGE_RECEIPT_SCHEMA,
} from '../lib/a2a-usage-receipt.ts';
import { a2aLiveUsageSigningBytes } from '../lib/a2a-live-usage.ts';
import { encryptEsimInstallMaterial } from '../lib/esim-install-material.ts';
import { esimCloudAccessStore } from '../lib/esim-cloud-access.ts';
import { createEsimPricingSnapshot, parseEsimServerPlanCatalog } from '../lib/esim-plan-catalog.ts';
import {
  a2aBrokerAuthorizationSigningBytes,
  A2A_BROKER_AUTHORIZATION_SCHEMA,
} from '../lib/a2a-broker-authorization.ts';
import {
  a2aWalletHandoffSigningBytes,
  A2A_WALLET_HANDOFF_REQUEST_SCHEMA,
} from '../lib/a2a-wallet-handoff-auth.ts';
import { createA2AIntentDigests } from '../lib/a2a-authorization.ts';
import { createSkyToolPackageDraft, skyToolPackageKey, skyToolPackageSha256 } from '../lib/sky-tool-package.ts';
import { esimInstallReceiptSigningBytes, ESIM_INSTALL_RECEIPT_SCHEMA } from '../lib/esim-install-proof.ts';
import {
  esimDeviceEntitlementSigningBytes,
  ESIM_DEVICE_ENTITLEMENT_SCHEMA,
} from '../lib/esim-device-entitlement.ts';
import {
  rockstarEntitlementClaimSigningBytes,
  ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA,
} from '../lib/rockstar-entitlement-claim.ts';
import {
  rockstarEntitlementEventSigningBytes,
  ROCKSTAR_ENTITLEMENT_EVENT_SCHEMA,
} from '../lib/rockstar-entitlement-event.ts';
import { issueRockstarEntitlementClaim, issueRockstarEntitlementEvent } from '../lib/rockstar-entitlement-issuer.ts';
import { a2aPriceQuoteSigningBytes, A2A_PRICE_QUOTE_SCHEMA } from '../lib/a2a-price-quote.ts';
import { skyPackageSchemaSha256 } from '../lib/sky-package-runtime.ts';
import {
  SKY_PACKAGE_RUNTIME_BINDING_SCHEMA,
  skyPackageRuntimeBindingSigningBytes,
} from '../lib/sky-package-runtime-binding.ts';
import { SkyPackageRuntimeBindingStore } from '../lib/sky-package-runtime-binding-store.ts';
import {
  REMOTE_AI_RATE_CARD_SCHEMA,
  REMOTE_AI_TEXT_RATE_CARD_SCHEMA,
  remoteAiRateCardSigningBytes,
  verifyRemoteAiRateCard,
} from '../lib/remote-ai-rate-card.ts';
import { RemoteAiTextStore } from '../lib/remote-ai-text-store.ts';
import { encryptRemoteAiTextInput } from '../lib/remote-ai-text-input.ts';
import { executeReservedRemoteAiText } from '../lib/remote-ai-text-execution.ts';
import { rockstarDeviceLinkStore } from '../lib/rockstar-device-link.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'rock-api-check-'));
const state = join(temporary, 'state');
let base;
const alice = `api-check-${randomUUID()}`,
  bob = `api-check-${randomUUID()}`;
const brokerKeyPair = generateKeyPairSync('ed25519');
const usageKeyPair = generateKeyPairSync('ed25519');
const remoteAiRateKeyPair = generateKeyPairSync('ed25519');
const skyPackageBindingKeyPair = generateKeyPairSync('ed25519');
const esimIssuerKeyPair = generateKeyPairSync('ed25519');
const serviceEntitlementIssuerKeyPair = generateKeyPairSync('ed25519');
const serviceEntitlementIssuerSigningKey = await webcrypto.subtle.importKey(
  'pkcs8',
  serviceEntitlementIssuerKeyPair.privateKey.export({ type: 'pkcs8', format: 'der' }),
  { name: 'Ed25519' }, false, ['sign'],
);
const remoteAiRateIngestToken = 'api-check-rate-ingest-token-32-characters-min';
const skyPackageBindingOperatorToken = 'api-check-sky-package-binding-token-32-chars';
const esimDeviceGatewayKeyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const rotatedEsimDeviceGatewayKeyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const a2aBrokerAttestationKeyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const brokerPublicKey = new Uint8Array(
  brokerKeyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
);
const usagePublicKey = new Uint8Array(
  usageKeyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
);
const remoteAiRatePublicKey = new Uint8Array(
  remoteAiRateKeyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
);
const esimIssuerPublicKey = new Uint8Array(
  esimIssuerKeyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
);
const serviceEntitlementIssuerPublicKey = new Uint8Array(
  serviceEntitlementIssuerKeyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
);
const esimDeviceGatewayJwk = esimDeviceGatewayKeyPair.publicKey.export({ format: 'jwk' });
const originalEsimDeviceGatewayPublicKey = Buffer.concat([
  Buffer.from([4]), Buffer.from(esimDeviceGatewayJwk.x, 'base64url'),
  Buffer.from(esimDeviceGatewayJwk.y, 'base64url'),
]);
const a2aBrokerAttestationJwk = a2aBrokerAttestationKeyPair.publicKey.export({ format: 'jwk' });
const a2aBrokerAttestationPublicKey = Buffer.concat([
  Buffer.from([4]), Buffer.from(a2aBrokerAttestationJwk.x, 'base64url'),
  Buffer.from(a2aBrokerAttestationJwk.y, 'base64url'),
]);
const a2aBrokerAttestationKeyId = createHash('sha256').update(a2aBrokerAttestationPublicKey).digest('hex');
const attestedDeviceKeyId = createHash('sha256').update(originalEsimDeviceGatewayPublicKey).digest('hex');
let attestationPublicKey = originalEsimDeviceGatewayPublicKey;
let attestationPublicKeyId = attestedDeviceKeyId;
const attestationVerifierToken = Buffer.alloc(32, 31).toString('base64url');
let attestationVerifierRequestCount = 0;
let attestationVerifierLastError = '';
let esimDeviceGatewayPublicKey = originalEsimDeviceGatewayPublicKey;
let esimIssuerKeyStatus = 'active';
let esimDeviceGatewayKeyStatus = 'active';
const esimPackageHash = 'e'.repeat(64);
const esimStarterPackage = createSkyToolPackageDraft({
  sourceKind: 'github',
  sourceUrl: 'https://github.com/example/offline-guide',
  developerName: 'Rockstar fixture',
  developerId: 'rockstar-fixture',
  license: 'MIT',
  name: 'Offline Guide',
  summary: 'Provides a short offline help guide.',
  version: '1.0.0',
});
const esimStarterPackageKey = skyToolPackageKey(esimStarterPackage);
const esimStarterPackageHash = await skyToolPackageSha256(esimStarterPackage);
const skyPackageBindingPublicKey = new Uint8Array(
  skyPackageBindingKeyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
);
const skyPackageBindingAgentOrigin = 'https://agent.example.test';
const skyPackageRuntimeExtensionUri = 'https://rockstar.example/extensions/sky-package-runtime/v2';
const skyPackageBindingTrustedKeys = JSON.stringify([{
  providerId: 'api-check-agent-host',
  keyId: 'api-check-package-binding-key',
  agentOrigin: skyPackageBindingAgentOrigin,
  publicKeyHex: Buffer.from(skyPackageBindingPublicKey).toString('hex'),
  packagePins: [{ packageKey: esimStarterPackageKey, manifestSha256: esimStarterPackageHash }],
  status: 'active',
}]);
function signedInstallReceipt({ ownerUserId, orderId, profileDigest, challenge, deviceRef }) {
  const receipt = {
    schema: ESIM_INSTALL_RECEIPT_SCHEMA,
    issuerId: 'api-check-carrier',
    keyId: 'api-check-key-1',
    ownerUserId,
    orderId,
    profileDigest,
    challengeId: challenge.challengeId,
    challengeNonceSha256: createHash('sha256').update(challenge.challengeNonce).digest('hex'),
    deviceRef,
    installState: 'installed_enabled',
    evidenceSource: 'carrier_privileged',
    observedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    signature: '',
  };
  receipt.signature = sign(null, esimInstallReceiptSigningBytes(receipt), esimIssuerKeyPair.privateKey)
    .toString('base64url');
  return receipt;
}
function signedDeviceEntitlementReceipt({ ownerUserId, orderId, profileDigest, challenge,
  deviceRef, installReceiptSha256, starterPack, starterPackManifestSha256,
  authorityId = 'api-check-oem', keyId = 'api-check-device-key-1' }) {
  const receipt = {
    schema: ESIM_DEVICE_ENTITLEMENT_SCHEMA,
    signatureAlgorithm: 'ES256',
    authorityId,
    keyId,
    ownerUserId,
    orderId,
    profileDigest,
    challengeId: challenge.challengeId,
    challengeNonceSha256: createHash('sha256').update(challenge.challengeNonce).digest('hex'),
    deviceRef,
    installReceiptSha256,
    starterPackId: starterPack.id,
    starterPackVersion: starterPack.version,
    starterPackManifestSha256,
    activationState: 'installed_enabled',
    observedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    signature: '',
  };
  receipt.signature = sign('sha256', esimDeviceEntitlementSigningBytes(receipt), {
    key: esimDeviceGatewayKeyPair.privateKey, dsaEncoding: 'ieee-p1363',
  })
    .toString('base64url');
  return receipt;
}
async function androidAttestationVerifier(request) {
  attestationVerifierRequestCount++;
  try {
  assert.equal(request.url, 'https://attestation.example.test/v1/verify');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.get('authorization'), `Bearer ${attestationVerifierToken}`);
  const input = await request.json();
  assert.equal(input.schema, 'rock-android-key-attestation-request/1');
  assert.equal(input.packageName, 'dev.rock.automation');
  assert.deepEqual(input.certificateChainDerBase64Url, ['AQ', 'Ag']);
  const challenge = Buffer.from(input.challenge, 'base64url');
  assert.equal(challenge.byteLength, 32);
  return Response.json({
    schema: 'rock-android-key-attestation-result/1',
    challengeId: input.challengeId,
    challengeSha256: createHash('sha256').update(challenge).digest('hex'),
    publicKeyRawP256Base64Url: attestationPublicKey.toString('base64url'),
    publicKeySha256: attestationPublicKeyId,
    securityLevel: 'TRUSTED_ENVIRONMENT',
    verifiedBootState: 'VERIFIED',
    deviceLocked: true,
    applicationPackage: input.packageName,
    minimumApplicationVersion: '1',
    signingCertificateSha256: 'a'.repeat(64),
    verifiedAt: Date.now(),
    verifierCommit: ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT,
  });
  } catch (error) {
    attestationVerifierLastError = String(error);
    throw error;
  }
}
let a2aExecutionEnabled = false;
let serviceEntitlementEnforcementEnabled = false;
let priceQuoteRequired = false;
let remoteLlmEnabled = false;
let remoteModelEndpoint = 'http://127.0.0.1:11434';
let remoteAiTrustedRateKeys = '[]';
let worker,
  database,
  assertions = 0;
function check(actual, expected) {
  assert.deepEqual(actual, expected);
  assertions++;
}
async function call(method = 'GET', body, options = {}) {
  const response = await fetch(`${base}${options.path ?? '/api/work-jobs'}`, {
    method,
    headers: {
      ...(options.user === null
        ? {}
        : { 'oai-authenticated-user-id': options.user ?? alice }),
      ...(method === 'GET'
        ? {}
        : {
            Origin: options.origin ?? base,
          'Content-Type': 'application/json',
          }),
      ...options.headers,
    },
    ...(body === undefined
      ? {}
      : { body: options.raw ? body : JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== (options.status ?? 200))
    throw new Error(
      `${method} ${options.path ?? '/api/work-jobs'}: expected ${options.status ?? 200}, received ${response.status}: ${(await response.text()).slice(0, 2000)}${(options.path ?? '').includes('/device-entitlement') ? `; verifier requests=${attestationVerifierRequestCount}; verifier error=${attestationVerifierLastError || 'none'}` : ''}`,
    );
  check(response.status, options.status ?? 200);
  check(response.headers.get('cache-control'), options.cache ?? (options.path?.startsWith('/api/amc') ? 'private, no-store' : 'no-store'));
  options.inspectResponse?.(response);
  return response.json();
}
async function createBrokerProof(delegation, message) {
  const intent = {
    id: delegation.id,
    ownerUserId: alice,
    deviceRef: 'fixture-device-a',
    parentJobId: delegation.parentJobId,
    messageId: delegation.messageId,
    targetOrigin: delegation.targetOrigin,
    targetAgentName: delegation.targetAgentName,
    targetAgentVersion: delegation.targetAgentVersion,
    protocolVersion: delegation.protocolVersion,
    budgetCurrency: delegation.budgetCurrency,
    budgetLimitMinor: delegation.budgetLimitMinor,
    parentBudgetLimitMinor: delegation.parentBudgetLimitMinor,
    continueWhileDeviceOffline: delegation.continueWhileDeviceOffline,
    deadlineAt: delegation.deadlineAt,
    priceQuoteDigest: delegation.priceQuoteDigest || undefined,
    message,
  };
  const digests = await createA2AIntentDigests(intent);
  const proof = {
    schema: A2A_BROKER_AUTHORIZATION_SCHEMA,
    authorityId: 'fixture-rockstaros',
    ownerUserId: alice,
    deviceRef: 'fixture-device-a',
    delegationId: delegation.id,
    parentJobId: delegation.parentJobId,
    messageId: delegation.messageId,
    targetOrigin: delegation.targetOrigin,
    targetAgentName: delegation.targetAgentName,
    targetAgentVersion: delegation.targetAgentVersion,
    protocolVersion: delegation.protocolVersion,
    inputSha256: digests.inputSha256,
    budgetCurrency: delegation.budgetCurrency,
    budgetLimitMinor: delegation.budgetLimitMinor,
    continueWhileDeviceOffline: delegation.continueWhileDeviceOffline,
    deadlineAt: delegation.deadlineAt,
    authorizationSha256: digests.authorizationSha256,
    issuedAt: Date.now(),
    expiresAt: Math.min(Date.now() + 4 * 60_000, delegation.deadlineAt),
    keyId: 'fixture-device-key',
    signature: '',
  };
  proof.signature = sign(
    null,
    a2aBrokerAuthorizationSigningBytes(proof),
    brokerKeyPair.privateKey,
  ).toString('base64url');
  return proof;
}
async function stop() {
  await worker?.dispose();
  worker = undefined;
}
async function start() {
  const directory = join(temporary, 'dist/server');
  const config = JSON.parse(
    readFileSync(join(directory, 'wrangler.json'), 'utf8'),
  );
  // Exercise the exact API bundle in workerd/D1 directly. Wrangler's additional
  // hot-reload proxy has a known unread-POST transport failure (#15203); it is
  // not part of the deployed Worker. This suite does not test static asset routing.
  const workerOptions = convertV4MiniflareOptions({
    host: '127.0.0.1',
    port: 0,
    resourcePersistencePath: state,
    workers: [{
      name: config.name,
      rootPath: directory,
      modules: [
        config.main,
        ...readdirSync(directory, { recursive: true, encoding: 'utf8' }).filter(
          (file) => file !== config.main && /\.m?js$/.test(file),
        ),
      ].map((file) => ({ type: 'ESModule', path: resolve(directory, file) })),
      compatibilityDate: config.compatibility_date,
      compatibilityFlags: config.compatibility_flags,
      serviceBindings: {
        ANDROID_ATTESTATION_VERIFIER: androidAttestationVerifier,
      },
      bindings: {
        ...config.vars,
        SKY_REMOTE_LLM_ENABLED: remoteLlmEnabled ? 'true' : 'false',
        SKY_OLLAMA_BASE_URL: remoteModelEndpoint,
        SKY_LOCAL_LLM_BASE_URL: remoteModelEndpoint,
        SKY_LLM_COMPATIBLE_BASE_URL: remoteModelEndpoint,
        REMOTE_AI_TRUSTED_RATE_KEYS: remoteAiTrustedRateKeys,
        REMOTE_AI_RATE_CARD_INGEST_TOKEN: remoteAiRateIngestToken,
        REMOTE_AI_RATE_CARD_OPERATOR_ID: 'api-check-operator',
        SKY_PACKAGE_BINDING_OPERATOR_TOKEN: skyPackageBindingOperatorToken,
        SKY_PACKAGE_BINDING_OPERATOR_ID: 'api-check-sky-package-operator',
        SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS: skyPackageBindingTrustedKeys,
        SKY_PACKAGE_RUNTIME_EXTENSION_URI: skyPackageRuntimeExtensionUri,
        ESIMGO_API_KEY: 'fixture-esim-provider-key-only',
        ESIMGO_PROFILE_HASH_SECRET: 'c'.repeat(64),
        ESIMGO_INSTALL_MATERIAL_KEY: 'f'.repeat(64),
        ESIMGO_CALLBACK_DEDUPE_SECRET: 'd'.repeat(64),
        ESIMGO_PROVIDER_DEBIT_ENABLED: 'false',
        ANDROID_ATTESTATION_VERIFIER_URL: 'https://attestation.example.test/v1/verify',
        ANDROID_ATTESTATION_VERIFIER_TOKEN: attestationVerifierToken,
        ANDROID_ATTESTATION_VERIFIER_COMMIT: ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT,
        ESIM_INSTALL_RECEIPT_KEYS: JSON.stringify([{
          issuerId: 'api-check-carrier',
          keyId: 'api-check-key-1',
          publicKeyHex: Buffer.from(esimIssuerPublicKey).toString('hex'),
          status: esimIssuerKeyStatus,
        }]),
        ESIM_CLOUD_ACCESS_POLICIES_JSON: JSON.stringify([{
          packageKey: 'api-check-esim', manifestSha256: esimPackageHash,
          accessDurationDays: 60, scopes: ['rockstaros_access', 'sky', 'zema', 'agents'],
        }]),
        ESIM_DEVICE_GATEWAY_KEYS: JSON.stringify([{
          authorityId: 'api-check-oem',
          ownerUserId: alice,
          deviceRef: 'api-check-device',
          keyId: 'api-check-device-key-1',
          algorithm: 'ES256',
          publicKeyHex: Buffer.from(esimDeviceGatewayPublicKey).toString('hex'),
          status: esimDeviceGatewayKeyStatus,
        }]),
        ROCKSTAR_SERVICE_CLAIM_ISSUERS: JSON.stringify([{
          issuerId: 'api-check-retailer',
          issuerKeyId: 'api-check-retailer-key-1',
          publicKeyHex: Buffer.from(serviceEntitlementIssuerPublicKey).toString('hex'),
          status: 'active',
        }]),
        ROCKSTAR_SERVICE_OFFER_PROFILES: JSON.stringify({
          schema: 'rockstar-service-offer-profiles/1',
          profiles: [{ issuerId: 'api-check-retailer', offerId: 'rockstar-sim-standard-v1',
            profileId: 'lifeline', version: '1.0.0', label: 'Lifeline', packages: [{
              packageKey: esimStarterPackageKey, manifestSha256: esimStarterPackageHash,
            }] }],
        }),
        ESIM_PUBLIC_CATALOG_JSON: JSON.stringify({
          version: 'api-public-v1',
          plans: [{
            packageKey: 'api-check-esim',
            manifestSha256: esimPackageHash,
            id: 'lifeline-basic',
            name: 'Lifeline Basic',
            description: 'Connectivity with a reviewed starter agent pack.',
            coverageCountryCodes: ['JP'],
            roamingCountryCodes: [],
            dataAllowance: { kind: 'fixed', amountMb: 1024 },
            validityDays: 30,
            serviceStarts: 'after_profile_installation',
            installPrerequisites: ['An eSIM-capable device is required.'],
          }],
        }),
        ESIMGO_PLAN_CATALOG_JSON: JSON.stringify({
          version: 'api-check-v1',
          plans: [{
            packageKey: 'api-check-esim',
            manifestSha256: esimPackageHash,
            providerBundleName: 'fixture_jp_1gb',
            providerCurrency: 'USD',
            maximumWholesaleMinor: 1000,
            retailCurrency: 'jpy',
            retailAmountMinor: 1500,
            providerMinorToRetailNumerator: 1,
            providerMinorToRetailDenominator: 1,
            providerFeeReserveRetailMinor: 100,
            minimumGrossMarginRetailMinor: 200,
            starterAgentPack: { id: 'lifeline', version: '1.0.0', packages: [{
              packageKey: esimStarterPackageKey, manifestSha256: esimStarterPackageHash,
            }] },
          }],
        }),
        A2A_INPUT_ENCRYPTION_KEY: 'a'.repeat(64),
        A2A_TRUSTED_BROKER_KEYS: JSON.stringify([{
          authorityId: 'fixture-rockstaros',
          ownerUserId: alice,
          deviceRef: 'fixture-device-a',
          keyId: 'fixture-device-key',
          publicKeyHex: Buffer.from(brokerPublicKey).toString('hex'),
          status: 'active',
        }]),
        A2A_TRUSTED_USAGE_KEYS: JSON.stringify([{
          providerId: 'api-check-provider',
          keyId: 'api-check-usage-key',
          agentOrigin: 'https://agent.example.com',
          publicKeyHex: Buffer.from(usagePublicKey).toString('hex'),
          status: 'active',
        }]),
        A2A_PRICE_QUOTES_REQUIRED: priceQuoteRequired ? 'true' : 'false',
        ...(a2aExecutionEnabled
          ? { A2A_DELEGATION_EXECUTION_ENABLED: 'true' }
          : {}),
        ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: serviceEntitlementEnforcementEnabled ? 'true' : 'false',
      },
      d1Databases: Object.fromEntries(
        config.d1_databases.map((db) => [db.binding, db.database_id]),
      ),
    }],
  });
  worker = new Miniflare(workerOptions);
  base = (await worker.ready).origin;
  database = await worker.getD1Database('DB');
}
try {
  // Workerd discovers extra *.js modules, including ExFAT AppleDouble metadata.
  // Hard-link the immutable build bytes into the isolated test root while
  // excluding metadata files. This retains byte-for-byte input isolation
  // without duplicating the entire generated bundle on disk.
  function linkBuildTree(source, destination) {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (entry.name.startsWith('._')) continue;
      const sourcePath = join(source, entry.name);
      const destinationPath = join(destination, entry.name);
      if (entry.isDirectory()) linkBuildTree(sourcePath, destinationPath);
      else if (entry.isFile()) {
        try {
          linkSync(sourcePath, destinationPath);
        } catch (error) {
          if (!['EXDEV', 'EPERM', 'EACCES', 'EMLINK'].includes(error?.code)) throw error;
          copyFileSync(sourcePath, destinationPath);
        }
      }
      else if (entry.isSymbolicLink()) symlinkSync(readlinkSync(sourcePath), destinationPath);
      else throw new Error(`Unsupported build artifact type: ${sourcePath}`);
    }
  }
  linkBuildTree(join(root, 'dist'), join(temporary, 'dist'));
  cpSync(join(root, 'drizzle'), join(temporary, 'migrations'), {
    recursive: true,
    filter: (source) => !source.split(/[\\/]/).at(-1).startsWith('._'),
  });
  await start();
  const statusBeforeSchema = await call('GET', undefined, {
    path: '/api/sky/service-status', user: null,
  });
  check(statusBeforeSchema.database, 'unavailable');
  check(statusBeforeSchema.payments, 'unconfigured');
  check(statusBeforeSchema.csvPayments, 'unconfigured');
  check(
    (
      await call('GET', undefined, {
        path: '/api/health',
        user: null,
        status: 503,
      })
    ).status,
    'unavailable',
  );
  for (const file of readdirSync(join(temporary, 'migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    for (const sql of readFileSync(join(temporary, 'migrations', file), 'utf8')
      .split('--> statement-breakpoint')
      .filter((sql) => sql.trim()))
      await database.prepare(sql).run();
  }
  const serviceStatus = await call('GET', undefined, {
    path: '/api/sky/service-status', user: null,
  });
  check(serviceStatus.database, 'available');
  check(serviceStatus.payments, 'unconfigured');
  check(serviceStatus.csvPayments, 'unconfigured');
  check(serviceStatus.legalAiConfigured, false);
  check(serviceStatus.jevConfigured, false);
  check(Object.keys(serviceStatus).sort(), ['version', 'database', 'csvStorageConfigured', 'legalAiConfigured', 'patentAiConfigured', 'jevConfigured', 'payments', 'csvPayments'].sort());
  const entitlementPath = '/api/rockstar/entitlements';
  await call('GET', undefined, { path: entitlementPath, user: null, status: 401 });
  const initialEntitlements = await call('GET', undefined, { path: entitlementPath });
  check(initialEntitlements.claimRedemptionAvailable, true);
  check(initialEntitlements.entitlements, []);
  const deviceAuthorizationPath = '/api/rockstar/device-authorizations';
  const deviceAuthorization = await call('POST', {
    action: 'begin', deviceName: 'Synthetic Android device',
  }, { path: deviceAuthorizationPath, user: null, status: 201 });
  assert.match(deviceAuthorization.userCode, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.match(deviceAuthorization.deviceCode, /^rock_device_[A-Za-z0-9_-]{43}$/);
  check(deviceAuthorization.expiresIn, 600);
  check(deviceAuthorization.interval, 5);
  check(new URL(deviceAuthorization.verificationUriComplete).origin, base);
  const deviceApprovalPath = '/api/rockstar/device-authorizations/approve';
  const deviceDetails = await call('GET', undefined, {
    path: `${deviceApprovalPath}?user_code=${deviceAuthorization.userCode}`,
  });
  check(deviceDetails.authorization.clientName, 'Synthetic Android device');
  await call('POST', { action: 'approve', userCode: deviceAuthorization.userCode }, {
    path: deviceApprovalPath, origin: 'https://attacker.invalid', status: 403,
  });
  await call('POST', { action: 'approve', userCode: deviceAuthorization.userCode }, {
    path: deviceApprovalPath,
  });
  await call('POST', { action: 'approve', userCode: deviceAuthorization.userCode }, {
    path: deviceApprovalPath, status: 404,
  });
  const deviceGrant = await call('POST', {
    action: 'poll', deviceCode: deviceAuthorization.deviceCode,
  }, { path: deviceAuthorizationPath, user: null });
  check(deviceGrant.status, 'authorized');
  check(deviceGrant.ownerUserId, alice);
  assert.match(deviceGrant.accessToken, /^rock_session_[A-Za-z0-9_-]{43}$/);
  check(deviceGrant.expiresAt > Date.now(), true);
  const persistedDeviceToken = await database.prepare(
    'SELECT token_sha256 AS tokenHash FROM rockstar_device_sessions',
  ).first();
  check(persistedDeviceToken.tokenHash.length, 64);
  check(persistedDeviceToken.tokenHash === deviceGrant.accessToken, false);
  await assert.rejects(
    rockstarDeviceLinkStore(database).authenticate(deviceGrant.accessToken, deviceGrant.expiresAt),
    /UNAUTHORIZED/,
  );
  await call('POST', { action: 'poll', deviceCode: deviceAuthorization.deviceCode }, {
    path: deviceAuthorizationPath, user: null,
  }).then((result) => check(result.status, 'access_denied'));
  const bearerEntitlements = await call('GET', undefined, {
    path: entitlementPath, user: null,
    headers: { Authorization: `Bearer ${deviceGrant.accessToken}` },
  });
  check(bearerEntitlements.entitlements, []);
  await call('GET', undefined, { path: '/api/rockstar/device-home', user: null, status: 401 });
  const deviceHomePath = '/api/rockstar/device-home';
  const deviceHomeHeaders = { Authorization: `Bearer ${deviceGrant.accessToken}` };
  const initialDeviceHome = await call('GET', undefined, {
    path: deviceHomePath, user: null, headers: deviceHomeHeaders,
  });
  check(initialDeviceHome.schema, 'rockstar-device-home/1');
  check(initialDeviceHome.claimRedemptionAvailable, true);
  check(initialDeviceHome.access.rockstaros, true);
  check(initialDeviceHome.recentLlm, []);
  check(initialDeviceHome.recentAgents, []);
  check(initialDeviceHome.parentJobs, []);
  check(JSON.stringify(initialDeviceHome).includes('fixture prompt'), false);
  // Server-issued Android Broker enrollment is owner-bound. The attestation
  // binding below is synthetic and tests the API contract, not device trust.
  const brokerDevicesPath = '/api/rockstar/broker-devices';
  const brokerDeviceRef = randomUUID();
  await call('GET', undefined, { path: brokerDevicesPath, user: null, status: 401 });
  check((await call('GET', undefined, { path: brokerDevicesPath })).devices, []);
  await call('POST', { action: 'challenge', deviceRef: brokerDeviceRef }, {
    path: brokerDevicesPath, user: null, status: 401,
  });
  await call('POST', { action: 'challenge', deviceRef: brokerDeviceRef }, {
    path: brokerDevicesPath, origin: 'https://attacker.invalid', status: 403,
  });
  await call('POST', { action: 'challenge', deviceRef: 'not-a-uuid' }, {
    path: brokerDevicesPath, status: 400,
  });
  const brokerChallenge = await call('POST', {
    action: 'challenge', deviceRef: brokerDeviceRef,
  }, { path: brokerDevicesPath, status: 201 });
  check(brokerChallenge.deviceRef, brokerDeviceRef);
  assert.match(brokerChallenge.challengeNonce, /^[A-Za-z0-9_-]{43}$/);
  check(brokerChallenge.expiresAt > Date.now(), true);
  const brokerRegistration = {
    action: 'register', challengeId: brokerChallenge.challengeId,
    challengeNonce: brokerChallenge.challengeNonce,
    certificateChainDerBase64Url: ['AQ', 'Ag'],
  };
  await call('POST', brokerRegistration, {
    path: brokerDevicesPath, user: bob, status: 409,
  });
  const verifierCallsBeforeBrokerEnrollment = attestationVerifierRequestCount;
  attestationPublicKey = a2aBrokerAttestationPublicKey;
  attestationPublicKeyId = a2aBrokerAttestationKeyId;
  const enrolledBroker = await call('POST', brokerRegistration, {
    path: brokerDevicesPath, status: 201,
  });
  check(enrolledBroker.state, 'registered');
  check(enrolledBroker.authorityId, ANDROID_KEY_ATTESTATION_AUTHORITY);
  check(enrolledBroker.deviceRef, brokerDeviceRef);
  check(enrolledBroker.keyId, a2aBrokerAttestationKeyId);
  check(enrolledBroker.algorithm, 'ES256');
  check(attestationVerifierRequestCount, verifierCallsBeforeBrokerEnrollment + 1);
  await call('POST', brokerRegistration, {
    path: brokerDevicesPath, status: 409,
  });
  const brokerDeviceList = await call('GET', undefined, { path: brokerDevicesPath });
  check(brokerDeviceList.devices.length, 1);
  check(brokerDeviceList.devices[0].keyId, a2aBrokerAttestationKeyId);
  check(brokerDeviceList.devices[0].deviceRef, brokerDeviceRef);
  check(brokerDeviceList.devices[0].status, 'active');
  check('publicKeyHex' in brokerDeviceList.devices[0], false);
  check((await call('GET', undefined, { path: brokerDevicesPath, user: bob })).devices, []);
  await call('POST', { action: 'revoke', deviceRef: brokerDeviceRef, keyId: a2aBrokerAttestationKeyId }, {
    path: brokerDevicesPath, user: bob, status: 404,
  });
  const brokerRevocation = await call('POST', {
    action: 'revoke', deviceRef: brokerDeviceRef, keyId: a2aBrokerAttestationKeyId,
  }, { path: brokerDevicesPath });
  check(brokerRevocation.revoked, true);
  check((await call('GET', undefined, { path: brokerDevicesPath })).devices[0].status, 'revoked');
  attestationPublicKey = originalEsimDeviceGatewayPublicKey;
  attestationPublicKeyId = attestedDeviceKeyId;

  check((await call('GET', undefined, {
    path: '/api/work-jobs', user: null,
    headers: { Authorization: `Bearer ${deviceGrant.accessToken}` },
  })).jobs, []);
  const expiredAuthorizationAt = Date.now();
  const expiredDeviceAuthorization = await rockstarDeviceLinkStore(database)
    .begin('Expired test device', expiredAuthorizationAt);
  check((await rockstarDeviceLinkStore(database).poll(
    expiredDeviceAuthorization.deviceCode, expiredAuthorizationAt + 600_000,
  )).status, 'expired_token');
  const deviceSessionsPath = '/api/rockstar/device-sessions';
  const activeDeviceSessions = await call('GET', undefined, { path: deviceSessionsPath });
  check(activeDeviceSessions.sessions.length, 1);
  check(activeDeviceSessions.sessions[0].deviceName, 'Synthetic Android device');
  check('token' in activeDeviceSessions.sessions[0], false);
  const entitlementCode = `rsk_${Buffer.alloc(32, 42).toString('base64url')}`;
  const entitlementClaim = {
    schema: ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA,
    issuerId: 'api-check-retailer',
    issuerKeyId: 'api-check-retailer-key-1',
    claimId: 'api-check-purchase-001',
    offerId: 'rockstar-sim-standard-v1',
    purchaseReferenceSha256: createHash('sha256').update('synthetic-purchase-reference').digest('hex'),
    claimCodeSha256: createHash('sha256').update(entitlementCode).digest('hex'),
    formFactor: 'physical_sim',
    scopes: ['rockstaros_access', 'sky', 'zema', 'agents'],
    issuedAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    signature: '',
  };
  entitlementClaim.signature = sign(
    null,
    rockstarEntitlementClaimSigningBytes(entitlementClaim),
    serviceEntitlementIssuerKeyPair.privateKey,
  ).toString('base64url');
  const entitlementBody = { claim: entitlementClaim, claimCode: entitlementCode };
  const claimedEntitlement = await call('POST', entitlementBody, {
    path: entitlementPath, status: 201,
  });
  check(claimedEntitlement.entitlement.ownerUserId, alice);
  check(claimedEntitlement.entitlement.alreadyClaimed, false);
  check(claimedEntitlement.entitlement.serviceProfile.state, 'review_required');
  check(claimedEntitlement.entitlement.serviceProfile.packages[0].state, 'unavailable');
  const retriedEntitlement = await call('POST', entitlementBody, {
    path: entitlementPath, status: 200,
  });
  check(retriedEntitlement.entitlement.alreadyClaimed, true);
  await call('POST', entitlementBody, { path: entitlementPath, user: bob, status: 409 });
  await call('POST', { ...entitlementBody, claimCode: `${entitlementCode}wrong` }, {
    path: entitlementPath, status: 400,
  });
  await call('POST', { ...entitlementBody, claim: { ...entitlementClaim, offerId: 'tampered-offer' } }, {
    path: entitlementPath, status: 400,
  });
  check((await call('GET', undefined, { path: entitlementPath })).entitlements.length, 1);
  check((await call('GET', undefined, { path: entitlementPath, user: bob })).entitlements, []);
  serviceEntitlementEnforcementEnabled = true;
  await stop();
  await start();
  const a2aDelegationPath = '/api/sky/a2a-delegations';
  const deniedWithoutAgentClaim = await call('POST', {}, {
    path: a2aDelegationPath, user: bob, status: 403,
  });
  check(deniedWithoutAgentClaim.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  await call('POST', {}, { path: a2aDelegationPath, user: alice, status: 400 });
  const deniedZema = await call('POST', {}, { path: '/api/work-jobs', user: bob, status: 403 });
  check(deniedZema.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  await call('POST', {}, { path: '/api/work-jobs', user: alice, status: 400 });
  const deviceParent = await call('POST', {
    id: randomUUID(), templateId: 'article', title: 'Synthetic device-home parent job',
  }, { path: '/api/work-jobs', status: 201 });
  const homeWithParentJob = await call('GET', undefined, {
    path: deviceHomePath, user: null, headers: deviceHomeHeaders,
  });
  check(homeWithParentJob.parentJobs.length, 1);
  check(homeWithParentJob.parentJobs[0].id, deviceParent.job.id);
  check(homeWithParentJob.parentJobs[0].status, 'active');
  check(Object.keys(homeWithParentJob.parentJobs[0]).sort(), ['id', 'revision', 'status', 'title', 'updatedAt']);
  check(JSON.stringify(homeWithParentJob.parentJobs).includes('fixture prompt'), false);
  const cloudPlan = await call('POST', {
    id: randomUUID(), templateId: 'cloud-agent', title: 'Synthetic Agent parent plan',
  }, { path: '/api/work-jobs', status: 201 });
  check(cloudPlan.job.plan.schemaVersion, 1);
  check(cloudPlan.job.plan.approvalGates.map((gate) => gate.requirement), [
    'provider_quote_wallet_reservation_and_explicit_cloud_approval',
    'terminal_result_captured_with_usage_receipt',
  ]);
  const planEditCommand = {
    id: randomUUID(), action: 'edit_plan', schemaVersion: 1,
    objective: 'Synthetic user-edited Cloud Agent objective',
  };
  const editedCloudPlan = await call('PATCH', {
    jobId: cloudPlan.job.id, revision: cloudPlan.job.revision,
    command: planEditCommand,
  }, { path: '/api/work-jobs' });
  check(editedCloudPlan.job.plan.objective, planEditCommand.objective);
  check(editedCloudPlan.job.plan.approvalGates, cloudPlan.job.plan.approvalGates);
  await call('PATCH', {
    jobId: cloudPlan.job.id, revision: editedCloudPlan.job.revision,
    command: { ...planEditCommand, id: randomUUID(), approvalGates: [] },
  }, { path: '/api/work-jobs', status: 400 });
  await call('PATCH', {
    jobId: cloudPlan.job.id, revision: editedCloudPlan.job.revision,
    command: { ...planEditCommand, id: randomUUID(), schemaVersion: 2 },
  }, { path: '/api/work-jobs', status: 400 });
  await call('PATCH', {
    jobId: cloudPlan.job.id, revision: editedCloudPlan.job.revision,
    command: planEditCommand,
  }, { path: '/api/work-jobs', user: bob, status: 404 });
  const forgedCloudStep = await call('PATCH', {
    jobId: cloudPlan.job.id,
    revision: editedCloudPlan.job.revision,
    command: {
      id: randomUUID(), action: 'record', stepId: 'agent-brief', tool: 'sky-a2a-brief',
      transport: 'browser', outcome: 'passed', sample: false, durationMs: 1,
      delegationId: randomUUID(),
    },
  }, { path: '/api/work-jobs', status: 409 });
  check(forgedCloudStep.error, '記録するAgent委任がこの親jobに属していません。');
  const editableArticle = await call('POST', {
    id: randomUUID(), templateId: 'article', title: 'Synthetic editable article plan',
  }, { path: '/api/work-jobs', status: 201 });
  const articleObjective = await call('PATCH', {
    jobId: editableArticle.job.id, revision: 0,
    command: { id: randomUUID(), action: 'edit_plan', schemaVersion: 1, objective: 'Validate source notes and prepare a reviewable draft' },
  }, { path: '/api/work-jobs' });
  const articleStep = articleObjective.job.steps[0];
  const startedArticle = await call('PATCH', {
    jobId: articleObjective.job.id, revision: articleObjective.job.revision,
    command: {
      id: randomUUID(), action: 'record', stepId: articleStep.id, tool: articleStep.tool,
      transport: 'browser', outcome: 'passed', sample: false, durationMs: 1,
    },
  }, { path: '/api/work-jobs' });
  await call('PATCH', {
    jobId: startedArticle.job.id, revision: startedArticle.job.revision,
    command: { id: randomUUID(), action: 'edit_plan', schemaVersion: 1, objective: 'Too late to revise this plan' },
  }, { path: '/api/work-jobs', status: 409 });
  await call('GET', undefined, { path: '/api/sky/a2a-agents', user: bob, status: 403 });
  check((await call('GET', undefined, { path: '/api/sky/a2a-agents' })).agents, []);
  const deniedMcp = await call('POST', {}, { path: '/api/sky/mcp/inspect', user: bob, status: 403 });
  check(deniedMcp.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  await call('POST', {}, { path: '/api/sky/mcp/inspect', user: alice, status: 400 });
  const deniedLlm = await call('POST', {}, { path: '/api/llm/text', user: bob, status: 403 });
  check(deniedLlm.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  await call('POST', {}, { path: '/api/llm/text', user: alice, status: 400 });
  const deniedEstimate = await call('POST', {
    provider: 'openai', model: 'fixture-model', prompt: 'fixture prompt',
  }, { path: '/api/llm/estimate', user: bob, status: 403 });
  check(deniedEstimate.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  const unavailableEstimate = await call('POST', {
    provider: 'openai', model: 'fixture-model', prompt: 'fixture prompt',
  }, { path: '/api/llm/estimate', user: alice, status: 503 });
  check(unavailableEstimate.code, 'REMOTE_AI_RATE_CARD_UNAVAILABLE');
  const remoteAiRateCard = {
    schema: REMOTE_AI_RATE_CARD_SCHEMA,
    providerId: 'openai',
    keyId: 'api-check-rate-key',
    cardId: 'api-check-rate-card',
    modelId: 'fixture-model',
    pricingVersion: 'fixture-prices-1',
    currency: 'USD',
    inputMinorMicrosPerMillionTokens: 1_000_000_000,
    outputMinorMicrosPerMillionTokens: 1_000_000_000,
    effectiveAt: Date.now() - 1_000,
    expiresAt: Date.now() + 60 * 60 * 1000,
    sourceUrl: 'https://openai.com/pricing',
    signature: '',
  };
  remoteAiRateCard.signature = sign(
    null,
    remoteAiRateCardSigningBytes(remoteAiRateCard),
    remoteAiRateKeyPair.privateKey,
  ).toString('base64url');
  remoteAiTrustedRateKeys = JSON.stringify([{
    providerId: 'openai',
    keyId: 'api-check-rate-key',
    publicKeyHex: Buffer.from(remoteAiRatePublicKey).toString('hex'),
    status: 'active',
  }]);
  await stop();
  await start();
  const rateCardAdminPath = '/api/internal/remote-ai/rate-cards';
  await call('POST', { card: remoteAiRateCard }, {
    path: rateCardAdminPath, user: null, status: 401,
  });
  await call('POST', { card: remoteAiRateCard }, {
    path: rateCardAdminPath, user: null, status: 401,
    headers: { Authorization: 'Bearer incorrect-token-which-is-long-enough-to-parse-123456' },
  });
  const registeredRateCard = await call('POST', { card: remoteAiRateCard }, {
    path: rateCardAdminPath, user: null, status: 201,
    headers: { Authorization: `Bearer ${remoteAiRateIngestToken}` },
  });
  check(registeredRateCard.inserted, true);
  const duplicateRateCard = await call('POST', { card: remoteAiRateCard }, {
    path: rateCardAdminPath, user: null,
    headers: { Authorization: `Bearer ${remoteAiRateIngestToken}` },
  });
  check(duplicateRateCard.inserted, false);
  const estimateBody = {
    provider: 'openai', model: 'fixture-model', prompt: 'fixture prompt',
    maxOutputTokens: 100, maximumBudgetMinor: 1,
  };
  const liveRateEstimate = await call('POST', estimateBody, {
    path: '/api/llm/estimate', user: alice,
  });
  check(liveRateEstimate.estimate.maximumChargeMinor, 1);
  check(JSON.stringify(liveRateEstimate.unitRates), JSON.stringify([
    { category: 'ordinary-input', rateMinorMicrosPerMillionTokens: 1_000_000_000 },
    { category: 'output', rateMinorMicrosPerMillionTokens: 1_000_000_000 },
  ]));
  check(liveRateEstimate.withinUserCap, true);
  check(liveRateEstimate.providerSubmission, 'not_performed');
  check(liveRateEstimate.executionAuthorized, false);
  check(liveRateEstimate.estimate.pricingCoverage, 'legacy-input-output-only');
  const overCapEstimate = await call('POST', { ...estimateBody, maximumBudgetMinor: 0 }, {
    path: '/api/llm/estimate', user: alice,
  });
  check(overCapEstimate.estimate.maximumChargeMinor, 1);
  check(overCapEstimate.withinUserCap, false);
  const revokedRateCard = await call('PATCH', {
    action: 'revoke', providerId: 'openai', cardId: 'api-check-rate-card',
  }, {
    path: rateCardAdminPath, user: null,
    headers: { Authorization: `Bearer ${remoteAiRateIngestToken}` },
  });
  check(revokedRateCard.revoked, true);
  const estimateAfterRevoke = await call('POST', estimateBody, {
    path: '/api/llm/estimate', user: alice, status: 503,
  });
  check(estimateAfterRevoke.code, 'REMOTE_AI_RATE_CARD_UNAVAILABLE');
  const textRateCard = {
    ...remoteAiRateCard,
    schema: REMOTE_AI_TEXT_RATE_CARD_SCHEMA,
    cardId: 'api-check-text-rate-card',
    cachedInputMinorMicrosPerMillionTokens: 100_000_000,
    cacheWriteMinorMicrosPerMillionTokens: 10_000_000_000,
    executionScope: 'text-only',
    serviceTier: 'default',
  };
  textRateCard.signature = sign(null, remoteAiRateCardSigningBytes(textRateCard),
    remoteAiRateKeyPair.privateKey).toString('base64url');
  const textRegistered = await call('POST', { card: textRateCard }, {
    path: rateCardAdminPath, user: null, status: 201,
    headers: { Authorization: `Bearer ${remoteAiRateIngestToken}` },
  });
  check(textRegistered.inserted, true);
  const textEstimate = await call('POST', estimateBody, { path: '/api/llm/estimate', user: alice });
  check(textEstimate.estimate.maximumChargeMinor, 2);
  check(JSON.stringify(textEstimate.unitRates), JSON.stringify([
    { category: 'ordinary-input', rateMinorMicrosPerMillionTokens: 1_000_000_000 },
    { category: 'cached-input', rateMinorMicrosPerMillionTokens: 100_000_000 },
    { category: 'cache-write', rateMinorMicrosPerMillionTokens: 10_000_000_000 },
    { category: 'output', rateMinorMicrosPerMillionTokens: 1_000_000_000 },
  ]));
  check(textEstimate.estimate.pricingCoverage, 'text-token-categories');
  check(textEstimate.withinUserCap, false);
  check(textEstimate.executionAuthorized, false);
  check(textEstimate.providerSubmission, 'not_performed');
  const textQuotesPath = '/api/llm/quotes';
  await call('GET', undefined, { path: textQuotesPath, user: null, status: 401 });
  await call('POST', {}, { path: textQuotesPath, origin: 'https://attacker.example', status: 403 });
  await call('GET', undefined, { path: textQuotesPath, user: bob, status: 403 });
  const textParent = { id: randomUUID(), title: 'Synthetic direct-text accounting test', templateId: 'article' };
  await call('POST', textParent, { user: alice, status: 201 });
  const textQuoteInput = {
    requestId: randomUUID(), parentJobId: textParent.id, parentBudgetLimitMinor: 3,
    model: 'fixture-model', prompt: 'fixture prompt', maxOutputTokens: 100,
    maximumBudgetMinor: 3, currency: 'USD', saveResult: false,
  };
  await call('POST', { ...textQuoteInput, maximumBudgetMinor: undefined }, {
    path: textQuotesPath, status: 400,
  });
  const preparedText = await call('POST', textQuoteInput, { path: textQuotesPath, status: 201 });
  check(preparedText.execution.state, 'quoted');
  check(preparedText.execution.quote.ceiling.maximumChargeMinor, 2);
  check(preparedText.execution.rateCard.modelId, 'fixture-model');
  check(preparedText.execution.rateCard.unit, 'millionths_of_currency_minor_unit_per_million_tokens');
  check(preparedText.execution.rateCard.signature, undefined);
  check(preparedText.executionAvailable, false);
  check(preparedText.providerSubmission, 'not_performed');
  check(preparedText.execution.budgetIsFundedWalletBalance, false);
  const deviceTextQuoteInput = {
    ...textQuoteInput,
    requestId: randomUUID(),
    parentJobId: randomUUID(),
  };
  // Device quotes must belong to an active job owned by the same bearer session.
  await call('POST', {
    id: deviceTextQuoteInput.parentJobId,
    title: 'Synthetic device direct-text accounting test', templateId: 'article',
  }, { user: null, headers: deviceHomeHeaders, status: 201 });
  const devicePreparedText = await call('POST', deviceTextQuoteInput, {
    path: textQuotesPath, user: null, headers: deviceHomeHeaders, status: 201,
  });
  check(devicePreparedText.execution.state, 'quoted');
  check(devicePreparedText.executionAvailable, false);
  const deviceHomeWithQuote = await call('GET', undefined, {
    path: deviceHomePath, user: null, headers: deviceHomeHeaders,
  });
  check(deviceHomeWithQuote.recentLlm[0].id, devicePreparedText.execution.id);
  check(deviceHomeWithQuote.recentLlm[0].state, 'quoted');
  check(deviceHomeWithQuote.recentLlm[0].queueState, 'awaiting_approval');
  check(deviceHomeWithQuote.recentLlm[0].spending.status, 'not_running');
  check(deviceHomeWithQuote.recentLlm[0].spending.providerMeter, 'not_reported');
  check(deviceHomeWithQuote.recentLlm[0].spending.invoiceVerified, false);
  check(deviceHomeWithQuote.recentLlm[0].result, null);
  check(deviceHomeWithQuote.recentLlm[0].rateCard.unit, 'millionths_of_currency_minor_unit_per_million_tokens');
  check(deviceHomeWithQuote.execution.cloudLlmAvailable, false);
  check(deviceHomeWithQuote.execution.invoiceVerified, false);
  check(deviceHomeWithQuote.execution.fundedWallet, false);
  check(JSON.stringify(deviceHomeWithQuote).includes('fixture prompt'), false);
  const sameText = await call('POST', textQuoteInput, { path: textQuotesPath });
  check(sameText.inserted, false);
  check(sameText.execution.id, preparedText.execution.id);
  await call('POST', { ...textQuoteInput, prompt: 'Changed synthetic input' }, {
    path: textQuotesPath, status: 409,
  });
  const textItemPath = `${textQuotesPath}/${preparedText.execution.id}`;
  await call('GET', undefined, { path: textItemPath, user: bob, status: 403 });
  check((await call('GET', undefined, { path: textItemPath })).execution.state, 'quoted');
  await call('POST', { action: 'approve', approvalDigest: preparedText.execution.approvalDigest, consent: false }, {
    path: textItemPath, status: 400,
  });
  await call('POST', { action: 'approve', approvalDigest: '0'.repeat(64), consent: true }, {
    path: textItemPath, status: 409,
  });
  const textApproval = { action: 'approve', approvalDigest: preparedText.execution.approvalDigest, consent: true };
  const reservedText = await call('POST', textApproval, { path: textItemPath });
  check(reservedText.execution.state, 'reserved');
  check(reservedText.providerSubmission, 'not_performed');
  check((await call('POST', textApproval, { path: textItemPath })).execution.state, 'reserved');
  const textPool = () => database.prepare(`SELECT reserved_minor AS reservedMinor, settled_minor AS settledMinor
    FROM agent_delegation_budget_pools WHERE owner_user_id = ? AND parent_job_id = ?`)
    .bind(alice, textParent.id).first();
  check((await textPool()).reservedMinor, 2);
  const textCancelled = await call('POST', { ...textApproval, action: 'cancel' }, { path: textItemPath });
  check(textCancelled.execution.state, 'cancelled');
  check((await textPool()).reservedMinor, 0);
  check((await textPool()).settledMinor, 0);
  check((await call('GET', undefined, { path: textItemPath })).execution.state, 'cancelled');
  await call('POST', textApproval, { path: textItemPath, status: 409 });
  check((await database.prepare('SELECT COUNT(*) AS count FROM remote_ai_text_executions WHERE owner_user_id = ? AND request_id = ?')
    .bind(alice, textQuoteInput.requestId).first()).count, 1);
  check((await call('GET', undefined, { path: textQuotesPath })).executions.some(row => row.id === preparedText.execution.id), true);
  const parentTextHistory = await call('GET', undefined, { path: `${textQuotesPath}?parentJobId=${textParent.id}` });
  check(parentTextHistory.executions.length, 1);
  check(parentTextHistory.executions[0].id, preparedText.execution.id);
  check((await call('GET', undefined, { path: `${textQuotesPath}?parentJobId=${randomUUID()}` })).executions.length, 0);
  await call('GET', undefined, { path: `${textQuotesPath}?parentJobId=%2Fother`, status: 400 });
  // Actual D1 binding + shared coordinator, with a synthetic provider fetch.
  // The public pricing gate stays closed; this is not production provider acceptance.
  const verifiedTextRate = await verifyRemoteAiRateCard(textRateCard,
    { providerId: 'openai', modelId: 'fixture-model', currency: 'USD' }, async () => remoteAiRatePublicKey);
  assert.ok(verifiedTextRate);
  const completedTextInput = { ...textQuoteInput, requestId: randomUUID(), saveResult: true };
  const completingText = (await call('POST', completedTextInput, { path: textQuotesPath, status: 201 })).execution;
  await call('POST', { action: 'approve', consent: true, approvalDigest: completingText.approvalDigest }, {
    path: `${textQuotesPath}/${completingText.id}`,
  });
  const directStore = new RemoteAiTextStore(database);
  let directProviderSubmissions = 0;
  const directOptions = {
    store: directStore, ownerId: alice, id: completingText.id, approvalDigest: completingText.approvalDigest,
    intent: { ownerId: alice, requestId: completedTextInput.requestId, model: 'fixture-model',
      prompt: completedTextInput.prompt, maxOutputTokens: completedTextInput.maxOutputTokens, maximumBudgetMinor: 3 },
    verified: verifiedTextRate, runtimeEnv: { OPENAI_API_KEY: 'synthetic-provider-key-only' },
    fetchImpl: async (url, init) => {
      directProviderSubmissions++;
      check(url, 'https://api.openai.com/v1/responses');
      check(JSON.parse(init.body).store, false);
      check(JSON.parse(init.body).service_tier, 'default');
      check(init.headers['X-Client-Request-Id'], completingText.id);
      return Response.json({ id: 'resp_synthetic_d1', model: 'fixture-model', service_tier: 'default', status: 'completed',
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15,
          input_tokens_details: { cached_tokens: 4, cache_write_tokens: 3 } },
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Synthetic quoted provider result' }] }] });
    },
  };
  const directInputKey = 'ab'.repeat(32);
  const persistSyntheticRemoteAiInput = async (execution, intent) => {
    const encrypted = await encryptRemoteAiTextInput(intent, directInputKey, alice, execution.id);
    const saved = await directStore.saveInput(alice, execution.id, execution.approvalDigest, encrypted);
    check(saved.inserted, true);
  };
  await persistSyntheticRemoteAiInput(completingText, directOptions.intent);
  check((await executeReservedRemoteAiText(directOptions)).record.state, 'completed');
  check((await executeReservedRemoteAiText(directOptions)).providerSubmission, 'not_repeated');
  check(directProviderSubmissions, 1);
  const completedReadback = (await call('GET', undefined, { path: `${textQuotesPath}/${completingText.id}` })).execution;
  check(completedReadback.resultText, 'Synthetic quoted provider result');
  check(completedReadback.price.items.length, 4);
  check(completedReadback.invoiceVerified, false);
  check((await textPool()).reservedMinor, 0);
  check((await textPool()).settledMinor, 1);
  const downloadTextPath = `${textQuotesPath}/${completingText.id}?download=1`;
  const downloadedText = await fetch(`${base}${downloadTextPath}`, {
    headers: { 'oai-authenticated-user-id': alice }, signal: AbortSignal.timeout(10000),
  });
  check(downloadedText.status, 200);
  check(downloadedText.headers.get('content-type'), 'text/markdown; charset=utf-8');
  check(downloadedText.headers.get('cache-control'), 'private, no-store');
  check(downloadedText.headers.get('x-content-type-options'), 'nosniff');
  check(downloadedText.headers.get('content-disposition'), `attachment; filename="sky-ai-${completingText.id}.md"`);
  check(await downloadedText.text(), completedReadback.resultText);
  await call('GET', undefined, { path: downloadTextPath, user: null, status: 401 });
  await call('GET', undefined, { path: downloadTextPath, user: bob, status: 403 });
  await call('GET', undefined, { path: `${textItemPath}?download=1`, status: 404 });
  const deletedText = await call('DELETE', undefined, { path: `${textQuotesPath}/${completingText.id}` });
  check(deletedText.resultDeleted, true);
  check(deletedText.execution.price.chargeMinor, 1);
  await call('GET', undefined, { path: downloadTextPath, status: 404 });
  check((await call('GET', undefined, { path: `${textQuotesPath}/${completingText.id}` })).execution.state, 'completed');
  check(directProviderSubmissions, 1);
  check((await textPool()).settledMinor, 1);
  const timeoutInput = { ...textQuoteInput, requestId: randomUUID() };
  const timeoutText = (await call('POST', timeoutInput, { path: textQuotesPath, status: 201 })).execution;
  await call('POST', { action: 'approve', consent: true, approvalDigest: timeoutText.approvalDigest }, {
    path: `${textQuotesPath}/${timeoutText.id}`,
  });
  let directTimeoutSubmissions = 0;
  const timeoutOptions = { ...directOptions, id: timeoutText.id, approvalDigest: timeoutText.approvalDigest,
    intent: { ...directOptions.intent, requestId: timeoutInput.requestId },
    fetchImpl: async () => { directTimeoutSubmissions++; throw new DOMException('Synthetic timeout', 'AbortError'); } };
  await persistSyntheticRemoteAiInput(timeoutText, timeoutOptions.intent);
  await assert.rejects(executeReservedRemoteAiText(timeoutOptions), error => error.code === 'UPSTREAM_TIMEOUT');
  check((await executeReservedRemoteAiText(timeoutOptions)).providerSubmission, 'not_repeated');
  check(directTimeoutSubmissions, 1);
  const timeoutReadback = (await call('GET', undefined, { path: `${textQuotesPath}/${timeoutText.id}` })).execution;
  check(timeoutReadback.state, 'unreconciled');
  check(timeoutReadback.errorCode, 'UPSTREAM_TIMEOUT');
  check((await textPool()).reservedMinor, 2);
  check((await textPool()).settledMinor, 1);
  await call('POST', { action: 'cancel', consent: true, approvalDigest: timeoutText.approvalDigest }, {
    path: `${textQuotesPath}/${timeoutText.id}`, status: 409,
  });
  const overBudgetText = (await call('POST', { ...textQuoteInput, requestId: randomUUID() }, {
    path: textQuotesPath, status: 201,
  })).execution;
  await call('POST', { action: 'approve', consent: true, approvalDigest: overBudgetText.approvalDigest }, {
    path: `${textQuotesPath}/${overBudgetText.id}`, status: 409,
  });
  check((await textPool()).reservedMinor + (await textPool()).settledMinor, 3);
  await call('PATCH', { action: 'revoke', providerId: 'openai', cardId: textRateCard.cardId }, {
    path: rateCardAdminPath, user: null, headers: { Authorization: `Bearer ${remoteAiRateIngestToken}` },
  });
  check((await call('POST', estimateBody, { path: '/api/llm/estimate', user: alice, status: 503 })).code,
    'REMOTE_AI_RATE_CARD_UNAVAILABLE');
  remoteLlmEnabled = true;
  await stop();
  await start();
  for (const path of ['/api/legal-guidance', '/api/patent-research', '/api/jev-evaluation']) {
    const deniedSkyTool = await call('POST', {}, { path, user: bob, status: 403 });
    check(deniedSkyTool.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  }
  const pricedLlm = await call('POST', {
    provider: 'openai', prompt: 'fixture prompt', consent: true,
  }, { path: '/api/llm/text', user: alice, status: 503 });
  check(pricedLlm.code, 'REMOTE_AI_PRICING_GATE_UNAVAILABLE');
  remoteModelEndpoint = 'https://models.example.test';
  await stop();
  await start();
  const remoteOllama = await call('POST', {
    provider: 'ollama', model: 'fixture:latest', prompt: 'fixture prompt', consent: true,
  }, { path: '/api/llm/text', user: alice, status: 503 });
  check(remoteOllama.code, 'REMOTE_AI_PRICING_GATE_UNAVAILABLE');
  for (const provider of ['local-model', 'openai-compatible']) {
    const remoteLocalLabel = await call('POST', {
      provider, model: 'fixture:latest', prompt: 'fixture prompt', consent: true,
    }, { path: '/api/llm/text', user: alice, status: 503 });
    check(remoteLocalLabel.code, 'REMOTE_AI_PRICING_GATE_UNAVAILABLE');
  }
  remoteModelEndpoint = 'http://127.0.0.1:11434';
  await stop();
  await start();
  for (const path of ['/api/legal-guidance', '/api/patent-research', '/api/jev-evaluation']) {
    const deniedPaidTool = await call('POST', {}, { path, user: alice, status: 503 });
    check(deniedPaidTool.code, 'REMOTE_AI_PRICING_GATE_UNAVAILABLE');
  }
  remoteLlmEnabled = false;
  await stop();
  await start();
  const refundEvent = {
    schema: ROCKSTAR_ENTITLEMENT_EVENT_SCHEMA,
    issuerId: entitlementClaim.issuerId,
    issuerKeyId: entitlementClaim.issuerKeyId,
    eventId: 'api-check-refund-001',
    claimId: entitlementClaim.claimId,
    purchaseReferenceSha256: entitlementClaim.purchaseReferenceSha256,
    eventType: 'refunded',
    issuedAt: Date.now(),
    signature: '',
  };
  refundEvent.signature = sign(null, rockstarEntitlementEventSigningBytes(refundEvent), serviceEntitlementIssuerKeyPair.privateKey).toString('base64url');
  const refundPath = '/api/rockstar/entitlements/events';
  check((await call('POST', { event: refundEvent }, { path: refundPath, user: null })).status, 'refunded');
  const duplicateRefund = await call('POST', { event: refundEvent }, { path: refundPath, user: null });
  check(duplicateRefund.alreadyApplied, true);
  const conflictingRefund = { ...refundEvent, eventType: 'revoked' };
  conflictingRefund.signature = sign(null, rockstarEntitlementEventSigningBytes(conflictingRefund), serviceEntitlementIssuerKeyPair.privateKey).toString('base64url');
  await call('POST', { event: conflictingRefund }, { path: refundPath, user: null, status: 409 });
  const refundedEntitlements = await call('GET', undefined, { path: entitlementPath });
  check(refundedEntitlements.entitlements[0].status, 'refunded');
  const pendingPurchaseHash = createHash('sha256').update('synthetic-pending-purchase-line').digest('hex');
  const pendingPackage = await issueRockstarEntitlementClaim({
    issuerId: 'api-check-retailer',
    issuerKeyId: 'api-check-retailer-key-1',
    offerId: 'rockstar-sim-standard-v1',
    purchaseReferenceSha256: pendingPurchaseHash,
    formFactor: 'esim',
    scopes: ['rockstaros_access', 'sky', 'zema', 'agents'],
  }, serviceEntitlementIssuerSigningKey);
  const preRedemptionCancellation = await issueRockstarEntitlementEvent({
    issuerId: pendingPackage.claim.issuerId,
    issuerKeyId: pendingPackage.claim.issuerKeyId,
    claimId: pendingPackage.claim.claimId,
    purchaseReferenceSha256: pendingPackage.claim.purchaseReferenceSha256,
    eventType: 'revoked',
  }, serviceEntitlementIssuerSigningKey);
  const pendingCancellationResult = await call('POST', { event: preRedemptionCancellation }, {
    path: refundPath, user: null,
  });
  check(pendingCancellationResult.status, 'revoked');
  check(pendingCancellationResult.alreadyApplied, false);
  const deniedCancelledCode = await call('POST', pendingPackage, { path: entitlementPath, status: 409 });
  check(deniedCancelledCode.error, 'この購入claimは販売元で取消済みです。新しい案内をご確認ください。');
  const replacementPackage = await issueRockstarEntitlementClaim({
    issuerId: pendingPackage.claim.issuerId,
    issuerKeyId: pendingPackage.claim.issuerKeyId,
    offerId: pendingPackage.claim.offerId,
    purchaseReferenceSha256: pendingPurchaseHash,
    formFactor: pendingPackage.claim.formFactor,
    scopes: ['rockstaros_access'],
  }, serviceEntitlementIssuerSigningKey);
  const replacementRedemption = await call('POST', replacementPackage, {
    path: entitlementPath, status: 201,
  });
  check(replacementRedemption.entitlement.claimId, replacementPackage.claim.claimId);
  check(replacementRedemption.entitlement.ownerUserId, alice);
  await call('POST', {}, { path: a2aDelegationPath, user: alice, status: 403 });
  serviceEntitlementEnforcementEnabled = false;
  await stop();
  await start();
  const esimOrderId = randomUUID();
  await database.prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    esimOrderId, alice, 'api-check-seller', 'live', 'api-check-esim', esimPackageHash,
    'API eSIM plan', 1500, 0, 0, 'jpy', 'acct_api_check', 1,
    'https://example.invalid/terms', 'fixture only', 'paid', null, Date.now(), Date.now(),
  ).run();
  check(
    (await call('GET', undefined, { path: '/api/health', user: null })).status,
    'ok',
  );
  await call('GET', undefined, { user: null, status: 401 });
  for (let attempt = 0; attempt < 20; attempt++) {
    await call('POST', {}, { origin: 'https://not-rock.invalid', status: 403 });
    await call('POST', '{', { raw: true, status: 400 });
  }
  await call('POST', 'x'.repeat(12001), { raw: true, status: 413 });
  const esimIssuePath = `/api/esim/orders/${randomUUID()}/issue`;
  await call('POST', {}, { path: esimIssuePath, user: null, status: 401 });
  await call('POST', {}, { path: esimIssuePath, status: 409 });
  await call('POST', {}, { path: esimIssuePath, user: bob, status: 409 });
  const disabledEsimIssue = await call('POST', {}, {
    path: `/api/esim/orders/${esimOrderId}/issue`, status: 503,
  });
  check(disabledEsimIssue.error, 'esim_issuance_disabled');
  const esimStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(esimStatus.state, 'paid_waiting_for_esim_issuance');
  const cloudAccessPath = `/api/esim/orders/${esimOrderId}/cloud-access`;
  await call('POST', 'x'.repeat(1025), { path: cloudAccessPath, raw: true, status: 413 });
  check((await call('GET', undefined, { path: cloudAccessPath })).available, false);
  await call('POST', { action: 'issue' }, { path: cloudAccessPath, status: 409 });
  await call('GET', undefined, { path: cloudAccessPath, user: bob, status: 404 });
  await call('GET', undefined, { path: cloudAccessPath, user: null, status: 401 });
  await call('POST', { action: 'issue' }, { path: cloudAccessPath, origin: 'https://elsewhere.invalid', status: 403 });
  await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`, user: bob, status: 404,
  });
  const ordinaryPaidOrderId = randomUUID();
  await database.prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    ordinaryPaidOrderId, alice, 'api-check-seller', 'live', 'api-check-tool', 'f'.repeat(64),
    'API ordinary paid tool', 1500, 0, 0, 'jpy', 'acct_api_check', 1,
    'https://example.invalid/terms', 'fixture only', 'paid', null, Date.now(), Date.now(),
  ).run();
  const ordinaryOrderStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${ordinaryPaidOrderId}/status`,
  });
  check(ordinaryOrderStatus.state, 'not_esim_order');
  const installMaterialPath = `/api/esim/orders/${esimOrderId}/install-material`;
  await call('POST', { action: 'fetch', deliveryRequestId: randomUUID() }, {
    path: installMaterialPath, user: null, status: 401,
  });
  const notReadyInstallMaterial = await call('POST', {
    action: 'fetch', deliveryRequestId: randomUUID(),
  }, { path: installMaterialPath, status: 409 });
  check(notReadyInstallMaterial.error, 'install_material_not_ready');
  const installDeliveryId = randomUUID();
  const quickInstallProfile = {
    iccid: '89445385320081602228',
    matchingId: 'api-check-matching-secret',
    smdpAddress: 'rsp.api-check.example',
    appleInstallUrl: 'https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example.test%24APPLE-CODE',
    androidInstallUrl: 'https://esimsetup.android.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example.test%24ANDROID-CODE',
  };
  const encryptedInstallMaterial = await encryptEsimInstallMaterial(
    quickInstallProfile, 'f'.repeat(64), alice, esimOrderId,
  );
  const apiInstallCatalog = parseEsimServerPlanCatalog(JSON.stringify({
    version: 'api-check-install-v1',
    plans: [{
      packageKey: 'api-check-esim', manifestSha256: esimPackageHash,
      providerBundleName: 'fixture_jp_1gb', providerCurrency: 'USD', maximumWholesaleMinor: 1000,
      retailCurrency: 'jpy', retailAmountMinor: 1500, providerMinorToRetailNumerator: 1,
      providerMinorToRetailDenominator: 1, providerFeeReserveRetailMinor: 100,
      minimumGrossMarginRetailMinor: 200,
      starterAgentPack: { id: 'lifeline', version: '1.0.0', packages: [{
        packageKey: esimStarterPackageKey, manifestSha256: esimStarterPackageHash,
      }] },
    }],
  }));
  const apiInstallPricing = await createEsimPricingSnapshot(apiInstallCatalog, apiInstallCatalog.plans[0]);
  await database.prepare(`INSERT INTO esim_provider_orders
    (sky_order_id,provider,owner_user_id,package_key,manifest_sha256,pricing_snapshot_json,
     pricing_snapshot_sha256,provider_bundle_name,quote_digest,quote_total,quote_currency,state,
     provider_order_reference,profile_digest,install_material_ciphertext,install_material_nonce,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    esimOrderId, 'esim-go-v3', alice, 'api-check-esim', esimPackageHash,
    apiInstallPricing.canonicalJson, apiInstallPricing.sha256, 'fixture_jp_1gb', 'b'.repeat(64),
    '9.00', 'USD', 'profile_bound', 'api-check-provider-ref', 'c'.repeat(64),
    encryptedInstallMaterial.ciphertext, encryptedInstallMaterial.nonce, Date.now(), Date.now(),
  ).run();
  await database.prepare(`INSERT INTO esim_provider_profile_bindings
    (profile_digest,provider,owner_user_id,sky_order_id,package_key,manifest_sha256,created_at)
    VALUES (?,?,?,?,?,?,?)`).bind(
    'c'.repeat(64), 'esim-go-v3', alice, esimOrderId, 'api-check-esim', esimPackageHash, Date.now(),
  ).run();
  const readyEsimStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(readyEsimStatus.state, 'profile_bound_install_material_ready');
  check(readyEsimStatus.providerProfileBoundToOrder, true);
  check(readyEsimStatus.deviceInstallState, 'unverified');
  check(readyEsimStatus.esimDeviceEntitlementState, 'not_connected');
  check(readyEsimStatus.starterAgentPack, {
    id: 'lifeline', version: '1.0.0', packageCount: 1,
    packages: [{
      packageKey: esimStarterPackageKey, name: null, summary: null,
      reviewState: 'unavailable',
    }],
  });
  const reviewedAt = Date.now();
  await database.prepare(`INSERT INTO sky_tool_packages
    (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
    VALUES (?,?,?,?,?,?,'verified',?,?,?)`).bind(
    esimStarterPackageKey, esimStarterPackage.id, esimStarterPackage.version, alice,
    JSON.stringify(esimStarterPackage), esimStarterPackageHash, reviewedAt, reviewedAt, reviewedAt,
  ).run();
  await database.prepare(`INSERT INTO sky_tool_package_reviews
    (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES (?,?,?,?,'verified','{}','{}','synthetic API fixture review',?,NULL)`).bind(
    randomUUID(), esimStarterPackageKey, esimStarterPackageHash, 'fixture-reviewer', reviewedAt,
  ).run();
  const packageBindingNow = Date.now();
  const packageBinding = {
    schema: SKY_PACKAGE_RUNTIME_BINDING_SCHEMA,
    providerId: 'api-check-agent-host', keyId: 'api-check-package-binding-key',
    bindingId: 'api-check-offline-guide-binding',
    agentOrigin: skyPackageBindingAgentOrigin, agentName: 'Fixture Agent', agentVersion: '1.0.0',
    agentCardSha256: 'a'.repeat(64), packageKey: esimStarterPackageKey,
    manifestSha256: esimStarterPackageHash, operationId: 'offline-guide.run',
    runtime: 'a2a-jsonrpc-1.0',
    runtimeExtensionUri: skyPackageRuntimeExtensionUri,
    inputSchemaSha256: await skyPackageSchemaSha256(esimStarterPackage.io.inputSchema),
    outputSchemaSha256: await skyPackageSchemaSha256(esimStarterPackage.io.outputSchema),
    pricingVersion: 'fixture-pricing-v1',
    requiredUsage: [{ meter: 'agent_tokens', unit: 'token' }],
    issuedAt: packageBindingNow, expiresAt: packageBindingNow + 60_000, signature: '',
  };
  packageBinding.signature = sign(
    null, skyPackageRuntimeBindingSigningBytes(packageBinding), skyPackageBindingKeyPair.privateKey,
  ).toString('base64url');
  const packageBindingPath = '/api/internal/sky-package-runtime-bindings';
  const mismatchedSchemaBinding = {
    ...packageBinding,
    bindingId: 'api-check-wrong-schema-binding',
    inputSchemaSha256: 'f'.repeat(64),
    signature: '',
  };
  mismatchedSchemaBinding.signature = sign(
    null, skyPackageRuntimeBindingSigningBytes(mismatchedSchemaBinding), skyPackageBindingKeyPair.privateKey,
  ).toString('base64url');
  await call('POST', { binding: mismatchedSchemaBinding }, {
    path: packageBindingPath, user: null, status: 409,
    headers: { Authorization: `Bearer ${skyPackageBindingOperatorToken}` },
  });
  await call('POST', { binding: packageBinding }, {
    path: packageBindingPath, user: null, status: 401,
  });
  await call('POST', { binding: packageBinding }, {
    path: packageBindingPath, user: null, status: 401,
    headers: { Authorization: 'Bearer incorrect-token-which-is-long-enough-to-parse-123456' },
  });
  const registeredPackageBinding = await call('POST', { binding: packageBinding }, {
    path: packageBindingPath, user: null,
    headers: { Authorization: `Bearer ${skyPackageBindingOperatorToken}` }, status: 201,
  });
  check(registeredPackageBinding.inserted, true);
  check((await new SkyPackageRuntimeBindingStore(database)
    .findActive(skyPackageBindingAgentOrigin, esimStarterPackageKey, esimStarterPackageHash)).length, 1);
  const duplicatePackageBinding = await call('POST', { binding: packageBinding }, {
    path: packageBindingPath, user: null,
    headers: { Authorization: `Bearer ${skyPackageBindingOperatorToken}` },
  });
  check(duplicatePackageBinding.inserted, false);
  const tamperedPackageBinding = { ...packageBinding, operationId: 'other.operation' };
  await call('POST', { binding: tamperedPackageBinding }, {
    path: packageBindingPath, user: null, status: 400,
    headers: { Authorization: `Bearer ${skyPackageBindingOperatorToken}` },
  });
  const revokedPackageBinding = await call('PATCH', {
    action: 'revoke', bindingId: packageBinding.bindingId,
  }, {
    path: packageBindingPath, user: null,
    headers: { Authorization: `Bearer ${skyPackageBindingOperatorToken}` },
  });
  check(revokedPackageBinding.revoked, true);
  check(revokedPackageBinding.alreadyRevoked, false);
  check((await new SkyPackageRuntimeBindingStore(database)
    .findActive(skyPackageBindingAgentOrigin, esimStarterPackageKey, esimStarterPackageHash)).length, 0);
  await call('POST', { binding: packageBinding }, {
    path: packageBindingPath, user: null, status: 409,
    headers: { Authorization: `Bearer ${skyPackageBindingOperatorToken}` },
  });
  const activePackStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(activePackStatus.starterAgentPack.packages, [{
    packageKey: esimStarterPackageKey,
    name: 'Offline Guide',
    summary: 'Provides a short offline help guide.',
    reviewState: 'active',
  }]);
  const activeEntitlements = await call('GET', undefined, { path: entitlementPath });
  check(activeEntitlements.entitlements[0].serviceProfile, {
    state: 'ready', profileId: 'lifeline', version: '1.0.0', label: 'Lifeline',
    activation: 'owner_choice_required', packageCount: 1,
    packages: [{ packageKey: esimStarterPackageKey, name: 'Offline Guide', state: 'ready' }],
  });
  const activeDeviceHome = await call('GET', undefined, {
    path: '/api/rockstar/device-home', user: null,
    headers: { Authorization: `Bearer ${deviceGrant.accessToken}` },
  });
  check(activeDeviceHome.entitlements[0].serviceProfile.profileId, 'lifeline');
  check(activeDeviceHome.entitlements[0].serviceProfile.activation, 'owner_choice_required');
  const installProofPath = `/api/esim/orders/${esimOrderId}/install-proof`;
  await call('POST', { action: 'challenge', deviceRef: 'api-check-device' }, {
    path: installProofPath, user: bob, status: 404,
  });
  const installChallenge = await call('POST', {
    action: 'challenge', deviceRef: 'api-check-device',
  }, { path: installProofPath });
  check(installChallenge.state, 'challenge_issued');
  const validInstallReceipt = signedInstallReceipt({
    ownerUserId: alice,
    orderId: esimOrderId,
    profileDigest: 'c'.repeat(64),
    challenge: installChallenge,
    deviceRef: 'api-check-device',
  });
  await call('POST', {
    action: 'submit',
    challengeId: installChallenge.challengeId,
    challengeNonce: installChallenge.challengeNonce,
    receipt: { ...validInstallReceipt, deviceRef: 'api-check-other-device' },
  }, { path: installProofPath, status: 422 });
  const installSubmission = {
    action: 'submit',
    challengeId: installChallenge.challengeId,
    challengeNonce: installChallenge.challengeNonce,
    receipt: validInstallReceipt,
  };
  const installSubmissionResults = await Promise.all([
    call('POST', installSubmission, { path: installProofPath }),
    call('POST', installSubmission, { path: installProofPath }),
  ]);
  check(installSubmissionResults.map((result) => result.state).sort((left, right) => left.localeCompare(right)),
    ['already_verified', 'verified']);
  const proofInstalledStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(proofInstalledStatus.deviceInstallState, 'verified_installed_enabled');
  check(proofInstalledStatus.esimDeviceEntitlementState, 'not_connected');
  check(proofInstalledStatus.starterPackActivationState, 'awaiting_authenticated_device_gateway');
  const deviceEntitlementPath = `/api/esim/orders/${esimOrderId}/device-entitlement`;
  await call('POST', { action: 'challenge' }, {
    path: deviceEntitlementPath, user: bob, status: 404,
  });
  const deviceEntitlementChallenge = await call('POST', { action: 'challenge' }, {
    path: deviceEntitlementPath,
  });
  check(deviceEntitlementChallenge.state, 'challenge_issued');
  check(deviceEntitlementChallenge.deviceRef, 'api-check-device');
  check(deviceEntitlementChallenge.receiptContext, {
    ownerUserId: alice,
    orderId: esimOrderId,
    profileDigest: 'c'.repeat(64),
    deviceRef: 'api-check-device',
    installReceiptSha256: createHash('sha256')
      .update(esimInstallReceiptSigningBytes(validInstallReceipt)).digest('hex'),
    starterPackId: 'lifeline',
    starterPackVersion: '1.0.0',
    attestedGatewayAuthorityId: 'android-key-attestation-google',
    attestedGatewayKeyId: 'sha256-of-uncompressed-p256-public-key',
    attestedApplicationPackage: 'dev.rock.automation',
  });
  const installReceiptSha256 = createHash('sha256')
    .update(esimInstallReceiptSigningBytes(validInstallReceipt)).digest('hex');
  const starterPackManifestSha256 = createHash('sha256')
    .update(JSON.stringify(apiInstallPricing.plan.starterAgentPack)).digest('hex');
  const signedDeviceEntitlement = signedDeviceEntitlementReceipt({
    ownerUserId: alice,
    orderId: esimOrderId,
    profileDigest: 'c'.repeat(64),
    challenge: deviceEntitlementChallenge,
    deviceRef: 'api-check-device',
    installReceiptSha256,
    starterPack: apiInstallPricing.plan.starterAgentPack,
    starterPackManifestSha256,
  });
  await call('POST', {
    action: 'submit',
    challengeId: deviceEntitlementChallenge.challengeId,
    challengeNonce: deviceEntitlementChallenge.challengeNonce,
    receipt: { ...signedDeviceEntitlement, starterPackManifestSha256: 'd'.repeat(64) },
  }, { path: deviceEntitlementPath, status: 422 });
  const deviceEntitlementSubmission = {
    action: 'submit',
    challengeId: deviceEntitlementChallenge.challengeId,
    challengeNonce: deviceEntitlementChallenge.challengeNonce,
    receipt: signedDeviceEntitlement,
  };
  const deviceEntitlementResults = await Promise.all([
    call('POST', deviceEntitlementSubmission, { path: deviceEntitlementPath }),
    call('POST', deviceEntitlementSubmission, { path: deviceEntitlementPath }),
  ]);
  check(deviceEntitlementResults.map((result) => result.state).sort((left, right) => left.localeCompare(right)),
    ['activated', 'already_active']);
  const activeEntitlementStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(activeEntitlementStatus.esimDeviceEntitlementState, 'active');
  check(activeEntitlementStatus.starterPackActivationState, 'active_on_authenticated_device');
  check(typeof activeEntitlementStatus.starterPackActivatedAt, 'number');

  // Worker+D1 fixture only: no carrier request or billable cloud execution.
  let cloudCookie;
  const captureCloudCookie = (response) => {
    const cookie = response.headers.get('set-cookie');
    check(cookie.includes('HttpOnly; SameSite=Strict'), true);
    check(cookie.includes('Path=/api'), true);
    cloudCookie = cookie.split(';')[0];
  };
  const cloudIssued = await call('POST', { action: 'issue' }, {
    path: cloudAccessPath, status: 201, inspectResponse: captureCloudCookie,
  });
  check(cloudIssued.state, 'active');
  const cloudEntitlements = await call('GET', undefined, { path: '/api/rockstar/entitlements', user: null, headers: { Cookie: cloudCookie } });
  check(cloudEntitlements.esimAccess[0].starterAgentPack.packages[0].packageKey, esimStarterPackageKey);
  check(JSON.stringify(cloudIssued).includes('rock_esim_'), false);
  const originalCloudCookie = cloudCookie;
  const cloudToken = () => cloudCookie.slice(cloudCookie.indexOf('=') + 1);
  const cloudHome = await call('GET', undefined, { path: '/api/rockstar/device-home', user: null, headers: { Cookie: cloudCookie } });
  check(cloudHome.access, { rockstaros: true, sky: true, zema: true, agents: true });
  await call('GET', undefined, { user: null, headers: { Cookie: cloudCookie } });
  await call('PATCH', { action: 'unknown' }, { path: `/api/sky/a2a-delegations/${randomUUID()}`, user: null, headers: { Cookie: cloudCookie }, status: 400 });
  await database.prepare('UPDATE esim_cloud_access_keys SET scopes_json=? WHERE id=?').bind(JSON.stringify(['rockstaros_access']), cloudIssued.key.id).run();
  const limitedHome = await call('GET', undefined, { path: '/api/rockstar/device-home', user: null,
    headers: { Cookie: cloudCookie, 'oai-authenticated-user-email': 'untrusted@example.invalid' } });
  check(limitedHome.access, { rockstaros: true, sky: false, zema: false, agents: false });
  await call('GET', undefined, { user: null, headers: { Cookie: cloudCookie }, status: 401 });
  await database.prepare('UPDATE esim_cloud_access_keys SET scopes_json=? WHERE id=?').bind(JSON.stringify(['rockstaros_access', 'sky', 'zema', 'agents']), cloudIssued.key.id).run();
  await call('GET', undefined, { path: cloudAccessPath, user: null, headers: { Cookie: cloudCookie }, status: 401 });
  await call('POST', { action: 'rotate', expectedKeyId: cloudIssued.key.id }, {
    path: cloudAccessPath, user: null, headers: { Authorization: `Bearer ${cloudToken()}` }, status: 401,
  });
  await call('POST', {}, { user: null, headers: { Cookie: cloudCookie }, origin: 'https://elsewhere.invalid', status: 403 });
  await call('POST', { action: 'issue' }, { path: cloudAccessPath, status: 409 });
  await call('POST', { action: 'rotate', expectedKeyId: randomUUID() }, { path: cloudAccessPath, status: 409 });
  const rotations = await Promise.all([0, 1].map(() => fetch(`${base}${cloudAccessPath}`, {
    method: 'POST', headers: { 'oai-authenticated-user-id': alice, Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'rotate', expectedKeyId: cloudIssued.key.id }),
  })));
  check(rotations.map((r) => r.status).sort((a, b) => a - b), [201, 409]);
  const winningRotation = rotations.find((r) => r.status === 201);
  captureCloudCookie(winningRotation);
  const rotatedCloud = await winningRotation.json();
  check(rotatedCloud.accessExpiresAt, cloudIssued.accessExpiresAt);
  check(rotatedCloud.key.id === cloudIssued.key.id, false);
  await call('GET', undefined, { path: '/api/rockstar/device-home', user: null, headers: { Cookie: originalCloudCookie }, status: 401 });
  const storedCloudKeys = await database.prepare('SELECT token_sha256,revoked_at FROM esim_cloud_access_keys WHERE sky_order_id=?').bind(esimOrderId).all();
  check(storedCloudKeys.results.length, 2);
  check(storedCloudKeys.results.every((row) => /^[a-f0-9]{64}$/.test(row.token_sha256) && !row.token_sha256.includes(cloudToken())), true);
  await database.prepare('UPDATE sky_commerce_orders SET refunded_minor=1 WHERE id=?').bind(esimOrderId).run();
  check((await call('GET', undefined, { path: cloudAccessPath })).state, 'suspended');
  await call('GET', undefined, { path: '/api/rockstar/device-home', user: null, headers: { Cookie: cloudCookie }, status: 401 });
  await database.prepare('UPDATE sky_commerce_orders SET refunded_minor=0 WHERE id=?').bind(esimOrderId).run();
  await database.prepare('UPDATE esim_cloud_access_keys SET expires_at=created_at+1 WHERE id=?').bind(rotatedCloud.key.id).run();
  check((await call('GET', undefined, { path: cloudAccessPath })).state, 'expired');
  await call('GET', undefined, { path: '/api/rockstar/device-home', user: null, headers: { Cookie: cloudCookie }, status: 401 });
  await call('POST', { action: 'rotate', expectedKeyId: rotatedCloud.key.id }, { path: cloudAccessPath, status: 201, inspectResponse: captureCloudCookie });

  const cloudFixtureConfig = {
    ESIM_CLOUD_ACCESS_POLICIES_JSON: JSON.stringify([{ packageKey: 'api-check-esim', manifestSha256: esimPackageHash,
      accessDurationDays: 60, scopes: ['rockstaros_access', 'sky', 'zema', 'agents'] }]),
    ESIMGO_PLAN_CATALOG_JSON: JSON.stringify({ version: 'fixture', plans: [apiInstallPricing.plan] }),
    ESIM_INSTALL_RECEIPT_KEYS: JSON.stringify([{ issuerId: 'api-check-carrier', keyId: 'api-check-key-1',
      publicKeyHex: Buffer.from(esimIssuerPublicKey).toString('hex'), status: 'active' }]),
    ESIM_DEVICE_GATEWAY_KEYS: JSON.stringify([{ authorityId: 'api-check-oem', ownerUserId: alice,
      deviceRef: 'api-check-device', keyId: 'api-check-device-key-1', algorithm: 'ES256',
      publicKeyHex: Buffer.from(esimDeviceGatewayPublicKey).toString('hex'), status: 'active' }]),
  };
  // Simulate an order refund or explicit revocation after the preflight and before D1's atomic batch.
  for (const race of ['refund', 'revoke']) {
    const beforeRace = await call('GET', undefined, { path: cloudAccessPath });
    const raceDb = { prepare: (sql) => database.prepare(sql), async batch(statements) {
      if (race === 'refund') await database.prepare('UPDATE sky_commerce_orders SET refunded_minor=1 WHERE id=?').bind(esimOrderId).run();
      else await esimCloudAccessStore(database, cloudFixtureConfig).revoke(alice, esimOrderId, beforeRace.key.id);
      return database.batch(statements);
    } };
    await assert.rejects(esimCloudAccessStore(raceDb, cloudFixtureConfig).issue(alice, esimOrderId, beforeRace.key.id), /CLOUD_ACCESS_CONFLICT/);
    assertions++;
    const failedReplacement = await call('GET', undefined, { path: cloudAccessPath });
    check(failedReplacement.state, 'revoked');
    check(failedReplacement.key.id, beforeRace.key.id);
    await database.prepare('UPDATE sky_commerce_orders SET refunded_minor=0 WHERE id=?').bind(esimOrderId).run();
    await call('POST', { action: 'rotate', expectedKeyId: beforeRace.key.id }, { path: cloudAccessPath, status: 201, inspectResponse: captureCloudCookie });
  }

  const rotatedGatewayJwk = rotatedEsimDeviceGatewayKeyPair.publicKey.export({ format: 'jwk' });
  esimDeviceGatewayPublicKey = Buffer.concat([
    Buffer.from([4]), Buffer.from(rotatedGatewayJwk.x, 'base64url'),
    Buffer.from(rotatedGatewayJwk.y, 'base64url'),
  ]);
  await stop();
  await start();
  const rotatedGatewayStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(rotatedGatewayStatus.esimDeviceEntitlementState, 'revoked_or_stale');
  check((await call('GET', undefined, { path: cloudAccessPath })).state, 'suspended');
  await call('GET', undefined, { path: '/api/rockstar/device-home', user: null, headers: { Cookie: cloudCookie }, status: 401 });
  await call('POST', { action: 'challenge' }, {
    path: deviceEntitlementPath, status: 409,
  });
  esimDeviceGatewayPublicKey = originalEsimDeviceGatewayPublicKey;
  await stop();
  await start();
  const restoredRotatedGatewayStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(restoredRotatedGatewayStatus.esimDeviceEntitlementState, 'active');
  esimDeviceGatewayKeyStatus = 'revoked';
  await stop();
  await start();
  const revokedGatewayStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(revokedGatewayStatus.esimDeviceEntitlementState, 'revoked_or_stale');
  await call('POST', { action: 'challenge' }, {
    path: deviceEntitlementPath, status: 409,
  });
  esimDeviceGatewayKeyStatus = 'active';
  esimIssuerKeyStatus = 'revoked';
  await stop();
  await start();
  const revokedInstallIssuerStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(revokedInstallIssuerStatus.deviceInstallState, 'unverified');
  check((await call('GET', undefined, { path: cloudAccessPath })).state, 'suspended');
  await call('GET', undefined, { path: '/api/rockstar/device-home', user: null, headers: { Cookie: cloudCookie }, status: 401 });
  check(revokedInstallIssuerStatus.esimDeviceEntitlementState, 'revoked_or_stale');
  esimIssuerKeyStatus = 'active';
  await stop();
  await start();
  const restoredEntitlementStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(restoredEntitlementStatus.esimDeviceEntitlementState, 'active');
  const activeCloud = await call('GET', undefined, { path: cloudAccessPath });
  check(activeCloud.state, 'active');
  const revokedCloud = await call('POST', { action: 'revoke', expectedKeyId: activeCloud.key.id }, { path: cloudAccessPath });
  check(revokedCloud.state, 'revoked');
  await call('GET', undefined, { path: '/api/rockstar/device-home', user: null, headers: { Cookie: cloudCookie }, status: 401 });
  await call('POST', { action: 'rotate', expectedKeyId: activeCloud.key.id }, { path: cloudAccessPath, status: 201, inspectResponse: captureCloudCookie });
  await call('GET', undefined, { path: '/api/rockstar/device-home', user: null, headers: { Authorization: `Bearer ${cloudToken()}` } });

  const attestedEsimOrderId = randomUUID();
  const attestedProfileDigest = 'd'.repeat(64);
  const attestedDeviceRef = 'api-check-attested-device';
  await database.prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    attestedEsimOrderId, alice, 'api-check-seller', 'live', 'api-check-esim', esimPackageHash,
    'API eSIM attestation route plan', 1500, 0, 0, 'jpy', 'acct_api_check', 1,
    'https://example.invalid/terms', 'fixture only', 'paid', null, Date.now(), Date.now(),
  ).run();
  const attestedInstallMaterial = await encryptEsimInstallMaterial(
    quickInstallProfile, 'f'.repeat(64), alice, attestedEsimOrderId,
  );
  await database.prepare(`INSERT INTO esim_provider_orders
    (sky_order_id,provider,owner_user_id,package_key,manifest_sha256,pricing_snapshot_json,
     pricing_snapshot_sha256,provider_bundle_name,quote_digest,quote_total,quote_currency,state,
     provider_order_reference,profile_digest,install_material_ciphertext,install_material_nonce,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    attestedEsimOrderId, 'esim-go-v3', alice, 'api-check-esim', esimPackageHash,
    apiInstallPricing.canonicalJson, apiInstallPricing.sha256, 'fixture_jp_1gb', 'a'.repeat(64),
    '9.00', 'USD', 'profile_bound', 'api-check-attested-provider-ref', attestedProfileDigest,
    attestedInstallMaterial.ciphertext, attestedInstallMaterial.nonce, Date.now(), Date.now(),
  ).run();
  await database.prepare(`INSERT INTO esim_provider_profile_bindings
    (profile_digest,provider,owner_user_id,sky_order_id,package_key,manifest_sha256,created_at)
    VALUES (?,?,?,?,?,?,?)`).bind(
    attestedProfileDigest, 'esim-go-v3', alice, attestedEsimOrderId,
    'api-check-esim', esimPackageHash, Date.now(),
  ).run();
  const attestedInstallProofPath = `/api/esim/orders/${attestedEsimOrderId}/install-proof`;
  const attestedInstallChallenge = await call('POST', {
    action: 'challenge', deviceRef: attestedDeviceRef,
  }, { path: attestedInstallProofPath });
  const attestedInstallReceipt = signedInstallReceipt({
    ownerUserId: alice,
    orderId: attestedEsimOrderId,
    profileDigest: attestedProfileDigest,
    challenge: attestedInstallChallenge,
    deviceRef: attestedDeviceRef,
  });
  await call('POST', {
    action: 'submit',
    challengeId: attestedInstallChallenge.challengeId,
    challengeNonce: attestedInstallChallenge.challengeNonce,
    receipt: attestedInstallReceipt,
  }, { path: attestedInstallProofPath });

  const attestedEntitlementPath = `/api/esim/orders/${attestedEsimOrderId}/device-entitlement`;
  const attestedEntitlementChallenge = await call('POST', { action: 'challenge' }, {
    path: attestedEntitlementPath,
  });
  const attestedInstallReceiptSha256 = createHash('sha256')
    .update(esimInstallReceiptSigningBytes(attestedInstallReceipt)).digest('hex');
  const attestedStarterPackSha256 = createHash('sha256')
    .update(JSON.stringify(apiInstallPricing.plan.starterAgentPack)).digest('hex');
  const attestedEntitlementReceipt = signedDeviceEntitlementReceipt({
    ownerUserId: alice,
    orderId: attestedEsimOrderId,
    profileDigest: attestedProfileDigest,
    challenge: attestedEntitlementChallenge,
    deviceRef: attestedDeviceRef,
    installReceiptSha256: attestedInstallReceiptSha256,
    starterPack: apiInstallPricing.plan.starterAgentPack,
    starterPackManifestSha256: attestedStarterPackSha256,
    authorityId: ANDROID_KEY_ATTESTATION_AUTHORITY,
    keyId: attestedDeviceKeyId,
  });
  const attestedSubmission = {
    action: 'submit',
    challengeId: attestedEntitlementChallenge.challengeId,
    challengeNonce: attestedEntitlementChallenge.challengeNonce,
    receipt: attestedEntitlementReceipt,
    certificateChainDerBase64Url: ['AQ', 'Ag'],
  };
  const attestedActivation = await call('POST', attestedSubmission, {
    path: attestedEntitlementPath,
  });
  check(attestedActivation.state, 'activated');
  check(attestationVerifierRequestCount >= 1, true);
  const persistedAttestedKey = await database.prepare(`SELECT authority_id AS authorityId,
    owner_user_id AS ownerUserId, device_ref AS deviceRef, key_id AS keyId, algorithm,
    public_key_sha256 AS publicKeySha256, application_package AS applicationPackage, status
    FROM esim_device_gateway_keys WHERE key_id = ?`).bind(attestedDeviceKeyId).first();
  check(persistedAttestedKey, {
    authorityId: ANDROID_KEY_ATTESTATION_AUTHORITY,
    ownerUserId: alice,
    deviceRef: attestedDeviceRef,
    keyId: attestedDeviceKeyId,
    algorithm: 'ES256',
    publicKeySha256: attestedDeviceKeyId,
    applicationPackage: 'dev.rock.automation',
    status: 'active',
  });
  const attestedActivationStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${attestedEsimOrderId}/status`,
  });
  check(attestedActivationStatus.esimDeviceEntitlementState, 'active');

  const publicEsimCatalog = await call('GET', undefined, { path: '/api/esim/catalog' });
  check(publicEsimCatalog.plans[0].starterAgentPack, {
    id: 'lifeline',
    version: '1.0.0',
    packages: [{
      packageKey: esimStarterPackageKey,
      name: 'Offline Guide',
      summary: 'Provides a short offline help guide.',
      reviewState: 'active',
    }],
  });
  await database.prepare('UPDATE sky_tool_packages SET manifest = ? WHERE package_key = ?')
    .bind(JSON.stringify({ ...esimStarterPackage, name: 'Unreviewed replacement' }), esimStarterPackageKey)
    .run();
  const changedPackStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(changedPackStatus.starterAgentPack.packages, [{
    packageKey: esimStarterPackageKey,
    name: null,
    summary: null,
    reviewState: 'unavailable',
  }]);
  const changedOfferProfile = await call('GET', undefined, { path: entitlementPath });
  check(changedOfferProfile.entitlements[0].serviceProfile.state, 'review_required');
  const changedPublicCatalog = await call('GET', undefined, { path: '/api/esim/catalog' });
  check(changedPublicCatalog.plans[0].starterAgentPack.packages[0].reviewState, 'unavailable');
  check(readyEsimStatus.installMaterialAvailable, true);
  await call('POST', { action: 'fetch', deliveryRequestId: installDeliveryId }, {
    path: installMaterialPath, user: bob, status: 404,
  });
  const deliveredInstallMaterial = await call('POST', {
    action: 'fetch', deliveryRequestId: installDeliveryId,
  }, { path: installMaterialPath });
  check(deliveredInstallMaterial.state, 'ready');
  check(deliveredInstallMaterial.material, quickInstallProfile);
  const acknowledgedInstallMaterial = await call('POST', {
    action: 'acknowledge', deliveryRequestId: installDeliveryId,
  }, { path: installMaterialPath });
  check(acknowledgedInstallMaterial.state, 'acknowledged');
  const erasedInstallMaterial = await call('POST', {
    action: 'fetch', deliveryRequestId: installDeliveryId,
  }, { path: installMaterialPath, status: 410 });
  check(erasedInstallMaterial.error, 'install_material_acknowledged');
  await call(
    'POST',
    { id: randomUUID(), title: 'test', templateId: 'unknown' },
    { status: 400 },
  );
  const input = {
    id: randomUUID(),
    title: 'API検証用の記事',
    templateId: 'article',
  };
  let { job } = await call('POST', input, { status: 201 });
  check((await call('POST', input, { status: 201 })).job, job);
  check((await call('GET', undefined, { user: bob })).jobs, []);
  await call('POST', input, { user: bob, status: 409 });
  const a2aAgentsPath = '/api/sky/a2a-agents';
  const a2aPriceQuotesPath = '/api/sky/a2a-price-quotes';
  check(
    (await call('GET', undefined, { path: a2aAgentsPath })).agents,
    [],
  );
  await call('POST', {}, { path: a2aPriceQuotesPath, user: null, status: 401 });
  await call('POST', {}, { path: a2aPriceQuotesPath, status: 400 });
  await call('POST', {
    agentId: randomUUID(), quoteRequestId: randomUUID(),
    message: 'quote consent fixture', currency: 'USD', maximumBudgetMinor: 100,
    expiresAt: Date.now() + 60_000, consentToSharePromptForQuote: false,
  }, { path: a2aPriceQuotesPath, status: 400 });
  check((await call('GET', undefined, {
    path: a2aAgentsPath, user: null,
    headers: { Authorization: `Bearer ${deviceGrant.accessToken}` },
  })).agents, []);
  await call('DELETE', { id: activeDeviceSessions.sessions[0].id }, { path: deviceSessionsPath });
  await call('GET', undefined, {
    path: a2aAgentsPath, user: null,
    headers: { Authorization: `Bearer ${deviceGrant.accessToken}` }, status: 401,
  });
  check(
    (await call('GET', undefined, { path: a2aAgentsPath, user: bob })).agents,
    [],
  );
  await call(
    'POST',
    { origin: 'https://agent.example.org' },
    { path: a2aAgentsPath, user: null, status: 401 },
  );
  await call(
    'POST',
    { origin: 'https://agent.example.org' },
    { path: a2aAgentsPath, status: 403 },
  );
  const a2aPath = '/api/sky/a2a-delegations';
  await call('GET', undefined, {
    path: `${a2aPath}?parentJobId=${input.id}`,
    user: null,
    status: 401,
  });
  const a2aParent = {
    id: randomUUID(),
    title: 'A2A API検証用の仕事',
    templateId: 'article',
  };
  await call('POST', a2aParent, { status: 201 });
  const boundedParent = { id: randomUUID(), title: '委任数・同時実行上限の検証', templateId: 'article' };
  await call('POST', boundedParent, { status: 201 });
  const boundedInputs = Array.from({ length: A2A_MAX_DELEGATIONS_PER_PARENT_JOB + 1 }, (_, index) => ({
    id: randomUUID(), parentJobId: boundedParent.id,
    idempotencyKey: `bounded:${randomUUID()}`, messageId: randomUUID(),
    targetOrigin: 'https://agent.example.com', targetAgentName: 'Bounded Fixture Agent',
    targetAgentVersion: '1.0.0', message: `Bounded delegation ${index + 1}`,
    budgetCurrency: 'USD', budgetLimitMinor: 0, parentBudgetLimitMinor: 0,
    continueWhileDeviceOffline: true, deadlineAt: Date.now() + 10 * 60_000,
  }));
  const activeBounded = [];
  for (let index = 0; index < A2A_MAX_ACTIVE_DELEGATIONS_PER_PARENT_JOB; index++) {
    const result = await call('POST', boundedInputs[index], { path: a2aPath, status: 201 });
    activeBounded.push(result.delegation);
  }
  const concurrencyLimited = await call('POST', boundedInputs[A2A_MAX_ACTIVE_DELEGATIONS_PER_PARENT_JOB], {
    path: a2aPath, status: 429,
  });
  check(concurrencyLimited.code, 'a2a_delegation_concurrency_limit');
  const idempotentAtCapacity = await call('POST', boundedInputs[0], { path: a2aPath });
  check(idempotentAtCapacity.created, false);
  check(idempotentAtCapacity.delegation.id, activeBounded[0].id);
  const attemptedNested = await call('POST', {
    ...boundedInputs[4], id: randomUUID(), idempotencyKey: `nested:${randomUUID()}`,
    parentJobId: activeBounded[0].id,
  }, { path: a2aPath, status: 404 });
  check(attemptedNested.error, '親jobが見つからないか、委任期限を過ぎています。');
  for (const delegation of activeBounded)
    await call('PATCH', { action: 'cancel' }, { path: `${a2aPath}/${delegation.id}` });
  for (let index = A2A_MAX_ACTIVE_DELEGATIONS_PER_PARENT_JOB; index < A2A_MAX_DELEGATIONS_PER_PARENT_JOB; index++) {
    const result = await call('POST', boundedInputs[index], { path: a2aPath, status: 201 });
    await call('PATCH', { action: 'cancel' }, { path: `${a2aPath}/${result.delegation.id}` });
  }
  const countLimited = await call('POST', boundedInputs[A2A_MAX_DELEGATIONS_PER_PARENT_JOB], {
    path: a2aPath, status: 429,
  });
  check(countLimited.code, 'a2a_delegation_count_limit');
  const idempotentAtCountLimit = await call('POST', boundedInputs[0], { path: a2aPath });
  check(idempotentAtCountLimit.created, false);
  const delegationInput = {
    id: randomUUID(),
    parentJobId: a2aParent.id,
    idempotencyKey: `api:${randomUUID()}`,
    messageId: randomUUID(),
    targetOrigin: 'https://agent.example.com',
    targetAgentName: 'Fixture Research Agent',
    targetAgentVersion: '1.2.0',
    message: '公開資料の要点を整理してください。',
    budgetCurrency: 'USD',
    budgetLimitMinor: 250,
    parentBudgetLimitMinor: 1000,
    continueWhileDeviceOffline: true,
    deadlineAt: Date.now() + 10 * 60_000,
  };
  const createPriceQuoteFor = (input) => {
    const quote = {
    schema: A2A_PRICE_QUOTE_SCHEMA,
    providerId: 'api-check-provider',
    keyId: 'api-check-usage-key',
    quoteId: `quote-${randomUUID()}`,
    agentOrigin: input.targetOrigin,
    agentName: input.targetAgentName,
    agentVersion: input.targetAgentVersion,
    requestSha256: createHash('sha256').update(input.message).digest('hex'),
    pricingVersion: 'api-check-rates-1',
    pricingSha256: 'c'.repeat(64),
    currency: input.budgetCurrency,
    estimateMinor: 100,
    maxAmountMinor: input.budgetLimitMinor,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 5 * 60_000,
    usage: [{ meter: 'task', quantity: 1, unit: 'request', unitPriceMinor: 100, amountMinor: 100 }],
    signature: '',
    };
    quote.signature = sign(null, a2aPriceQuoteSigningBytes(quote), usageKeyPair.privateKey).toString('base64url');
    return quote;
  };
  const priceQuote = createPriceQuoteFor(delegationInput);
  delegationInput.priceQuote = priceQuote;
  priceQuoteRequired = true;
  await stop();
  await start();
  const noQuoteInput = { ...delegationInput, id: randomUUID(), idempotencyKey: `api:${randomUUID()}`, messageId: randomUUID() };
  delete noQuoteInput.priceQuote;
  await call('POST', noQuoteInput, { path: a2aPath, status: 403 });
  priceQuoteRequired = false;
  await stop();
  await start();
  await call('POST', { ...delegationInput, priceQuote: { ...priceQuote, estimateMinor: 101 } }, { path: a2aPath, status: 403 });
  await call('POST', { ...delegationInput, continueWhileDeviceOffline: false }, {
    path: a2aPath,
    status: 400,
  });
  const unreviewablePredecessor = await call('POST', {
    ...delegationInput,
    id: randomUUID(),
    idempotencyKey: `api:${randomUUID()}`,
    messageId: randomUUID(),
    predecessorDelegationId: randomUUID(),
  }, { path: a2aPath, status: 409 });
  check(unreviewablePredecessor.code, 'A2A_PREDECESSOR_NOT_REVIEWABLE');
  await call('POST', delegationInput, {
    path: a2aPath,
    origin: 'https://not-rock.invalid',
    status: 403,
  });
  await call(
    'POST',
    { ...delegationInput, targetOrigin: 'http://agent.example.test' },
    { path: a2aPath, status: 400 },
  );
  let { delegation } = await call('POST', delegationInput, {
    path: a2aPath,
    status: 201,
  });
  check(delegation.priceQuoteDigest.length, 64);
  check(delegation.priceQuote.quoteId, priceQuote.quoteId);
  await call('POST', {
    ...delegationInput,
    id: randomUUID(),
    idempotencyKey: `api:${randomUUID()}`,
    messageId: randomUUID(),
  }, { path: a2aPath, status: 409 });
  const delegationInputSha256 = createHash('sha256')
    .update(delegationInput.message)
    .digest('hex');
  const recoveryPath = `${a2aPath}?${new URLSearchParams({
    parentJobId: a2aParent.id,
    idempotencyKey: delegationInput.idempotencyKey,
    inputSha256: delegationInputSha256,
  })}`;
  const recoveredDelegation = (await call('GET', undefined, { path: recoveryPath })).delegation;
  check(recoveredDelegation.id, delegation.id);
  check(recoveredDelegation.authorizationSha256, delegation.authorizationSha256);
  check((await call('GET', undefined, {
    path: `${a2aPath}?${new URLSearchParams({
      parentJobId: a2aParent.id,
      idempotencyKey: delegationInput.idempotencyKey,
      inputSha256: 'f'.repeat(64),
    })}`,
  })).delegation, null);
  check((await call('GET', undefined, { path: recoveryPath, user: bob })).delegation, null);
  const approval = (await call('POST', delegationInput, { path: a2aPath }))
    .approval;
  check(delegation.state, 'awaiting_approval');
  check(approval.required, true);
  let parentController = (await call('GET', undefined, {
    path: `${a2aPath}?parentJobId=${a2aParent.id}`,
  })).controller;
  check(parentController.ownerUserId, alice);
  check(parentController.state, 'awaiting_approval');
  check(parentController.awaitingApprovalCount, 1);
  const isolatedParentController = (await call('GET', undefined, {
    path: `${a2aPath}?parentJobId=${a2aParent.id}`, user: bob,
  })).controller;
  check(isolatedParentController.ownerUserId, bob);
  check(isolatedParentController.stepCount, 0);
  check(isolatedParentController.state, 'not_started');
  const a2aItem = `${a2aPath}/${delegation.id}`;
  await call(
    'PATCH',
    {
      action: 'approve',
      authorizationSha256: approval.digest,
      message: delegationInput.message,
    },
    { path: a2aItem, status: 503 },
  );
  a2aExecutionEnabled = true;
  await stop();
  await start();
  await call('PATCH', {
    action: 'approve',
    authorizationSha256: approval.digest,
    message: delegationInput.message,
  }, { path: a2aItem, status: 403 });
  serviceEntitlementEnforcementEnabled = true;
  await stop();
  await start();
  const deniedAfterRefund = await call('PATCH', {
    action: 'approve',
    authorizationSha256: approval.digest,
    message: delegationInput.message,
  }, { path: a2aItem, status: 403 });
  check(deniedAfterRefund.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  serviceEntitlementEnforcementEnabled = false;
  await stop();
  await start();
  const proof = await createBrokerProof(delegation, delegationInput.message);
  const brokerProofPath = `${a2aItem}/broker-authorization`;
  serviceEntitlementEnforcementEnabled = true;
  await stop();
  await start();
  const deniedBrokerProofAfterRefund = await call('POST', {
    proof, message: delegationInput.message,
  }, { path: brokerProofPath, status: 403 });
  check(deniedBrokerProofAfterRefund.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  serviceEntitlementEnforcementEnabled = false;
  await stop();
  await start();
  await call('POST', { proof, message: delegationInput.message }, {
    path: brokerProofPath,
    user: bob,
    status: 404,
  });
  await call('POST', {
    proof: { ...proof, budgetLimitMinor: 999 },
    message: delegationInput.message,
  }, { path: brokerProofPath, status: 403 });
  await call('POST', { proof, message: '異なる本文を添付します。' }, {
    path: brokerProofPath,
    status: 409,
  });
  const acceptedProof = await call('POST', { proof, message: delegationInput.message }, {
    path: brokerProofPath,
  });
  check(acceptedProof.accepted, true);
  check(acceptedProof.expiresAt, proof.expiresAt);
  await call('POST', { proof, message: delegationInput.message }, { path: brokerProofPath });
  await call('POST', {
    proof: { ...proof, keyId: 'another-key' },
    message: delegationInput.message,
  }, { path: brokerProofPath, status: 403 });
  await call('GET', undefined, { path: a2aItem, user: bob, status: 404 });
  await call(
    'PATCH',
    {
      action: 'approve',
      authorizationSha256: approval.digest,
      message: delegationInput.message,
    },
    { path: a2aItem, user: bob, status: 404 },
  );
  await call(
    'PATCH',
    {
      action: 'approve',
      authorizationSha256: 'f'.repeat(64),
      message: delegationInput.message,
    },
    { path: a2aItem, status: 409 },
  );
  await call(
    'PATCH',
    {
      action: 'approve',
      authorizationSha256: approval.digest,
      message: '別の本文に差し替えます。',
    },
    { path: a2aItem, status: 409 },
  );
  ({ delegation } = await call(
    'PATCH',
    {
      action: 'approve',
      authorizationSha256: approval.digest,
      message: delegationInput.message,
    },
    { path: a2aItem },
  ));
  check(delegation.state, 'prepared');
  parentController = (await call('GET', undefined, {
    path: `${a2aPath}?parentJobId=${a2aParent.id}`,
  })).controller;
  check(parentController.state, 'dispatch_pending');
  check(parentController.dispatchPendingCount, 1);
  const encrypted = await database
    .prepare(
      'SELECT payload_ciphertext AS ciphertext, nonce, input_sha256 AS inputSha256, key_version AS keyVersion FROM agent_delegation_inputs WHERE delegation_id = ?',
    )
    .bind(delegation.id)
    .first();
  check(typeof encrypted.ciphertext, 'string');
  check(encrypted.ciphertext.includes(delegationInput.message), false);
  check(encrypted.inputSha256, delegation.inputSha256);
  check(encrypted.keyVersion, 'aes-256-gcm-v1');
  ({ delegation } = await call('GET', undefined, { path: a2aItem }));
  check(delegation.state, 'prepared');
  check(
    (
      await call('GET', undefined, {
        path: `${a2aPath}?parentJobId=${a2aParent.id}`,
      })
    ).delegations.length,
    1,
  );
  const artifactTaskId = `provider-task-${randomUUID()}`;
  await database
    .prepare(`UPDATE agent_delegations SET state = 'working', remote_task_id = ?,
      remote_state = 'TASK_STATE_WORKING' WHERE owner_user_id = ? AND id = ?`)
    .bind(artifactTaskId, alice, delegation.id)
    .run();
  parentController = (await call('GET', undefined, {
    path: `${a2aPath}?parentJobId=${a2aParent.id}`,
  })).controller;
  check(parentController.state, 'running');
  check(parentController.runningCount, 1);
  const liveUsageSnapshot = {
    schema: 'rock-a2a-provider-live-usage/1', providerId: 'api-check-provider',
    keyId: 'api-check-usage-key', eventId: `meter:${randomUUID()}`, sequence: 1,
    ownerUserId: alice, parentJobId: a2aParent.id, delegationId: delegation.id,
    taskId: artifactTaskId, agentOrigin: delegation.targetOrigin,
    agentName: delegation.targetAgentName, agentVersion: delegation.targetAgentVersion,
    currency: 'USD', cumulativeAmountMinor: 21, pricingVersion: priceQuote.pricingVersion,
    issuedAt: Date.now(),
    usage: [{ meter: 'agent-operation', quantity: 1, unit: 'request', amountMinor: 21 }],
    signature: '',
  };
  liveUsageSnapshot.signature = sign(
    null, a2aLiveUsageSigningBytes(liveUsageSnapshot), usageKeyPair.privateKey,
  ).toString('base64url');
  const liveUsagePath = `${a2aItem}/usage-snapshots`;
  const liveUsageAccepted = await call('POST', liveUsageSnapshot, { path: liveUsagePath, status: 202, user: null });
  check(liveUsageAccepted.accepted, true);
  check(liveUsageAccepted.provisional, true);
  const liveUsageReplay = await call('POST', liveUsageSnapshot, { path: liveUsagePath, status: 202, user: null });
  check(liveUsageReplay.idempotent, true);
  await call('POST', { ...liveUsageSnapshot, cumulativeAmountMinor: 22 }, { path: liveUsagePath, status: 409, user: null });
  await call('POST', { ...liveUsageSnapshot, signature: 'A'.repeat(86), eventId: `meter:${randomUUID()}` }, { path: liveUsagePath, status: 409, user: null });
  const resultDocument = {
    schemaVersion: 1,
    artifacts: [{ name: 'summary', textParts: ['fixture result'] }],
    omittedNonTextParts: 0,
    truncated: false,
  };
  const resultContent = JSON.stringify(resultDocument);
  const encryptedResult = await encryptA2AArtifact(
    resultContent,
    'a'.repeat(64),
    alice,
    delegation.id,
    artifactTaskId,
  );
  const resultBytes = new TextEncoder().encode(resultContent).byteLength;
  await database
    .prepare(`UPDATE agent_delegations SET state = 'remote_completed',
      remote_task_id = ?, remote_state = 'TASK_STATE_COMPLETED', artifacts_captured = 1
      WHERE owner_user_id = ? AND id = ?`)
    .bind(artifactTaskId, alice, delegation.id)
    .run();
  await database
    .prepare(`INSERT INTO agent_delegation_artifacts (
      id, delegation_id, owner_user_id, remote_task_id, artifact_sha256,
      payload_ciphertext, nonce, key_version, byte_length, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      randomUUID(), delegation.id, alice, artifactTaskId,
      encryptedResult.artifactSha256, encryptedResult.ciphertext,
      encryptedResult.nonce, encryptedResult.keyVersion, resultBytes, Date.now(),
    )
    .run();
  const artifactPath = `${a2aItem}/artifacts`;
  await call('GET', undefined, { path: artifactPath, user: null, status: 401 });
  await call('GET', undefined, { path: artifactPath, user: bob, status: 404 });
  const resultResponse = await call('GET', undefined, { path: artifactPath });
  check(resultResponse.captured, true);
  check(resultResponse.artifacts[0].document, resultDocument);
  parentController = (await call('GET', undefined, {
    path: `${a2aPath}?parentJobId=${a2aParent.id}`,
  })).controller;
  check(parentController.state, 'review_results');
  check(parentController.resultReadyCount, 1);
  check(parentController.nextAction, 'review_result_or_prepare_sibling');
  const walletSettlementPath = `${a2aItem}/wallet-settlement`;
  await call('GET', undefined, { path: walletSettlementPath, user: null, status: 401 });
  await call('GET', undefined, { path: walletSettlementPath, user: bob, status: 404 });
  await call('GET', undefined, { path: walletSettlementPath, status: 409 });
  const issuedAt = Date.now();
  const usageReceipt = {
    schema: A2A_USAGE_RECEIPT_SCHEMA,
    providerId: 'api-check-provider',
    keyId: 'api-check-usage-key',
    receiptId: `usage:${randomUUID()}`,
    ownerUserId: alice,
    parentJobId: a2aParent.id,
    delegationId: delegation.id,
    taskId: artifactTaskId,
    agentOrigin: delegation.targetOrigin,
    agentName: delegation.targetAgentName,
    agentVersion: delegation.targetAgentVersion,
    currency: 'USD',
    amountMinor: 37,
    pricingVersion: priceQuote.pricingVersion,
    issuedAt,
    usage: [{ meter: 'agent-operation', quantity: 1, unit: 'request', amountMinor: 37 }],
    signature: '',
  };
  usageReceipt.signature = sign(
    null,
    a2aUsageReceiptSigningBytes(usageReceipt),
    usageKeyPair.privateKey,
  ).toString('base64url');
  const belowMeterReceipt = {
    ...usageReceipt,
    receiptId: `usage:under-live-meter:${randomUUID()}`,
    amountMinor: 20,
    usage: [{ meter: 'agent-operation', quantity: 1, unit: 'request', amountMinor: 20 }],
    signature: '',
  };
  belowMeterReceipt.signature = sign(
    null, a2aUsageReceiptSigningBytes(belowMeterReceipt), usageKeyPair.privateKey,
  ).toString('base64url');
  let belowMeterSettlementCode = '';
  try { await a2aDelegationStore(database).settleUsageReceipt(alice, delegation.id, belowMeterReceipt); }
  catch (error) { belowMeterSettlementCode = error.code ?? ''; }
  check(belowMeterSettlementCode, 'usage_receipt_live_meter_mismatch');
  await a2aDelegationStore(database).settleUsageReceipt(alice, delegation.id, usageReceipt);
  const meteredDelegation = await call('GET', undefined, { path: a2aItem });
  check(meteredDelegation.liveUsageSnapshot.cumulativeAmountMinor, 21);
  check(meteredDelegation.usageReceipt.amountMinor, 37);
  parentController = (await call('GET', undefined, {
    path: `${a2aPath}?parentJobId=${a2aParent.id}`,
  })).controller;
  check(parentController.budget.usageRecordedMinor, 37);
  check(parentController.budget.usageIsInvoice, false);
  const walletHandoff = await call('GET', undefined, { path: walletSettlementPath });
  check(walletHandoff.schema, 'rock-a2a-wallet-settlement-handoff/1');
  check(walletHandoff.state, 'ready_for_device_wallet');
  check(walletHandoff.reservation.ownerUserId, alice);
  check(walletHandoff.reservation.delegationId, delegation.id);
  check(walletHandoff.reservation.settledMinor, 37);
  check(walletHandoff.walletCommand.op, 'a2a.budget.settle');
  check(walletHandoff.walletCommand.delegation_id, delegation.id);
  check(walletHandoff.walletCommand.receipt, usageReceipt);
  check(walletHandoff.receiptSha256.length, 64);
  check((await call('GET', undefined, { path: walletSettlementPath })).idempotencyKey, walletHandoff.idempotencyKey);
  const walletRequest = {
    schema: A2A_WALLET_HANDOFF_REQUEST_SCHEMA,
    authorityId: 'fixture-rockstaros',
    ownerUserId: alice,
    deviceRef: 'fixture-device-a',
    delegationId: delegation.id,
    requestId: randomUUID(),
    requestedAt: Date.now(),
    keyId: 'fixture-device-key',
    signature: '',
  };
  walletRequest.signature = sign(
    null,
    a2aWalletHandoffSigningBytes(walletRequest),
    brokerKeyPair.privateKey,
  ).toString('base64url');
  // Device signature is the authority for this native endpoint; it deliberately
  // does not require a browser cookie or synthetic Sites user header.
  const deviceWalletHandoff = await call('POST', walletRequest, { path: walletSettlementPath });
  check(deviceWalletHandoff.schema, walletHandoff.schema);
  check(deviceWalletHandoff.idempotencyKey, walletHandoff.idempotencyKey);
  check(deviceWalletHandoff.walletCommand, walletHandoff.walletCommand);
  await call('POST', { ...walletRequest, ownerUserId: bob }, { path: walletSettlementPath, status: 403 });
  await call('POST', { ...walletRequest, delegationId: randomUUID() }, { path: walletSettlementPath, status: 403 });
  const nativeWalletHandoff = spawnSync('python3', [
    join(root, 'systems/rock-star-os/scripts/accept-cloud-wallet-handoff.py'),
  ], {
    cwd: root,
    env: {
      ...process.env,
      PYTHONPATH: [join(root, 'systems/rock-star-os/src'), process.env.PYTHONPATH]
        .filter(Boolean).join(':'),
    },
    input: JSON.stringify({
      handoff: walletHandoff,
      trustedUsagePublicKeyHex: Buffer.from(usagePublicKey).toString('hex'),
    }),
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (nativeWalletHandoff.status !== 0)
    throw new Error(`Native Wallet handoff fixture failed: ${nativeWalletHandoff.stderr}`);
  const nativeWalletSettlement = JSON.parse(nativeWalletHandoff.stdout);
  check(nativeWalletSettlement.state, 'SETTLED');
  check(nativeWalletSettlement.settledMinor, 37);
  check(nativeWalletSettlement.releasedMinor, 213);
  check(nativeWalletSettlement.repeatStable, true);
  check(nativeWalletSettlement.simulationOnly, true);
  const canceledInput = {
    ...delegationInput,
    id: randomUUID(),
    messageId: randomUUID(),
    idempotencyKey: `api:${randomUUID()}`,
  };
  canceledInput.priceQuote = createPriceQuoteFor(canceledInput);
  const canceledDraft = (
    await call('POST', canceledInput, { path: a2aPath, status: 201 })
  ).delegation;
  ({ delegation } = await call(
    'PATCH',
    { action: 'cancel' },
    { path: `${a2aPath}/${canceledDraft.id}` },
  ));
  check(delegation.state, 'cancelled_before_dispatch');
  check(
    (
      await call('GET', undefined, {
        path: `${a2aPath}?parentJobId=${a2aParent.id}`,
        user: bob,
      })
    ).delegations,
    [],
  );
  const command = (overrides = {}) => ({
    id: randomUUID(),
    action: 'record',
    stepId: 'citations',
    tool: 'mr-citations',
    transport: 'browser',
    outcome: 'passed',
    sample: false,
    durationMs: 15,
    ...overrides,
  });
  const patch = (value, options) =>
    call(
      'PATCH',
      { jobId: job.id, revision: job.revision, command: value },
      options,
    );
  await patch(command(), { user: bob, status: 404 });
  await patch(command({ stepId: 'free-article', tool: 'mr-free-article' }), {
    status: 400,
  });
  await patch(
    { id: randomUUID(), action: 'complete', note: 'まだ確認前' },
    { status: 400 },
  );
  for (const extra of [
    { sample: true },
    { outcome: 'needs_review' },
    { outcome: 'failed' },
  ]) {
    ({ job } = await patch(command(extra)));
    check(job.steps[0].passed, false);
  }
  const concurrent = await Promise.all([
    fetch(`${base}/api/work-jobs`, {
      method: 'PATCH',
      headers: { Origin: base, 'oai-authenticated-user-id': alice },
      body: JSON.stringify({
        jobId: job.id,
        revision: job.revision,
        command: command({ outcome: 'needs_review' }),
      }),
      signal: AbortSignal.timeout(10000),
    }),
    fetch(`${base}/api/work-jobs`, {
      method: 'PATCH',
      headers: { Origin: base, 'oai-authenticated-user-id': alice },
      body: JSON.stringify({
        jobId: job.id,
        revision: job.revision,
        command: command({ outcome: 'needs_review' }),
      }),
      signal: AbortSignal.timeout(10000),
    }),
  ]);
  check(
    concurrent.map((response) => response.status).sort((a, b) => a - b),
    [200, 409],
  );
  job = (await call()).jobs.find((item) => item.id === job.id);
  const receipt = command(),
    priorRevision = job.revision;
  ({ job } = await patch(receipt));
  check(job.steps[0].passed, true);
  check(
    (
      await call('PATCH', {
        jobId: job.id,
        revision: priorRevision,
        command: receipt,
      })
    ).job,
    job,
  );
  await patch({ ...receipt, durationMs: 999 }, { status: 409 });
  await call(
    'PATCH',
    { jobId: job.id, revision: priorRevision, command: command() },
    { status: 409 },
  );
  ({ job } = await patch(
    command({ stepId: 'free-article', tool: 'mr-free-article' }),
  ));
  check(job.status, 'review');
  await patch(
    { id: randomUUID(), action: 'complete', note: '' },
    { status: 400 },
  );
  ({ job } = await patch({
    id: randomUUID(),
    action: 'complete',
    note: 'テスト用原稿を確認。外部送信なし。',
  }));
  check(job.status, 'completed');
  await patch(command(), { status: 409 });
  check((await call('GET', undefined, { path: '/api/fund' })).totalRuns, 0);
  const teamPath = '/api/coconala-team';
  await call('GET', undefined, { path: teamPath, user: null, status: 401 });
  const teamInput = {
    id: randomUUID(),
    terms: {
      title: 'API検証用の受託案件',
      orderReference: 'synthetic-001',
      clientLabel: '架空の依頼者',
      workerName: '架空の担当者',
      scope: '架空の原稿制作',
      deliveryDate: '2026-10-10',
      deliveryPlace: '代表者へ非公開納品',
      inspectionDate: '2026-10-12',
      revisionScope: '誤字1回',
      rights: '利用範囲を本人確認',
      grossYen: 10000,
      estimatedPlatformFeePercent: 22,
      workerFeeYen: 7566,
      workerPaymentDate: '2026-11-10',
      platformRulesReference: 'synthetic-rules-check',
      customerDisclosureReference: 'synthetic-client-message',
      workerTermsReference: 'synthetic-worker-terms',
    },
  };
  let { caseFile } = await call('POST', teamInput, {
    path: teamPath,
    status: 201,
  });
  check(caseFile.status, 'draft');
  check(
    (await call('GET', undefined, { path: teamPath, user: bob })).cases,
    [],
  );
  const teamPatch = (action, extra = {}, options = {}) =>
    call(
      'PATCH',
      {
        caseId: caseFile.id,
        revision: caseFile.revision,
        command: { id: randomUUID(), action, ...extra },
      },
      { path: teamPath, ...options },
    );
  await teamPatch('assign', {}, { user: bob, status: 404 });
  ({ caseFile } = await teamPatch('assign'));
  check(caseFile.status, 'assigned');
  ({ caseFile } = await teamPatch('record_worker_payment', {
    amountYen: 3000,
    reference: 'synthetic-bank-001',
  }));
  check(caseFile.workerPayments[0].amountYen, 3000);
  await teamPatch(
    'record_worker_payment',
    {
      amountYen: 5000,
      reference: 'synthetic-bank-002',
    },
    { status: 400 },
  );
  await call(
    'PATCH',
    {
      caseId: caseFile.id,
      revision: 0,
      command: { id: randomUUID(), action: 'assign' },
    },
    { path: teamPath, status: 409 },
  );
  // Draft deletion is owner-scoped and checks the last confirmed revision.
  const deleteInput = { id: randomUUID(), terms: { ...teamInput.terms, title: '削除検証用の合成下書き' } };
  const { caseFile: deleteCase } = await call('POST', deleteInput, { path: teamPath, status: 201 });
  const deletion = { caseId: deleteCase.id, revision: 0 };
  await call('DELETE', deletion, { path: teamPath, user: null, status: 401 });
  await call('DELETE', deletion, { path: teamPath, origin: 'https://untrusted.example', status: 403 });
  await call('DELETE', deletion, { path: teamPath, user: bob, status: 404 });
  await call('DELETE', { ...deletion, revision: -1 }, { path: teamPath, status: 400 });
  await call('DELETE', { ...deletion, revision: '0' }, { path: teamPath, status: 400 });
  await call('DELETE', { ...deletion, extra: true }, { path: teamPath, status: 400 });
  await call('DELETE', { ...deletion, revision: 1 }, { path: teamPath, status: 409 });
  check((await call('GET', undefined, { path: teamPath })).cases.find((item) => item.id === deleteCase.id).status, 'draft');
  const deleted = await call('DELETE', deletion, { path: teamPath });
  check(deleted.deletedCaseId, deleteCase.id);
  check((await call('GET', undefined, { path: teamPath })).cases.some((item) => item.id === deleteCase.id), false);
  await call('DELETE', deletion, { path: teamPath, status: 404 });
  await call('DELETE', { caseId: caseFile.id, revision: caseFile.revision }, { path: teamPath, status: 409 });
  await stop();
  await start();
  check(
    (await call()).jobs.find((item) => item.id === job.id),
    job,
  );
  check((await call('GET', undefined, { user: bob })).jobs, []);
  check(
    (await call('GET', undefined, { path: teamPath })).cases.find(
      (item) => item.id === caseFile.id,
    ),
    caseFile,
  );
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(root, 'scripts/verify-backend.mjs'), base],
      { cwd: root, stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Operations API verification exited ${code}`)),
    );
  });
  // AMC is an authenticated WorkJob, not a browser-only link or a claimed AI run.
  const amcPath = '/api/amc';
  const amcBrief = {
    request: 'jevで仮想通貨のbot作成して',
    goal: '依頼すると担当と次の行動がわかる',
    intent: '自分が担当と進捗を把握し、実売買なしで試作を確かめる',
  };
  const amcInput = { id: randomUUID(), brief: amcBrief };
  await call('GET', undefined, { path: amcPath, user: null, status: 401 });
  for (const method of ['POST', 'PATCH']) {
    await call(method, {}, { path: amcPath, user: null, status: 401 });
    await call(
      method,
      {},
      {
        path: amcPath,
        origin: 'https://not-rock.invalid',
        status: 403,
      },
    );
  }
  await call('POST', new Uint8Array([0xff]), {
    path: amcPath,
    raw: true,
    status: 400,
  });
  await call('POST', 'x'.repeat(2 * 1024 * 1024 + 1), {
    path: amcPath,
    raw: true,
    status: 413,
  });
  await call(
    'POST',
    { ...amcInput, brief: { ...amcBrief, request: 'パンを焼きたい' } },
    {
      path: amcPath,
      status: 400,
    },
  );
  await call(
    'POST',
    { id: randomUUID(), importGoal: { schema: 'amc-goal/1' } },
    {
      path: amcPath,
      status: 400,
    },
  );
  let { job: amcJob } = await call('POST', amcInput, {
    path: amcPath,
    status: 201,
  });
  check(amcJob.templateId, 'amc');
  check(amcJob.revision, 0);
  check(amcJob.status, 'active');
  check(amcJob.amcGoal.requestBrief.request, amcBrief.request);
  check(amcJob.amcGoal.requestBrief.goal, amcBrief.goal);
  check(amcJob.amcGoal.requestBrief.intent, amcBrief.intent);
  check(amcJob.amcGoal.tasks.length, 7);
  check(
    amcJob.amcGoal.tasks.every((task) => task.status === 'pending'),
    true,
  );
  check(
    amcJob.steps.every((step) => !step.passed),
    true,
  );
  check(
    amcJob.amcGoal.eventLog.map((event) => event.type),
    ['approve_plan'],
  );
  check(
    (await call('POST', amcInput, { path: amcPath, status: 201 })).job,
    amcJob,
  );
  await call(
    'POST',
    { ...amcInput, brief: { ...amcBrief, intent: '異なる目的' } },
    {
      path: amcPath,
      status: 409,
    },
  );
  const amcList = (await call('GET', undefined, { path: amcPath })).jobs;
  check(
    amcList.map((item) => item.id),
    [amcJob.id],
  );
  check(amcList[0].amcGoal, undefined);
  check(amcList[0].steps, []);
  check(amcList[0].events, []);
  check(
    (await call('GET', undefined, { path: `${amcPath}?id=${amcJob.id}` })).job,
    amcJob,
  );
  check((await call('GET', undefined, { path: amcPath, user: bob })).jobs, []);
  await call('GET', undefined, {
    path: `${amcPath}?id=${amcJob.id}`,
    user: bob,
    status: 404,
  });
  check(
    (await call()).jobs.some((item) => item.templateId === 'amc'),
    false,
  );
  await call('POST', { ...amcInput, templateId: 'amc' }, { status: 400 });
  await call('POST', amcInput, { path: amcPath, user: bob, status: 409 });
  const amcCommand = (type, extra = {}) => {
    const id = randomUUID();
    return {
      id,
      action: 'amc_event',
      event: {
        id,
        type,
        actor: 'owner-reported',
        role: 'owner',
        expectedRevision: amcJob.amcGoal.revision,
        ...extra,
      },
    };
  };
  const amcPatch = (value, options = {}) =>
    call(
      'PATCH',
      {
        jobId: amcJob.id,
        revision: amcJob.revision,
        command: value,
      },
      { path: amcPath, ...options },
    );
  await amcPatch(amcCommand('pause', { reason: 'wait' }), {
    user: bob,
    status: 404,
  });
  for (const action of [
    {
      id: randomUUID(),
      action: 'complete',
      note: '未実行なので完成していない',
    },
    { id: randomUUID(), action: 'cancel' },
    {
      id: randomUUID(),
      action: 'record',
      stepId: amcJob.steps[0].id,
      tool: amcJob.steps[0].tool,
      transport: 'browser',
      outcome: 'passed',
      sample: false,
      durationMs: 1,
    },
  ]) {
    await amcPatch(action, { status: 400 });
    await amcPatch(action, { path: '/api/work-jobs', status: 400 });
  }
  await amcPatch(
    amcCommand('accept_goal', {
      role: 'owner',
      accepted: true,
      evidence: ['evidence/claim.md'],
      criterionResults: [],
    }),
    { status: 400 },
  );
  const beforeAmcRevision = amcJob.revision;
  const competingAmcCommands = [
    amcCommand('pause', { reason: '本人の判断待ち A' }),
    amcCommand('pause', { reason: '本人の判断待ち B' }),
  ];
  const amcConcurrent = await Promise.all(
    competingAmcCommands.map((value) =>
      fetch(`${base}${amcPath}`, {
        method: 'PATCH',
        headers: {
          Origin: base,
          'Content-Type': 'application/json',
          'oai-authenticated-user-id': alice,
        },
        body: JSON.stringify({
          jobId: amcJob.id,
          revision: amcJob.revision,
          command: value,
        }),
        signal: AbortSignal.timeout(10000),
      }),
    ),
  );
  check(
    amcConcurrent.map((response) => response.status).sort((a, b) => a - b),
    [200, 409],
  );
  const winningIndex = amcConcurrent.findIndex(
    (response) => response.status === 200,
  );
  const concurrentAmcResults = await Promise.all(
    amcConcurrent.map((response) => response.json()),
  );
  amcJob = concurrentAmcResults[winningIndex].job;
  check(amcJob.amcGoal.state, 'paused');
  check(
    amcJob.amcGoal.eventLog.at(-1).id,
    competingAmcCommands[winningIndex].id,
  );
  check(
    (
      await call(
        'PATCH',
        {
          jobId: amcJob.id,
          revision: beforeAmcRevision,
          command: competingAmcCommands[winningIndex],
        },
        { path: amcPath },
      )
    ).job,
    amcJob,
  );
  await amcPatch(
    {
      ...competingAmcCommands[winningIndex],
      event: {
        ...competingAmcCommands[winningIndex].event,
        reason: '同一IDの別操作',
      },
    },
    { status: 409 },
  );
  await amcPatch(
    amcCommand('resume', { expectedRevision: amcJob.amcGoal.revision - 1 }),
    { status: 409 },
  );
  await call(
    'PATCH',
    {
      jobId: amcJob.id,
      revision: beforeAmcRevision,
      command: amcCommand('resume'),
    },
    { path: amcPath, status: 409 },
  );
  // Even a valid AMC command must use its dedicated size/privacy boundary.
  await amcPatch(amcCommand('resume'), { path: '/api/work-jobs', status: 400 });
  check(
    (await call('GET', undefined, { path: `${amcPath}?id=${amcJob.id}` })).job,
    amcJob,
  );
  ({ job: amcJob } = await amcPatch(amcCommand('resume')));
  check(amcJob.amcGoal.state, 'active');
  check(
    amcJob.amcGoal.tasks.every((task) => task.status === 'pending'),
    true,
  );
  const importedAmc = (
    await call(
      'POST',
      {
        id: randomUUID(),
        importGoal: amcJob.amcGoal,
      },
      { path: amcPath, status: 201 },
    )
  ).job;
  check(importedAmc.amcGoal, amcJob.amcGoal);
  check(importedAmc.revision, 0);
  // Goal remains below its own cap while accumulated WorkJob receipts exceed
  // the storage boundary. Reject the new record and retain the saved revision.
  const largeReason = 'x'.repeat(100_000);
  for (let index = 0; index < 5; index += 1) {
    ({ job: amcJob } = await amcPatch(
      amcCommand('pause', { reason: largeReason }),
    ));
    ({ job: amcJob } = await amcPatch(amcCommand('resume')));
  }
  check(
    new TextEncoder().encode(JSON.stringify(amcJob.amcGoal)).byteLength <
      1_500_000,
    true,
  );
  await amcPatch(amcCommand('pause', { reason: largeReason }), { status: 413 });
  check(
    (await call('GET', undefined, { path: `${amcPath}?id=${amcJob.id}` })).job,
    amcJob,
  );

  // Isolated proxy-header fixtures, not proof of a deployed sign-in gateway.
  const skyDraft=prepareSkyGoal(JSON.parse(readFileSync(join(root,'data/amc/sky/sky-amc-plan.json'),'utf8')),JSON.parse(readFileSync(join(root,'data/amc/sky/sky-amc-goal.json'),'utf8')));
  const amcOptions={path:'/api/amc',cache:'private, no-store'};
  const amcId=randomUUID();
  let amc=(await call('POST',{id:amcId,importGoal:skyDraft},{...amcOptions,status:201})).job;
  await call('GET',undefined,{...amcOptions,path:`/api/amc?id=${amcId}`,user:bob,status:404});
  await call('GET',undefined,{...amcOptions,user:null,status:401});
  const approvalId=randomUUID();
  amc=(await call('PATCH',{jobId:amc.id,revision:amc.revision,command:{id:approvalId,action:'amc_event',event:{id:approvalId,type:'approve_plan',actor:'forged-reviewer',role:'reviewer',expectedRevision:amc.amcGoal.revision,scopeConfirmed:true,coverageStatement:'Isolated HTTP fixture only',acceptanceCriteria:amc.amcGoal.overallAcceptance.criteria}}},amcOptions)).job;
  check(amc.amcGoal.approval.actor,alice);
  check(amc.amcGoal.approval.role,'owner');
  const forged={jobId:amc.id,revision:amc.revision,command:{id:randomUUID(),action:'amc_event',event:{type:'start_task',actor:'forged',role:'worker',taskId:'S0-01',expectedRevision:amc.amcGoal.revision,matched:true,sourceHash:'pretend'}}};
  await call('PATCH',forged,{...amcOptions,status:409});
  const revalidation={...forged,command:{...forged.command,id:randomUUID(),event:{...forged.command.event,type:'revalidate_task',actor:alice,role:'owner',reason:'Forged current-candidate claim',evidence:['maintenance/forged.json'],affectedTaskIds:['S0-01']}}};
  await call('PATCH',revalidation,{...amcOptions,status:409});
  await call('PATCH',forged,{status:400});
  await call('POST',{id:randomUUID(),importGoal:amc.amcGoal},{...amcOptions,status:409});
  check((await call('GET',undefined,{...amcOptions,path:`/api/amc?id=${amcId}`})).job.amcGoal.tasks[0].status,'pending');
  console.log(
    `仕事API: ${assertions} assertions passed (認証境界・分離・競合・順序・再送・再起動後の保存)`,
  );
} finally {
  await stop();
  rmSync(temporary, { recursive: true, force: true });
}
