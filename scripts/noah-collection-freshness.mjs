#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

export const NOAH_COLLECTION_FRESHNESS_LIMIT = 2 * 60 * 60 * 1000;

/** Public collection measurement. It intentionally reads only counts and timestamps. */
export function measureCollectionFreshness(payload, { source = 'hackernews', checkedAt = Date.now(), maxAgeMs = NOAH_COLLECTION_FRESHNESS_LIMIT } = {}) {
  if (!payload || !Array.isArray(payload.items) || !Number.isSafeInteger(checkedAt) || checkedAt < 1 || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1) {
    throw Error('collection_freshness_invalid');
  }
  const observed = payload.items.map(item => Number(item?.observedAt)).filter(at => Number.isSafeInteger(at) && at > 0 && at <= checkedAt + 300_000);
  const observedAt = observed.length ? Math.max(...observed) : null;
  const total = Number.isSafeInteger(payload.total) && payload.total >= 0 ? payload.total : payload.items.length;
  if (observedAt === null) return { source, checkedAt, total, observedAt: null, ageMs: null, limitMs: maxAgeMs, status: 'unavailable' };
  const ageMs = Math.max(0, checkedAt - observedAt);
  return { source, checkedAt, total, observedAt, ageMs, limitMs: maxAgeMs, status: ageMs >= maxAgeMs ? 'stale' : 'fresh' };
}

export async function readCollectionFreshness({ origin, source = 'hackernews', fetcher = fetch, now = Date.now, maxAgeMs = NOAH_COLLECTION_FRESHNESS_LIMIT }) {
  const target = new URL(origin);
  if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/' || target.search || target.hash || !/^[a-z][a-z0-9-]{0,31}$/u.test(source)) {
    throw Error('collection_freshness_configuration');
  }
  const url = new URL('/api/noah/collection', target);
  url.search = new URLSearchParams({ source, order: 'new' }).toString();
  const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json' } });
  if (!response.ok) { await response.body?.cancel(); throw Error(`collection_freshness_http_${response.status}`); }
  const payload = await response.json().catch(() => { throw Error('collection_freshness_invalid'); });
  return measureCollectionFreshness(payload, { source, checkedAt: now(), maxAgeMs });
}

async function main() {
  const { values } = parseArgs({ options: { origin: { type: 'string' }, source: { type: 'string', default: 'hackernews' }, 'max-age-ms': { type: 'string' } } });
  if (!values.origin) throw Error('collection_freshness_arguments');
  const maxAgeMs = values['max-age-ms'] === undefined ? NOAH_COLLECTION_FRESHNESS_LIMIT : Number(values['max-age-ms']);
  const result = await readCollectionFreshness({ origin: values.origin, source: values.source, maxAgeMs });
  console.log(JSON.stringify(result));
  if (result.status !== 'fresh') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => {
  console.error(/^collection_freshness_[a-z0-9_]+$/u.test(error.message) ? error.message : 'collection_freshness_failed');
  process.exitCode = 1;
});
