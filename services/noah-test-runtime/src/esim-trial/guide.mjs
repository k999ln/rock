export const PACKAGE = 'essentials-guide-v1';
export const trialExecutionQuote = Object.freeze({
  currency: 'JPY',
  customerMinor: 0,
  operatorMinor: 0,
});
export function withinFreeTrialBudget(quote) {
  return (
    quote?.currency === 'JPY' &&
    quote.customerMinor === 0 &&
    quote.operatorMinor === 0
  );
}
export const DELAY_MS = 10_000;
export const regions = Object.freeze({ tokyo: '東京', osaka: '大阪' });
export const goods = Object.freeze({ rice: 'お米', soap: 'せっけん' });
export const sourceName = 'Noah 架空配給台帳 v1';
export const sampleOffers = [
  {
    id: 'sample-tokyo-rice',
    region: 'tokyo',
    item: 'rice',
    place: 'サンプル東会場',
    pickup: '土曜日 10:00〜12:00',
  },
  {
    id: 'sample-osaka-soap',
    region: 'osaka',
    item: 'soap',
    place: 'サンプル西会場',
    pickup: '日曜日 13:00〜15:00',
  },
];
export function usableSource(records) {
  return !(
    !Array.isArray(records) ||
    records.length > 100 ||
    new TextEncoder().encode(JSON.stringify(records)).byteLength > 32 * 1024 ||
    records.some(
      (row) =>
        !row ||
        !Object.hasOwn(regions, row.region) ||
        !Object.hasOwn(goods, row.item) ||
        !['id', 'place', 'pickup'].every(
          (key) =>
            typeof row[key] === 'string' &&
            row[key].length > 0 &&
            row[key].length <= 160,
        ),
    )
  );
}
export function runGuide(records, region, item) {
  const entries = [];
  if (!usableSource(records)) {
    return { outcome: 'unavailable', source: sourceName, entries };
  }
  for (const record of records) {
    if (record.region === region && record.item === item) {
      entries.push({
        id: record.id,
        place: record.place,
        pickup: record.pickup,
      });
    }
  }
  return {
    outcome: entries.length ? 'matches' : 'empty',
    source: sourceName,
    entries,
  };
}

// Read-only acceptance check for this fixed package. It grants no execution or spending authority.
export function acceptGuideResult(records, region, item, result) {
  if (!result || result.source !== sourceName || !Array.isArray(result.entries))
    return false;
  if (!usableSource(records))
    return result.outcome === 'unavailable' && result.entries.length === 0;
  const eligible = records.filter(
    (row) => row.region === region && row.item === item,
  );
  if (
    result.outcome !== (eligible.length ? 'matches' : 'empty') ||
    result.entries.length !== eligible.length
  )
    return false;
  return eligible.every((row, i) => {
    const entry = result.entries[i];
    return (
      entry &&
      entry.id === row.id &&
      entry.place === row.place &&
      entry.pickup === row.pickup &&
      Object.keys(entry).length === 3
    );
  });
}
