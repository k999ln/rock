// Classification is a review queue, never execution or advertising permission.
export const REVENUE_DOMAINS = {
  training:
    /研修|業務改善|生成(?:AI|si)|workflow|productivity|business automation/i,
  website:
    /wordpress|web design|website|web development|ホームページ|サイト制作|サイト保守/i,
  commerce: /ecommerce|e-commerce|shopify|ECサイト|ネットショップ/i,
  career: /career|resume|interview|recruit|転職|求人|面接/i,
  finance: /trading|stock|forex|investment|株式|証券|FX|投資/i,
  learning: /language|tutor|education|英語|学習|スクール/i,
};
export const domainsFor = (text) =>
  Object.entries(REVENUE_DOMAINS)
    .filter(([, pattern]) => pattern.test(String(text).slice(0, 20000)))
    .map(([name]) => name);
export function validateOfferIndex(value) {
  if (
    value?.schema !== 'noah-partner-index/1' ||
    !Number.isFinite(Date.parse(value.checkedAt)) ||
    !/^[a-f0-9]{64}$/.test(value.sourceSha256 ?? '') ||
    !Array.isArray(value.offers) ||
    value.offers.length > 10000
  )
    throw Error('invalid_offer_index');
  const ids = new Set();
  for (const offer of value.offers) {
    if (
      !/^\d{1,12}$/.test(offer.id) ||
      ids.has(offer.id) ||
      offer.partnered !== true ||
      !Array.isArray(offer.domains) ||
      offer.domains.some((d) => !Object.hasOwn(REVENUE_DOMAINS, d))
    )
      throw Error('invalid_offer');
    ids.add(offer.id);
  }
  // Persist only fields required to match. No reward, customer, bank or ad URL.
  return {
    schema: value.schema,
    checkedAt: value.checkedAt,
    sourceSha256: value.sourceSha256,
    offers: value.offers.map((o) => ({
      id: o.id,
      partnered: true,
      domains: [...new Set(o.domains)],
    })),
  };
}
export function normalizeCard(card) {
  const id = card.feedbackId || card.id;
  if (
    typeof id !== 'string' ||
    id.length > 180 ||
    !/^[a-zA-Z0-9:._/-]+$/.test(id) ||
    typeof card.name !== 'string' ||
    typeof card.summary !== 'string'
  )
    throw Error('invalid_catalog_card');
  return {
    id,
    name: card.name.slice(0, 200),
    domains: domainsFor(card.name + ' ' + card.summary),
  };
}
export function matchRevenueCandidates(cards, index) {
  const offers = validateOfferIndex(index).offers,
    groups = {},
    samples = [];
  // Index by purpose: avoid a full agents × offers scan on every alarm.
  const byDomain = new Map();
  for (const offer of offers)
    for (const domain of offer.domains) {
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain).push(offer);
    }
  let total = 0;
  for (const card of cards) {
    const candidates = new Map();
    for (const domain of card.domains)
      for (const offer of byDomain.get(domain) || [])
        candidates.set(offer.id, offer);
    for (const offer of candidates.values()) {
      const shared = card.domains.filter((d) => offer.domains.includes(d));
      total++;
      for (const domain of shared) groups[domain] = (groups[domain] || 0) + 1;
      if (samples.length < 250)
        samples.push({
          agentId: card.id,
          offerId: offer.id,
          domains: shared,
          state: 'needs_evidence',
          missing: [
            'capability_execution',
            'service_compatibility',
            'current_terms',
            'registered_media',
          ],
        });
    }
  }
  return {
    scannedAgents: cards.length,
    scannedPartneredOffers: offers.length,
    total,
    groups,
    samples,
    truncated: total > samples.length,
    approved: 0,
  };
}
export const emptyDiscovery = () => ({
  cycle: null,
  snapshot: null,
  nextAt: 0,
  error: null,
});
async function boundedJson(response, limit = 262144) {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw Error('catalog_http_' + response.status);
  }
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw Error('catalog_page_too_large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function advanceDiscovery(
  previous,
  { fetcher = fetch, now = Date.now(), maxPages = 20 } = {},
) {
  const state = structuredClone(previous || emptyDiscovery());
  if (!state.cycle && now < state.nextAt) return state;
  if (!state.cycle)
    state.cycle = {
      startedAt: now,
      cursor: '0',
      total: null,
      cards: [],
      cursors: [],
    };
  try {
    if (state.cycle.cards.length === 0) {
      const response = await fetcher(
        'https://avoado.si/api/noah/revenue/catalog',
        { redirect: 'manual', signal: AbortSignal.timeout(15000) },
      );
      if (response.status === 404) await response.body?.cancel();
      else {
        const data = await boundedJson(response, 8388608);
        if (
          data.schema !== 'noah-revenue-catalog/1' ||
          !Number.isSafeInteger(data.total) ||
          data.total < 0 ||
          data.total > 10000 ||
          !Array.isArray(data.items) ||
          data.items.length !== data.total
        )
          throw Error('catalog_snapshot_invalid');
        const cards = data.items.map(normalizeCard);
        if (new Set(cards.map((c) => c.id)).size !== cards.length)
          throw Error('catalog_duplicate');
        state.snapshot = {
          checkedAt: new Date(now).toISOString(),
          total: cards.length,
          cards,
        };
        state.cycle = null;
        state.nextAt = now + 3600000;
        state.error = null;
        return state;
      }
    }
    for (let page = 0; page < Math.min(maxPages, 20); page++) {
      const c = state.cycle;
      if (now - c.startedAt > 2 * 3600000 || c.cursors.includes(c.cursor))
        throw Error('catalog_cycle_invalid');
      const url = new URL('https://avoado.si/api/noah/discover');
      url.searchParams.set('cursor', c.cursor);
      const data = await boundedJson(
        await fetcher(url.href, {
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
        }),
      );
      if (
        !Number.isSafeInteger(data.total) ||
        data.total < 0 ||
        data.total > 10000 ||
        !Array.isArray(data.items) ||
        data.items.length > 100 ||
        (c.total !== null && c.total !== data.total)
      )
        throw Error('catalog_changed_or_invalid');
      c.total = data.total;
      c.cursors.push(c.cursor);
      const ids = new Set(c.cards.map((x) => x.id));
      for (const raw of data.items) {
        const card = normalizeCard(raw);
        if (ids.has(card.id)) throw Error('catalog_duplicate');
        ids.add(card.id);
        c.cards.push(card);
      }
      if (data.nextCursor === null) {
        if (c.cards.length !== c.total) throw Error('catalog_incomplete');
        state.snapshot = {
          checkedAt: new Date(now).toISOString(),
          total: c.total,
          cards: c.cards,
        };
        state.cycle = null;
        state.nextAt = now + 3600000;
        state.error = null;
        break;
      }
      if (
        !['string', 'number'].includes(typeof data.nextCursor) ||
        !/^\d{1,8}$/.test(String(data.nextCursor)) ||
        !data.items.length
      )
        throw Error('catalog_cursor_invalid');
      c.cursor = String(data.nextCursor);
    }
  } catch (error) {
    state.error = String(error.message).slice(0, 120);
    state.cycle = null;
    state.nextAt = now + 900000;
  }
  return state;
}
export function revenuePublications(pipeline, now = Date.now()) {
  const proof = pipeline?.business;
  if (
    !pipeline?.enabled ||
    !proof?.ready ||
    !pipeline.index?.offers?.some(
      (offer) => offer.id === proof.offerId && offer.partnered === true,
    ) ||
    now - Date.parse(proof.checkedAt) > 20 * 60000 ||
    Date.parse(proof.checkedAt) > now ||
    !Number.isFinite(Date.parse(proof.checkedAt))
  )
    return [];
  return [
    {
      id: 'noah-business-training',
      origin: 'first_party',
      title: '法人のsi導入準備',
      summary:
        '業務の整理票と研修で聞くことを作り、必要に合う場合に相談先をご案内します。',
      url: 'https://avoado.si/noah/business-si',
      mcp: 'https://noah-business-si.mr-kirin999.workers.dev/consult/mcp',
      checkedAt: proof.checkedAt,
      attribution: 'registered_media',
      approval: 'external_observation_only',
    },
  ];
}
export async function observeBusinessAdapter(
  token,
  { fetcher = fetch, now = Date.now() } = {},
) {
  const checkedAt = new Date(now).toISOString();
  if (typeof token !== 'string' || token.length < 32)
    return { checkedAt, ready: false, reason: 'business_connection_missing' };
  try {
    const read = async (action) =>
      boundedJson(
        await fetcher(
          'https://noah-business-si.mr-kirin999.workers.dev/operations/api',
          {
            method: 'POST',
            redirect: 'manual',
            signal: AbortSignal.timeout(15000),
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + token,
            },
            body: JSON.stringify({ action }),
          },
        ),
      );
    const [agent, report] = await Promise.all([
      read('agent_status'),
      read('report'),
    ]);
    const offerId =
      typeof report.offerId === 'string' && /^[0-9]{1,20}$/.test(report.offerId)
        ? report.offerId
        : null;
    const ready =
      offerId !== null &&
      agent.enabled === true &&
      Array.isArray(report.launchBlockers) &&
      report.launchBlockers.length === 0 &&
      ['acquisition', 'consultation', 'referral'].every((id) =>
        agent.stages?.some((s) => s.id === id && s.state === 'running'),
      ) &&
      now - Date.parse(agent.lastRunAt) <= 30 * 60000 &&
      Date.parse(agent.lastRunAt) <= now;
    return {
      checkedAt,
      offerId,
      ready,
      reason: ready ? null : 'business_gates_closed',
      runCount: agent.runCount,
      approvalTracking:
        agent.stages?.find((s) => s.id === 'approval_followup')?.state ??
        'unknown',
    };
  } catch {
    return { checkedAt, ready: false, reason: 'business_observation_failed' };
  }
}
