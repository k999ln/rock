import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { catalog } from '../lib/catalog.ts';

// Check coverage and referential integrity, not runtime/Provider acceptance.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const report = read('data/ecosystem-research.json');
const baseline = read('data/product-baseline.json');
const index = read('data/design-document-index.json');
const mission = read('data/mission-control.json');
const text = readFileSync(resolve(root, report.authority), 'utf8');
assert.equal(report.schema, 'rock-ecosystem-research/1');
assert.match(report.sourceMainSha, /^[a-f0-9]{40}$/u);
assert.equal(report.runtimeChanged, false);
assert.equal(report.commercialPolicyChanged, false);
assert.deepEqual(report.externalActionsPerformed, []);

function identities(rows, label) {
  assert.ok(Array.isArray(rows) && rows.length > 0, `${label}: missing rows`);
  const ids = rows.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, `${label}: duplicate ID`);
  return new Set(ids);
}
function covers(actual, expected, label) {
  const compare = (a, b) => a.localeCompare(b);
  assert.deepEqual([...actual].sort(compare), [...expected].sort(compare), `${label}: coverage drift`);
}
function refs(values, ids, label) {
  assert.ok(Array.isArray(values), `${label}: refs must be arrays`);
  for (const value of values) assert.ok(ids.has(value), `${label}: unknown ${value}`);
}
function fields(row, names, label) {
  for (const name of names) assert.ok(typeof row[name] === 'string' && row[name].trim(), `${label}: missing ${name}`);
}

const systems = identities(report.systems, 'systems');
const data = identities(report.dataClasses, 'data');
const sources = identities(report.sources, 'sources');
const transactions = identities(report.transactions, 'transactions');
identities(report.flows, 'flows');
identities(report.partners, 'partners');
identities(report.gaps, 'gaps');
identities(report.improvements, 'improvements');
identities(report.journeys, 'journeys');
refs(report.scope.namedProducts, systems, 'namedProducts');
assert.equal(report.scope.namedProducts.length, 7);

for (const x of report.systems) {
  fields(x, ['name', 'role', 'authority', 'storage', 'compensation', 'implemented', 'gap', 'acceptance'], x.id);
  assert.ok(x.inputs.length && x.outputs.length && x.repoRefs.length, `${x.id}: missing contract`);
  for (const p of x.repoRefs) assert.ok(existsSync(resolve(root, p)), `${x.id}: missing ${p}`);
  refs(x.sourceRefs, sources, x.id);
}
for (const x of report.dataClasses) {
  refs([x.producer, ...x.consumers], systems, x.id);
  fields(x, ['purpose', 'storage', 'retention', 'sharing', 'recovery'], x.id);
}
for (const x of report.flows) {
  refs([x.from, x.to], systems, x.id);
  refs(x.dataIds, data, x.id);
  fields(x, ['payload', 'transport', 'status', 'guard', 'failure'], x.id);
}
for (const x of report.transactions) {
  refs(x.systemIds, systems, x.id);
  refs(x.dataIds, data, x.id);
  fields(x, ['payer', 'payee', 'item', 'unit', 'route', 'pricePolicy', 'activationGate', 'refundAndFailure', 'status'], x.id);
}
for (const x of report.partners) {
  refs(x.sourceRefs, sources, x.id);
  assert.equal(x.contactSent, false);
  assert.equal(x.contractStatus, 'not_verified_by_this_research');
}
const taskIds = new Set(mission.taskAssignments.map((x) => x.taskId));
for (const x of report.gaps) {
  refs([x.systemId], systems, x.id);
  refs(x.taskIds, taskIds, x.id);
  fields(x, ['cause', 'change', 'acceptance', 'status'], x.id);
}
for (const x of report.journeys) refs(x.systems, systems, x.id);
for (const x of report.sources) {
  const url = new URL(x.url);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.username + url.password, '');
  fields(x, ['title', 'finding', 'checkedAt', 'evidenceKind', 'retrieval'], x.id);
  assert.ok(text.includes(x.url), `${x.id}: source missing from document`);
}

covers(identities(report.requirementCoverage, 'RQ'), baseline.requirements, 'RQ');
covers(identities(report.domainCoverage, 'domains'), index.systemDomains.map((x) => x.id), 'domains');
covers(identities(report.toolCoverage, 'catalog'), catalog.map((x) => x.id), 'catalog');
for (const rows of [report.requirementCoverage, report.domainCoverage, report.toolCoverage])
  for (const x of rows) refs(x.systemIds, systems, x.id);
for (const x of report.toolCoverage) {
  const current = catalog.find((tool) => tool.id === x.id);
  assert.equal(x.name, current.name, `${x.id}: name drift`);
  assert.equal(x.catalogStatus, current.status, `${x.id}: catalog status drift`);
  assert.equal(x.upstream, current.source, `${x.id}: upstream drift`);
  refs(x.dataIds, data, x.id);
  refs(x.potentialTransactionIds, transactions, x.id);
}
assert.equal(report.scope.catalogCount, catalog.length);
assert.equal(report.scope.designDomainCount, index.systemDomains.length);
assert.equal(report.scope.requirementCount, baseline.requirements.length);
assert.ok(report.repositoryEvidence.length > 0);
for (const x of report.repositoryEvidence) {
  assert.equal(x.gitSha, report.sourceMainSha);
  assert.match(x.sha256, /^[a-f0-9]{64}$/u);
  assert.ok(existsSync(resolve(root, x.path)), `missing source: ${x.path}`);
  if (process.argv.includes('--source-hashes')) {
    const bytes = execFileSync('git', ['show', `${x.gitSha}:${x.path}`], { cwd: root });
    assert.equal(createHash('sha256').update(bytes).digest('hex'), x.sha256, `source hash drift: ${x.path}`);
  }
}
assert.equal([...text.matchAll(/```mermaid\n/gu)].length, 5);
console.log(`Research coverage PASS: ${systems.size} systems, ${report.flows.length} flows, ${data.size} data classes, ${transactions.size} transactions, ${sources.size} sources; ${catalog.length} Tools / ${baseline.requirements.length} RQ / ${index.systemDomains.length} domains.`);
console.log(process.argv.includes('--source-hashes') ? `Historical source hashes PASS: ${report.repositoryEvidence.length}.` : 'Historical source hashes not checked; use --source-hashes with the recorded Git history available.');
console.log('Evidence is design/source coverage; no new Provider, physical-device, construction or transaction acceptance.');
