import { checkSmisEveApi } from './smis-eve-api-acceptance.mjs';
import { createServer } from 'node:http';
// Protocol checks only. Synthetic identity headers simulate the Sites gateway on
// a loopback-only Worker; never send these headers to a deployed site.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign,
  webcrypto,
} from 'node:crypto';
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
  writeFileSync,
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
import { signEsimCloudRequest } from '../lib/esim-cloud-proof.ts';
import {
  createEsimPricingSnapshot,
  parseEsimServerPlanCatalog,
} from '../lib/esim-plan-catalog.ts';
import {
  a2aBrokerAuthorizationSigningBytes,
  A2A_BROKER_AUTHORIZATION_SCHEMA,
} from '../lib/a2a-broker-authorization.ts';
import {
  a2aWalletHandoffSigningBytes,
  A2A_WALLET_HANDOFF_REQUEST_SCHEMA,
} from '../lib/a2a-wallet-handoff-auth.ts';
import { createA2AIntentDigests } from '../lib/a2a-authorization.ts';
import {
  createSkyToolPackageDraft,
  skyToolPackageKey,
  skyToolPackageSha256,
} from '../lib/sky-tool-package.ts';
import {
  esimInstallReceiptSigningBytes,
  ESIM_INSTALL_RECEIPT_SCHEMA,
} from '../lib/esim-install-proof.ts';
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
import {
  issueRockstarEntitlementClaim,
  issueRockstarEntitlementEvent,
} from '../lib/rockstar-entitlement-issuer.ts';
import {
  a2aPriceQuoteSigningBytes,
  A2A_PRICE_QUOTE_SCHEMA,
} from '../lib/a2a-price-quote.ts';
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
import { checkLegacyDeviceBindingApi } from './device-binding-api-acceptance.mjs';
import { beginLinuxRun, finishLinuxRun } from '../lib/sky-linux-local.ts';
import {
  createRockstarRuntime,
  createLinkedTextWorker,
} from '../packages/rockstaros-runtime/src/index.mjs';
import {
  createOllamaExecutor,
  nodeHostDescriptor,
  textOutputDescriptor,
  openNodeExecutorJournal,
} from '../packages/rockstaros-runtime/src/node-host.mjs';

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
  serviceEntitlementIssuerKeyPair.privateKey.export({
    type: 'pkcs8',
    format: 'der',
  }),
  { name: 'Ed25519' },
  false,
  ['sign'],
);
const remoteAiRateIngestToken = 'api-check-rate-ingest-token-32-characters-min';
const skyPackageBindingOperatorToken =
  'api-check-sky-package-binding-token-32-chars';
const esimDeviceGatewayKeyPair = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});
const rotatedEsimDeviceGatewayKeyPair = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});
const a2aBrokerAttestationKeyPair = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});
const brokerPublicKey = new Uint8Array(
  brokerKeyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
);
const usagePublicKey = new Uint8Array(
  usageKeyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
);
const remoteAiRatePublicKey = new Uint8Array(
  remoteAiRateKeyPair.publicKey
    .export({ type: 'spki', format: 'der' })
    .subarray(-32),
);
const esimIssuerPublicKey = new Uint8Array(
  esimIssuerKeyPair.publicKey
    .export({ type: 'spki', format: 'der' })
    .subarray(-32),
);
const serviceEntitlementIssuerPublicKey = new Uint8Array(
  serviceEntitlementIssuerKeyPair.publicKey
    .export({ type: 'spki', format: 'der' })
    .subarray(-32),
);
const esimDeviceGatewayJwk = esimDeviceGatewayKeyPair.publicKey.export({
  format: 'jwk',
});
const originalEsimDeviceGatewayPublicKey = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(esimDeviceGatewayJwk.x, 'base64url'),
  Buffer.from(esimDeviceGatewayJwk.y, 'base64url'),
]);
const a2aBrokerAttestationJwk = a2aBrokerAttestationKeyPair.publicKey.export({
  format: 'jwk',
});
const a2aBrokerAttestationPublicKey = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(a2aBrokerAttestationJwk.x, 'base64url'),
  Buffer.from(a2aBrokerAttestationJwk.y, 'base64url'),
]);
const a2aBrokerAttestationKeyId = createHash('sha256')
  .update(a2aBrokerAttestationPublicKey)
  .digest('hex');
const attestedDeviceKeyId = createHash('sha256')
  .update(originalEsimDeviceGatewayPublicKey)
  .digest('hex');
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
  skyPackageBindingKeyPair.publicKey
    .export({ type: 'spki', format: 'der' })
    .subarray(-32),
);
const skyPackageBindingAgentOrigin = 'https://agent.example.test';
const skyPackageRuntimeExtensionUri =
  'https://rockstar.example/extensions/sky-package-runtime/v2';
const skyPackageBindingTrustedKeys = JSON.stringify([
  {
    providerId: 'api-check-agent-host',
    keyId: 'api-check-package-binding-key',
    agentOrigin: skyPackageBindingAgentOrigin,
    publicKeyHex: Buffer.from(skyPackageBindingPublicKey).toString('hex'),
    packagePins: [
      {
        packageKey: esimStarterPackageKey,
        manifestSha256: esimStarterPackageHash,
      },
    ],
    status: 'active',
  },
]);
function signedInstallReceipt({
  ownerUserId,
  orderId,
  profileDigest,
  challenge,
  deviceRef,
}) {
  const receipt = {
    schema: ESIM_INSTALL_RECEIPT_SCHEMA,
    issuerId: 'api-check-carrier',
    keyId: 'api-check-key-1',
    ownerUserId,
    orderId,
    profileDigest,
    challengeId: challenge.challengeId,
    challengeNonceSha256: createHash('sha256')
      .update(challenge.challengeNonce)
      .digest('hex'),
    deviceRef,
    installState: 'installed_enabled',
    evidenceSource: 'carrier_privileged',
    observedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    signature: '',
  };
  receipt.signature = sign(
    null,
    esimInstallReceiptSigningBytes(receipt),
    esimIssuerKeyPair.privateKey,
  ).toString('base64url');
  return receipt;
}
function signedDeviceEntitlementReceipt({
  ownerUserId,
  orderId,
  profileDigest,
  challenge,
  deviceRef,
  installReceiptSha256,
  starterPack,
  starterPackManifestSha256,
  authorityId = 'api-check-oem',
  keyId = 'api-check-device-key-1',
}) {
  const receipt = {
    schema: ESIM_DEVICE_ENTITLEMENT_SCHEMA,
    signatureAlgorithm: 'ES256',
    authorityId,
    keyId,
    ownerUserId,
    orderId,
    profileDigest,
    challengeId: challenge.challengeId,
    challengeNonceSha256: createHash('sha256')
      .update(challenge.challengeNonce)
      .digest('hex'),
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
  receipt.signature = sign(
    'sha256',
    esimDeviceEntitlementSigningBytes(receipt),
    {
      key: esimDeviceGatewayKeyPair.privateKey,
      dsaEncoding: 'ieee-p1363',
    },
  ).toString('base64url');
  return receipt;
}
async function androidAttestationVerifier(request) {
  attestationVerifierRequestCount++;
  try {
    assert.equal(request.url, 'https://attestation.example.test/v1/verify');
    assert.equal(request.method, 'POST');
    assert.equal(
      request.headers.get('authorization'),
      `Bearer ${attestationVerifierToken}`,
    );
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
let skyAppPrivateOwners = '';
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
  check(response.headers.get('cache-control'), 'no-store');
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
let eveHistoryKeyringAvailable = true;
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
    workers: [
      {
        name: config.name,
        rootPath: directory,
        modules: [
          config.main,
          ...readdirSync(directory, {
            recursive: true,
            encoding: 'utf8',
          }).filter(
            (file) =>
              file !== config.main &&
              !file.split(/[\\/]/).some((part) => part.startsWith('._')) &&
              /\.m?js$/.test(file),
          ),
        ].map((file) => ({ type: 'ESModule', path: resolve(directory, file) })),
        compatibilityDate: config.compatibility_date,
        compatibilityFlags: config.compatibility_flags,
        serviceBindings: {
          ANDROID_ATTESTATION_VERIFIER: androidAttestationVerifier,
        },
        bindings: {
          ...config.vars,
          EVE_HISTORY_KEYRING: eveHistoryKeyringAvailable ? JSON.stringify({
            current: 'fixture',
            keys: { fixture: '12'.repeat(32) },
          }) : '',
          SKY_APP_WORK_PRIVATE_OWNERS: skyAppPrivateOwners,
          SKY_REMOTE_LLM_ENABLED: remoteLlmEnabled ? 'true' : 'false',
          SKY_OLLAMA_BASE_URL: remoteModelEndpoint,
          SKY_LOCAL_LLM_BASE_URL: remoteModelEndpoint,
          SKY_LLM_COMPATIBLE_BASE_URL: remoteModelEndpoint,
          REMOTE_AI_TRUSTED_RATE_KEYS: remoteAiTrustedRateKeys,
          REMOTE_AI_RATE_CARD_INGEST_TOKEN: remoteAiRateIngestToken,
          REMOTE_AI_RATE_CARD_OPERATOR_ID: 'api-check-operator',
          SKY_PACKAGE_BINDING_OPERATOR_TOKEN: skyPackageBindingOperatorToken,
          SKY_PACKAGE_BINDING_OPERATOR_ID: 'api-check-sky-package-operator',
          SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS:
            skyPackageBindingTrustedKeys,
          SKY_PACKAGE_RUNTIME_EXTENSION_URI: skyPackageRuntimeExtensionUri,
          ESIMGO_API_KEY: 'fixture-esim-provider-key-only',
          ESIMGO_PROFILE_HASH_SECRET: 'c'.repeat(64),
          ESIMGO_INSTALL_MATERIAL_KEY: 'f'.repeat(64),
          ESIMGO_CALLBACK_DEDUPE_SECRET: 'd'.repeat(64),
          ESIMGO_PROVIDER_DEBIT_ENABLED: 'false',
          ANDROID_ATTESTATION_VERIFIER_URL:
            'https://attestation.example.test/v1/verify',
          ANDROID_ATTESTATION_VERIFIER_TOKEN: attestationVerifierToken,
          ANDROID_ATTESTATION_VERIFIER_COMMIT:
            ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT,
          ESIM_INSTALL_RECEIPT_KEYS: JSON.stringify([
            {
              issuerId: 'api-check-carrier',
              keyId: 'api-check-key-1',
              publicKeyHex: Buffer.from(esimIssuerPublicKey).toString('hex'),
              status: esimIssuerKeyStatus,
            },
          ]),
          ESIM_CLOUD_ACCESS_POLICIES_JSON: JSON.stringify([
            {
              packageKey: 'api-check-esim',
              manifestSha256: esimPackageHash,
              accessDurationDays: 60,
              scopes: ['rockstaros_access', 'sky', 'zema', 'agents'],
            },
          ]),
          ESIM_DEVICE_GATEWAY_KEYS: JSON.stringify([
            {
              authorityId: 'api-check-oem',
              ownerUserId: alice,
              deviceRef: 'api-check-device',
              keyId: 'api-check-device-key-1',
              algorithm: 'ES256',
              publicKeyHex: Buffer.from(esimDeviceGatewayPublicKey).toString(
                'hex',
              ),
              status: esimDeviceGatewayKeyStatus,
            },
          ]),
          ROCKSTAR_SERVICE_CLAIM_ISSUERS: JSON.stringify([
            {
              issuerId: 'api-check-retailer',
              issuerKeyId: 'api-check-retailer-key-1',
              publicKeyHex: Buffer.from(
                serviceEntitlementIssuerPublicKey,
              ).toString('hex'),
              status: 'active',
            },
          ]),
          ROCKSTAR_SERVICE_OFFER_PROFILES: JSON.stringify({
            schema: 'rockstar-service-offer-profiles/1',
            profiles: [
              {
                issuerId: 'api-check-retailer',
                offerId: 'rockstar-sim-standard-v1',
                profileId: 'lifeline',
                version: '1.0.0',
                label: 'Lifeline',
                packages: [
                  {
                    packageKey: esimStarterPackageKey,
                    manifestSha256: esimStarterPackageHash,
                  },
                ],
              },
            ],
          }),
          ESIM_PUBLIC_CATALOG_JSON: JSON.stringify({
            version: 'api-public-v1',
            plans: [
              {
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
              },
            ],
          }),
          ESIMGO_PLAN_CATALOG_JSON: JSON.stringify({
            version: 'api-check-v1',
            plans: [
              {
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
                starterAgentPack: {
                  id: 'lifeline',
                  version: '1.0.0',
                  packages: [
                    {
                      packageKey: esimStarterPackageKey,
                      manifestSha256: esimStarterPackageHash,
                    },
                  ],
                },
              },
            ],
          }),
          A2A_INPUT_ENCRYPTION_KEY: 'a'.repeat(64),
          A2A_TRUSTED_BROKER_KEYS: JSON.stringify([
            {
              authorityId: 'fixture-rockstaros',
              ownerUserId: alice,
              deviceRef: 'fixture-device-a',
              keyId: 'fixture-device-key',
              publicKeyHex: Buffer.from(brokerPublicKey).toString('hex'),
              status: 'active',
            },
          ]),
          A2A_TRUSTED_USAGE_KEYS: JSON.stringify([
            {
              providerId: 'api-check-provider',
              keyId: 'api-check-usage-key',
              agentOrigin: 'https://agent.example.com',
              publicKeyHex: Buffer.from(usagePublicKey).toString('hex'),
              status: 'active',
            },
          ]),
          A2A_PRICE_QUOTES_REQUIRED: priceQuoteRequired ? 'true' : 'false',
          ...(a2aExecutionEnabled
            ? { A2A_DELEGATION_EXECUTION_ENABLED: 'true' }
            : {}),
          ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:
            serviceEntitlementEnforcementEnabled ? 'true' : 'false',
        },
        d1Databases: Object.fromEntries(
          config.d1_databases.map((db) => [db.binding, db.database_id]),
        ),
      },
    ],
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
          if (!['EXDEV', 'EPERM', 'EACCES', 'EMLINK'].includes(error?.code))
            throw error;
          copyFileSync(sourcePath, destinationPath);
        }
      } else if (entry.isSymbolicLink())
        symlinkSync(readlinkSync(sourcePath), destinationPath);
      else throw new Error(`Unsupported build artifact type: ${sourcePath}`);
    }
  }
  linkBuildTree(join(root, 'dist'), join(temporary, 'dist'));
  cpSync(join(root, 'drizzle'), join(temporary, 'migrations'), {
    recursive: true,
    filter: (source) => !source.split(/[\\/]/).at(-1).startsWith('._'),
  });
  await start();
  // A loopback request and an owner header still cannot open the lab in production.
  const privateLab = await fetch(`${base}/sky/add/zoom/lab`, {
    headers: { 'oai-authenticated-user-id': alice },
    signal: AbortSignal.timeout(10000),
  });
  check(privateLab.status, 404);
  check((await privateLab.text()).includes('このLabでできること'), false);
  check((await fetch(`${base}/sky/apps/planner/lab`)).status, 404);
  check((await fetch(`${base}/sky/add/zoom/device`)).status, 404);
  check(
    (
      await fetch(`${base}/__sky/zoom-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      })
    ).status,
    404,
  );
  const closedLocalChannel = await fetch(`${base}/api/sky/app-lab`, {
    headers: { Origin: 'http://localhost:5197' },
  });
  check(closedLocalChannel.status, 404);
  check(closedLocalChannel.headers.get('access-control-allow-origin'), null);
  const statusBeforeSchema = await call('GET', undefined, {
    path: '/api/sky/service-status',
    user: null,
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
    .filter((file) => !file.startsWith('._') && file.endsWith('.sql'))
    .sort()) {
    for (const sql of readFileSync(join(temporary, 'migrations', file), 'utf8')
      .split('--> statement-breakpoint')
      .filter((sql) => sql.trim()))
      await database.prepare(sql).run();
  }
  const serviceStatus = await call('GET', undefined, {
    path: '/api/sky/service-status',
    user: null,
  });
  check(serviceStatus.database, 'available');
  await checkSmisEveApi({call,check,database,alice,bob});
  check(serviceStatus.payments, 'unconfigured');
  check(serviceStatus.csvPayments, 'unconfigured');
  check(serviceStatus.legalAiConfigured, false);
  check(serviceStatus.jevConfigured, false);
  check(
    Object.keys(serviceStatus).sort(),
    [
      'version',
      'database',
      'csvStorageConfigured',
      'legalAiConfigured',
      'patentAiConfigured',
      'jevConfigured',
      'payments',
      'csvPayments',
    ].sort(),
  );
  const entitlementPath = '/api/rockstar/entitlements';
  await call('GET', undefined, {
    path: entitlementPath,
    user: null,
    status: 401,
  });
  const initialEntitlements = await call('GET', undefined, {
    path: entitlementPath,
  });
  check(initialEntitlements.claimRedemptionAvailable, true);
  check(initialEntitlements.entitlements, []);
  const deviceAuthorizationPath = '/api/rockstar/device-authorizations';
  const deviceBindingHeaders = { 'X-Rockstar-Device-Binding': 'owner-device/v1' };
  const deviceAuthorization = await call(
    'POST',
    {
      action: 'begin',
      deviceName: 'Synthetic Android device',
    },
    { path: deviceAuthorizationPath, user: null, status: 201, headers: deviceBindingHeaders },
  );
  assert.match(deviceAuthorization.userCode, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.match(
    deviceAuthorization.deviceCode,
    /^rock_device_[A-Za-z0-9_-]{43}$/,
  );
  check(deviceAuthorization.expiresIn, 600);
  check(deviceAuthorization.interval, 5);
  check(deviceAuthorization.sessionBinding, 'owner-device/v1');
  check(new URL(deviceAuthorization.verificationUriComplete).origin, base);
  const deviceApprovalPath = '/api/rockstar/device-authorizations/approve';
  const deviceDetails = await call('GET', undefined, {
    path: `${deviceApprovalPath}?user_code=${deviceAuthorization.userCode}`,
  });
  check(deviceDetails.authorization.clientName, 'Synthetic Android device');
  await call(
    'POST',
    { action: 'approve', userCode: deviceAuthorization.userCode },
    {
      path: deviceApprovalPath,
      origin: 'https://attacker.invalid',
      status: 403,
    },
  );
  await call(
    'POST',
    { action: 'approve', userCode: deviceAuthorization.userCode },
    {
      path: deviceApprovalPath,
    },
  );
  await call(
    'POST',
    { action: 'approve', userCode: deviceAuthorization.userCode },
    {
      path: deviceApprovalPath,
      status: 404,
    },
  );
  const deviceGrant = await call(
    'POST',
    {
      action: 'poll',
      deviceCode: deviceAuthorization.deviceCode,
    },
    { path: deviceAuthorizationPath, user: null, headers: deviceBindingHeaders },
  );
  check(deviceGrant.status, 'authorized');
  check(deviceGrant.ownerUserId, alice);
  assert.match(deviceGrant.deviceId, /^[a-f0-9-]{36}$/);
  check((await rockstarDeviceLinkStore(database).identity(deviceGrant.accessToken)).id, deviceGrant.deviceId);
  assert.match(deviceGrant.accessToken, /^rock_session_[A-Za-z0-9_-]{43}$/);
  check(deviceGrant.expiresAt > Date.now(), true);
  const persistedDeviceToken = await database
    .prepare('SELECT token_sha256 AS tokenHash FROM rockstar_device_sessions')
    .first();
  check(persistedDeviceToken.tokenHash.length, 64);
  check(persistedDeviceToken.tokenHash === deviceGrant.accessToken, false);
  await assert.rejects(
    rockstarDeviceLinkStore(database).authenticate(
      deviceGrant.accessToken,
      deviceGrant.expiresAt,
    ),
    /UNAUTHORIZED/,
  );
  await call(
    'POST',
    { action: 'poll', deviceCode: deviceAuthorization.deviceCode },
    {
      path: deviceAuthorizationPath,
      user: null,
      headers: deviceBindingHeaders,
    },
  ).then((result) => {
    check(result.status, 'access_denied');
    check(Object.hasOwn(result, 'reason'), false);
  });
  const deniedAuthorization = await call('POST', {
    action: 'begin', deviceName: 'Synthetic denied Node host',
  }, { path: deviceAuthorizationPath, user: null, status: 201, headers: deviceBindingHeaders });
  const sessionsBeforeDenial = await database.prepare('SELECT COUNT(*) AS n FROM rockstar_device_sessions').first();
  await call('POST', { action: 'deny', userCode: deniedAuthorization.userCode }, { path: deviceApprovalPath });
  const deniedPoll = await call('POST', { action: 'poll', deviceCode: deniedAuthorization.deviceCode }, {
    path: deviceAuthorizationPath, user: null, headers: deviceBindingHeaders,
  });
  check(deniedPoll, { status: 'access_denied', reason: 'owner_denied' });
  check(await database.prepare('SELECT COUNT(*) AS n FROM rockstar_device_sessions').first(), sessionsBeforeDenial);
  await checkLegacyDeviceBindingApi({ call, check, database });
  const bearerEntitlements = await call('GET', undefined, {
    path: entitlementPath,
    user: null,
    headers: { Authorization: `Bearer ${deviceGrant.accessToken}` },
  });
  check(bearerEntitlements.entitlements, []);
  await call('GET', undefined, {
    path: '/api/rockstar/device-home',
    user: null,
    status: 401,
  });
  const deviceHomePath = '/api/rockstar/device-home';
  const deviceHomeHeaders = {
    Authorization: `Bearer ${deviceGrant.accessToken}`,
  };
  const initialDeviceHome = await call('GET', undefined, {
    path: deviceHomePath,
    user: null,
    headers: deviceHomeHeaders,
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
  await call('GET', undefined, {
    path: brokerDevicesPath,
    user: null,
    status: 401,
  });
  check(
    (await call('GET', undefined, { path: brokerDevicesPath })).devices,
    [],
  );
  await call(
    'POST',
    { action: 'challenge', deviceRef: brokerDeviceRef },
    {
      path: brokerDevicesPath,
      user: null,
      status: 401,
    },
  );
  await call(
    'POST',
    { action: 'challenge', deviceRef: brokerDeviceRef },
    {
      path: brokerDevicesPath,
      origin: 'https://attacker.invalid',
      status: 403,
    },
  );
  await call(
    'POST',
    { action: 'challenge', deviceRef: 'not-a-uuid' },
    {
      path: brokerDevicesPath,
      status: 400,
    },
  );
  const brokerChallenge = await call(
    'POST',
    {
      action: 'challenge',
      deviceRef: brokerDeviceRef,
    },
    { path: brokerDevicesPath, status: 201 },
  );
  check(brokerChallenge.deviceRef, brokerDeviceRef);
  assert.match(brokerChallenge.challengeNonce, /^[A-Za-z0-9_-]{43}$/);
  check(brokerChallenge.expiresAt > Date.now(), true);
  const brokerRegistration = {
    action: 'register',
    challengeId: brokerChallenge.challengeId,
    challengeNonce: brokerChallenge.challengeNonce,
    certificateChainDerBase64Url: ['AQ', 'Ag'],
  };
  await call('POST', brokerRegistration, {
    path: brokerDevicesPath,
    user: bob,
    status: 409,
  });
  const verifierCallsBeforeBrokerEnrollment = attestationVerifierRequestCount;
  attestationPublicKey = a2aBrokerAttestationPublicKey;
  attestationPublicKeyId = a2aBrokerAttestationKeyId;
  const enrolledBroker = await call('POST', brokerRegistration, {
    path: brokerDevicesPath,
    status: 201,
  });
  check(enrolledBroker.state, 'registered');
  check(enrolledBroker.authorityId, ANDROID_KEY_ATTESTATION_AUTHORITY);
  check(enrolledBroker.deviceRef, brokerDeviceRef);
  check(enrolledBroker.keyId, a2aBrokerAttestationKeyId);
  check(enrolledBroker.algorithm, 'ES256');
  check(
    attestationVerifierRequestCount,
    verifierCallsBeforeBrokerEnrollment + 1,
  );
  await call('POST', brokerRegistration, {
    path: brokerDevicesPath,
    status: 409,
  });
  const brokerDeviceList = await call('GET', undefined, {
    path: brokerDevicesPath,
  });
  check(brokerDeviceList.devices.length, 1);
  check(brokerDeviceList.devices[0].keyId, a2aBrokerAttestationKeyId);
  check(brokerDeviceList.devices[0].deviceRef, brokerDeviceRef);
  check(brokerDeviceList.devices[0].status, 'active');
  check('publicKeyHex' in brokerDeviceList.devices[0], false);
  check(
    (await call('GET', undefined, { path: brokerDevicesPath, user: bob }))
      .devices,
    [],
  );
  await call(
    'POST',
    {
      action: 'revoke',
      deviceRef: brokerDeviceRef,
      keyId: a2aBrokerAttestationKeyId,
    },
    {
      path: brokerDevicesPath,
      user: bob,
      status: 404,
    },
  );
  const brokerRevocation = await call(
    'POST',
    {
      action: 'revoke',
      deviceRef: brokerDeviceRef,
      keyId: a2aBrokerAttestationKeyId,
    },
    { path: brokerDevicesPath },
  );
  check(brokerRevocation.revoked, true);
  check(
    (await call('GET', undefined, { path: brokerDevicesPath })).devices[0]
      .status,
    'revoked',
  );
  attestationPublicKey = originalEsimDeviceGatewayPublicKey;
  attestationPublicKeyId = attestedDeviceKeyId;

  check(
    (
      await call('GET', undefined, {
        path: '/api/work-jobs',
        user: null,
        headers: { Authorization: `Bearer ${deviceGrant.accessToken}` },
      })
    ).jobs,
    [],
  );
  const expiredAuthorizationAt = Date.now();
  const expiredDeviceAuthorization = await rockstarDeviceLinkStore(
    database,
  ).begin('Expired test device', expiredAuthorizationAt);
  check(
    (
      await rockstarDeviceLinkStore(database).poll(
        expiredDeviceAuthorization.deviceCode,
        expiredAuthorizationAt + 600_000,
      )
    ).status,
    'expired_token',
  );
  const deviceSessionsPath = '/api/rockstar/device-sessions';
  const activeDeviceSessions = await call('GET', undefined, {
    path: deviceSessionsPath,
  });
  check(activeDeviceSessions.sessions.length, 1);
  check(
    activeDeviceSessions.sessions[0].deviceName,
    'Synthetic Android device',
  );
  check('token' in activeDeviceSessions.sessions[0], false);
  const entitlementCode = `rsk_${Buffer.alloc(32, 42).toString('base64url')}`;
  const entitlementClaim = {
    schema: ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA,
    issuerId: 'api-check-retailer',
    issuerKeyId: 'api-check-retailer-key-1',
    claimId: 'api-check-purchase-001',
    offerId: 'rockstar-sim-standard-v1',
    purchaseReferenceSha256: createHash('sha256')
      .update('synthetic-purchase-reference')
      .digest('hex'),
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
  const entitlementBody = {
    claim: entitlementClaim,
    claimCode: entitlementCode,
  };
  const claimedEntitlement = await call('POST', entitlementBody, {
    path: entitlementPath,
    status: 201,
  });
  check(claimedEntitlement.entitlement.ownerUserId, alice);
  check(claimedEntitlement.entitlement.alreadyClaimed, false);
  check(claimedEntitlement.entitlement.serviceProfile.state, 'review_required');
  check(
    claimedEntitlement.entitlement.serviceProfile.packages[0].state,
    'unavailable',
  );
  const retriedEntitlement = await call('POST', entitlementBody, {
    path: entitlementPath,
    status: 200,
  });
  check(retriedEntitlement.entitlement.alreadyClaimed, true);
  await call('POST', entitlementBody, {
    path: entitlementPath,
    user: bob,
    status: 409,
  });
  await call(
    'POST',
    { ...entitlementBody, claimCode: `${entitlementCode}wrong` },
    {
      path: entitlementPath,
      status: 400,
    },
  );
  await call(
    'POST',
    {
      ...entitlementBody,
      claim: { ...entitlementClaim, offerId: 'tampered-offer' },
    },
    {
      path: entitlementPath,
      status: 400,
    },
  );
  check(
    (await call('GET', undefined, { path: entitlementPath })).entitlements
      .length,
    1,
  );
  check(
    (await call('GET', undefined, { path: entitlementPath, user: bob }))
      .entitlements,
    [],
  );
  serviceEntitlementEnforcementEnabled = true;
  await stop();
  await start();
  const a2aDelegationPath = '/api/sky/a2a-delegations';
  const deniedWithoutAgentClaim = await call(
    'POST',
    {},
    {
      path: a2aDelegationPath,
      user: bob,
      status: 403,
    },
  );
  check(deniedWithoutAgentClaim.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  await call('POST', {}, { path: a2aDelegationPath, user: alice, status: 400 });
  const deniedZema = await call(
    'POST',
    {},
    { path: '/api/work-jobs', user: bob, status: 403 },
  );
  check(deniedZema.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  await call('POST', {}, { path: '/api/work-jobs', user: alice, status: 400 });
  const deviceParent = await call(
    'POST',
    {
      id: randomUUID(),
      templateId: 'article',
      title: 'Synthetic device-home parent job',
    },
    { path: '/api/work-jobs', status: 201 },
  );
  const homeWithParentJob = await call('GET', undefined, {
    path: deviceHomePath,
    user: null,
    headers: deviceHomeHeaders,
  });
  check(homeWithParentJob.parentJobs.length, 1);
  check(homeWithParentJob.parentJobs[0].id, deviceParent.job.id);
  check(homeWithParentJob.parentJobs[0].status, 'active');
  check(Object.keys(homeWithParentJob.parentJobs[0]).sort(), [
    'id',
    'revision',
    'status',
    'title',
    'updatedAt',
  ]);
  check(
    JSON.stringify(homeWithParentJob.parentJobs).includes('fixture prompt'),
    false,
  );
  const cloudPlan = await call(
    'POST',
    {
      id: randomUUID(),
      templateId: 'cloud-agent',
      title: 'Synthetic Agent parent plan',
    },
    { path: '/api/work-jobs', status: 201 },
  );
  check(cloudPlan.job.plan.schemaVersion, 1);
  check(
    cloudPlan.job.plan.approvalGates.map((gate) => gate.requirement),
    [
      'provider_quote_wallet_reservation_and_explicit_cloud_approval',
      'terminal_result_captured_with_usage_receipt',
    ],
  );
  const planEditCommand = {
    id: randomUUID(),
    action: 'edit_plan',
    schemaVersion: 1,
    objective: 'Synthetic user-edited Cloud Agent objective',
  };
  const editedCloudPlan = await call(
    'PATCH',
    {
      jobId: cloudPlan.job.id,
      revision: cloudPlan.job.revision,
      command: planEditCommand,
    },
    { path: '/api/work-jobs' },
  );
  check(editedCloudPlan.job.plan.objective, planEditCommand.objective);
  check(
    editedCloudPlan.job.plan.approvalGates,
    cloudPlan.job.plan.approvalGates,
  );
  await call(
    'PATCH',
    {
      jobId: cloudPlan.job.id,
      revision: editedCloudPlan.job.revision,
      command: { ...planEditCommand, id: randomUUID(), approvalGates: [] },
    },
    { path: '/api/work-jobs', status: 400 },
  );
  await call(
    'PATCH',
    {
      jobId: cloudPlan.job.id,
      revision: editedCloudPlan.job.revision,
      command: { ...planEditCommand, id: randomUUID(), schemaVersion: 2 },
    },
    { path: '/api/work-jobs', status: 400 },
  );
  await call(
    'PATCH',
    {
      jobId: cloudPlan.job.id,
      revision: editedCloudPlan.job.revision,
      command: planEditCommand,
    },
    { path: '/api/work-jobs', user: bob, status: 404 },
  );
  const forgedCloudStep = await call(
    'PATCH',
    {
      jobId: cloudPlan.job.id,
      revision: editedCloudPlan.job.revision,
      command: {
        id: randomUUID(),
        action: 'record',
        stepId: 'agent-brief',
        tool: 'sky-a2a-brief',
        transport: 'browser',
        outcome: 'passed',
        sample: false,
        durationMs: 1,
        delegationId: randomUUID(),
      },
    },
    { path: '/api/work-jobs', status: 409 },
  );
  check(
    forgedCloudStep.error,
    '記録するAgent委任がこの親jobに属していません。',
  );
  const editableArticle = await call(
    'POST',
    {
      id: randomUUID(),
      templateId: 'article',
      title: 'Synthetic editable article plan',
    },
    { path: '/api/work-jobs', status: 201 },
  );
  const articleObjective = await call(
    'PATCH',
    {
      jobId: editableArticle.job.id,
      revision: 0,
      command: {
        id: randomUUID(),
        action: 'edit_plan',
        schemaVersion: 1,
        objective: 'Validate source notes and prepare a reviewable draft',
      },
    },
    { path: '/api/work-jobs' },
  );
  const articleStep = articleObjective.job.steps[0];
  const startedArticle = await call(
    'PATCH',
    {
      jobId: articleObjective.job.id,
      revision: articleObjective.job.revision,
      command: {
        id: randomUUID(),
        action: 'record',
        stepId: articleStep.id,
        tool: articleStep.tool,
        transport: 'browser',
        outcome: 'passed',
        sample: false,
        durationMs: 1,
      },
    },
    { path: '/api/work-jobs' },
  );
  await call(
    'PATCH',
    {
      jobId: startedArticle.job.id,
      revision: startedArticle.job.revision,
      command: {
        id: randomUUID(),
        action: 'edit_plan',
        schemaVersion: 1,
        objective: 'Too late to revise this plan',
      },
    },
    { path: '/api/work-jobs', status: 409 },
  );
  await call('GET', undefined, {
    path: '/api/sky/a2a-agents',
    user: bob,
    status: 403,
  });
  check(
    (await call('GET', undefined, { path: '/api/sky/a2a-agents' })).agents,
    [],
  );
  const deniedMcp = await call(
    'POST',
    {},
    { path: '/api/sky/mcp/inspect', user: bob, status: 403 },
  );
  check(deniedMcp.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  await call(
    'POST',
    {},
    { path: '/api/sky/mcp/inspect', user: alice, status: 400 },
  );
  // Real bounded Sky Tool path from Eve; synthetic owners, no Provider calls.
  {
    const path = '/api/eve/tool-work', thread = randomUUID(), jobId = randomUUID();
    const input = { jobId, threadId: thread, objective: '出典リンクを保持して整形', source: '本文。（出典: [資料](https://example.com/eve-source)）', saveMaterial: true };
    await call('POST', input, { path, user: null, status: 401 });
    await call('POST', input, { path, origin: 'https://other.invalid', status: 403 });
    await call('POST', { ...input, saveMaterial: false }, { path, status: 400 });
    let result = await call('POST', input, { path, status: 201 });
    check(result.historySaved, true); check(result.job.eveTool.threadId, thread);
    await call('GET', undefined, { path: `${path}?id=${jobId}`, user: bob, status: 404 });
    const command = (action) => ({ jobId, revision: result.job.revision, commandId: randomUUID(), action });
    const advance = command('advance');
    result = await call('PATCH', advance, { path });
    check(result.job.composition.artifacts.s1.text.includes('## 出典'), true);
    check(result.job.eveTool.verification.checks.every(c => c.passed), true);
    const replay = await call('PATCH', advance, { path }); check(replay.job.revision, result.job.revision);
    await call('POST', { action: 'clear', jobId, revision: result.job.revision, commandId: randomUUID() }, { path: '/api/work-jobs/composition', status: 409 });
    await call('PATCH', { jobId, revision: result.job.revision, command: { id: randomUUID(), action: 'complete', note: '偽完了' } }, { path: '/api/work-jobs', status: 409 });
    result = await call('PATCH', command('advance'), { path }); check(result.job.status, 'review');
    result = await call('PATCH', command('complete'), { path }); check(result.job.status, 'completed');
    const saved = await call('GET', undefined, { path: `${path}?id=${jobId}` }); check(saved.job.revision, result.job.revision);
    const history = await call('GET', undefined, { path: `/api/eve/history?id=${thread}` });
    check(history.session.messages.some(m => m.text.includes(jobId) && m.text.includes('検査済み・完了')), true);
    const plannedId = randomUUID();
    const sourceHash = createHash('sha256').update(input.source).digest('hex');
    const candidate = { schema: 'eve.plan-candidate/1', jobId: plannedId, objective: input.objective, sourceSha256: sourceHash, nodes: [
      { id: 's3', tool: 'mr-citations', inputs: ['source'], config: {} },
      { id: 's8', tool: 'compose-check', inputs: ['s3'], config: { minChars: 1, requiredText: [] } },
    ], unknowns: [], stopReason: null };
    await call('POST', { ...input, jobId: plannedId, plannerCandidate: JSON.stringify({ ...candidate, approved: true }) }, { path, status: 400 });
    await call('POST', { ...input, jobId: plannedId, plannerCandidate: JSON.stringify({ ...candidate, sourceSha256: 'b'.repeat(64) }) }, { path, status: 409 });
    await call('POST', { ...input, jobId: plannedId, plannerCandidate: JSON.stringify({ ...candidate, nodes: [{ id: 's1', tool: 'shell', inputs: ['source'], config: {} }] }) }, { path, status: 400 });
    let planned = (await call('POST', { ...input, jobId: plannedId, plannerCandidate: JSON.stringify(candidate), plannerModel: 'synthetic-model-label' }, { path, status: 201 })).job;
    check(planned.eveTool.planner, 'validated-llm-candidate/1');
    for (const action of ['advance', 'advance', 'complete']) planned = (await call('PATCH', { jobId: plannedId, revision: planned.revision, commandId: randomUUID(), action }, { path })).job;
    check(planned.status, 'completed'); check(planned.eveTool.outputStepId, 's8');
    const durableInput = { ...input, jobId: randomUUID(), plannerRequest: { modelLabel: 'synthetic-installed-label', modelDigest: 'a'.repeat(64) } };
    let durable = (await call('POST', durableInput, { path, status: 201 })).job;
    const claim = { jobId: durable.id, revision: durable.revision, commandId: randomUUID(), action: 'planner-claim' };
    durable = (await call('PATCH', claim, { path })).job;
    await call('PATCH', claim, { path, user: bob, status: 403 }); // Bob also lacks the required Eve entitlement.
    await call('PATCH', claim, { path, origin: 'https://other.invalid', status: 403 });
    check((await call('PATCH', claim, { path })).job.revision, durable.revision);
    // Persist before inference: a real workerd restart cannot reset the lease/cap.
    await stop(); await start();
    durable = (await call('GET', undefined, { path: `${path}?id=${durable.id}` })).job;
    check(durable.eveTool.planning.attempts.length, 1);
    await call('PATCH', { jobId: durable.id, revision: durable.revision, commandId: randomUUID(), action: 'planner-claim' }, { path, status: 409 });
    await call('PATCH', { jobId: durable.id, revision: durable.revision, commandId: randomUUID(), action: 'advance' }, { path, status: 409 });
    durable = (await call('PATCH', { jobId: durable.id, revision: durable.revision, commandId: randomUUID(), action: 'planner-submit', attemptId: claim.commandId, output: '{ invalid candidate' }, { path })).job;
    check(durable.eveTool.planning.attempts[0].state, 'invalid');
    check((await call('POST', durableInput, { path, status: 201 })).job.eveTool.planning.attempts.length, 1);
    const second = { jobId: durable.id, revision: durable.revision, commandId: randomUUID(), action: 'planner-claim' };
    durable = (await call('PATCH', second, { path })).job;
    durable = (await call('PATCH', { jobId: durable.id, revision: durable.revision, commandId: randomUUID(), action: 'planner-submit', attemptId: second.commandId, output: JSON.stringify({ ...candidate, jobId: durable.id }) }, { path })).job;
    check(durable.eveTool.planning.status, 'proposed');
    await stop(); await start();
    durable = (await call('GET', undefined, { path: `${path}?id=${durable.id}` })).job;
    check(durable.eveTool.planning.attempts.length, 2);
    check(durable.eveTool.planning.status, 'proposed');
    await call('PATCH', { jobId: durable.id, revision: durable.revision, commandId: randomUUID(), action: 'advance' }, { path, status: 409 });
    durable = (await call('PATCH', { jobId: durable.id, revision: durable.revision, commandId: randomUUID(), action: 'planner-adopt' }, { path })).job;
    for (const action of ['advance', 'advance', 'complete']) durable = (await call('PATCH', { jobId: durable.id, revision: durable.revision, commandId: randomUUID(), action }, { path })).job;
    check(durable.status, 'completed');
    // Existing LLM HTTP adapter saves trusted observations and candidate before
    // browser acknowledgement. Controlled local fixture, never a paid Provider.
    let plannerInferenceCalls = 0, plannerObservedLimit, plannerInventoryDigest = 'a'.repeat(64), plannerDriftAfterResponse = false;
    const plannerServer = createServer(async (request, response) => {
      try {
        if (request.url === '/api/tags') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ models: [{ name: 'local-meter-fixture', digest: plannerInventoryDigest, size: 1 }] })); return; }
        const chunks = []; for await (const chunk of request) chunks.push(chunk);
        const value = JSON.parse(Buffer.concat(chunks).toString());
        plannerInferenceCalls++; plannerObservedLimit = value.options.num_predict;
        if (plannerDriftAfterResponse) plannerInventoryDigest = 'b'.repeat(64);
        const template = JSON.parse(value.messages.find(m => m.role === 'user').content.split('\n')[1]);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ model: value.model, message: { content: JSON.stringify(template) }, prompt_eval_count: 91, eval_count: 22 }));
      } catch { response.writeHead(500); response.end('{}'); }
    });
    await new Promise(resolve => plannerServer.listen(0, '127.0.0.1', resolve));
    const previousEndpoint = remoteModelEndpoint;
    try {
      remoteModelEndpoint = `http://127.0.0.1:${plannerServer.address().port}`; await stop(); await start();
      let metered = (await call('POST', { ...input, jobId: randomUUID(), plannerRequest: { modelLabel: 'local-meter-fixture', modelDigest: 'a'.repeat(64) } }, { path, status: 201 })).job;
      const lease = randomUUID();
      metered = (await call('PATCH', { jobId: metered.id, revision: metered.revision, commandId: lease, action: 'planner-claim' }, { path })).job;
      const invoke = { provider: 'ollama', model: 'local-meter-fixture', prompt: 'Untrusted prompt must be replaced by saved Goal', maxOutputTokens: 100000, evePlanner: { jobId: metered.id, attemptId: lease } };
      const inferred = await call('POST', invoke, { path: '/api/llm/text' });
      check(inferred.eveWork.eveTool.planning.status, 'proposed'); check(plannerInferenceCalls, 1); check(plannerObservedLimit, 600);
      check(inferred.historySaved, true);
      await call('POST', invoke, { path: '/api/llm/text', status: 409 }); check(plannerInferenceCalls, 1);
      await stop(); await start();
      metered = (await call('GET', undefined, { path: `${path}?id=${metered.id}` })).job;
      const observed = metered.eveTool.planning.attempts[0].inference.usage;
      check(observed.metrics.find(m => m.meter === 'input_tokens').quantity, 91);
      check(observed.metrics.find(m => m.meter === 'output_tokens').quantity, 22);
      check(observed.amountMinor, null); check(observed.invoiceVerified, false); check(observed.developerPayment.status, 'contract_not_bound');
      check(metered.eveTool.planning.attempts[0].inference.modelIdentity.status, 'observed_match');
      await call('POST', invoke, { path: '/api/llm/text', status: 409 }); check(plannerInferenceCalls, 1);
      const projected = await call('GET', undefined, { path: `/api/eve/history?id=${metered.eveTool.threadId}` });
      const projectionText = projected.session.messages.find(m => m.id === `tool-result-${metered.id}`).text;
      check(projectionText.includes('計画候補を検証済み・本人の採用待ち'), true); check(projectionText.includes('入力: 91 tokens'), true);
      // An outage may block the projection, never the stop or retained receipt.
      eveHistoryKeyringAvailable = false; await stop(); await start();
      const stopped = await call('PATCH', { jobId: metered.id, revision: metered.revision, commandId: randomUUID(), action: 'cancel' }, { path });
      check(stopped.job.status, 'cancelled'); check(stopped.historySaved, false); check(plannerInferenceCalls, 1);
      eveHistoryKeyringAvailable = true; await stop(); await start();
      const restored = await call('PATCH', { jobId: metered.id, revision: stopped.job.revision, commandId: randomUUID(), action: 'sync' }, { path });
      check(restored.historySaved, true); check(restored.job.revision, stopped.job.revision); check(plannerInferenceCalls, 1);
      const restoredHistory = await call('GET', undefined, { path: `/api/eve/history?id=${metered.eveTool.threadId}` });
      const restoredText = restoredHistory.session.messages.find(m => m.id === `tool-result-${metered.id}`).text;
      check(restoredText.includes('状態: 停止済み'), true); check(restoredText.includes('出力: 22 tokens'), true);
      // A changed alias is not a new approved model. No call before mismatch;
      // post-response drift retains counters while withholding the proposal.
      for (const afterResponse of [false, true]) {
        plannerInventoryDigest = afterResponse ? 'a'.repeat(64) : 'b'.repeat(64); plannerDriftAfterResponse = afterResponse;
        let blocked = (await call('POST', { ...input, jobId: randomUUID(), plannerRequest: { modelLabel: 'local-meter-fixture', modelDigest: 'a'.repeat(64) } }, { path, status: 201 })).job;
        const blockedLease = randomUUID(); blocked = (await call('PATCH', { jobId: blocked.id, revision: blocked.revision, commandId: blockedLease, action: 'planner-claim' }, { path })).job;
        const denied = await call('POST', { ...invoke, evePlanner: { jobId: blocked.id, attemptId: blockedLease } }, { path: '/api/llm/text' });
        check(denied.plannerBlocked, 'model_changed'); check(denied.eveWork.eveTool.planning.status, 'draft');
        check(denied.eveWork.eveTool.planning.attempts[0].inference.state, afterResponse ? 'reported' : 'not_sent');
        const blockedHistory = await call('GET', undefined, { path: `/api/eve/history?id=${blocked.eveTool.threadId}` });
        check(blockedHistory.session.messages.find(m => m.id === `tool-result-${blocked.id}`).text.includes('AIの版変更・候補採用停止'), true);
        check(plannerInferenceCalls, afterResponse ? 2 : 1);
        await call('PATCH', { jobId: blocked.id, revision: denied.eveWork.revision, commandId: randomUUID(), action: 'planner-adopt' }, { path, status: 409 });
      }
    } finally {
      remoteModelEndpoint = previousEndpoint; await stop(); await start();
      await new Promise(resolve => plannerServer.close(resolve));
    }

    const repairId = randomUUID(), repairSource = '合成資料。'.repeat(1400) + '（出典: [資料](https://example.com/repair-api)）';
    const repairCandidate = { ...candidate, jobId: repairId, sourceSha256: createHash('sha256').update(repairSource).digest('hex'), nodes: [
      { id: 's1', tool: 'mr-citations', inputs: ['source'], config: {} },
      { id: 's2', tool: 'mr-citations', inputs: ['source'], config: {} },
      { id: 's3', tool: 'compose-join', inputs: ['s1','s2'], config: {} },
      { id: 's4', tool: 'compose-check', inputs: ['s3'], config: { minChars: 1, requiredText: [] } },
    ] };
    let repairing = (await call('POST', { ...input, jobId: repairId, source: repairSource, plannerCandidate: JSON.stringify(repairCandidate) }, { path, status: 201 })).job;
    for (let i = 0; i < 3; i++) repairing = (await call('PATCH', { jobId: repairId, revision: repairing.revision, commandId: randomUUID(), action: 'advance' }, { path })).job;
    check(repairing.eveTool.pendingFailure.code, 'output_limit'); check(repairing.eveTool.pendingFailure.repairable, true);
    const preservedOutput = repairing.composition.artifacts.s1.text, originalAcceptance = repairing.composition.plan.acceptance;
    for (const action of ['advance', 'advance', 'complete']) repairing = (await call('PATCH', { jobId: repairId, revision: repairing.revision, commandId: randomUUID(), action }, { path })).job;
    check(repairing.status, 'completed'); check(repairing.eveTool.repairCount, 1);
    check(repairing.composition.artifacts.s1.text, preservedOutput); check(repairing.composition.plan.acceptance, originalAcceptance);
    const next = { ...input, jobId: randomUUID() };
    result = await call('POST', next, { path, status: 201 });
    result = await call('PATCH', { jobId: next.jobId, revision: result.job.revision, commandId: randomUUID(), action: 'cancel' }, { path });
    check(result.job.status, 'cancelled');
    await call('PATCH', { jobId: next.jobId, revision: result.job.revision, commandId: randomUUID(), action: 'advance' }, { path, status: 409 });
  }
  // Bind existing A2A execution to Eve; cancellation remains pending until the
  // existing durable remote receipt/cancel state is reconciled. Synthetic only.
  {
    const path = '/api/eve/agent-work', input = { create: true, jobId: randomUUID(), threadId: randomUUID(), title: 'Eve Agent initial binding fixture', acceptance: { schema: 'eve.agent-criteria/1', minChars: 1, maxChars: 100, requiredText: ['fixture result'] } };
    await call('POST', input, { path, user: null, status: 401 });
    await call('POST', input, { path, origin: 'https://other.invalid', status: 403 });
    await call('POST', { ...input, templateId: 'article' }, { path, status: 400 });
    const outcomes = await Promise.allSettled([call('POST', input, { path, status: 201 }), call('POST', input, { path, status: 201 })]);
    check(outcomes.some(r => r.status === 'fulfilled'), true);
    for (const r of outcomes) if (r.status === 'rejected') check(String(r.reason.message).includes('received 409'), true);
    let result = await call('POST', input, { path, status: 201 });
    check(result.job.eveAgent.threadId, input.threadId); check(result.job.templateId, 'cloud-agent'); check(result.children.length, 0);
    check(result.historySaved, true); check(result.job.events.length, 0);
    check(result.job.eveAgent.acceptance, input.acceptance);
    const forgedAgreement = { jobId: input.jobId, action: 'bind-author-agreement', revision: result.job.revision, sourceDelegationId: randomUUID(), authorAgreement: { accepted: true } };
    await call('PATCH', forgedAgreement, { path, user: null, status: 401 });
    await call('PATCH', forgedAgreement, { path, origin: 'https://other.invalid', status: 403 });
    await call('PATCH', forgedAgreement, { path, user: bob, status: 404 });
    await call('PATCH', forgedAgreement, { path, status: 409 });
    await call('GET', undefined, { path: `${path}?id=${input.jobId}&terms=1`, user: bob, status: 404 });
    await call('PATCH', { ...forgedAgreement, action: 'register-author-agreement', termsText: 'forged self-reported agreement' }, { path, status: 409 });
    const afterForgedAgreement = await call('GET', undefined, { path: `${path}?id=${input.jobId}` });
    check(afterForgedAgreement.job, result.job); check(afterForgedAgreement.children.length, 0);
    await call('POST', { ...input, eveAgent: { usageSources: [{ authorAgreement: { accepted: true } }] } }, { path, status: 400 });

    await call('POST', { ...input, acceptance: { ...input.acceptance, requiredText: [] } }, { path, status: 409 });
    await call('POST', { ...input, jobId: randomUUID(), acceptance: { ...input.acceptance, maxChars: 0 } }, { path, status: 400 });
    await call('POST', { ...input, title: 'changed request' }, { path, status: 409 });
    await call('GET', undefined, { path: `${path}?id=${input.jobId}`, user: bob, status: 404 });
    await stop(); await start();
    result = await call('GET', undefined, { path: `${path}?id=${input.jobId}` });
    check(result.job.eveAgent.threadId, input.threadId); check(result.children.length, 0);
    result = await call('PATCH', { jobId: input.jobId, action: 'stop', revision: result.job.revision, commandId: randomUUID() }, { path });
    check(result.job.status, 'cancelled'); check(result.stop.confirmed, true);
    const replay = await call('POST', input, { path, status: 201 }); check(replay.job.status, 'cancelled'); check(replay.job.revision, result.job.revision);
  }
  const eveAgentProof = { jobId: randomUUID(), threadId: randomUUID(), childId: randomUUID() };
  {
    const path = '/api/eve/agent-work';
    const created = await call('POST', { id: eveAgentProof.jobId, title: 'Eve Agent persistence fixture', templateId: 'cloud-agent' }, { status: 201 });
    const binding = { jobId: created.job.id, threadId: eveAgentProof.threadId, revision: created.job.revision };
    await call('POST', binding, { path, user: null, status: 401 });
    await call('POST', binding, { path, origin: 'https://other.invalid', status: 403 });
    let result = await call('POST', binding, { path });
    check(result.historySaved, true); check(result.job.eveAgent.threadId, eveAgentProof.threadId);
    await call('GET', undefined, { path: `${path}?id=${eveAgentProof.jobId}`, user: bob, status: 404 });
    const a2a = a2aDelegationStore(database);
    const child = { id: eveAgentProof.childId, parentJobId: eveAgentProof.jobId, idempotencyKey: randomUUID(), messageId: randomUUID(), targetOrigin: 'https://agent.example.test', targetAgentName: 'Eve synthetic Agent', targetAgentVersion: '1', protocolVersion: '1.0', inputSha256: 'a'.repeat(64), authorizationSha256: 'b'.repeat(64), budgetCurrency: 'USD', budgetLimitMinor: 10, parentBudgetLimitMinor: 20, continueWhileDeviceOffline: true, deadlineAt: Date.now() + 3600000 };
    await a2a.prepare(alice, child);
    let row = await a2a.approve(alice, child.id, child.authorizationSha256, { ciphertext: 'synthetic', nonce: 'synthetic', inputSha256: child.inputSha256, keyVersion: 'aes-256-gcm-v1' });
    row = await a2a.claimDispatch(alice, row.id); row = await a2a.beginRemoteSend(alice, row.id, row.revision);
    row = await a2a.recordTaskReceipt(alice, row.id, row.revision, { id: 'eve-remote-task', state: 'TASK_STATE_WORKING' });
    const completedChild = { ...child, id: randomUUID(), idempotencyKey: randomUUID(), messageId: randomUUID(), budgetLimitMinor: 0 };
    await a2a.prepare(alice, completedChild);
    let finished = await a2a.approve(alice, completedChild.id, completedChild.authorizationSha256, { ciphertext: 'synthetic', nonce: 'synthetic', inputSha256: completedChild.inputSha256, keyVersion: 'aes-256-gcm-v1' });
    finished = await a2a.claimDispatch(alice, finished.id); finished = await a2a.beginRemoteSend(alice, finished.id, finished.revision);
    finished = await a2a.recordTaskReceipt(alice, finished.id, finished.revision, { id: 'eve-preserved-result', state: 'TASK_STATE_COMPLETED' });
    const savedDocument = JSON.stringify({ schemaVersion: 1, artifacts: [{ name: 'preserved.txt', textParts: ['Synthetic saved result remains visible during parent stop.'] }], omittedNonTextParts: 0, truncated: false });
    await a2a.saveArtifact(alice, finished.id, 'eve-preserved-result', await encryptA2AArtifact(savedDocument, 'a'.repeat(64), alice, finished.id, 'eve-preserved-result'), new TextEncoder().encode(savedDocument).length);
    await a2a.markArtifactsCaptured(alice, finished.id, 'eve-preserved-result', finished.revision);
    result = await call('PATCH', { jobId: eveAgentProof.jobId, revision: result.job.revision, command: { id: randomUUID(), action: 'cancel' } });
    const stoppedHistory = await call('GET', undefined, { path: `/api/eve/history?id=${eveAgentProof.threadId}` });
    check(stoppedHistory.session.messages.some(m => m.text.includes('Synthetic saved result remains visible during parent stop.')), true);
    check(result.job.status, 'active'); check(result.stop.requested, true); check(result.stop.confirmed, false);
    row = await a2a.get(alice, row.id); row = await a2a.confirmCancelResult(alice, row.id, row.revision, 'TASK_STATE_WORKING');
    result = await call('PATCH', { jobId: eveAgentProof.jobId, action: 'sync' }, { path });
    check(result.stop.confirmed, false); check(result.children[0].state, 'cancel_unconfirmed'); check(result.children[0].usage, null);
    await call('PATCH', { jobId: eveAgentProof.jobId, revision: result.job.revision, command: { id: randomUUID(), action: 'edit_plan', schemaVersion: 1, objective: 'cannot restart' } }, { status: 409 });
  }
  // Owner history persists on the Worker, and social publishing remains separate.
  const historyPath = '/api/eve/history',
    socialPath = '/api/sky/social';
  await call('GET', undefined, { path: historyPath, user: null, status: 401 });
  const eveThread = randomUUID(),
    eveSession = {
      version: 1,
      id: eveThread,
      toolId: 'sky-auto',
      createdAt: 1,
      messages: [
        {
          id: 'fixture-color',
          side: 'me',
          text: '検証用の好きな色は藤紫です。',
        },
      ],
      activeRequest: null,
      workflowStatus: 'ready',
      outcome: null,
    };
  await call(
    'PUT',
    { session: eveSession, revision: 0, remember: true },
    { path: historyPath, origin: 'https://other.invalid', status: 403 },
  );
  check(
    (
      await call(
        'PUT',
        { session: eveSession, revision: 0, remember: true },
        { path: historyPath },
      )
    ).revision,
    1,
  );
  check(
    (await call('GET', undefined, { path: `${historyPath}?id=${eveThread}` }))
      .session.messages[0].text,
    eveSession.messages[0].text,
  );
  check(
    (await call('GET', undefined, { path: historyPath, user: bob })).items,
    [],
  );
  await call('GET', undefined, {
    path: `${historyPath}?id=${eveThread}`,
    user: bob,
    status: 404,
  });
  check(
    (await call('POST', { query: '好きな色' }, { path: historyPath }))
      .sources[0].messageId,
    'fixture-color',
  );
  check(
    (
      await call(
        'POST',
        { query: '好きな色' },
        { path: historyPath, user: bob },
      )
    ).sources,
    [],
  );
  await call(
    'PUT',
    { session: eveSession, revision: 0, remember: true },
    { path: historyPath, status: 409 },
  );
  await call(
    'PUT',
    {
      session: eveSession,
      revision: 1,
      remember: true,
      biometricTemplate: 'rejected',
    },
    { path: historyPath, status: 400 },
  );
  await call(
    'DELETE',
    { id: eveThread, revision: 1, confirm: 'delete-history' },
    { path: historyPath },
  );
  check(
    (await call('POST', { query: '好きな色' }, { path: historyPath })).sources,
    [],
  );
  await call(
    'PUT',
    { session: eveSession, revision: 0, remember: true },
    { path: historyPath, status: 410 },
  );
  // A linked Pixel reports the existing Linux job; this never creates an execution or money grant.
  const syncPath = '/api/eve/device-sync',
    syncHeaders = { Authorization: `Bearer ${deviceGrant.accessToken}` };
  await call('GET', undefined, { path: syncPath, user: null, status: 401 });
  const syncAgent = {
    id: randomUUID(),
    name: 'Synthetic writer',
    instructions: 'Synthetic text only',
    modelId: 'fixture-local',
    sha256: 'cd'.repeat(32),
  };
  const syncRun = finishLinuxRun(
    beginLinuxRun(
      syncAgent,
      '[同期試験] 合成の会話を続ける',
      randomUUID(),
      'ef'.repeat(32),
    ),
    {
      text: 'Synthetic saved output',
      modelSha256: 'ef'.repeat(32),
      durationMs: 10,
    },
  );
  const syncInput = { run: syncRun, threadId: syncRun.job.id, revision: 0 };
  await call('PUT', syncInput, { path: syncPath, status: 403 });
  await call('PUT', syncInput, {
    path: syncPath,
    user: null,
    headers: syncHeaders,
    origin: 'https://attacker.invalid',
    status: 403,
  });
  check(
    (
      await call('PUT', syncInput, {
        path: syncPath,
        user: null,
        headers: syncHeaders,
      })
    ).revision,
    1,
  );
  check(
    (
      await call('PUT', syncInput, {
        path: syncPath,
        user: null,
        headers: syncHeaders,
      })
    ).revision,
    1,
  );
  const syncSnapshot = await call('GET', undefined, { path: syncPath });
  check(syncSnapshot.jobs.length, 1);
  check(syncSnapshot.jobs[0].run.job.id, syncRun.job.id);
  check(syncSnapshot.jobs[0].provenance, 'linked-device-report');
  check((await call('GET', undefined, { path: syncPath, user: bob })).jobs, []);
  check(
    (
      await call('GET', undefined, {
        path: `${historyPath}?id=${syncRun.job.id}`,
      })
    ).session.messages.length,
    2,
  );
  await call(
    'PUT',
    {
      action: 'presence',
      presence: {
        name: 'Synthetic Pixel',
        phase: 'ready',
        agents: [syncAgent],
        models: [
          {
            id: syncAgent.modelId,
            name: 'Fixture model',
            sha256: 'ef'.repeat(32),
          },
        ],
        preparedModels: [syncAgent.modelId],
      },
    },
    { path: syncPath, user: null, headers: syncHeaders },
  );
  const syncCommand = {
    id: randomUUID(),
    threadId: syncRun.job.id,
    deviceId: activeDeviceSessions.sessions[0].id,
    agentId: syncAgent.id,
    agentSha256: syncAgent.sha256,
    modelSha256: 'ef'.repeat(32),
    input: '合成の続きを短く',
    confirm: 'run-on-pixel',
  };
  await call(
    'POST',
    { ...syncCommand, modelSha256: 'ab'.repeat(32) },
    { path: syncPath, status: 409 },
  );
  check(
    (
      await call('GET', undefined, {
        path: syncPath,
        user: null,
        headers: syncHeaders,
      })
    ).commands.length,
    0,
  );
  await call('POST', syncCommand, { path: syncPath });
  await call('POST', syncCommand, { path: syncPath });
  const syncPending = (
    await call('GET', undefined, {
      path: syncPath,
      user: null,
      headers: syncHeaders,
    })
  ).commands;
  check(syncPending.length, 1);
  check(syncPending[0].command.requestId, syncCommand.id);
  check(syncPending[0].command.modelSha256, 'ef'.repeat(32));
  check(syncPending[0].command.surface, 'eve');
  await call(
    'POST',
    { ...syncCommand, input: 'Changed request' },
    { path: syncPath, status: 409 },
  );
  await call(
    'DELETE',
    { id: syncRun.job.id, revision: 1, confirm: 'delete-history' },
    { path: historyPath },
  );
  await call('PUT', syncInput, {
    path: syncPath,
    user: null,
    headers: syncHeaders,
    status: 410,
  });
  // Common runtime over the real loopback Worker. Existing synthetic grant only.
  const preservedLegacyDevices = (await call('GET', undefined, { path: syncPath })).devices;
  const runtimePath = '/api/eve/runtime',
    runtimeDeviceId = activeDeviceSessions.sessions[0].id;
  const liveLocalModel = process.env.ROCKSTAR_RUNTIME_REAL_LOCAL === '1';
  const runtimeModel = liveLocalModel
    ? (
        await (
          await fetch('http://127.0.0.1:11434/api/tags', {
            signal: AbortSignal.timeout(5000),
          })
        ).json()
      ).models.find((m) => m.name === 'qwen2.5:1.5b')
    : { name: 'fixture-model', digest: '34'.repeat(32) };
  if (!runtimeModel)
    throw new Error(
      'Previously installed local test model missing; never download or substitute it',
    );
  const runtimePin = {
    id: runtimeModel.name,
    scheme: 'ollama-manifest-sha256',
    sha256: runtimeModel.digest,
  };
  const runtimeRecipe = {
    name: 'Synthetic common runtime',
    instructions:
      '入力された一文だけを、そのまま返してください。操作を実行したと主張しないでください。',
    modelId: runtimePin.id,
  };
  const runtimeAgent = {
    id: randomUUID(),
    ...runtimeRecipe,
    sha256: createHash('sha256')
      .update(JSON.stringify(runtimeRecipe))
      .digest('hex'),
  };
  let runtimeInferenceCalls = 0;
  const installedDriver = liveLocalModel
    ? createOllamaExecutor()
    : {
        describe: async () => ({
          ...nodeHostDescriptor(),
          id: 'fixture-executor',
          role: 'executor',
          capabilities: { 'text.generate': true, 'model.pin': true },
        }),
        generate: async (request) => ({
          text: request.input,
          model: request.model,
          durationMs: 1,
        }),
      };
  const runtimeDriver = {
    describe: (...args) => installedDriver.describe(...args),
    generate: async (...args) => {
      runtimeInferenceCalls++;
      return installedDriver.generate(...args);
    },
  };
  const runtimePresence = {
    schema: 'rockstaros.runtime-presence/1',
    name: 'Synthetic runtime host',
    phase: 'ready',
    host: nodeHostDescriptor(),
    executor: await runtimeDriver.describe(runtimePin),
    output: textOutputDescriptor(),
    agents: [runtimeAgent],
    models: [{ ...runtimePin, name: 'Installed test model' }],
    preparedModels: [runtimePin.id],
  };
  await call('GET', undefined, { path: runtimePath, user: null, status: 401 });
  await call(
    'PUT',
    { action: 'presence', presence: runtimePresence },
    { path: runtimePath, status: 403 },
  );
  await call(
    'PUT',
    { action: 'presence', presence: runtimePresence },
    {
      path: runtimePath,
      user: null,
      headers: syncHeaders,
      origin: 'https://attacker.invalid',
      status: 403,
    },
  );
  await call(
    'PUT',
    { action: 'presence', presence: runtimePresence },
    { path: runtimePath, user: null, headers: syncHeaders },
  );
  check(
    (await call('GET', undefined, { path: runtimePath })).devices.length,
    1,
  );
  check(
    (await call('GET', undefined, { path: runtimePath, user: bob })).devices
      .length,
    0,
  );
  check((await call('GET', undefined, { path: syncPath })).devices, preservedLegacyDevices);
  const runtimeInput = {
    id: randomUUID(),
    threadId: randomUUID(),
    deviceId: runtimeDeviceId,
    agentId: runtimeAgent.id,
    agentSha256: runtimeAgent.sha256,
    modelSha256: runtimePin.sha256,
    modelScheme: runtimePin.scheme,
    input: '下書きです。内容を確認してください。',
    maxOutputTokens: 128,
    confirm: 'run-owner-local-text',
  };
  await call('POST', runtimeInput, {
    path: runtimePath,
    user: null,
    status: 401,
  });
  await call('POST', runtimeInput, {
    path: runtimePath,
    user: null,
    headers: syncHeaders,
    status: 403,
  });
  await call('POST', runtimeInput, {
    path: runtimePath,
    origin: 'https://attacker.invalid',
    status: 403,
  });
  await call(
    'POST',
    { ...runtimeInput, shell: 'invalid' },
    { path: runtimePath, status: 400 },
  );
  await call('POST', runtimeInput, { path: runtimePath });
  await call('POST', runtimeInput, { path: runtimePath });
  const credentialDirectory = join(temporary, 'linked-credential-fixture'), credentialProfile = randomUUID();
  const { saveNodeHostCredentials, loadNodeHostCredentials } = await import('../packages/rockstaros-runtime/src/credential-vault.mjs');
  const syntheticUnlock = Buffer.from('Local integration fixture unlock phrase');
  await saveNodeHostCredentials(credentialDirectory, credentialProfile, { origin: base, owner: alice,
    deviceId: runtimeDeviceId, accessToken: deviceGrant.accessToken, expiresAt: Date.now()+600000 }, syntheticUnlock);
  check(readFileSync(join(credentialDirectory,credentialProfile+'.vault'),'utf8').includes(deviceGrant.accessToken),false);
  const unlockedCredential = await loadNodeHostCredentials(credentialDirectory,credentialProfile,syntheticUnlock);syntheticUnlock.fill(0);
  check(unlockedCredential.owner,alice);check(unlockedCredential.deviceId,runtimeDeviceId);
  const queuedRuntime = await call('GET', undefined, { path: runtimePath });
  check(queuedRuntime.pending.length,1);check(queuedRuntime.pending[0].state,'pending');
  check((await call('GET',undefined,{path:runtimePath,user:bob})).pending.length,0);
  const linked = createRockstarRuntime({
    origin: base,
    getSessionToken: async () => unlockedCredential.accessToken,
  });
  const linkedInitial = await linked.executions.inspect();
  check(linkedInitial.deviceId, runtimeDeviceId);
  check(linkedInitial.commands.length, 1);
  check(
    (
      await call('GET', undefined, {
        path: syncPath,
        user: null,
        headers: syncHeaders,
      })
    ).commands.length,
    0,
  );
  const linkedDirectory = join(temporary, 'linked-runtime'),
    linkedJournal = await openNodeExecutorJournal(linkedDirectory, {
      owner: alice,
      deviceId: runtimeDeviceId,
    });
  let linkedResult;
  try {
    const linkedWorker = createLinkedTextWorker({
      runtime: linked,
      owner: alice,
      deviceId: runtimeDeviceId,
      journal: linkedJournal,
      driver: runtimeDriver,
      host: () => nodeHostDescriptor(),
      output: { describe: () => textOutputDescriptor() },
    });
    linkedResult = await linkedWorker.run(linkedInitial.commands[0]);
    check(linkedResult.state, 'reported');
    check(linkedResult.execution.report.state, 'review');
    check(linkedResult.execution.report.model, runtimePin);
    check(linkedResult.execution.usage.cloudUsageMinor,0);
    check(linkedResult.execution.input,runtimeInput.input);
    check((await call('GET',undefined,{path:runtimePath})).pending.length,0);
    check(runtimeInferenceCalls, 1);
    const same = await linkedWorker.run(linkedInitial.commands[0]);
    check(same.execution.id, runtimeInput.id);
    check(runtimeInferenceCalls, 1);
  } finally {
    await linkedJournal.close();
  }
  const reopenedJournal = await openNodeExecutorJournal(linkedDirectory, {
    owner: alice,
    deviceId: runtimeDeviceId,
  });
  try {
    check(
      (await reopenedJournal.get(runtimeInput.id)).result.sha256,
      linkedResult.execution.report.outputSha256,
    );
  } finally {
    await reopenedJournal.close();
  }
  const runtimeMessages = (
    await call('GET', undefined, {
      path: `${historyPath}?id=${runtimeInput.threadId}`,
    })
  ).session.messages;
  check(runtimeMessages.length, 2);
  check(runtimeMessages[0].text, runtimeInput.input);
  check(runtimeMessages[1].text, linkedResult.execution.report.text);
  await call('GET', undefined, {
    path: `${runtimePath}?id=${runtimeInput.id}`,
    user: bob,
    status: 404,
  });
  check((await call('GET', undefined, { path: syncPath })).jobs.length, 0);
  check((await linked.executions.inspect()).commands.length, 0);
  {
    const cancelled = { ...runtimeInput, id: randomUUID(), threadId: randomUUID() };
    await call('POST', cancelled, { path: runtimePath });
    const stopBody = id => ({ action: 'stop', request: { id, confirm: 'stop-owner-local-text' } });
    await call('PUT', stopBody(cancelled.id), { path: runtimePath, user: null, status: 401 });
    await call('PUT', stopBody(cancelled.id), { path: runtimePath, user: null, headers: syncHeaders, status: 403 });
    await call('PUT', stopBody(cancelled.id), { path: runtimePath, user: bob, status: 404 });
    await call('PUT', stopBody(cancelled.id), { path: runtimePath, origin: 'https://attacker.invalid', status: 403 });
    check((await call('PUT', stopBody(cancelled.id), { path: runtimePath })).state, 'cancelled-before-start');
    check((await call('PUT', stopBody(cancelled.id), { path: runtimePath })).stopConfirmed, true);
    check((await linked.executions.inspect()).commands.length, 0);
    const active = { ...runtimeInput, id: randomUUID(), threadId: randomUUID() }, claimId = randomUUID();
    await call('POST', active, { path: runtimePath });
    const command = (await linked.executions.inspect()).commands[0].command;
    await call('PUT', { action: 'claim', claim: { id: active.id, claimId, requestSha256: command.requestSha256 } }, { path: runtimePath, user: null, headers: syncHeaders });
    await call('PUT', stopBody(active.id), { path: runtimePath, status: 409 });
    await call('PUT', { action: 'presence', presence: { ...runtimePresence, executor: { ...runtimePresence.executor, capabilities: { ...runtimePresence.executor.capabilities, 'execution.stop': true } } } }, { path: runtimePath, user: null, headers: syncHeaders });
    const requested = await call('PUT', stopBody(active.id), { path: runtimePath });
    check(requested.state, 'stop-requested'); check(requested.stopConfirmed, false);
    await call('PUT', { action: 'authorize', id: active.id, claimId }, { path: runtimePath, user: null, headers: syncHeaders, status: 409 });
    const receipt = { action: 'stop-receipt', receipt: { id: active.id, claimId, requestSha256: command.requestSha256, state: 'confirmed' } };
    await call('PUT', receipt, { path: runtimePath, status: 403 });
    await call('PUT', { ...receipt, receipt: { ...receipt.receipt, claimId: randomUUID() } }, { path: runtimePath, user: null, headers: syncHeaders, status: 409 });
    check((await call('PUT', receipt, { path: runtimePath, user: null, headers: syncHeaders })).state, 'stop-confirmed');
    check((await linked.executions.inspect()).commands.length, 0);
    const owner = await call('GET', undefined, { path: runtimePath });
    check(owner.pending.find(p => p.id === active.id).state, 'stop-confirmed');
    check(owner.executions.some(j => j.id === active.id), false);
    check((await call('GET', undefined, { path: `${historyPath}?id=${active.threadId}` })).session.messages.length, 1);
    check(runtimeInferenceCalls, 1);
  }
  if (liveLocalModel)
    writeFileSync(
      '/private/tmp/rock-runtime-service-real-acceptance.json',
      JSON.stringify(
        {
          schema: 'rockstaros.runtime-service-acceptance/1',
          scope:
            'synthetic owner and device grant on isolated local Worker; actual installed Mac model',
          jobId: runtimeInput.id,
          threadId: runtimeInput.threadId,
          model: runtimePin,
          outputSha256: linkedResult.execution.report.outputSha256,
          copyFixtureMatched: runtimeMessages[1].text === runtimeInput.input,
          inferenceCalls: runtimeInferenceCalls,
          sameJobReplayedWithoutInference: true,
          journalReopenHashMatched: true,
          ownerMessages: runtimeMessages.length,
          cloudCostMinor: 0,
          publicWebAccountLinked: false,
          physicalPixelModified: false,
          rootBuildInputSha256: createHash('sha256')
            .update(readFileSync(join(root, 'dist/server/index.js')))
            .digest('hex'),
        },
        null,
        2,
      ),
    );
  await call('GET', undefined, { path: socialPath, user: null, status: 401 });
  await call(
    'POST',
    { action: 'profile', name: 'Fixture creator' },
    { path: socialPath, origin: 'https://other.invalid', status: 403 },
  );
  await call(
    'POST',
    { action: 'profile', name: 'Fixture creator' },
    { path: socialPath },
  );
  await call(
    'POST',
    { action: 'profile', name: 'Fixture visitor' },
    { path: socialPath, user: bob },
  );
  const fixtureCommunity = randomUUID(),
    creatorKey = 'a1'.repeat(32),
    visitorKey = 'b2'.repeat(32);
  const creatorHeaders = {
      'x-rock-community-keys': JSON.stringify({
        [fixtureCommunity]: creatorKey,
      }),
    },
    visitorHeaders = {
      'x-rock-community-keys': JSON.stringify({
        [fixtureCommunity]: visitorKey,
      }),
    };
  await call(
    'POST',
    {
      action: 'createCommunity',
      id: fixtureCommunity,
      name: 'Fixture private community',
      description: 'Synthetic local only',
      rules: 'Share synthetic works only',
      visibility: 'members',
      accessKey: creatorKey,
      recoveryKey: 'c3'.repeat(32),
    },
    { path: socialPath },
  );
  const fixturePost = {
    action: 'post',
    id: randomUUID(),
    communityId: fixtureCommunity,
    content: 'Synthetic private creation',
  };
  await call('POST', fixturePost, { path: socialPath, status: 403 });
  await call('POST', fixturePost, {
    path: socialPath,
    headers: creatorHeaders,
  });
  check(
    (await call('GET', undefined, { path: socialPath, user: bob })).posts,
    [],
  );
  check(
    (await call('GET', undefined, { path: socialPath, user: bob })).communities,
    [],
  );
  await call(
    'POST',
    {
      action: 'join',
      id: fixtureCommunity,
      confirmRules: true,
      accessKey: visitorKey,
      rulesVersion: 0,
    },
    { path: socialPath, user: bob, status: 403 },
  );
  const fixtureInvite = (
    await call(
      'POST',
      { action: 'invite', id: fixtureCommunity },
      { path: socialPath, headers: creatorHeaders },
    )
  ).invite;
  check(
    (
      await call(
        'POST',
        { action: 'previewInvite', ...fixtureInvite },
        { path: socialPath, user: bob },
      )
    ).community.rules,
    'Share synthetic works only',
  );
  await call(
    'POST',
    {
      action: 'join',
      ...fixtureInvite,
      confirmRules: true,
      accessKey: visitorKey,
      rulesVersion: 0,
    },
    { path: socialPath, user: bob },
  );
  check(
    (await call('GET', undefined, { path: socialPath, user: bob })).posts,
    [],
  );
  check(
    (
      await call('GET', undefined, {
        path: socialPath,
        user: bob,
        headers: visitorHeaders,
      })
    ).posts[0].content,
    fixturePost.content,
  );
  // Timeline interactions share exactly the current account + dedicated-key boundary.
  await call(
    'POST',
    { action: 'reaction', id: fixturePost.id, reaction: 'like', enabled: true },
    { path: socialPath, user: null, status: 401 },
  );
  await call(
    'POST',
    { action: 'reaction', id: fixturePost.id, reaction: 'like', enabled: true },
    {
      path: socialPath,
      headers: creatorHeaders,
      origin: 'https://other.invalid',
      status: 403,
    },
  );
  await call(
    'POST',
    { action: 'reaction', id: fixturePost.id, reaction: 'like', enabled: true },
    { path: socialPath, user: bob, status: 404 },
  );
  const socialLike = await call(
    'POST',
    { action: 'reaction', id: fixturePost.id, reaction: 'like', enabled: true },
    { path: socialPath, user: bob, headers: visitorHeaders },
  );
  check(socialLike.post.likes, 1);
  check(socialLike.post.liked, true);
  check(
    (
      await call(
        'POST',
        {
          action: 'reaction',
          id: fixturePost.id,
          reaction: 'like',
          enabled: true,
        },
        { path: socialPath, user: bob, headers: visitorHeaders },
      )
    ).post.likes,
    1,
  );
  await call(
    'POST',
    {
      action: 'reaction',
      id: fixturePost.id,
      reaction: 'bookmark',
      enabled: true,
    },
    { path: socialPath, user: bob, headers: visitorHeaders },
  );
  check(
    (
      await call('GET', undefined, {
        path: socialPath + '?mode=bookmarks',
        user: bob,
        headers: visitorHeaders,
      })
    ).posts.length,
    1,
  );
  check(
    (
      await call('GET', undefined, {
        path: socialPath + '?mode=bookmarks',
        headers: creatorHeaders,
      })
    ).posts.length,
    0,
  );
  const timelineReply = randomUUID();
  await call(
    'POST',
    {
      action: 'post',
      id: timelineReply,
      replyTo: fixturePost.id,
      content: 'Synthetic keyed reply',
    },
    { path: socialPath, user: bob, headers: visitorHeaders },
  );
  const socialThread = await call('GET', undefined, {
    path: socialPath + '?thread=' + fixturePost.id,
    user: bob,
    headers: visitorHeaders,
  });
  check(socialThread.thread.replies, 1);
  check(socialThread.posts[0].community.id, fixtureCommunity);
  check(socialThread.posts[0].replyTo, fixturePost.id);
  await call('GET', undefined, {
    path: socialPath + '?thread=' + fixturePost.id,
    user: bob,
    status: 404,
  });
  const editionPath = '/api/sky/community-os',
    editionDraft = {
      name: 'Fixture OS',
      rules: 'Synthetic community rules',
      postMode: 'members',
      design: {
        background: '#f8f8f5',
        foreground: '#252d25',
        accent: '#456842',
        layout: 'cards',
        corners: 'round',
      },
      llm: { provider: 'ollama', model: 'qwen2.5:1.5b' },
      agents: [],
    };
  await call('GET', undefined, { path: editionPath, user: null, status: 401 });
  await call(
    'POST',
    {
      action: 'publish',
      communityId: fixtureCommunity,
      draft: editionDraft,
      expectedVersion: 0,
    },
    {
      path: editionPath,
      headers: creatorHeaders,
      origin: 'https://other.invalid',
      status: 403,
    },
  );
  await call(
    'POST',
    {
      action: 'publish',
      communityId: fixtureCommunity,
      draft: editionDraft,
      expectedVersion: 0,
    },
    { path: editionPath, status: 403 },
  );
  const edition = await call(
    'POST',
    {
      action: 'publish',
      communityId: fixtureCommunity,
      draft: editionDraft,
      expectedVersion: 0,
    },
    { path: editionPath, headers: creatorHeaders },
  );
  await call('GET', undefined, {
    path: `${editionPath}?community=${fixtureCommunity}`,
    user: bob,
    status: 403,
  });
  check(
    (
      await call('GET', undefined, {
        path: `${editionPath}?community=${fixtureCommunity}`,
        user: bob,
        headers: visitorHeaders,
      })
    ).edition.manifest.name,
    'Fixture OS',
  );
  const installInput = {
    action: 'apply',
    communityId: fixtureCommunity,
    version: 1,
    digest: edition.digest,
    revision: 0,
    expectedActive: '',
    approve: true,
  };
  const addedOs = await call('POST', installInput, {
    path: editionPath,
    user: bob,
    headers: visitorHeaders,
  });
  check(addedOs.active.manifest.design.layout, 'cards');
  check(addedOs.active.agents[0].agent.provider, 'ollama');
  check(addedOs.active.agents[0].agent.model, 'qwen2.5:1.5b');
  check(
    (
      await call('POST', installInput, {
        path: editionPath,
        user: bob,
        headers: visitorHeaders,
      })
    ).active.revision,
    addedOs.active.revision,
  );
  check(
    (await call('GET', undefined, { path: editionPath, user: bob })).active,
    null,
  );
  await call(
    'POST',
    { action: 'archiveCommunity', id: fixtureCommunity },
    { path: socialPath, user: bob, headers: visitorHeaders, status: 403 },
  );
  await call(
    'POST',
    { action: 'leave', id: fixtureCommunity },
    { path: socialPath, user: bob, headers: visitorHeaders },
  );
  check(
    (
      await call('GET', undefined, {
        path: socialPath,
        user: bob,
        headers: visitorHeaders,
      })
    ).posts,
    [],
  );
  check(
    (
      await call('GET', undefined, {
        path: editionPath,
        user: bob,
        headers: visitorHeaders,
      })
    ).active,
    null,
  );
  await call(
    'POST',
    { action: 'archiveCommunity', id: fixtureCommunity },
    { path: socialPath, headers: creatorHeaders },
  );
  check(
    (
      await call('GET', undefined, {
        path: socialPath,
        headers: creatorHeaders,
      })
    ).communities,
    [],
  );

  // Synthetic X source consent exercises only owner settings, never external scripts.
  await call('GET', undefined, {
    path: '/api/sky/hub',
    user: null,
    status: 401,
  });
  check((await call('GET', undefined, { path: '/api/sky/hub' })).plugins, []);
  const publicXPlugin = {
    kind: 'x',
    resource: 'https://x.com/huggingface',
    enabled: true,
    revision: 0,
  };
  await call('PUT', publicXPlugin, { path: '/api/sky/hub', status: 400 });
  const consentedXPlugin = {
    ...publicXPlugin,
    consentVersion: 'x-public-timeline-v1',
  };
  await call('PUT', consentedXPlugin, {
    path: '/api/sky/hub',
    origin: 'https://another.invalid',
    status: 403,
  });
  const savedXPlugin = await call('PUT', consentedXPlugin, {
    path: '/api/sky/hub',
  });
  check(savedXPlugin.plugins[0].metadata.skyFeeMinor, 0);
  check(savedXPlugin.plugins[0].resource, publicXPlugin.resource);
  check(
    (await call('GET', undefined, { path: '/api/sky/hub', user: bob })).plugins,
    [],
  );
  await call('GET', undefined, {
    path: '/api/sky/x-feed?source=https%3A%2F%2Fx.com%2Fhuggingface',
    user: null,
    status: 401,
  });
  await call('GET', undefined, {
    path: '/api/sky/x-feed?source=https%3A%2F%2Fx.com%2Fhuggingface',
    user: bob,
    status: 404,
  });
  const xApiDisabled = await call('GET', undefined, {
    path: '/api/sky/x-feed?source=https%3A%2F%2Fx.com%2Fhuggingface',
  });
  check(xApiDisabled.status, 'api-not-configured');
  check(xApiDisabled.posts, []);
  await call(
    'POST',
    { source: publicXPlugin.resource, revision: 1 },
    { path: '/api/sky/x-feed', origin: 'https://other.invalid', status: 403 },
  );
  await call(
    'POST',
    { source: publicXPlugin.resource, revision: 0 },
    { path: '/api/sky/x-feed', status: 409 },
  );
  check(
    (
      await call(
        'POST',
        { source: publicXPlugin.resource, revision: 1 },
        { path: '/api/sky/x-feed' },
      )
    ).status,
    'api-not-configured',
  );
  await call('PUT', consentedXPlugin, { path: '/api/sky/hub', status: 409 });
  await call(
    'PUT',
    { ...consentedXPlugin, revision: 1, metadata: { ready: true } },
    { path: '/api/sky/hub', status: 400 },
  );
  check(
    (
      await call(
        'PUT',
        { ...publicXPlugin, revision: 1, enabled: false },
        { path: '/api/sky/hub' },
      )
    ).plugins[0].enabled,
    false,
  );
  await call(
    'POST',
    { source: publicXPlugin.resource, revision: 2 },
    { path: '/api/sky/x-feed', status: 404 },
  );
  await call('GET', undefined, {
    path: '/api/sky/huggingface?kind=x',
    status: 400,
  });
  await call('GET', undefined, {
    path: '/api/sky/huggingface',
    user: null,
    status: 401,
  });
  await call('GET', undefined, {
    path: '/api/sky/x-account',
    user: null,
    status: 401,
  });
  const xAccountUnconfigured = await call('GET', undefined, {
    path: '/api/sky/x-account',
  });
  check(xAccountUnconfigured.setupRequired, true);
  check(xAccountUnconfigured.connected, false);
  check(xAccountUnconfigured.posts.length, 0);
  check(xAccountUnconfigured.xForYouAvailable, false);
  await call(
    'POST',
    { action: 'begin', consent: 'x-account-read-v1' },
    {
      path: '/api/sky/x-account',
      origin: 'https://other.invalid',
      status: 403,
    },
  );
  await call(
    'POST',
    { action: 'begin', consent: 'x-account-read-v1' },
    { path: '/api/sky/x-account', status: 503 },
  );
  await call(
    'POST',
    { action: 'refresh' },
    { path: '/api/sky/x-account', status: 503 },
  );
  await call(
    'DELETE',
    { revision: 99 },
    { path: '/api/sky/x-account', status: 409 },
  );
  check(
    (await call('GET', undefined, { path: '/api/sky/x-account', user: bob }))
      .posts.length,
    0,
  );
  await call('GET', undefined, {
    path: '/api/sky/features',
    user: null,
    status: 401,
  });
  check(
    (await call('GET', undefined, { path: '/api/sky/features' })).features.some(
      (f) => f.enabled,
    ),
    false,
  );
  const featureInput = {
    id: 'wallet',
    purpose: 'records',
    enabled: true,
    revision: 0,
  };
  await call('PUT', featureInput, {
    path: '/api/sky/features',
    origin: 'https://another.invalid',
    status: 403,
  });
  check(
    (
      await call('PUT', featureInput, { path: '/api/sky/features' })
    ).features.find((f) => f.id === 'wallet').enabled,
    true,
  );
  check(
    (
      await call('GET', undefined, { path: '/api/sky/features', user: bob })
    ).features.some((f) => f.enabled),
    false,
  );
  await call('PUT', featureInput, { path: '/api/sky/features', status: 409 });
  await call(
    'PUT',
    { ...featureInput, revision: 1, purpose: 'LIVE' },
    { path: '/api/sky/features', status: 400 },
  );
  check(
    (
      await call(
        'PUT',
        { ...featureInput, enabled: false, revision: 1 },
        { path: '/api/sky/features' },
      )
    ).features.find((f) => f.id === 'wallet').enabled,
    false,
  );
  // Saved Sky profile settings remain owner-scoped and cannot bypass model/pricing gates.
  await call('GET', undefined, {
    path: '/api/sky/agents',
    user: null,
    status: 401,
  });
  check(
    (await call('GET', undefined, { path: '/api/sky/agents' })).ownerUserId,
    alice,
  );
  const libraryId = randomUUID();
  const librarySettings = {
    name: 'Synthetic editor',
    attachment: { schema: 'sky.object-attachment/1', objectName: 'Synthetic plate', input: 'sensor', output: 'signal' },
    instructions: '文'.repeat(1200),
    provider: 'local-model',
    model: 'fixture-local-model',
    enabled: true,
  };
  const libraryCreate = {
    id: libraryId,
    revision: 0,
    settings: librarySettings,
    create: true,
  };
  await call('PUT', libraryCreate, {
    path: '/api/sky/agents',
    origin: 'https://another.invalid',
    status: 403,
  });
  const librarySaved = await call('PUT', libraryCreate, {
    path: '/api/sky/agents',
  });
  check(librarySaved.agent.revision, 1);
  await call('PUT', { ...libraryCreate, id: randomUUID() }, { path: '/api/sky/agents', headers: { 'x-sky-owner': bob }, status: 409 });
  check(librarySaved.agent.attachment, librarySettings.attachment);
  await call('PUT', { ...libraryCreate, id: randomUUID(), settings: { ...librarySettings, attachment: { ...librarySettings.attachment, approved: true } } }, { path: '/api/sky/agents', status: 400 });
  check(
    (await call('GET', undefined, { path: `/api/sky/agents?id=${libraryId}` }))
      .agent.instructions.length,
    1200,
  );
  await call('GET', undefined, {
    path: `/api/sky/agents?id=${libraryId}`,
    user: bob,
    status: 404,
  });
  await call(
    'PUT',
    { ...libraryCreate, create: false, revision: 1 },
    { path: '/api/sky/agents', user: bob, status: 404 },
  );
  await call(
    'PUT',
    { ...libraryCreate, create: false, revision: 0 },
    { path: '/api/sky/agents', status: 409 },
  );
  await call(
    'PUT',
    { ...libraryCreate, owner: bob },
    { path: '/api/sky/agents', status: 400 },
  );
  await call('PUT', 'x'.repeat(12001), {
    path: '/api/sky/agents',
    raw: true,
    status: 413,
  });
  const libraryLlm = {
    provider: librarySettings.provider,
    model: librarySettings.model,
    prompt: 'fixture',
    agentId: libraryId,
    agentRevision: 0,
  };
  check(
    (await call('POST', libraryLlm, { path: '/api/llm/text', status: 409 }))
      .code,
    'AGENT_SETTINGS_CHANGED',
  );
  await call(
    'POST',
    { ...libraryLlm, provider: 'openai', agentRevision: 1 },
    { path: '/api/llm/estimate', status: 409 },
  );
  await call(
    'PUT',
    {
      id: libraryId,
      revision: 1,
      settings: { ...librarySettings, enabled: false },
    },
    { path: '/api/sky/agents' },
  );
  await call(
    'POST',
    { ...libraryLlm, agentRevision: 2 },
    { path: '/api/llm/text', status: 409 },
  );
  const deniedLlm = await call(
    'POST',
    {},
    { path: '/api/llm/text', user: bob, status: 403 },
  );
  check(deniedLlm.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  await call('POST', {}, { path: '/api/llm/text', user: alice, status: 400 });
  const deniedEstimate = await call(
    'POST',
    {
      provider: 'openai',
      model: 'fixture-model',
      prompt: 'fixture prompt',
    },
    { path: '/api/llm/estimate', user: bob, status: 403 },
  );
  check(deniedEstimate.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  const unavailableEstimate = await call(
    'POST',
    {
      provider: 'openai',
      model: 'fixture-model',
      prompt: 'fixture prompt',
    },
    { path: '/api/llm/estimate', user: alice, status: 503 },
  );
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
  remoteAiTrustedRateKeys = JSON.stringify([
    {
      providerId: 'openai',
      keyId: 'api-check-rate-key',
      publicKeyHex: Buffer.from(remoteAiRatePublicKey).toString('hex'),
      status: 'active',
    },
  ]);
  await stop();
  await start();
  const rateCardAdminPath = '/api/internal/remote-ai/rate-cards';
  await call(
    'POST',
    { card: remoteAiRateCard },
    {
      path: rateCardAdminPath,
      user: null,
      status: 401,
    },
  );
  await call(
    'POST',
    { card: remoteAiRateCard },
    {
      path: rateCardAdminPath,
      user: null,
      status: 401,
      headers: {
        Authorization:
          'Bearer incorrect-token-which-is-long-enough-to-parse-123456',
      },
    },
  );
  const registeredRateCard = await call(
    'POST',
    { card: remoteAiRateCard },
    {
      path: rateCardAdminPath,
      user: null,
      status: 201,
      headers: { Authorization: `Bearer ${remoteAiRateIngestToken}` },
    },
  );
  check(registeredRateCard.inserted, true);
  const duplicateRateCard = await call(
    'POST',
    { card: remoteAiRateCard },
    {
      path: rateCardAdminPath,
      user: null,
      headers: { Authorization: `Bearer ${remoteAiRateIngestToken}` },
    },
  );
  check(duplicateRateCard.inserted, false);
  const estimateBody = {
    provider: 'openai',
    model: 'fixture-model',
    prompt: 'fixture prompt',
    maxOutputTokens: 100,
    maximumBudgetMinor: 1,
  };
  const liveRateEstimate = await call('POST', estimateBody, {
    path: '/api/llm/estimate',
    user: alice,
  });
  check(liveRateEstimate.estimate.maximumChargeMinor, 1);
  check(
    JSON.stringify(liveRateEstimate.unitRates),
    JSON.stringify([
      {
        category: 'ordinary-input',
        rateMinorMicrosPerMillionTokens: 1_000_000_000,
      },
      { category: 'output', rateMinorMicrosPerMillionTokens: 1_000_000_000 },
    ]),
  );
  check(liveRateEstimate.withinUserCap, true);
  check(liveRateEstimate.providerSubmission, 'not_performed');
  check(liveRateEstimate.executionAuthorized, false);
  check(liveRateEstimate.estimate.pricingCoverage, 'legacy-input-output-only');
  const overCapEstimate = await call(
    'POST',
    { ...estimateBody, maximumBudgetMinor: 0 },
    {
      path: '/api/llm/estimate',
      user: alice,
    },
  );
  check(overCapEstimate.estimate.maximumChargeMinor, 1);
  check(overCapEstimate.withinUserCap, false);
  const revokedRateCard = await call(
    'PATCH',
    {
      action: 'revoke',
      providerId: 'openai',
      cardId: 'api-check-rate-card',
    },
    {
      path: rateCardAdminPath,
      user: null,
      headers: { Authorization: `Bearer ${remoteAiRateIngestToken}` },
    },
  );
  check(revokedRateCard.revoked, true);
  const estimateAfterRevoke = await call('POST', estimateBody, {
    path: '/api/llm/estimate',
    user: alice,
    status: 503,
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
  textRateCard.signature = sign(
    null,
    remoteAiRateCardSigningBytes(textRateCard),
    remoteAiRateKeyPair.privateKey,
  ).toString('base64url');
  const textRegistered = await call(
    'POST',
    { card: textRateCard },
    {
      path: rateCardAdminPath,
      user: null,
      status: 201,
      headers: { Authorization: `Bearer ${remoteAiRateIngestToken}` },
    },
  );
  check(textRegistered.inserted, true);
  const textEstimate = await call('POST', estimateBody, {
    path: '/api/llm/estimate',
    user: alice,
  });
  check(textEstimate.estimate.maximumChargeMinor, 2);
  check(
    JSON.stringify(textEstimate.unitRates),
    JSON.stringify([
      {
        category: 'ordinary-input',
        rateMinorMicrosPerMillionTokens: 1_000_000_000,
      },
      {
        category: 'cached-input',
        rateMinorMicrosPerMillionTokens: 100_000_000,
      },
      {
        category: 'cache-write',
        rateMinorMicrosPerMillionTokens: 10_000_000_000,
      },
      { category: 'output', rateMinorMicrosPerMillionTokens: 1_000_000_000 },
    ]),
  );
  check(textEstimate.estimate.pricingCoverage, 'text-token-categories');
  check(textEstimate.withinUserCap, false);
  check(textEstimate.executionAuthorized, false);
  check(textEstimate.providerSubmission, 'not_performed');
  const textQuotesPath = '/api/llm/quotes';
  await call('GET', undefined, {
    path: textQuotesPath,
    user: null,
    status: 401,
  });
  await call(
    'POST',
    {},
    { path: textQuotesPath, origin: 'https://attacker.example', status: 403 },
  );
  await call('GET', undefined, {
    path: textQuotesPath,
    user: bob,
    status: 403,
  });
  const textParent = {
    id: randomUUID(),
    title: 'Synthetic direct-text accounting test',
    templateId: 'article',
  };
  await call('POST', textParent, { user: alice, status: 201 });
  const textQuoteInput = {
    requestId: randomUUID(),
    parentJobId: textParent.id,
    parentBudgetLimitMinor: 3,
    model: 'fixture-model',
    prompt: 'fixture prompt',
    maxOutputTokens: 100,
    maximumBudgetMinor: 3,
    currency: 'USD',
    saveResult: false,
  };
  await call(
    'POST',
    { ...textQuoteInput, maximumBudgetMinor: undefined },
    {
      path: textQuotesPath,
      status: 400,
    },
  );
  const preparedText = await call('POST', textQuoteInput, {
    path: textQuotesPath,
    status: 201,
  });
  check(preparedText.execution.state, 'quoted');
  check(preparedText.execution.quote.ceiling.maximumChargeMinor, 2);
  check(preparedText.execution.rateCard.modelId, 'fixture-model');
  check(
    preparedText.execution.rateCard.unit,
    'millionths_of_currency_minor_unit_per_million_tokens',
  );
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
  await call(
    'POST',
    {
      id: deviceTextQuoteInput.parentJobId,
      title: 'Synthetic device direct-text accounting test',
      templateId: 'article',
    },
    { user: null, headers: deviceHomeHeaders, status: 201 },
  );
  const devicePreparedText = await call('POST', deviceTextQuoteInput, {
    path: textQuotesPath,
    user: null,
    headers: deviceHomeHeaders,
    status: 201,
  });
  check(devicePreparedText.execution.state, 'quoted');
  check(devicePreparedText.executionAvailable, false);
  const deviceHomeWithQuote = await call('GET', undefined, {
    path: deviceHomePath,
    user: null,
    headers: deviceHomeHeaders,
  });
  check(deviceHomeWithQuote.recentLlm[0].id, devicePreparedText.execution.id);
  check(deviceHomeWithQuote.recentLlm[0].state, 'quoted');
  check(deviceHomeWithQuote.recentLlm[0].queueState, 'awaiting_approval');
  check(deviceHomeWithQuote.recentLlm[0].spending.status, 'not_running');
  check(
    deviceHomeWithQuote.recentLlm[0].spending.providerMeter,
    'not_reported',
  );
  check(deviceHomeWithQuote.recentLlm[0].spending.invoiceVerified, false);
  check(deviceHomeWithQuote.recentLlm[0].result, null);
  check(
    deviceHomeWithQuote.recentLlm[0].rateCard.unit,
    'millionths_of_currency_minor_unit_per_million_tokens',
  );
  check(deviceHomeWithQuote.execution.cloudLlmAvailable, false);
  check(deviceHomeWithQuote.execution.invoiceVerified, false);
  check(deviceHomeWithQuote.execution.fundedWallet, false);
  check(JSON.stringify(deviceHomeWithQuote).includes('fixture prompt'), false);
  const sameText = await call('POST', textQuoteInput, { path: textQuotesPath });
  check(sameText.inserted, false);
  check(sameText.execution.id, preparedText.execution.id);
  await call(
    'POST',
    { ...textQuoteInput, prompt: 'Changed synthetic input' },
    {
      path: textQuotesPath,
      status: 409,
    },
  );
  const textItemPath = `${textQuotesPath}/${preparedText.execution.id}`;
  await call('GET', undefined, { path: textItemPath, user: bob, status: 403 });
  check(
    (await call('GET', undefined, { path: textItemPath })).execution.state,
    'quoted',
  );
  await call(
    'POST',
    {
      action: 'approve',
      approvalDigest: preparedText.execution.approvalDigest,
      consent: false,
    },
    {
      path: textItemPath,
      status: 400,
    },
  );
  await call(
    'POST',
    { action: 'approve', approvalDigest: '0'.repeat(64), consent: true },
    {
      path: textItemPath,
      status: 409,
    },
  );
  const textApproval = {
    action: 'approve',
    approvalDigest: preparedText.execution.approvalDigest,
    consent: true,
  };
  const reservedText = await call('POST', textApproval, { path: textItemPath });
  check(reservedText.execution.state, 'reserved');
  check(reservedText.providerSubmission, 'not_performed');
  check(
    (await call('POST', textApproval, { path: textItemPath })).execution.state,
    'reserved',
  );
  const textPool = () =>
    database
      .prepare(`SELECT reserved_minor AS reservedMinor, settled_minor AS settledMinor
    FROM agent_delegation_budget_pools WHERE owner_user_id = ? AND parent_job_id = ?`)
      .bind(alice, textParent.id)
      .first();
  check((await textPool()).reservedMinor, 2);
  const textCancelled = await call(
    'POST',
    { ...textApproval, action: 'cancel' },
    { path: textItemPath },
  );
  check(textCancelled.execution.state, 'cancelled');
  check((await textPool()).reservedMinor, 0);
  check((await textPool()).settledMinor, 0);
  check(
    (await call('GET', undefined, { path: textItemPath })).execution.state,
    'cancelled',
  );
  await call('POST', textApproval, { path: textItemPath, status: 409 });
  check(
    (
      await database
        .prepare(
          'SELECT COUNT(*) AS count FROM remote_ai_text_executions WHERE owner_user_id = ? AND request_id = ?',
        )
        .bind(alice, textQuoteInput.requestId)
        .first()
    ).count,
    1,
  );
  check(
    (await call('GET', undefined, { path: textQuotesPath })).executions.some(
      (row) => row.id === preparedText.execution.id,
    ),
    true,
  );
  const parentTextHistory = await call('GET', undefined, {
    path: `${textQuotesPath}?parentJobId=${textParent.id}`,
  });
  check(parentTextHistory.executions.length, 1);
  check(parentTextHistory.executions[0].id, preparedText.execution.id);
  check(
    (
      await call('GET', undefined, {
        path: `${textQuotesPath}?parentJobId=${randomUUID()}`,
      })
    ).executions.length,
    0,
  );
  await call('GET', undefined, {
    path: `${textQuotesPath}?parentJobId=%2Fother`,
    status: 400,
  });
  // Actual D1 binding + shared coordinator, with a synthetic provider fetch.
  // The public pricing gate stays closed; this is not production provider acceptance.
  const verifiedTextRate = await verifyRemoteAiRateCard(
    textRateCard,
    { providerId: 'openai', modelId: 'fixture-model', currency: 'USD' },
    async () => remoteAiRatePublicKey,
  );
  assert.ok(verifiedTextRate);
  const completedTextInput = {
    ...textQuoteInput,
    requestId: randomUUID(),
    saveResult: true,
  };
  const completingText = (
    await call('POST', completedTextInput, {
      path: textQuotesPath,
      status: 201,
    })
  ).execution;
  await call(
    'POST',
    {
      action: 'approve',
      consent: true,
      approvalDigest: completingText.approvalDigest,
    },
    {
      path: `${textQuotesPath}/${completingText.id}`,
    },
  );
  const directStore = new RemoteAiTextStore(database);
  let directProviderSubmissions = 0;
  const directOptions = {
    store: directStore,
    ownerId: alice,
    id: completingText.id,
    approvalDigest: completingText.approvalDigest,
    intent: {
      ownerId: alice,
      requestId: completedTextInput.requestId,
      model: 'fixture-model',
      prompt: completedTextInput.prompt,
      maxOutputTokens: completedTextInput.maxOutputTokens,
      maximumBudgetMinor: 3,
    },
    verified: verifiedTextRate,
    runtimeEnv: { OPENAI_API_KEY: 'synthetic-provider-key-only' },
    fetchImpl: async (url, init) => {
      directProviderSubmissions++;
      check(url, 'https://api.openai.com/v1/responses');
      check(JSON.parse(init.body).store, false);
      check(JSON.parse(init.body).service_tier, 'default');
      check(init.headers['X-Client-Request-Id'], completingText.id);
      return Response.json({
        id: 'resp_synthetic_d1',
        model: 'fixture-model',
        service_tier: 'default',
        status: 'completed',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
          input_tokens_details: { cached_tokens: 4, cache_write_tokens: 3 },
        },
        output: [
          {
            type: 'message',
            content: [
              { type: 'output_text', text: 'Synthetic quoted provider result' },
            ],
          },
        ],
      });
    },
  };
  const directInputKey = 'ab'.repeat(32);
  const persistSyntheticRemoteAiInput = async (execution, intent) => {
    const encrypted = await encryptRemoteAiTextInput(
      intent,
      directInputKey,
      alice,
      execution.id,
    );
    const saved = await directStore.saveInput(
      alice,
      execution.id,
      execution.approvalDigest,
      encrypted,
    );
    check(saved.inserted, true);
  };
  await persistSyntheticRemoteAiInput(completingText, directOptions.intent);
  check(
    (await executeReservedRemoteAiText(directOptions)).record.state,
    'completed',
  );
  check(
    (await executeReservedRemoteAiText(directOptions)).providerSubmission,
    'not_repeated',
  );
  check(directProviderSubmissions, 1);
  const completedReadback = (
    await call('GET', undefined, {
      path: `${textQuotesPath}/${completingText.id}`,
    })
  ).execution;
  check(completedReadback.resultText, 'Synthetic quoted provider result');
  check(completedReadback.price.items.length, 4);
  check(completedReadback.invoiceVerified, false);
  check((await textPool()).reservedMinor, 0);
  check((await textPool()).settledMinor, 1);
  const downloadTextPath = `${textQuotesPath}/${completingText.id}?download=1`;
  const downloadedText = await fetch(`${base}${downloadTextPath}`, {
    headers: { 'oai-authenticated-user-id': alice },
    signal: AbortSignal.timeout(10000),
  });
  check(downloadedText.status, 200);
  check(
    downloadedText.headers.get('content-type'),
    'text/markdown; charset=utf-8',
  );
  check(downloadedText.headers.get('cache-control'), 'private, no-store');
  check(downloadedText.headers.get('x-content-type-options'), 'nosniff');
  check(
    downloadedText.headers.get('content-disposition'),
    `attachment; filename="sky-ai-${completingText.id}.md"`,
  );
  check(await downloadedText.text(), completedReadback.resultText);
  await call('GET', undefined, {
    path: downloadTextPath,
    user: null,
    status: 401,
  });
  await call('GET', undefined, {
    path: downloadTextPath,
    user: bob,
    status: 403,
  });
  await call('GET', undefined, {
    path: `${textItemPath}?download=1`,
    status: 404,
  });
  const deletedText = await call('DELETE', undefined, {
    path: `${textQuotesPath}/${completingText.id}`,
  });
  check(deletedText.resultDeleted, true);
  check(deletedText.execution.price.chargeMinor, 1);
  await call('GET', undefined, { path: downloadTextPath, status: 404 });
  check(
    (
      await call('GET', undefined, {
        path: `${textQuotesPath}/${completingText.id}`,
      })
    ).execution.state,
    'completed',
  );
  check(directProviderSubmissions, 1);
  check((await textPool()).settledMinor, 1);
  const timeoutInput = { ...textQuoteInput, requestId: randomUUID() };
  const timeoutText = (
    await call('POST', timeoutInput, { path: textQuotesPath, status: 201 })
  ).execution;
  await call(
    'POST',
    {
      action: 'approve',
      consent: true,
      approvalDigest: timeoutText.approvalDigest,
    },
    {
      path: `${textQuotesPath}/${timeoutText.id}`,
    },
  );
  let directTimeoutSubmissions = 0;
  const timeoutOptions = {
    ...directOptions,
    id: timeoutText.id,
    approvalDigest: timeoutText.approvalDigest,
    intent: { ...directOptions.intent, requestId: timeoutInput.requestId },
    fetchImpl: async () => {
      directTimeoutSubmissions++;
      throw new DOMException('Synthetic timeout', 'AbortError');
    },
  };
  await persistSyntheticRemoteAiInput(timeoutText, timeoutOptions.intent);
  await assert.rejects(
    executeReservedRemoteAiText(timeoutOptions),
    (error) => error.code === 'UPSTREAM_TIMEOUT',
  );
  check(
    (await executeReservedRemoteAiText(timeoutOptions)).providerSubmission,
    'not_repeated',
  );
  check(directTimeoutSubmissions, 1);
  const timeoutReadback = (
    await call('GET', undefined, {
      path: `${textQuotesPath}/${timeoutText.id}`,
    })
  ).execution;
  check(timeoutReadback.state, 'unreconciled');
  check(timeoutReadback.errorCode, 'UPSTREAM_TIMEOUT');
  check((await textPool()).reservedMinor, 2);
  check((await textPool()).settledMinor, 1);
  await call(
    'POST',
    {
      action: 'cancel',
      consent: true,
      approvalDigest: timeoutText.approvalDigest,
    },
    {
      path: `${textQuotesPath}/${timeoutText.id}`,
      status: 409,
    },
  );
  const overBudgetText = (
    await call(
      'POST',
      { ...textQuoteInput, requestId: randomUUID() },
      {
        path: textQuotesPath,
        status: 201,
      },
    )
  ).execution;
  await call(
    'POST',
    {
      action: 'approve',
      consent: true,
      approvalDigest: overBudgetText.approvalDigest,
    },
    {
      path: `${textQuotesPath}/${overBudgetText.id}`,
      status: 409,
    },
  );
  check((await textPool()).reservedMinor + (await textPool()).settledMinor, 3);
  await call(
    'PATCH',
    { action: 'revoke', providerId: 'openai', cardId: textRateCard.cardId },
    {
      path: rateCardAdminPath,
      user: null,
      headers: { Authorization: `Bearer ${remoteAiRateIngestToken}` },
    },
  );
  check(
    (
      await call('POST', estimateBody, {
        path: '/api/llm/estimate',
        user: alice,
        status: 503,
      })
    ).code,
    'REMOTE_AI_RATE_CARD_UNAVAILABLE',
  );
  remoteLlmEnabled = true;
  await stop();
  await start();
  for (const path of [
    '/api/legal-guidance',
    '/api/patent-research',
    '/api/jev-evaluation',
  ]) {
    const deniedSkyTool = await call(
      'POST',
      {},
      { path, user: bob, status: 403 },
    );
    check(deniedSkyTool.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  }
  const pricedLlm = await call(
    'POST',
    {
      provider: 'openai',
      prompt: 'fixture prompt',
      consent: true,
    },
    { path: '/api/llm/text', user: alice, status: 503 },
  );
  check(pricedLlm.code, 'REMOTE_AI_PRICING_GATE_UNAVAILABLE');
  remoteModelEndpoint = 'https://models.example.test';
  await stop();
  await start();
  const remoteOllama = await call(
    'POST',
    {
      provider: 'ollama',
      model: 'fixture:latest',
      prompt: 'fixture prompt',
      consent: true,
    },
    { path: '/api/llm/text', user: alice, status: 503 },
  );
  check(remoteOllama.code, 'REMOTE_AI_PRICING_GATE_UNAVAILABLE');
  for (const provider of ['local-model', 'openai-compatible']) {
    const remoteLocalLabel = await call(
      'POST',
      {
        provider,
        model: 'fixture:latest',
        prompt: 'fixture prompt',
        consent: true,
      },
      { path: '/api/llm/text', user: alice, status: 503 },
    );
    check(remoteLocalLabel.code, 'REMOTE_AI_PRICING_GATE_UNAVAILABLE');
  }
  remoteModelEndpoint = 'http://127.0.0.1:11434';
  await stop();
  await start();
  for (const path of [
    '/api/legal-guidance',
    '/api/patent-research',
    '/api/jev-evaluation',
  ]) {
    const deniedPaidTool = await call(
      'POST',
      {},
      { path, user: alice, status: 503 },
    );
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
  refundEvent.signature = sign(
    null,
    rockstarEntitlementEventSigningBytes(refundEvent),
    serviceEntitlementIssuerKeyPair.privateKey,
  ).toString('base64url');
  const refundPath = '/api/rockstar/entitlements/events';
  check(
    (
      await call(
        'POST',
        { event: refundEvent },
        { path: refundPath, user: null },
      )
    ).status,
    'refunded',
  );
  const duplicateRefund = await call(
    'POST',
    { event: refundEvent },
    { path: refundPath, user: null },
  );
  check(duplicateRefund.alreadyApplied, true);
  const conflictingRefund = { ...refundEvent, eventType: 'revoked' };
  conflictingRefund.signature = sign(
    null,
    rockstarEntitlementEventSigningBytes(conflictingRefund),
    serviceEntitlementIssuerKeyPair.privateKey,
  ).toString('base64url');
  await call(
    'POST',
    { event: conflictingRefund },
    { path: refundPath, user: null, status: 409 },
  );
  const refundedEntitlements = await call('GET', undefined, {
    path: entitlementPath,
  });
  check(refundedEntitlements.entitlements[0].status, 'refunded');
  const pendingPurchaseHash = createHash('sha256')
    .update('synthetic-pending-purchase-line')
    .digest('hex');
  const pendingPackage = await issueRockstarEntitlementClaim(
    {
      issuerId: 'api-check-retailer',
      issuerKeyId: 'api-check-retailer-key-1',
      offerId: 'rockstar-sim-standard-v1',
      purchaseReferenceSha256: pendingPurchaseHash,
      formFactor: 'esim',
      scopes: ['rockstaros_access', 'sky', 'zema', 'agents'],
    },
    serviceEntitlementIssuerSigningKey,
  );
  const preRedemptionCancellation = await issueRockstarEntitlementEvent(
    {
      issuerId: pendingPackage.claim.issuerId,
      issuerKeyId: pendingPackage.claim.issuerKeyId,
      claimId: pendingPackage.claim.claimId,
      purchaseReferenceSha256: pendingPackage.claim.purchaseReferenceSha256,
      eventType: 'revoked',
    },
    serviceEntitlementIssuerSigningKey,
  );
  const pendingCancellationResult = await call(
    'POST',
    { event: preRedemptionCancellation },
    {
      path: refundPath,
      user: null,
    },
  );
  check(pendingCancellationResult.status, 'revoked');
  check(pendingCancellationResult.alreadyApplied, false);
  const deniedCancelledCode = await call('POST', pendingPackage, {
    path: entitlementPath,
    status: 409,
  });
  check(
    deniedCancelledCode.error,
    'この購入claimは販売元で取消済みです。新しい案内をご確認ください。',
  );
  const replacementPackage = await issueRockstarEntitlementClaim(
    {
      issuerId: pendingPackage.claim.issuerId,
      issuerKeyId: pendingPackage.claim.issuerKeyId,
      offerId: pendingPackage.claim.offerId,
      purchaseReferenceSha256: pendingPurchaseHash,
      formFactor: pendingPackage.claim.formFactor,
      scopes: ['rockstaros_access'],
    },
    serviceEntitlementIssuerSigningKey,
  );
  const replacementRedemption = await call('POST', replacementPackage, {
    path: entitlementPath,
    status: 201,
  });
  check(
    replacementRedemption.entitlement.claimId,
    replacementPackage.claim.claimId,
  );
  check(replacementRedemption.entitlement.ownerUserId, alice);
  await call('POST', {}, { path: a2aDelegationPath, user: alice, status: 403 });
  serviceEntitlementEnforcementEnabled = false;
  await stop();
  await start();
  const esimOrderId = randomUUID();
  await database
    .prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      esimOrderId,
      alice,
      'api-check-seller',
      'live',
      'api-check-esim',
      esimPackageHash,
      'API eSIM plan',
      1500,
      0,
      0,
      'jpy',
      'acct_api_check',
      1,
      'https://example.invalid/terms',
      'fixture only',
      'paid',
      null,
      Date.now(),
      Date.now(),
    )
    .run();
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
  const disabledEsimIssue = await call(
    'POST',
    {},
    {
      path: `/api/esim/orders/${esimOrderId}/issue`,
      status: 503,
    },
  );
  check(disabledEsimIssue.error, 'esim_issuance_disabled');
  const esimStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(esimStatus.state, 'paid_waiting_for_esim_issuance');
  const cloudAccessPath = `/api/esim/orders/${esimOrderId}/cloud-access`;
  check(
    (await call('GET', undefined, { path: cloudAccessPath })).available,
    false,
  );
  await call(
    'POST',
    { action: 'issue' },
    { path: cloudAccessPath, status: 409 },
  );
  await call('GET', undefined, {
    path: cloudAccessPath,
    user: bob,
    status: 404,
  });
  await call('GET', undefined, {
    path: cloudAccessPath,
    user: null,
    status: 401,
  });
  await call(
    'POST',
    { action: 'issue' },
    { path: cloudAccessPath, origin: 'https://elsewhere.invalid', status: 403 },
  );
  await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
    user: bob,
    status: 404,
  });
  const ordinaryPaidOrderId = randomUUID();
  await database
    .prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      ordinaryPaidOrderId,
      alice,
      'api-check-seller',
      'live',
      'api-check-tool',
      'f'.repeat(64),
      'API ordinary paid tool',
      1500,
      0,
      0,
      'jpy',
      'acct_api_check',
      1,
      'https://example.invalid/terms',
      'fixture only',
      'paid',
      null,
      Date.now(),
      Date.now(),
    )
    .run();
  const ordinaryOrderStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${ordinaryPaidOrderId}/status`,
  });
  check(ordinaryOrderStatus.state, 'not_esim_order');
  const installMaterialPath = `/api/esim/orders/${esimOrderId}/install-material`;
  await call(
    'POST',
    { action: 'fetch', deliveryRequestId: randomUUID() },
    {
      path: installMaterialPath,
      user: null,
      status: 401,
    },
  );
  const notReadyInstallMaterial = await call(
    'POST',
    {
      action: 'fetch',
      deliveryRequestId: randomUUID(),
    },
    { path: installMaterialPath, status: 409 },
  );
  check(notReadyInstallMaterial.error, 'install_material_not_ready');
  const installDeliveryId = randomUUID();
  const quickInstallProfile = {
    iccid: '89445385320081602228',
    matchingId: 'api-check-matching-secret',
    smdpAddress: 'rsp.api-check.example',
    appleInstallUrl:
      'https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example.test%24APPLE-CODE',
    androidInstallUrl:
      'https://esimsetup.android.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example.test%24ANDROID-CODE',
  };
  const encryptedInstallMaterial = await encryptEsimInstallMaterial(
    quickInstallProfile,
    'f'.repeat(64),
    alice,
    esimOrderId,
  );
  const apiInstallCatalog = parseEsimServerPlanCatalog(
    JSON.stringify({
      version: 'api-check-install-v1',
      plans: [
        {
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
          starterAgentPack: {
            id: 'lifeline',
            version: '1.0.0',
            packages: [
              {
                packageKey: esimStarterPackageKey,
                manifestSha256: esimStarterPackageHash,
              },
            ],
          },
        },
      ],
    }),
  );
  const apiInstallPricing = await createEsimPricingSnapshot(
    apiInstallCatalog,
    apiInstallCatalog.plans[0],
  );
  await database
    .prepare(`INSERT INTO esim_provider_orders
    (sky_order_id,provider,owner_user_id,package_key,manifest_sha256,pricing_snapshot_json,
     pricing_snapshot_sha256,provider_bundle_name,quote_digest,quote_total,quote_currency,state,
     provider_order_reference,profile_digest,install_material_ciphertext,install_material_nonce,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      esimOrderId,
      'esim-go-v3',
      alice,
      'api-check-esim',
      esimPackageHash,
      apiInstallPricing.canonicalJson,
      apiInstallPricing.sha256,
      'fixture_jp_1gb',
      'b'.repeat(64),
      '9.00',
      'USD',
      'profile_bound',
      'api-check-provider-ref',
      'c'.repeat(64),
      encryptedInstallMaterial.ciphertext,
      encryptedInstallMaterial.nonce,
      Date.now(),
      Date.now(),
    )
    .run();
  await database
    .prepare(`INSERT INTO esim_provider_profile_bindings
    (profile_digest,provider,owner_user_id,sky_order_id,package_key,manifest_sha256,created_at)
    VALUES (?,?,?,?,?,?,?)`)
    .bind(
      'c'.repeat(64),
      'esim-go-v3',
      alice,
      esimOrderId,
      'api-check-esim',
      esimPackageHash,
      Date.now(),
    )
    .run();
  const readyEsimStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(readyEsimStatus.state, 'profile_bound_install_material_ready');
  check(readyEsimStatus.providerProfileBoundToOrder, true);
  check(readyEsimStatus.deviceInstallState, 'unverified');
  check(readyEsimStatus.esimDeviceEntitlementState, 'not_connected');
  check(readyEsimStatus.starterAgentPack, {
    id: 'lifeline',
    version: '1.0.0',
    packageCount: 1,
    packages: [
      {
        packageKey: esimStarterPackageKey,
        name: null,
        summary: null,
        reviewState: 'unavailable',
      },
    ],
  });
  const reviewedAt = Date.now();
  await database
    .prepare(`INSERT INTO sky_tool_packages
    (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
    VALUES (?,?,?,?,?,?,'verified',?,?,?)`)
    .bind(
      esimStarterPackageKey,
      esimStarterPackage.id,
      esimStarterPackage.version,
      alice,
      JSON.stringify(esimStarterPackage),
      esimStarterPackageHash,
      reviewedAt,
      reviewedAt,
      reviewedAt,
    )
    .run();
  await database
    .prepare(`INSERT INTO sky_tool_package_reviews
    (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES (?,?,?,?,'verified','{}','{}','synthetic API fixture review',?,NULL)`)
    .bind(
      randomUUID(),
      esimStarterPackageKey,
      esimStarterPackageHash,
      'fixture-reviewer',
      reviewedAt,
    )
    .run();
  const packageBindingNow = Date.now();
  const packageBinding = {
    schema: SKY_PACKAGE_RUNTIME_BINDING_SCHEMA,
    providerId: 'api-check-agent-host',
    keyId: 'api-check-package-binding-key',
    bindingId: 'api-check-offline-guide-binding',
    agentOrigin: skyPackageBindingAgentOrigin,
    agentName: 'Fixture Agent',
    agentVersion: '1.0.0',
    agentCardSha256: 'a'.repeat(64),
    packageKey: esimStarterPackageKey,
    manifestSha256: esimStarterPackageHash,
    operationId: 'offline-guide.run',
    runtime: 'a2a-jsonrpc-1.0',
    runtimeExtensionUri: skyPackageRuntimeExtensionUri,
    inputSchemaSha256: await skyPackageSchemaSha256(
      esimStarterPackage.io.inputSchema,
    ),
    outputSchemaSha256: await skyPackageSchemaSha256(
      esimStarterPackage.io.outputSchema,
    ),
    pricingVersion: 'fixture-pricing-v1',
    requiredUsage: [{ meter: 'agent_tokens', unit: 'token' }],
    issuedAt: packageBindingNow,
    expiresAt: packageBindingNow + 60_000,
    signature: '',
  };
  packageBinding.signature = sign(
    null,
    skyPackageRuntimeBindingSigningBytes(packageBinding),
    skyPackageBindingKeyPair.privateKey,
  ).toString('base64url');
  const packageBindingPath = '/api/internal/sky-package-runtime-bindings';
  const mismatchedSchemaBinding = {
    ...packageBinding,
    bindingId: 'api-check-wrong-schema-binding',
    inputSchemaSha256: 'f'.repeat(64),
    signature: '',
  };
  mismatchedSchemaBinding.signature = sign(
    null,
    skyPackageRuntimeBindingSigningBytes(mismatchedSchemaBinding),
    skyPackageBindingKeyPair.privateKey,
  ).toString('base64url');
  await call(
    'POST',
    { binding: mismatchedSchemaBinding },
    {
      path: packageBindingPath,
      user: null,
      status: 409,
      headers: { Authorization: `Bearer ${skyPackageBindingOperatorToken}` },
    },
  );
  await call(
    'POST',
    { binding: packageBinding },
    {
      path: packageBindingPath,
      user: null,
      status: 401,
    },
  );
  await call(
    'POST',
    { binding: packageBinding },
    {
      path: packageBindingPath,
      user: null,
      status: 401,
      headers: {
        Authorization:
          'Bearer incorrect-token-which-is-long-enough-to-parse-123456',
      },
    },
  );
  const registeredPackageBinding = await call(
    'POST',
    { binding: packageBinding },
    {
      path: packageBindingPath,
      user: null,
      headers: { Authorization: `Bearer ${skyPackageBindingOperatorToken}` },
      status: 201,
    },
  );
  check(registeredPackageBinding.inserted, true);
  check(
    (
      await new SkyPackageRuntimeBindingStore(database).findActive(
        skyPackageBindingAgentOrigin,
        esimStarterPackageKey,
        esimStarterPackageHash,
      )
    ).length,
    1,
  );
  const duplicatePackageBinding = await call(
    'POST',
    { binding: packageBinding },
    {
      path: packageBindingPath,
      user: null,
      headers: { Authorization: `Bearer ${skyPackageBindingOperatorToken}` },
    },
  );
  check(duplicatePackageBinding.inserted, false);
  const tamperedPackageBinding = {
    ...packageBinding,
    operationId: 'other.operation',
  };
  await call(
    'POST',
    { binding: tamperedPackageBinding },
    {
      path: packageBindingPath,
      user: null,
      status: 400,
      headers: { Authorization: `Bearer ${skyPackageBindingOperatorToken}` },
    },
  );
  const revokedPackageBinding = await call(
    'PATCH',
    {
      action: 'revoke',
      bindingId: packageBinding.bindingId,
    },
    {
      path: packageBindingPath,
      user: null,
      headers: { Authorization: `Bearer ${skyPackageBindingOperatorToken}` },
    },
  );
  check(revokedPackageBinding.revoked, true);
  check(revokedPackageBinding.alreadyRevoked, false);
  check(
    (
      await new SkyPackageRuntimeBindingStore(database).findActive(
        skyPackageBindingAgentOrigin,
        esimStarterPackageKey,
        esimStarterPackageHash,
      )
    ).length,
    0,
  );
  await call(
    'POST',
    { binding: packageBinding },
    {
      path: packageBindingPath,
      user: null,
      status: 409,
      headers: { Authorization: `Bearer ${skyPackageBindingOperatorToken}` },
    },
  );
  const activePackStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(activePackStatus.starterAgentPack.packages, [
    {
      packageKey: esimStarterPackageKey,
      name: 'Offline Guide',
      summary: 'Provides a short offline help guide.',
      reviewState: 'active',
    },
  ]);
  const activeEntitlements = await call('GET', undefined, {
    path: entitlementPath,
  });
  check(activeEntitlements.entitlements[0].serviceProfile, {
    state: 'ready',
    profileId: 'lifeline',
    version: '1.0.0',
    label: 'Lifeline',
    activation: 'owner_choice_required',
    packageCount: 1,
    packages: [
      {
        packageKey: esimStarterPackageKey,
        name: 'Offline Guide',
        state: 'ready',
      },
    ],
  });
  const activeDeviceHome = await call('GET', undefined, {
    path: '/api/rockstar/device-home',
    user: null,
    headers: { Authorization: `Bearer ${deviceGrant.accessToken}` },
  });
  check(activeDeviceHome.entitlements[0].serviceProfile.profileId, 'lifeline');
  check(
    activeDeviceHome.entitlements[0].serviceProfile.activation,
    'owner_choice_required',
  );
  const installProofPath = `/api/esim/orders/${esimOrderId}/install-proof`;
  await call(
    'POST',
    { action: 'challenge', deviceRef: 'api-check-device' },
    {
      path: installProofPath,
      user: bob,
      status: 404,
    },
  );
  const installChallenge = await call(
    'POST',
    {
      action: 'challenge',
      deviceRef: 'api-check-device',
    },
    { path: installProofPath },
  );
  check(installChallenge.state, 'challenge_issued');
  const validInstallReceipt = signedInstallReceipt({
    ownerUserId: alice,
    orderId: esimOrderId,
    profileDigest: 'c'.repeat(64),
    challenge: installChallenge,
    deviceRef: 'api-check-device',
  });
  await call(
    'POST',
    {
      action: 'submit',
      challengeId: installChallenge.challengeId,
      challengeNonce: installChallenge.challengeNonce,
      receipt: { ...validInstallReceipt, deviceRef: 'api-check-other-device' },
    },
    { path: installProofPath, status: 422 },
  );
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
  check(
    installSubmissionResults
      .map((result) => result.state)
      .sort((left, right) => left.localeCompare(right)),
    ['already_verified', 'verified'],
  );
  const proofInstalledStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(proofInstalledStatus.deviceInstallState, 'verified_installed_enabled');
  check(proofInstalledStatus.esimDeviceEntitlementState, 'not_connected');
  check(
    proofInstalledStatus.starterPackActivationState,
    'awaiting_authenticated_device_gateway',
  );
  const deviceEntitlementPath = `/api/esim/orders/${esimOrderId}/device-entitlement`;
  await call(
    'POST',
    { action: 'challenge' },
    {
      path: deviceEntitlementPath,
      user: bob,
      status: 404,
    },
  );
  const deviceEntitlementChallenge = await call(
    'POST',
    { action: 'challenge' },
    {
      path: deviceEntitlementPath,
    },
  );
  check(deviceEntitlementChallenge.state, 'challenge_issued');
  check(deviceEntitlementChallenge.deviceRef, 'api-check-device');
  check(deviceEntitlementChallenge.receiptContext, {
    ownerUserId: alice,
    orderId: esimOrderId,
    profileDigest: 'c'.repeat(64),
    deviceRef: 'api-check-device',
    installReceiptSha256: createHash('sha256')
      .update(esimInstallReceiptSigningBytes(validInstallReceipt))
      .digest('hex'),
    starterPackId: 'lifeline',
    starterPackVersion: '1.0.0',
    attestedGatewayAuthorityId: 'android-key-attestation-google',
    attestedGatewayKeyId: 'sha256-of-uncompressed-p256-public-key',
    attestedApplicationPackage: 'dev.rock.automation',
  });
  const installReceiptSha256 = createHash('sha256')
    .update(esimInstallReceiptSigningBytes(validInstallReceipt))
    .digest('hex');
  const starterPackManifestSha256 = createHash('sha256')
    .update(JSON.stringify(apiInstallPricing.plan.starterAgentPack))
    .digest('hex');
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
  await call(
    'POST',
    {
      action: 'submit',
      challengeId: deviceEntitlementChallenge.challengeId,
      challengeNonce: deviceEntitlementChallenge.challengeNonce,
      receipt: {
        ...signedDeviceEntitlement,
        starterPackManifestSha256: 'd'.repeat(64),
      },
    },
    { path: deviceEntitlementPath, status: 422 },
  );
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
  check(
    deviceEntitlementResults
      .map((result) => result.state)
      .sort((left, right) => left.localeCompare(right)),
    ['activated', 'already_active'],
  );
  const activeEntitlementStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(activeEntitlementStatus.esimDeviceEntitlementState, 'active');
  check(
    activeEntitlementStatus.starterPackActivationState,
    'active_on_authenticated_device',
  );
  check(typeof activeEntitlementStatus.starterPackActivatedAt, 'number');

  // Worker+D1 fixture only: no carrier request or billable cloud execution.
  let cloudCookie;
  const captureCloudCookie = (response) => {
    const cookie = response.headers.get('set-cookie');
    check(cookie.includes('HttpOnly; SameSite=Strict'), true);
    check(cookie.includes('Path=/api'), true);
    cloudCookie = cookie.split(';')[0];
  };
  const cloudIssued = await call(
    'POST',
    { action: 'issue' },
    {
      path: cloudAccessPath,
      status: 201,
      inspectResponse: captureCloudCookie,
    },
  );
  check(cloudIssued.state, 'active');
  const cloudEntitlements = await call('GET', undefined, {
    path: '/api/rockstar/entitlements',
    user: null,
    headers: { Cookie: cloudCookie },
  });
  check(
    cloudEntitlements.esimAccess[0].starterAgentPack.packages[0].packageKey,
    esimStarterPackageKey,
  );
  check(JSON.stringify(cloudIssued).includes('rock_esim_'), false);
  const originalCloudCookie = cloudCookie;
  const cloudToken = () => cloudCookie.slice(cloudCookie.indexOf('=') + 1);
  const cloudHome = await call('GET', undefined, {
    path: '/api/rockstar/device-home',
    user: null,
    headers: { Cookie: cloudCookie },
  });
  check(cloudHome.access, {
    rockstaros: true,
    sky: true,
    zema: true,
    agents: true,
  });
  // Native adapter fixture: the existing eSIM gateway key signs, without sending a bearer secret.
  const signCloudRequest = async (
    path,
    options = {},
    accessKeyId = cloudIssued.key.id,
    pair = esimDeviceGatewayKeyPair,
  ) =>
    signEsimCloudRequest(
      new Request(`${base}${path}`, options),
      accessKeyId,
      'ES256',
      async (bytes) =>
        new Uint8Array(
          sign('sha256', bytes, {
            key: pair.privateKey,
            dsaEncoding: 'ieee-p1363',
          }),
        ),
    );
  const signedHome = await signCloudRequest('/api/rockstar/device-home');
  const signedHomeHeader = signedHome.headers.get('authorization');
  const proofHome = await fetch(signedHome);
  check(proofHome.status, 200);
  check((await proofHome.json()).access, {
    rockstaros: true,
    sky: true,
    zema: true,
    agents: true,
  });
  await call('GET', undefined, {
    path: '/api/rockstar/device-home',
    user: null,
    headers: { Authorization: signedHomeHeader },
    status: 401,
  });
  const concurrentProof = (
    await signCloudRequest('/api/rockstar/device-home')
  ).headers.get('authorization');
  const proofRaces = await Promise.all(
    [0, 1].map(() =>
      fetch(`${base}/api/rockstar/device-home`, {
        headers: { Authorization: concurrentProof },
      }),
    ),
  );
  check(
    proofRaces.map((response) => response.status).sort((a, b) => a - b),
    [200, 401],
  );
  await Promise.all(proofRaces.map((response) => response.arrayBuffer()));
  const privateInput = JSON.stringify({
    id: randomUUID(),
    title: 'eSIM signed cloud job',
    templateId: 'article',
  });
  const signedJob = await signCloudRequest('/api/work-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: privateInput,
  });
  const signedJobResponse = await fetch(signedJob);
  check(signedJobResponse.status, 201);
  await signedJobResponse.arrayBuffer();
  const modifiedBody = await signCloudRequest('/api/work-jobs', {
    method: 'POST',
    body: privateInput,
  });
  await call(
    'POST',
    { title: 'different input' },
    {
      path: '/api/work-jobs',
      user: null,
      headers: { Authorization: modifiedBody.headers.get('authorization') },
      status: 401,
    },
  );
  const differentPath = await signCloudRequest('/api/rockstar/device-home');
  await call('GET', undefined, {
    path: '/api/rockstar/entitlements',
    user: null,
    headers: { Authorization: differentPath.headers.get('authorization') },
    status: 401,
  });
  const wrongSigner = await signCloudRequest(
    '/api/rockstar/device-home',
    {},
    cloudIssued.key.id,
    rotatedEsimDeviceGatewayKeyPair,
  );
  check((await fetch(wrongSigner)).status, 401);
  const adminProof = await signCloudRequest(cloudAccessPath);
  check((await fetch(adminProof)).status, 401);
  const proofRows = await database
    .prepare('SELECT * FROM esim_cloud_proof_uses')
    .all();
  check(proofRows.results.length >= 3, true);
  check(
    proofRows.results.every(
      (row) =>
        Object.keys(row).sort().join(',') ===
        'access_key_id,expires_at,request_id',
    ),
    true,
  );
  const pendingRotationProof = await signCloudRequest(
    '/api/rockstar/device-home',
  );
  await call('GET', undefined, {
    user: null,
    headers: { Cookie: cloudCookie },
  });
  await call(
    'PATCH',
    { action: 'unknown' },
    {
      path: `/api/sky/a2a-delegations/${randomUUID()}`,
      user: null,
      headers: { Cookie: cloudCookie },
      status: 400,
    },
  );
  await database
    .prepare('UPDATE esim_cloud_access_keys SET scopes_json=? WHERE id=?')
    .bind(JSON.stringify(['rockstaros_access']), cloudIssued.key.id)
    .run();
  const limitedHome = await call('GET', undefined, {
    path: '/api/rockstar/device-home',
    user: null,
    headers: {
      Cookie: cloudCookie,
      'oai-authenticated-user-email': 'untrusted@example.invalid',
    },
  });
  check(limitedHome.access, {
    rockstaros: true,
    sky: false,
    zema: false,
    agents: false,
  });
  const limitedProofResponse = await fetch(
    await signCloudRequest('/api/rockstar/device-home'),
  );
  check(limitedProofResponse.status, 200);
  check((await limitedProofResponse.json()).access, {
    rockstaros: true,
    sky: false,
    zema: false,
    agents: false,
  });
  check((await fetch(await signCloudRequest('/api/work-jobs'))).status, 401);
  await call('GET', undefined, {
    user: null,
    headers: { Cookie: cloudCookie },
    status: 401,
  });
  await database
    .prepare('UPDATE esim_cloud_access_keys SET scopes_json=? WHERE id=?')
    .bind(
      JSON.stringify(['rockstaros_access', 'sky', 'zema', 'agents']),
      cloudIssued.key.id,
    )
    .run();
  await call('GET', undefined, {
    path: cloudAccessPath,
    user: null,
    headers: { Cookie: cloudCookie },
    status: 401,
  });
  await call(
    'POST',
    { action: 'rotate', expectedKeyId: cloudIssued.key.id },
    {
      path: cloudAccessPath,
      user: null,
      headers: { Authorization: `Bearer ${cloudToken()}` },
      status: 401,
    },
  );
  await call(
    'POST',
    {},
    {
      user: null,
      headers: { Cookie: cloudCookie },
      origin: 'https://elsewhere.invalid',
      status: 403,
    },
  );
  await call(
    'POST',
    { action: 'issue' },
    { path: cloudAccessPath, status: 409 },
  );
  await call(
    'POST',
    { action: 'rotate', expectedKeyId: randomUUID() },
    { path: cloudAccessPath, status: 409 },
  );
  const rotations = await Promise.all(
    [0, 1].map(() =>
      fetch(`${base}${cloudAccessPath}`, {
        method: 'POST',
        headers: {
          'oai-authenticated-user-id': alice,
          Origin: base,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'rotate',
          expectedKeyId: cloudIssued.key.id,
        }),
      }),
    ),
  );
  check(
    rotations.map((r) => r.status).sort((a, b) => a - b),
    [201, 409],
  );
  const winningRotation = rotations.find((r) => r.status === 201);
  captureCloudCookie(winningRotation);
  const rotatedCloud = await winningRotation.json();
  check(rotatedCloud.accessExpiresAt, cloudIssued.accessExpiresAt);
  check(rotatedCloud.key.id === cloudIssued.key.id, false);
  check((await fetch(pendingRotationProof)).status, 401);
  await call('GET', undefined, {
    path: '/api/rockstar/device-home',
    user: null,
    headers: { Cookie: originalCloudCookie },
    status: 401,
  });
  const storedCloudKeys = await database
    .prepare(
      'SELECT token_sha256,revoked_at FROM esim_cloud_access_keys WHERE sky_order_id=?',
    )
    .bind(esimOrderId)
    .all();
  check(storedCloudKeys.results.length, 2);
  check(
    storedCloudKeys.results.every(
      (row) =>
        /^[a-f0-9]{64}$/.test(row.token_sha256) &&
        !row.token_sha256.includes(cloudToken()),
    ),
    true,
  );
  await database
    .prepare('UPDATE sky_commerce_orders SET refunded_minor=1 WHERE id=?')
    .bind(esimOrderId)
    .run();
  check(
    (
      await fetch(
        await signCloudRequest(
          '/api/rockstar/device-home',
          {},
          rotatedCloud.key.id,
        ),
      )
    ).status,
    401,
  );
  check(
    (await call('GET', undefined, { path: cloudAccessPath })).state,
    'suspended',
  );
  await call('GET', undefined, {
    path: '/api/rockstar/device-home',
    user: null,
    headers: { Cookie: cloudCookie },
    status: 401,
  });
  await database
    .prepare('UPDATE sky_commerce_orders SET refunded_minor=0 WHERE id=?')
    .bind(esimOrderId)
    .run();
  await database
    .prepare(
      'UPDATE esim_cloud_access_keys SET expires_at=created_at+1 WHERE id=?',
    )
    .bind(rotatedCloud.key.id)
    .run();
  check(
    (await call('GET', undefined, { path: cloudAccessPath })).state,
    'expired',
  );
  await call('GET', undefined, {
    path: '/api/rockstar/device-home',
    user: null,
    headers: { Cookie: cloudCookie },
    status: 401,
  });
  await call(
    'POST',
    { action: 'rotate', expectedKeyId: rotatedCloud.key.id },
    { path: cloudAccessPath, status: 201, inspectResponse: captureCloudCookie },
  );

  const cloudFixtureConfig = {
    ESIM_CLOUD_ACCESS_POLICIES_JSON: JSON.stringify([
      {
        packageKey: 'api-check-esim',
        manifestSha256: esimPackageHash,
        accessDurationDays: 60,
        scopes: ['rockstaros_access', 'sky', 'zema', 'agents'],
      },
    ]),
    ESIMGO_PLAN_CATALOG_JSON: JSON.stringify({
      version: 'fixture',
      plans: [apiInstallPricing.plan],
    }),
    ESIM_INSTALL_RECEIPT_KEYS: JSON.stringify([
      {
        issuerId: 'api-check-carrier',
        keyId: 'api-check-key-1',
        publicKeyHex: Buffer.from(esimIssuerPublicKey).toString('hex'),
        status: 'active',
      },
    ]),
    ESIM_DEVICE_GATEWAY_KEYS: JSON.stringify([
      {
        authorityId: 'api-check-oem',
        ownerUserId: alice,
        deviceRef: 'api-check-device',
        keyId: 'api-check-device-key-1',
        algorithm: 'ES256',
        publicKeyHex: Buffer.from(esimDeviceGatewayPublicKey).toString('hex'),
        status: 'active',
      },
    ]),
  };
  // Simulate an order refund or explicit revocation after the preflight and before D1's atomic batch.
  for (const race of ['refund', 'revoke']) {
    const beforeRace = await call('GET', undefined, { path: cloudAccessPath });
    const raceDb = {
      prepare: (sql) => database.prepare(sql),
      async batch(statements) {
        if (race === 'refund')
          await database
            .prepare(
              'UPDATE sky_commerce_orders SET refunded_minor=1 WHERE id=?',
            )
            .bind(esimOrderId)
            .run();
        else
          await esimCloudAccessStore(database, cloudFixtureConfig).revoke(
            alice,
            esimOrderId,
            beforeRace.key.id,
          );
        return database.batch(statements);
      },
    };
    await assert.rejects(
      esimCloudAccessStore(raceDb, cloudFixtureConfig).issue(
        alice,
        esimOrderId,
        beforeRace.key.id,
      ),
      /CLOUD_ACCESS_CONFLICT/,
    );
    assertions++;
    const failedReplacement = await call('GET', undefined, {
      path: cloudAccessPath,
    });
    check(failedReplacement.state, 'revoked');
    check(failedReplacement.key.id, beforeRace.key.id);
    await database
      .prepare('UPDATE sky_commerce_orders SET refunded_minor=0 WHERE id=?')
      .bind(esimOrderId)
      .run();
    await call(
      'POST',
      { action: 'rotate', expectedKeyId: beforeRace.key.id },
      {
        path: cloudAccessPath,
        status: 201,
        inspectResponse: captureCloudCookie,
      },
    );
  }

  const rotatedGatewayJwk = rotatedEsimDeviceGatewayKeyPair.publicKey.export({
    format: 'jwk',
  });
  esimDeviceGatewayPublicKey = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(rotatedGatewayJwk.x, 'base64url'),
    Buffer.from(rotatedGatewayJwk.y, 'base64url'),
  ]);
  await stop();
  await start();
  const rotatedGatewayStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(rotatedGatewayStatus.esimDeviceEntitlementState, 'revoked_or_stale');
  check(
    (await call('GET', undefined, { path: cloudAccessPath })).state,
    'suspended',
  );
  await call('GET', undefined, {
    path: '/api/rockstar/device-home',
    user: null,
    headers: { Cookie: cloudCookie },
    status: 401,
  });
  await call(
    'POST',
    { action: 'challenge' },
    {
      path: deviceEntitlementPath,
      status: 409,
    },
  );
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
  await call(
    'POST',
    { action: 'challenge' },
    {
      path: deviceEntitlementPath,
      status: 409,
    },
  );
  esimDeviceGatewayKeyStatus = 'active';
  esimIssuerKeyStatus = 'revoked';
  await stop();
  await start();
  const revokedInstallIssuerStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(revokedInstallIssuerStatus.deviceInstallState, 'unverified');
  check(
    (await call('GET', undefined, { path: cloudAccessPath })).state,
    'suspended',
  );
  await call('GET', undefined, {
    path: '/api/rockstar/device-home',
    user: null,
    headers: { Cookie: cloudCookie },
    status: 401,
  });
  check(
    revokedInstallIssuerStatus.esimDeviceEntitlementState,
    'revoked_or_stale',
  );
  esimIssuerKeyStatus = 'active';
  await stop();
  await start();
  const restoredEntitlementStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(restoredEntitlementStatus.esimDeviceEntitlementState, 'active');
  const activeCloud = await call('GET', undefined, { path: cloudAccessPath });
  check(activeCloud.state, 'active');
  const revokedCloud = await call(
    'POST',
    { action: 'revoke', expectedKeyId: activeCloud.key.id },
    { path: cloudAccessPath },
  );
  check(revokedCloud.state, 'revoked');
  await call('GET', undefined, {
    path: '/api/rockstar/device-home',
    user: null,
    headers: { Cookie: cloudCookie },
    status: 401,
  });
  await call(
    'POST',
    { action: 'rotate', expectedKeyId: activeCloud.key.id },
    { path: cloudAccessPath, status: 201, inspectResponse: captureCloudCookie },
  );
  await call('GET', undefined, {
    path: '/api/rockstar/device-home',
    user: null,
    headers: { Authorization: `Bearer ${cloudToken()}` },
  });

  const attestedEsimOrderId = randomUUID();
  const attestedProfileDigest = 'd'.repeat(64);
  const attestedDeviceRef = 'api-check-attested-device';
  await database
    .prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      attestedEsimOrderId,
      alice,
      'api-check-seller',
      'live',
      'api-check-esim',
      esimPackageHash,
      'API eSIM attestation route plan',
      1500,
      0,
      0,
      'jpy',
      'acct_api_check',
      1,
      'https://example.invalid/terms',
      'fixture only',
      'paid',
      null,
      Date.now(),
      Date.now(),
    )
    .run();
  const attestedInstallMaterial = await encryptEsimInstallMaterial(
    quickInstallProfile,
    'f'.repeat(64),
    alice,
    attestedEsimOrderId,
  );
  await database
    .prepare(`INSERT INTO esim_provider_orders
    (sky_order_id,provider,owner_user_id,package_key,manifest_sha256,pricing_snapshot_json,
     pricing_snapshot_sha256,provider_bundle_name,quote_digest,quote_total,quote_currency,state,
     provider_order_reference,profile_digest,install_material_ciphertext,install_material_nonce,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      attestedEsimOrderId,
      'esim-go-v3',
      alice,
      'api-check-esim',
      esimPackageHash,
      apiInstallPricing.canonicalJson,
      apiInstallPricing.sha256,
      'fixture_jp_1gb',
      'a'.repeat(64),
      '9.00',
      'USD',
      'profile_bound',
      'api-check-attested-provider-ref',
      attestedProfileDigest,
      attestedInstallMaterial.ciphertext,
      attestedInstallMaterial.nonce,
      Date.now(),
      Date.now(),
    )
    .run();
  await database
    .prepare(`INSERT INTO esim_provider_profile_bindings
    (profile_digest,provider,owner_user_id,sky_order_id,package_key,manifest_sha256,created_at)
    VALUES (?,?,?,?,?,?,?)`)
    .bind(
      attestedProfileDigest,
      'esim-go-v3',
      alice,
      attestedEsimOrderId,
      'api-check-esim',
      esimPackageHash,
      Date.now(),
    )
    .run();
  const attestedInstallProofPath = `/api/esim/orders/${attestedEsimOrderId}/install-proof`;
  const attestedInstallChallenge = await call(
    'POST',
    {
      action: 'challenge',
      deviceRef: attestedDeviceRef,
    },
    { path: attestedInstallProofPath },
  );
  const attestedInstallReceipt = signedInstallReceipt({
    ownerUserId: alice,
    orderId: attestedEsimOrderId,
    profileDigest: attestedProfileDigest,
    challenge: attestedInstallChallenge,
    deviceRef: attestedDeviceRef,
  });
  await call(
    'POST',
    {
      action: 'submit',
      challengeId: attestedInstallChallenge.challengeId,
      challengeNonce: attestedInstallChallenge.challengeNonce,
      receipt: attestedInstallReceipt,
    },
    { path: attestedInstallProofPath },
  );

  const attestedEntitlementPath = `/api/esim/orders/${attestedEsimOrderId}/device-entitlement`;
  const attestedEntitlementChallenge = await call(
    'POST',
    { action: 'challenge' },
    {
      path: attestedEntitlementPath,
    },
  );
  const attestedInstallReceiptSha256 = createHash('sha256')
    .update(esimInstallReceiptSigningBytes(attestedInstallReceipt))
    .digest('hex');
  const attestedStarterPackSha256 = createHash('sha256')
    .update(JSON.stringify(apiInstallPricing.plan.starterAgentPack))
    .digest('hex');
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
  const persistedAttestedKey = await database
    .prepare(`SELECT authority_id AS authorityId,
    owner_user_id AS ownerUserId, device_ref AS deviceRef, key_id AS keyId, algorithm,
    public_key_sha256 AS publicKeySha256, application_package AS applicationPackage, status
    FROM esim_device_gateway_keys WHERE key_id = ?`)
    .bind(attestedDeviceKeyId)
    .first();
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

  const publicEsimCatalog = await call('GET', undefined, {
    path: '/api/esim/catalog',
  });
  check(publicEsimCatalog.plans[0].starterAgentPack, {
    id: 'lifeline',
    version: '1.0.0',
    packages: [
      {
        packageKey: esimStarterPackageKey,
        name: 'Offline Guide',
        summary: 'Provides a short offline help guide.',
        reviewState: 'active',
      },
    ],
  });
  await database
    .prepare('UPDATE sky_tool_packages SET manifest = ? WHERE package_key = ?')
    .bind(
      JSON.stringify({ ...esimStarterPackage, name: 'Unreviewed replacement' }),
      esimStarterPackageKey,
    )
    .run();
  const changedPackStatus = await call('GET', undefined, {
    path: `/api/esim/orders/${esimOrderId}/status`,
  });
  check(changedPackStatus.starterAgentPack.packages, [
    {
      packageKey: esimStarterPackageKey,
      name: null,
      summary: null,
      reviewState: 'unavailable',
    },
  ]);
  const changedOfferProfile = await call('GET', undefined, {
    path: entitlementPath,
  });
  check(
    changedOfferProfile.entitlements[0].serviceProfile.state,
    'review_required',
  );
  const changedPublicCatalog = await call('GET', undefined, {
    path: '/api/esim/catalog',
  });
  check(
    changedPublicCatalog.plans[0].starterAgentPack.packages[0].reviewState,
    'unavailable',
  );
  check(readyEsimStatus.installMaterialAvailable, true);
  await call(
    'POST',
    { action: 'fetch', deliveryRequestId: installDeliveryId },
    {
      path: installMaterialPath,
      user: bob,
      status: 404,
    },
  );
  const deliveredInstallMaterial = await call(
    'POST',
    {
      action: 'fetch',
      deliveryRequestId: installDeliveryId,
    },
    { path: installMaterialPath },
  );
  check(deliveredInstallMaterial.state, 'ready');
  check(deliveredInstallMaterial.material, quickInstallProfile);
  const acknowledgedInstallMaterial = await call(
    'POST',
    {
      action: 'acknowledge',
      deliveryRequestId: installDeliveryId,
    },
    { path: installMaterialPath },
  );
  check(acknowledgedInstallMaterial.state, 'acknowledged');
  const erasedInstallMaterial = await call(
    'POST',
    {
      action: 'fetch',
      deliveryRequestId: installDeliveryId,
    },
    { path: installMaterialPath, status: 410 },
  );
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
  check((await call('GET', undefined, { path: a2aAgentsPath })).agents, []);
  await call('POST', {}, { path: a2aPriceQuotesPath, user: null, status: 401 });
  await call('POST', {}, { path: a2aPriceQuotesPath, status: 400 });
  await call(
    'POST',
    {
      agentId: randomUUID(),
      quoteRequestId: randomUUID(),
      message: 'quote consent fixture',
      currency: 'USD',
      maximumBudgetMinor: 100,
      expiresAt: Date.now() + 60_000,
      consentToSharePromptForQuote: false,
    },
    { path: a2aPriceQuotesPath, status: 400 },
  );
  check(
    (
      await call('GET', undefined, {
        path: a2aAgentsPath,
        user: null,
        headers: { Authorization: `Bearer ${deviceGrant.accessToken}` },
      })
    ).agents,
    [],
  );
  await call(
    'DELETE',
    { id: activeDeviceSessions.sessions[0].id },
    { path: deviceSessionsPath },
  );
  await call('GET', undefined, {
    path: a2aAgentsPath,
    user: null,
    headers: { Authorization: `Bearer ${deviceGrant.accessToken}` },
    status: 401,
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
  const boundedParent = {
    id: randomUUID(),
    title: '委任数・同時実行上限の検証',
    templateId: 'article',
  };
  await call('POST', boundedParent, { status: 201 });
  const boundedInputs = Array.from(
    { length: A2A_MAX_DELEGATIONS_PER_PARENT_JOB + 1 },
    (_, index) => ({
      id: randomUUID(),
      parentJobId: boundedParent.id,
      idempotencyKey: `bounded:${randomUUID()}`,
      messageId: randomUUID(),
      targetOrigin: 'https://agent.example.com',
      targetAgentName: 'Bounded Fixture Agent',
      targetAgentVersion: '1.0.0',
      message: `Bounded delegation ${index + 1}`,
      budgetCurrency: 'USD',
      budgetLimitMinor: 0,
      parentBudgetLimitMinor: 0,
      continueWhileDeviceOffline: true,
      deadlineAt: Date.now() + 10 * 60_000,
    }),
  );
  const activeBounded = [];
  for (
    let index = 0;
    index < A2A_MAX_ACTIVE_DELEGATIONS_PER_PARENT_JOB;
    index++
  ) {
    const result = await call('POST', boundedInputs[index], {
      path: a2aPath,
      status: 201,
    });
    activeBounded.push(result.delegation);
  }
  const concurrencyLimited = await call(
    'POST',
    boundedInputs[A2A_MAX_ACTIVE_DELEGATIONS_PER_PARENT_JOB],
    {
      path: a2aPath,
      status: 429,
    },
  );
  check(concurrencyLimited.code, 'a2a_delegation_concurrency_limit');
  const idempotentAtCapacity = await call('POST', boundedInputs[0], {
    path: a2aPath,
  });
  check(idempotentAtCapacity.created, false);
  check(idempotentAtCapacity.delegation.id, activeBounded[0].id);
  const attemptedNested = await call(
    'POST',
    {
      ...boundedInputs[4],
      id: randomUUID(),
      idempotencyKey: `nested:${randomUUID()}`,
      parentJobId: activeBounded[0].id,
    },
    { path: a2aPath, status: 404 },
  );
  check(
    attemptedNested.error,
    '親jobが見つからないか、委任期限を過ぎています。',
  );
  for (const delegation of activeBounded)
    await call(
      'PATCH',
      { action: 'cancel' },
      { path: `${a2aPath}/${delegation.id}` },
    );
  for (
    let index = A2A_MAX_ACTIVE_DELEGATIONS_PER_PARENT_JOB;
    index < A2A_MAX_DELEGATIONS_PER_PARENT_JOB;
    index++
  ) {
    const result = await call('POST', boundedInputs[index], {
      path: a2aPath,
      status: 201,
    });
    await call(
      'PATCH',
      { action: 'cancel' },
      { path: `${a2aPath}/${result.delegation.id}` },
    );
  }
  const countLimited = await call(
    'POST',
    boundedInputs[A2A_MAX_DELEGATIONS_PER_PARENT_JOB],
    {
      path: a2aPath,
      status: 429,
    },
  );
  check(countLimited.code, 'a2a_delegation_count_limit');
  const idempotentAtCountLimit = await call('POST', boundedInputs[0], {
    path: a2aPath,
  });
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
      usage: [
        {
          meter: 'task',
          quantity: 1,
          unit: 'request',
          unitPriceMinor: 100,
          amountMinor: 100,
        },
      ],
      signature: '',
    };
    quote.signature = sign(
      null,
      a2aPriceQuoteSigningBytes(quote),
      usageKeyPair.privateKey,
    ).toString('base64url');
    return quote;
  };
  const priceQuote = createPriceQuoteFor(delegationInput);
  delegationInput.priceQuote = priceQuote;
  priceQuoteRequired = true;
  await stop();
  await start();
  const noQuoteInput = {
    ...delegationInput,
    id: randomUUID(),
    idempotencyKey: `api:${randomUUID()}`,
    messageId: randomUUID(),
  };
  delete noQuoteInput.priceQuote;
  await call('POST', noQuoteInput, { path: a2aPath, status: 403 });
  priceQuoteRequired = false;
  await stop();
  await start();
  await call(
    'POST',
    { ...delegationInput, priceQuote: { ...priceQuote, estimateMinor: 101 } },
    { path: a2aPath, status: 403 },
  );
  await call(
    'POST',
    { ...delegationInput, continueWhileDeviceOffline: false },
    {
      path: a2aPath,
      status: 400,
    },
  );
  const unreviewablePredecessor = await call(
    'POST',
    {
      ...delegationInput,
      id: randomUUID(),
      idempotencyKey: `api:${randomUUID()}`,
      messageId: randomUUID(),
      predecessorDelegationId: randomUUID(),
    },
    { path: a2aPath, status: 409 },
  );
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
  await call(
    'POST',
    {
      ...delegationInput,
      id: randomUUID(),
      idempotencyKey: `api:${randomUUID()}`,
      messageId: randomUUID(),
    },
    { path: a2aPath, status: 409 },
  );
  const delegationInputSha256 = createHash('sha256')
    .update(delegationInput.message)
    .digest('hex');
  const recoveryPath = `${a2aPath}?${new URLSearchParams({
    parentJobId: a2aParent.id,
    idempotencyKey: delegationInput.idempotencyKey,
    inputSha256: delegationInputSha256,
  })}`;
  const recoveredDelegation = (
    await call('GET', undefined, { path: recoveryPath })
  ).delegation;
  check(recoveredDelegation.id, delegation.id);
  check(
    recoveredDelegation.authorizationSha256,
    delegation.authorizationSha256,
  );
  check(
    (
      await call('GET', undefined, {
        path: `${a2aPath}?${new URLSearchParams({
          parentJobId: a2aParent.id,
          idempotencyKey: delegationInput.idempotencyKey,
          inputSha256: 'f'.repeat(64),
        })}`,
      })
    ).delegation,
    null,
  );
  check(
    (await call('GET', undefined, { path: recoveryPath, user: bob }))
      .delegation,
    null,
  );
  const approval = (await call('POST', delegationInput, { path: a2aPath }))
    .approval;
  check(delegation.state, 'awaiting_approval');
  check(approval.required, true);
  let parentController = (
    await call('GET', undefined, {
      path: `${a2aPath}?parentJobId=${a2aParent.id}`,
    })
  ).controller;
  check(parentController.ownerUserId, alice);
  check(parentController.state, 'awaiting_approval');
  check(parentController.awaitingApprovalCount, 1);
  const isolatedParentController = (
    await call('GET', undefined, {
      path: `${a2aPath}?parentJobId=${a2aParent.id}`,
      user: bob,
    })
  ).controller;
  check(isolatedParentController.ownerUserId, bob);
  check(isolatedParentController.stepCount, 0);
  check(isolatedParentController.state, 'not_started');
  const a2aItem = `${a2aPath}/${delegation.id}`;
  const resumedDraft = await call('GET', undefined, { path: `${a2aItem}?review=1` });
  check(resumedDraft.review.request.id, delegation.id);
  check(resumedDraft.review.request.message, delegationInput.message);
  check(resumedDraft.review.request.messageId, delegationInput.messageId);
  check(resumedDraft.review.authorizationSha256, approval.digest);
  await call('GET', undefined, { path: `${a2aItem}?review=1`, user: bob, status: 404 });
  const approvalGateOff = await call('GET', undefined, { path: a2aItem });
  check(approvalGateOff.executionEnabled, false);
  check(approvalGateOff.brokerAuthorization.registered, false);
  await call('GET', undefined, { path: a2aItem, user: bob, status: 404 });
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
  await call(
    'PATCH',
    {
      action: 'approve',
      authorizationSha256: approval.digest,
      message: delegationInput.message,
    },
    { path: a2aItem, status: 403 },
  );
  serviceEntitlementEnforcementEnabled = true;
  await stop();
  await start();
  const deniedAfterRefund = await call(
    'PATCH',
    {
      action: 'approve',
      authorizationSha256: approval.digest,
      message: delegationInput.message,
    },
    { path: a2aItem, status: 403 },
  );
  check(deniedAfterRefund.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  serviceEntitlementEnforcementEnabled = false;
  await stop();
  await start();
  const proof = await createBrokerProof(delegation, delegationInput.message);
  const brokerProofPath = `${a2aItem}/broker-authorization`;
  serviceEntitlementEnforcementEnabled = true;
  await stop();
  await start();
  const deniedBrokerProofAfterRefund = await call(
    'POST',
    {
      proof,
      message: delegationInput.message,
    },
    { path: brokerProofPath, status: 403 },
  );
  check(deniedBrokerProofAfterRefund.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  serviceEntitlementEnforcementEnabled = false;
  await stop();
  await start();
  await call(
    'POST',
    { proof, message: delegationInput.message },
    {
      path: brokerProofPath,
      user: bob,
      status: 404,
    },
  );
  await call(
    'POST',
    {
      proof: { ...proof, budgetLimitMinor: 999 },
      message: delegationInput.message,
    },
    { path: brokerProofPath, status: 403 },
  );
  await call(
    'POST',
    { proof, message: '異なる本文を添付します。' },
    {
      path: brokerProofPath,
      status: 409,
    },
  );
  const acceptedProof = await call(
    'POST',
    { proof, message: delegationInput.message },
    {
      path: brokerProofPath,
    },
  );
  check(acceptedProof.accepted, true);
  check(acceptedProof.expiresAt, proof.expiresAt);
  const approvalGateOn = await call('GET', undefined, { path: a2aItem });
  check(approvalGateOn.executionEnabled, true);
  check(approvalGateOn.brokerAuthorization.registered, true);
  check(approvalGateOn.brokerAuthorization.expiresAt, proof.expiresAt);
  await call(
    'POST',
    { proof, message: delegationInput.message },
    { path: brokerProofPath },
  );
  await call(
    'POST',
    {
      proof: { ...proof, keyId: 'another-key' },
      message: delegationInput.message,
    },
    { path: brokerProofPath, status: 403 },
  );
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
  parentController = (
    await call('GET', undefined, {
      path: `${a2aPath}?parentJobId=${a2aParent.id}`,
    })
  ).controller;
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
  parentController = (
    await call('GET', undefined, {
      path: `${a2aPath}?parentJobId=${a2aParent.id}`,
    })
  ).controller;
  check(parentController.state, 'running');
  check(parentController.runningCount, 1);
  const liveUsageSnapshot = {
    schema: 'rock-a2a-provider-live-usage/1',
    providerId: 'api-check-provider',
    keyId: 'api-check-usage-key',
    eventId: `meter:${randomUUID()}`,
    sequence: 1,
    ownerUserId: alice,
    parentJobId: a2aParent.id,
    delegationId: delegation.id,
    taskId: artifactTaskId,
    agentOrigin: delegation.targetOrigin,
    agentName: delegation.targetAgentName,
    agentVersion: delegation.targetAgentVersion,
    currency: 'USD',
    cumulativeAmountMinor: 21,
    pricingVersion: priceQuote.pricingVersion,
    issuedAt: Date.now(),
    usage: [
      {
        meter: 'agent-operation',
        quantity: 1,
        unit: 'request',
        amountMinor: 21,
      },
    ],
    signature: '',
  };
  liveUsageSnapshot.signature = sign(
    null,
    a2aLiveUsageSigningBytes(liveUsageSnapshot),
    usageKeyPair.privateKey,
  ).toString('base64url');
  const liveUsagePath = `${a2aItem}/usage-snapshots`;
  const liveUsageAccepted = await call('POST', liveUsageSnapshot, {
    path: liveUsagePath,
    status: 202,
    user: null,
  });
  check(liveUsageAccepted.accepted, true);
  check(liveUsageAccepted.provisional, true);
  const liveUsageReplay = await call('POST', liveUsageSnapshot, {
    path: liveUsagePath,
    status: 202,
    user: null,
  });
  check(liveUsageReplay.idempotent, true);
  await call(
    'POST',
    { ...liveUsageSnapshot, cumulativeAmountMinor: 22 },
    { path: liveUsagePath, status: 409, user: null },
  );
  await call(
    'POST',
    {
      ...liveUsageSnapshot,
      signature: 'A'.repeat(86),
      eventId: `meter:${randomUUID()}`,
    },
    { path: liveUsagePath, status: 409, user: null },
  );
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
      randomUUID(),
      delegation.id,
      alice,
      artifactTaskId,
      encryptedResult.artifactSha256,
      encryptedResult.ciphertext,
      encryptedResult.nonce,
      encryptedResult.keyVersion,
      resultBytes,
      Date.now(),
    )
    .run();
  const artifactPath = `${a2aItem}/artifacts`;
  await call('GET', undefined, { path: artifactPath, user: null, status: 401 });
  await call('GET', undefined, { path: artifactPath, user: bob, status: 404 });
  const resultResponse = await call('GET', undefined, { path: artifactPath });
  check(resultResponse.captured, true);
  check(resultResponse.artifacts[0].document, resultDocument);
  // Owner-selected, read-only recovery; this path must not dispatch or change the job/budget.
  const exportParent = (await call()).jobs.find(
    (item) => item.id === a2aParent.id,
  );
  const exportPath = `/api/sky/exports/${a2aParent.id}?revision=${exportParent.revision}`;
  await call('GET', undefined, { path: exportPath, user: null, status: 401 });
  await call('GET', undefined, { path: exportPath, user: bob, status: 404 });
  await call('GET', undefined, {
    path: exportPath.replace(/revision=\d+$/, 'revision=999999'),
    status: 409,
  });
  await call('GET', undefined, {
    path: `${exportPath}&ownerUserId=${encodeURIComponent(bob)}`,
    status: 400,
  });
  await call('GET', undefined, {
    path: exportPath,
    headers: { Origin: 'https://other.example' },
    status: 403,
  });
  await call('GET', undefined, {
    path: exportPath,
    headers: { 'Sec-Fetch-Site': 'cross-site' },
    status: 403,
  });
  const exportStore = a2aDelegationStore(database);
  const exportBefore = await exportStore.get(alice, delegation.id);
  const exportBudgetBefore = await exportStore.getBudget(alice, a2aParent.id);
  const exported = await fetch(`${base}${exportPath}`, {
    headers: { 'oai-authenticated-user-id': alice },
  });
  check(exported.status, 200);
  check(exported.headers.get('cache-control'), 'no-store');
  check(exported.headers.get('content-type'), 'text/html; charset=utf-8');
  check(exported.headers.get('x-content-type-options'), 'nosniff');
  check(
    exported.headers.get('content-disposition').includes('attachment;'),
    true,
  );
  check(
    exported.headers
      .get('content-security-policy')
      .includes("default-src 'none'"),
    true,
  );
  const exportHtml = await exported.text();
  check(exportHtml.includes('fixture result'), true);
  check(/<script|<img|<iframe/.test(exportHtml), false);
  check(exportHtml.includes(encryptedResult.ciphertext), false);
  check(exportHtml.includes(delegation.authorizationSha256), false);
  const decodeExportText = (value) =>
    value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  const exportManifest = JSON.parse(
    decodeExportText(
      exportHtml.match(/<pre id="export-manifest">([\s\S]*?)<\/pre>/)[1],
    ),
  );
  check(exportManifest.schema, 'sky.owner-work-export/1');
  check(exportManifest.scope.jobId, a2aParent.id);
  for (const exportedFile of exportManifest.files) {
    const fileText = decodeExportText(
      exportHtml.match(
        new RegExp(
          `<pre data-export-file="${exportedFile.name.replaceAll('.', '\\.')}">([\\s\\S]*?)</pre>`,
        ),
      )[1],
    );
    check(Buffer.byteLength(fileText), exportedFile.byteLength);
    check(
      createHash('sha256').update(fileText).digest('hex'),
      exportedFile.sha256,
    );
  }
  check(await exportStore.get(alice, delegation.id), exportBefore);
  check(await exportStore.getBudget(alice, a2aParent.id), exportBudgetBefore);
  writeFileSync(join(tmpdir(), 'sky-owner-export-accepted.html'), exportHtml);
  parentController = (
    await call('GET', undefined, {
      path: `${a2aPath}?parentJobId=${a2aParent.id}`,
    })
  ).controller;
  check(parentController.state, 'review_results');
  check(parentController.resultReadyCount, 1);
  check(parentController.nextAction, 'review_result_or_prepare_sibling');
  const walletSettlementPath = `${a2aItem}/wallet-settlement`;
  await call('GET', undefined, {
    path: walletSettlementPath,
    user: null,
    status: 401,
  });
  await call('GET', undefined, {
    path: walletSettlementPath,
    user: bob,
    status: 404,
  });
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
    usage: [
      {
        meter: 'agent-operation',
        quantity: 1,
        unit: 'request',
        amountMinor: 37,
      },
    ],
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
    usage: [
      {
        meter: 'agent-operation',
        quantity: 1,
        unit: 'request',
        amountMinor: 20,
      },
    ],
    signature: '',
  };
  belowMeterReceipt.signature = sign(
    null,
    a2aUsageReceiptSigningBytes(belowMeterReceipt),
    usageKeyPair.privateKey,
  ).toString('base64url');
  let belowMeterSettlementCode = '';
  try {
    await a2aDelegationStore(database).settleUsageReceipt(
      alice,
      delegation.id,
      belowMeterReceipt,
    );
  } catch (error) {
    belowMeterSettlementCode = error.code ?? '';
  }
  check(belowMeterSettlementCode, 'usage_receipt_live_meter_mismatch');
  await a2aDelegationStore(database).settleUsageReceipt(
    alice,
    delegation.id,
    usageReceipt,
  );
  const meteredDelegation = await call('GET', undefined, { path: a2aItem });
  check(meteredDelegation.liveUsageSnapshot.cumulativeAmountMinor, 21);
  check(meteredDelegation.usageReceipt.amountMinor, 37);
  parentController = (
    await call('GET', undefined, {
      path: `${a2aPath}?parentJobId=${a2aParent.id}`,
    })
  ).controller;
  check(parentController.budget.usageRecordedMinor, 37);
  check(parentController.budget.usageIsInvoice, false);
  const walletHandoff = await call('GET', undefined, {
    path: walletSettlementPath,
  });
  check(walletHandoff.schema, 'rock-a2a-wallet-settlement-handoff/1');
  check(walletHandoff.state, 'ready_for_device_wallet');
  check(walletHandoff.reservation.ownerUserId, alice);
  check(walletHandoff.reservation.delegationId, delegation.id);
  check(walletHandoff.reservation.settledMinor, 37);
  check(walletHandoff.walletCommand.op, 'a2a.budget.settle');
  check(walletHandoff.walletCommand.delegation_id, delegation.id);
  check(walletHandoff.walletCommand.receipt, usageReceipt);
  check(walletHandoff.receiptSha256.length, 64);
  check(
    (await call('GET', undefined, { path: walletSettlementPath }))
      .idempotencyKey,
    walletHandoff.idempotencyKey,
  );
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
  const deviceWalletHandoff = await call('POST', walletRequest, {
    path: walletSettlementPath,
  });
  check(deviceWalletHandoff.schema, walletHandoff.schema);
  check(deviceWalletHandoff.idempotencyKey, walletHandoff.idempotencyKey);
  check(deviceWalletHandoff.walletCommand, walletHandoff.walletCommand);
  await call(
    'POST',
    { ...walletRequest, ownerUserId: bob },
    { path: walletSettlementPath, status: 403 },
  );
  await call(
    'POST',
    { ...walletRequest, delegationId: randomUUID() },
    { path: walletSettlementPath, status: 403 },
  );
  const nativeWalletHandoff = spawnSync(
    'python3',
    [join(root, 'systems/rock-star-os/scripts/accept-cloud-wallet-handoff.py')],
    {
      cwd: root,
      env: {
        ...process.env,
        PYTHONPATH: [
          join(root, 'systems/rock-star-os/src'),
          process.env.PYTHONPATH,
        ]
          .filter(Boolean)
          .join(':'),
      },
      input: JSON.stringify({
        handoff: walletHandoff,
        trustedUsagePublicKeyHex: Buffer.from(usagePublicKey).toString('hex'),
      }),
      encoding: 'utf8',
      timeout: 15_000,
    },
  );
  if (nativeWalletHandoff.status !== 0)
    throw new Error(
      `Native Wallet handoff fixture failed: ${nativeWalletHandoff.stderr}`,
    );
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
  const deleteInput = {
    id: randomUUID(),
    terms: { ...teamInput.terms, title: '削除検証用の合成下書き' },
  };
  const { caseFile: deleteCase } = await call('POST', deleteInput, {
    path: teamPath,
    status: 201,
  });
  const deletion = { caseId: deleteCase.id, revision: 0 };
  await call('DELETE', deletion, { path: teamPath, user: null, status: 401 });
  await call('DELETE', deletion, {
    path: teamPath,
    origin: 'https://untrusted.example',
    status: 403,
  });
  await call('DELETE', deletion, { path: teamPath, user: bob, status: 404 });
  await call(
    'DELETE',
    { ...deletion, revision: -1 },
    { path: teamPath, status: 400 },
  );
  await call(
    'DELETE',
    { ...deletion, revision: '0' },
    { path: teamPath, status: 400 },
  );
  await call(
    'DELETE',
    { ...deletion, extra: true },
    { path: teamPath, status: 400 },
  );
  await call(
    'DELETE',
    { ...deletion, revision: 1 },
    { path: teamPath, status: 409 },
  );
  check(
    (await call('GET', undefined, { path: teamPath })).cases.find(
      (item) => item.id === deleteCase.id,
    ).status,
    'draft',
  );
  const deleted = await call('DELETE', deletion, { path: teamPath });
  check(deleted.deletedCaseId, deleteCase.id);
  check(
    (await call('GET', undefined, { path: teamPath })).cases.some(
      (item) => item.id === deleteCase.id,
    ),
    false,
  );
  await call('DELETE', deletion, { path: teamPath, status: 404 });
  await call(
    'DELETE',
    { caseId: caseFile.id, revision: caseFile.revision },
    { path: teamPath, status: 409 },
  );
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
  // Two applications share one owner/revision/result service; it remains closed without the private allowlist.
  const appPath = '/api/sky/app-work';
  await call('GET', undefined, {
    path: `${appPath}?jobId=${randomUUID()}`,
    status: 404,
  });
  skyAppPrivateOwners = JSON.stringify([alice, bob]);
  await stop();
  await start();
  const recipe = {
    schema: 'sky.private-zoom-recipe/1',
    name: '会議',
    purpose: '決定を整理',
    outputs: ['decisions'],
    summaryLines: 1,
    decisionLabel: '決定',
    ownerLabel: '担当',
  };
  for (const appId of ['zoom', 'planner']) {
    const jobId = randomUUID();
    const request = {
      schema: 'sky.app-request/1',
      appId,
      sourceId: `source-${appId}`,
      sourceRevision: 'r1',
      title: `Private ${appId}`,
      objective: '共通のSky処理で本人確認する',
      input:
        appId === 'zoom'
          ? '決定: 非公開で試す'
          : '担当作業：確認用メモ。成果物：下書き。',
      ...(appId === 'zoom' ? { recipe } : {}),
    };
    const create = { action: 'create', jobId, request, saveMaterial: true };
    await call('POST', create, { path: appPath, user: null, status: 401 });
    await call('POST', create, {
      path: appPath,
      user: 'not-private-owner',
      status: 404,
    });
    await call('POST', create, {
      path: appPath,
      origin: 'https://attacker.invalid',
      status: 403,
    });
    await call(
      'POST',
      { ...create, saveMaterial: false },
      { path: appPath, status: 400 },
    );
    check(
      (await call('POST', create, { path: appPath, status: 201 })).job.status,
      'active',
    );
    await call('POST', create, { path: appPath, status: 201 });
    await call('GET', undefined, {
      path: `${appPath}?jobId=${jobId}`,
      user: bob,
      status: 404,
    });
    await call(
      'POST',
      { action: 'run', jobId, revision: 0, commandId: randomUUID() },
      { path: appPath, user: bob, status: 404 },
    );
    await call(
      'POST',
      { ...create, request: { ...request, sourceRevision: 'other' } },
      { path: appPath, status: 409 },
    );
    await call(
      'PATCH',
      {
        jobId,
        revision: 0,
        command: {
          id: randomUUID(),
          action: 'record',
          stepId: 'extract',
          tool: 'sky-app-extract',
          transport: 'browser',
          outcome: 'passed',
          sample: false,
          durationMs: 0,
        },
      },
      { status: 409 },
    );
    const runCommand = {
      action: 'run',
      jobId,
      revision: 0,
      commandId: randomUUID(),
    };
    const { job: resultJob } = await call('POST', runCommand, {
      path: appPath,
    });
    check(resultJob.status, 'review');
    check(resultJob.revision, 2);
    check(resultJob.skyApp.result.sourceId, request.sourceId);
    check(resultJob.skyApp.result.provisional, true);
    check((await call('POST', runCommand, { path: appPath })).job, resultJob);
    await call(
      'POST',
      { action: 'confirm', jobId, revision: 0, commandId: randomUUID() },
      { path: appPath, status: 409 },
    );
    const { job: confirmed } = await call(
      'POST',
      { action: 'confirm', jobId, revision: 2, commandId: randomUUID() },
      { path: appPath },
    );
    check(confirmed.status, 'completed');
    const exportedApp = await fetch(
      `${base}/api/sky/exports/${jobId}?revision=3`,
      { headers: { 'oai-authenticated-user-id': alice } },
    );
    check(exportedApp.status, 200);
    check((await exportedApp.text()).includes('sky-app.json'), true);
    const stoppedId = randomUUID();
    await call(
      'POST',
      { ...create, jobId: stoppedId },
      { path: appPath, status: 201 },
    );
    const runPending = call(
      'POST',
      { action: 'run', jobId: stoppedId, revision: 0, commandId: randomUUID() },
      { path: appPath, status: 409 },
    );
    const stopped = await call(
      'POST',
      {
        action: 'stop',
        jobId: stoppedId,
        revision: 0,
        commandId: randomUUID(),
      },
      { path: appPath },
    );
    check(stopped.job.status, 'cancelled');
    await runPending;
    const captured = await call('GET', undefined, {
      path: `${appPath}?jobId=${stoppedId}`,
    });
    check(captured.job.skyApp.result, null);
    await call('POST', create, { path: appPath, user: bob, status: 409 });
  }
  await stop();
  await start();
  // Eve's unresolved cancellation survives a real workerd restart, then uses
  // the existing remote reconciliation receipt; no new task/send is created.
  {
    const path = '/api/eve/agent-work';
    let result = await call('GET', undefined, { path: `${path}?id=${eveAgentProof.jobId}` });
    check(result.stop.confirmed, false); check(result.job.status, 'active');
    const a2a = a2aDelegationStore(database), row = await a2a.get(alice, eveAgentProof.childId);
    await a2a.confirmCancelResult(alice, row.id, row.revision, 'TASK_STATE_CANCELED');
    result = await call('PATCH', { jobId: eveAgentProof.jobId, action: 'sync' }, { path });
    check(result.stop.confirmed, true); check(result.job.status, 'cancelled');
    const events = await a2a.listEvents(alice, row.id);
    check(events.filter(e => e.eventType === 'remote_send_claimed').length, 1);
    const thread = await call('GET', undefined, { path: `/api/eve/history?id=${eveAgentProof.threadId}` });
    check(thread.session.messages.some(m => m.text.includes('停止確認済み')), true);
  }
  // Records persist through workerd restart with exactly the existing WorkStore.
  check((await call()).jobs.filter((item) => item.skyApp).length, 4);
  skyAppPrivateOwners = '';
  await stop();
  await start();
  await call('GET', undefined, {
    path: `${appPath}?jobId=${randomUUID()}`,
    status: 404,
  });
  // History-key outage cannot make the owner's stop action unavailable.
  {
    const id = randomUUID(), threadId = randomUUID();
    let result = await call('POST', { id, title: 'History outage stop fixture', templateId: 'cloud-agent' }, { status: 201 });
    result = await call('POST', { jobId: id, threadId, revision: result.job.revision }, { path: '/api/eve/agent-work' });
    eveHistoryKeyringAvailable = false; await stop(); await start();
    result = await call('PATCH', { jobId: id, revision: result.job.revision, command: { id: randomUUID(), action: 'cancel' } });
    check(result.job.status, 'cancelled'); check(result.stop.confirmed, true); check(result.historySaved, false);
    await call('GET', undefined, { path: `/api/eve/history?id=${threadId}`, status: 503 });
    eveHistoryKeyringAvailable = true; await stop(); await start();
    result = await call('PATCH', { jobId: id, action: 'sync' }, { path: '/api/eve/agent-work' }); check(result.historySaved, true);
  }
  console.log(
    `仕事API: ${assertions} assertions passed (認証境界・分離・競合・順序・再送・再起動後の保存)`,
  );
} finally {
  await stop();
  rmSync(temporary, { recursive: true, force: true });
}
