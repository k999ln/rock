import { spawnSync } from 'node:child_process';

const suites = [
  ['protected signer', 'test_release_signing.py', 29],
  ['owner-manual entry', 'test_release_signing_owner.py', 7],
  ['candidate preparation', 'test_prepare_release_candidate.py', 15],
  ['owner legal approval', 'test_owner_legal_approval.py', 11],
];

let total = 0;
for (const [label, pattern, expected] of suites) {
  const result = spawnSync(
    'python3',
    ['-m', 'unittest', 'discover', '-s', 'tests', '-p', pattern, '-v'],
    {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      encoding: 'utf8',
    },
  );
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label}: signing regression suite failed with exit ${result.status}`);
  }
  const match = `${result.stdout || ''}\n${result.stderr || ''}`.match(/Ran (\d+) tests?/);
  if (!match || Number(match[1]) !== expected) {
    throw new Error(`${label}: expected ${expected} tests, observed ${match?.[1] ?? 'unknown'}`);
  }
  total += expected;
}

console.log(
  `Release signing mechanics: ${total} public-fixture tests passed; production key, owner approval and final acceptance remain separate.`,
);
