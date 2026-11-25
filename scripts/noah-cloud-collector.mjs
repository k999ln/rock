#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, rmSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { collectionSignature } from '../lib/noah-collection.ts';
import { NOAH_CHECKPOINT_PATH, NOAH_CHECKPOINT_BYTES, NOAH_CHECKPOINT_CHUNK_CHARS, checkpointChunkHash } from '../lib/noah-collector-checkpoint.ts';
import { createCollectorNetwork } from './noah-collector-network.mjs';
import { runCollector } from './noah-agent-collector.mjs';
import { createNoahPinWriter } from './noah-collector-pins.mjs';
import { publishCollection } from './noah-collector-publish.mjs';

const SQLITE_LIMIT = 256 * 1024 * 1024;
async function boundedResponse(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('cloud_checkpoint_response');
  const chunks = []; let size = 0;
  for (;;) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > NOAH_CHECKPOINT_BYTES) { await reader.cancel(); throw Error('cloud_checkpoint_too_large'); }
    chunks.push(Buffer.from(part.value));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function checkpointClient({ origin, key, fetcher, now = Date.now }) {
  const target = new URL(origin);
  if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/' || target.search || target.hash || !key || key.length < 32) throw Error('cloud_configuration');
  const request = async (value, { allowMissing = false } = {}) => {
    const body = JSON.stringify(value), time = String(now());
    if (Buffer.byteLength(body) > NOAH_CHECKPOINT_BYTES) throw Error('cloud_checkpoint_too_large');
    const response = await fetcher(new URL(NOAH_CHECKPOINT_PATH, target), { method: 'POST', redirect: 'manual', body, signal: AbortSignal.timeout(60_000),
      headers: { 'Content-Type': 'application/json', 'x-noah-collector-time': time, 'x-noah-collector-signature': await collectionSignature(key, time, body, NOAH_CHECKPOINT_PATH) } });
    if (response.status === 404 && allowMissing) { await response.body?.cancel(); return null; }
    if (!response.ok) { await response.body?.cancel(); throw Error(`cloud_checkpoint_http_${response.status}`); }
    return boundedResponse(response);
  };
  return async (value, options) => {
    if (value.action === 'write' && value.checkpoint?.sqliteGzip?.length > NOAH_CHECKPOINT_CHUNK_CHARS) {
      const { sqliteGzip, ...metadata } = value.checkpoint, chunks = [];
      if (Math.ceil(sqliteGzip.length / NOAH_CHECKPOINT_CHUNK_CHARS) > 128) throw Error('cloud_checkpoint_too_large');
      for (let offset = 0; offset < sqliteGzip.length; offset += NOAH_CHECKPOINT_CHUNK_CHARS) {
        const data = sqliteGzip.slice(offset, offset + NOAH_CHECKPOINT_CHUNK_CHARS), hash = await checkpointChunkHash(data);
        await request({ action: 'write_chunk', hash, data }); chunks.push(hash);
      }
      return request({ ...value, checkpoint: { ...metadata, schema: 'noah-collector-checkpoint/2', chunks } }, options);
    }
    const result = await request(value, options);
    if (value.action === 'read' && result?.checkpoint?.schema === 'noah-collector-checkpoint/2') {
      const { chunks, ...metadata } = result.checkpoint;
      if (!Array.isArray(chunks) || !chunks.length || chunks.length > 128) throw Error('cloud_checkpoint_invalid');
      const parts = [];
      for (const hash of chunks) {
        const part = await request({ action: 'read_chunk', hash });
        if (typeof part.data !== 'string' || part.data.length > NOAH_CHECKPOINT_CHUNK_CHARS || await checkpointChunkHash(part.data) !== hash) throw Error('cloud_checkpoint_invalid');
        parts.push(part.data);
      }
      result.checkpoint = { ...metadata, schema: 'noah-collector-checkpoint/1', sqliteGzip: parts.join('') };
    }
    return result;
  };
}
export function validateCollectorDatabase(path, now = Date.now()) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    if (Object.values(db.prepare('PRAGMA quick_check').get())[0] !== 'ok') throw Error('cloud_checkpoint_database');
    const lock = db.prepare('SELECT owner,expires_at FROM _noah_collector_lock WHERE id=1').get();
    if (!lock || lock.owner && lock.expires_at > now) throw Error('cloud_checkpoint_active');
    for (const table of ['noah_intake_candidates', 'noah_discovery_candidates']) db.prepare(`SELECT count(*) FROM ${table}`).get();
  } finally { db.close(); }
}
export function encodeCheckpoint(directory, runId, now = Date.now()) {
  const path = join(directory, 'intake.sqlite');
  validateCollectorDatabase(path, now);
  const bytes = readFileSync(path);
  if (bytes.length > SQLITE_LIMIT) throw Error('cloud_checkpoint_too_large');
  return { schema: 'noah-collector-checkpoint/1', updatedAt: now, runId, sqliteGzip: gzipSync(bytes).toString('base64') };
}
export function restoreCheckpoint(directory, checkpoint, now = Date.now()) {
  if (checkpoint?.schema !== 'noah-collector-checkpoint/1' || typeof checkpoint.sqliteGzip !== 'string') throw Error('cloud_checkpoint_invalid');
  const bytes = gunzipSync(Buffer.from(checkpoint.sqliteGzip, 'base64'), { maxOutputLength: SQLITE_LIMIT });
  if (bytes.subarray(0, 16).toString() !== 'SQLite format 3\0') throw Error('cloud_checkpoint_database');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'intake.sqlite'), temporary = `${path}.restore`;
  // Never overwrite an existing local collector, WAL, or interrupted restore.
  if (['', '-wal', '-shm', '.restore'].some(suffix => existsSync(path + suffix))) throw Error('cloud_directory_not_empty');
  try {
    writeFileSync(temporary, bytes, { mode: 0o600, flag: 'wx' });
    validateCollectorDatabase(temporary, now);
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}

/** 出所が続けて失敗した回数が、これ以上なら人が見る（1 回きりの失敗・混雑は、次の回に続きから動くので、落ちた扱いにしない）。 */
export const COLLECTOR_ALERT_REPEAT = 6;
/**
 * 失敗を「人が見る物（alerts）」と「次の回に任せる物（warnings）」に分ける。
 * 人が見る物: 本番への取り込み・掲載の失敗、形が変わった応答、鍵の問題（X）、同じ出所が COLLECTOR_ALERT_REPEAT 回以上続けて失敗。
 */
export function collectorAlerts(status, repeat = COLLECTOR_ALERT_REPEAT) {
  const failures = new Map((status.sources ?? []).map((source) => [source.id, Number(source.failure_count) || 0]));
  const alerts = [], warnings = [];
  for (const error of status.errors ?? []) {
    const count = failures.get(error.source) ?? 0;
    const actionable = ['import', 'publication'].includes(error.source) || error.code === 'invalid_response' || error.source === 'pins' && error.code === 'needs_credentials' || count >= repeat
      || (error.source === 'x' && ['needs_credentials', 'quota_required'].includes(error.code));
    (actionable ? alerts : warnings).push(count ? { ...error, failures: count } : error);
  }
  return { alerts, warnings };
}
const cell = (value) => String(value ?? '—').replace(/[|\r\n]/g, ' ');
/** GitHub の実行の要約（GITHUB_STEP_SUMMARY）に書く、1 回分の数。鍵や中身は書かない。 */
export function collectorSummary(result) {
  const counts = result.counts ?? {}, lines = ['## Noah の Agent 収集', ''];
  lines.push('| 台帳 | 有効 | 握手した | 一覧に載る | まだ確かめていない |', '| ---: | ---: | ---: | ---: | ---: |',
    `| ${cell(counts.registry)} | ${cell(counts.active)} | ${cell(counts.handshake)} | ${cell(counts.listed)} | ${cell(counts.unchecked)} |`, '');
  if (result.import) lines.push(`本番の一覧へ入れた: ${cell(result.import.status)}（送った系列 ${cell(result.import.sent)}・書いた行 ${cell(result.import.rowsWritten)}・待っている ${cell(result.import.waiting)}）`, '');
  if (result.pins) lines.push(`図解ピンの生成は ${cell(result.pins.status)} です。作成 ${cell(result.pins.written)} 件、見送り ${cell(result.pins.skipped)} 件、形式違反 ${cell(result.pins.invalid)} 件です。今回の上限で ${cell(result.pins.perRunStopped)} 件、月の上限で ${cell(result.pins.monthStopped)} 件が残りました。`, '');
  if (result.published?.length) {
    lines.push('| 出所 | 載せた数 | 集める先の状態 |', '| --- | ---: | --- |');
    for (const item of result.published) lines.push(`| ${cell(item.source)} | ${cell(item.items)} | ${cell(result.feeds?.[item.source] ?? '')} |`);
    lines.push('');
  }
  const { alerts = [], warnings = [] } = result;
  lines.push(alerts.length ? `**人が見る失敗: ${alerts.length} 件**` : '人が見る失敗: なし');
  for (const item of alerts) lines.push(`- ${cell(item.source)}: ${cell(item.code)}${item.failures ? `（${item.failures} 回続けて）` : ''}`);
  if (warnings.length) {
    lines.push('', `次の回に任せる失敗: ${warnings.length} 件（続きから動く）`);
    for (const item of warnings) lines.push(`- ${cell(item.source)}: ${cell(item.code)}${item.failures ? `（${item.failures} 回目）` : ''}`);
  }
  return lines.join('\n') + '\n';
}

export async function runCloudCollector({ directory, origin, key, xToken, runId, fetcher, now = Date.now, collect = runCollector, bootstrap, importIntake = false, smitheryKey, githubToken, pinEnabled = false, pinImportEnabled = false, pinKey }) {
  if (!/^(bootstrap|[0-9]{1,25})$/.test(runId)) throw Error('cloud_run_id');
  const network = fetcher ? null : createCollectorNetwork();
  const transport = fetcher ?? network.fetch;
  try {
    const request = checkpointClient({ origin, key, fetcher: transport, now });
    const saved = await request({ action: 'read' }, { allowMissing: !!bootstrap });
    if (bootstrap) {
      if (saved) throw Error('cloud_checkpoint_already_seeded');
      const checkpoint = encodeCheckpoint(bootstrap, 'bootstrap', now());
      const result = await request({ action: 'write', etag: null, checkpoint });
      return { seeded: true, updatedAt: result.updatedAt };
    }
    if (!saved?.etag || !saved.checkpoint) throw Error('cloud_checkpoint_missing');
    restoreCheckpoint(directory, saved.checkpoint, now());
    // 収集機の鍵と同じ鍵で、握手の済んだ系列を一覧へ入れる（--import。紹介の掲載より前に入れ、カードの「スマホで今すぐ」を入れ終えた物に合わせる）。
    const status = await collect({ directory, fetcher: transport, now, xToken, smitheryKey, githubToken, pinEnabled, pinImportEnabled, pinWriter: pinEnabled && pinKey ? createNoahPinWriter(pinKey, fetcher) : undefined, ...(importIntake ? { importOrigin: origin, publishKey: key } : {}) });
    const checkpoint = encodeCheckpoint(directory, runId, Math.max(now(), saved.checkpoint.updatedAt + 1));
    // Commit progress before publishing. A stale runner cannot publish its snapshot.
    await request({ action: 'write', etag: saved.etag, checkpoint });
    const { snapshots } = JSON.parse(readFileSync(join(directory, 'collection.json'), 'utf8'));
    const published = await publishCollection({ snapshots, origin, key, fetcher: transport, now });
    return { runId, updatedAt: checkpoint.updatedAt, previousRunId: saved.checkpoint.runId, counts: status.counts, errors: status.errors, ...collectorAlerts(status), x: status.steps.x.status,
      feeds: Object.fromEntries(Object.entries(status.steps.feeds ?? {}).map(([id, feed]) => [id, feed.status])), import: status.steps.import ?? null, pins: status.steps.pins ?? null, published };
  } finally { await network?.close(); }
}
async function main() {
  const { values } = parseArgs({ options: { dir: { type: 'string' }, origin: { type: 'string' }, bootstrap: { type: 'string' }, import: { type: 'boolean' } } });
  if (!values.dir || !values.origin) throw Error('cloud_arguments');
  const result = await runCloudCollector({ directory: resolve(values.dir), origin: values.origin, bootstrap: values.bootstrap && resolve(values.bootstrap),
    key: process.env.NOAH_COLLECTION_KEY, xToken: process.env.NOAH_X_BEARER_TOKEN, runId: values.bootstrap ? 'bootstrap' : process.env.GITHUB_RUN_ID,
    importIntake: !!values.import, smitheryKey: process.env.SMITHERY_API_KEY || undefined, githubToken: process.env.GITHUB_TOKEN || undefined, pinEnabled: process.env.NOAH_PINS_GENERATE === 'true', pinImportEnabled: process.env.NOAH_PINS_IMPORT === 'true', pinKey: process.env.NOAH_PIN_OPENAI_API_KEY });
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_STEP_SUMMARY && !result.seeded) appendFileSync(process.env.GITHUB_STEP_SUMMARY, collectorSummary(result));
  // 落ちた扱いにするのは、人が見る失敗の時だけ（1 回きりの失敗は、次の回が続きから動く）。
  if (result.alerts?.length) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => {
  console.error(/^(cloud_|collector_publish_)[a-z0-9_]+$/.test(error.message) ? error.message : 'cloud_collection_failed'); process.exitCode = 1;
});
