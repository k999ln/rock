export const PACKAGE = 'essentials-guide-v1';
export const DELAY_MS = 10_000;
export const regions = Object.freeze({ tokyo: '東京', osaka: '大阪' });
export const goods = Object.freeze({ rice: 'お米', soap: 'せっけん' });
const sourceName = 'Noah 架空配給台帳 v1';
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
export function runGuide(records, region, item) {
  const entries = [];
  if (
    !Array.isArray(records) ||
    records.length > 100 ||
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
  ) {
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
