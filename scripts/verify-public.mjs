import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isUnlocked, root } from './private-files.mjs';

// `npm run verify:public` — the checks that work without the git-crypt key.
// Public CI has no key, so steps and test files that read encrypted files are
// skipped here by name. Key holders run the full `npm run verify`.

// Verify steps that read encrypted ledgers, baselines, designs or evidence.
export const PRIVATE_STEPS = new Set([
  'npm run project:check', // project.md
  'npm run release:check', // owner intent and evidence
  'npm run baseline:check', // product baseline
  'npm run avocado:r5:check', // R5 design package
  'npm run sky:launch:check', // Sky launch ledger
  'npm run device-support:check', // baseline device policy
  'npm run mission:check', // AMC definitions
  'npm run work:check', // workspaces
  'npm run bot:check', // AMC project bots
]);

// Test files whose tests read encrypted files throughout.
export const PRIVATE_TEST_FILES = new Set([
  'tests/amc-agent-preflight.test.mjs',
  'tests/amc-agent.test.mjs',
  'tests/amc-goal-cli.test.mjs',
  'tests/amc-sky-directives.test.mjs',
  'tests/amc-sky-launch.test.mjs',
  'tests/amc-snapshot.test.mjs',
  'tests/avocado-r5-docs.test.mjs',
  'tests/mission-control.test.mjs',
  'tests/os-contracts.test.mjs',
  'tests/product-baseline.test.mjs',
  'tests/project-bots.test.mjs',
  'tests/release-readiness.test.mjs',
  'tests/sky-launch-audit.test.mjs',
  'tests/workspaces.test.mjs',
]);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  return result.status ?? 1;
}

function main() {
  if (isUnlocked()) {
    console.log('The encrypted files are readable here: run `npm run verify` for the full set of checks.');
  }
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const steps = pkg.scripts.verify.split('&&').map((step) => step.trim());
  for (const step of PRIVATE_STEPS)
    if (!steps.includes(step)) throw new Error(`verify-public: unknown private step ${step}`);
  const testFiles = readdirSync(resolve(root, 'tests'))
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => `tests/${name}`)
    .sort();
  for (const file of PRIVATE_TEST_FILES)
    if (!testFiles.includes(file)) throw new Error(`verify-public: unknown private test file ${file}`);

  const skipped = [];
  for (const step of steps) {
    if (PRIVATE_STEPS.has(step)) {
      skipped.push(step);
      continue;
    }
    console.log(`\n=== ${step}`);
    let status;
    if (step === 'npm test') {
      status = run('node', ['scripts/generate-private-modules.mjs']);
      if (status === 0)
        status = run(process.execPath, [
          '--experimental-strip-types',
          '--test',
          ...testFiles.filter((file) => !PRIVATE_TEST_FILES.has(file)),
        ]);
    } else {
      const [command, ...args] = step.split(/\s+/);
      status = run(command, args);
    }
    if (status !== 0) {
      console.error(`\nverify:public failed at: ${step}`);
      process.exit(status);
    }
  }
  console.log(`\nverify:public passed. Skipped because they need the git-crypt key:`);
  for (const step of skipped) console.log(`  - ${step}`);
  console.log(`  - ${PRIVATE_TEST_FILES.size} test files (see scripts/verify-public.mjs)`);
}

main();
