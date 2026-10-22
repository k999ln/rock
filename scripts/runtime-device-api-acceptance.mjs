// Actual local Worker/D1 contract acceptance; synthetic reports are not inference.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describeAdapter } from '../lib/rockstar-adapters.ts';
import { linkedDigest } from '../lib/rockstar-linked-execution.ts';

export async function checkRuntimeDeviceApi({ call, check, database, getDatabase, grant, bob, stop, start }) {
  const path = '/api/eve/runtime';
  const device = { path, user: null, headers: { Authorization: `Bearer ${grant.accessToken}` } };
  const recipe = { name: 'Source contract fixture', instructions: 'Return a draft only', modelId: 'fixture-gguf' };
  const agent = { id: randomUUID(), ...recipe, sha256: await linkedDigest(JSON.stringify(recipe)) };
  const model = { id: recipe.modelId, name: 'Synthetic model pin', scheme: 'gguf-sha256', sha256: 'cd'.repeat(32) };
  const presence = {
    schema: 'rockstaros.runtime-presence/1', name: 'Synthetic Pixel runtime', phase: 'ready',
    host: describeAdapter('pixel-android-account', 'host', 'android', { 'identity.owner-local': true, 'store.cas': true }),
    executor: describeAdapter('pixel-linux-gguf', 'executor', 'linux', { 'text.generate': true, 'model.pin': true }),
    output: describeAdapter('pixel-eve-text', 'output', 'android', { 'output.text': true }),
    agents: [agent], models: [model], preparedModels: [model.id],
  };
  await call('GET', undefined, { path, user: null, status: 401 });
  await call('PUT', { action: 'presence', presence }, { path, status: 403 });
  await call('PUT', { action: 'presence', presence }, { ...device, origin: 'https://attacker.invalid', status: 403 });
  await call('PUT', { action: 'presence', presence }, device);
  const identity = await call('GET', undefined, device);
  check(identity.deviceId, grant.deviceId);
  check(identity.ownerUserId, grant.ownerUserId);
  check(identity.commands, []);
  check((await call('GET', undefined, { path })).devices.length, 1);
  check((await call('GET', undefined, { path, user: bob })).devices, []);
  // The actual Native client sends both observations on the same grant.
  const legacyPath='/api/eve/device-sync', legacyDevice={...device,path:legacyPath};
  await call('PUT',{action:'presence',presence},legacyDevice);
  check((await call('GET',undefined,{path})).devices.some(d=>d.deviceId===grant.deviceId),true);
  const legacyObserved=(await call('GET',undefined,{path:legacyPath})).devices.find(d=>d.deviceId===grant.deviceId);
  check(Boolean(legacyObserved),true);
  await call('PUT',{action:'presence',presence},device);
  check((await call('GET',undefined,{path:legacyPath})).devices.find(d=>d.deviceId===grant.deviceId),legacyObserved);
  const runtimeCipher=await database.prepare('SELECT envelope,updated_at FROM eve_runtime_presence WHERE owner_id=? AND device_id=?').bind(grant.ownerUserId,grant.deviceId).first();
  check(runtimeCipher.envelope.includes(recipe.instructions),false);
  await call('PUT',{action:'presence',presence:{...presence,phase:'stopped'}},legacyDevice);
  check(await database.prepare('SELECT envelope,updated_at FROM eve_runtime_presence WHERE owner_id=? AND device_id=?').bind(grant.ownerUserId,grant.deviceId).first(),runtimeCipher);
  const legacyStopped=(await call('GET',undefined,{path:legacyPath})).devices.find(d=>d.deviceId===grant.deviceId);
  check(legacyStopped.phase,'stopped');
  const input = { id: randomUUID(), threadId: randomUUID(), deviceId: grant.deviceId,
    agentId: agent.id, agentSha256: agent.sha256, modelSha256: model.sha256, modelScheme: model.scheme,
    input: '[Synthetic] Source runtime draft', maxOutputTokens: 32, confirm: 'run-owner-local-text' };
  await call('POST', input, { ...device, status: 403 });
  await call('POST', input, { path, user: bob, status: 409 });
  await call('POST', { ...input, shell: 'forbidden' }, { path, status: 400 });
  await call('POST', input, { path });
  await call('POST', input, { path });
  check((await call('GET', undefined, { path })).pending.length, 1);
  const commands = (await call('GET', undefined, device)).commands;
  check(commands.length, 1);
  const command = commands[0].command, claim = { id: input.id, claimId: randomUUID(), requestSha256: command.requestSha256 };
  await call('PUT', { action: 'claim', claim }, device);
  await call('PUT', { action: 'claim', claim: { ...claim, claimId: randomUUID() } }, { ...device, status: 409 });
  const authorization = await call('PUT', { action: 'authorize', id: input.id, claimId: claim.claimId }, device);
  check(authorization.jobId, input.id);
  check(authorization.owner, grant.ownerUserId);
  check(authorization.requestSha256, command.requestSha256);
  check(authorization.permission, 'text.generate');
  check(authorization.maximumCostMinor, 0);
  const text = 'Synthetic result; no model was invoked';
  const report = { schema: 'rockstaros.runtime-report/1', id: input.id, requestSha256: command.requestSha256,
    claimId: claim.claimId, state: 'review', text, outputSha256: await linkedDigest(text), model: command.request.model,
    durationMs: 10, errorCode: null };
  const value = { report, revision: 0 };
  await call('PUT', { action: 'report', value }, device);
  await call('PUT', { action: 'report', value }, device);
  const read = await call('GET', undefined, { ...device, path: `${path}?id=${input.id}` });
  check(read.execution.report.text, text);
  check(read.execution.usage.cloudUsageMinor, 0);
  check(read.execution.threadId, input.threadId);
  const cipher = await database.prepare('SELECT envelope FROM eve_device_jobs WHERE job_id=?').bind(input.id).first();
  check(cipher.envelope.includes(text), false);
  check(cipher.envelope.includes(grant.accessToken), false);
  await call('GET', undefined, { path: `${path}?id=${input.id}`, user: bob, status: 404 });
  await stop(); await start();
  // Miniflare invalidates every D1 stub when the Worker is disposed.
  // Read the reopened database, rather than the closed pre-restart handle.
  database = getDatabase();
  check((await call('GET',undefined,{path:legacyPath})).devices.find(d=>d.deviceId===grant.deviceId),legacyStopped);
  check(await database.prepare('SELECT envelope,updated_at FROM eve_runtime_presence WHERE owner_id=? AND device_id=?').bind(grant.ownerUserId,grant.deviceId).first(),runtimeCipher);
  const reopened = await call('GET', undefined, { ...device, path: `${path}?id=${input.id}` });
  check(reopened.execution.report, read.execution.report);
  const history = await call('GET', undefined, { path: `/api/eve/history?id=${input.threadId}` });
  check(history.session.messages.map(message => message.text), [input.input, text]);
  await call('GET', undefined, { path: `/api/eve/history?id=${input.threadId}`, user: bob, status: 404 });
  await call('PUT', { action: 'ack', id: input.id, claimId: claim.claimId }, device);
  check((await call('GET', undefined, device)).commands, []);
  assert.equal((await call('GET', undefined, { path })).pending.length, 0);
  check((await call('GET', undefined, { path: '/api/eve/device-sync', user: null, headers: device.headers })).commands, []);
  return { id: input.id, threadId: input.threadId, report, path, device };
}
