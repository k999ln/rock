import {
  prepareRockFeeCollection,
  validateFinancialProviderManifest,
  type FinancialProviderManifest,
  type RockFeeCollectionInput,
} from './financial-provider.ts';
import { verifyReceiptSignature } from './receipt-signature.ts';

/** SANDBOX proposal seam only. Never posts, reserves, releases or credits money.
 * Authority is freshly loaded server configuration, never request JSON. The
 * caller must authenticate ownerId and reload trust/journal after restart.
 * Event and independent query evidence use distinct role keys. These HMAC
 * fixture envelopes do not claim an implemented bank/chain provider protocol.
 */
export type WalletRailOperation = 'deposit' | 'sales' | 'fee_collection' | 'payout';
type RailStatus = 'pending' | 'finalized' | 'arrived' | 'refunded' | 'reorged';
type RailKey = { id: string; secret: string; validFrom: number; expiresAt: number; revoked: boolean };
type Binding = {
  providerId: string; ownerId: string; operation: WalletRailOperation;
  chain: string; account: string; asset: string; currency: string;
  amountMinor: number; transactionId: string; transferId: string;
};
type RailEvent = Binding & {
  schema: 'wallet-rail-event/1'; keyId: string; eventId: string;
  effect: 'observation' | 'refund' | 'reorg'; originalEventId: string | null;
  occurredAt: number; businessReference: string;
};
type RailReadback = {
  schema: 'wallet-rail-readback/1'; keyId: string; eventSha256: string;
  binding: Binding; status: RailStatus; observedAt: number;
  sequence: number; reversibleUntil: number;
};
export type WalletProvenanceCheckpoint = {
  revision: number; trustRevision: number; transferKey: string; ownerId: string;
  intentSha256: string; originalEventId: string; lastEventSha256: string;
  lastReadbackSha256: string; lastSequence: number; status: RailStatus;
};
export type WalletProvenanceAuthority = {
  manifest: FinancialProviderManifest;
  /** Versioned operation-level manifest extension: receive alone is insufficient
   * to opt into both deposit and sales. Payout/fee are independently granted. */
  railPolicy: { schema: 'wallet-rail-policy/1'; operations: WalletRailOperation[] };
  expected: { ownerId: string; chain: string; account: string; asset: string; currency: string };
  trustRevision: number; eventKey: RailKey; readbackKey: RailKey;
  nowSeconds: number;
  /** Existing authority's durable projection, read within the eventual CAS.
   * null means absent globally, not merely absent in an owner-filtered query. */
  checkpoint: WalletProvenanceCheckpoint | null;
  /** Global external-event index lookup, in the same eventual transaction. */
  eventClaim: { eventKey: string; transferKey: string; eventSha256: string } | null;
  feeAllocation?: RockFeeCollectionInput;
};
const bindingKeys = ['providerId', 'ownerId', 'operation', 'chain', 'account', 'asset',
  'currency', 'amountMinor', 'transactionId', 'transferId'] as const;
const eventKeys = [...bindingKeys, 'schema', 'keyId', 'eventId', 'effect',
  'originalEventId', 'occurredAt', 'businessReference'];
const readbackKeys = ['schema', 'keyId', 'eventSha256', 'binding', 'status',
  'observedAt', 'sequence', 'reversibleUntil'];
const checkpointKeys = ['revision', 'trustRevision', 'transferKey', 'ownerId',
  'intentSha256', 'originalEventId', 'lastEventSha256', 'lastReadbackSha256',
  'lastSequence', 'status'];
const capabilities = {
  deposit: 'receive', sales: 'receive', fee_collection: 'collect_platform_fee', payout: 'payout',
} as const;
const statuses: RailStatus[] = ['pending', 'finalized', 'arrived', 'refunded', 'reorged'];
function fail(code: string): never { throw new Error(`WALLET_PROVENANCE_${code}`); }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SHAPE');
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).length !== keys.length || keys.some((key) => !(key in obj)) ||
      Object.keys(obj).some((key) => !keys.includes(key))) fail('FIELDS');
  return obj;
}
function integer(value: unknown, minimum = 0): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail('INTEGER');
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/u.test(value)) fail('ID');
}
function hash(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) fail('HASH');
}
function binding(value: unknown) {
  const item = exact(value, bindingKeys);
  for (const key of bindingKeys) if (key !== 'amountMinor') id(item[key]);
  integer(item.amountMinor, 1);
  if (!Object.hasOwn(capabilities, String(item.operation)) ||
      !/^[a-z]{3}$/u.test(String(item.currency))) fail('BINDING');
}
function parse(raw: string) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 8192) fail('SIZE');
  try { return JSON.parse(raw) as unknown; } catch { return fail('JSON'); }
}
async function digest(raw: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function keyCheck(key: RailKey, idValue: string, now: number) {
  id(key.id); integer(key.validFrom); integer(key.expiresAt);
  if (key.revoked !== false || key.id !== idValue || now < key.validFrom ||
      now >= key.expiresAt || typeof key.secret !== 'string' || key.secret.length < 32) fail('KEY');
}

export async function evaluateWalletDepositProvenance(
  input: { eventBody: string; eventSignature: string; readbackBody: string; readbackSignature: string },
  serverAuthority: WalletProvenanceAuthority,
) {
  // Snapshot before asynchronous cryptography so caller mutation cannot change
  // verified bytes or policy half-way through one evaluation.
  const authority = structuredClone(serverAuthority);
  const packet = { ...input };
  exact(packet, ['eventBody', 'eventSignature', 'readbackBody', 'readbackSignature']);
  const event = exact(parse(packet.eventBody), eventKeys) as unknown as RailEvent;
  const readback = exact(parse(packet.readbackBody), readbackKeys) as unknown as RailReadback;
  binding(Object.fromEntries(bindingKeys.map((key) => [key, event[key]])));
  binding(readback.binding);
  if (event.schema !== 'wallet-rail-event/1' || readback.schema !== 'wallet-rail-readback/1') fail('SCHEMA');
  id(event.eventId); id(event.businessReference); id(event.keyId); id(readback.keyId);
  integer(event.occurredAt); integer(readback.observedAt); integer(readback.sequence, 1);
  integer(readback.reversibleUntil); integer(authority.nowSeconds); integer(authority.trustRevision, 1);
  hash(readback.eventSha256);
  if (!['observation', 'refund', 'reorg'].includes(event.effect) ||
      !statuses.includes(readback.status)) fail('STATE');
  if (event.effect === 'observation' ? event.originalEventId !== null : typeof event.originalEventId !== 'string') fail('ORIGINAL');
  if (event.originalEventId !== null) id(event.originalEventId);
  if (event.eventId === event.originalEventId) fail('REVERSAL_EVENT_ID');
  if (event.occurredAt > readback.observedAt || readback.observedAt > authority.nowSeconds ||
      authority.nowSeconds - readback.observedAt > 300) fail('STALE_READBACK');
  const manifest = validateFinancialProviderManifest(authority.manifest);
  if (!['sandbox_available', 'sandbox_verified'].includes(manifest.status) ||
      manifest.providerId !== event.providerId || !manifest.currencies.includes(event.currency) ||
      !manifest.capabilities.includes(capabilities[event.operation])) fail('CAPABILITY');
  const policy = exact(authority.railPolicy, ['schema', 'operations']);
  if (policy.schema !== 'wallet-rail-policy/1' || !Array.isArray(policy.operations) ||
      policy.operations.some((op) => typeof op !== 'string' || !Object.hasOwn(capabilities, op)) ||
      new Set(policy.operations).size !== policy.operations.length ||
      !policy.operations.includes(event.operation)) fail('OPERATION');
  exact(authority.expected, ['ownerId', 'chain', 'account', 'asset', 'currency']);
  for (const key of ['ownerId', 'chain', 'account', 'asset', 'currency'] as const) {
    id(authority.expected[key]);
    if (event[key] !== authority.expected[key]) fail('OWNER_OR_RAIL');
  }
  for (const key of bindingKeys) if (event[key] !== readback.binding[key]) fail('READBACK_MISMATCH');
  if (authority.eventKey.id === authority.readbackKey.id ||
      authority.eventKey.secret === authority.readbackKey.secret) fail('INDEPENDENT_KEY_REQUIRED');
  keyCheck(authority.eventKey, event.keyId, authority.nowSeconds);
  keyCheck(authority.readbackKey, readback.keyId, authority.nowSeconds);
  if (event.occurredAt < authority.eventKey.validFrom ||
      readback.observedAt < authority.readbackKey.validFrom) fail('KEY');
  await verifyReceiptSignature(packet.eventBody, packet.eventSignature, authority.eventKey.secret, authority.nowSeconds);
  await verifyReceiptSignature(packet.readbackBody, packet.readbackSignature, authority.readbackKey.secret, authority.nowSeconds);
  const eventSha256 = await digest(packet.eventBody);
  const readbackSha256 = await digest(packet.readbackBody);
  if (eventSha256 !== readback.eventSha256) fail('EVENT_HASH');
  const intentSha256 = await digest(JSON.stringify([...bindingKeys.map((key) => event[key]), event.businessReference]));
  // Deliberately excludes owner/asset/receipt: aliases cannot create a second
  // claim on the same external transfer. Existing journal must enforce UNIQUE.
  const transferKey = JSON.stringify([event.providerId, event.chain, event.transactionId, event.transferId]);
  const externalEventKey = JSON.stringify([event.providerId, event.eventId]);
  if (authority.eventClaim !== null) {
    const claim = exact(authority.eventClaim, ['eventKey', 'transferKey', 'eventSha256']);
    if (claim.eventKey !== externalEventKey || claim.transferKey !== transferKey ||
        claim.eventSha256 !== eventSha256) fail('EVENT_CONFLICT');
  }
  if (event.operation === 'fee_collection') {
    if (!authority.feeAllocation) fail('FEE_POLICY_REQUIRED');
    const fee = prepareRockFeeCollection(authority.feeAllocation);
    if (fee.providerId !== event.providerId || fee.userId !== event.ownerId ||
        fee.receiptId !== event.businessReference || fee.amountMinor !== event.amountMinor ||
        event.currency !== 'usd') fail('FEE_POLICY');
  }
  if (event.effect === 'refund' ? readback.status !== 'refunded' :
      event.effect === 'reorg' ? readback.status !== 'reorged' :
      ['refunded', 'reorged'].includes(readback.status)) fail('EFFECT');
  if (readback.status === 'arrived' && event.operation !== 'payout') fail('ARRIVAL');
  const previous = authority.checkpoint;
  let replay = false;
  if (previous) {
    exact(previous, checkpointKeys);
    integer(previous.revision, 1); integer(previous.trustRevision, 1); integer(previous.lastSequence, 1);
    hash(previous.intentSha256); hash(previous.lastEventSha256); hash(previous.lastReadbackSha256);
    id(previous.ownerId); id(previous.originalEventId);
    if (!statuses.includes(previous.status)) fail('CHECKPOINT');
    if (previous.transferKey !== transferKey || previous.ownerId !== event.ownerId ||
        previous.intentSha256 !== intentSha256) fail('TRANSFER_CONFLICT');
    if (previous.trustRevision > authority.trustRevision) fail('TRUST_ROLLBACK');
    if ((event.effect === 'observation' ? event.eventId : event.originalEventId) !== previous.originalEventId) fail('DUPLICATE_TRANSFER');
    replay = previous.lastEventSha256 === eventSha256 && previous.lastReadbackSha256 === readbackSha256;
    if (!replay && (readback.sequence <= previous.lastSequence ||
        ['refunded', 'reorged'].includes(previous.status))) fail('REPLAY_OR_TERMINAL');
    if (event.effect === 'refund' && previous.status === 'pending') fail('UNFUNDED_REFUND');
    if (!replay && event.effect === 'observation' &&
        ((previous.status === 'finalized' && readback.status === 'pending') ||
         (previous.status === 'arrived' && readback.status !== 'arrived'))) fail('REGRESSION');
  } else if (event.effect !== 'observation') fail('ORIGINAL_REQUIRED');
  const checkpoint: WalletProvenanceCheckpoint = {
    revision: (previous?.revision ?? 0) + (replay ? 0 : 1), trustRevision: authority.trustRevision,
    transferKey, ownerId: event.ownerId, intentSha256,
    originalEventId: previous?.originalEventId ?? event.eventId,
    lastEventSha256: eventSha256, lastReadbackSha256: readbackSha256,
    lastSequence: readback.sequence, status: readback.status,
  };
  integer(checkpoint.revision, 1);
  return {
    schema: 'wallet-provenance-proposal/1' as const,
    mode: 'SANDBOX' as const, liveEnabled: false as const,
    evidenceClass: 'signed_fixture_candidate' as const,
    creditAllowed: false as const, amountToCreditMinor: 0 as const,
    operation: event.operation, amountMinor: event.amountMinor, currency: event.currency,
    stage: replay ? 'replay_noop' : event.effect !== 'observation' ? 'reversal_candidate' :
      readback.status === 'pending' ? 'pending_candidate' :
      event.operation === 'sales' ? 'earning_reconciliation_required' :
      event.operation === 'payout' ? readback.status === 'arrived' ? 'arrival_candidate' : 'arrival_readback_required' :
      readback.reversibleUntil > authority.nowSeconds ? 'held_candidate' : 'confirmed_candidate',
    journalRequirement: {
      transferKey, expectedRevision: previous?.revision ?? 0, trustRevision: authority.trustRevision,
      action: replay ? 'none' : event.effect === 'observation' ? 'observe_only' : 'linked_reversal_only',
      originalEventId: checkpoint.originalEventId,
      externalEventKey,
      eventSha256, readbackSha256,
    },
    checkpoint,
    integrationRequired: ['fresh_authenticated_provider_query', 'existing_journal_global_uniqueness_and_CAS',
      'existing_reservation_reconciliation', 'independent_review_and_provider_acceptance'],
  };
}
