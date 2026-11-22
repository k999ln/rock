import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

assert.equal(process.platform, 'darwin');
const origin = process.argv[2];
assert.ok(
  [
    'https://avoado.si',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].includes(origin),
);
const dir = await mkdtemp(join(tmpdir(), 'noah-anicca-acceptance-'));
const tracked = new Set();
const roots = [38483, 11434].flatMap((port) =>
  execFileSync('lsof', ['-nP', '-t', '-iTCP:' + port, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\s+/)
    .map(Number),
);
function sampleProcesses() {
  const tree = execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number));
  const pids = new Set(roots);
  let size;
  do {
    size = pids.size;
    for (const [pid, parent] of tree) if (pids.has(parent)) pids.add(pid);
  } while (size !== pids.size);
  for (const pid of pids) tracked.add(pid);
}
let observer,
  browser,
  page,
  editing,
  keepEditing = true,
  edits = 0,
  started = false,
  url = '';
try {
  execFileSync('swiftc', [
    fileURLToPath(new URL('./mac-observer.swift', import.meta.url)),
    '-o',
    join(dir, 'observe'),
  ]);
  sampleProcesses();
  observer = spawn(join(dir, 'observe'), [
    join(dir, 'stop'),
    join(dir, 'pids'),
  ]);
  const lines = createInterface({ input: observer.stdout });
  assert.equal((await once(lines, 'line'))[0], 'ready');
  const observation = once(lines, 'line');
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    chromiumSandbox: true,
  });
  const system = await browser.newBrowserCDPSession();
  for (const proc of (await system.send('SystemInfo.getProcessInfo'))
    .processInfo) {
    tracked.add(proc.id);
    if (proc.type === 'browser') roots.push(proc.id);
  }
  const owner = await browser.newContext({ locale: 'ja-JP' });
  await owner.grantPermissions(['local-network-access'], { origin });
  page = await owner.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(origin + '/noah/explore', { waitUntil: 'domcontentloaded' });
  await page.getByRole('searchbox', { name: 'Agentを検索' }).fill('Daisuke');
  await page
    .getByRole('link', { name: /DaisukeのココナラAgent/ })
    .first()
    .click();
  await page.getByRole('button', { name: '案件を探して下書きする' }).click();
  started = true;
  await page
    .getByText('公開案件を確認・提案を作成中', { exact: true })
    .waitFor();
  url = page.url();
  assert.match(url, /#run=[a-f0-9-]{36}$/);
  await page.close();
  const memo = join(dir, 'parallel-edit.txt');
  editing = (async () => {
    while (keepEditing) {
      const value = '作業メモ ' + ++edits;
      await writeFile(memo, value);
      assert.equal(await readFile(memo, 'utf8'), value);
      if (edits % 15 === 1) sampleProcesses();
      await delay(150);
    }
  })();
  await delay(4000);
  page = await owner.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const drafts = page
    .getByRole('region', { name: '提案の下書き' })
    .locator('article');
  await drafts.first().waitFor({ timeout: 250000 });
  const count = await drafts.count();
  const listing = await drafts.first().getByRole('link').getAttribute('href');
  assert.match(listing, /^https:\/\/coconala\.com\/requests\/[1-9]\d*$/);
  const title = await drafts.first().getByRole('link').innerText();
  const body = await drafts.first().locator('p').last().innerText();
  assert.ok(body.length >= 45);
  const board = await page.getByText(/直近の公開募集/).innerText();
  await page.getByRole('button', { name: 'Agentを停止' }).click();
  await page.getByText('停止しました', { exact: true }).waitFor();
  assert.doesNotMatch(
    await page.getByText(/直近の公開募集/).innerText(),
    /次の探索/,
  );
  const fresh = await browser.newContext({ locale: 'ja-JP' });
  await fresh.grantPermissions(['local-network-access'], { origin });
  const reopened = await fresh.newPage();
  await reopened.goto(url, { waitUntil: 'domcontentloaded' });
  await reopened.getByText('停止しました', { exact: true }).waitFor();
  assert.equal((await reopened.locator('article p').last().count()) > 0, true);
  assert.equal(await reopened.getByText(body, { exact: true }).count(), 1);
  started = false;
  keepEditing = false;
  await editing;
  sampleProcesses();
  await writeFile(join(dir, 'pids'), [...tracked].join('\n'));
  await writeFile(join(dir, 'stop'), '');
  const evidence = JSON.parse((await observation)[0]);
  assert.ok(evidence.samples >= 20 && evidence.sawWindows && edits >= 10);
  assert.equal(evidence.agentForegroundSamples, 0);
  assert.equal(evidence.agentWindowSamples, 0);
  console.log(
    JSON.stringify(
      {
        url,
        board,
        count,
        listing,
        title,
        characters: body.length,
        edits,
        evidence,
        stopped: true,
        freshContextRestored: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (page && !page.isClosed())
    console.error(
      'Noah:',
      await page
        .locator('output,[role=status]')
        .allTextContents()
        .catch(() => []),
    );
  throw error;
} finally {
  keepEditing = false;
  await editing;
  if (started && browser) {
    if (!page || page.isClosed()) {
      page = await browser.contexts()[0].newPage();
      await page
        .goto(url || origin + '/noah/coconala/agent', {
          waitUntil: 'domcontentloaded',
        })
        .catch(() => {});
    }
    const stop = page.getByRole('button', { name: 'Agentを停止' });
    if (await stop.count()) {
      await stop.click({ timeout: 5000 }).catch(() => {});
      await page
        .getByText('停止しました', { exact: true })
        .waitFor({ timeout: 6000 })
        .catch(() => {});
    }
  }
  await browser?.close();
  observer?.kill();
  await rm(dir, { recursive: true, force: true });
}
