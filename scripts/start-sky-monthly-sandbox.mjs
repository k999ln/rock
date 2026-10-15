// Loopback-only synthetic account. Same UI, HTTP handler, workflow and DB contract as the local Web route.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';
import { openMonthlySandboxDatabase } from './sky-monthly-sandbox-db.mjs';
import { handleMonthlySandbox } from '../lib/sky-monthly-sandbox-http.ts';
import { handleCloudMonthlyTest } from '../lib/sky-cloud-monthly-http.ts';
const cloudMode = process.env.SKY_MONTHLY_PROVIDER_TEST === '1';
const cloudEnv = cloudMode ? JSON.parse(readFileSync(process.env.SKY_CLOUD_MONTHLY_CONFIG_FILE, 'utf8')) : {};
const port = Number(process.env.SKY_MONTHLY_TEST_PORT || (cloudMode ? 5222 : 5220));
const base = `http://127.0.0.1:${port}`;
const session = randomBytes(32).toString('hex');
const databasePath = resolve(process.env.SKY_MONTHLY_TEST_DB || (cloudMode ? 'work/sky-cloud-monthly-test/state.sqlite' : 'work/sky-monthly-sandbox/state.sqlite'));
mkdirSync(dirname(databasePath), { recursive: true });
const db = openMonthlySandboxDatabase(databasePath);
const bundle = await build({ stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import App from './components/" + (cloudMode ? "sky-cloud-monthly-test" : "sky-monthly-sandbox") + "';createRoot(document.getElementById('root')).render(<App/>);", resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } });
const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}` || req.headers['sec-fetch-site'] === 'cross-site') { res.writeHead(403); res.end(); return; }
    const url = new URL(req.url, base);
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (req.method === 'GET' && ['/', '/sky/billing'].includes(url.pathname)) {
      res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': `sky_monthly_local=${session}; HttpOnly; SameSite=Strict; Path=/` });
      res.end('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sky 月次請求テスト</title><body style="margin:0;background:#e2e8f0"><div id="root"></div><script src="/app.js"></script></body></html>'); return;
    }
    if (req.method === 'GET' && url.pathname === '/app.js') { res.writeHead(200, { ...headers, 'Content-Type': 'text/javascript' }); res.end(bundle.outputFiles[0].contents); return; }
    const webhook = cloudMode && url.pathname === '/api/sky/cloud-monthly-test/webhook';
    if (!['/api/sky/monthly-sandbox', ...(cloudMode ? ['/api/sky/cloud-monthly-test/account', '/api/sky/cloud-monthly-test/webhook'] : [])].includes(url.pathname)) { res.writeHead(404); res.end(); return; }
    if (!webhook && !(req.headers.cookie || '').split(';').some(value => value.trim() === `sky_monthly_local=${session}`)) { res.writeHead(401); res.end(); return; }
    const parts = []; let size = 0;
    for await (const part of req) { size += part.length; if (size > (webhook ? 200000 : 85000)) { res.writeHead(413); res.end(); return; } parts.push(part); }
    const request = new Request(url, { method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body: Buffer.concat(parts) } : {}) });
    const response = cloudMode ? await handleCloudMonthlyTest(request, webhook ? null : 'local-cloud-test-owner', db, cloudEnv) : await handleMonthlySandbox(request, 'local-sandbox-owner', db, 'local-fixture');
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
  } catch { res.writeHead(500); res.end('Local sandbox error'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Sky monthly ${cloudMode ? 'Stripe test' : 'sandbox'}: ${base}/sky/billing (synthetic account; no real payments)`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
