// Acceptance records bind actual observations to one immutable release candidate.
// This validates the records; it does not execute or certify a customer journey.
export const launchStages = {
  basic: [],
  marketplace: ['basic'],
  paid: ['marketplace'],
  clients: ['basic'],
  complete: ['paid', 'clients'],
};
export const launchGateStages = {
  'public-entry': 'basic',
  'runtime-prerequisites': 'basic',
  'authenticated-first-use': 'basic',
  'csv-private-delivery': 'basic',
  'service-policy-and-support': 'basic',
  'recovery-and-update': 'basic',
  'external-author-publish': 'marketplace',
  'provider-auth-and-pc': 'marketplace',
  'payment-provider': 'paid',
  'paid-tool-entitlement': 'paid',
  'cross-client-identity': 'clients',
  'mini-device-acceptance': 'clients',
};
const candidateKeys = [
  'sourceCommit',
  'buildSha256',
  'deploymentId',
  'siteVersion',
];
const fail = (condition, message) => {
  if (!condition) throw new Error(message);
};
function candidateValid(candidate) {
  return (
    candidate &&
    /^[a-f0-9]{40}$/.test(candidate.sourceCommit) &&
    /^[a-f0-9]{64}$/.test(candidate.buildSha256) &&
    typeof candidate.deploymentId === 'string' &&
    candidate.deploymentId.length > 0 &&
    Number.isSafeInteger(candidate.siteVersion) &&
    candidate.siteVersion > 0
  );
}
export function validateSkyLaunchReport(
  report,
  { evidenceExists, readEvidence },
) {
  fail(
    report.schema === 'sky-service-launch/1' &&
      report.completeLaunchScope === 'web-os-app-paid-marketplace',
    'Sky complete-launch scope must include Web, OS and app clients.',
  );
  fail(
    report.stageDependencies &&
      Object.keys(report.stageDependencies).length ===
        Object.keys(launchStages).length &&
      Object.entries(launchStages).every(([stage, dependencies]) => {
        const actual = report.stageDependencies[stage];
        return (
          Object.hasOwn(report.stageDependencies, stage) &&
          Array.isArray(actual) &&
          actual.length === dependencies.length &&
          dependencies.every((dependency) => actual.includes(dependency))
        );
      }),
    'Sky stage dependencies must preserve complete -> paid + clients.',
  );
  fail(
    Array.isArray(report.gates) &&
      report.gates.length === Object.keys(launchGateStages).length,
    'Sky launch report must preserve all acceptance gates.',
  );
  const ids = new Set();
  for (const gate of report.gates) {
    fail(
      Object.hasOwn(launchGateStages, gate.id) &&
        !ids.has(gate.id) &&
        gate.stage === launchGateStages[gate.id] &&
        ['passed', 'in_progress', 'not_verified', 'blocked'].includes(
          gate.status,
        ) &&
        ['ROCK', 'JOINT', 'OWNER', 'EXTERNAL'].includes(gate.owner) &&
        typeof gate.acceptance === 'string' &&
        gate.acceptance.trim() &&
        typeof gate.environment === 'string' &&
        gate.environment.trim() &&
        Array.isArray(gate.evidence),
      `Invalid launch gate: ${gate.id}`,
    );
    ids.add(gate.id);
    for (const path of gate.evidence)
      fail(
        typeof path === 'string' && evidenceExists(path),
        `Missing launch evidence file: ${path}`,
      );
    if (gate.status !== 'passed') continue;
    fail(
      candidateValid(report.candidate),
      `Missing immutable candidate binding: ${gate.id}`,
    );
    fail(
      typeof gate.acceptanceEvidence === 'string' &&
        gate.evidence.includes(gate.acceptanceEvidence),
      `Missing actual acceptance record: ${gate.id}`,
    );
    const proof = readEvidence(gate.acceptanceEvidence);
    fail(
      proof &&
        proof.schema === 'sky-launch-acceptance/1' &&
        proof.gateId === gate.id &&
        proof.result === 'passed' &&
        proof.execution === 'actual' &&
        proof.environment === gate.environment &&
        typeof proof.observedAt === 'string' &&
        Number.isFinite(Date.parse(proof.observedAt)),
      `Not an actual accepted observation: ${gate.id}`,
    );
    fail(
      candidateValid(proof.candidate) &&
        candidateKeys.every(
          (key) => proof.candidate[key] === report.candidate[key],
        ),
      `Acceptance candidate mismatch: ${gate.id}`,
    );
  }
  const requiredStages = (stage, visited = new Set()) => {
    fail(Object.hasOwn(launchStages, stage), `Unknown launch stage: ${stage}`);
    fail(!visited.has(stage), 'Launch stage dependency cycle.');
    const next = new Set(visited).add(stage);
    return new Set([
      stage,
      ...launchStages[stage].flatMap((dependency) => [
        ...requiredStages(dependency, next),
      ]),
    ]);
  };
  const missing = (stage) => {
    const needed = requiredStages(stage);
    return report.gates.filter(
      (gate) => needed.has(gate.stage) && gate.status !== 'passed',
    );
  };
  fail(
    report.completeLaunchClaim === (missing('complete').length === 0),
    'Complete-launch claim disagrees with integrated acceptance.',
  );
  return { missing, stages: Object.keys(launchStages) };
}
