import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { eveRuntimeSyncStore } from '../../lib/eve-runtime-sync.ts';
import { eveDeviceSyncStore } from '../../lib/eve-device-sync.ts';
import { eveHistoryStore } from '../../lib/eve-history.ts';
import { describeAdapter } from '../../lib/rockstar-adapters.ts';
import { linkedDigest } from '../../lib/rockstar-linked-execution.ts';
export function runtimeFixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  for (const f of [
    '0031_owner_workspace_schema_recovery.sql',
    '0032_eve_runtime_presence.sql',
  ])
    sql.exec(
      readFileSync(new URL('../../drizzle/' + f, import.meta.url), 'utf8'),
    );
  sql.exec(
    'CREATE TABLE rockstar_device_sessions(id TEXT PRIMARY KEY,user_id TEXT,revoked_at INTEGER,expires_at INTEGER)',
  );
  const prepare = (query, args = []) => ({
    bind(...v) {
      return prepare(query, v);
    },
    async first() {
      return sql.prepare(query).get(...args) ?? null;
    },
    async all() {
      return { results: sql.prepare(query).all(...args) };
    },
    async run() {
      return {
        meta: { changes: Number(sql.prepare(query).run(...args).changes) },
      };
    },
  });
  const db = {
    prepare,
    async batch(items) {
      sql.exec('BEGIN');
      try {
        const result = [];
        for (const item of items) result.push(await item.run());
        sql.exec('COMMIT');
        return result;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  const keys = { current: 'test', keys: { test: 'ab'.repeat(32) } };
  function addDevice(owner = 'alice') {
    const id = crypto.randomUUID();
    sql
      .prepare('INSERT INTO rockstar_device_sessions VALUES(?,?,NULL,?)')
      .run(id, owner, Date.now() + 86400000);
    return id;
  }
  const device = addDevice();
  const store = (owner = 'alice') => eveRuntimeSyncStore(db, owner, keys);
  const history = (owner = 'alice') => eveHistoryStore(db, owner, keys, true);
  const legacy = (owner = 'alice') => eveDeviceSyncStore(db, owner, keys);
  let currentPresence;
  async function announce(patch = {}) {
    const recipe = {
      name: '合成の担当',
      instructions: '下書きだけを返す',
      modelId: 'test-model',
    };
    const p = {
      schema: 'rockstaros.runtime-presence/1',
      name: '合成Mac',
      phase: 'ready',
      host: describeAdapter('test-host', 'host', 'macos', {
        'identity.owner-local': true,
        'store.cas': true,
      }),
      executor: describeAdapter('test-executor', 'executor', 'macos', {
        'text.generate': true,
        'model.pin': true,
      }),
      output: describeAdapter('test-output', 'output', 'macos', {
        'output.text': true,
      }),
      agents: [
        {
          id: crypto.randomUUID(),
          ...recipe,
          sha256: await linkedDigest(JSON.stringify(recipe)),
        },
      ],
      models: [
        {
          id: recipe.modelId,
          name: '合成モデル',
          scheme: 'ollama-manifest-sha256',
          sha256: 'cd'.repeat(32),
        },
      ],
      preparedModels: [recipe.modelId],
      ...patch,
    };
    await store().presence(p, device);
    currentPresence = p;
    return p;
  }
  async function enqueue(patch = {}) {
    const p = currentPresence ?? (await announce());
    const request = {
      id: crypto.randomUUID(),
      threadId: crypto.randomUUID(),
      deviceId: device,
      agentId: p.agents[0].id,
      agentSha256: p.agents[0].sha256,
      modelSha256: p.models[0].sha256,
      modelScheme: p.models[0].scheme,
      input: '[合成試験] ひとつの下書き',
      maxOutputTokens: 64,
      confirm: 'run-owner-local-text',
      ...patch,
    };
    await store().enqueue(request);
    return {
      request,
      entry: (await store().commands(device)).find(
        (e) => e.command.request.id === request.id,
      ),
    };
  }
  async function report(entry, patch = {}) {
    const claimId = crypto.randomUUID(),
      c = entry.command;
    await store().claim(device, {
      id: c.request.id,
      claimId,
      requestSha256: c.requestSha256,
    });
    const text = '合成の保存結果';
    return {
      schema: 'rockstaros.runtime-report/1',
      id: c.request.id,
      requestSha256: c.requestSha256,
      claimId,
      state: 'review',
      text,
      outputSha256: await linkedDigest(text),
      model: c.request.model,
      durationMs: 10,
      errorCode: null,
      ...patch,
    };
  }
  return {
    sql,
    db,
    keys,
    device,
    addDevice,
    store,
    history,
    legacy,
    announce,
    enqueue,
    report,
  };
}
