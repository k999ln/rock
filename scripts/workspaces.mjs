import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMissionControl } from './check-mission-control.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const cell = (text) =>
  String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
const labels = {
  done: '完了記録あり',
  in_progress: '進行中',
  planned: '未着手',
  blocked: '停止中',
};
const classes = {
  current_product: '現行製品',
  shared_system: '共通基盤',
  historical: '旧版・参考',
  coordination: '調整',
  presentation: '公開説明',
};

export function workspaceModel(mission, project, navigation) {
  const tasks = new Map(project.tasks.map((task) => [task.id, task]));
  const squads = new Map(mission.squads.map((squad) => [squad.id, squad]));
  const assignments = new Map();
  for (const entry of mission.taskAssignments) {
    if (
      !tasks.has(entry.taskId) ||
      !squads.has(entry.primarySquad) ||
      assignments.has(entry.taskId)
    )
      throw new Error('作業の担当が欠落・重複しています: ' + entry.taskId);
    assignments.set(entry.taskId, entry);
  }
  if (assignments.size !== tasks.size)
    throw new Error('全taskの主担当が必要です');
  const entries = new Map();
  for (const entry of navigation) {
    if (
      !squads.has(entry.squad) ||
      entries.has(entry.squad) ||
      !/^[A-Z][0-9]+$/.test(entry.squad)
    )
      throw new Error('分野の入口が不正です: ' + entry.squad);
    entries.set(entry.squad, entry);
  }
  if (entries.size !== squads.size) throw new Error('全分野の入口が必要です');
  const plans = new Map(mission.taskPlans.map((plan) => [plan.taskId, plan]));
  function holdsFor(id) {
    const lineage = new Set();
    for (let task = tasks.get(id); task; task = tasks.get(task.parentTaskId)) {
      if (lineage.has(task.id)) throw new Error('親taskの循環: ' + id);
      lineage.add(task.id);
    }
    return mission.executionHolds.filter((hold) =>
      hold.taskIds.some((taskId) => lineage.has(taskId)),
    );
  }
  function pendingFor(task) {
    return task.dependsOn.filter((id) => tasks.get(id)?.status !== 'done');
  }
  return {
    mission,
    project,
    tasks,
    squads,
    assignments,
    entries,
    plans,
    holdsFor,
    pendingFor,
  };
}

export function taskBrief(model, id) {
  const task = model.tasks.get(id);
  if (!task) throw new Error('taskがありません: ' + id);
  const assignment = model.assignments.get(id);
  const plan = model.plans.get(id);
  const squad = model.squads.get(assignment.primarySquad);
  const lines = [
    `${id}: ${task.title}`,
    `担当: ${squad.id} ${squad.name} / ${plan?.primaryOwner ?? squad.primaryOwner} / ${classes[assignment.classification]}`,
    `記録状態: ${labels[task.status]}`,
    `入口: workspaces/${squad.id}/README.md`,
    `未完了の前提: ${model.pendingFor(task).join(', ') || 'なし（実行承認・受入gateとは別）'}`,
    task.parentTaskId
      ? `親task: ${task.parentTaskId}（この作業だけで親を完了にしない）`
      : '',
    task.reason ? `停止理由: ${task.reason}` : '',
    task.nextAction ? `次の作業: ${task.nextAction}` : '',
  ].filter(Boolean);
  for (const hold of model.holdsFor(id))
    lines.push(
      `実行保留: ${hold.scope}\n理由: ${hold.reason}\n解除条件: ${hold.releaseCondition}`,
    );
  if (plan) {
    lines.push(`範囲: ${plan.scope}`, `担当者: ${plan.assignee ?? '未割当'}`);
    for (const input of plan.inputs)
      lines.push(`入力: ${input.path} / ${input.locator}`);
    for (const step of plan.steps)
      lines.push(`手順 ${step.id}: ${step.action}`);
    for (const output of plan.deliverables)
      lines.push(
        `成果: ${output.path}${output.section ? ' / ' + output.section : ''} / ${output.description}`,
      );
    for (const check of plan.acceptanceCriteria)
      lines.push(
        `合格条件 ${check.id} [${check.status}]: ${check.criterion}\n確認: ${check.verification}`,
      );
    if (plan.executionBoundary)
      lines.push(`実行境界: ${plan.executionBoundary}`);
    lines.push(
      `未決事項: ${plan.unresolvedDecision}`,
      `完了範囲: ${plan.completionScope}`,
    );
  } else
    lines.push(
      '詳細手順は未登録。次の根拠と担当分野の完了条件から、今回の範囲・成果・検証を固定する。',
    );
  for (const path of task.evidence) lines.push(`根拠: ${path}`);
  return lines.join('\n') + '\n';
}

export function renderWorkspaces(model) {
  const output = new Map();
  const link = (from, path, label = path) =>
    `[${cell(label)}](${relative(dirname(from), path)})`;
  const intro = [
    '# 機能・作業ごとの作業部屋',
    '',
    '思いついたら [アイデア置き場](IDEAS.md)へ。進めるときは下の分野を一つ選び、既存taskを一件選びます。',
    '',
    'このフォルダは既存の担当表から生成する作業用の入口です。ソースは元の場所にあり、状態・主担当・手順は [進捗JSON](../data/project-status.json) と [Mission Control](../data/mission-control.json) が正本です。生成ページを直接編集せず `npm run work:update` で同期します。',
    '',
    '## よく使う入口',
    '',
    '| やりたいこと | 開く部屋 |',
    '| --- | --- |',
    '| 製品の構想、仕様、優先順位、Git整理 | [H1 製品・統合](H1/README.md) |',
    '| 認証、本人確認、Spider、権限 | [O1 Security](O1/README.md) |',
    '| 仕事の状態、保存、再開、復旧 | [O2 Work・Data](O2/README.md) |',
    '| LLM、ローカルAI、Agentの評価 | [O3 AI・Agent](O3/README.md) |',
    '| SkyのTool、MCP、SDK、クラウド接続 | [O4 Tool・MCP](O4/README.md) |',
    '| Home、Zema、eSIMサービス、Wallet、決済 | [O5 Sky・Zema・Wallet](O5/README.md) |',
    '| Pixel、Android、機種別対応 | [O6 Device Adapter](O6/README.md) |',
    '| QEMU、配布、署名、Web公開 | [O7 Release・運用](O7/README.md) |',
    '',
    '話題の入口とtaskの主担当は同じとは限りません。taskが決まったら `npm run work -- <task ID>` の担当表示を優先してください。',
    '',
    '## 作業を始める',
    '',
    '1. 分野を開き、未完了task・前提・実行保留を確認する。親は全体受入、子は個別作業。',
    '2. `npm run work -- SYS13-01` のように、選んだtaskの入力・手順・成果・合格条件を読む。',
    '3. そのtaskを一つのbranch／作業フォルダで進める。新しい思いつきはアイデア置き場へ退避する。',
    '4. 次の一手・触ったpath・検証結果を残し、`npm run project:update` と `npm run mission:update` で同期する。',
    '',
    '未保存変更のあるフォルダでbranchを切り替えないでください。別作業が必要なら最新mainを確認した専用worktreeを使い、branch名は `codex/<分野>-<短い作業名>` とします。GitHubへの保存、main統合、公開は別の状態です。',
    '',
    '```sh',
    'npm run work                 # 分野一覧',
    'npm run work -- O4           # 一分野の作業一覧',
    'npm run work -- SKY07-01     # 一件の具体的な手順',
    'npm run work -- --find eSIM  # task／資料pathから探す',
    'npm run work:check           # 全taskの所属と入口の同期確認',
    '```',
    '',
    '## 全分野',
    '',
    '既存32分野を5群で表示します。件数は製品完成率ではなく、旧版・参考・公開説明のtaskを現行製品の受入へ加算しません。',
    '',
  ];
  for (const division of model.mission.divisions) {
    intro.push(
      `### ${division.name}`,
      '',
      '| 部屋 | 目的 | 次に確認するtask |',
      '| --- | --- | --- |',
    );
    for (const squad of model.mission.squads.filter(
      (s) => s.division === division.id,
    ))
      intro.push(
        `| [${squad.id} ${cell(squad.name)}](${squad.id}/README.md) | ${cell(squad.goal)} | ${squad.nextTaskIds.join(', ')} |`,
      );
    intro.push('');
  }
  intro.push(
    '## 更新と合格条件',
    '',
    '`data/workspaces.json` は場所と確認コマンドだけを保持し、taskの担当を再定義しません。新規taskは進捗JSONとMission Controlの一意なtaskAssignmentsへ追加します。作業部屋はproject／mission同期から自動再生成され、`npm run verify` にも整合検査を含めます。',
    '',
    '[責任分界](../docs/workstreams/00-responsibility-boundaries.md) · [作業分野別の受入・検証](../docs/workstreams/README.md) · [製品別ガイド](../PROJECTS.md)',
    '',
  );
  output.set('workspaces/README.md', intro.join('\n'));
  for (const squad of model.mission.squads) {
    const file = `workspaces/${squad.id}/README.md`;
    const nav = model.entries.get(squad.id);
    const assigned = model.project.tasks.filter(
      (task) => model.assignments.get(task.id).primarySquad === squad.id,
    );
    const holds = [
      ...new Set(assigned.flatMap((task) => model.holdsFor(task.id))),
    ];
    const lines = [
      `# ${squad.id} — ${squad.name}`,
      '',
      '[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)',
      '',
      '> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。',
      '',
      `**目的:** ${squad.goal}`,
      '',
      `**主担当:** ${squad.primaryOwner} / **評価対象:** ${squad.stageAssessment.scope}`,
      '',
      '## 触る場所・読む資料',
      '',
      ...nav.paths.map((path) => '- ' + link(file, path)),
      ...nav.guides.map((path) => '- ' + link(file, path)),
      '',
      '## 次の作業',
      '',
      ...squad.nextTaskIds.map(
        (id) =>
          `- **${id}**: ${model.tasks.get(id).title} — 詳細: \`npm run work -- ${id}\``,
      ),
      '',
      squad.nextAction,
      '',
      ...holds.flatMap((hold) => [
        `**実行保留:** ${hold.scope}。${hold.reason}`,
        '',
        `解除条件: ${hold.releaseCondition}`,
        '',
      ]),
      '## 守る条件・残課題',
      '',
      ...squad.rules.map((rule) => '- ' + rule),
      ...squad.stageAssessment.gaps.map((gap) => '- 未解決: ' + gap),
      '',
      '## 未完了の作業',
      '',
      '| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |',
      '| --- | --- | --- | --- |',
    ];
    const row = (task) => {
      const pending = model.pendingFor(task);
      const hold = model.holdsFor(task.id);
      return `| ${task.id}${task.parentTaskId ? '（子）' : model.project.tasks.some((t) => t.parentTaskId === task.id) ? '（親）' : ''} | ${cell(task.title)} | ${labels[task.status]} / ${classes[model.assignments.get(task.id).classification]} | ${cell([...pending, ...(task.reason ? [task.reason] : []), ...hold.map((h) => '実行保留: ' + h.scope)].join(' / ') || '—')} |`;
    };
    lines.push(
      ...assigned.filter((task) => task.status !== 'done').map(row),
      '',
      '<details>',
      '<summary>完了記録のあるtask（当該範囲の記録。製品全体の完成ではありません）</summary>',
      '',
      '| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |',
      '| --- | --- | --- | --- |',
      ...assigned.filter((task) => task.status === 'done').map(row),
      '',
      '</details>',
      '',
      '## 検証・引継ぎ',
      '',
      '対象のtaskPlanにある合格条件と、関連workstreamの環境別試験を優先します。以下は入口となる確認コマンドです。',
      '',
      '```sh',
      ...nav.checks,
      'npm run project:update',
      'npm run mission:update',
      'npm run verify',
      '```',
      '',
      `全体受入: ${squad.acceptanceGate}`,
      '',
      '新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。',
      '',
      '```text',
      `${squad.id} ${squad.name}の <task ID> を進める。workspaces/${squad.id}/README.mdと`,
      'npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。',
      '今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。',
      '終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。',
      '```',
      '',
    );
    output.set(file, lines.join('\n'));
  }
  return output;
}

export function syncWorkspaces({ check = false } = {}) {
  const mission = read('data/mission-control.json');
  const project = read('data/project-status.json');
  validateMissionControl(mission, project, read('data/product-baseline.json'));
  const model = workspaceModel(mission, project, read('data/workspaces.json'));
  for (const nav of model.entries.values()) {
    for (const path of [...nav.paths, ...nav.guides]) {
      if (
        relative(root, resolve(root, path)).startsWith('..') ||
        path.startsWith('/') ||
        !existsSync(resolve(root, path))
      )
        throw new Error('参照pathが不正です: ' + path);
    }
    for (const command of nav.checks) {
      const script = command.match(/^npm run ([\w:-]+)$/)?.[1];
      if (!script || !read('package.json').scripts[script])
        throw new Error('確認コマンドが不正です: ' + command);
    }
  }
  for (const [path, content] of renderWorkspaces(model)) {
    const target = resolve(root, path);
    if (existsSync(target) && readFileSync(target, 'utf8') === content)
      continue;
    if (check)
      throw new Error(
        '作業部屋が未同期です: ' + path + ' / npm run work:update',
      );
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return model;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && ['--check', '--write'].includes(args[0])) {
      const model = syncWorkspaces({ check: args[0] === '--check' });
      console.log(
        `作業部屋: ${model.squads.size}分野 / ${model.tasks.size} task、一意な担当と入口を同期確認`,
      );
    } else {
      const model = workspaceModel(
        read('data/mission-control.json'),
        read('data/project-status.json'),
        read('data/workspaces.json'),
      );
      if (!args.length)
        console.log(
          model.mission.squads
            .map((s) => `${s.id} ${s.name} → workspaces/${s.id}/README.md`)
            .join('\n'),
        );
      else if (args.length === 2 && args[0] === '--find' && args[1].trim()) {
        const query = args[1].toLowerCase();
        const matches = [...model.tasks.values()].filter((t) =>
          JSON.stringify([t, model.plans.get(t.id)])
            .toLowerCase()
            .includes(query),
        );
        const areas = [...model.entries.values()].filter((entry) =>
          JSON.stringify(entry.keywords ?? [])
            .toLowerCase()
            .includes(query),
        );
        for (const area of areas)
          console.log(
            `話題の入口 [${area.squad}]: workspaces/${area.squad}/README.md（taskの担当は個別確認）`,
          );
        console.log(
          matches.length
            ? matches
                .map(
                  (t) =>
                    `${t.id} [${model.assignments.get(t.id).primarySquad}] ${labels[t.status]}: ${t.title}`,
                )
                .join('\n')
            : areas.length
              ? '一致するtaskなし。上の入口で範囲と未統合作業を確認してください。'
              : '該当なし',
        );
      } else if (args.length === 1 && model.squads.has(args[0]))
        console.log(
          renderWorkspaces(model).get(`workspaces/${args[0]}/README.md`),
        );
      else if (args.length === 1 && model.tasks.has(args[0]))
        console.log(taskBrief(model, args[0]));
      else
        throw new Error(
          '使い方: npm run work -- [O4 | SKY07-01 | --find 検索語]',
        );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
