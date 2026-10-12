import { auditSkyLaunch } from './lib/sky-launch-audit.mjs';

// Historical acceptance remains in the report. A release-stage check additionally
// requires actual observations bound to one immutable candidate.
export const launchStages = {
  basic: [],
  marketplace: ['basic'],
  paid: ['marketplace'],
  clients: ['basic'],
  focused: ['basic'],
  complete: ['paid', 'clients', 'focused'],
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
  'focused-csv-payment': 'focused',
  'focused-cloud-ai': 'focused',
  'focused-customer-journey': 'focused',
  'focused-tool-inventory': 'focused',
  'focused-apple-pay': 'focused',
};
const candidateKeys = ['sourceCommit', 'buildSha256', 'deploymentId', 'siteVersion'];
const fail = (condition, message) => {
  if (!condition) throw new Error(message);
};
function candidateValid(candidate) {
  return candidate &&
    typeof candidate.sourceCommit === 'string' && /^[a-f0-9]{40}$/.test(candidate.sourceCommit) &&
    typeof candidate.buildSha256 === 'string' && /^[a-f0-9]{64}$/.test(candidate.buildSha256) &&
    typeof candidate.deploymentId === 'string' && candidate.deploymentId.trim().length > 0 &&
    Number.isSafeInteger(candidate.siteVersion) && candidate.siteVersion > 0;
}

export function validateSkyLaunchReport(report, { evidenceExists, readEvidence }) {
  // Keep canonical focused/standalone scope and its existing historical evidence
  // audit. Do not replace this with the Site branch's older twelve-gate report.
  const historical = auditSkyLaunch(report, evidenceExists);
  const reportStages = Object.keys(report.stageDependencies);
  fail((reportStages.length === 5 || reportStages.length === 6) &&
    reportStages.every((stage) => Object.hasOwn(launchStages, stage)),
    'Sky stage dependencies must preserve focused, paid and client acceptance.');
  for (const [stage, dependencies] of Object.entries(launchStages)) {
    if (stage === 'complete' && !Object.hasOwn(report.stageDependencies, stage)) continue;
    const actual = report.stageDependencies[stage];
    fail(Object.hasOwn(report.stageDependencies, stage) && Array.isArray(actual) &&
      actual.length === dependencies.length && dependencies.every((dependency) => actual.includes(dependency)),
    `Sky stage dependencies must preserve ${stage} acceptance.`);
  }
  fail(report.gates.length === Object.keys(launchGateStages).length,
    'Sky launch report must preserve all seventeen acceptance gates.');
  fail(report.candidate == null || candidateValid(report.candidate),
    'Missing immutable candidate binding.');
  const accepted = new Set();
  const historicalOnly = [];
  for (const gate of report.gates) {
    fail(Object.hasOwn(launchGateStages, gate.id) && gate.stage === launchGateStages[gate.id],
      `Invalid launch gate: ${gate.id}`);
    fail(typeof gate.acceptance === 'string' && gate.acceptance.trim() &&
      typeof gate.environment === 'string' && gate.environment.trim(),
    `Invalid launch gate: ${gate.id}`);
    if (gate.status !== 'passed') continue;
    if (gate.acceptanceEvidence === undefined) {
      historicalOnly.push(gate);
      continue;
    }
    fail(candidateValid(report.candidate), `Missing immutable candidate binding: ${gate.id}`);
    fail(typeof gate.acceptanceEvidence === 'string' && gate.evidence.includes(gate.acceptanceEvidence),
      `Missing actual acceptance record: ${gate.id}`);
    const proof = readEvidence(gate.acceptanceEvidence);
    fail(proof && proof.schema === 'sky-launch-acceptance/1' && proof.gateId === gate.id &&
      proof.result === 'passed' && proof.execution === 'actual' && proof.environment === gate.environment &&
      typeof proof.observedAt === 'string' && Number.isFinite(Date.parse(proof.observedAt)),
    `Not an actual accepted observation: ${gate.id}`);
    fail(candidateValid(proof.candidate) && candidateKeys.every((key) => proof.candidate[key] === report.candidate[key]),
      `Acceptance candidate mismatch: ${gate.id}`);
    accepted.add(gate.id);
  }
  const requiredStages = (stage) => {
    fail(Object.hasOwn(launchStages, stage), `Unknown launch stage: ${stage}`);
    return new Set([stage, ...launchStages[stage].flatMap((dependency) => [...requiredStages(dependency)])]);
  };
  const missing = (stage) => {
    const needed = requiredStages(stage);
    return report.gates.filter((gate) => needed.has(gate.stage) && !accepted.has(gate.id));
  };
  if (report.integratedLaunchClaim !== undefined)
    fail(report.integratedLaunchClaim === (missing('complete').length === 0),
      'Integrated-launch claim disagrees with candidate acceptance.');
  return { stages: Object.keys(launchStages), missing, historical, historicalOnly };
}
