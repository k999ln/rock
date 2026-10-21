import { validateGoal } from './amc-goal-engine.mjs';

// Corrections to received reference paths, never evidence of production setup.
export const skyReferencePaths = {
  'lib/db.ts': 'lib/fund-store.ts',
  'lib/schema.ts': 'db/schema.ts',
  'wrangler.jsonc': 'wrangler.local.jsonc',
};

export function validateSkyPlan(plan, goal) {
  const errors = [];
  const check = (ok, message) => { if (!ok) errors.push(message); };
  if (!plan || !Array.isArray(plan.tasks) || !Array.isArray(plan.squads) || !goal)
    return { ok: false, errors: ['Sky plan and Goal required'] };
  check(plan.schema === 'amc-sky-launch/1', 'Unknown Sky plan schema');
  check(Number.isSafeInteger(plan.revision) && plan.revision > 0, 'Invalid plan revision');
  const validation = validateGoal(goal);
  errors.push(...validation.errors);
  if (!validation.ok) return { ok: false, errors };
  check(goal.skyBrief?.goal === plan.goal && goal.instruction === plan.goal, 'Sky Goal differs from plan');
  check(!goal.requestBrief, 'Sky plan cannot use the generic request template');
  const tasks = new Map(plan.tasks.map((task) => [task.id, task]));
  const squads = new Map(plan.squads.map((squad) => [squad.id, squad]));
  check(tasks.size === plan.tasks.length && squads.size === plan.squads.length, 'Duplicate Sky IDs');
  const required = plan.tasks.filter((task) => task.requiredForLaunchReady);
  check(required.length === goal.tasks.length, 'Launch Goal coverage mismatch');
  check(squads.size === goal.squads.length, 'Squad coverage mismatch');
  for (const task of plan.tasks) {
    check(squads.has(task.squadId), `Unknown squad: ${task.id}`);
    check(Array.isArray(task.requirementIds) && task.requirementIds.includes('SKY-GOAL') &&
      task.requirementIds.includes(`SKY-${task.squadId}`) &&
      task.requirementIds.every((id) => id === 'SKY-GOAL' || squads.has(id.replace(/^SKY-/, ''))),
    `Requirement coverage missing: ${task.id}`);
    check(task.dependsOn.every((id) => tasks.has(id) && id !== task.id), `Invalid dependency: ${task.id}`);
    check(task.acceptanceCriteria.length > 0 && task.deliverables.length > 0, `Missing acceptance/output: ${task.id}`);
    const compiled = goal.tasks.find((item) => item.id === task.id);
    if (!task.requiredForLaunchReady) {
      check(!compiled, `Post-launch task in readiness Goal: ${task.id}`);
      continue;
    }
    check(compiled?.squadId === task.squadId && compiled?.scope === task.scope, `Task scope mismatch: ${task.id}`);
    check(JSON.stringify(compiled?.dependsOn) === JSON.stringify(task.dependsOn), `Task dependencies differ: ${task.id}`);
    check(JSON.stringify(compiled?.acceptanceCriteria.map((c) => [c.id, c.criterion])) ===
      JSON.stringify(task.acceptanceCriteria.map((c) => [c.id, c.criterion])), `Task acceptance differs: ${task.id}`);
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`Dependency cycle: ${id}`); return; }
    if (visited.has(id) || !tasks.has(id)) return;
    visiting.add(id);
    for (const dep of tasks.get(id).dependsOn) visit(dep);
    visiting.delete(id); visited.add(id);
  }
  for (const id of tasks.keys()) visit(id);
  for (const gate of plan.gates || [])
    check(gate.required.every((id) => tasks.has(id)), `Unknown gate task: ${gate.id}`);
  for (const decision of plan.openDecisions || [])
    check(decision.blocks.every((id) => tasks.has(id)), `Unknown decision task: ${decision.id}`);
  return { ok: errors.length === 0, errors };
}

export function prepareSkyGoal(plan, sourceGoal) {
  const result = validateSkyPlan(plan, sourceGoal);
  if (!result.ok) throw new Error(result.errors.join('; '));
  if (sourceGoal.state !== 'draft' || sourceGoal.revision !== 0 ||
      sourceGoal.tasks.some((task) => task.status !== 'pending'))
    throw new Error('The starter must remain an unaccepted draft');
  const goal = structuredClone(sourceGoal);
  goal.planningMethod = 'sky_specific_launch_plan';
  goal.skyBrief = { ...goal.skyBrief, planId: plan.id, planRevision: plan.revision };
  goal.alignmentStatus = 'manual_review_required';
  goal.requirementCatalog = [
    { id: 'SKY-GOAL', text: plan.goal },
    ...plan.squads.map((squad) => ({ id: `SKY-${squad.id}`, text: squad.goal })),
  ];
  for (const task of goal.tasks) {
    const source = plan.tasks.find((item) => item.id === task.id);
    task.requirementIds = [...source.requirementIds];
    for (const reference of source.sourceEvidence) {
      if (skyReferencePaths[reference.path] && !task.inputs.some((input) => input.path === reference.path))
        task.inputs.push({ path: reference.path, locator: '原資料で未解決だった参照先' });
    }
    task.inputs = task.inputs.map((input) => ({
      ...input,
      path: skyReferencePaths[input.path] || input.path,
      ...(skyReferencePaths[input.path] ? {
        locator: `${input.locator} / 原資料の ${input.path} を現行参照先へ訂正。配備設定はローカル用で本番証拠ではない。`,
      } : {}),
    }));
  }
  return goal;
}
