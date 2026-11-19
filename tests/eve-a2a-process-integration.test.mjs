import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID, generateKeyPairSync, sign } from 'node:crypto';
import { eveAgentFixture } from './helpers/eve-agent-fixture.mjs';
import { eveHistoryStore } from '../lib/eve-history.ts';
import { eveAgentWorkStore } from '../lib/eve-agent-work.ts';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';
import { createA2AClient } from '../lib/a2a-client.ts';
import { createA2AIntentDigests } from '../lib/a2a-authorization.ts';
import { a2aBrokerAuthorizationSigningBytes, verifyA2ABrokerAuthorization, A2A_BROKER_AUTHORIZATION_SCHEMA } from '../lib/a2a-broker-authorization.ts';
import { verifyA2AUsageReceipt } from '../lib/a2a-usage-receipt.ts';
import { normalizeA2AArtifacts } from '../lib/a2a-artifacts.ts';
import { encryptA2AInput, encryptA2AArtifact, decryptA2AArtifact } from '../lib/a2a-input-crypto.ts';
const origin = 'https://process-agent.example.com', owner = 'process-owner', inputKey = 'ab'.repeat(32);
async function setup(t, mode) {
  const f = eveAgentFixture(t), token = randomUUID();
  const child = fork(new URL('./fixtures/a2a-process-agent.mjs', import.meta.url), { execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const done = once(child, 'exit'); child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 1500);
    try { await done; } finally { clearTimeout(timeout); }
  });
  // An exited child can never deliver readiness; do not leave the suite waiting forever.
  const ready = Promise.race([once(child, 'message'), once(child, 'exit').then(([code,signal])=>{throw new Error(`Fixture Agent exited before readiness: ${code??signal}`);})]); child.send({ token });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 15000);
  let info; try { [info] = await ready; } finally { clearTimeout(timeout); }
  assert.notEqual(info.pid, process.pid);
  const base = `http://127.0.0.1:${info.port}`;
  // Test transport maps exactly one logical HTTPS origin to the child process.
  // Production URL/credential/redirect policies remain unchanged.
  const transport = (input, init) => {
    const url = new URL(input); assert.equal(url.origin, origin);
    return fetch(base + url.pathname, init);
  };
  const eve = () => eveAgentWorkStore(f.db, owner, f.keys, inputKey), agents = () => a2aDelegationStore(f.db);
  const parent = (await eve().create({ create: true, jobId: randomUUID(), threadId: randomUUID(), title: '独立プロセスAgentの合成試験' })).job;
  const id = randomUUID(), messageId = randomUUID(), deadlineAt = Date.now() + 120000;
  const message = JSON.stringify({ mode, owner, parentJobId: parent.id, delegationId: id });
  const intent = { ownerUserId: owner, id, parentJobId: parent.id, messageId, targetOrigin: origin, targetAgentName: 'process-fixture-agent', targetAgentVersion: '1.0.0',
    protocolVersion: '1.0', budgetCurrency: 'USD', budgetLimitMinor: 0, parentBudgetLimitMinor: 0, continueWhileDeviceOffline: true, deadlineAt, message };
  const digests = await createA2AIntentDigests(intent);
  const input = { ...intent, ...digests, idempotencyKey: messageId }; delete input.ownerUserId; delete input.message;
  const prepared = await agents().prepare(owner, input); assert.ok(prepared.delegation);
  const broker = generateKeyPairSync('ed25519'), now = Date.now();
  const proof = { schema: A2A_BROKER_AUTHORIZATION_SCHEMA, authorityId: 'process-fixture-broker', ownerUserId: owner, deviceRef: 'synthetic-device', delegationId: id, parentJobId: parent.id,
    messageId, targetOrigin: origin, targetAgentName: intent.targetAgentName, targetAgentVersion: '1.0.0', protocolVersion: '1.0', inputSha256: digests.inputSha256,
    budgetCurrency: 'USD', budgetLimitMinor: 0, continueWhileDeviceOffline: true, deadlineAt, authorizationSha256: digests.authorizationSha256, issuedAt: now, expiresAt: deadlineAt, keyId: 'fixture-key', signature: '' };
  proof.signature = sign(null, a2aBrokerAuthorizationSigningBytes(proof), broker.privateKey).toString('base64url');
  const brokerKey = new Uint8Array(broker.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
  const encrypted = await encryptA2AInput(message, inputKey, owner, id, digests.inputSha256);
  await agents().approve(owner, id, digests.authorizationSha256, encrypted);
  const claimed = await agents().claimDispatch(owner, id), sending = await agents().beginRemoteSend(owner, id, claimed.revision);
  const client = createA2AClient({ allowedOrigins: [origin], bearerToken: token, fetch: transport, timeoutMs: 3000, authorizeDelegation: async sent => {
    const current = await agents().get(owner, id);
    assert.equal(current.state, 'dispatch_submitting'); assert.equal(sent.inputSha256, digests.inputSha256); assert.equal(sent.messageId, messageId);
    assert.equal(await verifyA2ABrokerAuthorization(proof, { ...intent, deviceRef: 'synthetic-device' }, async () => brokerKey), true);
  } });
  const card = await client.discoverAtOrigin(origin);
  const stats = async () => (await fetch(base + '/stats', { headers: { authorization: `Bearer ${token}` } })).json();
  const acceptUsage = async task => {
    const receipt = task.metadata['org.rockstar.usageReceipt'], current = await agents().get(owner, id);
    const valid = await verifyA2AUsageReceipt(receipt, { ownerUserId: owner, parentJobId: parent.id, delegationId: id, taskId: task.id, agentOrigin: origin, agentName: intent.targetAgentName,
      agentVersion: '1.0.0', currency: 'USD', amountMinor: 0, issuedAt: receipt.issuedAt, delegationCreatedAt: current.createdAt, delegationLimitMinor: 0 }, async () => Uint8Array.from(Buffer.from(info.publicKeyHex, 'hex')));
    if (valid) await agents().settleUsageReceipt(owner, id, receipt);
    return valid;
  };
  return { ...f, eve, agents, parent, id, messageId, message, sending, client, card, stats, acceptUsage };
}
void test('independent process Agent returns an encrypted correlated artifact and a separately verified signed usage receipt', async t => {
  const f = await setup(t, 'complete'), sent = await f.client.sendMessage(f.card, f.messageId, f.message);
  assert.equal(sent.kind, 'task'); const task = sent.task;
  const row = await f.agents().recordTaskReceipt(owner, f.id, f.sending.revision, { id: task.id, state: task.status.state });
  const readback = await f.client.getTask(f.card, task.id);
  assert.equal(readback.id, task.id); assert.deepEqual(readback.artifacts, task.artifacts);
  await assert.rejects(f.agents().recordTaskReceipt(owner, f.id, f.sending.revision, { id: task.id, state: 'TASK_STATE_WORKING' }), e => e.code === 'delegation_revision_conflict');
  const document = normalizeA2AArtifacts(readback.artifacts), serialized = JSON.stringify(document);
  const encrypted = await encryptA2AArtifact(serialized, inputKey, owner, f.id, task.id);
  await f.agents().saveArtifact(owner, f.id, task.id, encrypted, new TextEncoder().encode(serialized).length);
  await f.agents().markArtifactsCaptured(owner, f.id, task.id, row.revision);
  assert.equal(await f.acceptUsage(task), true);
  const stored = (await f.agents().listArtifacts(owner, f.id))[0];
  assert.equal(await decryptA2AArtifact(stored, inputKey, owner, f.id, task.id), serialized);
  await assert.rejects(decryptA2AArtifact(stored, inputKey, 'other-owner', f.id, task.id));
  assert.ok(!stored.ciphertext.includes('独立した試験Agent'));
  assert.equal((await f.eve().command({ jobId: f.parent.id, action: 'sync' })).children[0].usage.invoiceVerified, false);
  const history = await eveHistoryStore(f.db, owner, f.keys, true).get(f.parent.eveAgent.threadId);
  assert.match(history.session.messages.at(-1).text, /独立した試験Agentの成果/);
  assert.match(history.session.messages.at(-1).text, /未検収・抜粋/);
  assert.match(history.session.messages.at(-1).text, new RegExp(stored.artifactSha256));
  assert.equal((await f.eve().command({ jobId: f.parent.id, action: 'sync' })).historySaved, true);
  const reopened = await eveHistoryStore(f.db, owner, f.keys, true).get(f.parent.eveAgent.threadId);
  assert.equal(reopened.session.messages.filter(m => m.id === `agent-work-${f.parent.id}`).length, 1);
  assert.equal(await f.agents().claimDispatch(owner, f.id), null);
  assert.equal((await f.stats()).sendCalls, 1);
  assert.equal((await f.agents().get(owner, f.id)).state, 'remote_completed');
  assert.notEqual((await f.eve().read(f.parent.id)).job.status, 'completed');
  // Sync has durably captured usage provenance; stale revisions remain rejected.
  await assert.rejects(f.eve().command({ jobId: f.parent.id, revision: f.parent.revision, commandId: randomUUID(), action: 'stop' }), e => e.status === 409);
  const latestParent = (await f.eve().read(f.parent.id)).job;
  assert.equal(latestParent.eveAgent.usageSources.length, 1);
  const stopped = await f.eve().command({ jobId: f.parent.id, revision: latestParent.revision, commandId: randomUUID(), action: 'stop' });
  const currentHistory = await eveHistoryStore(f.db, owner, f.keys, true).get(f.parent.eveAgent.threadId);
  await assert.rejects(eveHistoryStore(f.db, owner, f.keys, true).save({ session: currentHistory.session, revision: currentHistory.revision, remember: false }, { jobId: f.parent.id, revision: f.parent.revision, kind: 'agent' }), e => e.status === 409);
  assert.equal(stopped.stop.confirmed, true);
  const keyless = await eveAgentWorkStore(f.db, owner, f.keys).command({ jobId: f.parent.id, action: 'sync' });
  assert.equal(keyless.historySaved, true); assert.equal(keyless.stop.confirmed, true);
  const unavailable = await eveHistoryStore(f.db, owner, f.keys, true).get(f.parent.eveAgent.threadId);
  assert.match(unavailable.session.messages.at(-1).text, /復号鍵の復旧後/);
  assert.equal((await f.stats()).sendCalls, 1);
});
void test('independent Agent signed wrong-job and forged receipts remain unverified with budget reservation held', async t => {
  for (const mode of ['wrong-job', 'bad-signature']) {
    const f = await setup(t, mode), sent = await f.client.sendMessage(f.card, f.messageId, f.message);
    await f.agents().recordTaskReceipt(owner, f.id, f.sending.revision, { id: sent.task.id, state: sent.task.status.state });
    assert.equal(await f.acceptUsage(sent.task), false); assert.equal(await f.agents().getUsageReceipt(owner, f.id), null);
    assert.equal((await f.agents().getBudgetReservation(owner, f.id)).state, 'held'); assert.equal((await f.stats()).sendCalls, 1);
  }
});
void test('actual lost/oversized responses remain indeterminate and reopening the store cannot resubmit them', async t => {
  for (const mode of ['lost-response', 'oversized']) {
    const f = await setup(t, mode);
    await assert.rejects(f.client.sendMessage(f.card, f.messageId, f.message), e => e.code === 'a2a_request_indeterminate');
    await f.agents().markIndeterminate(owner, f.id, f.sending.revision);
    assert.equal(await f.agents().claimDispatch(owner, f.id), null); assert.equal(await f.agents().getUsageReceipt(owner, f.id), null);
    assert.equal((await f.stats()).sendCalls, 1);
  }
});
void test('Eve stop intent reaches an independent working Agent once and reconciles cancellation without reviving work', async t => {
  const f = await setup(t, 'working'), sent = await f.client.sendMessage(f.card, f.messageId, f.message);
  await f.agents().recordTaskReceipt(owner, f.id, f.sending.revision, { id: sent.task.id, state: sent.task.status.state });
  let result = await f.eve().command({ jobId: f.parent.id, revision: f.parent.revision, commandId: randomUUID(), action: 'stop' });
  assert.equal(result.stop.confirmed, false);
  const remote = await f.client.cancelTask(f.card, sent.task.id), current = await f.agents().get(owner, f.id);
  await f.agents().confirmCancelResult(owner, f.id, current.revision, remote.status.state);
  assert.equal(await f.acceptUsage(remote), true);
  result = await f.eve().command({ jobId: f.parent.id, action: 'sync' }); assert.equal(result.stop.confirmed, true); assert.equal(result.job.status, 'cancelled');
  await f.eve().command({ jobId: f.parent.id, action: 'sync' });
  assert.equal((await f.stats()).cancelCalls, 1); assert.equal((await f.stats()).sendCalls, 1);
});
