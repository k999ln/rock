import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { defaultSkyAgentSettings } from '../lib/sky-agent-library.ts';
import { skyAgentLibraryStore } from '../lib/sky-agent-library-store.ts';
import { reviewSkyAgentRequirements, parseSkyAgentRequirements } from '../lib/sky-agent-requirements.ts';
import { createSkyToolPackageDraft } from '../lib/sky-tool-package.ts';

const needs = () => ({ inputFields: ['text'], outputFields: ['count'], packageKey: 'example@1.0.0', executionTarget: 'pc' });
const manifest = () => ({ ...createSkyToolPackageDraft({ sourceKind: 'github', sourceUrl: 'https://github.com/example/tool', developerName: 'Example', developerId: 'example', license: 'MIT' }),
  io: { inputSchema: { type: 'object', properties: { text: { type: 'string' } }, additionalProperties: false },
    outputSchema: { type: 'object', properties: { count: { type: 'integer' } }, additionalProperties: false } } });
const pkg = () => ({ packageKey: 'example@1.0.0', status: 'verified', installable: true, manifest: manifest() });
const server = () => ({ id: 'fixture-server', name: 'Fixture', transport: 'stdio', state: 'connected', passport: { tools: [
  { name: 'count', inputSchema: manifest().io.inputSchema, outputSchema: manifest().io.outputSchema, pricing: { model: 'free' } },
] } });

void test('review preserves explicitly requested fields and never turns a declaration into authorization', () => {
  const review = reviewSkyAgentRequirements(needs(), [pkg()], [server()]);
  assert.equal(review.state, 'candidate');
  assert.deepEqual(review.candidates.map(x => x.toolName), ['count']);
  assert.match(review.issues[0], /本人承認/);
  assert.equal(reviewSkyAgentRequirements({ ...needs(), outputFields: ['summary'] }, [pkg()], [server()]).state, 'missing');
  assert.equal(reviewSkyAgentRequirements(needs(), [pkg()], null).state, 'unconfirmed');
  assert.equal(reviewSkyAgentRequirements(needs(), [{ ...pkg(), installable: false }], [server()]).state, 'unavailable');
  assert.equal(reviewSkyAgentRequirements(needs(), [pkg()], [{ ...server(), state: 'available' }]).state, 'unavailable');
  assert.equal(reviewSkyAgentRequirements({ ...needs(), executionTarget: 'cloud' }, [pkg()], [server()]).state, 'missing');
  assert.equal(reviewSkyAgentRequirements({ ...needs(), packageKey: '' }, [pkg()], [server()]).state, 'needs_selection');
  assert.throws(() => parseSkyAgentRequirements({ ...needs(), inputFields: ['x', 'x'] }));
  assert.throws(() => parseSkyAgentRequirements({ ...needs(), grant: true }));
});

void test('a Tool that needs additional inputs is not a match for the declared requirements', () => {
  const item = pkg();
  item.manifest.io.inputSchema = { type: 'object', properties: { text: { type: 'integer' }, secret: { type: 'string' } }, required: ['text', 'secret'] };
  item.manifest.io.outputSchema = { type: 'object', properties: { count: { type: 'string' } } };
  const result = reviewSkyAgentRequirements(needs(), [item], [server()]);
  assert.equal(result.state, 'missing');
  assert.match(result.issues.join(' '), /必須入力「secret」/);
  assert.deepEqual(result.candidates, []);
});

void test('an unknown schema is not a confirmed empty schema', () => {
  const item = pkg(); item.manifest.io = { inputSchema: {}, outputSchema: {} };
  const result = reviewSkyAgentRequirements({ ...needs(), inputFields: [], outputFields: [] }, [item], [server()]);
  assert.equal(result.state, 'unconfirmed');
  assert.deepEqual(result.candidates, []);
});

void test('owner-scoped settings persist requirements, retain them through old editors, and reject stale revision', async t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = { prepare(sql) { return { bind(...args) { return {
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
  }; } }; } };
  const owner = skyAgentLibraryStore(db, 'fixture-owner'), other = skyAgentLibraryStore(db, 'other-owner');
  const id = randomUUID(), basic = defaultSkyAgentSettings('任意の担当', '本人が選んだ仕事');
  const created = await owner.save(id, 0, { ...basic, requirements: needs() }, true);
  assert.deepEqual((await owner.get(id)).requirements, needs());
  assert.equal(await other.get(id), null);
  const editedByOldClient = await owner.save(id, created.revision, { ...basic, name: '編集済み' });
  assert.deepEqual(editedByOldClient.requirements, needs());
  await assert.rejects(owner.save(id, created.revision, { ...basic, requirements: needs() }), { status: 409 });
  await assert.rejects(other.save(id, editedByOldClient.revision, basic), { status: 404 });
  const cleared = await owner.save(id, editedByOldClient.revision, { ...basic,
    requirements: { inputFields: [], outputFields: [], packageKey: '', executionTarget: '' } });
  assert.deepEqual(cleared.requirements.inputFields, []);
});
