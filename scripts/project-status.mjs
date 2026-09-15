import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import {
  phaseGateEvidencePaths,
  renderPhaseGates,
  validatePhaseGates,
} from './project-phase-gates.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const status = JSON.parse(
  readFileSync(resolve(root, 'data/project-status.json'), 'utf8'),
);
const labels = {
  planned: '未着手',
  in_progress: '進行中',
  done: '完了',
  blocked: '停止中',
};
const ids = new Set(status.tasks.map((task) => task.id));
if (ids.size !== status.tasks.length)
  throw new Error('タスクIDが重複しています。');
if (!/^\d{4}-\d{2}-\d{2}$/.test(status.updatedAt))
  throw new Error('更新日が不正です。');
for (const task of status.tasks) {
  if (!Object.hasOwn(labels, task.status))
    throw new Error(`${task.id}: 不正な状態`);
  if (task.dependsOn.some((id) => !ids.has(id) || id === task.id))
    throw new Error(`${task.id}: 不正な依存関係`);
  if (
    task.status === 'done' &&
    (!task.evidence.length ||
      task.dependsOn.some(
        (id) => status.tasks.find((t) => t.id === id).status !== 'done',
      ))
  )
    throw new Error(`${task.id}: 完了には根拠と依存作業の完了が必要です。`);
  if (task.evidence.some((file) => !existsSync(resolve(root, file))))
    throw new Error(`${task.id}: 根拠ファイルがありません。`);
  if (task.status === 'blocked' && !task.reason)
    throw new Error(`${task.id}: 停止理由が必要です。`);
}
function visit(id, stack = new Set()) {
  if (stack.has(id)) throw new Error('依存関係が循環しています。');
  const next = new Set(stack).add(id);
  for (const dep of status.tasks.find((t) => t.id === id).dependsOn)
    visit(dep, next);
}
for (const id of ids) visit(id);
const existingGateEvidence = new Set(
  phaseGateEvidencePaths(status.phaseGates).filter(
    (file) =>
      existsSync(resolve(root, file)) && statSync(resolve(root, file)).isFile(),
  ),
);
const phaseGates = validatePhaseGates(
  status.tasks,
  status.phaseGates,
  existingGateEvidence,
);
const cell = (value) =>
  String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const done = status.tasks.filter((task) => task.status === 'done').length;
const planned = status.tasks.filter((task) => task.status === 'planned').length;
const inProgress = status.tasks.filter(
  (task) => task.status === 'in_progress',
).length;
const blocked = status.tasks.filter((task) => task.status === 'blocked').length;
const overview = `${status.tasks.length} task中${done} done・${inProgress} in progress・${planned} planned${blocked ? `・${blocked} blocked` : ''}`;
const block = [
  '<!-- project-status:start -->',
  `最終更新: ${status.updatedAt} / ${status.milestone} / 完了 ${done}/${status.tasks.length}件`,
  '',
  '| ID | 作業 | 状態 | 根拠 |',
  '| --- | --- | --- | --- |',
  ...status.tasks.map(
    (task) =>
      `| ${task.id} | ${cell(task.title)} | ${labels[task.status]}${task.reason ? `: ${cell(task.reason)}` : ''} | ${task.evidence.map((file) => `[記録](${file})`).join(' · ') || '—'} |`,
  ),
  '',
  ...renderPhaseGates(phaseGates),
  `次の作業: ${status.nextAction}`,
  '<!-- project-status:end -->',
].join('\n');
let stale = false;
const replaceMarkedBlock = (source, marker, replacement, name) => {
  const pattern = new RegExp(
    `<!-- ${marker}:start -->[\\s\\S]*?<!-- ${marker}:end -->`,
  );
  if (!pattern.test(source))
    throw new Error(`${name}: ${marker}欄がありません。`);
  return source.replace(pattern, () => replacement);
};
const targets = [
  {
    name: 'README.md',
    transform: (source) => {
      let result = replaceMarkedBlock(
        source,
        'project-status',
        block,
        'README.md',
      );
      result = replaceMarkedBlock(
        result,
        'project-overview',
        [
          '<!-- project-overview:start -->',
          `更新日: ${status.updatedAt} / ${overview}`,
          '<!-- project-overview:end -->',
        ].join('\n'),
        'README.md',
      );
      return replaceMarkedBlock(
        result,
        'project-details-summary',
        [
          '<!-- project-details-summary:start -->',
          `<summary>${status.tasks.length} taskと段階gateの詳細を開く</summary>`,
          '<!-- project-details-summary:end -->',
        ].join('\n'),
        'README.md',
      );
    },
  },
  {
    name: 'project.md',
    transform: (source) =>
      replaceMarkedBlock(source, 'project-status', block, 'project.md'),
  },
  {
    name: 'docs/workstreams/README.md',
    transform: (source) => {
      return replaceMarkedBlock(
        source,
        'project-overview',
        [
          '<!-- project-overview:start -->',
          `現在の機械可読進捗は${overview.replaceAll('・', '、')}。件数は作業量や製品完成率を表さない。`,
          '<!-- project-overview:end -->',
        ].join('\n'),
        'docs/workstreams/README.md',
      );
    },
  },
];
for (const { name, transform } of targets) {
  const file = resolve(root, name);
  const before = readFileSync(file, 'utf8');
  const after = transform(before);
  if (before !== after) {
    if (process.argv.includes('--check')) {
      stale = true;
      console.error(`${name}: npm run project:update を実行してください。`);
    } else writeFileSync(file, after);
  }
}
if (stale) process.exitCode = 1;
else
  console.log(`進捗文書: ${done}/${status.tasks.length}件完了、整合確認済み`);
