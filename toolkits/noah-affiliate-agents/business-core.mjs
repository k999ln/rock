// Public consultation and private reconciliation share this deterministic core.
// No network, customer identity, payment execution, or ASP credentials here.
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const keys = (v, names) =>
  plain(v) && Object.keys(v).every((k) => names.includes(k));
const txt = (v, max = 1000) =>
  typeof v === 'string' &&
  v.trim().length > 0 &&
  v.length <= max &&
  !Array.from(v).some(
    (c) =>
      (c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0))) ||
      c.charCodeAt(0) === 127,
  );
const id = (v) =>
  typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,99}$/.test(v);
const money = (v) => Number.isSafeInteger(v) && v >= 0 && v <= 100000000;
const day = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const check = (yes, message) => {
  if (!yes) throw new Error(message);
};
const boundedRows = (v) => Array.isArray(v) && v.length > 0 && v.length <= 100;
const own = (object, key) => Object.hasOwn(object, key);
export const businessToday = (now = Date.now()) =>
  new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
export const BUSINESS_FIELDS = {
  companyType: {
    type: 'string',
    title: '事業の形',
    enum: ['法人', '個人事業主', '個人'],
  },
  role: {
    type: 'string',
    title: 'あなたの立場',
    enum: ['経営・決裁者', '導入・研修の担当', 'その他'],
  },
  goal: {
    type: 'string',
    title: '取り組みたいこと',
    enum: [
      '社員のsi活用・研修',
      '実装の伴走',
      '業務を外注',
      'システム開発',
      'まず整理したい',
    ],
  },
  workflow: {
    type: 'string',
    title: '今の作業と困り事',
    description: '社名・顧客名・個人情報・社外秘を含めずに記入',
    minLength: 5,
    maxLength: 1200,
  },
  monthlyCount: {
    type: 'integer',
    title: '月に行う回数',
    minimum: 1,
    maximum: 100000,
  },
  minutesEach: {
    type: 'integer',
    title: '1回にかかる分数',
    minimum: 1,
    maximum: 10000,
  },
  teamSize: {
    type: 'integer',
    title: '関係する人数',
    minimum: 1,
    maximum: 10000,
  },
  timeframe: {
    type: 'string',
    title: '希望時期',
    enum: ['1か月以内', '3か月以内', '半年以内', '未定'],
  },
  companyEmailAvailable: {
    type: 'boolean',
    title: '申込時に会社のメールアドレスを使える',
  },
  priorContact: { type: 'boolean', title: '紹介先への過去の申込・相談がある' },
  wantsConsultation: {
    type: 'boolean',
    title: '必要が合えば研修の相談を検討する',
  },
  hourlyCostYen: {
    type: 'integer',
    title: '1時間の人件費の目安（円・任意）',
    minimum: 0,
    maximum: 100000,
  },
  campaign: {
    type: 'string',
    title: '案内元の識別名（任意）',
    pattern: '^[a-z0-9][a-z0-9.-]{0,49}$',
    maxLength: 50,
  },
};
export const BUSINESS_REQUIRED = Object.keys(BUSINESS_FIELDS).filter(
  (k) => !['hourlyCostYen', 'campaign'].includes(k),
);
export function validateBusinessConfig(v) {
  check(
    keys(v, [
      'schema',
      'checkedAt',
      'validUntil',
      'offerId',
      'publicName',
      'publicDescription',
      'affiliateUrl',
      'partnered',
      'mediaApproved',
      'contentApproved',
      'approvalReference',
      'channels',
      'rewardYen',
      'approvalDays',
      'enabled',
      'registeredArticle',
      'trackingApproved',
    ]),
    '設定の形式を確認してください。',
  );
  check(
    v.schema === 'noah-business-config/1' &&
      day(v.checkedAt) &&
      day(v.validUntil) &&
      v.validUntil >= v.checkedAt &&
      Date.parse(v.validUntil) - Date.parse(v.checkedAt) <= 30 * 86400000,
    '条件の確認日と期限を確認してください。',
  );
  check(
    id(v.offerId) &&
      txt(v.publicName, 120) &&
      txt(v.publicDescription, 500) &&
      money(v.rewardYen) &&
      Number.isInteger(v.approvalDays) &&
      v.approvalDays >= 1 &&
      v.approvalDays <= 180,
    '案件設定を確認してください。',
  );
  check(
    ['partnered', 'mediaApproved', 'contentApproved', 'enabled'].every(
      (k) => typeof v[k] === 'boolean',
    ) &&
      Array.isArray(v.channels) &&
      v.channels.every((x) => ['web', 'chat', 'social', 'email'].includes(x)),
    '掲載設定を確認してください。',
  );
  check(
    v.approvalReference === null || txt(v.approvalReference, 200),
    '掲載証拠を確認してください。',
  );
  check(
    v.affiliateUrl === null || validBusinessLink(v.affiliateUrl),
    '媒体用の正式広告URLを指定してください。',
  );
  check(
    v.trackingApproved === undefined || typeof v.trackingApproved === 'boolean',
    '追跡許可の形式を確認してください。',
  );
  if (v.registeredArticle !== undefined) {
    const a = v.registeredArticle;
    check(
      keys(a, [
        'url',
        'mediaOrigin',
        'siteId',
        'approved',
        'tagVerified',
        'reference',
      ]) &&
        typeof a.approved === 'boolean' &&
        typeof a.tagVerified === 'boolean' &&
        /^\d+$/.test(a.siteId) &&
        txt(a.reference, 200),
      '登録媒体の証拠を確認してください。',
    );
    let valid = false;
    try {
      const u = new URL(a.url),
        origin = new URL(a.mediaOrigin);
      valid =
        u.protocol === 'https:' &&
        u.origin === a.mediaOrigin &&
        origin.pathname === '/' &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        u.pathname !== '/' &&
        validBusinessLink(v.affiliateUrl) &&
        new URL(v.affiliateUrl).searchParams.get('idx').split('.')[2] ===
          a.siteId;
    } catch {
      /* Invalid destinations stay closed. */
    }
    check(valid, '登録媒体の記事と正式タグのサイトIDを確認してください。');
  }
  return v;
}
export function businessReferralUrl(config, uix) {
  const c = validateBusinessConfig(config);
  if (c.registeredArticle) return c.registeredArticle.url;
  return c.trackingApproved === true
    ? withTracking(c.affiliateUrl, uix)
    : c.affiliateUrl;
}
export function validBusinessLink(value) {
  try {
    const u = new URL(value),
      names = [...u.searchParams.keys()];
    return (
      u.origin === 'https://www.rentracks.jp' &&
      u.pathname === '/adx/r.html' &&
      !u.hash &&
      !u.username &&
      !u.password &&
      names.length === 2 &&
      new Set(names).size === 2 &&
      names.every((k) => ['idx', 'dna'].includes(k)) &&
      /^\d+(?:\.\d+){4}$/.test(u.searchParams.get('idx') || '') &&
      /^\d+$/.test(u.searchParams.get('dna') || '')
    );
  } catch {
    return false;
  }
}
export function businessBlockers(config, channel, now = Date.now()) {
  const c = validateBusinessConfig(config),
    today = businessToday(now);
  return [
    !c.enabled && '紹介停止中',
    !c.partnered && '未提携',
    (c.registeredArticle ? !c.registeredArticle.approved : !c.mediaApproved) &&
      '掲載媒体の許可未確認',
    c.registeredArticle &&
      !c.registeredArticle.tagVerified &&
      '記事内の正式タグ未確認',
    !c.contentApproved && '公開文面未確認',
    !c.approvalReference && '許可の証拠なし',
    !c.affiliateUrl && '正式リンク未設定',
    !c.channels.includes(channel) && 'この経路の許可未確認',
    (today < c.checkedAt || today > c.validUntil) && '条件の確認期限外',
  ].filter(Boolean);
}
export function prepareBusinessBrief(input) {
  check(
    keys(input, Object.keys(BUSINESS_FIELDS)) &&
      BUSINESS_REQUIRED.every((k) => own(input, k)),
    '必須項目を確認してください。',
  );
  for (const [key, f] of Object.entries(BUSINESS_FIELDS)) {
    if (!own(input, key)) continue;
    const v = input[key];
    check(
      f.type === 'boolean'
        ? typeof v === 'boolean'
        : f.enum
          ? f.enum.includes(v)
          : f.type === 'integer'
            ? Number.isSafeInteger(v) && v >= f.minimum && v <= f.maximum
            : txt(v, f.maxLength) &&
              (!f.minLength || v.trim().length >= f.minLength) &&
              (!f.pattern || new RegExp(f.pattern).test(v)),
      `${f.title}を確認してください。`,
    );
  }
  const reasons = [
    input.companyType !== '法人' && 'この紹介先は法人向けです。',
    input.goal !== '社員のsi活用・研修' &&
      '今回の希望は研修以外です。まず目的に合う進め方を整理しましょう。',
    input.role === 'その他' && '研修・導入を検討する担当者と確認してください。',
    !input.companyEmailAvailable && '申込には会社のメールが必要です。',
    input.priorContact && '既に申込・相談した場合は新規紹介の対象にしません。',
    !input.wantsConsultation &&
      '相談を希望しないため、整理票だけを作成しました。',
  ].filter(Boolean);
  const hours =
    Math.round(((input.monthlyCount * input.minutesEach) / 60) * 100) / 100;
  const text = [
    `# 法人のsi導入準備票`,
    `## 現在の業務`,
    input.workflow.trim(),
    `月${input.monthlyCount}回 × 1回${input.minutesEach}分 = 月${hours.toLocaleString('ja-JP')}時間。関係者${input.teamSize}人。人数は時間に掛け直していません。`,
    ...(input.hourlyCostYen !== undefined
      ? [
          `入力した時間単価${input.hourlyCostYen.toLocaleString('ja-JP')}円による現状原価の試算: 月${Math.round(hours * input.hourlyCostYen).toLocaleString('ja-JP')}円。削減額の予測ではありません。`,
        ]
      : []),
    `## 希望`,
    `${input.goal} / ${input.timeframe}`,
    `## 最初に試すこと`,
    `1. 作業の入力・手順・完成の条件を一つの実例にまとめる。`,
    `2. 秘密情報を除いた例で下書きを作り、人が確認する工程を残す。`,
    `3. 導入前後の所要時間、修正回数、確認の手間を同じ条件で比べる。`,
    `## 相談で確認すること`,
    `・この業務を教材にできるか。対象者の経験に合う研修か。`,
    `・社内情報の扱い、利用するサービス、費用、伴走期間。`,
    `・研修後に誰が運用し、何をもって使えると判断するか。`,
    `## 問い合わせ文の下書き`,
    `「${input.goal}を検討しています。対象は月${input.monthlyCount}回、1回${input.minutesEach}分の作業で、${input.teamSize}人が関わります。希望時期は${input.timeframe}です。研修の対象・実務への適用・費用を相談したいです。」`,
    ...reasons.map((x) => `確認: ${x}`),
    `この整理票は申込なしでも使えます。研修の契約・料金は相談とは別です。`,
  ].join('\n\n');
  return {
    schema: 'noah-business-brief/1',
    eligible: reasons.length === 0,
    reasons,
    hoursPerMonth: hours,
    estimatedCurrentCostYen:
      input.hourlyCostYen === undefined
        ? null
        : Math.round(hours * input.hourlyCostYen),
    text,
    campaign: input.campaign || 'direct',
  };
}
export function withTracking(base, uix) {
  check(
    validBusinessLink(base) && /^nb\.[a-f0-9]{32}$/.test(uix),
    '計測リンクの形式を確認してください。',
  );
  const u = new URL(base);
  u.searchParams.set('uix', uix);
  return u.href;
}
export function emptyBusinessLedger() {
  return {
    schema: 'noah-business-ledger/1',
    revision: 0,
    campaigns: {},
    leads: {},
    conversions: {},
    payouts: {},
    deposits: {},
    costs: {},
    events: {},
  };
}
export function validateLedger(s) {
  check(
    keys(s, [
      'schema',
      'revision',
      'campaigns',
      'leads',
      'conversions',
      'payouts',
      'deposits',
      'costs',
      'events',
    ]) &&
      s.schema === 'noah-business-ledger/1' &&
      Number.isSafeInteger(s.revision) &&
      s.revision >= 0,
    '台帳形式を確認してください。',
  );
  for (const k of [
    'campaigns',
    'leads',
    'conversions',
    'payouts',
    'deposits',
    'costs',
    'events',
  ])
    check(
      plain(s[k]) && Object.keys(s[k]).length <= 5000,
      '台帳の上限です。書き出して運用単位を分けてください。',
    );
  return s;
}
function evidence(v) {
  return txt(v, 160) && !/[\r\n]/.test(v);
}
function appendRows(target, rows, validate) {
  check(boundedRows(rows), '1回の取込は1〜100行にしてください。');
  const seen = new Set();
  for (const row of rows) {
    validate(row);
    check(!seen.has(row.id), '同じファイル内に重複IDがあります。');
    seen.add(row.id);
    if (own(target, row.id))
      check(
        JSON.stringify(target[row.id]) === JSON.stringify(row),
        '同一IDの内容が異なります。修正方法を確認してください。',
      );
    else target[row.id] = structuredClone(row);
  }
}
export function applyBusinessCommand(current, command, now = Date.now()) {
  const s = structuredClone(validateLedger(current));
  check(
    keys(command, ['requestId', 'expectedRevision', 'action', 'payload']) &&
      id(command.requestId) &&
      Number.isSafeInteger(command.expectedRevision) &&
      plain(command.payload),
    '操作形式を確認してください。',
  );
  const fingerprint = JSON.stringify({
    action: command.action,
    payload: command.payload,
  });
  if (own(s.events, command.requestId)) {
    check(
      s.events[command.requestId].fingerprint === fingerprint,
      '同じ操作IDに異なる内容があります。',
    );
    return { state: s, duplicate: true };
  }
  check(
    command.expectedRevision === s.revision,
    '台帳が更新されています。再取得してください。',
  );
  const p = command.payload,
    date = businessToday(now);
  if (command.action === 'campaign') {
    check(
      keys(p, [
        'id',
        'channel',
        'landingUrl',
        'title',
        'budgetYen',
        'confirmed',
      ]) &&
        id(p.id) &&
        ['social', 'email', 'web'].includes(p.channel) &&
        txt(p.title, 120) &&
        money(p.budgetYen) &&
        p.confirmed === true,
      '集客計画の形式を確認してください。',
    );
    const u = new URL(p.landingUrl);
    check(
      u.protocol === 'https:' &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash,
      '公開の入力ページURLを指定してください。',
    );
    appendRows(s.campaigns, [p], () => {});
  } else if (command.action === 'import_conversions') {
    check(keys(p, ['rows']), '追加の列は送信しないでください。');
    check(boundedRows(p.rows), '成果は1〜100行にしてください。');
    const seen = new Set();
    for (const row of p.rows) {
      check(
        keys(row, [
          'id',
          'offerId',
          'uix',
          'occurredOn',
          'status',
          'rewardYen',
          'decisionOn',
          'reason',
          'sourceRef',
          'observedOn',
        ]) &&
          id(row.id) &&
          id(row.offerId) &&
          (row.uix === null || /^nb\.[a-f0-9]{32}$/.test(row.uix)) &&
          day(row.occurredOn) &&
          ['pending', 'approved', 'rejected'].includes(row.status) &&
          money(row.rewardYen) &&
          day(row.observedOn) &&
          row.observedOn <= date &&
          row.observedOn >= row.occurredOn &&
          evidence(row.sourceRef),
        'ASP成果の必須列を確認してください。',
      );
      check(
        row.status === 'pending'
          ? row.decisionOn === null
          : day(row.decisionOn) &&
              row.decisionOn >= row.occurredOn &&
              row.decisionOn <= row.observedOn,
        '承認/否認日を確認してください。',
      );
      check(
        row.reason === null || txt(row.reason, 250),
        '否認理由を確認してください。',
      );
      check(!seen.has(row.id), '同一取込内の成果ID重複です。');
      seen.add(row.id);
      const old = own(s.conversions, row.id) ? s.conversions[row.id] : null;
      if (old) {
        check(
          old.offerId === row.offerId &&
            old.uix === row.uix &&
            old.occurredOn === row.occurredOn,
          '成果の識別情報は変更できません。',
        );
        check(
          row.observedOn >= old.observedOn,
          '古いASP情報で上書きできません。',
        );
        const paid = Object.values(s.payouts).some((x) =>
          x.conversionIds.includes(row.id),
        );
        check(
          !paid ||
            (old.status === row.status &&
              old.rewardYen === row.rewardYen &&
              old.decisionOn === row.decisionOn),
          '支払に紐付いた成果は変更できません。差異を調査してください。',
        );
        check(
          old.status === 'pending' || old.status === row.status,
          '確定済み成果の状態変更は差異として調査してください。',
        );
      }
      s.conversions[row.id] = structuredClone(row);
    }
  } else if (command.action === 'import_payouts') {
    check(keys(p, ['rows']), '追加の列は送信しないでください。');
    appendRows(s.payouts, p.rows, (row) => {
      check(
        keys(row, [
          'id',
          'conversionIds',
          'adjustmentsYen',
          'adjustmentReason',
          'amountYen',
          'paidOn',
          'sourceRef',
        ]) &&
          id(row.id) &&
          Array.isArray(row.conversionIds) &&
          row.conversionIds.length > 0 &&
          row.conversionIds.length <= 500 &&
          new Set(row.conversionIds).size === row.conversionIds.length &&
          row.conversionIds.every(id) &&
          money(row.amountYen) &&
          Number.isSafeInteger(row.adjustmentsYen) &&
          Math.abs(row.adjustmentsYen) <= 100000000 &&
          day(row.paidOn) &&
          row.paidOn <= date &&
          evidence(row.sourceRef),
        '支払履歴の列を確認してください。',
      );
      check(
        row.adjustmentsYen === 0
          ? row.adjustmentReason === null
          : evidence(row.adjustmentReason),
        '調整額の根拠を指定してください。',
      );
      const used = new Set(
        Object.values(s.payouts)
          .filter((x) => x.id !== row.id)
          .flatMap((x) => x.conversionIds),
      );
      let sum = 0;
      for (const cid of row.conversionIds) {
        const c = s.conversions[cid];
        check(
          c &&
            c.status === 'approved' &&
            c.decisionOn <= row.paidOn &&
            !used.has(cid),
          '未承認または別支払に計上済みの成果があります。',
        );
        sum += c.rewardYen;
      }
      check(
        sum + row.adjustmentsYen === row.amountYen,
        '承認合計と支払額が一致しません。差額の根拠を確認してください。',
      );
    });
  } else if (command.action === 'import_deposits') {
    check(keys(p, ['rows']), '口座番号・名義などの列は送信しないでください。');
    appendRows(s.deposits, p.rows, (row) => {
      check(
        keys(row, ['id', 'payoutId', 'amountYen', 'receivedOn', 'sourceRef']) &&
          id(row.id) &&
          id(row.payoutId) &&
          money(row.amountYen) &&
          day(row.receivedOn) &&
          row.receivedOn <= date &&
          evidence(row.sourceRef),
        '銀行入金の必要列を確認してください。',
      );
      check(
        s.payouts[row.payoutId] &&
          row.amountYen === s.payouts[row.payoutId].amountYen &&
          row.receivedOn >= s.payouts[row.payoutId].paidOn,
        '支払履歴と銀行入金の金額・日付が一致しません。',
      );
      check(
        !Object.values(s.deposits).some(
          (d) => d.id !== row.id && d.payoutId === row.payoutId,
        ),
        'この支払は既に入金照合済みです。',
      );
    });
  } else if (command.action === 'import_costs') {
    check(keys(p, ['rows']), '費用の列を確認してください。');
    appendRows(s.costs, p.rows, (row) =>
      check(
        keys(row, [
          'id',
          'campaign',
          'category',
          'amountYen',
          'incurredOn',
          'sourceRef',
        ]) &&
          id(row.id) &&
          id(row.campaign) &&
          own(s.campaigns, row.campaign) &&
          ['content', 'distribution', 'labor', 'compute', 'fixed'].includes(
            row.category,
          ) &&
          money(row.amountYen) &&
          day(row.incurredOn) &&
          row.incurredOn <= date &&
          evidence(row.sourceRef),
        '費用は既存キャンペーンと証拠に結び付けてください。',
      ),
    );
  } else throw new Error('対応していない操作です。');
  s.revision++;
  s.events[command.requestId] = {
    action: command.action,
    fingerprint,
    at: new Date(now).toISOString(),
    revision: s.revision,
  };
  validateLedger(s);
  check(
    JSON.stringify(s).length <= 4000000,
    '台帳容量の上限です。書き出して運用単位を分けてください。',
  );
  return { state: s, duplicate: false };
}
export function campaignDraft(c, config, now = Date.now()) {
  const blockers = businessBlockers(config, c.channel, now);
  const u = new URL(c.landingUrl);
  u.searchParams.set('campaign', c.id);
  return {
    campaign: c.id,
    status: 'draft',
    readyToPublish: blockers.length === 0,
    blockers,
    landingUrl: u.href,
    text: `【広告・公開前の下書き】\n毎月繰り返す作業を整理して、si研修で何を学びたいかを明確にしませんか。作業の回数と時間から、現状の業務表と相談用の質問票を作れます。相談票の作成は無料、申込なしでも受け取れます。\n${u.href}\n必要が合う場合に紹介先を案内します。紹介リンク経由の申込で運営者に報酬が発生する場合があります。研修自体の契約・費用は別です。`,
    schedule: [
      '業務棚卸しの実例と入力ページ',
      '人が確認すべき工程のチェックリスト',
      '研修と外注の使い分け',
      '相談時に確認する費用・運用の質問',
    ],
    published: false,
  };
}
export function businessReport(raw, config, now = Date.now()) {
  const s = validateLedger(raw),
    all = Object.values(s.conversions),
    payouts = Object.values(s.payouts),
    deposits = Object.values(s.deposits),
    leadByUix = new Map(Object.values(s.leads).map((l) => [l.uix, l]));
  const paidPayouts = new Set(deposits.map((d) => d.payoutId));
  const cashIds = new Set(
    payouts
      .filter((p) => paidPayouts.has(p.id))
      .flatMap((p) => p.conversionIds),
  );
  const sum = (rows) => rows.reduce((a, c) => a + c.rewardYen, 0),
    approved = all.filter((c) => c.status === 'approved'),
    pending = all.filter((c) => c.status === 'pending');
  const paid = deposits.reduce((a, d) => a + d.amountYen, 0),
    attributable = all.filter(
      (c) =>
        cashIds.has(c.id) &&
        c.offerId === config.offerId &&
        leadByUix.has(c.uix),
    ),
    attributableYen = sum(attributable),
    adjustments = payouts
      .filter((p) => paidPayouts.has(p.id))
      .reduce((n, p) => n + p.adjustmentsYen, 0),
    cost = Object.values(s.costs).reduce((a, c) => a + c.amountYen, 0);
  const campaigns = Object.values(s.campaigns).map((c) => {
    const leads = Object.values(s.leads).filter((l) => l.campaign === c.id),
      conv = all.filter(
        (x) =>
          x.offerId === config.offerId &&
          leadByUix.get(x.uix)?.campaign === c.id,
      ),
      a = conv.filter((x) => x.status === 'approved'),
      r = conv.filter((x) => x.status === 'rejected');
    return {
      id: c.id,
      budgetYen: c.budgetYen,
      consultations: leads.length,
      qualified: leads.filter((l) => l.eligible).length,
      linksIssued: leads.filter((l) => l.referralIssued).length,
      generated: conv.length,
      pending: conv.filter((x) => x.status === 'pending').length,
      approved: a.length,
      rejected: r.length,
      approvedYen: sum(a),
      cashMatchedApprovedYen: sum(conv.filter((x) => cashIds.has(x.id))),
      costYen: Object.values(s.costs)
        .filter((x) => x.campaign === c.id)
        .reduce((n, x) => n + x.amountYen, 0),
      approvalRate:
        a.length + r.length ? a.length / (a.length + r.length) : null,
    };
  });
  const overdue = pending
    .filter(
      (c) =>
        Date.parse(businessToday(now)) - Date.parse(c.occurredOn) >
        config.approvalDays * 86400000,
    )
    .map((c) => c.id);
  return {
    schema: 'noah-business-report/1',
    offerId: config.offerId,
    revision: s.revision,
    totals: {
      pendingYen: sum(pending),
      approvedYen: sum(approved),
      payoutReportedYen: payouts.reduce((a, p) => a + p.amountYen, 0),
      bankMatchedYen: paid,
      costYen: cost,
      attributedApprovedCashYen: attributableYen,
      unallocatedAdjustmentsYen: adjustments,
      attributedCashLessCostsBeforeAdjustmentsYen: attributableYen - cost,
    },
    campaigns,
    unmatchedConversions: all
      .filter((c) => !leadByUix.has(c.uix))
      .map((c) => c.id),
    overdue,
    unmatchedPayouts: payouts
      .filter((p) => !paidPayouts.has(p.id))
      .map((p) => p.id),
    rejectedReasons: all
      .filter((c) => c.status === 'rejected')
      .map((c) => ({ id: c.id, reason: c.reason || 'ASPで理由を確認' })),
    launchBlockers: businessBlockers(config, 'web', now),
    nextPaymentRule:
      '承認月の翌月末。銀行休業日は翌営業日。最低支払額に満たない分は繰越。承認期限の超過を自動承認にしない。',
    note: '取込元は所有者が確認したASP履歴・銀行入金明細。金額一致だけで銀行APIによる確認と呼ばない。全体の銀行照合額は支払調整込み、キャンペーン別は照合された成果額で調整前。申込数・承認額・入金を分離する。',
  };
}
