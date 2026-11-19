#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  initialize,
  openRuntime,
  parseAction,
  privateWrite,
  readJson,
  template,
} from './runtime.mjs';
import { digest } from '../../lib/noah-resale-provider.ts';

const help = `Noah Select Resale — terminal template (Node >=22.13)

node agent.mjs demo                         外部通信なしで全工程を試す
node agent.mjs init [--input agent.json]     自分用の保存先を初期化
node agent.mjs doctor | status              接続設定/候補/在庫/収支
node agent.mjs configure --input agent.json 予算と3担当の検索条件を保存
node agent.mjs run [--once]                 3担当で商品を探索
node agent.mjs watch [--interval 900]        定期探索（Ctrl-Cで終了）
node agent.mjs stop | resume                新規探索/発注/公開の停止/再開
node agent.mjs apply --input action.json    商品登録/採算/検品/原稿/売上を保存
node agent.mjs quote ITEM_ID                購入条件の見積を取得（発注なし）
node agent.mjs review purchase|publish ITEM_ID [--out review.json]
node agent.mjs execute --input review.json --confirm SHA256
node agent.mjs reconcile OP_ID [--reference ORDER_ID]

全コマンドで --workspace DIR を指定可能。既定: ~/.local/share/noah-resale
金額: USD=cent、JPY=円の整数。実売買には自分の公式API利用権/環境変数が必要。
watchは探索のみ。購入/公開は内容を固定したreviewと確認hashを通す。
`;
const output = (value) =>
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
async function demo(directory) {
  const root = directory
    ? resolve(directory)
    : mkdtempSync(join(tmpdir(), 'noah-resale-demo-'));
  const config = {
    ...template,
    mode: 'fixture',
    budget: 50000,
    perItemCap: 10000,
  };
  initialize(root, config);
  const rt = openRuntime(root, {});
  try {
    await rt.configure(config);
    await rt.run('scout');
    const i = (await rt.get()).resale.items[0];
    await rt.run('assess', {
      itemId: i.id,
      resalePrice: 3000,
      costs: 600,
      floorProfit: 500,
      evidence: 'DEMO: synthetic comparison, not market evidence',
    });
    await rt.run('quote', { itemId: i.id, confirm: true });
    let review = await rt.makeReview('purchase', i.id);
    await rt.execute(review, await digest(review));
    await rt.run('receive', {
      itemId: i.id,
      confirm: true,
      condition: 'DEMO: synthetic used item',
      notes: 'DEMO: no actual item, inspection or shipping',
    });
    await rt.run('draft', {
      itemId: i.id,
      price: 3000,
      conditionCode: 'USED_GOOD',
      categoryId: '1',
      images: ['https://example.com/demo/photo.jpg'],
    });
    review = await rt.makeReview('publish', i.id);
    await rt.execute(review, await digest(review));
    await rt.run('settlement', {
      itemId: i.id,
      reference: `demo-sale-${i.id}`,
      gross: 3000,
      fees: 300,
      shipping: 200,
      other: 100,
      refunds: 0,
    });
    output({
      notice: 'DEMO ONLY — no real products, orders, listings or profit',
      ...(await rt.view()),
    });
  } finally {
    rt.close();
  }
}
async function main() {
  const { values: v, positionals: p } = parseArgs({
    allowPositionals: true,
    options: {
      workspace: { type: 'string' },
      input: { type: 'string' },
      out: { type: 'string' },
      confirm: { type: 'string' },
      reference: { type: 'string' },
      interval: { type: 'string' },
      cycles: { type: 'string' },
      once: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  const command = p[0] || 'help';
  if (v.help || command === 'help') {
    process.stdout.write(help);
    return;
  }
  if (command === 'demo') {
    await demo(v.workspace);
    return;
  }
  const commands = [
    'init',
    'status',
    'doctor',
    'configure',
    'run',
    'watch',
    'stop',
    'resume',
    'apply',
    'quote',
    'review',
    'execute',
    'reconcile',
  ];
  if (!commands.includes(command))
    throw Error('不明なコマンドです。helpを確認してください。');
  const workspace = resolve(
    v.workspace || join(homedir(), '.local', 'share', 'noah-resale'),
  );
  const input = () => {
    if (!v.input) throw Error('--input JSONファイルを指定してください。');
    return readJson(v.input);
  };
  let config;
  if (command === 'init') {
    config = v.input ? input() : structuredClone(template);
    if (config.mode === 'fixture')
      throw Error('fixtureの作成はdemoコマンドを使ってください。');
    initialize(workspace, config);
  }
  const rt = openRuntime(workspace);
  try {
    if (command === 'init') await rt.configure(config);
    if (command === 'configure') await rt.configure(input());
    if (command === 'apply') {
      const { action, ...fields } = parseAction(input());
      await rt.run(action, fields);
    }
    if (command === 'stop' || command === 'resume')
      await rt.run(command === 'stop' ? 'pause' : 'resume');
    if (command === 'quote') {
      if (!p[1]) throw Error('商品IDを指定してください。');
      await rt.run('quote', { itemId: p[1], confirm: true });
    }
    if (command === 'reconcile') {
      if (!p[1]) throw Error('操作IDを指定してください。');
      await rt.run('reconcile', {
        operationId: p[1],
        reference: v.reference || '',
      });
    }
    if (command === 'execute') {
      const review = input();
      await rt.execute(review, v.confirm);
      const state = await rt.view();
      output(state);
      const op = state.operations.find((o) => o.id === review.operationId);
      if (op?.state !== 'done' || op?.resolution === 'not_dispatched')
        process.exitCode = 2;
      return;
    }
    if (command === 'review') {
      const review = await rt.makeReview(p[1], p[2]);
      mkdirSync(join(workspace, 'approvals'), { recursive: true, mode: 0o700 });
      const path = resolve(
        v.out || join(workspace, 'approvals', `${review.operationId}.json`),
      );
      privateWrite(path, review);
      output({ reviewFile: path, sha256: await digest(review), review });
      return;
    }
    if (command === 'run') {
      const j = await rt.get();
      if (j.resale.paused)
        throw Error('停止中です。resumeで再開してください。');
      await rt.run('scout');
      const state = await rt.view();
      output(state);
      if (state.scan?.results.some((x) => x.error)) process.exitCode = 2;
      return;
    }
    if (command === 'watch') {
      const interval = Number(v.interval ?? rt.config.intervalSeconds),
        cycles = v.cycles === undefined ? Infinity : Number(v.cycles);
      if (
        !Number.isInteger(interval) ||
        interval < 60 ||
        interval > 86400 ||
        (cycles !== Infinity &&
          (!Number.isInteger(cycles) || cycles < 1 || cycles > 1000))
      )
        throw Error('intervalは60〜86400秒、cyclesは1〜1000回です。');
      const token = randomUUID(),
        signal = new AbortController();
      let count = 0;
      const stop = () => signal.abort();
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      try {
        while (!signal.signal.aborted && count < cycles) {
          if (!rt.claim(token, interval * 1000 + 120000))
            throw Error(
              '同じ保存先のwatchが稼働中です。停止後のlease解放/期限切れを待ってください。',
            );
          const j = await rt.get();
          if (j.resale.paused) {
            output({ mode: rt.config.mode, status: 'stopped' });
            break;
          }
          if (!rt.config || !(await rt.view()).ready.search)
            throw Error('検索APIが未接続です。doctorで確認してください。');
          try {
            await rt.run('scout');
            const result = (await rt.get()).resale.scan;
            output({ mode: rt.config.mode, scan: result });
            if (result.results.some((x) => x.error)) process.exitCode = 2;
          } catch (error) {
            output({ mode: rt.config.mode, error: error.message });
            process.exitCode = 2;
          }
          count++;
          if (count < cycles && !signal.signal.aborted)
            try {
              await delay(interval * 1000, undefined, {
                signal: signal.signal,
              });
            } catch {
              break;
            }
        }
      } finally {
        rt.release(token);
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
      }
      return;
    }
    if (command === 'doctor') {
      const view = await rt.view();
      output({
        mode: view.mode,
        workspace,
        ready: view.ready,
        paused: view.paused,
        budget: view.totals.remaining,
        currency: view.currency,
        requiresWebServer: false,
        requiresBrowser: false,
        providerAcceptance: 'not_inferred_from_credentials',
      });
      return;
    }
    output(await rt.view());
  } finally {
    rt.close();
  }
}
try {
  await main();
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      error:
        error instanceof SyntaxError
          ? 'JSON形式を確認してください。'
          : error.message,
    }) + '\n',
  );
  process.exitCode = 1;
}
