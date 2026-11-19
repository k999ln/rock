import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  createRockstarRuntime,
  executionDigest,
  createLinkedTextWorker,
} from './index.mjs';
import {
  openNodeExecutorJournal,
  createOllamaExecutor,
  nodeHostDescriptor,
  textOutputDescriptor,
  saveNodeHostCredentials,
  loadNodeHostCredentials,
  validateNodeUnlockPhrase,
} from './node-host.mjs';
import { parseLinkedPresence } from '../../../lib/rockstar-linked-execution.ts';
import { parseLinuxAgent } from '../../../lib/sky-linux-record.ts';
import { openHostProfile, hostAssert } from './node-profile.mjs';
import { readBoundedStream } from '../../../lib/bounded-stream.ts';

const clone = (v) => structuredClone(v);
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(
        Object.assign(Error('HOST_WAIT_CANCELLED'), {
          code: 'HOST_WAIT_CANCELLED',
        }),
      );
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
const modelId = (v) =>
  typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(v);
export async function configurationFromOllama(
  { name, model, recipe },
  { fetchImpl = fetch, driver = createOllamaExecutor({ fetchImpl }) } = {},
) {
  hostAssert(modelId(model), 'INVALID_HOST_MODEL_ID');
  const r = await fetchImpl('http://127.0.0.1:11434/api/tags', {
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  hostAssert(r.ok && r.body, 'LOCAL_MODEL_METADATA_UNAVAILABLE');
  const reader = r.body.getReader();
  let tags;
  try {
    tags = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        await readBoundedStream(reader, 200000, () =>
          Object.assign(Error('LOCAL_MODEL_METADATA_TOO_LARGE'), {
            code: 'LOCAL_MODEL_METADATA_TOO_LARGE',
          }),
        ),
      ),
    );
  } finally {
    reader.releaseLock();
  }
  hostAssert(
    Array.isArray(tags.models) && tags.models.length <= 100,
    'LOCAL_MODEL_METADATA_INVALID',
  );
  const installed = tags.models.find((m) => m.name === model);
  hostAssert(
    installed && /^[a-f0-9]{64}$/.test(installed.digest),
    'MODEL_PIN_NOT_INSTALLED',
  );
  const pin = {
    id: model,
    name: model,
    scheme: 'ollama-manifest-sha256',
    sha256: installed.digest,
  };
  await driver.describe(pin);
  const parsed = parseLinuxAgent(
    recipe ?? {
      name: 'Eve · 下書き担当',
      instructions:
        '依頼に沿って文章の下書きを作成してください。事実と提案、不明な点を区別してください。実行していない操作や確認を、完了したと書かないでください。',
      modelId: model,
    },
  );
  hostAssert(parsed.modelId === model, 'HOST_AGENT_MODEL_MISMATCH');
  const agent = {
    id: randomUUID(),
    ...parsed,
    sha256: await executionDigest(JSON.stringify(parsed)),
  };
  return validateConfiguration(
    { name, models: [pin], agents: [agent] },
    { driver },
  );
}
async function validateConfiguration(c, { driver } = {}) {
  hostAssert(
    c &&
      Object.keys(c).sort().join(',') === 'agents,models,name' &&
      typeof c.name === 'string' &&
      c.name.trim().length > 0 &&
      c.name.length <= 64 &&
      Array.from(c.name).every(
        (x) => x.codePointAt(0) >= 32 && x.codePointAt(0) !== 127,
      ) &&
      c.models?.length > 0 &&
      c.agents?.length > 0,
    'INVALID_HOST_CONFIGURATION',
  );
  const executor = driver
    ? await driver.describe(c.models[0])
    : {
        ...nodeHostDescriptor(),
        id: 'node-ollama',
        role: 'executor',
        capabilities: { 'text.generate': true, 'model.pin': true },
      };
  if (driver) for (const m of c.models.slice(1)) await driver.describe(m);
  await parseLinkedPresence(
    {
      schema: 'rockstaros.runtime-presence/1',
      ...clone(c),
      phase: 'stopped',
      host: nodeHostDescriptor(),
      executor,
      output: textOutputDescriptor(),
      preparedModels: [],
    },
    Date.now(),
  );
  return clone(c);
}
export async function prepareNodeServiceHost({
  directory,
  origin = 'https://avoado.si',
  configuration,
  driver = createOllamaExecutor(),
}) {
  // Reuse the transport's origin validator before writing a profile.
  createRockstarRuntime({ origin, getSessionToken: async () => null });
  const normalized = new URL(origin).origin;
  const c = await validateConfiguration(configuration, { driver }),
    p = await openHostProfile(directory, {
      create: { origin: normalized, configuration: c },
    });
  try {
    return {
      status: p.value.status,
      name: c.name,
      profileId: p.value.profileId,
      origin: normalized,
      modelIds: c.models.map((m) => m.id),
    };
  } finally {
    await p.close();
  }
}
export async function nodeServiceHostStatus(directory) {
  const p = await openHostProfile(directory, { readOnly: true });
  try {
    const v = p.value;
    await validateConfiguration(v.configuration);
    return {
      status: v.status,
      name: v.configuration.name,
      origin: v.origin,
      modelIds: v.configuration.models.map((m) => m.id),
      receiverState: 'not_checked',
    };
  } finally {
    await p.close();
  }
}
export async function connectNodeServiceHost({
  directory,
  unlockPhrase,
  onAuthorization,
  signal,
  runtimeFactory = createRockstarRuntime,
  pollWait = sleep,
  driver = createOllamaExecutor(),
}) {
  validateNodeUnlockPhrase(unlockPhrase);
  hostAssert(
    typeof onAuthorization === 'function',
    'OWNER_AUTHORIZATION_UI_REQUIRED',
  );
  const p = await openHostProfile(directory);
  let consumed = false,
    linked = false;
  try {
    const v = p.value;
    hostAssert(v.status === 'prepared', 'HOST_SETUP_RECONCILIATION_REQUIRED');
    await validateConfiguration(v.configuration, { driver });
    await p.commit({ ...v, status: 'pending' });
    const runtime = runtimeFactory({
      origin: v.origin,
      getSessionToken: async () => null,
    });
    const auth = await runtime.connection.begin(v.configuration.name);
    if (auth.sessionBinding !== 'owner-device/v1') {
      await p.commit({ ...v, status: 'prepared' });
      hostAssert(false, 'SERVICE_PAIRING_BINDING_UNSUPPORTED');
    }
    hostAssert(
      /^rock_device_[A-Za-z0-9_-]{43}$/.test(auth.deviceCode) &&
        /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(auth.userCode) &&
        Number.isSafeInteger(auth.expiresIn) &&
        auth.expiresIn > 0 &&
        auth.expiresIn <= 600 &&
        Number.isSafeInteger(auth.interval) &&
        auth.interval >= 5 &&
        auth.interval <= 30,
      'INVALID_AUTHORIZATION_RESPONSE',
    );
    await onAuthorization({
      name: v.configuration.name,
      userCode: auth.userCode,
      verificationUri: v.origin + '/connect/device',
      expiresIn: auth.expiresIn,
    });
    const deadline = Date.now() + auth.expiresIn * 1000;
    let delay = auth.interval * 1000;
    while (Date.now() < deadline) {
      hostAssert(!signal?.aborted, 'HOST_WAIT_CANCELLED');
      const result = await runtime.connection.poll(auth.deviceCode);
      if (
        result.status === 'authorization_pending' ||
        result.status === 'slow_down'
      ) {
        if (result.status === 'slow_down')
          delay = Math.min(delay + 5000, 30000);
        await pollWait(delay, signal);
        continue;
      }
      if (result.status === 'expired_token') {
        await p.commit({ ...v, status: 'prepared' });
        hostAssert(false, 'HOST_AUTHORIZATION_EXPIRED');
      }
      if (result.status === 'access_denied' && result.reason === 'owner_denied') {
        await p.commit({ ...v, status: 'prepared' });
        hostAssert(false, 'HOST_AUTHORIZATION_DENIED');
      }
      hostAssert(
        result.status === 'authorized',
        'HOST_AUTHORIZATION_OUTCOME_UNRESOLVED',
      );
      consumed = true;
      hostAssert(
        /^rock_session_[A-Za-z0-9_-]{43}$/.test(result.accessToken) &&
          typeof result.ownerUserId === 'string' &&
          /^[A-Za-z0-9._:-]{1,160}$/.test(result.ownerUserId) &&
          /^[a-f0-9-]{36}$/.test(result.deviceId) &&
          Number.isSafeInteger(result.expiresAt) &&
          result.expiresAt > Date.now(),
        'INVALID_AUTHORIZED_HOST_BINDING',
      );
      const credentials = {
        origin: v.origin,
        owner: result.ownerUserId,
        deviceId: result.deviceId,
        accessToken: result.accessToken,
        expiresAt: result.expiresAt,
      };
      await saveNodeHostCredentials(
        join(p.directory, 'credentials'),
        v.profileId,
        credentials,
        unlockPhrase,
      );
      const saved = await loadNodeHostCredentials(
        join(p.directory, 'credentials'),
        v.profileId,
        unlockPhrase,
      );
      hostAssert(
        JSON.stringify(saved) === JSON.stringify(credentials),
        'HOST_CREDENTIAL_READBACK_MISMATCH',
      );
      await p.commit({ ...v, status: 'linked' });
      linked = true;
      return {
        status: 'linked',
        name: v.configuration.name,
        deviceId: saved.deviceId,
        origin: v.origin,
      };
    }
    hostAssert(false, 'HOST_AUTHORIZATION_OUTCOME_UNRESOLVED');
  } catch (e) {
    if (!linked && p.value.status === 'pending')
      await p.commit({ ...p.value, status: 'uncertain' });
    if (consumed && !linked)
      throw Object.assign(Error('HOST_CREDENTIAL_SAVE_UNCONFIRMED'), {
        code: 'HOST_CREDENTIAL_SAVE_UNCONFIRMED',
      });
    throw e;
  } finally {
    await p.close();
  }
}
export async function openNodeServiceHost({
  directory,
  unlockPhrase,
  driver = createOllamaExecutor(),
  runtimeFactory = createRockstarRuntime,
}) {
  const p = await openHostProfile(directory);
  let credentials, journal;
  try {
    const v = p.value;
    hostAssert(v.status === 'linked', 'HOST_NOT_LINKED');
    await validateConfiguration(v.configuration, { driver });
    credentials = await loadNodeHostCredentials(
      join(p.directory, 'credentials'),
      v.profileId,
      unlockPhrase,
    );
    hostAssert(credentials.origin === v.origin, 'HOST_ORIGIN_BINDING_CHANGED');
    const runtime = runtimeFactory({
      origin: v.origin,
      getSessionToken: async () => credentials.accessToken,
    });
    const identity = await runtime.executions.inspect();
    hostAssert(
      identity.ownerUserId === credentials.owner &&
        identity.deviceId === credentials.deviceId,
      'SERVICE_IDENTITY_MISMATCH',
    );
    journal = await openNodeExecutorJournal(join(p.directory, 'jobs'), {
      owner: credentials.owner,
      deviceId: credentials.deviceId,
    });
    const worker = createLinkedTextWorker({
      runtime,
      owner: credentials.owner,
      deviceId: credentials.deviceId,
      journal,
      driver,
      host: () => nodeHostDescriptor(),
      output: { describe: () => textOutputDescriptor() },
    });
    let closing = false,
      active = null,
      needsAttention = false;
    const announce = async (phase) => {
      const executor = await driver.describe(v.configuration.models[0]);
      for (const pin of v.configuration.models.slice(1))
        await driver.describe(pin);
      await runtime.executions.announce({
        schema: 'rockstaros.runtime-presence/1',
        ...clone(v.configuration),
        phase,
        host: nodeHostDescriptor(),
        executor,
        output: textOutputDescriptor(),
        preparedModels:
          phase === 'ready' ? v.configuration.models.map((m) => m.id) : [],
      });
    };
    const cycle = async ({ maximumJobs = 8 } = {}) => {
      hostAssert(
        Number.isSafeInteger(maximumJobs) &&
          maximumJobs >= 1 &&
          maximumJobs <= 8,
        'INVALID_HOST_JOB_LIMIT',
      );
      hostAssert(
        !closing && !active && !needsAttention,
        'HOST_RECEIVER_BUSY_OR_CLOSING',
      );
      active = (async () => {
        await announce('ready');
        const entries = await worker.inspect(),
          results = [];
        for (const entry of entries.slice(0, maximumJobs)) {
          if (closing) break;
          await announce('ready');
          const r = await worker.run(entry);
          const reportState = r.execution?.report.state ?? null;
          results.push({
            id: entry.command.request.id,
            state: r.state,
            reportState,
            errorCode: r.errorCode ?? null,
          });
          if (r.state === 'unknown' || reportState === 'unknown') {
            needsAttention = true;
            break;
          }
          if (r.state === 'report_unknown' || r.state === 'ack_unknown') break;
        }
        return results;
      })();
      try {
        return await active;
      } finally {
        active = null;
      }
    };
    let closePromise;
    const close = () =>
      (closePromise ??= (async () => {
        closing = true;
        try {
          await active;
          await announce('stopped').catch(() => {});
        } finally {
          await journal.close();
          credentials.accessToken = '';
          await p.close();
        }
      })());
    return Object.freeze({
      name: v.configuration.name,
      deviceId: credentials.deviceId,
      cycle,
      close,
    });
  } catch (e) {
    await journal?.close();
    if (credentials) credentials.accessToken = '';
    await p.close();
    throw e;
  }
}
