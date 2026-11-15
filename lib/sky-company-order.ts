/**
 * Sky company order — 会社が元請けとして仕事を受け、外から入った現金だけを分ける台帳の計算。
 *
 * 決めていること:
 * - 顧客と契約するのは会社。参加者は顧客と直接取引しない。
 * - 参加者への支払いは2層。
 *   1. 作業料: 事前に決めた単価 × 検収に通った量。顧客の入金を待たず会社の債務になる。
 *   2. 配当: 実際に入金された額から費用を引いた残りの一部を、参加者で等分する。
 * - 配当の原資は外部から実際に入った現金だけ。見込み・社内取引・Agent同士の発注は原資にしない。
 * - この計算は記帳も送金もしない。Walletへの記帳と支払いは本人の承認後、別の経路で行う。
 */

export type OrderChannel = 'direct' | 'coconala' | 'lancers' | 'crowdworks' | 'upwork' | 'fiverr';

export type OrderConstraints = {
  /** 案件・販売先がAIでの制作を認めているか。未確認は不可として扱う。 */
  aiUse: 'allowed' | 'not_allowed' | 'unconfirmed';
  /** 顧客の資料を会社の管理外の端末・人へ出してよいと、顧客が書面で認めているか。 */
  dataMayLeaveCompany: boolean;
  /** 資料に個人情報・秘密が含まれるか。 */
  containsPersonalOrSecretData: boolean;
  /** 納品前に会社の人が確認する必要があるか。 */
  humanReviewRequired: boolean;
};

export type ExecutionPlacement = {
  /** blocked: 受けない / company_only: 会社の管理下だけ / grid_allowed: 参加者の端末・人も使える */
  placement: 'blocked' | 'company_only' | 'grid_allowed';
  reasons: string[];
  humanReviewRequired: boolean;
};

/** 案件の条件から、仕事をどこで実行してよいかを決める。迷う条件は狭い側へ倒す。 */
export function decideExecutionPlacement(constraints: OrderConstraints): ExecutionPlacement {
  const reasons: string[] = [];
  if (constraints.aiUse !== 'allowed') {
    reasons.push(constraints.aiUse === 'not_allowed' ? 'AIでの制作が認められていない案件' : 'AI使用の可否が未確認');
    return { placement: 'blocked', reasons, humanReviewRequired: true };
  }
  if (constraints.containsPersonalOrSecretData) reasons.push('個人情報・秘密を含む資料は会社の管理下だけで扱う');
  if (!constraints.dataMayLeaveCompany) reasons.push('資料を会社の外へ出す承諾がない');
  return {
    placement: reasons.length ? 'company_only' : 'grid_allowed',
    reasons,
    humanReviewRequired: constraints.humanReviewRequired,
  };
}

export type ContributionKind =
  /** 検証に通った計算（Compute Gridのusage receipt）。 */
  | 'compute'
  /** 人にしかできない確認・判断（好み、読みやすさ、現地確認）。 */
  | 'judgment'
  /** 顧客・案件を連れてきた。 */
  | 'referral';

export type Contribution = {
  id: string;
  participantRef: string;
  kind: ContributionKind;
  /** 検収に通った量だけを入れる。稼働時間・台数は入れない。 */
  acceptedUnits: number;
  /** 割当時に決めた単価（最小通貨単位）。 */
  unitRateMinor: number;
};

export type CompanyOrderSettlementInput = {
  orderId: string;
  /** 顧客から実際に入金された額。見込み額は入れない。 */
  cashReceivedMinor: number;
  refundsMinor: number;
  platformFeeMinor: number;
  /** 外部へ払った実費（AI API、検証用の再計算、通信）。 */
  directCostsMinor: number;
  /** 返金・やり直しに備えて残す率（basis points）。 */
  reserveBps: number;
  /** 余剰のうち参加者へ配当する率（basis points）。残りは会社。 */
  dividendBps: number;
  contributions: readonly Contribution[];
  /** 配当を受ける参加者。寄与がない月の参加者も含められる。 */
  dividendParticipants: readonly string[];
};

export type ParticipantLine = {
  participantRef: string;
  feeMinor: number;
  dividendMinor: number;
  totalMinor: number;
};

export type CompanyOrderSettlement = {
  orderId: string;
  netCashMinor: number;
  feesMinor: number;
  reserveMinor: number;
  /** 作業料と費用を引いた後の余剰。負なら会社の持ち出し。 */
  surplusMinor: number;
  dividendPoolMinor: number;
  companyMinor: number;
  lines: ParticipantLine[];
  /** 余剰が負のとき、会社が負担する額。配当は0になる。 */
  companyShortfallMinor: number;
  recordingAllowed: false;
  payoutAllowed: false;
};

export class CompanyOrderError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function requireValue(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new CompanyOrderError(code, message);
}

const refPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/u;
const amount = (value: number) => Number.isSafeInteger(value) && value >= 0;
const bps = (value: number) => Number.isInteger(value) && value >= 0 && value <= 10_000;

/**
 * 見積り時点の確認。全量が検収に通っても作業料を払い切れる受注額かを見る。
 * 通らない見積りは出さない（参加者への未払いを作らないため）。
 */
export function checkOrderQuote(input: {
  grossMinor: number;
  platformFeeMinor: number;
  directCostsMinor: number;
  reserveBps: number;
  maximumFeesMinor: number;
}) {
  requireValue(
    amount(input.grossMinor) && amount(input.platformFeeMinor) && amount(input.directCostsMinor) && amount(input.maximumFeesMinor) && bps(input.reserveBps),
    'QUOTE_INPUT',
    '見積りの金額・率を確認してください。',
  );
  const reserveMinor = Math.ceil((input.grossMinor * input.reserveBps) / 10_000);
  const remainingMinor = input.grossMinor - input.platformFeeMinor - input.directCostsMinor - reserveMinor - input.maximumFeesMinor;
  return { acceptable: remainingMinor >= 0, reserveMinor, remainingMinor };
}

/** 外から入った現金を、作業料・予備・配当・会社へ分ける。合計は必ず入金額と一致する。 */
export function settleCompanyOrder(input: CompanyOrderSettlementInput): CompanyOrderSettlement {
  requireValue(refPattern.test(input?.orderId ?? ''), 'ORDER_ID', '受注IDが不正です。');
  requireValue(
    amount(input.cashReceivedMinor) && amount(input.refundsMinor) && amount(input.platformFeeMinor) && amount(input.directCostsMinor),
    'ORDER_AMOUNT',
    '金額は0以上の整数で指定してください。',
  );
  requireValue(input.refundsMinor <= input.cashReceivedMinor, 'ORDER_REFUND', '返金額が入金額を超えています。');
  requireValue(bps(input.reserveBps) && bps(input.dividendBps), 'ORDER_BPS', '率はbasis pointsで指定してください。');

  const fees = new Map<string, number>();
  const seen = new Set<string>();
  for (const item of input.contributions) {
    requireValue(refPattern.test(item.id) && !seen.has(item.id), 'CONTRIBUTION_ID', '寄与IDは一意である必要があります。同じ寄与を二重に数えられません。');
    seen.add(item.id);
    requireValue(refPattern.test(item.participantRef), 'CONTRIBUTION_PARTICIPANT', '参加者の参照が不正です。');
    requireValue(item.kind === 'compute' || item.kind === 'judgment' || item.kind === 'referral', 'CONTRIBUTION_KIND', '寄与の種類が不正です。');
    requireValue(amount(item.acceptedUnits) && amount(item.unitRateMinor), 'CONTRIBUTION_AMOUNT', '検収量と単価は0以上の整数で指定してください。');
    const fee = item.acceptedUnits * item.unitRateMinor;
    requireValue(Number.isSafeInteger(fee), 'CONTRIBUTION_AMOUNT', '作業料が大きすぎます。');
    fees.set(item.participantRef, (fees.get(item.participantRef) ?? 0) + fee);
  }
  const participants = [...new Set(input.dividendParticipants)];
  requireValue(
    participants.length === input.dividendParticipants.length && participants.every((ref) => refPattern.test(ref)),
    'DIVIDEND_PARTICIPANT',
    '配当の参加者が不正か重複しています。',
  );

  const netCashMinor = input.cashReceivedMinor - input.refundsMinor;
  const feesMinor = [...fees.values()].reduce((sum, value) => sum + value, 0);
  const reserveMinor = Math.ceil((netCashMinor * input.reserveBps) / 10_000);
  const surplusMinor = netCashMinor - input.platformFeeMinor - input.directCostsMinor - reserveMinor - feesMinor;
  // 配当は実際に残った現金からだけ。余剰が無ければ0。
  const dividendPoolMinor = participants.length && surplusMinor > 0
    ? Math.floor((surplusMinor * input.dividendBps) / 10_000)
    : 0;
  const share = participants.length ? Math.floor(dividendPoolMinor / participants.length) : 0;
  // 端数は参照の順で1ずつ配る。誰が何回目に得をするかを入力順に依存させない。
  const ordered = [...participants].sort();
  const remainder = dividendPoolMinor - share * participants.length;
  const dividends = new Map(ordered.map((ref, index) => [ref, share + (index < remainder ? 1 : 0)]));

  const lines = [...new Set([...fees.keys(), ...ordered])].sort().map((participantRef): ParticipantLine => {
    const feeMinor = fees.get(participantRef) ?? 0;
    const dividendMinor = dividends.get(participantRef) ?? 0;
    return { participantRef, feeMinor, dividendMinor, totalMinor: feeMinor + dividendMinor };
  });
  const companyMinor = surplusMinor - dividendPoolMinor;
  const paidOut = lines.reduce((sum, line) => sum + line.totalMinor, 0);
  requireValue(
    paidOut + input.platformFeeMinor + input.directCostsMinor + reserveMinor + companyMinor === netCashMinor,
    'SETTLEMENT_BALANCE',
    '分配の合計が入金額と一致しません。',
  );
  return {
    orderId: input.orderId,
    netCashMinor,
    feesMinor,
    reserveMinor,
    surplusMinor,
    dividendPoolMinor,
    companyMinor,
    lines,
    companyShortfallMinor: surplusMinor < 0 ? -surplusMinor : 0,
    recordingAllowed: false,
    payoutAllowed: false,
  };
}

/**
 * 「全員に毎月いくら配れるか」を、実績の余剰から逆算する。
 * 約束できる額は、過去の実際の配当原資を人数で割った額まで。
 */
export function basicIncomeCoverage(input: {
  /** 直近の実績。各月に実際に配当へ回せた額。 */
  monthlyDividendPoolsMinor: readonly number[];
  participants: number;
  /** 1人に毎月配りたい額。 */
  targetPerPersonMinor: number;
}) {
  requireValue(
    Array.isArray(input.monthlyDividendPoolsMinor) && input.monthlyDividendPoolsMinor.length >= 1 &&
      input.monthlyDividendPoolsMinor.length <= 120 && input.monthlyDividendPoolsMinor.every(amount),
    'COVERAGE_HISTORY',
    '配当原資の実績を1〜120か月分で指定してください。',
  );
  requireValue(Number.isSafeInteger(input.participants) && input.participants >= 1, 'COVERAGE_PARTICIPANTS', '人数は1以上の整数で指定してください。');
  requireValue(amount(input.targetPerPersonMinor), 'COVERAGE_TARGET', '目標額は0以上の整数で指定してください。');
  // 約束の基準は平均ではなく最も少なかった月。少ない月にも払える額だけを約束できる。
  const worstMonthMinor = Math.min(...input.monthlyDividendPoolsMinor);
  const sustainablePerPersonMinor = Math.floor(worstMonthMinor / input.participants);
  const requiredMonthlyPoolMinor = input.targetPerPersonMinor * input.participants;
  requireValue(Number.isSafeInteger(requiredMonthlyPoolMinor), 'COVERAGE_TARGET', '目標総額が大きすぎます。');
  return {
    sustainablePerPersonMinor,
    requiredMonthlyPoolMinor,
    monthlyGapMinor: Math.max(0, requiredMonthlyPoolMinor - worstMonthMinor),
    coverageBps: requiredMonthlyPoolMinor === 0
      ? 10_000
      : Math.min(10_000, Math.floor((worstMonthMinor * 10_000) / requiredMonthlyPoolMinor)),
    promiseAllowed: sustainablePerPersonMinor >= input.targetPerPersonMinor,
  };
}
