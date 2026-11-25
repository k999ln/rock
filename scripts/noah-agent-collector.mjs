#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { createIntakeStore } from '../lib/noah-intake-store.ts';
import { createDiscoveryStore } from '../lib/noah-discovery-store.ts';
import { noahIntakeExport } from '../lib/noah-intake-import.ts';
import { NOAH_PATROL_BUDGET } from '../lib/noah-intake-wake.ts';
import { createCollectorNetwork } from './noah-collector-network.mjs';
import { openCollectorStore, writeCollectorJson, collectorCounts, collectorSources, readCollectorStatus } from './noah-collector-store.mjs';
import { collectXAgents } from './noah-collector-x.mjs';
import { collectionSnapshots, publishCollection } from './noah-collector-publish.mjs';
import { collectFeeds, feedLeads, feedStatus } from './noah-collector-feeds.mjs';
import { importFamilies, importedFamilies } from './noah-collector-import.mjs';
import { readScoutFile } from './noah-collector-social.mjs';
import { addCollectorPins, collectorPinFilter, prepareCollectorPins, writeCollectorPins } from './noah-collector-pins.mjs';
import { fileURLToPath } from 'node:url';

/** 読んだ紹介のファイル data/noah-scout/leads.json（task 125）。Codex・Claude が読んで理解した紹介を書き、収集機が毎回まとめて載せる。 */
export const NOAH_SCOUT_LEADS_PATH = fileURLToPath(new URL('../data/noah-scout/leads.json', import.meta.url));

/** One bounded pass. Provider failures retain their own checkpoints and retry deadlines. */
export async function collectAgents({ local, directory, fetcher, now = Date.now, budget = NOAH_PATROL_BUDGET, signal, xToken, publishOrigin, publishKey, importOrigin, smitheryKey, githubToken, pinWriter, pinEnabled = !!pinWriter, pinImportEnabled = false, scoutPath = NOAH_SCOUT_LEADS_PATH }) {
  const startedAt = now(), steps = {}, errors = [];
  const capture = pinWriter ? prepareCollectorPins(local) : undefined;
  const intake = createIntakeStore({ db: local.db, fetcher, now, budget, onCommittedRepresentativeHandshake: capture });
  const discovery = createDiscoveryStore({ db: local.db, fetcher, now });
  // Each source fails independently. Database/lease failures remain fatal.
  if (!signal?.aborted) steps.discovery = await discovery.sync();
  if (!signal?.aborted) steps.registry = await intake.sync();
  if (!signal?.aborted) steps.probe = await intake.probeDue(now() + budget.seconds * 1000);
  // 足した出所（task 121）。出所ごとに失敗を分け、形が変わった時（invalid_response）だけを、人が見る失敗にする。
  if (!signal?.aborted) steps.feeds = await collectFeeds({ local, fetcher, now, signal, keys: { smithery: smitheryKey, github: githubToken } });
  const x = !signal?.aborted ? await collectXAgents({ local, fetcher, token: xToken, now }) : { status: 'stopped', items: [] };
  steps.x = { status: x.status, collected: x.items.length, nextAt: x.nextAt ?? null };
  local.assertLease();
  const candidates = local.sql.prepare(`SELECT c.id,c.provider,c.repository,c.revision,c.checked_at,c.first_seen_at,v.metadata_json FROM noah_discovery_candidates c
    JOIN noah_discovery_versions v ON v.candidate_id=c.id AND v.revision=c.revision WHERE c.state='active' ORDER BY c.provider,c.id`).all()
    .map(({ metadata_json, ...row }) => ({ ...row, metadata: JSON.parse(metadata_json), verified: false }));
  const at = now(), scout = readScoutFile(scoutPath, at), leads = feedLeads(local, at);
  steps.scout = { collected: scout.items.length, rejected: scout.rejected };
  if (scout.rejected.file) errors.push({ source: 'scout', code: 'invalid_file' });
  const snapshotsFor = (exported, now) => collectionSnapshots({ exported, discoveries: candidates, x, now, leads,
    sent: importedFamilies(local.sql), xConfigured: !!xToken, scout: scout.items });
  if (pinEnabled && !pinWriter) steps.pins = { status: 'needs_credentials' };
  if (pinWriter && !signal?.aborted) {
    const preview = snapshotsFor(await noahIntakeExport(local.db, at, { includePins: false }), at);
    steps.pins = await writeCollectorPins({ local, snapshots: preview, writer: pinWriter, now, signal });
  }
  const exportedAt = now();
  const includePinFor = pinWriter ? collectorPinFilter(local) : undefined;
  const exported = await noahIntakeExport(local.db, exportedAt, { includePins: !!pinWriter, includePinFor });
  if (importOrigin && !signal?.aborted) {
    try { steps.import = await importFamilies({ local, origin: importOrigin, key: publishKey, fetcher, now, includePins: !!pinWriter && pinImportEnabled, includePinFor }); }
    catch (error) { steps.import = { status: 'failed' }; errors.push({ source: 'import', code: error.message.startsWith('collector_') ? error.message : 'unavailable' }); }
    if (steps.import?.status?.startsWith('http_')) errors.push({ source: 'import', code: steps.import.status });
  }
  writeCollectorJson(join(directory, 'discovery.json'), { schema: 'noah-discovery-export/1', exportedAt, candidates });
  writeCollectorJson(join(directory, 'import.json'), exported);
  const snapshots = snapshotsFor(exported, exportedAt);
  if (pinWriter) addCollectorPins(local, snapshots, exported);
  writeCollectorJson(join(directory, 'collection.json'), { snapshots });
  if (pinEnabled && ['needs_credentials', 'unavailable'].includes(steps.pins?.status)) errors.push({ source: 'pins', code: steps.pins.status });
  const sources = [...collectorSources(local.sql), ...feedStatus(local.sql)];
  for (const source of collectorSources(local.sql)) if (source.error_code) errors.push({ source: source.id, code: source.error_code });
  for (const [id, feed] of Object.entries(steps.feeds ?? {})) if (feed.status === 'invalid_response') errors.push({ source: id, code: feed.status });
  if (xToken && !['updated', 'not_due', 'stopped'].includes(x.status)) errors.push({ source: 'x', code: x.status });
  if (publishOrigin && !signal?.aborted) {
    try { steps.publish = await publishCollection({ snapshots, origin: publishOrigin, key: publishKey, fetcher, now }); }
    catch (error) { errors.push({ source: 'publication', code: error.message.startsWith('collector_publish_') ? error.message : 'unavailable' }); }
  }
  const state = { schema: 'noah-agent-collector/1', startedAt, updatedAt: now(), state: signal?.aborted ? 'stopped' : errors.length ? 'degraded' : 'ready',
    counts: collectorCounts(local.sql), sources, steps, errors, export: { at: exportedAt, families: exported.families.length, file: 'import.json' } };
  writeCollectorJson(join(directory, 'status.json'), state);
  return state;
}

export async function runCollector({ directory, watch = false, signal, fetcher, now = Date.now, budget = NOAH_PATROL_BUDGET, onStatus = () => {}, wait = sleep, xToken, publishOrigin, publishKey, importOrigin, smitheryKey, githubToken, pinEnabled, pinImportEnabled, pinWriter }) {
  const local = openCollectorStore(directory, { now });
  const network = fetcher ? null : createCollectorNetwork();
  const controller = new AbortController();
  const stop = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let leaseError, last;
  const heartbeat = setInterval(() => {
    try { local.renew(); } catch (error) { leaseError = error; controller.abort(); }
  }, 15_000);
  const transport = async (input, init = {}) => (fetcher ?? network.fetch)(input, { ...init,
    signal: AbortSignal.any([stop, ...(init.signal ? [init.signal] : [])]),
  });
  try {
    do {
      if (stop.aborted) break;
      last = await collectAgents({ local, directory, fetcher: transport, now, budget, signal: stop, xToken, publishOrigin, publishKey, importOrigin, smitheryKey, githubToken, pinEnabled, pinImportEnabled, pinWriter });
      if (leaseError) throw leaseError;
      onStatus(last);
      if (!watch || stop.aborted) break;
      // No busy loop while a provider is in backoff or has no due work.
      await wait(60_000, undefined, { signal: stop }).catch(error => { if (!stop.aborted) throw error; });
    } while (!stop.aborted);
    if (leaseError) throw leaseError;
    return last;
  } finally {
    clearInterval(heartbeat);
    await network?.close();
    local.close();
  }
}

export function collectorArguments(args) {
  const { values } = parseArgs({ args, options: { dir: { type: 'string' }, publish: { type: 'string' }, watch: { type: 'boolean' }, once: { type: 'boolean' }, status: { type: 'boolean' }, help: { type: 'boolean' } } });
  if ([values.watch, values.once, values.status].filter(Boolean).length > 1) throw Error('choose_once_watch_or_status');
  return { directory: resolve(values.dir ?? 'work/noah-collector'), publishOrigin: values.publish, watch: !!values.watch, status: !!values.status, help: !!values.help };
}

async function main() {
  const options = collectorArguments(process.argv.slice(2));
  if (options.help) {
    console.log('Noah Agent収集: --once（1巡・既定） / --watch（継続） / --status（状態） [--dir 保存先] [--publish https://avoado.si]\n停止はCtrl-C。同じ保存先で再開。掲載にはNOAH_COLLECTION_KEY、XにはNOAH_X_BEARER_TOKENを環境変数で設定。');
    return;
  }
  if (options.status) { console.log(JSON.stringify(readCollectorStatus(options.directory), null, 2)); return; }
  const controller = new AbortController(), stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const result = await runCollector({ ...options, xToken: process.env.NOAH_X_BEARER_TOKEN, publishKey: process.env.NOAH_COLLECTION_KEY, smitheryKey: process.env.SMITHERY_API_KEY || undefined, githubToken: process.env.GITHUB_TOKEN || undefined, signal: controller.signal, onStatus: state => console.log(JSON.stringify(state)) });
    if (!options.watch && result?.errors.length) process.exitCode = 1;
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => {
  // Provider bodies/URLs can contain secrets. Only our fixed error codes are printable.
  console.error(/^collector_|^choose_/.test(error.message) ? error.message : 'collector_failed'); process.exitCode = 1;
});
