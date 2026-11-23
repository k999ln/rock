import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { desktopJobs } from './jobs.mjs';
import { prepareManagedDesktopRuntime } from '../../scripts/noah-managed-desktop.mjs';

const digest = value => createHash('sha256').update(value).digest();
export function desktopHandler(jobs, token, packageSha) {
  const expected = digest('Bearer ' + token);
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const fail = status => { res.writeHead(status); res.end(); };
    if (!timingSafeEqual(digest(req.headers.authorization ?? ''), expected)) return fail(401);
    if (req.headers['x-noah-desktop-package'] !== packageSha) return fail(409);
    const match = /^\/jobs\/([0-9a-f]{64})$/.exec(req.url ?? '');
    if (!match) return fail(404);
    let input;
    if (req.method === 'PUT') {
      const parts = [];
      let size = 0;
      for await (const part of req) {
        size += part.length;
        if (size > 4096) return fail(413);
        parts.push(part);
      }
      try { input = JSON.parse(Buffer.concat(parts).toString('utf8')); }
      catch { return fail(400); }
    }
    const result = await jobs.handle(req.method, match[1], input);
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(await result.text());
  };
}

async function start() {
  const { DESKTOP_RUNNER_TOKEN: token, NOAH_DESKTOP_PACKAGE_SHA256: sha,
    NOAH_DESKTOP_PACKAGE: file, NOAH_DESKTOP_DB: dbFile } = process.env;
  if (process.platform !== 'linux' || !token || token.length < 32 ||
      !/^[0-9a-f]{64}$/.test(sha ?? '') || !file?.endsWith('.zip') ||
      !dbFile || dbFile === ':memory:') throw Error('専用Linuxと固定パッケージ・永続DB・接続設定を確認してください。');
  const info = await stat(file);
  if (!info.isFile() || info.size > 16 * 1024 * 1024) throw Error('パッケージの大きさを確認してください。');
  const bytes = await readFile(file);
  if (digest(bytes).toString('hex') !== sha) throw Error('配備したパッケージのSHA-256が一致しません。');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const definition = { schema: 'noah-desktop/1', language: 'python',
    entrypoint: 'main.py', model: 'none' };
  const prepare = signal => prepareManagedDesktopRuntime({
    root, name: basename(file), bytes, expectedSha: sha, definition, signal,
  });
  // The result cache belongs to the service account on this dedicated VM.
  process.umask(0o077);
  const db = new DatabaseSync(dbFile);
  const handler = desktopHandler(desktopJobs(db, prepare, sha), token, sha);
  const server = createServer({ requestTimeout: 15000, headersTimeout: 10000 }, (req, res) => {
    handler(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(503, { 'Cache-Control': 'no-store' });
      res.end();
    });
  });
  server.maxConnections = 64;
  server.listen(8789, '127.0.0.1');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await start();
