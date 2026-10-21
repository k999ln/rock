import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createWorkJob, updateComposedWork, applyWorkCommand } from '../lib/workflow.ts';
import { compositionRecipe, suggestComposition } from '../lib/work-composition.ts';
import { readCompositionRecipes, compositionPayloadFingerprint, compositionResponseConfirms, compositionSaveMessage } from '../lib/work-composition-view.ts';

const ownerScope = `owner-v1:${'a'.repeat(64)}`;
function plan() { return { ...suggestComposition('出典を整理する', 'text'), acceptance: '出典があること' }; }
function job() { return createWorkJob({ id: randomUUID(), title: 'Fixture', templateId: 'composition', plan: plan() }); }

void test('recipe read boundary rejects malformed or private-content-bearing metadata', () => {
  const projected = { id: randomUUID(), jobRevision: 3, name: 'Recipe', recipe: compositionRecipe(plan()) };
  const read = (recipe = projected) => readCompositionRecipes({ ownerScope, recipes: [recipe] });
  assert.equal(read().recipes[0].recipe.objective, '');
  assert.equal(read().recipes[0].recipe.acceptance, '');
  assert.throws(() => read({ ...projected, recipe: { ...projected.recipe, nodes: [null] } }));
  assert.throws(() => read({ ...projected, recipe: { ...projected.recipe, inputKind: 'html' } }));
  assert.throws(() => read({ ...projected, recipe: { ...projected.recipe, objective: 'Old customer manuscript' } }));
  assert.throws(() => read({ ...projected, recipe: { ...projected.recipe, nodes: projected.recipe.nodes.map((node) => ({ ...node, config: { customer: 'secret' } })) } }));
  assert.throws(() => read({ ...projected, jobRevision: -1 }));
  assert.throws(() => readCompositionRecipes({ ownerScope: null, recipes: [projected] }));
});

void test('create readback confirms the same operation even after a later plan revision', async () => {
  const saved = job();
  const payload = { action: 'create', jobId: saved.id, plan: saved.composition.plan };
  const fingerprint = await compositionPayloadFingerprint(payload);
  saved.composition.creationFingerprint = fingerprint;
  assert.equal(compositionResponseConfirms(saved, payload, fingerprint), true);
  assert.equal(compositionResponseConfirms({ ...saved, id: randomUUID() }, payload, fingerprint), false);
  assert.equal(compositionResponseConfirms(saved, payload, 'b'.repeat(64)), false);
  const changed = updateComposedWork(saved, { id: randomUUID(), fingerprint: 'c'.repeat(64), revision: saved.revision,
    action: 'revise', plan: { ...saved.composition.plan, objective: 'New purpose' } });
  assert.equal(compositionResponseConfirms(changed, payload, fingerprint), true);
});

void test('a successful HTTP response cannot retire a missing, stale, or altered composition operation', async () => {
  const saved = job();
  const commandId = randomUUID();
  const payload = { action: 'revise', jobId: saved.id, revision: saved.revision, commandId,
    plan: { ...saved.composition.plan, objective: 'Updated' } };
  const fingerprint = await compositionPayloadFingerprint(payload);
  const updated = updateComposedWork(saved, { id: commandId, fingerprint, revision: saved.revision, action: 'revise', plan: payload.plan });
  assert.equal(compositionResponseConfirms(updated, payload, fingerprint), true);
  assert.equal(compositionResponseConfirms(saved, payload, fingerprint), false);
  assert.equal(compositionResponseConfirms(updated, { ...payload, commandId: randomUUID() }, fingerprint), false);
  assert.equal(compositionResponseConfirms(updated, payload, 'b'.repeat(64)), false);
  assert.equal(compositionResponseConfirms({ ...updated, revision: saved.revision }, payload, fingerprint), false);
});

void test('cancel readback requires the existing exact workflow command evidence', async () => {
  const saved = job();
  const command = { id: randomUUID(), action: 'cancel' };
  const payload = { jobId: saved.id, revision: saved.revision, command };
  const updated = applyWorkCommand(saved, command, saved.revision);
  assert.equal(compositionResponseConfirms(updated, payload, ''), true);
  assert.equal(compositionResponseConfirms(saved, payload, ''), false);
  assert.equal(compositionResponseConfirms(updated, { ...payload, command: { ...command, id: randomUUID() } }, ''), false);
});

void test('save notices distinguish plan-only persistence, actual results, and destructive metadata operations', () => {
  const saved = job();
  for (const action of ['create', 'reuse_recipe']) {
    const message = compositionSaveMessage(saved, { action });
    assert.match(message, /素材はまだ保存していません/);
    assert.equal(message.includes('成果を開けます'), false);
  }
  const withSource = { ...saved, composition: { ...saved.composition, source: 'Persisted fixture' } };
  assert.match(compositionSaveMessage(withSource, { action: 'run' }), /この手順の素材と成果を保存/);
  assert.match(compositionSaveMessage(withSource, { action: 'clear' }), /素材・成果.*削除/);
  assert.match(compositionSaveMessage(withSource, { action: 'delete_recipe' }), /レシピを削除/);
  assert.match(compositionSaveMessage(withSource, { action: 'save_recipe' }), /手順をレシピに保存/);
  assert.match(compositionSaveMessage(withSource, { command: { action: 'cancel' } }), /仕事を中止/);
  assert.match(compositionSaveMessage(withSource, { command: { action: 'complete' } }), /本人の確認.*完了/);
});
