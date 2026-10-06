import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, validateMissionControl } from './check-mission-control.mjs';

export function renderSquadTable(mission, project) {
  const tasks = new Map(project.tasks.map((task) => [task.id, task]));
  const escape = (value) =>
    String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    '| ID | 部隊 | 証拠のある段階（対象限定） | 次task | 子作業 | 具体的な成果 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...mission.squads.map(
      (squad) =>
        '| ' +
        [
          squad.id,
          squad.name,
          squad.currentStage +
            ' ' +
            mission.stagePolicy.stages[squad.currentStage].label,
          squad.nextTaskIds.join(', '),
          project.tasks.filter((task) =>
            squad.nextTaskIds.includes(task.parentTaskId),
          ).length,
          squad.nextTaskIds.map((id) => tasks.get(id).title).join(' / '),
        ]
          .map(escape)
          .join(' | ') +
        ' |',
    ),
  ].join('\n');
}

export function renderVisualization(mission, project) {
  const template = readFileSync(
    resolve(root, 'scripts/templates/mission-control.html'),
    'utf8',
  );
  const safeJSON = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');
  return template
    .replace('__AMC_MISSION_JSON__', () => safeJSON(mission))
    .replace('__AMC_PROJECT_JSON__', () =>
      safeJSON({ updatedAt: project.updatedAt, tasks: project.tasks }),
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const mission = read('data/mission-control.json');
  const project = read('data/project-status.json');
  validateMissionControl(mission, project, read('data/product-baseline.json'));
  const path = resolve(root, 'docs/mission-control.md');
  const guide = readFileSync(path, 'utf8');
  const pattern = /<!-- AMC-SQUADS:START -->[\s\S]*?<!-- AMC-SQUADS:END -->/;
  if (!pattern.test(guide)) throw new Error('AMC guideの生成境界がありません');
  const next = guide.replace(
    pattern,
    '<!-- AMC-SQUADS:START -->\n' +
      renderSquadTable(mission, project) +
      '\n<!-- AMC-SQUADS:END -->',
  );
  if (process.argv.includes('--check')) {
    if (next !== guide)
      throw new Error(
        'AMC guideが古い状態です。npm run mission:updateを実行してください',
      );
  } else if (next !== guide) writeFileSync(path, next);
  const index = process.argv.indexOf('--visualization');
  if (index >= 0) {
    const output = process.argv[index + 1];
    if (!output?.endsWith('.html'))
      throw new Error('--visualizationに出力HTMLのpathを指定してください');
    writeFileSync(resolve(output), renderVisualization(mission, project));
    console.log('AMC表示snapshotを更新しました: ' + output);
  }
  console.log('AMC guide: synchronized');
}
