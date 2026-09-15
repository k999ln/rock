#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPOSITORY = 'https://github.com/MrFadiAi/Polymarket-bot';
const COMMIT = '3a04fc842bc3112a11b872263bb55e6712096f9a';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const repo = resolve(argument('--repo') ?? '');
const input = resolve(argument('--input') ?? '');
if (!argument('--repo') || !argument('--input'))
  fail('Usage: node run-backtest.mjs --repo <pinned-repo> --input <snapshots.jsonl>');
if (!existsSync(resolve(repo, '.git')) || !existsSync(input))
  fail('Repository or input file was not found.');

const git = (args) =>
  spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 10_000 });
const head = git(['rev-parse', 'HEAD']);
if (head.status !== 0 || head.stdout.trim() !== COMMIT)
  fail(`Refusing unreviewed source. Required commit: ${COMMIT}`);
const status = git(['status', '--porcelain']);
if (status.status !== 0 || status.stdout.trim())
  fail('Refusing a modified Polymarket-bot worktree.');

const runner = resolve(repo, 'node_modules', '.bin', 'tsx');
if (!existsSync(runner)) fail('Run npm ci in the pinned repository first.');
const inputBytes = readFileSync(input);
const environment = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  LANG: process.env.LANG ?? 'C',
  NO_COLOR: '1',
  DRY_RUN: 'true',
};
for (const key of [
  'BACKTEST_FEE_BPS',
  'BACKTEST_GAS_USD',
  'BACKTEST_MAX_SIZE',
  'BACKTEST_MIN_NET',
]) {
  const value = process.env[key];
  if (value !== undefined) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 1_000_000)
      fail(`Invalid ${key}.`);
    environment[key] = String(number);
  }
}
const execution = spawnSync(runner, ['src/backtest/runner.ts', input], {
  cwd: repo,
  encoding: 'utf8',
  env: environment,
  timeout: 120_000,
  maxBuffer: 1_000_000,
});
if (execution.status !== 0) fail(execution.stderr || 'Backtest failed.');

let metrics;
try {
  metrics = JSON.parse(execution.stdout);
} catch {
  fail('Backtest did not return one JSON report.');
}

process.stdout.write(
  `${JSON.stringify(
    {
      schema: 'rockstaros-polymarket-bot-backtest/1',
      mode: 'backtest',
      source: { repository: REPOSITORY, commit: COMMIT, cleanTree: true },
      input: {
        sha256: createHash('sha256').update(inputBytes).digest('hex'),
      },
      policy: { countsAsFundRevenue: false, liveExecutionEnabled: false },
      metrics: {
        snapshots: metrics.snapshots,
        trades: metrics.trades,
        wins: metrics.wins,
        losses: metrics.losses,
        winRate: metrics.winRate,
        totalPnl: metrics.totalPnl,
        profitFactor: Number.isFinite(metrics.profitFactor)
          ? metrics.profitFactor
          : null,
        maxDrawdown: metrics.maxDrawdown,
      },
    },
    null,
    2,
  )}\n`,
);
