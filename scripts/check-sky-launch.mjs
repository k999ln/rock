import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSkyLaunchReport } from './sky-launch-validation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const report = JSON.parse(
  readFileSync(resolve(root, 'data/sky-service-launch.json'), 'utf8'),
);
const evidencePath = (path) => {
  const resolved = resolve(root, path);
  const local = relative(root, resolved);
  if (!local || local === '..' || local.startsWith('../') || isAbsolute(local))
    throw new Error('Launch evidence must stay in the repository.');
  if (existsSync(resolved)) {
    const actual = relative(realpathSync(root), realpathSync(resolved));
    if (actual === '..' || actual.startsWith('../') || isAbsolute(actual))
      throw new Error('Launch evidence symlink must stay in the repository.');
  }
  return resolved;
};
const { stages, missing } = validateSkyLaunchReport(report, {
  evidenceExists: (path) => {
    const resolved = evidencePath(path);
    return existsSync(resolved) && statSync(resolved).isFile();
  },
  readEvidence: (path) => JSON.parse(readFileSync(evidencePath(path), 'utf8')),
});
const [flag, stage, ...extra] = process.argv.slice(2);
if (
  flag &&
  (flag !== '--require-stage' || !stages.includes(stage) || extra.length)
)
  throw new Error(
    'Usage: check-sky-launch.mjs [--require-stage basic|marketplace|paid|clients|complete]',
  );
for (const item of stages)
  console.log(
    `Sky ${item}: ${
      missing(item).length
        ? '未合格 — ' +
          missing(item)
            .map((gate) => gate.id)
            .join(', ')
        : '受入合格'
    }`,
  );
if (stage && missing(stage).length) process.exitCode = 1;
