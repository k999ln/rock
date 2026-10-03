import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../.github/workflows/spider-codeql.yml', import.meta.url), 'utf8');

void test('SPIDER scans both requested languages on branch pushes, PRs, daily and manual runs', () => {
  assert.match(workflow, /^name: SPIDER CodeQL security$/m);
  assert.match(workflow, /^  push:\n    branches: \[main, codex\/spider-guard\]$/m);
  assert.match(workflow, /^  pull_request:\s*$/m);
  assert.match(workflow, /^  workflow_dispatch:\s*$/m);
  assert.match(workflow, /^    - cron: '23 3 \* \* \*'$/m);
  assert.match(workflow, /^        language: \[javascript-typescript, python\]$/m);
  assert.match(workflow, /^      fail-fast: false$/m);
  assert.doesNotMatch(workflow, /pull_request_target|paths-ignore|continue-on-error/);
});

void test('scan job has minimal permissions and only pinned official actions', () => {
  assert.match(workflow, /^permissions: \{\}$/m);
  const permissions = workflow.match(/^    permissions:\n((?:      [\w-]+: [\w]+\n)+)/m)?.[1];
  assert.equal(permissions, '      contents: read\n      security-events: write\n');
  const actions = [...workflow.matchAll(/^\s+uses: ([^\s#]+)/gm)].map(match => match[1]);
  assert.deepEqual(actions, [
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2',
    'github/codeql-action/analyze@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2',
  ]);
  assert.match(workflow, /^          persist-credentials: false$/m);
  assert.doesNotMatch(workflow, /^\s+(?:ref|token):|secrets\./m);
});

void test('analysis has no project execution and waits for actual result processing', () => {
  assert.match(workflow, /^          build-mode: none$/m);
  assert.match(workflow, /^          queries: security-extended$/m);
  assert.match(workflow, /^          upload: always$/m);
  assert.match(workflow, /^          upload-database: false$/m);
  assert.match(workflow, /^          wait-for-processing: true$/m);
  assert.match(workflow, /^          category: \/spider\/language:\$\{\{ matrix.language \}\}$/m);
  assert.equal([...workflow.matchAll(/^\s+run:/gm)].length,1);
  assert.doesNotMatch(workflow, /\b(?:npm|npx|yarn|pnpm|pip|pip3|make|gradle|autobuild)\b/);
  assert.match(workflow, /^        if: always\(\)$/m);
});

void test('summary distinguishes completed analysis from failed, skipped or cancelled runs', () => {
  const script = workflow.split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /,'')).join('\n');
  const directory = mkdtempSync(join(tmpdir(),'spider-codeql-summary-'));
  try {
    for (const [initialize,analyze] of [['success','success'],['failure','skipped'],['success','failure'],['success','cancelled']]) {
      const summary = join(directory,`${initialize}-${analyze}.md`);
      const result = spawnSync('bash',['-e','-c',script], {
        env: {...process.env,GITHUB_STEP_SUMMARY:summary,SPIDER_LANGUAGE:'python',SPIDER_INITIALIZE_OUTCOME:initialize,SPIDER_ANALYZE_OUTCOME:analyze},
        encoding:'utf8',timeout:5000,
      });
      assert.equal(result.status,0,result.stderr);
      const text = readFileSync(summary,'utf8');
      assert(text.includes(`初期化: \`${initialize}\` / 解析・結果反映: \`${analyze}\``));
      if (initialize === 'success' && analyze === 'success') assert(text.includes('結果反映を完了しました'));
      else { assert(text.includes('完了していません')); assert(!text.includes('結果反映を完了しました')); }
      assert(text.includes('安全の保証を意味しません'));
      assert(text.includes('別途GitHubのルール設定が必要'));
    }
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
