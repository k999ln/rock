import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireTrue = (condition, message) => {
  if (!condition) throw new Error(message);
};
const nonempty = (value) =>
  typeof value === 'string' && value.trim().length > 0;
const unique = (values) => new Set(values).size === values.length;

export function validateMissionControl(
  mission,
  project,
  baseline,
  fileExists = (path) => existsSync(path) && statSync(path).isFile(),
) {
  const checkFile = (path) => {
    requireTrue(nonempty(path), '参照pathがありません');
    const resolved = resolve(root, path);
    requireTrue(
      !relative(root, resolved).startsWith('..') && !path.startsWith('/'),
      '参照はrepository内に限定します: ' + path,
    );
    requireTrue(fileExists(resolved), '参照fileがありません: ' + path);
  };
  requireTrue(
    mission.schema === 'avokado-mission-control/3',
    'Mission Control schemaが不正です',
  );
  requireTrue(
    !mission.taskRoutingRules,
    'ID prefixによるroutingは廃止しました',
  );
  requireTrue(
    mission.name === 'avokado Mission Control' && mission.shortName === 'AMC',
    'Mission Control名称が不正です',
  );
  requireTrue(
    /^\d{4}-\d{2}-\d{2}$/.test(mission.updatedAt),
    '更新日が不正です',
  );
  requireTrue(
    /^[a-f0-9]{40}$/.test(mission.audit?.localBaseSha),
    '監査対象SHAが必要です',
  );
  requireTrue(
    mission.process?.length === 6 && mission.globalRules?.length >= 10,
    'process/ruleが不足しています',
  );
  for (const path of Object.values(mission.authority ?? {})) checkFile(path);
  const family = baseline.hardwareProductFamily;
  requireTrue(
    JSON.stringify(family?.products?.map(({ id }) => id)) ===
      JSON.stringify(['avocado-mini', 'avokado-pro', 'rocketstar']),
    'hardware製品定義が不正です',
  );
  requireTrue(
    family.sharedOperatingSystem === 'RockstarOS',
    '共有OSが不正です',
  );
  requireTrue(
    family.products.find(({ id }) => id === 'avokado-pro')
      .missionControlSquad === 'P1',
    'Pro設計担当はP1です',
  );
  requireTrue(
    JSON.stringify(mission.stagePolicy?.stages?.map(({ id }) => id)) ===
      JSON.stringify([0, 1, 2, 3, 4, 5]),
    '段階は0〜5です',
  );
  const divisions = new Map(
    mission.divisions.map((division) => [division.id, division]),
  );
  const squads = new Map(mission.squads.map((squad) => [squad.id, squad]));
  requireTrue(
    divisions.size === 5 && divisions.size === mission.divisions.length,
    'division数/重複が不正です',
  );
  requireTrue(
    squads.size === 32 && squads.size === mission.squads.length,
    '32 squadを一意に定義してください',
  );
  for (const division of divisions.values()) {
    requireTrue(
      nonempty(division.name) && nonempty(division.goal),
      division.id + ': division定義不足',
    );
  }
  for (const [division, count] of Object.entries({
    command: 1,
    rockstaros: 7,
    'avocado-mini': 7,
    'avokado-pro': 7,
    rocketstar: 10,
  })) {
    requireTrue(
      mission.squads.filter((s) => s.division === division).length === count,
      division + ': squad数が不正です',
    );
  }
  const tasks = new Map(project.tasks.map((task) => [task.id, task]));
  requireTrue(tasks.size === project.tasks.length, 'task IDが重複しています');
  const assignments = new Map();
  const categories = new Set([
    'current_product',
    'shared_system',
    'historical',
    'coordination',
    'presentation',
  ]);
  for (const assignment of mission.taskAssignments) {
    const { taskId, primarySquad, classification } = assignment;
    requireTrue(tasks.has(taskId), taskId + ': taskがありません');
    requireTrue(
      !assignments.has(taskId),
      taskId + ': primary担当が重複しています',
    );
    requireTrue(
      squads.has(primarySquad),
      taskId + ': primary squadがありません',
    );
    requireTrue(
      categories.has(classification),
      taskId + ': classificationが不正です',
    );
    assignments.set(taskId, assignment);
  }
  requireTrue(
    assignments.size === tasks.size,
    '全taskへprimary担当を明示してください',
  );
  const plans = new Map();
  for (const plan of mission.taskPlans) {
    const { taskId } = plan;
    requireTrue(
      tasks.has(taskId) && !plans.has(taskId),
      taskId + ': planのtask不明/重複',
    );
    requireTrue(
      ['ROCK', 'EXTERNAL', 'OWNER', 'JOINT'].includes(plan.primaryOwner),
      taskId + ': 責任区分が不正です',
    );
    requireTrue(
      plan.assignee === null || nonempty(plan.assignee),
      taskId + ': assigneeは未割当nullまたは氏名です',
    );
    for (const key of [
      'ownerRole',
      'scope',
      'unresolvedDecision',
      'completionScope',
    ]) {
      requireTrue(nonempty(plan[key]), taskId + ': ' + key + 'が必要です');
    }
    requireTrue(
      plan.inputs?.length > 0 && plan.deliverables?.length > 0,
      taskId + ': 入力/成果物が必要です',
    );
    for (const input of plan.inputs) {
      checkFile(input.path);
      requireTrue(
        nonempty(input.locator),
        taskId + ': 入力の対象箇所が必要です',
      );
    }
    for (const deliverable of plan.deliverables) {
      requireTrue(
        nonempty(deliverable.path) && nonempty(deliverable.description),
        taskId + ': 成果物定義不足',
      );
    }
    requireTrue(
      plan.steps?.length >= 2 && unique(plan.steps.map(({ id }) => id)),
      taskId + ': 手順不足/重複',
    );
    for (const step of plan.steps)
      requireTrue(
        nonempty(step.id) && nonempty(step.action),
        taskId + ': 手順定義不足',
      );
    requireTrue(
      plan.acceptanceCriteria?.length >= (plan.parentTaskId ? 1 : 3) &&
        unique(plan.acceptanceCriteria.map(({ id }) => id)),
      taskId + ': 合格条件不足/重複',
    );
    for (const criterion of plan.acceptanceCriteria) {
      requireTrue(
        nonempty(criterion.id) &&
          nonempty(criterion.criterion) &&
          nonempty(criterion.verification),
        taskId + ': 合格条件定義不足',
      );
      requireTrue(
        ['not_verified', 'passed', 'failed'].includes(criterion.status),
        taskId + ': 合格状態が不正です',
      );
      requireTrue(
        Array.isArray(criterion.evidence),
        taskId + ': evidence配列が必要です',
      );
      criterion.evidence.forEach(checkFile);
      requireTrue(
        criterion.status !== 'passed' || criterion.evidence.length > 0,
        taskId + ': passedには証拠が必要です',
      );
    }
    if (tasks.get(taskId).status === 'done') {
      requireTrue(
        plan.acceptanceCriteria.every(({ status }) => status === 'passed'),
        taskId + ': doneには全条件の合格が必要です',
      );
      plan.deliverables.forEach(({ path }) => checkFile(path));
      requireTrue(
        tasks.get(taskId).evidence?.length > 0,
        taskId + ': doneにはtask証拠が必要です',
      );
      tasks.get(taskId).evidence.forEach(checkFile);
      requireTrue(
        (tasks.get(taskId).dependsOn ?? []).every(
          (id) => tasks.get(id)?.status === 'done',
        ),
        taskId + ': 未完了の前提taskがあります',
      );
    }
    plans.set(taskId, plan);
  }
  const children = new Map();
  for (const task of tasks.values()) {
    if (!task.parentTaskId) continue;
    const parent = tasks.get(task.parentTaskId);
    const plan = plans.get(task.id);
    requireTrue(parent && parent.id !== task.id && !parent.parentTaskId, task.id + ': 親taskが不正です');
    requireTrue(plan?.parentTaskId === parent.id && plans.has(parent.id), task.id + ': 親子planが一致しません');
    requireTrue(assignments.get(task.id).primarySquad === assignments.get(parent.id).primarySquad, task.id + ': 親子の主担当が一致しません');
    requireTrue(assignments.get(task.id).classification === assignments.get(parent.id).classification, task.id + ': 親子の分類が一致しません');
    requireTrue(plan.primaryOwner === plans.get(parent.id).primaryOwner, task.id + ': 親子の責任区分が一致しません');
    requireTrue(plan.deliverables.every((d) => nonempty(d.section)), task.id + ': 子成果物の独立したsectionが必要です');
    requireTrue(plan.deliverables.every((d) => plans.get(parent.id).deliverables.some((expected) => expected.path === d.path)), task.id + ': 子成果物は親の成果物内に限定します');
    requireTrue(['document', 'code_test', 'build', 'physical', 'external'].includes(plan.workloadClass) && nonempty(plan.executionBoundary), task.id + ': 負荷区分・実行境界が必要です');
    requireTrue(Array.isArray(task.dependsOn) && (parent.dependsOn ?? []).every((id) => task.dependsOn.includes(id)), task.id + ': 親の前提を無断解除できません');
    requireTrue(!task.dependsOn.includes(parent.id), task.id + ': 親の完了を子の前提にはできません');
    const group = children.get(parent.id) ?? [];
    group.push(task);
    children.set(parent.id, group);
  }
  for (const plan of plans.values()) {
    requireTrue((plan.parentTaskId ?? null) === (tasks.get(plan.taskId).parentTaskId ?? null), plan.taskId + ': 親子metadataが一致しません');
  }
  for (const [id, group] of children) {
    requireTrue(group.length >= 2, id + ': 子作業は2件以上必要です');
    requireTrue(tasks.get(id).status !== 'done' || group.every((task) => task.status === 'done'), id + ': 未完了の子作業があります');
    const sections = group.flatMap((task) => plans.get(task.id).deliverables.map((d) => d.path + '#' + d.section));
    requireTrue(unique(sections), id + ': 子成果物のsectionが重複しています');
  }
  for (const squad of squads.values()) {
    requireTrue(
      divisions.has(squad.division),
      squad.id + ': divisionがありません',
    );
    requireTrue(
      Number.isInteger(squad.currentStage) &&
        squad.currentStage >= 0 &&
        squad.currentStage <= 5,
      squad.id + ': currentStageが不正です',
    );
    for (const key of [
      'name',
      'goal',
      'outcome',
      'primaryOwner',
      'acceptanceGate',
      'nextAction',
    ]) {
      requireTrue(nonempty(squad[key]), squad.id + ': ' + key + 'が必要です');
    }
    requireTrue(
      squad.rules?.length >= 2 &&
        squad.deliverables?.length >= 2 &&
        squad.evidence?.length >= 1,
      squad.id + ': 部隊定義不足',
    );
    squad.evidence.forEach(checkFile);
    const expected = [...assignments.values()]
      .filter(({ primarySquad }) => primarySquad === squad.id)
      .map(({ taskId }) => taskId)
      .sort((a, b) => a.localeCompare(b));
    requireTrue(
      unique(squad.taskIds) &&
        JSON.stringify(
          [...squad.taskIds].sort((a, b) => a.localeCompare(b)),
        ) === JSON.stringify(expected),
      squad.id + ': primary task一覧がassignmentと一致しません',
    );
    requireTrue(
      squad.nextTaskIds?.length > 0 && unique(squad.nextTaskIds),
      squad.id + ': 次taskが必要です',
    );
    for (const id of squad.nextTaskIds) {
      requireTrue(
        squad.taskIds.includes(id) && plans.has(id),
        squad.id + ': 次taskには担当と詳細planが必要です',
      );
      requireTrue(
        assignments.get(id).classification !== 'historical' &&
          tasks.get(id).status !== 'done',
        squad.id + ': 旧版/完了taskは次taskにできません',
      );
    }
    requireTrue(
      unique(squad.relatedTasks.map(({ taskId }) => taskId)),
      squad.id + ': 参考taskが重複しています',
    );
    for (const related of squad.relatedTasks) {
      requireTrue(
        tasks.has(related.taskId) && !squad.taskIds.includes(related.taskId),
        squad.id + ': 参考taskは他部隊の既知taskに限定します',
      );
      requireTrue(
        [
          'historical_reference',
          'shared_reference',
          'design_archive_reference',
        ].includes(related.relation),
        squad.id + ': 参考関係が不正です',
      );
      requireTrue(
        assignments.get(related.taskId).classification !== 'historical' ||
          related.relation === 'historical_reference',
        squad.id + ': 旧版を現行参考にできません',
      );
    }
    const assessment = squad.stageAssessment;
    requireTrue(
      nonempty(assessment?.scope) &&
        nonempty(assessment?.reviewMethod) &&
        assessment?.gaps?.length > 0 &&
        assessment?.references?.length > 0,
      squad.id + ': 段階の対象範囲・残課題・判定根拠が必要です',
    );
    assessment.references.forEach(checkFile);
    if (squad.currentStage >= 4) {
      requireTrue(
        /^[a-f0-9]{40}$/.test(assessment.candidateSha) &&
          nonempty(assessment.environment) &&
          nonempty(assessment.report),
        squad.id + ': 実機/本番には同一候補・環境・報告が必要です',
      );
      checkFile(assessment.report);
    }
    for (const id of squad.dependsOnSquads ?? [])
      requireTrue(
        squads.has(id) && id !== squad.id,
        squad.id + ': squad依存が不正です',
      );
  }
  function checkCycles(items, dependencies, label) {
    const visited = new Set();
    const visiting = new Set();
    function visit(id) {
      requireTrue(items.has(id), label + ': 依存先がありません: ' + id);
      requireTrue(!visiting.has(id), label + ': 依存が循環しています: ' + id);
      if (visited.has(id)) return;
      visiting.add(id);
      const deps = dependencies(items.get(id));
      requireTrue(unique(deps), label + ': 依存が重複しています: ' + id);
      for (const dependency of deps) visit(dependency);
      visiting.delete(id);
      visited.add(id);
    }
    for (const id of items.keys()) visit(id);
  }
  checkCycles(tasks, (task) => task.dependsOn ?? [], 'task');
  checkCycles(squads, (squad) => squad.dependsOnSquads ?? [], 'squad');
  for (const hold of mission.executionHolds) {
    requireTrue(
      hold.taskIds?.length > 0 &&
        unique(hold.taskIds) &&
        hold.taskIds.every((id) => tasks.has(id)),
      '実行保留のtaskが不正です',
    );
    for (const key of ['scope', 'reason', 'releaseCondition', 'decisionOwner'])
      requireTrue(nonempty(hold[key]), '実行保留: ' + key + 'が必要です');
    checkFile(hold.source);
  }
  return { squads: squads.size, tasks: tasks.size, plans: plans.size };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const mission = read('data/mission-control.json');
  const result = validateMissionControl(
    mission,
    read('data/project-status.json'),
    read('data/product-baseline.json'),
  );
  const guide = readFileSync(resolve(root, 'docs/mission-control.md'), 'utf8');
  for (const squad of mission.squads)
    requireTrue(
      guide.includes('| ' + squad.id + ' |'),
      squad.id + ': guideに記載がありません',
    );
  console.log(
    'AMC: ' +
      result.squads +
      ' squads / ' +
      result.tasks +
      ' explicit owners / ' +
      result.plans +
      ' scoped plans',
  );
}
