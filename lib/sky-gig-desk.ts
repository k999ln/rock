/**
 * Sky gig desk — 会社の窓口。募集を読み、受けるか決め、提案の下書きを作り、
 * 受注後の人の確認作業を参加者へ配る。
 *
 * やらないこと（境界）:
 * - 販売サイトへの自動ログイン・自動巡回・自動応募・自動返信。募集の文面は本人が見たページを渡す。
 *   提案の送信・契約・納品は本人が自分の手で行う。
 * - 参加者の個人アカウントを Sky が操作すること。受注は会社のアカウント1つだけ。
 * - 実行・課金・送金の許可。ここは判定と下書きと割当を返すだけ。
 */

import {
  checkOrderQuote,
  decideExecutionPlacement,
  type Contribution,
  type ExecutionPlacement,
  type OrderChannel,
} from './sky-company-order.ts';
import {
  planRecipes,
  type RecipeCandidate,
  type RecipeCapability,
  type RecipeObservation,
} from './sky-recipe-planner.ts';

export class GigDeskError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function requireValue(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new GigDeskError(code, message);
}

const refPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const amount = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const bps = (value: number) => Number.isInteger(value) && value >= 0 && value <= 10_000;
const validDate = (value: unknown): value is string =>
  typeof value === 'string' && datePattern.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

// ---------------------------------------------------------------------------
// 1. 募集を読む
// ---------------------------------------------------------------------------

export type GigPosting = {
  id: string;
  channel: OrderChannel;
  url: string | null;
  title: string;
  category: string | null;
  body: string;
  /** 予算。記載なし・見積り希望は null。円。 */
  budgetMinYen: number | null;
  budgetMaxYen: number | null;
  /** 応募の締切日（YYYY-MM-DD）。 */
  closesOn: string | null;
  /** 納品希望日（YYYY-MM-DD）。 */
  deliveryOn: string | null;
  /** 既に応募している人数。 */
  applicants: number | null;
  /** 依頼者が機密保持契約（NDA）を結ぶ設定か。 */
  clientRequiresNda: boolean;
};

function yenAmount(text: string): number | null {
  const normalized = text.normalize('NFKC').replace(/[,\s]/gu, '');
  const man = /^(\d+(?:\.\d+)?)万円?$/u.exec(normalized);
  if (man) return Math.round(Number(man[1]) * 10_000);
  const yen = /^(\d+)円?$/u.exec(normalized);
  return yen ? Number(yen[1]) : null;
}

function japaneseDate(text: string): string | null {
  const match = /(\d{4})[年/.-]\s*(\d{1,2})[月/.-]\s*(\d{1,2})日?/u.exec(text.normalize('NFKC'));
  if (!match) return null;
  const value = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return validDate(value) ? value : null;
}

/**
 * 本人が開いた募集ページの文面（コピーした文字）から、判断に要る項目だけを取り出す。
 * サイトへは接続しない。ラベルはココナラの公開募集ページの表記（カテゴリ／予算／納品希望日／締切日／応募人数）。
 * 取れなかった項目は null のまま返し、推測で埋めない。
 */
export function parseCoconalaPosting(input: { id: string; text: string; url?: string }): GigPosting {
  requireValue(refPattern.test(input?.id ?? ''), 'POSTING_ID', '募集IDが不正です。');
  requireValue(typeof input.text === 'string' && input.text.trim().length >= 10 && input.text.length <= 40_000, 'POSTING_TEXT', '募集の文面を10〜40000文字で渡してください。');
  let url: string | null = null;
  if (input.url !== undefined) {
    requireValue(/^https:\/\/coconala\.com\/requests\/\d{1,12}(?:[/?#].*)?$/u.test(input.url), 'POSTING_URL', 'ココナラの募集ページのURLを指定してください。');
    url = input.url;
  }
  const text = input.text.normalize('NFKC');
  const lines = text.split(/\r?\n/u).map((line) => line.replace(/^[\s\-*・]+|[\s*]+$/gu, '').replace(/\*\*/gu, '')).filter(Boolean);
  const field = (label: string) => {
    const index = lines.findIndex((line) => line === label || line.startsWith(`${label}:`) || line.startsWith(`${label} `));
    if (index < 0) return null;
    const inline = lines[index].slice(label.length).replace(/^[:\s]+/u, '');
    return inline || lines[index + 1] || null;
  };

  const budgetText = field('予算');
  let budgetMinYen: number | null = null;
  let budgetMaxYen: number | null = null;
  if (budgetText) {
    const parts = budgetText.split(/[〜~～ー-]/u).map((part) => yenAmount(part.trim()));
    if (parts.length >= 2) {
      [budgetMinYen, budgetMaxYen] = [parts[0], parts[parts.length - 1]];
    } else if (parts[0] !== null) {
      // 「〜円以下」「〜円」だけの表記は上限として読む。
      budgetMaxYen = parts[0];
    }
    if (budgetMinYen !== null && budgetMaxYen !== null && budgetMinYen > budgetMaxYen)
      [budgetMinYen, budgetMaxYen] = [budgetMaxYen, budgetMinYen];
  }

  const closing = lines.find((line) => /締切日/u.test(line)) ?? field('募集期限') ?? '';
  const closesAt = /締切日\s*:?\s*([^/]+)/u.exec(closing)?.[1] ?? closing;
  const applicantsText = lines.find((line) => /応募人数/u.test(line)) ?? '';
  const applicants = /応募人数\s*:?\s*(\d{1,5})/u.exec(applicantsText)?.[1];
  const titleLine = field('タイトル') ?? lines.find((line) => !/^(カテゴリ|予算|納品希望日|募集期限|応募状況|締切日)/u.test(line)) ?? '';
  const bodyStart = lines.findIndex((line) => line.startsWith('募集内容'));
  const stop = (line: string) => /^(特記事項|求めるスキル|参考URL|添付ファイル|応募者一覧|募集内容についての質問|募集者情報)/u.test(line);
  const bodyLines: string[] = [];
  if (bodyStart >= 0) {
    const inline = lines[bodyStart].slice('募集内容'.length).replace(/^[:\s]+/u, '');
    if (inline) bodyLines.push(inline);
    for (const line of lines.slice(bodyStart + 1)) {
      if (stop(line)) break;
      bodyLines.push(line);
    }
  }
  const wrapped = /^[「『]([^「」『』]+)[」』]$/u.exec(titleLine);
  const title = (wrapped ? wrapped[1] : titleLine).slice(0, 200);
  requireValue(title.length >= 2, 'POSTING_TITLE', '募集の題名を読み取れませんでした。');
  return {
    id: input.id,
    channel: 'coconala',
    url,
    title,
    category: field('カテゴリ')?.slice(0, 120) ?? null,
    body: (bodyLines.join('\n') || text).slice(0, 12_000),
    budgetMinYen,
    budgetMaxYen,
    closesOn: japaneseDate(closesAt),
    deliveryOn: japaneseDate(field('納品希望日') ?? ''),
    applicants: applicants === undefined ? null : Number(applicants),
    clientRequiresNda: /機密保持契約|NDA/iu.test(text),
  };
}

/** 文面から読み取れる条件。書かれていないことは「未確認」のままにする。 */
export function readPostingConstraints(posting: GigPosting) {
  const text = `${posting.title}\n${posting.body}`.normalize('NFKC');
  const aiForbidden = /(?:生成)?AI(?:の)?(?:使用|利用|生成|作成)?(?:は|を)?(?:不可|禁止|NG|お断り|ご遠慮)|AI(?:で|による)(?:作成|生成)(?:した|された)?(?:もの|成果物)?(?:は)?(?:不可|禁止|NG)|AIを(?:使わ|利用し|使用し)ない/iu.test(text);
  const aiWelcome = !aiForbidden && /(?:生成)?AI(?:の)?(?:使用|利用|活用)(?:も)?(?:可|OK|歓迎|可能)|ChatGPT|Claude|Gemini|生成AIを(?:使っ|活用し|利用し)て/iu.test(text);
  const personal = /個人情報|顧客(?:情報|データ|リスト|名簿)|名簿|住所録|カルテ|診療|口座|マイナンバー|パスワード|ログイン情報|社外秘|機密/u.test(text);
  return {
    aiUse: aiForbidden ? 'not_allowed' as const : aiWelcome ? 'allowed' as const : 'unconfirmed' as const,
    containsPersonalOrSecretData: personal || posting.clientRequiresNda,
  };
}

// ---------------------------------------------------------------------------
// 2. 受けるか決める
// ---------------------------------------------------------------------------

/** 会社が売れる仕事の型。ここに無い仕事は応募しない。 */
export type GigOffer = {
  id: string;
  name: string;
  /** この型に当たる募集を見分ける語。1つでも含めば候補。 */
  keywords: readonly string[];
  /** 依頼者から受け取る素材の型。 */
  have: readonly string[];
  /** 納品する成果の型。 */
  want: string;
  /** これより安くは受けない額（円）。 */
  floorYen: number;
  /** 納品までの日数。 */
  deliveryDays: number;
  /** 納品前に人が確認する項目数（1受注あたり）。 */
  judgmentItems: number;
  /** 提案文に入れる、納品物の説明。 */
  deliverable: string;
};

export type GigDeskPolicy = {
  /** 販売先の手数料率（basis points）。ココナラの通常の販売手数料は22%（税込）。 */
  platformFeeBps: number;
  reserveBps: number;
  /** 1受注で会社に最低限残す額（円）。 */
  minimumMarginYen: number;
  /** 人の確認1件の単価（円）と、1項目を見る人数。 */
  judgmentRateYen: number;
  judgmentQuorum: 1 | 3 | 5;
  /** 会社の人の1分の値段（円）。提案・納品・やり取りの手間の重み。 */
  ownerMinuteValueYen: number;
  /** 提案1件の確認と送信に会社の人が使う分数。採用されなくてもかかる。 */
  ownerMinutesPerProposal: number;
  /** 採用された後、1受注で会社の人が使う分数（やり取り、納品）。 */
  ownerMinutesPerOrder: number;
  /** 1日に出す提案の上限。数で押さない。 */
  dailyProposalLimit: number;
  /** これ以上応募が集まっている募集は見送る。 */
  maximumApplicants: number;
};

export const COCONALA_DESK_POLICY: GigDeskPolicy = {
  platformFeeBps: 2_200,
  reserveBps: 1_000,
  minimumMarginYen: 1_000,
  judgmentRateYen: 30,
  judgmentQuorum: 3,
  ownerMinuteValueYen: 50,
  ownerMinutesPerProposal: 3,
  ownerMinutesPerOrder: 30,
  dailyProposalLimit: 5,
  maximumApplicants: 10,
};

/** 型ごとの提案の実績。採用率の見積りに使う。 */
export type ProposalRecord = { offerId: string; sent: number; won: number };

export type GigTriage = {
  postingId: string;
  decision: 'propose' | 'skip';
  reasons: string[];
  offerId: string | null;
  recipe: RecipeCandidate | null;
  placement: ExecutionPlacement | null;
  /** 会社の外の参加者に確認を頼む工程を含むか。含む場合、依頼者の承諾を得てから配る。 */
  outsideReview: boolean;
  /** 提案する額と納品日。 */
  priceYen: number | null;
  deliverOn: string | null;
  /** 全部うまくいった時に会社に残る額（手数料・予備・実費・確認の作業料を引いた後）。 */
  marginYen: number | null;
  /** 採用の見込み（0〜1）。 */
  winRate: number | null;
  /** 順位付けの値。採用見込み ×（残る額 − 受注後の手間）− 提案の手間。0以下は出さない。 */
  score: number;
};

function validatePolicy(policy: GigDeskPolicy) {
  requireValue(
    bps(policy?.platformFeeBps) && bps(policy.reserveBps) && policy.platformFeeBps + policy.reserveBps < 10_000,
    'POLICY_RATE', '手数料率と予備率を確認してください。',
  );
  requireValue(
    amount(policy.minimumMarginYen) && amount(policy.judgmentRateYen) && amount(policy.ownerMinuteValueYen) &&
      amount(policy.ownerMinutesPerProposal) && amount(policy.ownerMinutesPerOrder) && amount(policy.maximumApplicants),
    'POLICY_AMOUNT', '金額・分数は0以上の整数で指定してください。',
  );
  requireValue([1, 3, 5].includes(policy.judgmentQuorum), 'POLICY_QUORUM', '確認する人数は1・3・5のいずれかです。');
  requireValue(Number.isSafeInteger(policy.dailyProposalLimit) && policy.dailyProposalLimit >= 0 && policy.dailyProposalLimit <= 50, 'POLICY_LIMIT', '1日の提案上限は0〜50です。');
  return policy;
}

function validateOffer(offer: GigOffer) {
  requireValue(refPattern.test(offer?.id ?? ''), 'OFFER_ID', '仕事の型のIDが不正です。');
  requireValue(typeof offer.name === 'string' && offer.name.trim().length >= 2 && offer.name.length <= 80, 'OFFER_NAME', '仕事の型の名前を確認してください。');
  requireValue(
    Array.isArray(offer.keywords) && offer.keywords.length >= 1 && offer.keywords.length <= 40 &&
      offer.keywords.every((word) => typeof word === 'string' && word.trim().length >= 2 && word.length <= 40),
    'OFFER_KEYWORDS', '見分ける語を1〜40個で指定してください。',
  );
  requireValue(amount(offer.floorYen) && offer.floorYen > 0, 'OFFER_FLOOR', '最低額を指定してください。');
  requireValue(Number.isSafeInteger(offer.deliveryDays) && offer.deliveryDays >= 1 && offer.deliveryDays <= 180, 'OFFER_DAYS', '納品までの日数は1〜180です。');
  requireValue(Number.isSafeInteger(offer.judgmentItems) && offer.judgmentItems >= 0 && offer.judgmentItems <= 1_000, 'OFFER_JUDGMENT', '確認項目数は0〜1000です。');
  requireValue(typeof offer.deliverable === 'string' && offer.deliverable.trim().length >= 5 && offer.deliverable.length <= 400, 'OFFER_DELIVERABLE', '納品物の説明を5〜400文字で書いてください。');
  return offer;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** 提案の採用率。実績なしは 1/10 から始める（1件送って落ちても 0 にしない）。 */
export function proposalWinRate(record: ProposalRecord | undefined) {
  const sent = record?.sent ?? 0;
  const won = record?.won ?? 0;
  requireValue(amount(sent) && amount(won) && won <= sent, 'PROPOSAL_RECORD', '提案の実績が不正です。');
  return (won + 1) / (sent + 10);
}

/**
 * 募集1件について、応募するか・いくらで・いつまでに、を決める。
 * 「作れるか」は planner、「払い切れるか」は見積り確認、「どこで作ってよいか」は実行先の判定に任せる。
 */
export function triageGig(input: {
  posting: GigPosting;
  offers: readonly GigOffer[];
  capabilities: readonly RecipeCapability[];
  observations?: readonly RecipeObservation[];
  proposals?: readonly ProposalRecord[];
  policy: GigDeskPolicy;
  /** 今日の日付（YYYY-MM-DD）。 */
  today: string;
}): GigTriage {
  const { posting } = input;
  const policy = validatePolicy(input.policy);
  requireValue(validDate(input.today), 'TODAY', '今日の日付をYYYY-MM-DDで指定してください。');
  const ids = new Set<string>();
  for (const offer of input.offers) {
    validateOffer(offer);
    requireValue(!ids.has(offer.id), 'OFFER_DUPLICATE', '同じ仕事の型が重複しています。');
    ids.add(offer.id);
  }
  const skip = (reasons: string[], partial: Partial<GigTriage> = {}): GigTriage => ({
    postingId: posting.id, decision: 'skip', reasons, offerId: null, recipe: null, placement: null,
    outsideReview: false, priceYen: null, deliverOn: null, marginYen: null, winRate: null, score: 0, ...partial,
  });

  if (posting.closesOn !== null && posting.closesOn < input.today) return skip(['締切を過ぎている']);
  if (posting.applicants !== null && posting.applicants > policy.maximumApplicants)
    return skip([`応募が${posting.applicants}人。${policy.maximumApplicants}人を超える募集は見送る`]);
  const constraints = readPostingConstraints(posting);
  if (constraints.aiUse === 'not_allowed') return skip(['AIでの制作を認めない募集']);

  const haystack = `${posting.title}\n${posting.category ?? ''}\n${posting.body}`.normalize('NFKC').toLowerCase();
  const matched = input.offers
    .map((offer) => ({ offer, hits: offer.keywords.filter((word) => haystack.includes(word.normalize('NFKC').toLowerCase())).length }))
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.offer.id.localeCompare(b.offer.id));
  if (!matched.length) return skip(['会社が売れる仕事の型に当たらない']);
  const { offer } = matched[0];

  // 提案の段階では、AI使用は「提案文で明示して、採用で承諾をもらう」。
  // 資料は承諾をもらうまで会社の外へ出さない。秘密を含む募集は、承諾の有無によらず会社の中だけで作る。
  const secret = constraints.containsPersonalOrSecretData;
  const placement = decideExecutionPlacement({
    aiUse: 'allowed',
    dataMayLeaveCompany: false,
    containsPersonalOrSecretData: secret,
    humanReviewRequired: true,
  });

  // 参加者の確認の作業料は、この型の確認項目数で決まる。工程の比較に入るよう、確認工程の実費として渡す。
  const judgmentYen = offer.judgmentItems * policy.judgmentQuorum * policy.judgmentRateYen;
  const capabilities = input.capabilities
    .filter((capability) => !(secret && capability.kind === 'reviewer'))
    .map((capability) => (capability.kind === 'reviewer' ? { ...capability, costMinor: judgmentYen } : capability));
  const plan = planRecipes(
    {
      have: offer.have, want: offer.want, budgetMinor: Number.MAX_SAFE_INTEGER,
      ownerMinuteValueMinor: policy.ownerMinuteValueYen, expectedRepeats: 1, keepForSelf: [],
    },
    capabilities,
    input.observations ?? [],
  );
  const recipe = plan.candidates[0] ?? null;
  if (!recipe)
    return skip([`作る工程がまだ無い（足りない素材: ${plan.gap?.missingMaterials.join('・') || '不明'}）`], { offerId: offer.id, placement });

  const reviewerSteps = recipe.steps.filter((step) => step.kind === 'reviewer').length;
  const outsideReview = reviewerSteps > 0;
  const feesYen = reviewerSteps * judgmentYen;
  // 実費は、検収に通るまでのやり直しを見込む。確認の作業料は別枠（検収に通った分だけ払う）。
  const directYen = Math.ceil((recipe.costMinor - feesYen) / recipe.acceptanceRate);
  const keepBps = 10_000 - policy.platformFeeBps - policy.reserveBps;
  const neededYen = Math.ceil(((directYen + feesYen + policy.minimumMarginYen) * 10_000) / keepBps);
  // 500円単位に切り上げる。
  const priceFloor = Math.ceil(Math.max(offer.floorYen, neededYen) / 500) * 500;
  if (posting.budgetMaxYen !== null && posting.budgetMaxYen < priceFloor)
    return skip([`予算の上限${posting.budgetMaxYen}円が、受けられる最低額${priceFloor}円に届かない`], { offerId: offer.id, recipe, placement, outsideReview });
  // 予算の幅の中ほどを出す。上限いっぱいは出さず、最低額は割らない。
  const priceYen = posting.budgetMaxYen === null
    ? priceFloor
    : Math.max(priceFloor, Math.floor(((posting.budgetMinYen ?? priceFloor) + posting.budgetMaxYen) / 2 / 500) * 500);

  const deliverOn = addDays(input.today, offer.deliveryDays);
  if (posting.deliveryOn !== null && posting.deliveryOn < deliverOn)
    return skip([`納品希望日${posting.deliveryOn}に間に合わない（最短${deliverOn}）`], { offerId: offer.id, recipe, placement, outsideReview });

  const quote = checkOrderQuote({
    grossMinor: priceYen,
    platformFeeMinor: Math.ceil((priceYen * policy.platformFeeBps) / 10_000),
    directCostsMinor: directYen,
    reserveBps: policy.reserveBps,
    maximumFeesMinor: feesYen,
  });
  if (!quote.acceptable) return skip(['この額では確認の作業料を払い切れない'], { offerId: offer.id, recipe, placement, outsideReview });

  const winRate = proposalWinRate(input.proposals?.find((item) => item.offerId === offer.id));
  const marginYen = quote.remainingMinor;
  const orderEffortYen = policy.ownerMinutesPerOrder * policy.ownerMinuteValueYen;
  const proposalEffortYen = policy.ownerMinutesPerProposal * policy.ownerMinuteValueYen;
  const reasons = [
    `型「${offer.name}」に該当`,
    `工程: ${recipe.steps.map((step) => step.name).join(' → ')}`,
    constraints.aiUse === 'allowed' ? 'AI使用を認める記載あり' : 'AI使用は未確認。提案文で明示して承諾をもらう',
    secret
      ? '個人情報・秘密を含む可能性。会社の中だけで作る'
      : outsideReview ? '参加者の確認は、依頼者の承諾をもらってから配る' : '会社の中だけで作る',
  ];
  return {
    postingId: posting.id, decision: 'propose', reasons, offerId: offer.id, recipe, placement,
    outsideReview, priceYen, deliverOn, marginYen,
    winRate: Math.round(winRate * 10_000) / 10_000,
    score: Math.round((winRate * (marginYen - orderEffortYen) - proposalEffortYen) * 100) / 100,
  };
}

/**
 * 今日出す提案を選ぶ。上限までしか出さず、得にならないものは出さない。
 * 同じ募集を二度出さないよう、既に提案済みのIDを渡す。
 */
export function selectProposals(
  triaged: readonly GigTriage[],
  policy: GigDeskPolicy,
  state: { proposedToday: number; alreadyProposedIds: readonly string[] },
) {
  validatePolicy(policy);
  requireValue(amount(state?.proposedToday), 'PROPOSED_TODAY', '今日の提案数が不正です。');
  const done = new Set(state.alreadyProposedIds);
  const seen = new Set<string>();
  const ranked = triaged
    .filter((item) => {
      if (item.decision !== 'propose' || item.score <= 0 || done.has(item.postingId) || seen.has(item.postingId)) return false;
      seen.add(item.postingId);
      return true;
    })
    .sort((a, b) => b.score - a.score || a.postingId.localeCompare(b.postingId));
  const room = Math.max(0, policy.dailyProposalLimit - state.proposedToday);
  return { send: ranked.slice(0, room), held: ranked.slice(room) };
}

// ---------------------------------------------------------------------------
// 3. 提案の下書き
// ---------------------------------------------------------------------------

export type ProposalDraft = {
  postingId: string;
  url: string | null;
  priceYen: number;
  deliverOn: string;
  text: string;
  /** 送信は本人だけが行う。 */
  submission: 'owner_only';
};

/**
 * 提案の下書き。額・納品日・納品物・AIを使うこと・人が確認することを必ず入れる。
 * 文面を整えるのは本人か Eve。送信はしない。
 */
export function draftProposal(posting: GigPosting, triage: GigTriage, offer: GigOffer, company: { name: string }): ProposalDraft {
  requireValue(triage.decision === 'propose' && triage.postingId === posting.id && triage.offerId === offer.id && triage.priceYen !== null && triage.deliverOn !== null, 'DRAFT_TRIAGE', '応募すると決めた募集だけ下書きにできます。');
  requireValue(typeof company?.name === 'string' && company.name.trim().length >= 1 && company.name.length <= 60, 'DRAFT_COMPANY', '会社名を指定してください。');
  const text = [
    `${company.name.trim()}です。下記の募集を拝見しました。`,
    `件名: ${posting.title}`,
    '',
    `■ 納品するもの\n${offer.deliverable.trim()}`,
    `■ 金額\n${triage.priceYen.toLocaleString('ja-JP')}円`,
    `■ 納品日\n${triage.deliverOn}`,
    '■ 進め方\n制作にはAIを使い、納品前に当社の担当者が内容を確認します。AIの使用を望まれない場合はお知らせください。',
    triage.outsideReview
      ? '■ お預かりする資料\n当社の管理する環境で扱います。読みやすさの確認を社外の確認者に頼む場合は、見せる範囲を先にお伝えし、承諾をいただいた分だけ見せます。'
      : '■ お預かりする資料\n当社の管理する環境の中だけで扱い、社外の人・端末には出しません。',
    '■ 先に確認したいこと\n・完成の判断基準（何ができていれば完了か）\n・お渡しいただける資料の形式',
  ].join('\n');
  return { postingId: posting.id, url: posting.url, priceYen: triage.priceYen, deliverOn: triage.deliverOn, text, submission: 'owner_only' };
}

// ---------------------------------------------------------------------------
// 4. 受注後、人の確認を参加者へ配る
// ---------------------------------------------------------------------------

export type JudgmentTask = {
  taskId: string;
  orderId: string;
  itemId: string;
  /** 1人が30秒ほどで答えられる問い。 */
  question: string;
  options: readonly string[];
  quorum: number;
  rateYen: number;
};

export type DeskMember = {
  ref: string;
  /** 今回引き受けられる件数。 */
  capacity: number;
  /** 会社の管理下の人か（社員・NDAを結んだ委託先）。 */
  insideCompany: boolean;
};

export type JudgmentAssignment = { taskId: string; itemId: string; memberRef: string };

/** 確認項目を、参加者の携帯で答えられる小さな問いにする。 */
export function planJudgmentTasks(input: {
  orderId: string;
  items: readonly { itemId: string; question: string; options: readonly string[] }[];
  policy: GigDeskPolicy;
}): JudgmentTask[] {
  requireValue(refPattern.test(input?.orderId ?? ''), 'TASK_ORDER', '受注IDが不正です。');
  validatePolicy(input.policy);
  requireValue(Array.isArray(input.items) && input.items.length <= 1_000, 'TASK_ITEMS', '確認項目は1000件までです。');
  const seen = new Set<string>();
  return input.items.map((item) => {
    requireValue(refPattern.test(item.itemId) && !seen.has(item.itemId), 'TASK_ITEM_ID', '確認項目のIDは一意である必要があります。');
    seen.add(item.itemId);
    requireValue(typeof item.question === 'string' && item.question.trim().length >= 2 && item.question.length <= 300, 'TASK_QUESTION', '問いを2〜300文字で書いてください。');
    requireValue(
      Array.isArray(item.options) && item.options.length >= 2 && item.options.length <= 4 &&
        new Set(item.options).size === item.options.length && item.options.every((option: unknown) => typeof option === 'string' && option.trim() !== '' && option.length <= 80),
      'TASK_OPTIONS', '選択肢は重複のない2〜4個です。',
    );
    return {
      taskId: `${input.orderId}:${item.itemId}`, orderId: input.orderId, itemId: item.itemId,
      question: item.question.trim(), options: [...item.options],
      quorum: input.policy.judgmentQuorum, rateYen: input.policy.judgmentRateYen,
    };
  });
}

/**
 * 確認の問いを参加者へ配る。
 * - 1つの問いを同じ人に二度渡さない。
 * - 引き受けが少ない人から順に渡す（特定の人に偏らせない）。
 * - 資料を会社の外へ出せない受注は、会社の管理下の人だけに渡す。
 */
export function assignJudgmentTasks(
  tasks: readonly JudgmentTask[],
  members: readonly DeskMember[],
  placement: ExecutionPlacement,
) {
  requireValue(placement?.placement === 'company_only' || placement?.placement === 'grid_allowed', 'ASSIGN_PLACEMENT', '受けない仕事の確認は配れません。');
  const refs = new Set<string>();
  for (const member of members) {
    requireValue(refPattern.test(member?.ref ?? '') && !refs.has(member.ref), 'ASSIGN_MEMBER', '参加者の参照が不正か重複しています。');
    refs.add(member.ref);
    requireValue(amount(member.capacity) && typeof member.insideCompany === 'boolean', 'ASSIGN_MEMBER', '参加者の件数・所属が不正です。');
  }
  const eligible = members.filter((member) => placement.placement === 'grid_allowed' || member.insideCompany);
  const load = new Map(eligible.map((member) => [member.ref, 0]));
  const assignments: JudgmentAssignment[] = [];
  const short: { taskId: string; missing: number }[] = [];
  for (const task of tasks) {
    const chosen = eligible
      .filter((member) => load.get(member.ref)! < member.capacity)
      .sort((a, b) => load.get(a.ref)! - load.get(b.ref)! || a.ref.localeCompare(b.ref))
      .slice(0, task.quorum);
    for (const member of chosen) {
      load.set(member.ref, load.get(member.ref)! + 1);
      assignments.push({ taskId: task.taskId, itemId: task.itemId, memberRef: member.ref });
    }
    if (chosen.length < task.quorum) short.push({ taskId: task.taskId, missing: task.quorum - chosen.length });
  }
  return { assignments, short, load: [...load.entries()].map(([memberRef, count]) => ({ memberRef, count })) };
}

export type JudgmentAnswer = { taskId: string; memberRef: string; option: string };

/**
 * 集まった答えをまとめる。
 * - 割り当てていない人の答え、同じ人の二度目の答えは数えない。
 * - 過半数がそろった問いだけ結論を出す。割れた問いは会社の人が見る。
 * - 作業料は、結論の出た問いで多数側だった答えに払う（適当に押した答えに払わない）。
 *   割れた問いは答えた全員に払う（割れたのは問いの側の問題）。
 */
export function resolveJudgments(
  tasks: readonly JudgmentTask[],
  assignments: readonly JudgmentAssignment[],
  answers: readonly JudgmentAnswer[],
) {
  const byTask = new Map(tasks.map((task) => [task.taskId, task]));
  const allowed = new Set(assignments.map((item) => `${item.taskId}|${item.memberRef}`));
  const counted = new Set<string>();
  const votes = new Map<string, JudgmentAnswer[]>();
  for (const answer of answers) {
    const task = byTask.get(answer.taskId);
    const key = `${answer.taskId}|${answer.memberRef}`;
    if (!task || !allowed.has(key) || counted.has(key) || !task.options.includes(answer.option)) continue;
    counted.add(key);
    votes.set(answer.taskId, [...(votes.get(answer.taskId) ?? []), answer]);
  }
  const results: { taskId: string; itemId: string; state: 'decided' | 'split' | 'waiting'; option: string | null }[] = [];
  const contributions: Contribution[] = [];
  for (const task of tasks) {
    const cast = votes.get(task.taskId) ?? [];
    if (cast.length < task.quorum) {
      results.push({ taskId: task.taskId, itemId: task.itemId, state: 'waiting', option: null });
      continue;
    }
    const tally = new Map<string, number>();
    for (const vote of cast) tally.set(vote.option, (tally.get(vote.option) ?? 0) + 1);
    const [top] = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const decided = top[1] * 2 > cast.length;
    results.push({ taskId: task.taskId, itemId: task.itemId, state: decided ? 'decided' : 'split', option: decided ? top[0] : null });
    for (const vote of cast) {
      if (decided && vote.option !== top[0]) continue;
      contributions.push({
        id: `${task.taskId}:${vote.memberRef}`, participantRef: vote.memberRef, kind: 'judgment',
        acceptedUnits: 1, unitRateMinor: task.rateYen,
      });
    }
  }
  return { results, contributions, needsCompanyReview: results.filter((item) => item.state === 'split').map((item) => item.itemId) };
}
