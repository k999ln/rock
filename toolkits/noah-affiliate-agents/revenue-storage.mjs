// DO values have a per-value limit: keep complete generations in bounded shards.
export async function loadRevenue(storage) {
  const value = (await storage.get('revenue')) || {
    revision: 0,
    enabled: false,
    discovery: null,
    index: null,
    matches: null,
    business: null,
  };
  for (const [key, rows] of [
    ['snapshot', 'cards'],
    ['cycle', 'cards'],
    ['index', 'offers'],
  ]) {
    const target = key === 'index' ? value.index : value.discovery?.[key];
    if (!target) continue;
    target[rows] = [];
    for (let i = 0; i < (target.shards || 0); i++) {
      const shard = await storage.get(`revenue.${key}.${i}`);
      if (!Array.isArray(shard)) throw Error('revenue_storage_incomplete');
      target[rows].push(...shard);
    }
    delete target.shards;
  }
  return value;
}
export async function saveRevenue(storage, input) {
  const value = structuredClone(input),
    old = await storage.get('revenue');
  for (const [key, rows] of [
    ['snapshot', 'cards'],
    ['cycle', 'cards'],
    ['index', 'offers'],
  ]) {
    const target = key === 'index' ? value.index : value.discovery?.[key];
    const previous = key === 'index' ? old?.index : old?.discovery?.[key];
    let count = 0;
    if (target) {
      for (let start = 0; start < target[rows].length; start += 200)
        await storage.put(
          `revenue.${key}.${count++}`,
          target[rows].slice(start, start + 200),
        );
      delete target[rows];
      target.shards = count;
    }
    for (let i = count; i < (previous?.shards || 0); i++)
      await storage.delete(`revenue.${key}.${i}`);
  }
  await storage.put('revenue', value);
}
