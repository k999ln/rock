// Shared by the isolated Noah packages and the provider-side MCP adapter.
// No network, credentials, persistence, or model output participates in eligibility.
export const TOPICS = ['website', 'analytics', 'pc_repair', 'data_backup'];
export const CHANNELS = ['web', 'social', 'email', 'chat'];
const DAY = 86400000;
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const fail = () => { throw new Error('入力の形式・必須項目・上限を確認してください。'); };
const string = (v, max = 1000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max &&
  !Array.from(v).some(c => { const n = c.charCodeAt(0); return n < 32 && n !== 9 && n !== 10 || n === 127; });
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const money = v => Number.isSafeInteger(v) && v >= 0 && v <= 1000000000;
const id = v => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(v);
const https = v => {
  try { const u = new URL(v); return typeof v === 'string' && v.length < 1000 && u.protocol === 'https:' && !u.username && !u.password && !u.hash; }
  catch { return false; }
};
const tracking = v => {
  if (!https(v)) return false;
  const u = new URL(v);
  // Only the standard HTTPS ad link, never selfback or a guessed merchant URL.
  return u.origin === 'https://www.rentracks.jp' && u.pathname === '/adx/r.html' &&
    [...u.searchParams.keys()].length === 2 && [...u.searchParams.keys()].every(k => ['idx', 'dna'].includes(k)) &&
    /^\d+(?:\.\d+){4}$/.test(u.searchParams.get('idx') || '') && /^\d+$/.test(u.searchParams.get('dna') || '');
};

export function validateCatalog(value) {
  if (!plain(value) || value.schema !== 'noah-affiliate-catalog/1' || !string(value.version, 80) || !Array.isArray(value.offers) || value.offers.length > 100) fail();
  const ids = new Set();
  for (const o of value.offers) {
    if (!plain(o) || !id(o.id) || ids.has(o.id) || !string(o.name, 120) || !TOPICS.includes(o.topic) ||
      !string(o.description, 1500) || !https(o.sourceUrl) || !date(o.checkedAt) || !date(o.validUntil) ||
      Date.parse(o.validUntil) < Date.parse(o.checkedAt) || Date.parse(o.validUntil) - Date.parse(o.checkedAt) > 30 * DAY ||
      !['active', 'paused'].includes(o.status) || !['partnered', 'unpartnered'].includes(o.partnership) ||
      !Array.isArray(o.channels) || o.channels.some(c => !CHANNELS.includes(c)) || new Set(o.channels).size !== o.channels.length ||
      typeof o.agentPlacementApproved !== 'boolean' || typeof o.publicContentApproved !== 'boolean' ||
      !string(o.conditions, 2000) || !(o.approvalReference === null || string(o.approvalReference, 500)) ||
      !(o.affiliateUrl === null || tracking(o.affiliateUrl)) ||
      !(o.price === null || plain(o.price) && money(o.price.amountYen) && ['once', 'month'].includes(o.price.period))) fail();
    if (o.commission !== undefined && (!plain(o.commission) || !['yen', 'percent'].includes(o.commission.unit) ||
      typeof o.commission.amount !== 'number' || !Number.isFinite(o.commission.amount) || o.commission.amount < 0 || o.commission.amount > 1000000000)) fail();
    ids.add(o.id);
  }
  return value;
}

export function blockedReasons(o, channel, now = Date.now()) {
  return [o.status !== 'active' && '停止中', o.partnership !== 'partnered' && '未提携',
    Date.parse(o.checkedAt) > now && '確認日が未来', now >= Date.parse(o.validUntil) + DAY && '確認期限切れ',
    !o.channels.includes(channel) && 'この媒体の掲載許可未確認',
    !o.agentPlacementApproved && 'agentでの掲載許可未確認',
    !o.publicContentApproved && '紹介文の公開許可未確認',
    !o.approvalReference && '掲載許可の記録なし', !o.affiliateUrl && 'この媒体の正式広告リンク未登録'].filter(Boolean);
}

// Build-time projection: operator-only material is physically absent from the consultation ZIP.
export function publicCatalog(input, now = Date.now()) {
  const catalog = validateCatalog(input);
  return { schema: catalog.schema, version: catalog.version, offers: catalog.offers.filter(o =>
    CHANNELS.some(c => blockedReasons(o, c, now).length === 0)).map(o => ({
      id: o.id, name: o.name, topic: o.topic, description: o.description, sourceUrl: o.sourceUrl,
      checkedAt: o.checkedAt, validUntil: o.validUntil, status: o.status, partnership: o.partnership,
      channels: o.channels, agentPlacementApproved: true, publicContentApproved: true,
      approvalReference: 'provider-reviewed', affiliateUrl: o.affiliateUrl, price: o.price ? { amountYen: o.price.amountYen, period: o.price.period } : null,
      conditions: '提供元の最新の利用条件を確認してください。',
    })) };
}

const steps = {
  website: ['目的と必要なページを整理する', '既存サイトで直せる箇所と制作を依頼する範囲を分ける'],
  analytics: ['問い合わせなどの目標が計測できているか確認する', '流入元と離脱の多いページを確認する'],
  pc_repair: ['機種・症状・発生時期と保証期間を整理する', '重要なデータがある場合は初期化せず相談する'],
  data_backup: ['残したいデータと移行先を整理する', '作業前に別の保存先へバックアップする'],
};

export function consult(input, rawCatalog, now = Date.now()) {
  const catalog = validateCatalog(rawCatalog);
  if (!plain(input) || Object.keys(input).some(k => !['topic', 'channel', 'budgetYen', 'budgetPeriod'].includes(k)) ||
    !TOPICS.includes(input.topic) || !CHANNELS.includes(input.channel) ||
    (input.budgetYen !== undefined && !money(input.budgetYen)) ||
    (input.budgetPeriod !== undefined && !['once', 'month'].includes(input.budgetPeriod)) ||
    (input.budgetYen !== undefined) !== (input.budgetPeriod !== undefined)) fail();
  const eligible = catalog.offers.filter(o => o.topic === input.topic && blockedReasons(o, input.channel, now).length === 0);
  const offers = eligible.filter(o => input.budgetYen === undefined || o.price && o.price.period === input.budgetPeriod && o.price.amountYen <= input.budgetYen)
    .sort((a, b) => a.id.localeCompare(b.id, 'en')).slice(0, 3).map(o => ({
      id: o.id, name: o.name, description: o.description, reason: '相談分野と掲載条件が一致する候補です。品質順位ではありません。',
      price: o.price ? { amountYen: o.price.amountYen, period: o.price.period } : null, priceNote: o.price ? '参照日時点の価格です。契約前に総額・更新条件を確認してください。' : '利用料金は未確認です。',
      checkedAt: o.checkedAt, sourceUrl: o.sourceUrl, affiliateUrl: o.affiliateUrl,
    }));
  return { schema: 'noah-affiliate-result/1', mode: 'consult', catalogVersion: catalog.version,
    disclosure: '広告：紹介リンク経由の申込で運営者に報酬が発生する場合があります。',
    freeSteps: steps[input.topic], offers,
    next: offers.length ? '必要な機能・総額・利用条件を確認し、ご自身で選んでください。' : '現在の条件で紹介できる案件はありません。無料の確認手順から進めてください。',
    questions: ['現在の状況と、解決したいことを教えてください。', '予算は初期費用ですか、月額ですか？'],
    budgetNote: input.budgetYen !== undefined ? '価格未確認・期間不一致・予算超過の案件は紹介対象から外しました。' : '予算の適合はまだ判定していません。',
  };
}

export function audit(rawCatalog, now = Date.now()) {
  const catalog = validateCatalog(rawCatalog);
  return { mode: 'operations', catalogVersion: catalog.version, offers: catalog.offers.map(o => ({
    id: o.id, name: o.name, commission: o.commission ?? null, checkedAt: o.checkedAt,
    channels: Object.fromEntries(CHANNELS.map(c => [c, blockedReasons(o, c, now)])),
    conditions: o.conditions, priceReviewNeeded: o.price === null,
  })), next: '未確認条件と正式リンクを台帳で確認してください。変更はまだ保存していません。' };
}

export function draft(input, rawCatalog, now = Date.now()) {
  const catalog = validateCatalog(rawCatalog);
  if (!plain(input) || Object.keys(input).some(k => !['offerId', 'channel'].includes(k)) || !id(input.offerId) || !CHANNELS.includes(input.channel)) fail();
  const o = catalog.offers.find(x => x.id === input.offerId);
  if (!o) throw new Error('指定の案件がありません。');
  const blockers = blockedReasons(o, input.channel, now);
  return { mode: 'operations', status: 'draft', readyForReview: blockers.length === 0, blockers,
    // Ineligible descriptions may be private, so emit only an editorial outline.
    text: blockers.length ? '下書き構成：困りごと → 無料の対処 → 比較基準 → 条件確認。掲載条件の確認後に商品紹介を作成してください。' :
      `【広告・公開前の下書き】\n${o.name}\n${o.description}\n${o.price ? `参考料金：${o.price.amountYen}円（${o.price.period === 'month' ? '月額' : '一回'}）` : '料金は公式案内で確認してください。'}\n比較する点：総額、必要な機能、サポート、契約と更新条件。\nまずできること：${steps[o.topic].join('。')}。\n紹介リンク：${o.affiliateUrl}\n参照日：${o.checkedAt}\n紹介リンク経由で運営者に報酬が発生する場合があります。`,
    checklist: ['価格と主張の根拠を再確認', '媒体・商標の個別条件を確認', '広告表示を保持', '本人が確認して公開'],
  };
}

export function analyze(input) {
  if (!plain(input) || Object.keys(input).some(k => !['periodStart', 'periodEnd', 'rows'].includes(k)) ||
    !date(input.periodStart) || !date(input.periodEnd) || input.periodEnd < input.periodStart || !Array.isArray(input.rows) || input.rows.length > 100) fail();
  const ids = new Set(), totals = { clicks: 0, pending: 0, approved: 0, rejected: 0, pendingYen: 0, approvedYen: 0 };
  for (const row of input.rows) {
    if (!plain(row) || !id(row.offerId) || ids.has(row.offerId) || Object.keys(row).some(k => !['offerId', ...Object.keys(totals)].includes(k))) fail();
    ids.add(row.offerId);
    for (const key of Object.keys(totals)) {
      if (!money(row[key])) fail();
      totals[key] += row[key];
    }
  }
  const decided = totals.approved + totals.rejected;
  return { mode: 'operations', periodStart: input.periodStart, periodEnd: input.periodEnd, totals,
    approvalRate: decided ? totals.approved / decided : null,
    approvedRevenuePerClickYen: totals.clicks ? totals.approvedYen / totals.clicks : null,
    note: '入力された同一期間の集計です。保留額を承認済みに含めていません。承認済み報酬は入金済み・将来の収益保証を意味しません。' };
}

export function fromPrompt(prompt, role) {
  if (!string(prompt, 16000)) fail();
  if (prompt.trim().startsWith('{')) return JSON.parse(prompt);
  if (role === 'operations') return { action: 'audit' };
  const topic = /GA4|アクセス|分析/i.test(prompt) ? 'analytics' : /復旧|移行|バックアップ/.test(prompt) ? 'data_backup' : /PC|パソコン|修理/i.test(prompt) ? 'pc_repair' : /サイト|ホームページ|Web/i.test(prompt) ? 'website' : null;
  return topic ? { action: 'consult', topic, channel: 'chat' } : { action: 'help' };
}

export function runAction(role, input, catalog, now = Date.now()) {
  if (!plain(input)) fail();
  const { action, ...args } = input;
  if (role === 'consult') {
    if (action === 'help') return { text: 'Web制作・アクセス分析・PC修理・データ移行のどれで困っていますか？' };
    if (action !== 'consult') throw new Error('このAgentは相談専用です。');
    return consult(args, catalog, now);
  }
  if (role !== 'operations') fail();
  if (action === 'audit' && Object.keys(args).length === 0) return audit(catalog, now);
  if (action === 'draft') return draft(args, catalog, now);
  if (action === 'analyze') return analyze(args);
  throw new Error('audit / draft / analyze を指定してください。');
}

export function render(result) {
  if (result.text) return result.text;
  if (result.mode === 'consult') return [result.disclosure, ...result.freeSteps.map(s => `- ${s}`), ...result.offers.map(o =>
    `\n${o.name}\n${o.description}\n${o.reason}\n${o.price ? `${o.price.amountYen}円（${o.price.period === 'month' ? '月額' : '一回'}）\n` : ''}${o.priceNote}\n${o.affiliateUrl}\n参照日：${o.checkedAt}`), result.next, result.budgetNote].join('\n');
  return JSON.stringify(result, null, 2);
}
