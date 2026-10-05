import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptA2AArtifact,
  decryptA2AInput,
  encryptA2AArtifact,
  encryptA2AInput,
} from '../lib/a2a-input-crypto.ts';

const message = '公開資料の要点を整理してください。';
const key = 'a'.repeat(64);
const owner = 'alice';
const id = '00000000-0000-4000-8000-000000000001';
const inputSha256 = 'b'.repeat(64);

void test('delegation input is encrypted and decrypts only with its owner-bound context', async () => {
  const encrypted = await encryptA2AInput(message, key, owner, id, inputSha256);
  assert.notEqual(encrypted.ciphertext, message);
  assert.equal(encrypted.inputSha256, inputSha256);
  assert.equal(
    await decryptA2AInput(encrypted, key, owner, id),
    message,
  );
  await assert.rejects(
    decryptA2AInput(encrypted, key, 'bob', id),
    /A2A_INPUT_DECRYPTION_FAILED/,
  );
  await assert.rejects(
    decryptA2AInput(encrypted, 'c'.repeat(64), owner, id),
    /A2A_INPUT_DECRYPTION_FAILED/,
  );
});

void test('invalid keys and intent digests fail closed', async () => {
  await assert.rejects(
    encryptA2AInput(message, 'short', owner, id, inputSha256),
    /A2A_INPUT_ENCRYPTION_KEY_INVALID/,
  );
  await assert.rejects(
    encryptA2AInput(message, key, owner, id, 'not-a-digest'),
    /A2A_INPUT_ENCRYPTION_INPUT_INVALID/,
  );
});

void test('remote result artifacts are encrypted and bound to their owner, delegation and task', async () => {
  const content = JSON.stringify({ schemaVersion: 1, artifacts: [{ textParts: ['result'] }] });
  const taskId = 'provider-task-1';
  const encrypted = await encryptA2AArtifact(content, key, owner, id, taskId);
  assert.notEqual(encrypted.ciphertext, content);
  assert.equal(
    await decryptA2AArtifact(encrypted, key, owner, id, taskId),
    content,
  );
  await assert.rejects(
    decryptA2AArtifact(encrypted, key, 'bob', id, taskId),
    /A2A_ARTIFACT_DECRYPTION_FAILED/,
  );
  await assert.rejects(
    decryptA2AArtifact(encrypted, key, owner, id, 'provider-task-2'),
    /A2A_ARTIFACT_DECRYPTION_FAILED/,
  );
  await assert.rejects(
    encryptA2AArtifact('x'.repeat(32_769), key, owner, id, taskId),
    /A2A_ARTIFACT_INPUT_INVALID/,
  );
});
