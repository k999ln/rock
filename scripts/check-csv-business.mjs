import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  readFileSync(resolve(root, 'data/csv-business-tasks.json'), 'utf8'),
);
const tasks = manifest.tasks;
if (
  manifest.version !== 'csv-business-tasks/1' ||
  manifest.namespace !== 'CSV-'
)
  throw new Error('CSV_TASK_MANIFEST_VERSION');
if (!Array.isArray(tasks) || tasks.length !== 35)
  throw new Error('CSV_TASK_COUNT_MUST_BE_35');
const ids = new Set(tasks.map((task) => task.id));
if (ids.size !== 35 || [...ids].some((id) => !/^CSV-[A-Z0-9]+$/u.test(id)))
  throw new Error('CSV_TASK_IDS');
for (const task of tasks) {
  if (!['done', 'in_progress', 'blocked'].includes(task.status))
    throw new Error(`${task.id}: status`);
  if (
    !Array.isArray(task.dependsOn) ||
    task.dependsOn.some((id) => !ids.has(id) || id === task.id)
  )
    throw new Error(`${task.id}: dependency`);
  if (
    !Array.isArray(task.evidence) ||
    task.evidence.length === 0 ||
    task.evidence.some((path) => !existsSync(resolve(root, path)))
  )
    throw new Error(`${task.id}: evidence`);
  if (
    task.status === 'done' &&
    task.dependsOn.some(
      (id) => tasks.find((item) => item.id === id).status !== 'done',
    )
  )
    throw new Error(`${task.id}: done dependency`);
  if (task.status !== 'done' && !task.reason)
    throw new Error(`${task.id}: reason`);
}
function visit(id, stack = new Set()) {
  if (stack.has(id)) throw new Error(`CSV_TASK_CYCLE:${id}`);
  const next = new Set(stack).add(id);
  for (const dependency of tasks.find((task) => task.id === id).dependsOn)
    visit(dependency, next);
}
for (const id of ids) visit(id);
const contract = readFileSync(
  resolve(root, 'docs/csv-business-v1.ja.md'),
  'utf8',
);
for (const required of [
  '3,000円',
  '8.88 USD',
  '30.00 USD',
  '10 MiB',
  '50,000',
  '7日',
  'manual_verified',
  'csv-seller-fee/1',
])
  if (!contract.includes(required))
    throw new Error(`CSV_CONTRACT_MISSING:${required}`);
const source = readFileSync(resolve(root, 'lib/csv-transform.ts'), 'utf8');
for (const required of [
  '10 * 1024 * 1024',
  '50_000',
  '100',
  'report_only',
  'CP932_UNREPRESENTABLE',
])
  if (!source.includes(required))
    throw new Error(`CSV_ENGINE_MISSING:${required}`);
console.log(
  `CSV仕事: 35作業、完了 ${tasks.filter((task) => task.status === 'done').length}、進行中 ${tasks.filter((task) => task.status === 'in_progress').length}、外部gate ${tasks.filter((task) => task.status === 'blocked').length}`,
);
