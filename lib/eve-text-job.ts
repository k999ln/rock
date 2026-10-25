import { COMPOSITION_TEXT_LIMIT, parseCompositionPlan, type CompositionPlan } from './work-composition.ts';
import type { WorkJob } from './workflow.ts';

export type EveTextMaterial = { name: string; text: string };
export const EVE_TEXT_ACCEPTANCE = '2つの原文と依頼をそのまま保存する。モデル生成や完成草稿の検収ではありません。';
export const EVE_MULTI_TEXT_ACCEPTANCE = '3〜4つの原文と依頼をそのまま保存する。モデル生成や完成草稿の検収ではありません。';
/** Display routing only; this predicate never grants access or execution. */
export function isEveTextPlan(plan: CompositionPlan): boolean {
  const multi = plan.acceptance === EVE_MULTI_TEXT_ACCEPTANCE;
  return (multi || plan.acceptance === EVE_TEXT_ACCEPTANCE) && plan.inputKind === 'text' && plan.budgetMinor === 0 &&
    plan.nodes.length === 1 && plan.nodes[0].id === 's1' && plan.nodes[0].tool === 'compose-check' &&
    JSON.stringify(plan.nodes[0].inputs) === '["source"]' &&
    JSON.stringify(plan.nodes[0].config) === JSON.stringify({ minChars: 1, requiredText: [multi ? 'eve.text-preparation/2' : 'eve.text-preparation/1'] });
}
const encoder = new TextEncoder();
const invalid = (): never => { throw new Error('2〜4つのUTF-8文章（合計8,000文字以内）と500文字以内の依頼を確認してください。'); };
/** Text supports HT/LF/CR, BOM and other valid Unicode unchanged. All other
 * C0 controls (U+0000..001F), and DEL (U+007F), are refused, never stripped. */
function validText(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && !Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
  }) &&
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(encoder.encode(value)) === value;
}
function validName(value: unknown): value is string {
  return validText(value) && value.length <= 160 &&
    !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

/** Preserve BOM, CRLF and all other valid UTF-8 bytes; never decode replacement text. */
export function decodeEveTextMaterial(name: string, bytes: Uint8Array): EveTextMaterial {
  if (!validName(name) || bytes.byteLength > 48_000) return invalid();
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (!validText(text)) return invalid();
    return { name, text };
  } catch { return invalid(); }
}

/** A free preparation document, not a model prompt dispatch or an authorization. */
export function prepareEveTextJob(materials: readonly EveTextMaterial[], goal: string): Readonly<{ source: string; plan: CompositionPlan }> {
  if (!Array.isArray(materials) || (materials.length < 2 || materials.length > 4) || !validText(goal) || goal.length > 500) return invalid();
  let count = 0;
  const copies = materials.map((material) => {
    if (!material || Object.keys(material).some((key) => !['name', 'text'].includes(key)) ||
      !validName(material.name) ||
      !validText(material.text)) return invalid();
    count += material.text.length;
    return Object.freeze({ name: material.name, text: material.text });
  });
  if (count > 8_000) return invalid();
  const schema = materials.length === 2 ? 'eve.text-preparation/1' : 'eve.text-preparation/2';
  const source = JSON.stringify({ schema, materials: copies, goal });
  if (source.length > COMPOSITION_TEXT_LIMIT) return invalid();
  const plan = parseCompositionPlan({ version: 1, objective: `資料付き依頼：${goal}`, acceptance: materials.length === 2 ? EVE_TEXT_ACCEPTANCE : EVE_MULTI_TEXT_ACCEPTANCE,
    inputKind: 'text', budgetMinor: 0, currency: 'JPY', deadline: '',
    nodes: [{ id: 's1', tool: 'compose-check', inputs: ['source'], config: { minChars: 1, requiredText: [schema] } }] });
  // Match the current bounded HTTP contract even for heavily escaped material.
  if (encoder.encode(JSON.stringify({ action: 'run', jobId: '0'.repeat(36), revision: Number.MAX_SAFE_INTEGER,
    commandId: '0'.repeat(36), stepId: 's1', saveMaterial: true, source })).byteLength > 80_000) return invalid();
  for (const node of plan.nodes) { Object.freeze(node.inputs); Object.freeze(node.config.requiredText); Object.freeze(node.config); Object.freeze(node); }
  Object.freeze(plan.nodes); Object.freeze(plan);
  return Object.freeze({ source, plan });
}

export type EveEstimateSourceRef = {
  jobId: string; revision: number; sourceSha256: string; materialSha256: string[];
  builder: 'eve.text-estimate/1' | 'eve.text-estimate/2';
};
export class EveTextEstimateError extends Error {
  constructor() { super('保存した資料付き依頼を確認できません。最新の仕事を読み直してください。'); }
}
/** A saved preparation snapshot is data, never a quote, approval or execution grant. */
export async function prepareEveTextEstimate(job: WorkJob) {
  const fail = (): never => { throw new EveTextEstimateError(); };
  try {
    const state = job.composition;
    if (job.templateId !== 'composition' || !['review', 'completed'].includes(job.status) ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(job.id) || !Number.isSafeInteger(job.revision) || job.revision < 0 ||
      !state || state.materialCleared || typeof state.source !== 'string' ||
      state.source.length > COMPOSITION_TEXT_LIMIT) return fail();
    const envelope: unknown = JSON.parse(state.source);
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return fail();
    const value = envelope as Record<string, unknown>;
    if (Object.keys(value).length !== 3 || Object.keys(value).some((key) => !['schema', 'materials', 'goal'].includes(key)) ||
      !['eve.text-preparation/1', 'eve.text-preparation/2'].includes(String(value.schema)) || !Array.isArray(value.materials) || typeof value.goal !== 'string') return fail();
    const prepared = prepareEveTextJob(value.materials, value.goal);
    if (prepared.source !== state.source || JSON.stringify(prepared.plan) !== JSON.stringify(state.plan) ||
      job.steps.length !== 1 || job.steps[0].id !== 's1' || job.steps[0].runner !== 'composition' ||
      job.steps[0].tool !== 'compose-check' || !job.steps[0].passed ||
      Object.keys(state.artifacts).length !== 1 || state.artifacts.s1?.kind !== 'text' ||
      state.artifacts.s1?.status !== 'passed' || state.artifacts.s1.text !== state.source) return fail();
    const materials = value.materials as EveTextMaterial[];
    const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))),
      (byte) => byte.toString(16).padStart(2, '0')).join('');
    const builder = materials.length === 2 ? 'eve.text-estimate/1' : 'eve.text-estimate/2';
    const prompt = JSON.stringify({ schema: builder, source: { jobId: job.id, revision: job.revision },
      materials, goal: value.goal });
    const sourceRef: EveEstimateSourceRef = { jobId: job.id, revision: job.revision, sourceSha256: await hash(state.source),
      materialSha256: await Promise.all(materials.map(material => hash(material.text))), builder };
    return { prompt, sourceRef, promptDigest: await hash(prompt) };
  } catch { return fail(); }
}
