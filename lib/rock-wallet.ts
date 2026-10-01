import {
  getAddress,
  isAddress,
  isHash,
  parseAbi,
  parseEventLogs,
  verifyMessage,
  type Address,
  type Hash,
  type Hex,
  type RpcLog,
} from 'viem';
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_MAINNET_CHAIN_HEX,
  BASE_MAINNET_RPC_URL,
  BASE_EXPLORER_URL,
  BASE_USDC_ADDRESS as configuredBaseUsdcAddress,
  BASE_USDC_DECIMALS,
  ROCK_WALLET_CONSENT_VERSION,
  ROCK_WALLET_PROVIDER_ID,
} from './rock-wallet-config.ts';

export {
  BASE_MAINNET_CHAIN_ID,
  BASE_MAINNET_CHAIN_HEX,
  BASE_MAINNET_RPC_URL,
  BASE_EXPLORER_URL,
  BASE_USDC_DECIMALS,
  ROCK_WALLET_CONSENT_VERSION,
  ROCK_WALLET_PROVIDER_ID,
};
export const BASE_USDC_ADDRESS = getAddress(configuredBaseUsdcAddress);

const transferAbi = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

export function normalizeWalletAddress(value: unknown): Address {
  if (typeof value !== 'string' || !isAddress(value, { strict: false }))
    throw new Error('ROCK_WALLET_ADDRESS_INVALID');
  return getAddress(value);
}

export function normalizeTransactionHash(value: unknown): Hash {
  if (typeof value !== 'string' || !isHash(value))
    throw new Error('ROCK_WALLET_TRANSACTION_HASH_INVALID');
  return value.toLowerCase() as Hash;
}

export function normalizeBaseChainId(value: unknown) {
  const parsed =
    typeof value === 'string' && /^0x[0-9a-f]+$/iu.test(value)
      ? Number.parseInt(value.slice(2), 16)
      : value;
  if (parsed !== BASE_MAINNET_CHAIN_ID)
    throw new Error('ROCK_WALLET_CHAIN_UNSUPPORTED');
  return BASE_MAINNET_CHAIN_ID;
}

function approvedOrigin(value: string) {
  const origin = new URL(value);
  if (
    origin.protocol !== 'https:' &&
    !(
      origin.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(origin.hostname)
    )
  )
    throw new Error('ROCK_WALLET_ORIGIN_INVALID');
  return origin;
}

export function createRockWalletConsentMessage(input: {
  origin: string;
  address: unknown;
  chainId: unknown;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}) {
  const origin = approvedOrigin(input.origin);
  const address = normalizeWalletAddress(input.address);
  const chainId = normalizeBaseChainId(input.chainId);
  if (!/^[A-Za-z0-9]{16,64}$/u.test(input.nonce))
    throw new Error('ROCK_WALLET_NONCE_INVALID');
  const issuedAt = new Date(input.issuedAt);
  const expiresAt = new Date(input.expiresAt);
  if (
    !Number.isFinite(issuedAt.valueOf()) ||
    !Number.isFinite(expiresAt.valueOf()) ||
    expiresAt <= issuedAt ||
    expiresAt.valueOf() - issuedAt.valueOf() > 10 * 60_000
  )
    throw new Error('ROCK_WALLET_CHALLENGE_TIME_INVALID');
  return `${origin.host} wants you to sign in with your Ethereum account:
${address}

Register this address as the Rock Settlement Wallet receiving account. This does not authorize transfers or expose private keys.

URI: ${origin.origin}/wallet
Version: 1
Chain ID: ${chainId}
Nonce: ${input.nonce}
Issued At: ${issuedAt.toISOString()}
Expiration Time: ${expiresAt.toISOString()}
Request ID: ${ROCK_WALLET_PROVIDER_ID}
Resources:
- ${origin.origin}/wallet`;
}

export async function verifyRockWalletConsent(input: {
  address: unknown;
  message: string;
  signature: unknown;
}) {
  const address = normalizeWalletAddress(input.address);
  if (
    typeof input.signature !== 'string' ||
    !/^0x[0-9a-f]{130}$/iu.test(input.signature)
  )
    throw new Error('ROCK_WALLET_SIGNATURE_INVALID');
  const valid = await verifyMessage({
    address,
    message: input.message,
    signature: input.signature as Hex,
  });
  if (!valid) throw new Error('ROCK_WALLET_SIGNATURE_INVALID');
  return address;
}

export type BaseReceiptLog = RpcLog;

export function verifyBaseUsdcCollection(input: {
  recipient: unknown;
  amountMinor: number;
  receiptStatus: Hex;
  receiptBlockNumber: bigint;
  finalizedBlockNumber: bigint;
  logs: BaseReceiptLog[];
}) {
  const recipient = normalizeWalletAddress(input.recipient);
  if (
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor < 1 ||
    input.amountMinor > 888
  )
    throw new Error('ROCK_COLLECTION_AMOUNT_INVALID');
  if (input.receiptStatus !== '0x1')
    throw new Error('ROCK_COLLECTION_TRANSACTION_REVERTED');
  if (input.finalizedBlockNumber < input.receiptBlockNumber)
    return { status: 'confirming' as const, recipient };

  const expectedUnits = BigInt(input.amountMinor) * BigInt(10_000);
  const transfer = parseEventLogs({
    abi: transferAbi,
    eventName: 'Transfer',
    logs: input.logs.filter(
      (log) => log.address.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase(),
    ),
    strict: true,
  }).find(
    (event) =>
      event.args.to?.toLowerCase() === recipient.toLowerCase() &&
      event.args.value === expectedUnits,
  );
  if (!transfer) throw new Error('ROCK_COLLECTION_TRANSFER_MISMATCH');
  return {
    status: 'collected' as const,
    recipient,
    amountUnits: expectedUnits,
    logIndex: transfer.logIndex,
  };
}
