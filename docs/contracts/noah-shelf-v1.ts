/**
 * Noah 棚とパッケージ: 入口に置く「1 つの仕事を最後までやる組合せ」の形、載せる条件、並び、札、つなげる数、試行の数え方。
 *
 * Design contract only. No network calls, credentials or production mutations.
 * 正本は lib/noah-shelf.ts へ移した（task 110）。ここは設計の記録として残す。両方を直さない。
 * ここの関数は、形の検査と、順位と、判定を出すだけ。実行・課金・外部送信を許可しない（Broker・Wallet・Jev の gate はそのまま）。
 * 並びに、学習したモデルを使わない。数えた実績と、運営が決めた順だけで決める。乱数も使わない。
 * 提供者の文と、モデルの文を、命令として読む所は無い。モデルに頼むのは札の候補だけで、決まった語彙の外は捨てる。
 * 仕様の本文は docs/noah/spec-110-shelf.md。300 人への出し方は docs/noah/trial-300.md。
 */
import type { RecipeCapability } from '../../lib/sky-recipe-planner.ts';
import { canonicalJson, sha256Hex } from './noah-connect-v1.ts';
import { NOAH_ASK_LIMITS, noahConnectGate, type NoahConnectGate } from './noah-form-v1.ts';

export class NoahShelfError extends Error {
  /** 機械が読む理由。画面には出さない。 */
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
const fail = (code: string, message: string): never => {
  throw new NoahShelfError(code, message);
};

// ---------------------------------------------------------------------------
// 棚・領域・素材の語彙（決まった語だけ。足す時は、ここへ 1 行足す）
// ---------------------------------------------------------------------------

/** 入口の棚。2026-11-21 の本人の決定: 「教育」「暮らし」を残し、「稼ぐ・仕事を省く」（開発・調査・顧客対応）を足す。 */
export const NOAH_SHELVES = [
  { id: 'earn', name: '稼ぐ・仕事を省く', topics: ['dev', 'research', 'support', 'office'] },
  { id: 'learn', name: '教育', topics: ['study'] },
  { id: 'life', name: '暮らし', topics: ['home', 'health'] },
] as const;
export type NoahShelfId = (typeof NOAH_SHELVES)[number]['id'];
export const NOAH_TOPIC_LABELS = {
  dev: '開発', research: '調査', support: '顧客対応', office: '事務・文章', study: '勉強', home: '家のこと', health: '健康',
} as const;
export type NoahTopic = keyof typeof NOAH_TOPIC_LABELS;

/**
 * 素材の型。工程が「受け取る物」と「出す物」を、この語だけで書く（lib/sky-recipe-planner.ts の素材の型と同じ形の語）。
 * 語が合う工程だけがつながる。文章の意味では、つながない。
 */
export const NOAH_MATERIALS = {
  text: '文章', csv: 'CSV', notes: 'メモ', topic: '調べたいテーマ', 'bug-report': '不具合の報告', code: 'コード', inquiry: '問い合わせ', guide: '案内・よくある質問',
  'fixed-code': '直したコード', 'cited-report': '出典つきレポート', 'reply-draft': '返信の下書き', 'cleaned-csv': '整えた CSV', 'checked-csv': '検査を通った CSV',
  'cited-text': '出典を整えた文章', article: '公開用の記事', 'checked-article': '検査を通った記事', analysis: '分析レポート', script: 'スクリプト', summary: '要点',
  quiz: '小テスト', feedback: '指摘', plan: '計画', advice: '助言',
} as const;
export type NoahMaterial = keyof typeof NOAH_MATERIALS;
const isMaterial = (value: unknown): value is NoahMaterial => typeof value === 'string' && Object.hasOwn(NOAH_MATERIALS, value);

export const NOAH_PACKAGE_LIMITS = {
  steps: 6, materials: 6, checks: 8,
  titleChars: 40, promiseChars: 80, lineChars: 60, checkChars: 80, labelChars: 40,
  /** カード 1 枚の大きさ（canonicalJson）。 */
  bytes: 8_192,
  /** 棚 1 段に置く枚数。人が見切れる数にとどめる。 */
  cardsPerShelf: 200,
};

/**
 * 運営が書くカードの文に入れない語。「仕事があって収入が得られる」と誘って負担を求める形にしない（docs/noah/trial-300.md 6 章）。
 * 見せるのは、金額ではなく、終わる仕事。売値の目安は priceHint にだけ置く。
 */
export const NOAH_PROMISE_BLOCKLIST = ['稼げ', '儲か', '月収', '副収入', '収入が得られ', '収入保証', '元が取れ'] as const;

// ---------------------------------------------------------------------------
// パッケージ（カード 1 枚 = 1 つの仕事を最後までやる組合せ）
// ---------------------------------------------------------------------------

/**
 * 工程の先。
 * family: 取り込んだ系列（相手のサーバー）の、道具 1 つ。home: 家の端末の固定 adapter（lib/noah-execution-contract.mjs の RECIPES）。
 * builtin: Noah の中の道具（lib/work-composition.ts で available の物）。owner: 本人がやる工程（自動にしない）。
 * gap: まだ先が決まっていない工程（下書きにだけ置ける。運営が、動かして確かめた先に置き換える）。
 */
export type NoahStepRef =
  | { kind: 'family'; familyId: string; tool: string }
  | { kind: 'home'; agentId: string }
  | { kind: 'builtin'; toolId: string }
  | { kind: 'owner'; label: string }
  | { kind: 'gap'; note: string };
export type NoahPackageStep = {
  ref: NoahStepRef;
  /** 受け取る物。手元の素材か、前の工程が出した物。 */
  consumes: NoahMaterial[];
  /** 出す物。 */
  produces: NoahMaterial;
  /** この工程で本人が使う分数（入力・確かめ・本人の作業）。 */
  ownerMinutes: number;
};
/** 合格条件。Jev が真偽で判定できる物だけを書く。rule は文字の検査で決まる物、jev は読んで判定する物。 */
export type NoahPackageCheck = { id: string; text: string; judge: 'rule' | 'jev' };
export type NoahPackage = {
  schema: 'noah-package/1';
  /** 'pkg:<英小文字・数字・ハイフン>'。 */
  id: string;
  shelf: NoahShelfId;
  topic: NoahTopic;
  /** 仕事の名前。運営の言葉（提供者の説明とは分けて出す）。 */
  title: string;
  /** 何が終わるか・何が浮くかの 1 行。運営の言葉。金額を約束しない。 */
  promise: string;
  /** 本人が渡す物（画面に出す 1 行）。 */
  give: string;
  /** 本人が受け取る物（画面に出す 1 行）。 */
  get: string;
  have: NoahMaterial[];
  want: NoahMaterial;
  steps: NoahPackageStep[];
  checks: NoahPackageCheck[];
  /** 「稼ぐ・仕事を省く」の棚だけ。売れる型の最低額（lib/sky-gig-offers.ts）。約束ではなく、先行例の値。 */
  priceHint?: { offerId: string; floorYen: number };
  /** 助言を含むカード。今は健康だけ。 */
  advice?: 'health';
  /** 運営が決めた並び。小さいほど上。 */
  position: number;
  status: 'draft' | 'verified' | 'retired';
  /** 運営が自分で動かして、成果を確かめた記録。fingerprints は、その時の工程の中身（工程と同じ数・同じ順）。 */
  verified?: { at: number; runs: number; fingerprints: string[] };
  /** 専門家に確かめた日。助言を含むカードは、これが無い間は載せない。 */
  review?: { expertAt: number };
  revision: number;
};

const HEX64 = /^[0-9a-f]{64}$/u;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/u;
/** 文字の数（code point で数える。日本語の 1 文字が 1）。 */
const chars = (value: string) => Array.from(value).length;
/** 改行・タブ・制御文字（U+0000〜U+001F と U+007F）。 */
const hasControl = (value: string) => Array.from(value).some((ch) => (ch.codePointAt(0) ?? 0) < 0x20 || ch === '\u007f');

function record(value: unknown, keys: readonly string[], code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, '形が違います。');
  const o = value as Record<string, unknown>;
  const extra = Object.keys(o).find((key) => !keys.includes(key));
  if (extra !== undefined) fail(code, `知らない項目があります: ${extra}`);
  return o;
}
function line(value: unknown, code: string, name: string, max: number): string {
  // 改行・制御文字を入れない。前後の空白も入れない（同じ文が別の hash にならないように）。
  if (typeof value !== 'string' || value !== value.trim() || chars(value) < 1 || chars(value) > max || hasControl(value)) {
    return fail(code, `${name}は、1 行・${max} 文字以内で書いてください。`);
  }
  return value;
}
function integer(value: unknown, code: string, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) return fail(code, `${name}は、${min} 以上 ${max} 以下の整数です。`);
  return value;
}
function materials(value: unknown, code: string, name: string): NoahMaterial[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > NOAH_PACKAGE_LIMITS.materials || new Set(value).size !== value.length || !value.every(isMaterial)) {
    return fail(code, `${name}は、決まった素材の型を 1〜${NOAH_PACKAGE_LIMITS.materials} 個、重ねずに書いてください。`);
  }
  return [...value];
}

function parseRef(value: unknown): NoahStepRef {
  const o = record(value, ['kind', 'familyId', 'tool', 'agentId', 'toolId', 'label', 'note'], 'ref');
  const only = (keys: string[]) => {
    if (Object.keys(o).some((key) => key !== 'kind' && !keys.includes(key))) fail('ref', '工程の先に、その種類では使わない項目があります。');
  };
  if (o.kind === 'family') {
    only(['familyId', 'tool']);
    const familyId = line(o.familyId, 'ref', '系列の ID', 400);
    if (chars(familyId) < 3) fail('ref', '系列の ID が短すぎます。');
    return { kind: 'family', familyId, tool: line(o.tool, 'ref', '道具の名前', 128) };
  }
  if (o.kind === 'home') {
    only(['agentId']);
    if (typeof o.agentId !== 'string' || !SLUG.test(o.agentId)) fail('ref', '家の端末の Agent の ID が違います。');
    return { kind: 'home', agentId: o.agentId as string };
  }
  if (o.kind === 'builtin') {
    only(['toolId']);
    if (typeof o.toolId !== 'string' || !SLUG.test(o.toolId)) fail('ref', 'Noah の中の道具の ID が違います。');
    return { kind: 'builtin', toolId: o.toolId as string };
  }
  if (o.kind === 'owner') {
    only(['label']);
    return { kind: 'owner', label: line(o.label, 'ref', '本人の工程の名前', NOAH_PACKAGE_LIMITS.labelChars) };
  }
  if (o.kind === 'gap') {
    only(['note']);
    return { kind: 'gap', note: line(o.note, 'ref', '足りない物の説明', NOAH_PACKAGE_LIMITS.lineChars) };
  }
  return fail('ref', '工程の先の種類が違います。');
}

/** 工程の型がつながっているか。つながっていなければ、理由の文。 */
export function noahPackageChainProblem(have: readonly NoahMaterial[], want: NoahMaterial, steps: readonly Pick<NoahPackageStep, 'consumes' | 'produces'>[]): string | null {
  const ready = new Set<NoahMaterial>(have);
  for (const [index, step] of steps.entries()) {
    const missing = step.consumes.find((item) => !ready.has(item));
    if (missing) return `工程 ${index + 1} が受け取る「${NOAH_MATERIALS[missing]}」を、手元にも前の工程にも持っていません。`;
    if (ready.has(step.produces)) return `工程 ${index + 1} が出す「${NOAH_MATERIALS[step.produces]}」は、もうあります。`;
    ready.add(step.produces);
  }
  if (steps.at(-1)?.produces !== want) return '最後の工程が、欲しい成果を出していません。';
  // 成果に使われない工程を置かない（lib/sky-recipe-planner.ts と同じ決まり）。
  const needed = new Set<NoahMaterial>([want]);
  for (const step of [...steps].reverse()) {
    if (!needed.has(step.produces)) return `「${NOAH_MATERIALS[step.produces]}」を出す工程は、成果に使われていません。`;
    for (const item of step.consumes) needed.add(item);
  }
  return null;
}

/**
 * 助言を含むカードに必ず入れる合格条件。2026-11-21 の本人の決定（健康は助言まで踏み込む。条件は、出典・診断と薬の指示をしない・受診を促す）。
 * rule の 2 つは noahAdviceRuleChecks が判定する。jev の 1 つは、読んで判定する。
 */
export const NOAH_HEALTH_CHECKS: readonly NoahPackageCheck[] = [
  { id: 'cites-sources', text: '出典が 1 つ以上ある', judge: 'rule' },
  { id: 'no-diagnosis-or-medication', text: '診断と、薬の指示をしていない', judge: 'jev' },
  { id: 'urgent-care-notice', text: '強い症状・急な症状は医療機関へ、の注意がある', judge: 'rule' },
];
/** 助言の成果の最後に、Noah が必ず足す文（運営の決まった文。提供者の文でもモデルの文でもない）。 */
export const NOAH_HEALTH_NOTICE = '一般的な情報です。診断や、薬の指示はしません。強い症状や急な症状がある時は、医療機関に相談してください。';

/** 20 個の規則（docs/noah/spec-110-shelf.md 3.2）。違反は NoahShelfError（code は規則の名前）。通った物は、項目をそろえた新しい object。 */
export function parseNoahPackage(input: unknown): NoahPackage {
  const o = record(input, ['schema', 'id', 'shelf', 'topic', 'title', 'promise', 'give', 'get', 'have', 'want', 'steps', 'checks', 'priceHint', 'advice', 'position', 'status', 'verified', 'review', 'revision'], 'shape');
  if (o.schema !== 'noah-package/1') fail('schema', 'schema は noah-package/1 です。');
  if (typeof o.id !== 'string' || !/^pkg:[a-z0-9][a-z0-9-]{1,62}$/u.test(o.id)) fail('id', 'ID は pkg: に、英小文字・数字・ハイフンを続けます。');
  const shelf = NOAH_SHELVES.find((item) => item.id === o.shelf);
  if (!shelf) return fail('shelf', '棚が違います。');
  if (typeof o.topic !== 'string' || !(shelf.topics as readonly string[]).includes(o.topic)) fail('topic', 'その棚には無い領域です。');
  const topic = o.topic as NoahTopic;
  const title = line(o.title, 'text', '名前', NOAH_PACKAGE_LIMITS.titleChars);
  const promise = line(o.promise, 'text', '1 行の説明', NOAH_PACKAGE_LIMITS.promiseChars);
  const give = line(o.give, 'text', '渡す物', NOAH_PACKAGE_LIMITS.lineChars);
  const get = line(o.get, 'text', '受け取る物', NOAH_PACKAGE_LIMITS.lineChars);
  const lured = NOAH_PROMISE_BLOCKLIST.find((word) => [title, promise, give, get].some((text) => text.includes(word)));
  if (lured) fail('promise', `カードの文に「${lured}」を書きません。終わる仕事を書いてください。`);

  const have = materials(o.have, 'materials', '手元の素材');
  if (!isMaterial(o.want) || have.includes(o.want)) return fail('materials', '欲しい成果は、決まった素材の型で、手元に無い物にしてください。');
  const want = o.want;

  if (!Array.isArray(o.steps) || o.steps.length < 1 || o.steps.length > NOAH_PACKAGE_LIMITS.steps) fail('steps', `工程は 1〜${NOAH_PACKAGE_LIMITS.steps} 個です。`);
  const steps = (o.steps as unknown[]).map((raw): NoahPackageStep => {
    const s = record(raw, ['ref', 'consumes', 'produces', 'ownerMinutes'], 'steps');
    const ref = parseRef(s.ref);
    const consumes = materials(s.consumes, 'steps', '工程が受け取る物');
    if (!isMaterial(s.produces) || consumes.includes(s.produces)) return fail('steps', '工程が出す物は、決まった素材の型で、受け取る物と別にしてください。');
    // 本人の工程は 1 分以上。自動の工程で本人が使うのは、入力と確かめの分だけ。
    const ownerMinutes = ref.kind === 'owner' ? integer(s.ownerMinutes, 'steps', '本人の工程の分数', 1, 600) : integer(s.ownerMinutes, 'steps', '本人が使う分数', 0, 60);
    return { ref, consumes, produces: s.produces, ownerMinutes };
  });
  if (!steps.some((step) => step.ref.kind !== 'owner')) fail('steps', '本人の工程だけのカードは作りません。');
  const broken = noahPackageChainProblem(have, want, steps);
  if (broken) fail('chain', broken);

  if (!Array.isArray(o.checks) || o.checks.length < 1 || o.checks.length > NOAH_PACKAGE_LIMITS.checks) fail('checks', `合格条件は 1〜${NOAH_PACKAGE_LIMITS.checks} 個です。合格条件が書けないカードは作りません。`);
  const checks = (o.checks as unknown[]).map((raw): NoahPackageCheck => {
    const c = record(raw, ['id', 'text', 'judge'], 'checks');
    if (typeof c.id !== 'string' || !/^[a-z][a-z0-9-]{1,39}$/u.test(c.id)) fail('checks', '合格条件の ID が違います。');
    if (c.judge !== 'rule' && c.judge !== 'jev') fail('checks', '合格条件の判定の仕方は rule か jev です。');
    return { id: c.id as string, text: line(c.text, 'checks', '合格条件', NOAH_PACKAGE_LIMITS.checkChars), judge: c.judge as 'rule' | 'jev' };
  });
  if (new Set(checks.map((check) => check.id)).size !== checks.length) fail('checks', '合格条件の ID が重なっています。');

  let priceHint: NoahPackage['priceHint'];
  if (o.priceHint !== undefined) {
    if (shelf.id !== 'earn') fail('price', '売値の目安を置けるのは、「稼ぐ・仕事を省く」の棚だけです。');
    const p = record(o.priceHint, ['offerId', 'floorYen'], 'price');
    if (typeof p.offerId !== 'string' || !SLUG.test(p.offerId)) fail('price', '売れる型の ID が違います。');
    priceHint = { offerId: p.offerId as string, floorYen: integer(p.floorYen, 'price', '売値の目安', 100, 1_000_000) };
  }

  let advice: NoahPackage['advice'];
  if (o.advice !== undefined) {
    if (o.advice !== 'health' || topic !== 'health') fail('advice', '助言を含むと書けるのは、今は健康の領域だけです。');
    advice = 'health';
    for (const need of NOAH_HEALTH_CHECKS) {
      const found = checks.find((check) => check.id === need.id);
      if (!found || found.judge !== need.judge) fail('advice', `健康の助言には、合格条件「${need.text}」が要ります。`);
    }
  }

  const position = integer(o.position, 'position', '並び', 0, 9_999);
  if (o.status !== 'draft' && o.status !== 'verified' && o.status !== 'retired') return fail('status', '状態は draft・verified・retired のどれかです。');
  const status = o.status;
  let verified: NoahPackage['verified'];
  if (o.verified !== undefined) {
    const v = record(o.verified, ['at', 'runs', 'fingerprints'], 'verified');
    if (!Array.isArray(v.fingerprints) || v.fingerprints.length !== steps.length) fail('verified', '確かめた時の中身は、工程と同じ数だけ書きます。');
    const fingerprints = (v.fingerprints as unknown[]).map((value, index) => {
      const owner = steps[index].ref.kind === 'owner';
      if (typeof value !== 'string' || (owner ? value !== 'owner' : !HEX64.test(value))) return fail('verified', '確かめた時の中身は、sha256 の hex 64 桁です（本人の工程は owner）。');
      return value;
    });
    verified = { at: integer(v.at, 'verified', '確かめた時刻', 1, Number.MAX_SAFE_INTEGER), runs: integer(v.runs, 'verified', '動かした回数', 1, 10_000), fingerprints };
  }
  if ((status === 'verified') !== (verified !== undefined)) fail('verified', '確かめた記録は、状態が verified の時にだけ、必ず置きます。');
  if (status !== 'draft' && steps.some((step) => step.ref.kind === 'gap')) fail('verified', '先が決まっていない工程があるカードは、下書きのままにします。');

  let review: NoahPackage['review'];
  if (o.review !== undefined) {
    const r = record(o.review, ['expertAt'], 'review');
    review = { expertAt: integer(r.expertAt, 'review', '専門家に確かめた時刻', 1, Number.MAX_SAFE_INTEGER) };
  }
  const revision = integer(o.revision, 'revision', '版', 1, Number.MAX_SAFE_INTEGER);

  const out: NoahPackage = {
    schema: 'noah-package/1', id: o.id as string, shelf: shelf.id, topic, title, promise, give, get, have, want, steps, checks,
    ...(priceHint ? { priceHint } : {}), ...(advice ? { advice } : {}), position, status, ...(verified ? { verified } : {}), ...(review ? { review } : {}), revision,
  };
  if (new TextEncoder().encode(canonicalJson(out)).byteLength > NOAH_PACKAGE_LIMITS.bytes) fail('size', `カード 1 枚は ${NOAH_PACKAGE_LIMITS.bytes} bytes までです。`);
  return out;
}
export const noahPackageSha256 = (pkg: NoahPackage) => sha256Hex(canonicalJson(pkg));

/** カードの工程を、表（noah_package_steps）の行にする。系列が変わった時にカードを引く・実績を数える、のための写し。 */
export function noahPackageStepRows(pkg: NoahPackage): { package_id: string; step: number; kind: NoahStepRef['kind']; ref: string; tool: string | null }[] {
  return pkg.steps.map((step, index) => {
    const ref = step.ref;
    const target = ref.kind === 'family' ? ref.familyId : ref.kind === 'home' ? ref.agentId : ref.kind === 'builtin' ? ref.toolId : '';
    return { package_id: pkg.id, step: index, kind: ref.kind, ref: target, tool: ref.kind === 'family' ? ref.tool : null };
  });
}

// ---------------------------------------------------------------------------
// 載せる条件（「今動かせる物だけ」）
// ---------------------------------------------------------------------------

export const NOAH_PACKAGE_REASONS = [
  'retired',            // 運営が外した
  'draft',              // 運営が、まだ動かして確かめていない
  'advice_unreviewed',  // 助言を含むのに、専門家に確かめた記録が無い
  'later_chain',        // 相手のサーバーや家の端末の工程を、2 つ以上つなぐカード。出した後
  'later_home',         // 家の端末で動く工程があるカード。スマホだけの一覧には、まだ出さない
  'step_missing',       // 工程の先が無い（系列が消えた、adapter が無い、など）
  'step_not_running',   // 工程の先が、今は動かない（載っていない、人が動かして成果が返った記録が無い、入力欄で使えない）
  'step_changed',       // 運営が確かめた時から、工程の中身が変わった（確かめ直すまで載せない）
] as const;
export type NoahPackageReason = (typeof NOAH_PACKAGE_REASONS)[number];

/** 工程の先の、今の事実。呼ぶ側が、表（noah_intake_families・noah_intake_checks）と、今の main の定義から作る。 */
export type NoahStepFact =
  /** listed・level は系列の行。formTool は、その道具が入力欄で使えるか。toolSha256 は、その道具の今の定義。 */
  | { kind: 'family'; listed: boolean; level: 0 | 1 | 2; formTool: boolean; toolSha256: string | null }
  /** fingerprint は、固定 adapter の今の中身（package・version・model をつないだ文字の sha256）。 */
  | { kind: 'home'; fingerprint: string }
  | { kind: 'builtin'; available: boolean; fingerprint: string };
/** 家の端末の固定 adapter の中身。配る物・版・使うモデルのどれかが変わると、別の値になる（lib/noah-execution-contract.mjs の RECIPES の 1 件から作る）。 */
export const noahHomeFingerprint = (recipe: { package: string; version: string; model?: string }) =>
  sha256Hex(canonicalJson({ package: recipe.package, version: recipe.version, model: recipe.model ?? null }));
/** Noah の中の道具の中身。受け取る型・出す型が変わると、別の値になる（lib/work-composition.ts の compositionCapabilities の 1 件から作る）。 */
export const noahBuiltinFingerprint = (capability: { id: string; accepts: readonly string[]; output: string }) =>
  sha256Hex(canonicalJson({ id: capability.id, accepts: [...capability.accepts], output: capability.output }));
/** 動く所。カードに「相手のサーバー」「あなたの端末」「Noah の中」と出す。 */
export type NoahRunPlace = 'provider' | 'home' | 'noah';
export type NoahPackageListing =
  | { listed: true; runs: NoahRunPlace[]; ownerSteps: number; ownerMinutes: number }
  | { listed: false; reason: NoahPackageReason; step: number | null };

/**
 * 棚に載せるか。理由は上から順に見て、最初に当たった物。facts は工程と同じ数・同じ順（本人の工程と、先が決まっていない工程は null。先が無い時も null）。
 * chains: 相手のサーバー・家の端末の工程を 2 つ以上つなぐカードを許す（切り替え NOAH_SHELF_CHAINS。ローンチの既定は閉）。
 * home: 家の端末で動く工程があるカードを許す（切り替え NOAH_SHELF_HOME。スマホだけの一覧では閉）。
 * Noah の中の道具だけをつなぐカードは、今の合成の実行（lib/work-composition-executor.ts）で動くので、chains が閉でも載せられる。
 */
export function noahPackageListing(pkg: NoahPackage, facts: readonly (NoahStepFact | null)[], opts: { chains: boolean; home: boolean }): NoahPackageListing {
  const no = (reason: NoahPackageReason, step: number | null = null): NoahPackageListing => ({ listed: false, reason, step });
  if (facts.length !== pkg.steps.length) throw new NoahShelfError('facts', '工程の事実は、工程と同じ数だけ渡します。');
  if (pkg.status === 'retired') return no('retired');
  if (pkg.status === 'draft' || !pkg.verified) return no('draft');
  if (pkg.advice && !pkg.review) return no('advice_unreviewed');
  const kinds = pkg.steps.map((step) => step.ref.kind);
  const remote = kinds.filter((kind) => kind === 'family' || kind === 'home').length;
  const builtin = kinds.filter((kind) => kind === 'builtin').length;
  if (!opts.chains && (remote > 1 || (remote === 1 && builtin > 0))) return no('later_chain');
  if (!opts.home && kinds.includes('home')) return no('later_home', kinds.indexOf('home'));
  const runs: NoahRunPlace[] = [];
  for (const [index, step] of pkg.steps.entries()) {
    const ref = step.ref;
    if (ref.kind === 'owner') continue;
    const fact = facts[index];
    if (ref.kind === 'gap' || !fact || fact.kind !== ref.kind) return no('step_missing', index);
    if (fact.kind === 'family' && (!fact.listed || fact.level !== 2 || !fact.formTool)) return no('step_not_running', index);
    if (fact.kind === 'builtin' && !fact.available) return no('step_not_running', index);
    const now = fact.kind === 'family' ? fact.toolSha256 : fact.fingerprint;
    if (now !== pkg.verified.fingerprints[index]) return no('step_changed', index);
    const place: NoahRunPlace = fact.kind === 'family' ? 'provider' : fact.kind === 'home' ? 'home' : 'noah';
    if (!runs.includes(place)) runs.push(place);
  }
  const owner = pkg.steps.filter((step) => step.ref.kind === 'owner');
  return { listed: true, runs, ownerSteps: owner.length, ownerMinutes: pkg.steps.reduce((sum, step) => sum + step.ownerMinutes, 0) };
}

// ---------------------------------------------------------------------------
// 並び（学習なし。数えた実績と、運営が決めた順）
// ---------------------------------------------------------------------------

/** 数値は候補。変えるのは本人。 */
export const NOAH_SHELF_RANK = {
  /** これより少ない人数の実績は、無い物として扱う。数字もカードに出さない（docs/noah-detailed-design.md 18 章「作る人に見せる最小の人数」と同じ）。 */
  minPeople: 5,
  /** 5 枚に 1 枚は、実績の少ないカードを試しに出す（lib/sky-recipe-planner.ts の RECIPE_TRIAL_INTERVAL と同じ比率）。 */
  trialEvery: 5,
  /** 同じ領域のカードが続いてよい枚数。 */
  sameTopicRun: 2,
  /** 開かずに見た回数が、これ以上のカードは、その人には後ろへ送る（履歴の利用に同意した人だけ）。 */
  seenWithoutOpen: 3,
  /** 今の点数表（lib/noah-recommendation-policy.ts。フォロー 40・興味 20・履歴 10・実行方法 5）の最大。 */
  personalMax: 75,
};

/**
 * カード 1 枚の実績。全部の利用者を合わせた数。本人の ID・依頼・成果の本文は入らない。
 * 人気（回数そのもの）と売上は入れない（docs/noah-design.md 4.3）。使うのは割合と、秒数だけ。
 */
export type NoahCardEvidence = {
  /** 関わった人数。minPeople より少ない時、この実績は使わない。 */
  people: number;
  /** 「接続」を押した数と、つながった数。 */
  connects: number; connected: number;
  /** 終わった依頼の数と、成果が返った数（相手のエラー・時間切れ・結果不明は、成果ではない）。 */
  asks: number; succeeded: number;
  /** 検収した数と、通った数。検収していなければ 0 と 0。 */
  reviewed: number; accepted: number;
  /** 最初の成果まで行った人数と、そのうち翌日以降にもう一度頼んだ人数。 */
  firstUsers: number; returned: number;
  /** 接続から最初の成果までの秒数の中央値。 */
  medianSeconds: number | null;
};
const count = (value: number, name: string) => {
  if (!Number.isSafeInteger(value) || value < 0) fail('evidence', `${name}は、0 以上の整数です。`);
  return value;
};

/**
 * 割合の見積り。記録が無ければ 0.5、増えるほど実績に寄る（lib/sky-recipe-planner.ts の acceptanceEstimate と同じ式）。
 * 1 回中 1 回の成功を 100% と見なさない。optimistic は「次の 1 回が通ったら」の率で、記録の少ない物ほど大きい。
 */
export function noahRate(hits: number, total: number): { mean: number; optimistic: number } {
  count(hits, '数');
  count(total, '数');
  if (hits > total) fail('evidence', '当たりの数が、全体の数を越えています。');
  return { mean: (hits + 1) / (total + 2), optimistic: Math.min(1, (hits + 2) / (total + 2)) };
}

export function validateNoahEvidence(e: NoahCardEvidence): NoahCardEvidence {
  for (const [name, value] of Object.entries(e)) if (name !== 'medianSeconds') count(value as number, name);
  if (e.connected > e.connects || e.succeeded > e.asks || e.accepted > e.reviewed || e.returned > e.firstUsers) fail('evidence', '当たりの数が、全体の数を越えています。');
  if (e.medianSeconds !== null && (!Number.isFinite(e.medianSeconds) || e.medianSeconds < 0)) fail('evidence', '秒数が違います。');
  return e;
}

/**
 * 「初めての人が 1 回頼んで、使える成果を受け取り、また使う」見込み = つながる率 × 成果が返る率 × 検収に通る率 × また使う率。
 * 人数が minPeople より少ない実績は、無い物として扱う（全部 0.5 から）。
 */
export function noahCardScore(evidence: NoahCardEvidence | null): { score: number; optimistic: number; proven: boolean } {
  const proven = evidence !== null && validateNoahEvidence(evidence).people >= NOAH_SHELF_RANK.minPeople;
  const e = proven ? evidence : { connects: 0, connected: 0, asks: 0, succeeded: 0, reviewed: 0, accepted: 0, firstUsers: 0, returned: 0 };
  const rates = [noahRate(e.connected, e.connects), noahRate(e.succeeded, e.asks), noahRate(e.accepted, e.reviewed), noahRate(e.returned, e.firstUsers)];
  return { score: rates.reduce((p, r) => p * r.mean, 1), optimistic: rates.reduce((p, r) => p * r.optimistic, 1), proven };
}

/** 集計の表（noah_package_evidence）の 1 行を、並びへ渡す形にする。形の違う行は拒否する。 */
export function noahEvidenceFromRow(row: { people: number; connects: number; connected: number; asks: number; succeeded: number; reviewed: number; accepted: number; first_users: number; returned: number; median_seconds: number | null }): NoahCardEvidence {
  return validateNoahEvidence({
    people: row.people, connects: row.connects, connected: row.connected, asks: row.asks, succeeded: row.succeeded,
    reviewed: row.reviewed, accepted: row.accepted, firstUsers: row.first_users, returned: row.returned, medianSeconds: row.median_seconds,
  });
}

/** カードに出してよい数。人数が足りない時は null（「まだ数字はありません」）。割合は、見積りではなく、数えたそのまま。 */
export function noahCardNumbers(evidence: NoahCardEvidence | null): { resultPercent: number | null; againPercent: number | null; seconds: number | null } | null {
  if (!evidence || validateNoahEvidence(evidence).people < NOAH_SHELF_RANK.minPeople) return null;
  const percent = (hits: number, total: number) => (total > 0 ? Math.round((hits / total) * 100) : null);
  return { resultPercent: percent(evidence.succeeded, evidence.asks), againPercent: percent(evidence.returned, evidence.firstUsers), seconds: evidence.medianSeconds };
}

export type NoahShelfCardInput = {
  /** 載せると決まったカードだけを渡す（noahPackageListing が listed: true の物）。 */
  pkg: Pick<NoahPackage, 'id' | 'topic' | 'position'>;
  evidence: NoahCardEvidence | null;
  /** 今の点数表の点（おすすめを ON にした本人だけ。0〜75）。 */
  personalPoints?: number;
  /** 本人がそのカードを見た記録（履歴の利用に同意した本人だけ）。hidden は、本人が「非表示」にした物。 */
  seen?: { shown: number; opened: number; hidden: boolean };
};
export type NoahRankedCard = {
  packageId: string;
  /** 出す位置。1 から。 */
  position: number;
  /** この位置に出した理由。operator: 運営の順。evidence: 実績。trial: 実績の少ない物を試しに。personal: 本人の関心に合う。 */
  why: 'operator' | 'evidence' | 'trial' | 'personal';
  score: number;
};

/**
 * 棚 1 段の並び。同じ入力なら、いつも同じ結果。
 * byEvidence が閉（切り替え NOAH_SHELF_RANK。ローンチの既定は閉）の間は、運営が決めた順のまま。本人が非表示にした物だけを外す。
 * 開いている時:
 *  1. 見込み（noahCardScore）× 本人の関心（1 + 点 / 100）× 見飽き（開かずに 3 回見た物は半分）の大きい順。同じなら、秒数の短い順、運営の順、ID の順。
 *  2. 5 枚に 1 枚の位置には、実績の無いカードを、運営の順で入れる（新しい物が埋もれない）。
 *  3. 同じ領域が 3 枚続かないように、次の物を先に出す（別の領域の物が残っている時だけ）。
 */
export function rankNoahShelf(cards: readonly NoahShelfCardInput[], opts: { byEvidence: boolean; personal: boolean }): NoahRankedCard[] {
  if (cards.length > NOAH_PACKAGE_LIMITS.cardsPerShelf) fail('cards', `棚 1 段は ${NOAH_PACKAGE_LIMITS.cardsPerShelf} 枚までです。`);
  if (new Set(cards.map((card) => card.pkg.id)).size !== cards.length) fail('cards', '同じカードが 2 回入っています。');
  const byOperator = (a: NoahShelfCardInput, b: NoahShelfCardInput) => a.pkg.position - b.pkg.position || (a.pkg.id < b.pkg.id ? -1 : 1);
  const visible = cards.filter((card) => !card.seen?.hidden).sort(byOperator);
  if (!opts.byEvidence) return visible.map((card, index) => ({ packageId: card.pkg.id, position: index + 1, why: 'operator', score: 0 }));

  const scored = visible.map((card) => {
    const base = noahCardScore(card.evidence);
    const points = opts.personal ? Math.min(NOAH_SHELF_RANK.personalMax, Math.max(0, card.personalPoints ?? 0)) : 0;
    const tired = card.seen !== undefined && card.seen.opened === 0 && card.seen.shown >= NOAH_SHELF_RANK.seenWithoutOpen;
    return { card, proven: base.proven, points, score: base.score * (1 + points / 100) * (tired ? 0.5 : 1), seconds: card.evidence && base.proven ? card.evidence.medianSeconds : null };
  });
  type Scored = (typeof scored)[number];
  const main = [...scored].sort((a, b) => b.score - a.score || (a.seconds ?? Infinity) - (b.seconds ?? Infinity) || byOperator(a.card, b.card));
  // 試しに出す物: 実績の無いカードを、運営の順で（scored は運営の順に並んでいる）。
  const trial = scored.filter((item) => !item.proven);
  const used = new Set<string>();
  const out: NoahRankedCard[] = [];
  const topics: NoahTopic[] = [];
  const take = (item: Scored, why: NoahRankedCard['why']) => {
    used.add(item.card.pkg.id);
    topics.push(item.card.pkg.topic);
    out.push({ packageId: item.card.pkg.id, position: out.length + 1, why, score: item.score });
  };
  while (out.length < scored.length) {
    const position = out.length + 1;
    const rest = main.filter((item) => !used.has(item.card.pkg.id));
    const fresh = trial.find((item) => !used.has(item.card.pkg.id));
    // 実績のある物が 1 枚も無い間は、試しの位置を作らない（全部が運営の順のまま出る）。
    if (position % NOAH_SHELF_RANK.trialEvery === 0 && fresh && rest.some((item) => item.proven)) {
      take(fresh, 'trial');
      continue;
    }
    const run = topics.slice(-NOAH_SHELF_RANK.sameTopicRun);
    const stuck = run.length === NOAH_SHELF_RANK.sameTopicRun && run.every((topic) => topic === run[0]);
    const next = (stuck && rest.find((item) => item.card.pkg.topic !== run[0])) || rest[0];
    take(next, next.points > 0 ? 'personal' : next.proven ? 'evidence' : 'operator');
  }
  return out;
}

/** 出した位置の区分。見せた記録は、位置そのものではなく、この 3 つで数える（上の物ほど押されやすい偏りを、後で外すため）。 */
export const noahShelfBand = (position: number): 'top' | 'mid' | 'low' => (integer(position, 'position', '位置', 1, 10_000) <= 3 ? 'top' : position <= 10 ? 'mid' : 'low');

// ---------------------------------------------------------------------------
// 助言を含む成果の、文字で決まる検査
// ---------------------------------------------------------------------------

/** 出典（https の URL）が 1 つ以上あるか。決まった注意の文が、そのまま入っているか。「診断と薬の指示をしていない」は、ここでは判定しない（Jev）。 */
export function noahAdviceRuleChecks(output: string): { id: 'cites-sources' | 'urgent-care-notice'; passed: boolean }[] {
  return [
    { id: 'cites-sources', passed: /https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/iu.test(output) },
    { id: 'urgent-care-notice', passed: output.includes(NOAH_HEALTH_NOTICE) },
  ];
}

// ---------------------------------------------------------------------------
// つなげる数（料金ごと。数えるのはカード）
// ---------------------------------------------------------------------------

/** 2026-11-21 の本人の決定: 無料でも基本は使えて、6 個までつなげる。課金すると、もっとつなげる。値段は未定（数だけ切り替える）。 */
export const NOAH_PLAN_CARDS = { free: 6, paid: NOAH_ASK_LIMITS.connectLive } as const;
export type NoahPlan = keyof typeof NOAH_PLAN_CARDS;

/** つないでいるカードの数。同じパッケージの中の接続は、何本あっても 1 と数える。パッケージの外の接続は、1 本が 1。 */
export function noahLiveCards(connections: readonly { packageId: string | null }[]): number {
  const packages = new Set<string>();
  let single = 0;
  for (const connection of connections) {
    if (connection.packageId === null) single += 1;
    else packages.add(connection.packageId);
  }
  return packages.size + single;
}

/**
 * つなぐ前の上限を、料金ごとの数で見る。数え方は今の noahConnectGate のまま（直近 60 秒・直近 24 時間の数は、料金で変えない）。
 * adding は、これからつなぐ物が、もうつないであるパッケージの続きか（続きなら、カードの数は増えない）。
 */
export function noahPlanConnectGate(plan: NoahPlan, counts: { liveCards: number; lastMinute: number; lastDay: number }, adding: 'new_card' | 'same_package'): NoahConnectGate {
  const live = adding === 'same_package' ? Math.max(0, counts.liveCards - 1) : counts.liveCards;
  const gate = noahConnectGate({ live, lastMinute: counts.lastMinute, lastDay: counts.lastDay }, { ...NOAH_ASK_LIMITS, connectLive: NOAH_PLAN_CARDS[plan] });
  if (!gate.ok && gate.code === 'live' && plan === 'free') {
    return { ...gate, message: `無料でつなげるのは ${NOAH_PLAN_CARDS.free} 個までです。使っていないものを切ると、空きができます。` };
  }
  return gate;
}

// ---------------------------------------------------------------------------
// 札（受け取る物・出す物）と、工程の計画へのつなぎ
// ---------------------------------------------------------------------------

/**
 * モデルが返した札の候補を読む。受け取るのは、この形の JSON だけ:
 * {"schema":"noah-card/1","consumes":["csv"],"produces":["cleaned-csv"]} … produces は 1 つ。
 * 語彙の外の語、余計な項目、JSON の外の文は、全部捨てる（NoahShelfError）。説明文を、命令にも素材の名前にもしない。
 * 候補は、運営が確かめるまで、棚のカードには使わない。
 */
export function parseNoahCardProposal(text: string): { consumes: NoahMaterial[]; produces: NoahMaterial } {
  if (typeof text !== 'string' || text.length > 2_000) fail('card', '札の候補を読めません。');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail('card', '札の候補は JSON だけで返します。');
  }
  const o = record(value, ['schema', 'consumes', 'produces'], 'card');
  if (o.schema !== 'noah-card/1') fail('card', 'schema は noah-card/1 です。');
  const consumes = materials(o.consumes, 'card', '受け取る物');
  if (!Array.isArray(o.produces) || o.produces.length !== 1 || !isMaterial(o.produces[0]) || consumes.includes(o.produces[0])) return fail('card', '出す物は、決まった素材の型を 1 つ、受け取る物と別にしてください。');
  return { consumes, produces: o.produces[0] };
}

/**
 * カードの工程を、工程の計画（lib/sky-recipe-planner.ts）が読む「能力」に直す。ID は `<カードの ID>.s<工程の番号>`。
 * 先が決まっていない工程は available: false（計画が「この型の素材を作れる能力が無い」と返す）。
 * facts は工程と同じ数・同じ順。実費と待ち時間は、呼ぶ側が渡す（実績から直す。ここでは作らない）。
 */
export function noahPackageCapabilities(pkg: NoahPackage, facts: readonly { name: string; available: boolean; installed: boolean; costMinor: number; waitMinutes: number }[]): RecipeCapability[] {
  if (facts.length !== pkg.steps.length) throw new NoahShelfError('facts', '工程の事実は、工程と同じ数だけ渡します。');
  return pkg.steps.map((step, index): RecipeCapability => ({
    id: `${pkg.id}.s${index}`,
    name: facts[index].name,
    kind: step.ref.kind === 'owner' ? 'owner' : 'tool',
    consumes: step.consumes,
    produces: step.produces,
    available: step.ref.kind === 'gap' ? false : facts[index].available,
    costMinor: facts[index].costMinor,
    ownerMinutes: step.ownerMinutes,
    waitMinutes: facts[index].waitMinutes,
    setupMinor: 0,
    setupOwnerMinutes: 0,
    installed: facts[index].installed,
  }));
}

// ---------------------------------------------------------------------------
// 300 人の試行（段・次へ進む条件・届ける人数・売れた額の式）
// ---------------------------------------------------------------------------

/** 数値は候補。割合は docs/noah/mvp-launch.md 11 章の目安と同じ。people は、最初の成果まで行った人の累計。 */
export const NOAH_TRIAL = {
  waves: [{ wave: 1, people: 30 }, { wave: 2, people: 100 }, { wave: 3, people: 300 }],
  connect: 0.9, firstResult: 0.5, returned: 0.2,
} as const;
export type NoahTrialCounts = {
  /** 「接続」を押した人数、つながった人数、最初の成果まで行った人数、翌日以降にもう一度頼んだ人数。 */
  pressed: number; connected: number; firstResult: number; returned: number;
};
export type NoahTrialFailing = 'people' | 'connect' | 'first_result' | 'returned';

/**
 * その段を終えたか（＝ 次の段を開けてよいか。段 3 は、300 人に届いたか）。
 * 段 1: 人数、つながる割合、最初の成果まで行く割合。段 2・3: それに、また使う割合を足す。
 */
export function noahTrialGate(wave: 1 | 2 | 3, counts: NoahTrialCounts): { done: boolean; failing: NoahTrialFailing[]; rates: { connect: number; firstResult: number; returned: number } } {
  for (const [name, value] of Object.entries(counts)) count(value, name);
  if (counts.connected > counts.pressed || counts.firstResult > counts.connected || counts.returned > counts.firstResult) fail('trial', '数が、前の段の数を越えています。');
  const ratio = (hits: number, total: number) => (total > 0 ? hits / total : 0);
  const rates = { connect: ratio(counts.connected, counts.pressed), firstResult: ratio(counts.firstResult, counts.connected), returned: ratio(counts.returned, counts.firstResult) };
  const target = NOAH_TRIAL.waves.find((item) => item.wave === wave);
  if (!target) return fail('trial', '段は 1・2・3 です。');
  const failing: NoahTrialFailing[] = [];
  if (counts.firstResult < target.people) failing.push('people');
  if (rates.connect < NOAH_TRIAL.connect) failing.push('connect');
  if (rates.firstResult < NOAH_TRIAL.firstResult) failing.push('first_result');
  if (wave >= 2 && rates.returned < NOAH_TRIAL.returned) failing.push('returned');
  return { done: failing.length === 0, failing, rates };
}

/** 成果まで行く人を target 人にするために、リンクを開いてもらう人数。割合は百分率の整数（1〜100）。 */
export function noahTrialReach(target: number, openToConnectPercent: number, connectToResultPercent: number): number {
  integer(target, 'trial', '人数', 1, 10_000_000);
  integer(openToConnectPercent, 'trial', '割合', 1, 100);
  integer(connectToResultPercent, 'trial', '割合', 1, 100);
  return Math.ceil((target * 10_000) / (openToConnectPercent * connectToResultPercent));
}

/**
 * 各自が自分の出品で売る時の、最初の月の式。答えは見込みではなく、置いた割合の掛け算（割合は、試行で測って置き換える）。
 * sellers = 人数 × 出品する割合 × 最初の月に売れる割合。netYen = sellers × 件数 × 単価 ×（1 − 販売先の手数料）。
 */
export function noahEarnEstimate(input: { people: number; listPercent: number; sellPercent: number; orders: number; priceYen: number; feePercent: number }): { sellers: number; grossYen: number; netYen: number; medianIsZero: boolean } {
  integer(input.people, 'earn', '人数', 1, 10_000_000);
  integer(input.listPercent, 'earn', '出品する割合', 0, 100);
  integer(input.sellPercent, 'earn', '売れる割合', 0, 100);
  integer(input.orders, 'earn', '件数', 0, 1_000);
  integer(input.priceYen, 'earn', '単価', 0, 10_000_000);
  integer(input.feePercent, 'earn', '手数料', 0, 100);
  const sellers = Math.floor((input.people * input.listPercent * input.sellPercent) / 10_000);
  const grossYen = sellers * input.orders * input.priceYen;
  return { sellers, grossYen, netYen: Math.floor((grossYen * (100 - input.feePercent)) / 100), medianIsZero: sellers * 2 < input.people };
}

/** 入ってきた経路の札。運営が登録した物だけを採る（知らない値・長い値・形の違う値は、経路なしとして扱う）。 */
export function noahTrialVia(value: unknown, known: readonly string[]): string | null {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/u.test(value) && known.includes(value) ? value : null;
}

// ---------------------------------------------------------------------------
// 切り替え（環境変数）。読み方は docs/contracts/noah-flags-v1.ts と同じ: 開くのは値が true の時だけ。形の違う値は閉じた物として扱う。
// ---------------------------------------------------------------------------

export const NOAH_SHELF_FLAG_NAMES = {
  /** 棚を、誰にでも見せる。閉じている間は審査者だけ。 */
  shelfPublic: 'NOAH_SHELF_PUBLIC',
  /** 棚の並びに、数えた実績を使う。閉じている間は、運営が決めた順。 */
  rank: 'NOAH_SHELF_RANK',
  /** 相手のサーバー・家の端末の工程を 2 つ以上つなぐカードを載せる。 */
  chains: 'NOAH_SHELF_CHAINS',
  /** 家の端末で動く工程があるカードを、端末をつないである本人に見せる。 */
  home: 'NOAH_SHELF_HOME',
  /** 見せた記録を取る。 */
  seen: 'NOAH_SHELF_SEEN',
  /** つなげる数を、料金ごとにする（閉じている間は、全員が今の上限）。 */
  planLimits: 'NOAH_PLAN_LIMITS',
  /** 300 人の試行の、経路の札と、本人からの報告を受け付ける。 */
  trial: 'NOAH_TRIAL_OPEN',
} as const;
export type NoahShelfFlags = { [K in keyof typeof NOAH_SHELF_FLAG_NAMES]: boolean } & { warnings: string[] };

export function parseNoahShelfFlags(env: Record<string, string | undefined>): NoahShelfFlags {
  const warnings: string[] = [];
  const read = (name: string) => {
    const value = env[name];
    if (value !== undefined && value !== '' && value !== 'true' && value !== 'false') warnings.push(`${name} は true か false です。閉じた物として扱います。`);
    return value === 'true';
  };
  const n = NOAH_SHELF_FLAG_NAMES;
  return { shelfPublic: read(n.shelfPublic), rank: read(n.rank), chains: read(n.chains), home: read(n.home), seen: read(n.seen), planLimits: read(n.planLimits), trial: read(n.trial), warnings };
}

/** その本人に、どの設定で棚を出すか。家の端末のカードは、切り替えが開いていて、本人の端末が応答している時だけ。 */
export function noahShelfOptions(flags: NoahShelfFlags, viewer: { reviewer: boolean; deviceOnline: boolean; recommendations: boolean }): { visible: boolean; chains: boolean; home: boolean; byEvidence: boolean; personal: boolean } {
  return { visible: flags.shelfPublic || viewer.reviewer, chains: flags.chains, home: flags.home && viewer.deviceOnline, byEvidence: flags.rank, personal: flags.rank && viewer.recommendations };
}
