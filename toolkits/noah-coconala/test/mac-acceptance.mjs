import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { execFileSync, spawn } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  mkdir,
  rename,
} from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { createConnector } from '../../sky-mcp-connector/server.mjs';
import { stageFile } from '../jobs.mjs';

assert.equal(process.platform, 'darwin');
const root = await mkdtemp(join(tmpdir(), 'noah-coconala-ui-'));
const origin = 'http://localhost:3000';
const here = dirname(fileURLToPath(import.meta.url));
const initial = { reply: [], room_reply: [], apply: [], deliver: [] };
const registryPath = join(root, 'registry.json');
const lastEnv = process.env.NOAH_TEST_DIRECTORY;
let observer,
  browser,
  connector,
  watchResult,
  editing,
  edits = 0,
  working = true;
try {
  process.env.NOAH_TEST_DIRECTORY = root;
  await writeFile(join(root, 'site.json'), JSON.stringify(initial));
  await writeFile(
    registryPath,
    JSON.stringify({
      schema: 'rockstaros-mcp-registry/1',
      servers: [
        {
          id: 'noah-coconala',
          name: 'ココナラ',
          description: 'Mac acceptance only',
          transport: 'stdio',
          cwd: here,
          command: process.execPath,
          args: ['fixture-worker.mjs'],
          env: ['NOAH_TEST_DIRECTORY', 'HOME'],
          required: true,
        },
      ],
    }),
  );
  await mkdir(join(root, 'discovery'));
  connector = await createConnector({
    registryPath,
    port: 38483,
    allowedOrigins: new Set([origin]),
    localToolDirectory: join(root, 'discovery'),
  });
  const artifactPath = join(root, '成果物.txt');
  await writeFile(artifactPath, '納品ファイルの内容');
  const artifact = await stageFile(root, artifactPath);
  execFileSync('swiftc', [
    join(here, 'mac-observer.swift'),
    '-o',
    join(root, 'observe'),
  ]);
  await writeFile(join(root, 'agent-pids'), '');
  observer = spawn(join(root, 'observe'), [
    join(root, 'stop'),
    join(root, 'agent-pids'),
  ]);
  const lines = createInterface({ input: observer.stdout });
  const ready = await once(lines, 'line');
  assert.equal(ready[0], 'ready');
  watchResult = once(lines, 'line');
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    chromiumSandbox: true,
  });
  const owner = await browser.newContext({ locale: 'ja-JP' });
  let page = await owner.newPage();
  async function openNoah() {
    await page.goto(origin + '/noah/coconala');
    await page.getByRole('button', { name: 'このMacに接続' }).click();
    await page
      .getByText('専用ブラウザの実行器に接続しました。')
      .waitFor({ timeout: 12000 });
  }
  await openNoah();
  const file = join(root, 'parallel-edit.txt');
  editing = (async () => {
    while (working) {
      const content = '作業メモ ' + ++edits;
      await writeFile(file + '.tmp', content);
      await rename(file + '.tmp', file);
      assert.equal(await readFile(file, 'utf8'), content);
      await pause(80);
    }
  })();
  const inputs = [
    {
      action: 'reply',
      target: '101',
      label: 'メッセージに返信',
      message: 'お問い合わせに返信します',
    },
    {
      action: 'room_reply',
      target: '304',
      label: 'トークルームに返信',
      message: '制作を進めています',
    },
    {
      action: 'apply',
      target: '202',
      label: '応募',
      message: '募集内容に合わせて制作します',
    },
    {
      action: 'deliver',
      target: '303',
      label: '正式な納品',
      message: '完成したファイルを納品します',
    },
  ];
  for (const row of inputs) {
    const before = edits;
    await page.getByRole('combobox').selectOption(row.action);
    await page.locator('[name=target]').fill(row.target);
    await page.locator('[name=message]').fill(row.message);
    if (row.action === 'apply') {
      await page.locator('[name=price]').fill('15000');
      await page.locator('[name=due]').fill('2027-02-15');
    }
    if (row.action === 'deliver') {
      await page.locator('[name=filename]').fill(artifact.filename);
      await page.locator('[name=sha256]').fill(artifact.sha256);
    }
    await page.getByRole('button', { name: '送信内容を確認' }).click();
    const sent = page.waitForRequest(
      (req) =>
        req.url().endsWith('/noah-coconala/execute') && req.method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'この内容で' + row.label + 'する' })
      .click();
    await sent;
    if (row.action === 'deliver') {
      await page.close();
      page = await owner.newPage();
      await openNoah();
      for (let i = 0; i < 8; i++) {
        await page
          .getByRole('button', { name: 'この操作の結果を確認' })
          .click();
        try {
          await page
            .getByText('ココナラ側で確認済み', { exact: true })
            .waitFor({ timeout: 1500 });
          break;
        } catch {
          await pause(200);
        }
      }
    }
    await page
      .getByText('ココナラ側で確認済み', { exact: true })
      .waitFor({ timeout: 15000 });
    assert.ok(edits > before);
  }
  const saved = JSON.parse(await readFile(join(root, 'site.json'), 'utf8'));
  for (const row of inputs) {
    assert.equal(saved[row.action].length, 1);
    assert.equal(saved[row.action][0].message, row.message);
  }
  assert.equal(saved.deliver[0].bytes, '納品ファイルの内容');
  assert.equal(saved.apply[0].price, '15000');
  assert.equal(saved.apply[0].due, '2027-02-15');
} finally {
  working = false;
  if (editing) await editing;
  if (browser) await browser.close();
  if (connector) {
    connector.hub.close();
    connector.server.closeAllConnections();
    await new Promise((done) => connector.server.close(done));
  }
  await writeFile(join(root, 'stop'), '');
  if (observer && watchResult) {
    const measured = JSON.parse((await watchResult)[0]);
    console.log(JSON.stringify({ ...measured, parallelFileSaves: edits }));
    assert.ok(measured.sawWindows && measured.samples > 10);
    assert.equal(measured.browserProcesses, 4);
    assert.equal(measured.agentForegroundSamples, 0);
    assert.equal(measured.agentWindowSamples, 0);
  }
  if (lastEnv === undefined) delete process.env.NOAH_TEST_DIRECTORY;
  else process.env.NOAH_TEST_DIRECTORY = lastEnv;
  await rm(root, { recursive: true, force: true });
}
