import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptRemoteAiTextInput, encryptRemoteAiTextInput } from '../lib/remote-ai-text-input.ts';

void test('durable remote LLM prompt is encrypted and decrypts only for its owner and execution', async () => {
  const intent = {
    ownerId: 'owner-1', requestId: 'request-1', model: 'gpt-5.4-nano',
    prompt: 'Private task text', system: 'Use only approved capabilities.',
    maxOutputTokens: 400, maximumBudgetMinor: 60,
  };
  const encrypted = await encryptRemoteAiTextInput(intent, 'a'.repeat(64), 'owner-1', 'execution-1');
  assert.equal(encrypted.keyVersion, 'aes-256-gcm-v1');
  assert.equal(encrypted.ciphertext.includes(intent.prompt), false);
  assert.deepEqual(await decryptRemoteAiTextInput(encrypted, 'a'.repeat(64), 'owner-1', 'execution-1'), intent);
  await assert.rejects(() => decryptRemoteAiTextInput(encrypted, 'a'.repeat(64), 'owner-2', 'execution-1'));
  await assert.rejects(() => decryptRemoteAiTextInput(encrypted, 'a'.repeat(64), 'owner-1', 'execution-2'));
  await assert.rejects(() => decryptRemoteAiTextInput({ ...encrypted, inputSha256: '0'.repeat(64) }, 'a'.repeat(64), 'owner-1', 'execution-1'));
});
