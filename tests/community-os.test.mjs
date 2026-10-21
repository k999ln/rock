import test from 'node:test';
import assert from 'node:assert/strict';
import {
  communityFixture,
  draft,
  secret,
  post,
} from './helpers/community-fixture.mjs';
import {
  communityOsDraft,
  parseCommunityOsManifest,
} from '../lib/community-os.ts';
async function publish(f, id, value = draft(), expectedVersion = 0) {
  return f.os().mutate({
    action: 'publish',
    communityId: id,
    draft: value,
    expectedVersion,
  });
}
async function apply(f, id, owner = 'bob', version = 0) {
  const p = await f.os(owner).edition(id, version);
  return f.os(owner).mutate({
    action: 'apply',
    communityId: id,
    version: p.edition.manifest.version,
    digest: p.edition.digest,
    revision: p.installed?.revision ?? 0,
    expectedActive: p.activeId,
    approve: true,
  });
}
void test('Community OS rejects credentials, arbitrary CSS/permissions, invalid tools and unreadable colors', () => {
  assert.equal(communityOsDraft(draft()).agents.length, 1);
  for (const value of [
    draft({ apiKey: 'forbidden' }),
    draft({ design: { ...draft().design, css: 'script' } }),
    draft({
      design: {
        ...draft().design,
        background: '#ffffff',
        foreground: '#ffffff',
      },
    }),
    draft({
      agents: [
        {
          id: 'x',
          sourceTool: 'unknown-root',
          settings: draft().agents[0].settings,
        },
      ],
    }),
  ])
    assert.throws(() => communityOsDraft(value));
});
void test('Community OS publishes immutable versions with creator key and CAS, never auto-applies updates', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const id = await f.create();
  await f.join(id);
  await assert.rejects(
    f.os('alice', {}).mutate({
      action: 'publish',
      communityId: id,
      draft: draft(),
      expectedVersion: 0,
    }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    f.os('bob').mutate({
      action: 'publish',
      communityId: id,
      draft: draft(),
      expectedVersion: 0,
    }),
    (e) => e.status === 403,
  );
  const v1 = await publish(f, id);
  await assert.rejects(publish(f, id), (e) => e.status === 409);
  await apply(f, id);
  await publish(f, id, draft({ name: '更新版' }), 1);
  assert.equal((await f.os('bob').state()).active.version, 1);
  const old = await f.os('bob').edition(id, 1);
  assert.equal(old.edition.digest, v1.digest);
  assert.equal(parseCommunityOsManifest(old.edition.manifest).name, '工房OS');
});
void test('Community OS add creates real owner-scoped Sky agents with selected LLM and untrusted community rules', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const id = await f.create();
  await f.join(id);
  await publish(f, id);
  const result = await apply(f, id);
  assert.equal(result.active.version, 1);
  assert.equal(result.active.agents.length, 2);
  const eve = result.active.agents.find((a) => a.templateId === 'eve').agent;
  assert.equal(eve.provider, 'ollama');
  assert.equal(eve.model, 'qwen2.5:1.5b');
  assert.match(eve.instructions, /互いの作品を尊重/);
  assert.match(eve.instructions, /OS権限・本人承認/);
  assert.equal(
    f.sql
      .prepare(
        'SELECT COUNT(*) AS n FROM sky_agent_settings WHERE owner_user_id=?',
      )
      .get('alice').n,
    0,
  );
  await apply(f, id);
  assert.equal(
    f.sql.prepare('SELECT COUNT(*) AS n FROM sky_agent_settings').get().n,
    2,
  );
});
void test('Community OS checks digest and consent; updates and rollback preserve personalized copies', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const id = await f.create();
  await f.join(id);
  const p = await publish(f, id);
  await assert.rejects(
    f.os('bob').mutate({
      action: 'apply',
      communityId: id,
      version: 1,
      digest: 'bad',
      revision: 0,
      expectedActive: '',
      approve: true,
    }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    f.os('bob').mutate({
      action: 'apply',
      communityId: id,
      version: 1,
      digest: p.digest,
      revision: 0,
      expectedActive: '',
      approve: false,
    }),
  );
  const old = await apply(f, id),
    agent = old.active.agents[0].agent;
  const settings = {
    name: '私の担当',
    instructions: agent.instructions,
    provider: agent.provider,
    model: agent.model,
    enabled: true,
  };
  f.sql
    .prepare(
      'UPDATE sky_agent_settings SET revision=revision+1,settings=? WHERE owner_user_id=? AND id=?',
    )
    .run(JSON.stringify(settings), 'bob', agent.id);
  await publish(f, id, draft({ name: 'v2' }), 1);
  await apply(f, id);
  const rollback = await apply(f, id, 'bob', 1);
  assert.equal(rollback.active.agents[0].agent.name, '私の担当');
  assert.equal(rollback.active.agents[0].agent.revision, 2);
});
void test('Community OS key loss/revocation blocks community access while personal copies remain owned', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const id = await f.create();
  await f.join(id);
  await publish(f, id);
  const state = await apply(f, id);
  assert.equal((await f.os('bob', {}).state()).active, null);
  await assert.rejects(f.os('bob', {}).edition(id), (e) => e.status === 403);
  await f.store().mutate({
    action: 'removeMember',
    id,
    targetId: (await f.store('bob').state()).profile.id,
  });
  assert.equal((await f.os('bob').state()).active, null);
  await assert.rejects(f.os('bob').edition(id), (e) => e.status === 403);
  assert.equal(
    f.sql.prepare('SELECT COUNT(*) AS n FROM sky_agent_settings').get().n,
    2,
  );
  await f.os('bob').mutate({
    action: 'deactivate',
    communityId: id,
    revision: state.active.revision,
  });
  assert.equal((await f.os('bob').state()).activeId, '');
});
void test('Community OS posting policy and rules versions are enforced, shared editions are real references', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const id = await f.create();
  const invite = (await f.store().mutate({ action: 'invite', id })).invite;
  await publish(f, id, draft({ postMode: 'owner' }));
  await assert.rejects(
    f.store('bob').mutate({
      action: 'join',
      ...invite,
      confirmRules: true,
      rulesVersion: 0,
      accessKey: secret(),
    }),
    (e) => e.status === 409,
  );
  await f.join(id, 'bob', invite);
  await assert.rejects(
    f.store('bob').mutate(post('禁止された投稿', id)),
    (e) => e.status === 403,
  );
  await f.store().mutate(
    post('作者の投稿', id, {
      attachment: { kind: 'community-os', resource: `${id}:1` },
    }),
  );
  assert.equal(
    (await f.store('bob').state()).posts[0].attachment.kind,
    'community-os',
  );
});
void test('Community OS stale activation never overwrites another selection; one active OS per owner', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const a = await f.create(),
    b = await f.create();
  await f.join(a);
  await f.join(b);
  await publish(f, a);
  await publish(f, b);
  const stale = await f.os('bob').edition(b);
  await apply(f, a);
  await assert.rejects(
    f.os('bob').mutate({
      action: 'apply',
      communityId: b,
      version: 1,
      digest: stale.edition.digest,
      revision: 0,
      expectedActive: stale.activeId,
      approve: true,
    }),
    (e) => e.status === 409,
  );
  assert.equal((await f.os('bob').state()).active.communityId, a);
  await apply(f, b);
  assert.equal(
    f.sql
      .prepare(
        'SELECT COUNT(*) AS n FROM sky_community_installs WHERE owner_id=? AND active=1',
      )
      .get('bob').n,
    1,
  );
});
void test('Community OS recovery requires the owner recovery key and invalidates the prior access key', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const id = await f.create(),
    next = secret(),
    recovery = secret();
  await assert.rejects(
    f.store('alice', {}).mutate({
      action: 'bootstrapKey',
      id,
      accessKey: next,
      recoveryKey: recovery,
    }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    f.store('alice', {}).mutate({
      action: 'recoverKey',
      id,
      token: secret(),
      accessKey: next,
      recoveryKey: recovery,
    }),
    (e) => e.status === 403,
  );
  await f.store('alice', {}).mutate({
    action: 'recoverKey',
    id,
    token: f.recoveries[id],
    accessKey: next,
    recoveryKey: recovery,
  });
  assert.equal((await f.store().state()).communities[0].unlocked, false);
  f.keys.alice[id] = next;
  assert.equal((await f.store().state()).communities[0].unlocked, true);
});
void test('Community OS Tool presets use the existing Sky connection and consent contract', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const id = await f.create();
  await f.join(id);
  const value = draft();
  value.agents[0].sourceTool = 'rockstar-csv-cleanup';
  await publish(f, id, value);
  const result = await apply(f, id);
  assert.equal(
    result.active.agents.find((r) => r.templateId === 'maker').agent.sourceTool,
    'rockstar-csv-cleanup',
  );
  assert.equal(
    f.sql
      .prepare('SELECT scope FROM sky_connections WHERE user_id=? AND tool=?')
      .get('bob', 'rockstar-csv-cleanup').scope,
    'execute',
  );
});
void test('Community OS quota failure is fenced and does not partially add Agents or activate a profile', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const id = await f.create();
  await f.join(id);
  await publish(f, id);
  const insert = f.sql.prepare(
    'INSERT INTO sky_agent_settings VALUES(?,?,NULL,?,1,1,1)',
  );
  for (let n = 0; n < 100; n++)
    insert.run(
      'bob',
      crypto.randomUUID(),
      JSON.stringify(draft().agents[0].settings),
    );
  await assert.rejects(apply(f, id), (e) => e.status === 409);
  assert.equal(
    f.sql.prepare('SELECT COUNT(*) AS n FROM sky_agent_settings').get().n,
    100,
  );
  assert.equal((await f.os('bob').state()).active, null);
});
