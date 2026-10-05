import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSkyLaunch } from './lib/sky-launch-audit.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const report = JSON.parse(readFileSync(resolve(root, 'data/sky-service-launch.json'), 'utf8'));
const { stages, missing } = auditSkyLaunch(report, (evidence) => existsSync(resolve(root, evidence)));
const [flag, stage, ...extra] = process.argv.slice(2);
if (flag && (flag !== '--require-stage' || !stages.includes(stage) || extra.length)) throw new Error('Usage: check-sky-launch.mjs [--require-stage basic|focused|marketplace|paid|clients]');
for (const item of stages) console.log(`Sky ${item}: ${missing[item].length ? '未合格 — ' + missing[item].map((gate) => gate.id).join(', ') : '受入合格'}`);
if (stage && missing[stage].length) process.exitCode = 1;
