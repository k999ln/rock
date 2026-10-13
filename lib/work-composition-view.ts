import { capabilityFor, defaultCompositionConfig, parseCompositionRecipe, type CompositionPlan, type CompositionRecipeView } from './work-composition.ts';
import { catalog } from './catalog.ts';
export { compositionPayloadFingerprint, type CompositionRecipeView } from './work-composition.ts';
import { readOwnerScope } from './owner-intent.ts';
import { workId, type WorkJob, type WorkCommand } from './workflow.ts';
import { workJobConfirmsCommand } from './work-job-view.ts';

function invalid(): never { throw new Error('仕事の保存結果を確認できません。同じ操作で再確認してください。'); }

export type CompositionToolEntry = { state: 'none' } | { state: 'unavailable'; message: string } |
  { state: 'ready'; toolId: string; name: string; plan: CompositionPlan };

/** A Sky link chooses one connected catalog Tool; URLs never carry private inputs or authorization. */
export function readCompositionToolEntry(parameters: URLSearchParams): CompositionToolEntry {
  const selected = parameters.getAll('tool');
  if (selected.length === 0) return { state: 'none' };
  const capability = selected.length === 1 && catalog.some((tool) => tool.id === selected[0]) ? capabilityFor(selected[0]) : undefined;
  if (!capability?.available) return { state: 'unavailable', message: '指定されたToolはこの経路で利用できません。接続済みの処理を選択してください。' };
  const inputKind = capability.accepts.includes('text') ? 'text' : 'csv';
  return { state: 'ready', toolId: capability.id, name: capability.name,
    plan: { version: 1, objective: '', acceptance: '', inputKind, budgetMinor: 0, currency: 'JPY', deadline: '',
      nodes: [{ id: 's1', tool: capability.id, inputs: ['source'], config: defaultCompositionConfig(capability.id) },
        { id: 's2', tool: 'compose-check', inputs: ['s1'], config: defaultCompositionConfig('compose-check') }] } };
}

/** Validate owner and recipe metadata before any private draft is populated. */
export function readCompositionRecipes(value: unknown): { ownerScope: string; recipes: CompositionRecipeView[] } {
  if (!value || typeof value !== 'object') return invalid();
  const result = value as { ownerScope?: unknown; recipes?: unknown };
  const ownerScope = readOwnerScope(result.ownerScope);
  if (!ownerScope || !Array.isArray(result.recipes)) return invalid();
  try {
    const recipes = result.recipes.map((raw): CompositionRecipeView => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid();
      const item = raw as Record<string, unknown>;
      if (!Number.isSafeInteger(item.jobRevision) || Number(item.jobRevision) < 0 ||
        typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100) return invalid();
      return { id: workId(item.id), jobRevision: Number(item.jobRevision), name: item.name,
        recipe: parseCompositionRecipe(item.recipe) };
    });
    if (new Set(recipes.map((item) => item.id)).size !== recipes.length) return invalid();
    return { ownerScope, recipes };
  } catch { return invalid(); }
}

/** A structurally valid response is insufficient: it must confirm this exact pending operation. */
export function compositionResponseConfirms(job: WorkJob, payload: Record<string, unknown>, fingerprint: string): boolean {
  if (job.id !== payload.jobId || !job.composition) return false;
  if (payload.command && typeof payload.command === 'object') {
    return workJobConfirmsCommand(job, { jobId: String(payload.jobId), revision: Number(payload.revision), command: payload.command as WorkCommand });
  }
  if (payload.action === 'create' || payload.action === 'reuse_recipe') return job.composition.creationFingerprint === fingerprint;
  return typeof payload.commandId === 'string' && Number.isSafeInteger(payload.revision) && job.revision > Number(payload.revision) &&
    job.composition.operations.some((operation) => operation.id === payload.commandId && operation.fingerprint === fingerprint);
}

/** Describe only what the acknowledged operation actually persisted. */
export function compositionSaveMessage(job: WorkJob, payload: Record<string, unknown>): string {
  const command = payload.command as { action?: string } | undefined;
  if (command?.action === 'complete') return '本人の確認を保存し、仕事を完了しました。';
  if (command?.action === 'cancel') return '仕事を中止しました。保存済みの素材と成果は保持しています。';
  if (payload.action === 'clear') return 'この仕事の素材・成果と、このタブの未保存編集を削除しました。';
  if (payload.action === 'delete_recipe') return 'レシピを削除しました。仕事の素材と成果は変更していません。';
  if (payload.action === 'save_recipe') return '手順をレシピに保存しました。素材・成果・承認はレシピに含めていません。';
  if (payload.action === 'revise' && job.composition?.source !== null)
    return '計画の変更を保存しました。変更の影響を受ける成果は、新しい条件で検査してください。';
  if (job.composition?.source === null)
    return '仕事の計画を保存しました。素材はまだ保存していません。入力はこのタブで保持しています。素材・成果の保存を確認して実行してください。';
  if (payload.action === 'run') return 'この手順の素材と成果を保存しました。再読込しても保存済みの成果を開けます。';
  return '仕事を確認しました。保存済みの素材と成果は再読込しても開けます。';
}
