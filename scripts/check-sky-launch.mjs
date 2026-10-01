import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const report = JSON.parse(readFileSync(resolve(root, 'data/sky-service-launch.json'), 'utf8'));
if (report.schema !== 'sky-service-launch/1' || !Array.isArray(report.gates) || !report.gates.length)
  throw new Error('Sky launch report is missing its gates.');
const stages = Object.keys(report.stageDependencies);
const ids = new Set();
for (const gate of report.gates) {
  if (!gate.id || ids.has(gate.id) || !stages.includes(gate.stage) ||
    !['passed', 'in_progress', 'not_verified', 'blocked'].includes(gate.status) ||
    !['ROCK', 'JOINT', 'OWNER', 'EXTERNAL'].includes(gate.owner) || !gate.acceptance || !gate.environment || !Array.isArray(gate.evidence))
    throw new Error(`Invalid launch gate: ${gate.id}`);
  ids.add(gate.id);
  if (gate.status === 'passed' && !gate.evidence.length) throw new Error(`Missing acceptance evidence: ${gate.id}`);
  for (const evidence of gate.evidence) if (!existsSync(resolve(root, evidence))) throw new Error(`Missing launch evidence file: ${evidence}`);
}
const requirements = (stage, visited = new Set()) => {
  if (visited.has(stage)) throw new Error('Launch stage dependency cycle.');
  visited.add(stage);
  const dependencies = report.stageDependencies[stage];
  if (!Array.isArray(dependencies)) throw new Error(`Unknown launch stage: ${stage}`);
  return new Set([stage, ...dependencies.flatMap((dependency) => [...requirements(dependency, new Set(visited))])]);
};
const missing = (stage) => {
  const needed = requirements(stage);
  return report.gates.filter((gate) => needed.has(gate.stage) && gate.status !== 'passed');
};
if (report.completeLaunchClaim !== (missing('paid').length === 0)) throw new Error('Complete-launch claim disagrees with required acceptance.');
const [flag, stage, ...extra] = process.argv.slice(2);
if (flag && (flag !== '--require-stage' || !stages.includes(stage) || extra.length)) throw new Error('Usage: check-sky-launch.mjs [--require-stage basic|marketplace|paid|clients]');
for (const item of stages) console.log(`Sky ${item}: ${missing(item).length ? '未合格 — ' + missing(item).map((gate) => gate.id).join(', ') : '受入合格'}`);
if (stage && missing(stage).length) process.exitCode = 1;
