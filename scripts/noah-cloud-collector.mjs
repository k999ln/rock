#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { collectionSignature } from '../lib/noah-collection.ts';
import { NOAH_CHECKPOINT_PATH, NOAH_CHECKPOINT_BYTES, NOAH_CHECKPOINT_CHUNK_CHARS, checkpointChunkHash } from '../lib/noah-collector-checkpoint.ts';
import { createCollectorNetwork } from './noah-collector-network.mjs';
import { runCollector } from './noah-agent-collector.mjs';
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

export async function runCloudCollector({ directory, origin, key, xToken, runId, fetcher, now = Date.now, collect = runCollector, bootstrap }) {
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
    const status = await collect({ directory, fetcher: transport, now, xToken });
    const checkpoint = encodeCheckpoint(directory, runId, Math.max(now(), saved.checkpoint.updatedAt + 1));
    // Commit progress before publishing. A stale runner cannot publish its snapshot.
    await request({ action: 'write', etag: saved.etag, checkpoint });
    const { snapshots } = JSON.parse(readFileSync(join(directory, 'collection.json'), 'utf8'));
    const published = await publishCollection({ snapshots, origin, key, fetcher: transport, now });
    return { runId, updatedAt: checkpoint.updatedAt, previousRunId: saved.checkpoint.runId, counts: status.counts, errors: status.errors, x: status.steps.x.status, published };
  } finally { await network?.close(); }
}
async function main() {
  const { values } = parseArgs({ options: { dir: { type: 'string' }, origin: { type: 'string' }, bootstrap: { type: 'string' } } });
  if (!values.dir || !values.origin) throw Error('cloud_arguments');
  const result = await runCloudCollector({ directory: resolve(values.dir), origin: values.origin, bootstrap: values.bootstrap && resolve(values.bootstrap),
    key: process.env.NOAH_COLLECTION_KEY, xToken: process.env.NOAH_X_BEARER_TOKEN, runId: values.bootstrap ? 'bootstrap' : process.env.GITHUB_RUN_ID });
  console.log(JSON.stringify(result));
  if (result.errors?.length) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => {
  console.error(/^(cloud_|collector_publish_)[a-z0-9_]+$/.test(error.message) ? error.message : 'cloud_collection_failed'); process.exitCode = 1;
});
