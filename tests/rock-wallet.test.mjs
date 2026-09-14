import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  BASE_USDC_ADDRESS,
  createRockWalletConsentMessage,
  normalizeBaseChainId,
  verifyBaseUsdcCollection,
  verifyRockWalletConsent,
} from '../lib/rock-wallet.ts';

const account = privateKeyToAccount(
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
);
const recipient = getAddress('0x1111111111111111111111111111111111111111');
const transferAbi = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

function transferLog(amountMinor, to = recipient) {
  return {
    address: BASE_USDC_ADDRESS,
    blockHash: `0x${'a'.repeat(64)}`,
    blockNumber: '0x64',
    data: encodeAbiParameters(
      [{ type: 'uint256' }],
      [BigInt(amountMinor) * BigInt(10_000)],
    ),
    logIndex: '0x0',
    removed: false,
    topics: encodeEventTopics({
      abi: transferAbi,
      eventName: 'Transfer',
      args: { from: account.address, to },
    }),
    transactionHash: `0x${'b'.repeat(64)}`,
    transactionIndex: '0x0',
  };
}

void test('Rock receiving address requires an origin-bound expiring ownership signature', async () => {
  const message = createRockWalletConsentMessage({
    origin: 'https://rockstar.example',
    address: account.address,
    chainId: 8453,
    nonce: 'A1B2C3D4E5F6G7H8',
    issuedAt: '2026-09-14T00:00:00.000Z',
    expiresAt: '2026-09-14T00:05:00.000Z',
  });
  const signature = await account.signMessage({ message });
  assert.equal(
    await verifyRockWalletConsent({
      address: account.address,
      message,
      signature,
    }),
    account.address,
  );
  await assert.rejects(
    () =>
      verifyRockWalletConsent({
        address: recipient,
        message,
        signature,
      }),
    /SIGNATURE_INVALID/u,
  );
  assert.throws(() => normalizeBaseChainId(1), /CHAIN_UNSUPPORTED/u);
});

void test('Base USDC proof requires exact recipient, exact cents and finalized success', () => {
  const collected = verifyBaseUsdcCollection({
    recipient,
    amountMinor: 888,
    receiptStatus: '0x1',
    receiptBlockNumber: BigInt(100),
    finalizedBlockNumber: BigInt(100),
    logs: [transferLog(888)],
  });
  assert.equal(collected.status, 'collected');
  assert.equal(collected.amountUnits, BigInt(8_880_000));

  const confirming = verifyBaseUsdcCollection({
    recipient,
    amountMinor: 888,
    receiptStatus: '0x1',
    receiptBlockNumber: BigInt(100),
    finalizedBlockNumber: BigInt(99),
    logs: [transferLog(888)],
  });
  assert.equal(confirming.status, 'confirming');

  assert.throws(
    () =>
      verifyBaseUsdcCollection({
        recipient,
        amountMinor: 887,
        receiptStatus: '0x1',
        receiptBlockNumber: BigInt(100),
        finalizedBlockNumber: BigInt(100),
        logs: [transferLog(888)],
      }),
    /TRANSFER_MISMATCH/u,
  );
  assert.throws(
    () =>
      verifyBaseUsdcCollection({
        recipient,
        amountMinor: 888,
        receiptStatus: '0x0',
        receiptBlockNumber: BigInt(100),
        finalizedBlockNumber: BigInt(100),
        logs: [transferLog(888)],
      }),
    /TRANSACTION_REVERTED/u,
  );
});
