// Owner-side bridge. ASP captures come only from the supported Chrome collector.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { domainsFor, validateOfferIndex } from './revenue-matching.mjs';
export function partnerIndexFromCapture(raw) {
  const capture = JSON.parse(raw);
  if (
    !Array.isArray(capture.pages) ||
    !Number.isSafeInteger(capture.totalListed)
  )
    throw Error('invalid_capture');
  const rows = capture.pages.flatMap((p) => p.offers || []);
  if (
    rows.length !== capture.totalListed ||
    new Set(rows.map((r) => String(r.id))).size !== rows.length
  )
    throw Error('incomplete_capture');
  return validateOfferIndex({
    schema: 'noah-partner-index/1',
    checkedAt: capture.checkedAt,
    sourceSha256: createHash('sha256').update(raw).digest('hex'),
    offers: rows
      .filter((o) => o.status === '提携中')
      .map((o) => ({
        id: String(o.id),
        partnered: true,
        domains: domainsFor(o.name + ' ' + o.text),
      })),
  });
}
export async function syncRevenueIndex(
  index,
  token,
  { start = false, fetcher = fetch } = {},
) {
  validateOfferIndex(index);
  if (typeof token !== 'string' || token.length < 32)
    throw Error('owner_token_missing');
  const call = async (input) => {
    const response = await fetcher(
      'https://noah-revenue-agents.mr-kirin999.workers.dev/operations/api',
      {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(60000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw Error('owner_api_' + response.status);
    }
    return response.json();
  };
  let state = await call({ action: 'revenue_status' });
  if (state.index?.sourceSha256 !== index.sourceSha256) {
    await call({
      action: 'revenue_index',
      index,
      expectedRevision: state.revision,
    });
    state = await call({ action: 'revenue_status' });
  }
  if (start && !state.enabled)
    await call({ action: 'revenue_start', expectedRevision: state.revision });
  await call({ action: 'revenue_sync' });
  return call({ action: 'revenue_status' });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const [command, source, destination] = process.argv.slice(2);
    if (command === 'build-index' && destination?.endsWith('.private.json')) {
      const index = partnerIndexFromCapture(await readFile(source, 'utf8'));
      await writeFile(destination, JSON.stringify(index), {
        mode: 0o600,
        flag: 'wx',
      });
      console.log(
        JSON.stringify({
          offers: index.offers.length,
          checkedAt: index.checkedAt,
        }),
      );
    } else if (command === 'sync' && source && destination) {
      const index = JSON.parse(await readFile(source, 'utf8')),
        secrets = JSON.parse(await readFile(destination, 'utf8'));
      const state = await syncRevenueIndex(index, secrets.OPERATIONS_TOKEN, {
        start: process.argv.includes('--start'),
      });
      console.log(
        JSON.stringify({
          enabled: state.enabled,
          catalog: state.catalog,
          candidates: state.matches?.total ?? null,
          published: state.published?.map((x) => x.id) ?? [],
        }),
      );
    } else
      throw Error(
        'usage: build-index capture.private.json output.private.json | sync index.private.json secrets.private.json [--start]',
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
