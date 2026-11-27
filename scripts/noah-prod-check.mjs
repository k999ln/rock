#!/usr/bin/env node
// 本番の確かめを、毎回同じ形で行う。本人の頼み（2026-11-27）「本番の確かめの道具（受入・画面・Mac のメニュー・一周）を、
// リポジトリの道具にして毎回使えるようにする」。task 129 の D5（一周）・D7（44px）。
//
// 使い方（origin を省くと https://avoado.si）:
//   node scripts/noah-prod-check.mjs pages [origin] [--widths=390,1280] [--sessions=signed-out,browser] [--paths=/noah,/aries]
//     画面: Noah の全部の画面（app/noah の page と、星座名の URL）を、幅ごと・本人の有無ごとに開いて測る。
//     signed-out = Cookie の無いブラウザ。browser = 先にブラウザだけの本人を作ったブラウザ。読むだけ（本人を作る事だけは起きる）。
//   node scripts/noah-prod-check.mjs devices [origin]
//     端末の違い: Mac と Linux の PC（1280px）で、/noah のメニューの行き先を比べる。
//   node scripts/noah-prod-check.mjs accept [origin] --write
//     受入（書き込みあり）: ブラウザだけの本人で、つなぐ → 読むだけの道具を 1 回頼む → 切る、ボードを作って消す、
//     登録情報に試験の名前を入れて消す。作った物は、途中で落ちても最後に消す。
//   node scripts/noah-prod-check.mjs loop [origin] --write
//     一周（書き込みあり。spec-90 の 5 章の 1〜4・6・7・10）: スマホ幅で、つなぐ → 道具で頼む → 閉じて 1 分後に開く → 別の Agent へ移る → 切る。
//   node scripts/noah-prod-check.mjs all [origin] [--write]
//     pages・devices と、API の probe（scripts/noah-public-probe.mjs）。--write の時は accept と loop も。
//
// 結果は JSON を標準出力へ。--out=<dir> で、結果の JSON と画面の写真を dir に書く（Git に入れない）。
// 合格: はみ出し 0・小さい押す所 0・画面の誤り 0、受入と一周の行が全部通る。落ちた時は終わりの値が 1。
// 決まり: 書き込みは --write の時だけ。秘密の値・Cookie・本人の情報は出力しない。外の会社への登録や送信はしない。
// 本当のサインイン（ChatGPT）の画面は、この道具では作れない。本人の端末のブラウザで、scripts/noah-page-measure.mjs の関数を実行して測る。
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { measureNoahPage } from './noah-page-measure.mjs';
import { NOAH_SHORT_PAGES } from '../services/sky-web/noah-page-routes.mjs';
import { PROFILE_CONSENT_VERSION } from '../lib/noah-profile-contract.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const positional = args.filter((value) => !value.startsWith('--'));
const command = positional[0] ?? 'all';
const origin = (positional[1] ?? 'https://avoado.si').replace(/\/$/, '');
const write = args.includes('--write');
const outDir = flag('out');
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1 Noah-prod-check';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * app/noah の page（URL の中に値の要らない物）と、星座名の URL。値の要る画面は、公開の例を 1 つずつ。
 * 審査者の画面（/noah/review の下）は、審査者でない人には 404（決めた通り）なので入れない。
 */
export function noahPagePaths() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === 'page.tsx') found.push('/' + relative('app', dir).split('\\').join('/'));
    }
  };
  walk('app/noah');
  const fixed = found.filter((path) => !path.includes('[') && !/^\/noah\/review(?:\/|$)/.test(path)).sort((a, b) => a.localeCompare(b));
  return [...fixed, ...NOAH_SHORT_PAGES.map(([source]) => source), '/noah/tools/mr-citations', '/noah/tools/mr-free-article'];
}

function playwright() {
  try { return createRequire(import.meta.url)('playwright'); }
  catch { console.error('Playwright が見つかりません。npx playwright を使える環境で動かしてください。'); process.exit(2); }
}

async function session(context) {
  const response = await context.request.post(`${origin}/api/noah/session`, { headers: { Origin: origin } });
  return response.status();
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
}

/** 画面を測る。幅 × 本人の有無ごとに、全部の画面。同じ所へ転送された画面は、2 回目から「同じ」とだけ書く。 */
async function pages() {
  const { chromium } = playwright();
  const widths = (flag('widths') ?? '390,1280').split(',').map(Number);
  const sessions = (flag('sessions') ?? 'signed-out,browser').split(',');
  const paths = flag('paths')?.split(',') ?? noahPagePaths();
  const browser = await chromium.launch();
  const runs = [];
  try {
    for (const width of widths) {
      for (const who of sessions) {
        const phone = width < 600;
        const context = await browser.newContext({
          viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, locale: 'ja-JP', ...(phone ? { userAgent: UA_PHONE } : {}),
        });
        const run = { width, who, session: who === 'browser' ? await session(context) : null, pages: [] };
        const seen = new Map();
        const queue = [...paths];
        const worker = async () => {
          for (let path; (path = queue.shift());) {
            const page = await context.newPage();
            const failed = [], errors = [];
            page.on('response', (response) => { if (response.url().startsWith(origin + '/api/') && response.status() >= 400) failed.push(`${response.request().method()} ${new URL(response.url()).pathname} ${response.status()}`); });
            page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));
            let status = null;
            try {
              status = (await page.goto(origin + path, { waitUntil: 'domcontentloaded', timeout: 45_000 }))?.status() ?? null;
              await settle(page);
              const found = await page.evaluate(measureNoahPage);
              const landed = found.path;
              const same = seen.get(landed);
              if (!same) seen.set(landed, path);
              run.pages.push({ path, status, landed, ...(same ? { sameAs: same } : { overflow: found.overflow, small: found.small }), failedApi: [...new Set(failed)], errors });
              if (outDir && !same) await page.screenshot({ path: join(outDir, `page-${width}-${who}${path.replace(/[^a-z0-9]+/gi, '_')}.png`) }).catch(() => undefined);
            } catch (error) {
              run.pages.push({ path, status, errors: [...errors, String(error).slice(0, 200)] });
            } finally {
              await page.close();
            }
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
        run.pages.sort((a, b) => paths.indexOf(a.path) - paths.indexOf(b.path));
        run.overflow = run.pages.filter((page) => page.overflow > 0).map((page) => `${page.path} ${page.overflow}px`);
        run.small = run.pages.filter((page) => page.small?.length).map((page) => `${page.path}: ${page.small.join(' | ')}`);
        run.errors = run.pages.filter((page) => page.errors?.length).map((page) => `${page.path}: ${page.errors.join(' | ')}`);
        run.notFound = run.pages.filter((page) => page.status === 404).map((page) => page.path);
        run.ok = !run.overflow.length && !run.small.length && !run.errors.length && !run.notFound.length;
        runs.push(run);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return { ok: runs.every((run) => run.ok), pages: paths.length, runs };
}

/** Mac と Linux の PC で、/noah のメニューの行き先を比べる（端末で変わる所が残っていないか）。 */
async function devices() {
  const { chromium } = playwright();
  const browser = await chromium.launch();
  const links = {};
  try {
    for (const [name, platform, uaPlatform] of [['mac', 'MacIntel', 'macOS'], ['linux', 'Linux x86_64', 'Linux']]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' });
      await context.addInitScript(([p, u]) => {
        Object.defineProperty(Navigator.prototype, 'platform', { get: () => p });
        Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 0 });
        Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => ({ platform: u, mobile: false, brands: [] }) });
      }, [platform, uaPlatform]);
      const page = await context.newPage();
      await page.goto(`${origin}/noah`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await settle(page);
      links[name] = await page.locator('nav a[href]').evaluateAll((elements) => [...new Set(elements.map((a) => a.getAttribute('href') ?? ''))].sort((a, b) => a.localeCompare(b)));
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const onlyMac = links.mac.filter((href) => !links.linux.includes(href));
  const onlyLinux = links.linux.filter((href) => !links.mac.includes(href));
  return { ok: links.mac.length > 0 && !onlyLinux.length, menu: links.mac.length, onlyMac, onlyLinux };
}

/** API の probe（読むだけ）。500 番台と、応答の無い物を落ちとする。 */
function probe() {
  const result = spawnSync(process.execPath, [join(root, 'scripts/noah-public-probe.mjs'), origin, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) return { ok: false, error: (result.stderr || '').slice(0, 400) };
  const rows = JSON.parse(result.stdout).filter((row) => !row.skipped);
  const counts = {};
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  const broken = rows.filter((row) => row.status >= 500 || row.status === -1).map((row) => `${row.who} ${row.status} ${row.route}`);
  return { ok: !broken.length, counts, broken };
}

/** 受入（書き込みあり）。知らない人のブラウザ 1 つ。作った物は finally で消す。 */
async function accept() {
  const steps = [];
  const log = (step, ok, detail = {}) => steps.push({ step, ok, ...detail });
  let cookie = '';
  const call = async (path, { method = 'GET', body, scope } = {}) => {
    const headers = { Origin: origin, Accept: 'application/json', 'User-Agent': UA_PHONE };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (scope) headers['X-Rock-Owner-Scope'] = scope;
    const response = await fetch(origin + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', signal: AbortSignal.timeout(60_000) });
    const set = response.headers.get('set-cookie');
    if (set?.startsWith('__Host-noah_access=')) cookie = set.split(';')[0];
    let data = null;
    try { data = await response.json(); } catch { /* not json */ }
    return { status: response.status, data };
  };
  /** @type {{ connections: string[], boards: { id: string, revision: number }[], profile: boolean }} */
  const cleanup = { connections: [], boards: [], profile: false };
  let scope = null;
  try {
    const made = await call('/api/noah/session', { method: 'POST' });
    log('session', made.status === 200 && !!cookie, { status: made.status });
    const profile = await call('/api/noah/profile');
    scope = profile.data?.ownerScope ?? null;
    log('profile-read', profile.status === 200 && profile.data?.browserOwned === true, { status: profile.status });
    for (const q of ['画像', '翻訳', '要約']) {
      const found = await call(`/api/noah/discover?q=${encodeURIComponent(q)}`);
      log(`search ${q}`, found.status === 200 && found.data?.total > 0, { total: found.data?.total ?? null });
    }
    const home = await call('/api/noah/discover?source=noah&firstJobs=1');
    const candidates = (home.data?.items ?? []).filter((item) => item.oneTap && !item.external).slice(0, 6);
    log('one-tap-candidates', candidates.length > 0, { count: candidates.length });
    let asked = null;
    for (const item of candidates) {
      const plan = await call(`/api/noah/connect-plan?agent=${encodeURIComponent(item.id)}`);
      if (plan.status !== 200 || plan.data?.cost?.taps !== 0) continue;
      const connectionId = randomUUID();
      const connected = await call('/api/noah/connect', { method: 'POST', scope, body: { id: connectionId, agentId: item.id, planSha256: plan.data.planSha256 } });
      if (connected.status === 200) cleanup.connections.push(connectionId);
      log(`connect ${item.name}`, connected.status === 200 && connected.data?.state === 'connected', { status: connected.status, state: connected.data?.state ?? null, error: connected.data?.error ?? null });
      if (connected.data?.state !== 'connected') continue;
      const tools = await call(`/api/noah/connect/${connectionId}/tools`);
      const tool = (tools.data?.tools ?? []).find((one) => one.usable && one.readOnly && one.required === 0);
      log(`tools ${item.name}`, tools.status === 200 && !!tool, { status: tools.status, count: tools.data?.tools?.length ?? null, chosen: tool?.name ?? null });
      if (!tool) continue;
      const askId = randomUUID();
      const accepted = await call('/api/noah/ask', { method: 'POST', scope, body: { id: askId, connectionId, form: { tool: tool.name, toolSha256: tool.sha256, input: {} }, screen: 'narrow' } });
      log(`ask ${item.name}`, accepted.status === 202, { status: accepted.status, error: accepted.data?.error ?? null });
      if (accepted.status !== 202) continue;
      let state = null, detail = null;
      for (let i = 0; i < 30 && !['succeeded', 'failed', 'needs_user', 'stopped'].includes(state); i++) {
        await sleep(3000);
        detail = await call(`/api/noah/ask/${askId}`);
        state = detail.data?.state ?? null;
      }
      log(`result ${item.name}`, state === 'succeeded', { state, chars: (detail?.data?.result?.text ?? '').length });
      asked = { agent: item.name, tool: tool.name, state };
      if (state === 'succeeded') break;
    }
    log('asked-once', asked?.state === 'succeeded', { asked });
    const board = await call('/api/noah/boards', { method: 'POST', scope, body: { action: 'create', name: `受入の試験 ${new Date().toISOString().slice(0, 10)}`, visibility: 'private' } });
    const created = board.data?.board ?? board.data;
    if (created?.id) cleanup.boards.push(created);
    log('board-create', board.status === 200 && !!created?.id, { status: board.status, error: board.data?.error ?? null });
    const before = await call('/api/noah/profile');
    const saved = await call('/api/noah/profile', { method: 'POST', scope, body: { action: 'fields', revision: before.data?.revision, consentVersion: PROFILE_CONSENT_VERSION, reuse: true, fields: { displayName: '受入の試験' } } });
    cleanup.profile = saved.status === 200;
    log('profile-save', saved.status === 200 && saved.data?.fields?.displayName === '受入の試験', { status: saved.status, error: saved.data?.error ?? null });
  } catch (error) {
    log('error', false, { message: String(error?.message ?? error).slice(0, 300) });
  } finally {
    for (const connectionId of cleanup.connections) {
      const current = await call(`/api/noah/connect/${connectionId}`).catch(() => null);
      if (current?.data?.state === 'disconnected') { log('disconnect', true, { already: true }); continue; }
      const cut = await call(`/api/noah/connect/${connectionId}`, { method: 'POST', scope, body: { action: 'disconnect', revision: current?.data?.revision } }).catch(() => ({ status: -1, data: null }));
      log('disconnect', cut.status === 200, { status: cut.status, state: cut.data?.state ?? null });
    }
    for (const board of cleanup.boards) {
      const removed = await call('/api/noah/boards', { method: 'POST', scope, body: { action: 'remove', id: board.id, revision: board.revision } }).catch(() => ({ status: -1, data: null }));
      log('board-remove', removed.status === 200, { status: removed.status, error: removed.data?.error ?? null });
    }
    if (cleanup.profile) {
      const now = await call('/api/noah/profile').catch(() => null);
      const cleared = await call('/api/noah/profile', { method: 'POST', scope, body: { action: 'clear', revision: now?.data?.revision } }).catch(() => ({ status: -1, data: null }));
      log('profile-clear', cleared.status === 200 && Object.keys(cleared.data?.fields ?? {}).length === 0, { status: cleared.status });
    }
  }
  return { ok: steps.every((step) => step.ok || step.step.startsWith('connect ') || step.step.startsWith('tools ') || step.step.startsWith('ask ') || step.step.startsWith('result ')), passed: steps.filter((step) => step.ok).length, failed: steps.filter((step) => !step.ok).map((step) => step.step), steps };
}

async function cli() {
  const report = { origin, at: new Date().toISOString() };
  const want = (name) => command === name || command === 'all';
  if (!['pages', 'devices', 'accept', 'loop', 'all'].includes(command)) {
    console.error(`知らない命令: ${command}（pages・devices・accept・loop・all）`);
    process.exit(2);
  }
  if ((command === 'accept' || command === 'loop') && !write) {
    console.error(`${command} は本番に書き込みます。--write を付けて動かしてください。`);
    process.exit(2);
  }
  if (outDir) mkdirSync(outDir, { recursive: true });
  if (want('pages')) report.pages = await pages();
  if (want('devices')) report.devices = await devices();
  if (command === 'all') report.probe = probe();
  if ((command === 'accept' || command === 'all') && write) report.accept = await accept();
  if ((command === 'loop' || command === 'all') && write) report.loop = await (await import('./noah-prod-loop.mjs')).noahProdLoop({ origin, outDir, playwright: playwright(), measure: measureNoahPage });
  report.ok = Object.values(report).every((part) => typeof part !== 'object' || part.ok !== false);
  if (outDir) writeFileSync(join(outDir, `result-${command}.json`), JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify(report, null, 1));
  process.exitCode = report.ok ? 0 : 1;
}

// 試験が noahPagePaths だけを読む時は、何も動かさない。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cli();
