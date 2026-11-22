import { applyBusinessCommand, businessToday } from './business-core.mjs';

const streams = {
  rentracks_orders: 'https://manage.rentracks.jp/manage/detail_sales',
  rentracks_approvals: 'https://manage.rentracks.jp/manage/detail_sales',
  rentracks_payouts: 'https://manage.rentracks.jp/manage/detail_pay',
};
const exact = (v, fields) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === fields.length &&
  fields.every((k) => Object.hasOwn(v, k));
const check = (v, message) => {
  if (!v) throw new Error(message);
};
const count = (v) => Number.isSafeInteger(v) && v >= 0 && v <= 2000;
const day = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;

// Owner-authenticated observations, not signed attestations from the ASP.
// Empty source observations deliberately do not manufacture financial rows.
export function applySourceObservation(
  ledger,
  sources,
  batch,
  config,
  now = Date.now(),
) {
  check(
    exact(batch, [
      'schema',
      'stream',
      'sourceUrl',
      'observedAt',
      'sha256',
      'scope',
      'summary',
      'rows',
    ]),
    '取得記録の形式が不正です。',
  );
  check(
    batch.schema === 'noah-source-observation/1' &&
      Object.hasOwn(streams, batch.stream) &&
      batch.sourceUrl === streams[batch.stream] &&
      typeof batch.sha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(batch.sha256),
    '取得元を確認してください。',
  );
  const observed = Date.parse(batch.observedAt);
  check(
    typeof batch.observedAt === 'string' &&
      Number.isFinite(observed) &&
      new Date(observed).toISOString() === batch.observedAt &&
      observed <= now + 60000 &&
      now - observed <= 86400000,
    '取得日時が古いか未来です。画面から再取得してください。',
  );
  const s = batch.summary;
  check(
    exact(s, ['totalRows', 'targetRows', 'pending', 'approved', 'rejected']) &&
      Object.values(s).every(count) &&
      s.totalRows === s.pending + s.approved + s.rejected &&
      s.targetRows <= s.totalRows &&
      Array.isArray(batch.rows) &&
      batch.rows.length === s.targetRows &&
      s.targetRows <= 100,
    '取得件数が一致しません。',
  );
  if (batch.stream === 'rentracks_payouts') {
    // The currently observed page has no records. Non-empty settlement rows need
    // the payment notice's actual date and explicit conversion membership.
    check(
      batch.scope === null && s.totalRows === 0 && batch.rows.length === 0,
      '支払通知書と成果内訳の照合が必要です。予定日から支払を作成できません。',
    );
  } else {
    const p = batch.scope;
    check(
      exact(p, ['from', 'to', 'dateBasis', 'allSites', 'allStates']) &&
        day(p.from) &&
        day(p.to) &&
        p.from <= p.to &&
        p.to <= businessToday(now) &&
        Date.parse(p.to) - Date.parse(p.from) < 365 * 86400000 &&
        p.dateBasis ===
          (batch.stream === 'rentracks_orders' ? 'sales' : 'decision') &&
        p.allSites === true &&
        p.allStates === true,
      '取得範囲を確認してください。',
    );
    check(
      batch.rows.every(
        (r) =>
          r.offerId === config.offerId &&
          r.observedOn === businessToday(observed) &&
          (p.dateBasis === 'sales'
            ? r.occurredOn >= p.from && r.occurredOn <= p.to
            : r.decisionOn >= p.from && r.decisionOn <= p.to),
      ),
      '対象案件または取得期間が一致しません。',
    );
  }
  const next = structuredClone(sources || {}),
    old = next[batch.stream];
  const fingerprint = JSON.stringify(batch);
  if (old?.sha256 === batch.sha256) {
    check(
      old.fingerprint === fingerprint,
      '同じ取得IDに異なる内容があります。',
    );
    return { ledger, sources: next, duplicate: true, receipt: old.receipt };
  }
  check(
    !old || batch.observedAt >= old.receipt.observedAt,
    '古い取得で上書きできません。',
  );
  if (batch.rows.length)
    ledger = applyBusinessCommand(
      ledger,
      {
        requestId:
          'source-' +
          batch.stream.replaceAll('_', '-') +
          '-' +
          batch.sha256.slice(0, 32),
        expectedRevision: ledger.revision,
        action: 'import_conversions',
        payload: { rows: batch.rows },
      },
      now,
    ).state;
  const receipt = {
    stream: batch.stream,
    sourceUrl: batch.sourceUrl,
    sha256: batch.sha256,
    observedAt: batch.observedAt,
    receivedAt: new Date(now).toISOString(),
    expiresAt: new Date(observed + 86400000).toISOString(),
    scope: batch.scope,
    summary: batch.summary,
    method: 'authenticated_browser_observation',
    recurringConnectionVerified: false,
    bankReceiptVerified: false,
  };
  next[batch.stream] = { sha256: batch.sha256, fingerprint, receipt };
  return { ledger, sources: next, duplicate: false, receipt };
}

export function sourceStatus(sources = {}, now = Date.now()) {
  return Object.keys(streams).map((stream) => {
    const receipt = sources[stream]?.receipt || null;
    return {
      stream,
      state: !receipt
        ? 'needs_connection'
        : Date.parse(receipt.expiresAt) <= now
          ? 'stale'
          : 'observed',
      receipt,
    };
  });
}

// A bank connector must supply actual incoming entries, a locally verified account
// match and an explicitly confirmed payer. Never derive these from an ASP page.
export function matchBankEntries(
  payouts,
  entries,
  { accountMatched, payer, maxDays = 5 } = {},
) {
  check(
    accountMatched === true &&
      typeof payer === 'string' &&
      payer.trim() &&
      Number.isInteger(maxDays) &&
      maxDays >= 0 &&
      maxDays <= 10,
    '銀行の読取口座・振込元の確認が必要です。',
  );
  check(
    Array.isArray(entries) && entries.length <= 2000 && Array.isArray(payouts),
    '照合件数を確認してください。',
  );
  const ids = new Set();
  for (const e of entries) {
    check(
      exact(e, [
        'id',
        'direction',
        'payer',
        'amountYen',
        'receivedOn',
        'sourceRef',
      ]) &&
        typeof e.id === 'string' &&
        /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,99}$/.test(e.id) &&
        !ids.has(e.id) &&
        ['credit', 'debit'].includes(e.direction) &&
        typeof e.payer === 'string' &&
        Number.isSafeInteger(e.amountYen) &&
        e.amountYen > 0 &&
        day(e.receivedOn) &&
        typeof e.sourceRef === 'string' &&
        e.sourceRef.length > 0 &&
        e.sourceRef.length <= 160,
      '銀行明細の形式が不正です。',
    );
    ids.add(e.id);
  }
  const candidates = payouts.map((p) => ({
    p,
    entries: entries.filter(
      (e) =>
        e.direction === 'credit' &&
        e.payer === payer &&
        e.amountYen === p.amountYen &&
        e.receivedOn >= p.paidOn &&
        Date.parse(e.receivedOn) - Date.parse(p.paidOn) <= maxDays * 86400000,
    ),
  }));
  const rows = [],
    unresolved = [];
  for (const c of candidates) {
    const e = c.entries[0];
    if (
      c.entries.length !== 1 ||
      candidates.filter((x) => x.entries.some((v) => v.id === e.id)).length !==
        1
    ) {
      unresolved.push({
        payoutId: c.p.id,
        reason: c.entries.length ? 'ambiguous' : 'no_match',
      });
      continue;
    }
    rows.push({
      id: e.id,
      payoutId: c.p.id,
      amountYen: e.amountYen,
      receivedOn: e.receivedOn,
      sourceRef: e.sourceRef,
    });
  }
  return { rows, unresolved };
}
