import type { NoahPlanStep, NoahPlanStepKind } from './noah-connect-plan.ts';
import type { NoahMaterial, NoahPackage } from './noah-shelf.ts';
import { NOAH_STEP_WAITS, noahBlueprintWaitProblem, noahBlueprintWithout, type NoahStep } from './noah-steps.ts';

export type NoahStepPort = { field: string; material: NoahMaterial; type: string | null };
export type NoahExplainedTool = {
  name: string;
  consumes: readonly NoahMaterial[];
  produces: NoahMaterial;
  inputs?: readonly NoahStepPort[];
  outputs?: readonly NoahStepPort[];
};

export type NoahExplanation = {
  consumes: readonly NoahMaterial[];
  produces: readonly NoahMaterial[];
  steps: readonly NoahStep[];
};

const OWNER_REASONS = {
  account: 'この Agent への接続は本人のアカウントに保存されます。',
  entitlement: 'この Agent を使うのに本人の利用権が必要です。',
  place: 'この Agent を動かせる実行先を本人が用意します。',
  model: '提供元のアカウントは本人が認証します。',
  services: '提供元へのアクセスを本人が許可します。',
  secrets: '提供元の認証鍵は本人が登録します。',
  consent: 'この Agent に任せる権限は本人が確認します。',
} satisfies Record<Exclude<NoahPlanStepKind, 'runtime'>, string>;

function ownerSteps(plan: readonly NoahPlanStep[]): NoahStep[] {
  const account = plan.findIndex((step) => step.kind === 'account' && step.state === 'needed');
  return plan.flatMap((step, index) => {
    if (step.state !== 'needed' || step.fill === 'auto' || !step.label || step.kind === 'runtime') return [];
    // These prerequisites are saved against a Noah owner. Other setup steps
    // can be prepared independently; the plan array alone does not imply a wait.
    const after = account >= 0 && ['entitlement', 'services', 'secrets', 'consent'].includes(step.kind) ? [`connect:${account}`] : [];
    const label = step.kind === 'services' && step.serviceId ? `${step.serviceId} へのアクセスを許可` : step.label;
    return [{ id: `connect:${index}`, kind: step.fill === 'tap' ? 'tap' : 'human', label,
      reason: OWNER_REASONS[step.kind], after,
      ...(after.length ? { waitNote: NOAH_STEP_WAITS.connectAccount } : {}) }];
  });
}

const GENERIC_MATERIALS = new Set<NoahMaterial>(['text', 'code', 'notes', 'topic', 'csv']);

function matchesPort(source: NoahExplainedTool, target: NoahExplainedTool, material: NoahMaterial) {
  return target.inputs?.some((input) => input.type !== null && input.material === material && source.outputs?.some((output) =>
    input.field === output.field && input.type === output.type && output.material === material)) ?? false;
}

/** Materials identify a possible dependency. Generic types and competing
 * producers need an explicit matching field before they can make a connection. */
function agentDependencies(tools: readonly NoahExplainedTool[]) {
  return tools.map((tool, index) => tool.consumes.map((material) => {
    const candidates = tools.flatMap((source, from) => from !== index && source.produces === material ? [from] : []);
    const exact = candidates.filter((from) => matchesPort(tools[from], tool, material));
    if (exact.length === 1) return { material, from: exact[0] };
    const from = !exact.length && candidates.length === 1 && !GENERIC_MATERIALS.has(material) ? candidates[0] : null;
    return { material, from };
  }));
}

/** Stable topological order. Cyclic declarations cannot describe a wait graph. */
function orderSteps(steps: readonly NoahStep[]): NoahStep[] | null {
  const pending = new Map(steps.map((step) => [step.id, step]));
  const ordered: NoahStep[] = [];
  const seen = new Set<string>();
  while (pending.size) {
    const ready = [...pending.values()].filter((step) => step.after?.every((id) => seen.has(id)) ?? true);
    if (!ready.length) return null;
    for (const step of ready) {
      pending.delete(step.id);
      seen.add(step.id);
      ordered.push(step);
    }
  }
  return ordered;
}

export function noahAgentExplanation(tools: readonly NoahExplainedTool[], plan: readonly NoahPlanStep[]): NoahExplanation | null {
  if (!tools.length || new Set(tools.map((tool) => tool.name)).size !== tools.length) return null;
  const owner = ownerSteps(plan), prerequisites = owner.map(({ id }) => id);
  const dependencies = agentDependencies(tools);
  const automatic: NoahStep[] = tools.map((tool, index) => {
    const previous = dependencies[index].flatMap(({ from }) => from === null ? [] : [`tool:${from}`]);
    return {
      id: `tool:${index}`, kind: 'auto', label: tool.name, after: [...new Set([...prerequisites, ...previous])],
      ...(previous.length ? { waitNote: NOAH_STEP_WAITS.toolMaterial }
        : prerequisites.length ? { waitNote: NOAH_STEP_WAITS.connectSetup } : {}),
    };
  });
  const ordered = orderSteps([...owner, ...automatic]);
  if (!ordered || noahBlueprintWaitProblem(ordered)) return null;
  const external = dependencies.flatMap((links) => links.flatMap(({ material, from }) => from === null ? [material] : []));
  const used = new Set(dependencies.flatMap((links) => links.map(({ from }) => from)));
  return { steps: ordered, consumes: [...new Set(external)], produces: [...new Set(tools.flatMap((tool, index) => used.has(index) ? [] : [tool.produces]))] };
}

export function noahExplanationWithConnection(flow: NoahExplanation, connected: boolean): NoahExplanation {
  if (!connected) return flow;
  const steps = noahBlueprintWithout(flow.steps, (step) => step.id.startsWith('connect:')).map((step) =>
    step.waitNote === NOAH_STEP_WAITS.connectSetup ? { ...step, waitNote: undefined } : step);
  return { ...flow, steps };
}

export function noahShelfExplanation(pkg: NoahPackage): NoahExplanation | null {
  const producers = new Map<NoahMaterial, string>();
  const steps = pkg.steps.map(({ ref, consumes, produces }, index): NoahStep => {
    const id = `package:${index}`;
    const after = [...new Set(consumes.flatMap((material) => producers.get(material) ?? []))];
    producers.set(produces, id);
    const label = ref.kind === 'family' ? ref.tool : ref.kind === 'home' ? ref.agentId
      : ref.kind === 'builtin' ? ref.toolId : ref.kind === 'owner' ? ref.label : ref.note;
    return { id, label, kind: ref.kind === 'owner' ? 'human' : 'auto', after,
      ...(ref.kind === 'owner' ? { reason: 'この工程はカードで本人の作業に指定されています。' } : {}),
      ...(after.length ? { waitNote: NOAH_STEP_WAITS.packageMaterial } : {}) };
  });
  if (!steps.length || pkg.steps.some((step) => step.ref.kind === 'gap') || noahBlueprintWaitProblem(steps)) return null;
  return { steps, consumes: pkg.have, produces: [pkg.want] };
}
