import { validBusinessLink } from './business-core.mjs';
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
const key = (value) =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,70}$/.test(value);
const text = (value, max = 2000) =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
const date = (value) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
export function validateCombinationConfig(config) {
  assert(
    config?.schema === 'noah-combinations/1' &&
      Array.isArray(config.schemes) &&
      config.schemes.length <= 100,
    '組み合わせ設定が不正です。',
  );
  const seen = new Set();
  for (const s of config.schemes) {
    assert(key(s.id) && !seen.has(s.id), '組み合わせIDが不正です。');
    seen.add(s.id);
    assert(
      text(s.title, 120) &&
        text(s.summary, 1000) &&
        ['finance', 'business', 'tools'].includes(s.category),
      '公開説明が不正です。',
    );
    assert(
      text(s.tool?.name, 120) &&
        Array.isArray(s.tool?.serviceKeys) &&
        s.tool.serviceKeys.every(key),
      'サービスの対応が不正です。',
    );
    assert(
      key(s.offer?.serviceKey) &&
        /^\d+$/.test(s.offer.id) &&
        text(s.offer.productName),
      '案件の対応が不正です。',
    );
    assert(
      Number.isSafeInteger(s.offer.rewardYen) &&
        s.offer.rewardYen >= 0 &&
        Array.isArray(s.offer.channels),
      '報酬条件が不正です。',
    );
    assert(
      ['account', 'deposit', 'trade', 'purchase', 'consultation'].includes(
        s.offer.event,
      ),
      '成果地点が不正です。',
    );
    assert(
      Array.isArray(s.evidence) &&
        s.evidence.length > 0 &&
        s.evidence.every(
          (e) =>
            text(e.url) &&
            new URL(e.url).protocol === 'https:' &&
            text(e.note) &&
            date(e.checkedAt),
        ),
      '証拠が不正です。',
    );
    assert(
      date(s.validUntil) &&
        date(s.checkedAt) &&
        Array.isArray(s.preparation) &&
        s.preparation.every((x) => text(x)),
      '準備条件が不正です。',
    );
    assert(
      Array.isArray(s.exclusions) && s.exclusions.every((x) => text(x)),
      '除外条件が不正です。',
    );
  }
  return config;
}
export function validRegisteredArticle(s) {
  const a = s.registeredArticle;
  try {
    const u = new URL(a.url),
      link = new URL(s.affiliateUrl);
    return (
      a.approved === true &&
      a.tagVerified === true &&
      typeof a.reference === 'string' &&
      a.reference.length > 0 &&
      u.origin === 'https://kirin8038.livedoor.blog' &&
      a.mediaOrigin === u.origin &&
      /^\/archives\/\d+\.html$/.test(u.pathname) &&
      !u.search &&
      !u.hash &&
      !u.username &&
      !u.password &&
      a.siteId === s.siteId &&
      validBusinessLink(s.affiliateUrl) &&
      link.searchParams.get('idx').split('.')[2] === s.siteId &&
      link.searchParams.get('idx').split('.')[4] === s.offer.id
    );
  } catch {
    return false;
  }
}
export function combinationVerdict(s, now = Date.now()) {
  const reasons = [];
  if (!s.tool.serviceKeys.includes(s.offer.serviceKey))
    reasons.push('service_mismatch');
  if (s.tool.available !== true) reasons.push('tool_unverified');
  if (s.tool.useAllowed !== true) reasons.push('tool_use_not_allowed');
  if (s.termsConsistent !== true) reasons.push('terms_unconfirmed');
  if (
    Date.parse(s.validUntil) <= now ||
    Date.parse(s.checkedAt) > now ||
    now - Date.parse(s.checkedAt) > 7 * 86400000
  )
    reasons.push('evidence_stale');
  if (
    !s.evidence.every(
      (e) =>
        Date.parse(e.checkedAt) <= now &&
        now - Date.parse(e.checkedAt) <= 7 * 86400000,
    )
  )
    reasons.push('source_stale');
  if (s.offer.partnered !== true) reasons.push('partnership_pending');
  if (
    (s.registeredArticle
      ? !validRegisteredArticle(s)
      : s.mediaApproved !== true) ||
    !/^\d+$/.test(s.siteId ?? '')
  )
    reasons.push('media_pending');
  if (s.contentApproved !== true) reasons.push('content_pending');
  if (!s.offer.channels.includes('owned_web'))
    reasons.push('channel_not_allowed');
  if (s.enabled !== true) reasons.push('not_enabled');
  try {
    const u = new URL(s.affiliateUrl);
    if (
      u.origin !== 'https://www.rentracks.jp' ||
      u.pathname !== '/adx/r.html' ||
      !/^\d+(?:\.\d+){4}$/.test(u.searchParams.get('idx') ?? '') ||
      !/^\d+$/.test(u.searchParams.get('dna') ?? '')
    )
      reasons.push('official_link_missing');
  } catch {
    reasons.push('official_link_missing');
  }
  return {
    state: reasons.length ? 'preparing' : 'ready',
    reasons: [...new Set(reasons)],
  };
}
export function publicCombination(s, now = Date.now()) {
  const verdict = combinationVerdict(s, now);
  return {
    id: s.id,
    title: s.title,
    summary: s.summary,
    category: s.category,
    tool: s.tool.name,
    state: verdict.state,
    preparation: s.preparation,
    exclusions: s.exclusions,
    references: s.evidence
      .filter((e) => e.public === true)
      .map((e) => ({ url: e.url, note: e.note })),
    checkedAt: s.checkedAt,
    validUntil: s.validUntil,
    note:
      verdict.state === 'ready'
        ? '広告を含みます。利用条件を確認して紹介先へ進めます。'
        : '対応条件を確認する準備ガイドです。広告紹介は準備中です。',
  };
}
export const emptyCombinationState = () => ({
  version: 1,
  enabled: false,
  revision: 0,
  runCount: 0,
  lastRunAt: null,
  nextRunAt: null,
  articles: {},
  stages: {},
  leads: {},
  orders: {},
  observations: {},
  receipts: [],
  costs: {},
});
export function runCombinations(current, config, now = Date.now()) {
  const state = structuredClone(current);
  if (!state.enabled || (state.nextRunAt && state.nextRunAt > now))
    return { state, ran: false };
  for (const s of config.schemes) {
    const verdict = combinationVerdict(s, now),
      publicData = publicCombination(s, now);
    // A new candidate is not a publication permission: only reviewed public guides.
    if (s.guideApproved === true)
      state.articles[s.id] = {
        ...publicData,
        updatedAt: new Date(now).toISOString(),
      };
    else delete state.articles[s.id];
    const source = state.observations[s.offer.id];
    const fresh = source && now - Date.parse(source.observedAt) < 86400000;
    state.stages[s.id] = {
      evaluation: verdict,
      acquisition: s.guideApproved ? 'published' : 'review_pending',
      referral: verdict.state,
      approvalTracking: !source
        ? 'needs_connection'
        : fresh
          ? 'observed'
          : 'stale',
      lastObservedAt: source?.observedAt ?? null,
    };
  }
  for (const id of Object.keys(state.articles))
    if (!config.schemes.some((s) => s.id === id)) delete state.articles[id];
  state.runCount++;
  state.lastRunAt = new Date(now).toISOString();
  state.nextRunAt = now + 15 * 60 * 1000;
  state.revision++;
  state.receipts.push({
    kind: 'cycle',
    at: state.lastRunAt,
    run: state.runCount,
    schemes: config.schemes.length,
  });
  state.receipts = state.receipts.slice(-100);
  return { state, ran: true };
}
export function prepareCombination(
  current,
  config,
  input,
  { now = Date.now(), uuid = crypto.randomUUID() } = {},
) {
  assert(
    input &&
      key(input.schemeId) &&
      ['compare', 'open'].includes(input.purpose) &&
      ['jp', 'other'].includes(input.region) &&
      typeof input.adult === 'boolean' &&
      typeof input.existingAccount === 'boolean' &&
      typeof input.riskUnderstood === 'boolean',
    '入力条件を確認してください。',
  );
  const selected = config.schemes.find(
    (x) => x.id === input.schemeId && x.guideApproved === true,
  );
  assert(selected, '公開中の組み合わせではありません。');
  assert(
    !selected.execution,
    'この組み合わせは専用の診断操作から実行してください。',
  );
  const s = { ...selected, enabled: current.enabled && selected.enabled };
  const verdict = combinationVerdict(s, now),
    eligible =
      input.adult &&
      input.region === 'jp' &&
      !input.existingAccount &&
      input.purpose === 'open' &&
      (s.category !== 'finance' || input.riskUnderstood);
  const state = structuredClone(current);
  const result = {
    ...publicCombination(s, now),
    steps: s.preparation,
    eligible,
    referralUrl: null,
    nextAction:
      '利用条件と費用を確認してください。口座開設・本人確認・入金・取引は提供者側で本人が判断して行います。',
  };
  if (!eligible)
    result.nextAction =
      '新規口座の紹介条件に一致しません。既存口座の利用方法や公式の準備資料を確認してください。';
  if (!state.enabled)
    result.nextAction =
      '紹介受付を停止しています。準備資料は引き続き確認できます。';
  if (state.enabled && eligible && verdict.state === 'ready') {
    const uix = 'nb.' + uuid.replaceAll('-', '');
    assert(/^nb\.[a-f0-9]{32}$/.test(uix), '追跡IDが不正です。');
    assert(Object.keys(state.leads).length < 100000, '利用記録の上限です。');
    const u = new URL(s.affiliateUrl);
    u.searchParams.set('uix', uix);
    state.leads[uix] = {
      schemeId: s.id,
      offerId: s.offer.id,
      siteId: s.siteId,
      campaign: key(input.campaign) ? input.campaign : 'direct',
      createdAt: new Date(now).toISOString(),
    };
    state.revision++;
    result.referralUrl = u.href;
    result.uix = uix;
  }
  return { state, result };
}
export function applyCombinationObservation(
  current,
  config,
  observation,
  now = Date.now(),
) {
  assert(
    observation?.schema === 'noah-source-observation/1' &&
      ['rentracks_orders', 'rentracks_approvals'].includes(
        observation.stream,
      ) &&
      observation.sourceUrl ===
        'https://manage.rentracks.jp/manage/detail_sales',
    'ASPの注文・承認取得が必要です。',
  );
  assert(
    /^[a-f0-9]{64}$/.test(observation.sha256) &&
      date(observation.observedAt) &&
      Date.parse(observation.observedAt) <= now + 60000 &&
      now - Date.parse(observation.observedAt) <= 86400000,
    '新しい取得証拠が必要です。',
  );
  assert(
    observation.scope?.allSites === true &&
      observation.scope?.allStates === true &&
      Array.isArray(observation.rows) &&
      observation.rows.length <= 2000 &&
      observation.summary?.targetRows === observation.rows.length,
    '取得範囲が不正です。',
  );
  const offerId = observation.offerId ?? observation.rows[0]?.offerId;
  assert(
    config.schemes.some((s) => s.offer.id === offerId),
    '対象案件の指定が必要です。',
  );
  const state = structuredClone(current),
    seen = new Set();
  const oldSource = state.observations[offerId];
  assert(
    !oldSource ||
      Date.parse(observation.observedAt) >= Date.parse(oldSource.observedAt),
    '古い取得で上書きできません。',
  );
  if (oldSource?.sha256 === observation.sha256)
    return { state, duplicate: true, accepted: 0 };
  let accepted = 0,
    unmatched = 0;
  for (const row of observation.rows) {
    assert(
      /^\d+$/.test(row.id) &&
        !seen.has(row.id) &&
        row.offerId === offerId &&
        ['pending', 'approved', 'rejected'].includes(row.status) &&
        Number.isSafeInteger(row.rewardYen) &&
        row.rewardYen >= 0 &&
        row.rewardYen <= 100000000 &&
        row.sourceRef ===
          'rentracks.sha256.' + observation.sha256 + '.order.' + row.id,
      '成果の形式が不正です。',
    );
    seen.add(row.id);
    const mediaScheme = config.schemes.find(
      (s) =>
        s.offer.id === offerId &&
        s.siteId === row.siteId &&
        validRegisteredArticle(s),
    );
    if (mediaScheme) {
      state.mediaOrders ||= {};
      const old = state.mediaOrders[row.id];
      assert(
        !old || (old.schemeId === mediaScheme.id && old.siteId === row.siteId),
        '媒体成果の帰属が変わりました。',
      );
      assert(
        !old ||
          old.status === 'pending' ||
          (old.status === row.status && old.rewardYen === row.rewardYen),
        '確定媒体成果の変更は確認が必要です。',
      );
      state.mediaOrders[row.id] = {
        id: row.id,
        schemeId: mediaScheme.id,
        siteId: row.siteId,
        offerId,
        status: row.status,
        rewardYen: row.rewardYen,
        sourceRef: row.sourceRef,
        observedAt: observation.observedAt,
      };
    }
    const lead = row.uix && state.leads[row.uix];
    const scheme = lead && config.schemes.find((s) => s.id === lead.schemeId);
    if (
      !lead ||
      !scheme ||
      lead.offerId !== offerId ||
      lead.siteId !== scheme.siteId
    ) {
      unmatched++;
      continue;
    }
    const old = state.orders[row.id];
    assert(
      !old || (old.uix === row.uix && old.offerId === offerId),
      '成果IDの帰属が変わりました。',
    );
    assert(
      !old || old.status === 'pending' || old.status === row.status,
      '確定成果の状態変更は確認が必要です。',
    );
    assert(
      !old || old.status === 'pending' || old.rewardYen === row.rewardYen,
      '確定報酬の変更は確認が必要です。',
    );
    state.orders[row.id] = {
      id: row.id,
      schemeId: lead.schemeId,
      offerId,
      uix: row.uix,
      status: row.status,
      rewardYen: row.rewardYen,
      observedAt: observation.observedAt,
      sourceRef: row.sourceRef,
    };
    accepted++;
  }
  state.observations[offerId] = {
    sha256: observation.sha256,
    observedAt: observation.observedAt,
    accepted,
    unmatched,
    stream: observation.stream,
  };
  state.revision++;
  state.nextRunAt = now;
  return { state, duplicate: false, accepted, unmatched };
}
export function combinationReport(state, config) {
  return config.schemes.map((s) => {
    const rows = Object.values(state.orders).filter((o) => o.schemeId === s.id);
    const approvedYen = rows
        .filter((o) => o.status === 'approved')
        .reduce((n, o) => n + o.rewardYen, 0),
      costYen = state.costs[s.id] ?? null;
    return {
      id: s.id,
      diagnostics: state.diagnosticCounts?.[s.id] ?? {
        executions: 0,
        referrals: 0,
      },
      registeredMedia: s.registeredArticle
        ? (() => {
            const media = Object.values(state.mediaOrders ?? {}).filter(
              (o) => o.schemeId === s.id,
            );
            return {
              attribution: 'media_only',
              pending: media.filter((o) => o.status === 'pending').length,
              approved: media.filter((o) => o.status === 'approved').length,
              rejected: media.filter((o) => o.status === 'rejected').length,
              approvedYen: media
                .filter((o) => o.status === 'approved')
                .reduce((n, o) => n + o.rewardYen, 0),
            };
          })()
        : null,
      referralCount: Object.values(state.leads).filter(
        (l) => l.schemeId === s.id,
      ).length,
      pending: rows.filter((o) => o.status === 'pending').length,
      approved: rows.filter((o) => o.status === 'approved').length,
      rejected: rows.filter((o) => o.status === 'rejected').length,
      approvedYen,
      costYen,
      approvedMinusCostYen: costYen === null ? null : approvedYen - costYen,
      depositVerified: false,
      stages: state.stages[s.id] ?? null,
    };
  });
}
