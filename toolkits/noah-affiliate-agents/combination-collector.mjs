import { collectRentracks } from './business-browser-collector.mjs';
import { normalizeRentracksCapture } from './business-rentracks.mjs';
import { validateCombinationConfig } from './combination-core.mjs';

// The caller supplies the supported, already authenticated Chrome Tab. No
// browser launch, cookies, stored credentials or hidden ASP endpoints are used.
export async function collectCombinationObservations(
  tab,
  config,
  options = {},
) {
  validateCombinationConfig(config);
  const targets = new Map();
  for (const s of config.schemes) {
    if (!/^\d+$/.test(s.siteId ?? '')) continue;
    const old = targets.get(s.offer.id);
    if (
      old &&
      (old.siteId !== s.siteId || old.productName !== s.offer.productName)
    )
      throw new Error('同じ案件の媒体・商品名を確認してください。');
    targets.set(s.offer.id, {
      offerId: s.offer.id,
      productName: s.offer.productName,
      siteId: s.siteId,
    });
  }
  if (!targets.size) throw new Error('取得対象の登録媒体がありません。');
  const captures = await collectRentracks(tab, targets.values().next().value, {
    ...options,
    includePayouts: false,
  });
  const observations = captures.flatMap((c) =>
    [...targets.values()].map((target) => {
      const observation = normalizeRentracksCapture(c, target);
      return {
        ...observation,
        offerId: target.offerId,
        siteId: target.siteId,
        rows: observation.rows.map((row) => ({
          ...row,
          siteId: target.siteId,
        })),
      };
    }),
  );
  return { captures, observations };
}

export async function publishCombinationObservations(
  observations,
  token,
  fetcher = fetch,
) {
  if (typeof token !== 'string' || token.length < 32)
    throw new Error('所有者の接続設定が必要です。');
  const receipts = [];
  for (const observation of observations) {
    const response = await fetcher(
      'https://noah-revenue-agents.mr-kirin999.workers.dev/operations/api',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ action: 'observe', observation }),
      },
    );
    if (!response.ok)
      throw new Error('取得記録の保存に失敗しました: HTTP ' + response.status);
    receipts.push({
      offerId: observation.offerId,
      stream: observation.stream,
      ...(await response.json()),
    });
  }
  return receipts;
}
