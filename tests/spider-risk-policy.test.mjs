import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  createSpiderRiskPlan,
  MAX_RISK_CONTENT_CHARACTERS,
  MAX_RISK_PATHS,
} from '../toolkits/spider-guard/risk-policy.mjs';

void test('env and key files trigger a critical metadata-only security plan', () => {
  const secretValue = 'must-never-appear-in-the-plan';
  const plan = createSpiderRiskPlan([
    { path: '.env.production', content: `OPENAI_API_KEY=${secretValue}` },
    { path: 'certs/release-private.key', content: secretValue },
  ]);
  assert.equal(plan.profile, 'critical');
  assert(plan.categories.includes('secrets'));
  assert(plan.recommendedChecks.includes('repository-secret-scan'));
  assert(!JSON.stringify(plan).includes(secretValue));
  assert(plan.triggers.every((trigger) => !('content' in trigger)));
});

void test('important code keywords select corresponding defensive checks without claiming a vulnerability', () => {
  const plan = createSpiderRiskPlan([
    {
      path: 'app/api/session/route.ts',
      content: 'const token = process.env.SESSION_TOKEN; return fetch(webhook);',
    },
    {
      path: 'db/schema.ts',
      content: "export const transaction = sqliteTable('transaction', {});",
    },
    { path: 'lib/runner.ts', content: 'child_process.exec(command);' },
  ]);
  assert.equal(plan.profile, 'deep');
  assert.deepEqual(
    plan.categories,
    ['data', 'execution', 'finance', 'identity', 'network', 'secrets'],
  );
  assert(plan.limitations.some((item) => item.includes('証明ではありません')));
});

void test('ordinary documentation stays standard and unsafe report paths are redacted', () => {
  const standard = createSpiderRiskPlan([
    { path: 'docs/guide.md', content: 'A public usage guide.' },
  ]);
  assert.equal(standard.profile, 'standard');
  assert.deepEqual(standard.recommendedChecks, []);
  const redacted = createSpiderRiskPlan([
    { path: '顧客@example.test.md', content: 'password' },
  ]);
  assert.equal(redacted.triggers[0].path, '[redacted-path]');
  assert.equal(redacted.coverageLimited, true);
});

void test('risk inputs are bounded and the changed-file CLI never prints file content', () => {
  assert.throws(
    () => createSpiderRiskPlan(
      Array.from({ length: MAX_RISK_PATHS + 1 }, (_, index) => ({
        path: `file-${index}.ts`, content: '',
      })),
    ),
    /SPIDER_RISK_INPUT_INVALID/,
  );
  const limited = createSpiderRiskPlan([
    { path: 'lib/auth.ts', content: 'x'.repeat(MAX_RISK_CONTENT_CHARACTERS + 1) },
  ]);
  assert.equal(limited.coverageLimited, true);

  const root = resolve(import.meta.dirname, '..');
  const result = spawnSync(process.execPath, ['scripts/spider-risk-plan.mjs', '--changed'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.schema, 'rockstaros-spider-risk-plan/1');
  assert(!JSON.stringify(plan).includes('must-never-appear-in-the-plan'));
});
