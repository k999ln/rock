/**
 * Eve（eve.si）の組み合わせファイル（eve-combination/1）と、その検査。
 *
 * エージェントエンジニアリング（本人の定義 2026-11-24）: あるエージェントの出力を別のエージェントの入力につなぎ、
 * 最後に外部の入金の記録が出る流れを作る技術。その流れを、ここでは「組み合わせ」と呼ぶ。
 *
 * 組み合わせは、Eve が自動でも作り、人も Eve を道具にして作る（どちらも同じ形）。検査は決まった式だけで、LLM は使わない。
 * 同じ入力なら、いつも同じ結果を返す。仕様: docs/services/eve-si.md
 *
 * 検査の結果は 3 段:
 * - blocked: 形が壊れている。試運転もできない。
 * - paper:   形は正しいが、確かめていない部品・狙う需要が無いなどで、外へ出す本番には進めない。試運転だけできる。
 * - live:    本番に進める（公開・送信・送金は、それでも Broker・Wallet と本人の門を通る）。
 */

import { noahBlueprintWaitProblem, type NoahStep, type NoahStepDataLink } from './noah-steps.ts';
import { NOAH_ACCOUNTS, NOAH_BUILTIN_CAPABILITIES, type NoahBlueprint } from './noah-business.ts';
import { eveGlueProblem, eveGlueTestsPass, type EveGlueSpec } from './eve-glue.ts';

export const EVE_COMBINATION_SCHEMA = 'eve-combination/1';

/** Noah のエージェントの、決まった版の、決まった道具を指す。版の hash が変わったら、黙って新しい相手へ送らない。 */
export type EveAgentRef = { ref: string; version: string; tool: string; args?: Readonly<Record<string, string>> };

/** 工程の合格条件。Jev が機械で判定できる形だけ。 */
export type EveAcceptRule =
  | { type: 'json'; required?: readonly string[]; minItems?: number }
  | { type: 'text'; minLength?: number; maxLength?: number; mustInclude?: readonly string[] }
  | { type: 'file'; mime: readonly string[]; maxBytes?: number };

export type EveStep = NoahStep & {
  agent?: EveAgentRef;
  /** 差し替えの候補（作り直しの時に、先に試す）。 */
  fallback?: readonly EveAgentRef[];
  accept?: EveAcceptRule;
  /** つなぎ目の変換。前の工程の出力を、次の工程の入力の形に直す（lib/eve-glue.ts）。 */
  glue?: EveGlueSpec;
};

export type EveAuthor = { kind: 'eve' } | { kind: 'person'; id: string };

export type EveCombination = {
  schema: typeof EVE_COMBINATION_SCHEMA;
  id: string;
  version: number;
  title: string;
  /** 元にした稼ぎ方の設計図（lib/noah-business.ts）。型に無い組み合わせは null。 */
  blueprint: string | null;
  /** template: 型への当てはめ / discovered: 型に無い組み合わせの発見。 */
  origin: 'template' | 'discovered';
  /** 狙う需要（需要の台帳の id）と、見込みの単価。決まるまでは null（試運転だけ）。 */
  demand: { id: string; expectedPriceYen: number } | null;
  author: EveAuthor;
  finance: boolean;
  /** 本人が自分でやりたい工程の id。自動に置き換えない。 */
  keepForSelf: readonly string[];
  budget: { perRunYen: number; trialYen: number };
  steps: readonly EveStep[];
  /** お金の出口。最後に読むのは外部の記録だけ（クリックや本人の申告は数えない）。 */
  exit: { step: string; material: string; source: string; counts: 'approved-or-paid' };
};

export type EveProblemLevel = 'block' | 'paper' | 'note';
export type EveProblem = { rule: number; level: EveProblemLevel; step?: string; message: string };
export type EveCombinationStatus = 'live' | 'paper' | 'blocked';

/** 需要の台帳の 1 件のうち、検査が見る所。 */
export type EveDemandRef = { id: string; sources: readonly { url: string; checkedAt: string }[] };

export type EveCheckContext = {
  /** 能力 → その工程を実際にこなすと確かめたエージェントの ref（data/noah-business-capabilities.json の verified）。 */
  verified?: Readonly<Partial<Record<string, readonly string[]>>>;
  /** 需要の台帳。 */
  demand?: readonly EveDemandRef[];
};

/** 外へ何かを出す・送る能力。試運転では実行しない（中身の見本だけ見せる）。 */
export const EVE_OUTWARD_CAPABILITIES: readonly string[] = [
  'publish.sns', 'publish.blog', 'publish.listing', 'gig.apply', 'support.reply', 'ads.run', 'order.fulfill', 'site.host',
];

/** その工程は外へ出すか。本人が押す・入れる・確かめる工程は、外へ出す物として扱う（試運転では止める）。 */
export const eveStepIsOutward = (step: EveStep) =>
  step.kind !== 'auto' || (!!step.capability && EVE_OUTWARD_CAPABILITIES.includes(step.capability));

const ID = /^[a-z0-9][a-z0-9:._-]{0,95}$/u;
const HASH = /^[a-f0-9]{12,64}$/u;
const MAX_STEPS = 64;

// ---------------------------------------------------------------------------
// 形（defineCombination）
// ---------------------------------------------------------------------------

export class EveCombinationShapeError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.path = path;
  }
}
function need(ok: unknown, path: string, message: string): asserts ok {
  if (!ok) throw new EveCombinationShapeError(path, message);
}
const yen = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 100_000_000;
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(word => typeof word === 'string' && word.trim().length > 0);

/**
 * 組み合わせの形を確かめ、凍らせた写しを返す（人が手で書く時の入口）。形が壊れていたら投げる。
 * 中身の決まり（規則 1〜9）は eveCombinationProblems で見る。
 */
export function defineCombination(input: EveCombination): EveCombination {
  need(input && typeof input === 'object', '$', '組み合わせはオブジェクトです。');
  need(input.schema === EVE_COMBINATION_SCHEMA, 'schema', `${EVE_COMBINATION_SCHEMA} だけを受け付けます。`);
  need(typeof input.id === 'string' && ID.test(input.id), 'id', '小文字・数字・: . _ - で 96 文字までです。');
  need(Number.isSafeInteger(input.version) && input.version >= 1, 'version', '1 以上の整数です。');
  need(text(input.title, 120), 'title', '120 文字までの名前が要ります。');
  need(input.blueprint === null || (typeof input.blueprint === 'string' && ID.test(input.blueprint)), 'blueprint', '設計図の id か null です。');
  need(input.origin === 'template' || input.origin === 'discovered', 'origin', 'template か discovered です。');
  need(input.origin !== 'template' || input.blueprint !== null, 'origin', '型への当てはめ（template）は、元の設計図が要ります。');
  need(
    input.demand === null || (typeof input.demand === 'object' && ID.test(input.demand.id ?? '') && yen(input.demand.expectedPriceYen)),
    'demand', '需要の台帳の id と、見込みの単価（円）か、null です。',
  );
  need(
    input.author?.kind === 'eve' || (input.author?.kind === 'person' && text(input.author.id, 64)),
    'author', 'eve か、person と作者の id です。',
  );
  need(typeof input.finance === 'boolean', 'finance', '金融の分野か（true / false）です。');
  need(Array.isArray(input.keepForSelf) && input.keepForSelf.every((s) => typeof s === 'string'), 'keepForSelf', '工程の id の配列です。');
  need(input.budget && yen(input.budget.perRunYen) && yen(input.budget.trialYen), 'budget', '1 回の上限と試す期間の上限（円）です。');
  need(Array.isArray(input.steps) && input.steps.length >= 1 && input.steps.length <= MAX_STEPS, 'steps', `1〜${MAX_STEPS} 工程です。`);
  input.steps.forEach((s, i) => {
    const at = `steps[${i}]`;
    need(s && typeof s.id === 'string' && ID.test(s.id), `${at}.id`, '工程の id が不正です。');
    need(text(s.label, 200), `${at}.label`, '工程の名前が要ります。');
    need(['auto', 'tap', 'human', 'review'].includes(s.kind), `${at}.kind`, 'auto・tap・human・review のどれかです。');
    need(strings(s.after) && s.after.every((id: string) => ID.test(id)), `${at}.after`, '待つ工程の id の配列が要ります（無ければ []）。');
    need(s.capability === undefined || text(s.capability, 120), `${at}.capability`, '能力の名前を文字で指定してください。');
    need(s.reason === undefined || typeof s.reason === 'string', `${at}.reason`, '本人が関わる理由を文字で指定してください。');
    if (s.flow !== undefined) {
      need(s.flow && strings(s.flow.inputs) && strings(s.flow.outputs), `${at}.flow`, '工程の入力と出力を文字列の配列で指定してください。');
      need(s.flow.dataFrom === undefined || (Array.isArray(s.flow.dataFrom) && s.flow.dataFrom.every((link: NoahStepDataLink) =>
        link && typeof link.from === 'string' && ID.test(link.from) && typeof link.material === 'string' && link.material.trim())),
        `${at}.flow.dataFrom`, '受け取る工程の id と素材名が要ります。');
    }
    need(s.fallback === undefined || Array.isArray(s.fallback), `${at}.fallback`, '差し替えの候補は配列で指定してください。');
    need(s.costYen === undefined || yen(s.costYen), `${at}.costYen`, '円の整数です。');
    const refs: [string, EveAgentRef | undefined][] = [['agent', s.agent]];
    (s.fallback ?? []).forEach((f: EveAgentRef, j: number) => refs.push([`fallback[${j}]`, f]));
    for (const [k, ref] of refs) {
      if (ref === undefined) continue;
      need(ref && text(ref.ref, 200) && typeof ref.version === 'string' && text(ref.tool, 120), `${at}.${k}`, 'ref・version・tool が要ります。');
    }
  });
  const exit = input.exit;
  need(exit && typeof exit.step === 'string' && text(exit.material, 120) && text(exit.source, 200), 'exit', '出口の工程・素材・外部の記録の元が要ります。');
  need(exit.counts === 'approved-or-paid', 'exit.counts', '数えるのは承認・入金だけ（approved-or-paid）です。');
  return deepFreeze(structuredClone(input));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// 検査の規則 1〜9（docs/services/eve-si.md）
// ---------------------------------------------------------------------------

const SECRET_PATTERNS: readonly [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{16,}/u, 'API の鍵らしい文字列（sk-…）'],
  [/\bAKIA[0-9A-Z]{16}\b/u, 'AWS の鍵らしい文字列'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/u, 'GitHub の鍵らしい文字列'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/u, 'Slack の鍵らしい文字列'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/u, '秘密鍵'],
  [/(?<![\d.])(?:\d[ -]?){13,19}(?![\d.])/u, 'カード・口座の番号らしい数字の並び'],
];
const SECRET_KEYS = /^(password|passwd|pass|secret|api[_-]?key|access[_-]?token|token|card[_-]?number|account[_-]?number)$/iu;

function secretProblems(value: unknown, path = '$'): string[] {
  if (typeof value === 'string') return SECRET_PATTERNS.filter(([re]) => re.test(value)).map(([, what]) => `${path} に${what}があります。`);
  if (Array.isArray(value)) return value.flatMap((v, i) => secretProblems(v, `${path}[${i}]`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => [
      ...(SECRET_KEYS.test(k) && typeof v === 'string' && v.trim() ? [`${path}.${k} に、鍵・パスワード・番号を直接書いています。`] : []),
      ...secretProblems(v, `${path}.${k}`),
    ]);
  return [];
}

/** 工程 id → その工程が（直接・間接に）待つ工程の id の集合。 */
function ancestors(steps: readonly EveStep[]) {
  const map = new Map<string, Set<string>>();
  for (const s of steps) {
    const set = new Set<string>();
    for (const a of s.after ?? []) {
      set.add(a);
      for (const x of map.get(a) ?? []) set.add(x);
    }
    map.set(s.id, set);
  }
  return map;
}

/**
 * 組み合わせの決まりを見る。問題の一覧を、規則・工程の順で返す（同じ入力なら同じ並び）。
 * 規則は docs/services/eve-si.md の「検査の規則」と同じ番号。
 */
export function eveCombinationProblems(c: EveCombination, ctx: EveCheckContext = {}): EveProblem[] {
  const out: EveProblem[] = [];
  const add = (rule: number, level: EveProblemLevel, message: string, step?: string) => out.push({ rule, level, message, ...(step ? { step } : {}) });
  const steps = c.steps;
  const byId = new Map(steps.map((s) => [s.id, s]));

  // 1. 工程の順番と受け渡しが合っている。
  const wait = noahBlueprintWaitProblem(steps);
  if (wait) add(1, 'block', wait);

  // 2. 出口までの道に、外へ出す工程がある。成果に使われない工程は知らせる。
  const anc = wait ? new Map<string, Set<string>>() : ancestors(steps);
  const exitStep = byId.get(c.exit.step);
  if (!wait && exitStep) {
    const path = anc.get(exitStep.id) ?? new Set();
    if (![...path].some((id) => eveStepIsOutward(byId.get(id)!))) add(2, 'block', 'お金の出口までの道に、外へ出す工程（公開・出品・応募・提出）がありません。', exitStep.id);
    const waited = new Set(steps.flatMap((s) => s.after ?? []));
    for (const s of steps)
      if (!waited.has(s.id) && s.id !== exitStep.id && s.capability !== 'optimize.rules')
        add(2, 'note', '出口の工程に使われていない工程です（注文の受け渡し・問い合わせなど、回すのに要る仕事なら残してよい）。', s.id);
  }

  // 3. 最後に外部の記録を読む。狙う需要に出典がある。
  if (!exitStep) add(3, 'block', `出口の工程（${c.exit.step}）がありません。`);
  else if (exitStep.flow && !exitStep.flow.outputs.includes(c.exit.material)) add(3, 'block', `出口の工程が「${c.exit.material}」を出していません。`, exitStep.id);
  if (!c.demand) add(3, 'paper', '狙う需要（需要の台帳の id）が決まっていません。本番の前に決めます。');
  else {
    const entry = ctx.demand?.find((d) => d.id === c.demand!.id);
    if (!entry) add(3, 'paper', `需要の台帳に「${c.demand.id}」がありません。`);
    else if (!entry.sources.length) add(3, 'paper', `需要「${c.demand.id}」に出典がありません。出典の無い需要は使いません。`);
  }

  // 4. auto の工程は、確かめたエージェントか、試験に通ったつなぎ目の変換だけを使う。
  for (const s of steps) {
    if (s.kind !== 'auto' || c.keepForSelf.includes(s.id)) continue;
    if (s.glue) {
      const problem = eveGlueProblem(s.glue);
      if (problem) add(4, 'block', `つなぎ目の変換が不正です: ${problem}`, s.id);
      else if (!eveGlueTestsPass(s.glue)) add(4, 'paper', 'つなぎ目の変換が、固定テストに通っていません。', s.id);
      continue;
    }
    if (s.capability && NOAH_BUILTIN_CAPABILITIES.includes(s.capability as never)) continue;
    if (!s.capability) {
      add(4, 'paper', 'この自動工程には能力と、その能力をこなす部品が要ります。', s.id);
      continue;
    }
    const verified = ctx.verified && Object.hasOwn(ctx.verified, s.capability) ? ctx.verified[s.capability] ?? [] : [];
    if (!s.agent) add(4, 'paper', `「${s.capability}」をこなすエージェントが決まっていません。`, s.id);
    else if (!verified.includes(s.agent.ref)) add(4, 'paper', `「${s.agent.ref}」は「${s.capability}」をこなすと確かめていません。`, s.id);
  }

  // 5. 本人が関わる工程には理由がある。登録の前に規約の確認がある。
  for (const s of steps) {
    if (s.kind !== 'auto' && !s.reason?.trim()) add(5, 'block', '本人が関わる工程には、理由（画面に出す）が要ります。', s.id);
    if (s.kind === 'human' && s.id.startsWith('signup:')) {
      const rules = `rules:${s.id.slice('signup:'.length)}`;
      if (!byId.has(rules) || (!wait && !anc.get(s.id)?.has(rules))) add(5, 'block', `登録の前に「規約と登録の要件を確かめる」（${rules}）がありません。`, s.id);
    }
  }

  // 6. 金融の分野は、ノエルが確かめる工程を持つ。
  if (c.finance && !steps.some((s) => s.kind === 'review')) add(6, 'block', '金融の分野には、本人が表現を確かめる工程（review）が要ります。');

  // 7. 費用が予算の内側。
  const cost = steps.reduce((sum, s) => sum + (s.costYen ?? 0), 0);
  if (cost > c.budget.perRunYen) add(7, 'block', `1 回の費用 ${cost} 円が、上限 ${c.budget.perRunYen} 円を超えています。`);
  if (c.budget.trialYen < c.budget.perRunYen) add(7, 'block', '試す期間の上限が、1 回の上限より小さいです。');

  // 8. どのエージェントにも版の hash がある。
  for (const s of steps)
    for (const ref of [s.agent, ...(s.fallback ?? [])])
      if (ref && !HASH.test(ref.version)) add(8, 'block', `「${ref.ref}」に版の hash（16 進 12〜64 文字）がありません。`, s.id);

  // 9. 鍵・パスワード・カードや口座の番号を書かない。
  for (const message of secretProblems(c)) add(9, 'block', message);

  // 作者の決まり: 作った者は合格を出さない（合格は Jev）。ここは形だけ見る。
  if (c.keepForSelf.some((id) => !byId.has(id))) add(2, 'block', '自分でやりたい工程（keepForSelf）に、無い工程があります。');

  return out.sort((a, b) => a.rule - b.rule || (a.step ?? '').localeCompare(b.step ?? '') || a.message.localeCompare(b.message));
}

export function eveCombinationStatus(problems: readonly EveProblem[]): EveCombinationStatus {
  if (problems.some((p) => p.level === 'block')) return 'blocked';
  if (problems.some((p) => p.level === 'paper')) return 'paper';
  return 'live';
}

// ---------------------------------------------------------------------------
// 工程の合格条件（Jev が呼ぶ。作った者は呼ばない）
// ---------------------------------------------------------------------------

export function eveCheckAccept(rule: EveAcceptRule, output: unknown): { ok: boolean; reason: string } {
  if (rule.type === 'json') {
    if (output === null || typeof output !== 'object') return { ok: false, reason: 'JSON のオブジェクトか配列が返っていません。' };
    const missing = (rule.required ?? []).filter((k) => Array.isArray(output) || !Object.hasOwn(output, k));
    if (missing.length) return { ok: false, reason: `項目が足りません: ${missing.join('・')}` };
    if (rule.minItems !== undefined) {
      const list = Array.isArray(output) ? output : Object.values(output as object).find(Array.isArray);
      if (!Array.isArray(list) || list.length < rule.minItems) return { ok: false, reason: `${rule.minItems} 件以上の一覧が要ります。` };
    }
    return { ok: true, reason: '形が合っています。' };
  }
  if (rule.type === 'text') {
    if (typeof output !== 'string') return { ok: false, reason: '文章が返っていません。' };
    const n = Array.from(new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(output)).length;
    if (rule.minLength !== undefined && n < rule.minLength) return { ok: false, reason: `${rule.minLength} 文字以上が要ります（${n} 文字）。` };
    if (rule.maxLength !== undefined && n > rule.maxLength) return { ok: false, reason: `${rule.maxLength} 文字までです（${n} 文字）。` };
    const lacking = (rule.mustInclude ?? []).filter((w) => !output.includes(w));
    if (lacking.length) return { ok: false, reason: `入っているべき語がありません: ${lacking.join('・')}` };
    return { ok: true, reason: '長さと語が合っています。' };
  }
  const file = output as { mime?: unknown; bytes?: unknown } | null;
  if (!file || typeof file.mime !== 'string' || (!Number.isSafeInteger(file.bytes) || (file.bytes as number) < 0)) return { ok: false, reason: 'ファイル（mime と大きさ）が返っていません。' };
  if (!rule.mime.includes(file.mime)) return { ok: false, reason: `ファイルの種類が違います（${file.mime}）。` };
  if (rule.maxBytes !== undefined && (file.bytes as number) > rule.maxBytes) return { ok: false, reason: `大きすぎます（${file.bytes as number} バイト）。` };
  return { ok: true, reason: 'ファイルの種類と大きさが合っています。' };
}

// ---------------------------------------------------------------------------
// 稼ぎ方の設計図 → 組み合わせの骨組み（型への当てはめの出発点）
// ---------------------------------------------------------------------------

const ACCOUNT_LABEL = new Map(NOAH_ACCOUNTS.map((a) => [a.id, a.label]));
const EXIT_SOURCE: Record<NoahBlueprint['model'], string> = {
  affiliate: 'ASP の成果・承認・支払明細と、銀行の入金',
  gig: '売り場の取引・売上の記録と、銀行の入金',
  digital: '売り場の売上・支払明細と、銀行の入金',
  ads: '広告の収益の明細と、銀行の入金',
  commerce: '売り場の注文・売上・支払明細と、銀行の入金',
  app: 'App Store の売上・支払明細と、銀行の入金',
  oshi: '決済・売上・成果の明細と、銀行の入金',
};

/**
 * 設計図を、組み合わせの骨組みに変える。エージェントはまだ当てない（auto の工程は「部品が未確定」で試運転だけ）。
 * 設計図の中で、登録の前に規約の確認が無い所には、確認の工程を足す（足した工程の id を inserted に返す）。
 */
export function eveCombinationFromBlueprint(
  b: NoahBlueprint,
  opts: { author?: EveAuthor; demand?: EveCombination['demand']; budget?: EveCombination['budget'] } = {},
): { combination: EveCombination; inserted: string[] } {
  const inserted: string[] = [];
  const steps: EveStep[] = [];
  const present = new Set(b.steps.map((s) => s.id));
  for (const s of b.steps) {
    if (s.kind === 'human' && s.id.startsWith('signup:') && s.account && !present.has(`rules:${s.account}`)) {
      const rules = `rules:${s.account}`;
      steps.push({
        id: rules, label: `${ACCOUNT_LABEL.get(s.account) ?? s.account}の規約と登録の要件を確かめる`, kind: 'auto',
        capability: 'research.market', account: s.account, after: [],
        flow: { inputs: ['提供元の規約・登録要件'], outputs: ['登録要件の確認結果'] },
      });
      present.add(rules);
      inserted.push(rules);
      const flow = s.flow ?? { inputs: [], outputs: ['利用可能なアカウント'] };
      steps.push({
        ...s, after: [...(s.after ?? []), rules],
        flow: { ...flow, inputs: [...flow.inputs, '登録要件の確認結果'], dataFrom: [...(flow.dataFrom ?? []), { from: rules, material: '登録要件の確認結果' }] },
      });
      continue;
    }
    steps.push({ ...s, after: [...(s.after ?? [])] });
  }
  const last = steps[steps.length - 1];
  const combination: EveCombination = {
    schema: EVE_COMBINATION_SCHEMA,
    id: b.id.replace(/[^a-z0-9:._-]/gu, '-'),
    version: 1,
    title: b.label,
    blueprint: b.id,
    origin: 'template',
    demand: opts.demand ?? null,
    author: opts.author ?? { kind: 'eve' },
    finance: b.finance,
    keepForSelf: [],
    budget: opts.budget ?? { perRunYen: 3_000, trialYen: 3_000 },
    steps,
    exit: { step: last.id, material: last.flow?.outputs[0] ?? '入金確認', source: EXIT_SOURCE[b.model], counts: 'approved-or-paid' },
  };
  return { combination, inserted };
}
