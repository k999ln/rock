import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { releaseRuntimeFixture } from './helpers/noah-release-runtime-fixture.mjs';
import { noahModelReferences } from '../lib/noah-model-references.ts';
import { NOAH_MODELS } from '../lib/noah-model-catalog.mjs';
import { createNoahWork, executionInputDigest } from '../lib/noah-execution.ts';
import { operationBinding } from '../lib/noah-operation-contract.mjs';
import { RECIPES, modelFor } from '../lib/noah-execution-contract.mjs';

void test('shared model references cover selected/pending Agents and active/unknown work and operations, scoped to owner', async (t) => {
  const f = await releaseRuntimeFixture();
  t.after(() => f.close());
  f.sqlite.exec(
    readFileSync(
      new URL('../drizzle/0038_noah_instances.sql', import.meta.url),
      'utf8',
    ),
  );
  const m = NOAH_MODELS[0].id,
    owner = 'owner-model-fixture';
  const work = (payload, user = owner) => {
    const id = randomUUID();
    f.sqlite
      .prepare(
        'INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?)',
      )
      .run(id, user, JSON.stringify(payload), 0, new Date().toISOString());
    return id;
  };
  const inst = (payload, user = owner) => {
    const id = randomUUID();
    f.sqlite
      .prepare(
        'INSERT INTO noah_instances(id,owner_id,family_key,payload,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(id, user, id, JSON.stringify(payload), 1, Date.now(), Date.now());
    return id;
  };
  const expected = [
    inst({ removed: false, active: { name: 'Selected', model: m } }),
    inst({ removed: true, pending: { pin: { name: 'Preparing', model: m } } }),
    work({ noahExecution: { model: m, state: 'running' } }),
    work({ noahExecution: { model: m, state: 'unknown' } }),
    work({ noahOperation: { binding: { model: m }, state: 'enabled' } }),
    work({
      noahOperation: { binding: { model: m }, state: 'blocked', active: {} },
    }),
  ];
  inst({ removed: true, active: { model: m } });
  inst({ removed: false, active: { model: m } }, 'other');
  work({ noahExecution: { model: m, state: 'returned' } });
  work({ noahExecution: { model: m, state: 'running' } }, 'other');
  work({
    noahOperation: { binding: { model: m }, state: 'paused', active: null },
  });
  assert.deepEqual(
    (await noahModelReferences(f.db, owner, m))
      .map((r) => r.id)
      .sort((a, b) => a.localeCompare(b)),
    expected.sort((a, b) => a.localeCompare(b)),
  );
  await assert.rejects(noahModelReferences(f.db, owner, 'arbitrary'), {
    status: 400,
  });
});
void test('new Work and operation bindings preserve verified model digest, legacy work remains readable', async () => {
  const [agentId, recipe] = Object.entries(RECIPES).find(
    ([, r]) => !r.provider && modelFor(r) === NOAH_MODELS[0].id,
  );
  const value = {
    agentId: agentId,
    recipe: recipe.key,
    version: recipe.version,
    image: 'sha256:' + 'a'.repeat(64),
    model: modelFor(recipe),
    prompt: 'A test request',
    inputSha256: await executionInputDigest(agentId, 'A test request'),
    claimSha256: 'b'.repeat(64),
  };
  const legacy = await createNoahWork(randomUUID(), value);
  assert.equal(legacy.noahExecution.modelSha256, undefined);
  const work = await createNoahWork(randomUUID(), {
    ...value,
    modelSha256: NOAH_MODELS[0].digest,
  });
  assert.equal(
    operationBinding(work.noahExecution).modelSha256,
    NOAH_MODELS[0].digest,
  );
  await assert.rejects(
    createNoahWork(randomUUID(), { ...value, modelSha256: 'c'.repeat(64) }),
  );
});
