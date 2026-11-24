/**
 * 画面と API が読む、組み合わせの一覧（task 130 段 5・6 の画面）。
 * data/eve-combinations/ の組み合わせファイルを、検査・本人の番・見込みと一緒に返す。外へは通信しない。
 * 需要の台帳は、出典付きの物がたまるまで空（2026-11-24 時点）。空の間は、順位を出さずに「空」と言う。
 */

import firstCombination from '../data/eve-combinations/affiliate-ai-tools-blog.json' with { type: 'json' };
import capabilities from '../data/noah-business-capabilities.json' with { type: 'json' };
import { NOAH_BUILTIN_CAPABILITIES, NOAH_CAPABILITIES } from './noah-business.ts';
import {
  EveCombinationShapeError, defineCombination, eveCombinationProblems, eveCombinationStatus, eveStepIsOutward,
  type EveCombination, type EveCombinationStatus, type EveProblem, type EveStep,
} from './eve-combination.ts';
import { eveOwnerMinutesPerRun, eveTemplateSignatures } from './eve-combination-search.ts';
import type { EveDemand } from './eve-demand.ts';
import { eveScore, type EveOutcomeRecord } from './eve-combination-score.ts';

/** 確かめたエージェント（能力 → ref）。 */
export const EVE_VERIFIED: Readonly<Partial<Record<string, readonly string[]>>> = (capabilities as { verified: Record<string, string[]> }).verified;

/** 需要の台帳。出典付きの物だけ（eveDemandLedger を通した物）。今は空。 */
export const EVE_DEMAND_LEDGER: readonly EveDemand[] = [];

const FILES: readonly EveCombination[] = [defineCombination(firstCombination as unknown as EveCombination)];

export type EveStepView = {
  id: string;
  label: string;
  kind: EveStep['kind'];
  capability: string | null;
  capabilityLabel: string | null;
  /** auto: 部品が決まっている / glue: つなぎ目の変換 / builtin: 決まった式 / missing: 部品が無い / owner: 本人の工程 / self: 本人が自分でやる */
  part: 'agent' | 'glue' | 'builtin' | 'missing' | 'owner' | 'self';
  agent: string | null;
  outward: boolean;
  reason: string | null;
  after: readonly string[];
  costYen: number;
  problems: EveProblem[];
};

export type EveCatalogEntry = {
  id: string;
  version: number;
  title: string;
  origin: EveCombination['origin'];
  blueprint: string | null;
  author: EveCombination['author'];
  finance: boolean;
  demandId: string | null;
  status: EveCombinationStatus;
  problems: EveProblem[];
  steps: EveStepView[];
  ownerMinutesPerRun: number;
  costYenPerRun: number;
  budget: EveCombination['budget'];
  exit: EveCombination['exit'];
  counts: { steps: number; owner: number; missing: number; outward: number };
};

function viewStep(c: EveCombination, s: EveStep, problems: readonly EveProblem[]): EveStepView {
  const builtin = !!s.capability && NOAH_BUILTIN_CAPABILITIES.includes(s.capability as never);
  const part: EveStepView['part'] = c.keepForSelf.includes(s.id) ? 'self' : s.kind !== 'auto' ? 'owner' : s.glue ? 'glue' : builtin ? 'builtin' : s.agent ? 'agent' : 'missing';
  const label = s.capability && Object.hasOwn(NOAH_CAPABILITIES, s.capability) ? NOAH_CAPABILITIES[s.capability as keyof typeof NOAH_CAPABILITIES].label : s.capability === 'glue.convert' ? 'つなぎ目の変換' : null;
  return {
    id: s.id,
    label: s.label,
    kind: s.kind,
    capability: s.capability ?? null,
    capabilityLabel: label,
    part,
    agent: s.agent?.ref ?? null,
    outward: eveStepIsOutward(s),
    reason: s.reason ?? null,
    after: s.after ?? [],
    costYen: s.costYen ?? 0,
    problems: problems.filter((p) => p.step === s.id),
  };
}

export function eveCatalogEntry(c: EveCombination, ctx: { verified?: typeof EVE_VERIFIED; demand?: readonly EveDemand[] } = {}): EveCatalogEntry {
  const problems = eveCombinationProblems(c, { verified: ctx.verified ?? EVE_VERIFIED, demand: ctx.demand ?? EVE_DEMAND_LEDGER });
  const steps = c.steps.map((s) => viewStep(c, s, problems));
  return {
    id: c.id,
    version: c.version,
    title: c.title,
    origin: c.origin,
    blueprint: c.blueprint,
    author: c.author,
    finance: c.finance,
    demandId: c.demand?.id ?? null,
    status: eveCombinationStatus(problems),
    problems,
    steps,
    ownerMinutesPerRun: eveOwnerMinutesPerRun(c),
    costYenPerRun: c.steps.reduce((sum, s) => sum + (s.costYen ?? 0), 0),
    budget: c.budget,
    exit: c.exit,
    counts: {
      steps: steps.length,
      owner: steps.filter((s) => s.part === 'owner' || s.part === 'self').length,
      missing: steps.filter((s) => s.part === 'missing').length,
      outward: steps.filter((s) => s.outward).length,
    },
  };
}

/** 一覧（決まった順: 状態 → id）。 */
export function eveCombinationCatalog(): EveCatalogEntry[] {
  const order: Record<EveCombinationStatus, number> = { live: 0, paper: 1, blocked: 2 };
  return FILES.map((c) => eveCatalogEntry(c)).sort((a, b) => order[a.status] - order[b.status] || a.id.localeCompare(b.id));
}

export function eveCombinationFile(id: string): EveCombination | null {
  return FILES.find((c) => c.id === id) ?? null;
}

/** 型の「作る」部分の数（設計図 470 通り → 能力の組み合わせ何通りか）。画面の説明に使う。 */
export function eveTemplateShapeCount() {
  const sigs = eveTemplateSignatures();
  return { blueprints: sigs.length, shapes: new Set(sigs.map((s) => s.capabilities.join('+'))).size };
}

/** 確かめたエージェントの数（能力ごと）。 */
export function eveVerifiedCount() {
  return Object.values(EVE_VERIFIED).reduce((n, refs) => n + (refs?.length ?? 0), 0);
}

export const EVE_STATUS_LABEL: Readonly<Record<EveCombinationStatus, string>> = {
  live: '本番に出せる',
  paper: '試運転だけ',
  blocked: '検査で止まっている',
};

/**
 * API の中身（app/api/eve/combinations/route.ts から呼ぶ。外へ通信しない。何も保存しない）。
 * GET: 一覧か、id の 1 本。POST: check（人が書いた組み合わせを検査する）・score（記録から成績表を作る）。
 */
export function eveCombinationGet(id: string | null): { status: number; body: unknown } {
  if (id === null)
    return { status: 200, body: { combinations: eveCombinationCatalog(), demand: EVE_DEMAND_LEDGER.length, verified: eveVerifiedCount(), templates: eveTemplateShapeCount() } };
  const c = eveCombinationFile(id);
  return c ? { status: 200, body: { combination: c, entry: eveCatalogEntry(c) } } : { status: 404, body: { error: 'その組み合わせはありません。' } };
}

const MAX_RECORDS = 2_000;

export function eveCombinationPost(value: unknown): { status: number; body: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 400, body: { error: '入力を確かめてください。' } };
  const v = value as Record<string, unknown>;
  const shape = (raw: unknown) => {
    try {
      return { ok: true as const, c: defineCombination(raw as EveCombination) };
    } catch (e) {
      if (e instanceof EveCombinationShapeError) return { ok: false as const, error: { status: 400, body: { error: '組み合わせの形が違います。', path: e.path, message: e.message } } };
      return { ok: false as const, error: { status: 400, body: { error: '組み合わせの形が違います。' } } };
    }
  };
  if (v.action === 'check') {
    if (Object.keys(v).some((k) => !['action', 'combination'].includes(k))) return { status: 400, body: { error: '使えない項目があります。' } };
    const r = shape(v.combination);
    return r.ok ? { status: 200, body: { entry: eveCatalogEntry(r.c) } } : r.error;
  }
  if (v.action === 'score') {
    if (Object.keys(v).some((k) => !['action', 'id', 'combination', 'records', 'window'].includes(k))) return { status: 400, body: { error: '使えない項目があります。' } };
    const r = typeof v.id === 'string' ? (eveCombinationFile(v.id) ? { ok: true as const, c: eveCombinationFile(v.id)! } : null) : shape(v.combination);
    if (!r) return { status: 404, body: { error: 'その組み合わせはありません。' } };
    if (!r.ok) return r.error;
    if (!Array.isArray(v.records) || v.records.length > MAX_RECORDS) return { status: 400, body: { error: `記録は ${MAX_RECORDS} 件までの配列です。` } };
    const w = v.window as { from?: unknown; to?: unknown } | undefined;
    if (!w || typeof w.from !== 'string' || typeof w.to !== 'string') return { status: 400, body: { error: '期間（from・to）が要ります。' } };
    try {
      // These records came from the caller, even when their source field names a bank or an ASP.
      const preview = eveScore(r.c, v.records as EveOutcomeRecord[], { from: w.from, to: w.to });
      return { status: 200, body: { score: { ...preview, judge: null, evidence: 'caller-supplied', mode: 'preview' } } };
    } catch {
      return { status: 400, body: { error: '記録と期間を確かめてください。' } };
    }
  }
  return { status: 400, body: { error: 'action は check か score です。' } };
}
