import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { root, validateBaseline } from './check-product-baseline.mjs';
import { canonicalRefs, collectCheckShas, refsUnchanged, selectPull, summarizeChecks } from './prompt-context-model.mjs';

const exec = promisify(execFile);
async function run(command, args) {
  const { stdout } = await exec(command, args, { cwd: root, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim();
}
async function api(path, paginate = false) {
  const value = JSON.parse(await run('gh', ['api', path, ...(paginate ? ['--paginate', '--slurp'] : [])]));
  return value;
}

try {
  const data = validateBaseline(JSON.parse(readFileSync(resolve(root, 'data/product-baseline.json'), 'utf8')));
  const [head, branch, changes] = await Promise.all([
    run('git', ['rev-parse', 'HEAD']),
    run('git', ['branch', '--show-current']),
    run('git', ['status', '--porcelain']),
  ]);
  const result = {
    generatedAt: new Date().toISOString(), repository: data.repository,
    local: { head, branch, dirty: changes.length > 0 },
    baseline: { version: data.version, path: data.authority, sha256: createHash('sha256').update(readFileSync(resolve(root, data.authority))).digest('hex') },
    liveMetadataVerified: false, sourceReviewComplete: false,
    requiredReview: ['Read source and instructions at each selected SHA', 'Compare RQ01-RQ18, the Sky/Chat/Wallet/Polymarket base-app boundary, RockstarOS 1.0, OS acceptance and installation release, game developer wallet and zero ATM platform fee, actual product usage and user friction', 'Separate host/fixture/guest/provider/device evidence'],
  };
  if (process.argv.includes('--offline')) {
    console.log(JSON.stringify({ ...result, recordedAuditOnly: data.auditInputs }, null, 2));
  } else {
    const prefix = `repos/${data.repository}`;
    const [main, branchPages, pullPages, closed] = await Promise.all([
      api(`${prefix}/commits/main`),
      api(`${prefix}/branches?per_page=100`, true),
      api(`${prefix}/pulls?state=open&per_page=100`, true),
      api(`${prefix}/pulls?state=closed&sort=updated&direction=desc&per_page=30`),
    ]);
    const open = pullPages.flat().map(selectPull);
    const branches = branchPages.flat().map((b) => ({ name: b.name, sha: b.commit.sha }));
    const initialRefs = canonicalRefs({ main: main.sha, branches, openPullRequests: open });
    const shas = collectCheckShas(data.repository, main.sha, branches, open);
    const checks = await Promise.all(shas.map(async (sha) => {
      const pages = await api(`${prefix}/commits/${sha}/check-runs?per_page=100`, true);
      const runs = pages.flatMap((p) => p.check_runs).map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion, url: c.html_url }));
      return { sha, ...summarizeChecks(runs), checks: runs };
    }));
    const [finalMain, finalBranchPages, finalPullPages] = await Promise.all([
      api(`${prefix}/commits/main`),
      api(`${prefix}/branches?per_page=100`, true),
      api(`${prefix}/pulls?state=open&per_page=100`, true),
    ]);
    const finalRefs = {
      main: finalMain.sha,
      branches: finalBranchPages.flat().map((b) => ({ name: b.name, sha: b.commit.sha })),
      openPullRequests: finalPullPages.flat().map(selectPull),
    };
    if (!refsUnchanged(initialRefs, finalRefs)) {
      throw new Error('GitHub refs changed during collection');
    }
    console.log(JSON.stringify({ ...result, liveMetadataVerified: true, ...initialRefs, recentClosedPullRequests: closed.map(selectPull), checks, recordedAuditOnly: data.auditInputs, note: 'Metadata only. Checks cover main, every repository branch and same-repository open PR heads. NO_CHECKS is not a successful test result. Read selected source, tests and evidence before writing the prompt. Fork PRs and older closed PRs require separate investigation. Ref rechecks detect observed changes, not an atomic GitHub snapshot.' }, null, 2));
  }
} catch {
  console.error('最新コンテキストを確定できません。GitHub接続・gh認証・ref変更・ベース検査を確認してください。必要なら同等の読み取りで再取得してください。--offline は過去参照のみで、最新確認の代わりにはなりません。');
  process.exitCode = 2;
}
