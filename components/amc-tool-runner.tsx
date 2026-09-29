'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in requires top-level navigation. */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type SubmitEvent,
} from 'react';
import missionData from '@/data/mission-control.json';
import projectData from '@/data/project-status.json';
import {
  amcEffort,
  amcPrompt,
  amcSummary,
  createAmcGoal,
  validateAmcGoal,
  type AmcBrief,
  type AmcEvent,
  type AmcGoal,
} from '@/lib/amc-tool';
import type { WorkJob } from '@/lib/workflow';
import styles from './amc-tool-runner.module.css';

type Props = {
  initialText?: string;
  onOutcome?: (result: { ok: boolean; text: string }) => void;
  onRunningChange?: (running: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  executionDisabled?: boolean;
};
type SnapshotTask = {
  id: string;
  title: string;
  status: string;
  dependsOn?: string[];
  parentTaskId?: string;
  evidence?: string[];
};
type SnapshotPlan = {
  taskId: string;
  scope: string;
  primaryOwner: string;
  ownerRole: string;
  assignee?: string | null;
  executionBoundary?: string;
  completionScope?: string;
  unresolvedDecision: string;
  steps: { id: string; action: string }[];
  acceptanceCriteria: {
    id: string;
    criterion: string;
    status: string;
    verification: string;
    evidence: string[];
  }[];
  deliverables: { path: string; description: string; section?: string }[];
  inputs: { path: string; locator: string }[];
};
type Operation = { method: 'POST' | 'PATCH'; body: Record<string, unknown> };
class SaveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
type RecordAction =
  | 'start_task'
  | 'submit_result'
  | 'verify_task'
  | 'block_task'
  | 'resume_task'
  | 'pause'
  | 'resume'
  | 'accept_goal';
const tasks = projectData.tasks as SnapshotTask[];
const taskIndex = new Map(tasks.map((task) => [task.id, task]));
const plans = new Map(
  (missionData.taskPlans as SnapshotPlan[]).map((plan) => [plan.taskId, plan]),
);
const assignments = new Map(
  missionData.taskAssignments.map((item) => [item.taskId, item]),
);
const statusLabels: Record<string, string> = {
  pending: '未着手',
  running: '作業中の記録',
  submitted: '検収待ち',
  done: '検収済み',
  blocked: '保留',
  failed: '要修正',
  planned: '未着手',
  in_progress: '進行中',
  draft: '未承認',
  active: '管理中',
  paused: '一時停止',
  accepted: 'Goal検収済み',
  passed: '合格',
  not_verified: '未検証',
  review: '確認待ち',
  completed: '受入の記録あり',
  cancelled: '停止の記録あり',
};
const actionLabels: Record<RecordAction, string> = {
  start_task: '着手を記録',
  submit_result: '成果を提出',
  verify_task: '別担当の検収を記録',
  block_task: '保留を記録',
  resume_task: '再着手を許可',
  pause: 'Goalを一時停止',
  resume: 'Goalの管理を再開',
  accept_goal: 'Goal全体を検収',
};
const boundary =
  'このWeb画面は計画・記録用です。保存や着手記録だけでAIは起動しません。ローカルCodexへの一件実行は保存後の明示操作です。';
const lines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : '操作を完了できませんでした。';

function TextList({ values }: { values: string[] }) {
  return values.length ? (
    <ul>
      {values.map((value, index) => (
        <li key={`${index}-${value}`}>{value}</li>
      ))}
    </ul>
  ) : (
    <p className={styles.muted}>未登録</p>
  );
}

function MissionBoard() {
  const [squadId, setSquadId] = useState('O2');
  const [taskId, setTaskId] = useState('AI04');
  const inputId = useId();
  const squad =
    missionData.squads.find((item) => item.id === squadId) ??
    missionData.squads[0];
  const task = taskIndex.get(taskId);
  const plan = plans.get(taskId);
  const ownTasks = squad.taskIds.flatMap((id) => taskIndex.get(id) ?? []);
  const children = tasks.filter((item) => item.parentTaskId === taskId);
  const holds = missionData.executionHolds.filter(
    (hold) =>
      hold.taskIds.includes(taskId) ||
      (!!task?.parentTaskId && hold.taskIds.includes(task.parentTaskId)),
  );
  const currentTasks = ownTasks.filter(
    (item) =>
      !tasks.some((child) => child.parentTaskId === item.id) &&
      !['historical', 'presentation'].includes(
        assignments.get(item.id)?.classification ?? '',
      ),
  );
  function chooseTask(id: string) {
    const assignment = assignments.get(id);
    if (!assignment || !taskIndex.has(id)) return;
    setSquadId(assignment.primarySquad);
    setTaskId(id);
  }
  function taskLinks(ids: string[]) {
    return ids.length ? (
      <div className={styles.links}>
        {ids.map((id) => (
          <button type="button" key={id} onClick={() => chooseTask(id)}>
            {id} · {statusLabels[taskIndex.get(id)?.status ?? ''] ?? '確認待ち'}
          </button>
        ))}
      </div>
    ) : (
      'なし'
    );
  }
  return (
    <section aria-label="正本の32部隊ボード">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>MISSION CONTROL</p>
          <h2>部隊を選ぶ。次の仕事が見える。</h2>
        </div>
        <span className={styles.badge}>5師団・32部隊</span>
      </div>
      <p className={styles.muted}>
        {missionData.updatedAt} 保存時点の正本 ·
        読み取り専用・自動同期なし。本人のGoal記録とは別です。
      </p>
      <div className={styles.divisions}>
        {missionData.divisions.map((division) => (
          <section key={division.id}>
            <h3>{division.name}</h3>
            <div className={styles.cells}>
              {missionData.squads
                .filter((item) => item.division === division.id)
                .map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={item.id === squadId}
                    title={item.name}
                    aria-label={`${item.id} ${item.name}`}
                    onClick={() => {
                      setSquadId(item.id);
                      setTaskId(item.nextTaskIds[0]);
                    }}
                  >
                    {item.id}
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>
      <section className={styles.boardDetail} aria-live="polite">
        <div className={styles.sectionHeading}>
          <h3>
            {squad.id}　{squad.name}
          </h3>
          <span className={styles.badge}>
            段階 {squad.currentStage} ·{' '}
            {missionData.stagePolicy.stages[squad.currentStage]?.label}
          </span>
        </div>
        <dl className={styles.facts}>
          <dt>Goal</dt>
          <dd>{squad.goal}</dd>
          <dt>もたらす結果</dt>
          <dd>{squad.outcome}</dd>
          <dt>段階の対象</dt>
          <dd>{squad.stageAssessment.scope}</dd>
          <dt>残る課題</dt>
          <dd>{squad.stageAssessment.gaps.join(' ／ ')}</dd>
          <dt>担当の記録</dt>
          <dd>
            {currentTasks.length}実行単位中{' '}
            {currentTasks.filter((item) => item.status === 'done').length}
            件に完了記録。親・旧版・公開説明を除外。製品完成率ではありません。
          </dd>
          <dt>次の仕事</dt>
          <dd>{taskLinks(squad.nextTaskIds)}</dd>
        </dl>
        <details>
          <summary>部隊のルール・受け渡し・根拠</summary>
          <TextList values={squad.rules} />
          <dl className={styles.facts}>
            <dt>受入条件</dt>
            <dd>{squad.acceptanceGate}</dd>
            <dt>調整する部隊</dt>
            <dd>
              {squad.dependsOnSquads.join(' / ') || 'なし'}
              （部隊全体の完成待ちではありません）
            </dd>
            <dt>評価方法</dt>
            <dd>{squad.stageAssessment.reviewMethod}</dd>
            <dt>根拠</dt>
            <dd>
              <TextList values={squad.stageAssessment.references} />
            </dd>
          </dl>
        </details>
      </section>
      <section className={styles.boardDetail}>
        <label className={styles.label} htmlFor={inputId}>
          担当タスク
        </label>
        <select
          id={inputId}
          value={taskId}
          onChange={(event) => chooseTask(event.target.value)}
        >
          {ownTasks.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} · {statusLabels[item.status]} · {item.title}
            </option>
          ))}
        </select>
        {task && (
          <div className={styles.taskDetail}>
            <h3>
              {task.id}　{task.title}
            </h3>
            <dl className={styles.facts}>
              <dt>記録された状態</dt>
              <dd>
                {statusLabels[task.status]} ·{' '}
                {assignments.get(task.id)?.classification}
              </dd>
              <dt>前提</dt>
              <dd>{taskLinks(task.dependsOn ?? [])}</dd>
              <dt>後続</dt>
              <dd>
                {taskLinks(
                  tasks
                    .filter((item) => item.dependsOn?.includes(task.id))
                    .map((item) => item.id),
                )}
              </dd>
              {task.parentTaskId && (
                <>
                  <dt>親の検収</dt>
                  <dd>{taskLinks([task.parentTaskId])}</dd>
                </>
              )}
              {children.length > 0 && (
                <>
                  <dt>子作業</dt>
                  <dd>
                    {taskLinks(children.map((item) => item.id))}
                    <p className={styles.muted}>
                      子の完了だけで親の全体受入は合格になりません。
                    </p>
                  </dd>
                </>
              )}
            </dl>
            {holds.map((hold) => (
              <div className={styles.warning} key={hold.scope}>
                <strong>実行保留 · {hold.scope}</strong>
                <p>{hold.reason}</p>
                <p>
                  解除条件：{hold.releaseCondition} / {hold.decisionOwner}
                </p>
              </div>
            ))}
            {plan ? (
              <>
                <p>{plan.scope}</p>
                <p className={styles.muted}>
                  {plan.completionScope} {plan.executionBoundary}
                </p>
                <h4>進め方</h4>
                <ol>
                  {plan.steps.map((step) => (
                    <li key={step.id}>{step.action}</li>
                  ))}
                </ol>
                <h4>合格条件</h4>
                <ul>
                  {plan.acceptanceCriteria.map((criterion) => (
                    <li key={criterion.id}>
                      <span className={styles.badge}>
                        {statusLabels[criterion.status] ?? criterion.status}
                      </span>{' '}
                      {criterion.criterion}
                      <details>
                        <summary>確認方法と証拠</summary>
                        <p>{criterion.verification}</p>
                        <TextList values={criterion.evidence} />
                      </details>
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>成果物・入力資料・担当</summary>
                  <dl className={styles.facts}>
                    <dt>成果物</dt>
                    <dd>
                      <TextList
                        values={plan.deliverables.map(
                          (item) =>
                            `${item.path}${item.section ? ` / ${item.section}` : ''} — ${item.description}`,
                        )}
                      />
                    </dd>
                    <dt>入力</dt>
                    <dd>
                      <TextList
                        values={plan.inputs.map(
                          (item) => `${item.path} — ${item.locator}`,
                        )}
                      />
                    </dd>
                    <dt>担当</dt>
                    <dd>
                      {plan.primaryOwner} / {plan.ownerRole} /{' '}
                      {plan.assignee ?? '個人は未割当'}
                    </dd>
                    <dt>未決事項</dt>
                    <dd>{plan.unresolvedDecision}</dd>
                  </dl>
                </details>
              </>
            ) : (
              <p className={styles.muted}>
                過去の進捗記録です。今回、詳細計画や合格条件を再検証したものではありません。
              </p>
            )}
            <details>
              <summary>このタスクの証拠</summary>
              <TextList values={task.evidence ?? []} />
            </details>
          </div>
        )}
      </section>
    </section>
  );
}

function GoalTasks({
  goal,
  taskId,
  onSelect,
}: {
  goal: AmcGoal;
  taskId: string;
  onSelect: (id: string) => void;
}) {
  const task = goal.tasks.find((item) => item.id === taskId) ?? goal.tasks[0];
  return (
    <div className={styles.taskWorkspace}>
      <div className={styles.taskList} aria-label="Goalのタスク">
        {goal.tasks.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={task?.id === item.id}
            onClick={() => onSelect(item.id)}
          >
            <small>
              {item.id} · {statusLabels[item.status]}
            </small>
            <span>{item.title}</span>
          </button>
        ))}
      </div>
      {task && (
        <section className={styles.taskDetail} aria-label="選んだ仕事の詳細">
          <p className={styles.eyebrow}>
            {task.squadId} · {task.id}
          </p>
          <h3>{task.title}</h3>
          <p>{task.scope}</p>
          <dl className={styles.facts}>
            <dt>前提</dt>
            <dd>
              {task.dependsOn.length
                ? task.dependsOn.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={styles.textButton}
                      onClick={() => onSelect(id)}
                    >
                      {id} ·{' '}
                      {
                        statusLabels[
                          goal.tasks.find((item) => item.id === id)?.status ??
                            ''
                        ]
                      }
                    </button>
                  ))
                : 'なし'}
            </dd>
            <dt>作業の境界</dt>
            <dd>{task.executionBoundary}</dd>
            {task.blockReason && (
              <>
                <dt>保留の理由</dt>
                <dd>{task.blockReason}</dd>
              </>
            )}
          </dl>
          {task.holds.length > 0 && (
            <p className={styles.warning}>
              元の実行保留があります。この画面で再開して解除することはできません。
            </p>
          )}
          {task.executionEligibility === 'authority_required' && (
            <p className={styles.warning}>
              別途の権限・本人判断が必要です。保存は実行許可ではありません。
            </p>
          )}
          <h4>進め方</h4>
          <ol>
            {task.steps.map((step) => (
              <li key={step.id}>{step.action}</li>
            ))}
          </ol>
          <h4>完成を確かめる条件</h4>
          <ul>
            {task.acceptanceCriteria.map((criterion) => (
              <li key={criterion.id}>
                {criterion.criterion}{' '}
                <span className={styles.badge}>
                  {statusLabels[criterion.status]}
                </span>
              </li>
            ))}
          </ul>
          <details>
            <summary>成果物・証拠・記録の詳細</summary>
            <TextList
              values={task.deliverables.map(
                (item) =>
                  `${item.path}${item.section ? ` / ${item.section}` : ''} — ${item.description}`,
              )}
            />
            <h4>作業ルール</h4>
            <TextList values={task.rules} />
            <h4>記録された証拠</h4>
            <TextList values={task.evidence} />
            {task.result && <p>{task.result.summary}</p>}
            <p>記録上の実行者：{task.startedBy ?? '未記録'}</p>
            <p>
              未決事項：
              {typeof task.unresolvedDecision === 'string'
                ? task.unresolvedDecision
                : '未登録'}
            </p>
          </details>
        </section>
      )}
    </div>
  );
}

function ManualRecord({
  goal,
  taskId,
  disabled,
  onRecord,
  onDirtyChange,
}: {
  goal: AmcGoal;
  taskId: string;
  disabled: boolean;
  onRecord: (event: AmcEvent) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const task = goal.tasks.find((item) => item.id === taskId);
  const summary = amcSummary(goal);
  const actions: RecordAction[] = [];
  if (task && goal.state !== 'accepted' && goal.state !== 'draft') {
    if (summary.readyTaskIds.includes(task.id)) actions.push('start_task');
    if (task.status === 'running') actions.push('submit_result');
    if (task.status === 'submitted') actions.push('verify_task');
    if (['pending', 'failed'].includes(task.status)) actions.push('block_task');
    if (
      goal.state === 'active' &&
      ['blocked', 'failed'].includes(task.status) &&
      !task.holds.length
    )
      actions.push('resume_task');
  }
  if (goal.state === 'active') actions.push('pause');
  if (goal.state === 'paused') actions.push('resume');
  if (
    goal.state === 'active' &&
    goal.tasks.every((item) => item.status === 'done')
  )
    actions.push('accept_goal');
  const [chosenAction, setChosenAction] = useState<RecordAction | ''>('');
  const action = actions.includes(chosenAction as RecordAction)
    ? (chosenAction as RecordAction)
    : actions[0];
  const [actor, setActor] = useState('');
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [outcome, setOutcome] = useState('');
  const [acceptance, setAcceptance] = useState('');
  const [goalConfirmed, setGoalConfirmed] = useState(false);
  const [criteria, setCriteria] = useState<
    Record<string, { passed: string; evidence: string }>
  >({});
  const [error, setError] = useState('');
  const dirty = Boolean(
    chosenAction ||
    actor ||
    note ||
    evidence ||
    deliverables ||
    outcome ||
    acceptance ||
    goalConfirmed ||
    Object.values(criteria).some(
      (criterion) => criterion.passed || criterion.evidence,
    ),
  );
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const uid = useId();
  const reviewing = action === 'verify_task' || action === 'accept_goal';
  const selectedCriteria =
    action === 'accept_goal'
      ? goal.overallAcceptance.criteria
      : (task?.acceptanceCriteria ?? []);
  const needsEvidence = [
    'submit_result',
    'verify_task',
    'resume_task',
    'accept_goal',
  ].includes(action);
  const needsNote = [
    'submit_result',
    'block_task',
    'resume_task',
    'pause',
  ].includes(action);
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!action || disabled) return;
    if (
      reviewing &&
      selectedCriteria.some(
        (item) =>
          !criteria[item.id]?.passed ||
          !lines(criteria[item.id]?.evidence ?? '').length,
      )
    ) {
      setError('すべての条件について、判定と証拠を記入してください。');
      return;
    }
    const accepted = action === 'accept_goal' || acceptance === 'accepted';
    if (
      reviewing &&
      accepted &&
      selectedCriteria.some((item) => criteria[item.id]?.passed !== 'passed')
    ) {
      setError('未合格の条件があるため、合格として記録できません。');
      return;
    }
    const record: AmcEvent = {
      type: action,
      actor: actor.trim(),
      expectedRevision: goal.revision,
      role:
        action === 'verify_task'
          ? 'reviewer'
          : ['start_task', 'submit_result'].includes(action)
            ? 'worker'
            : 'owner',
    };
    if (
      [
        'start_task',
        'submit_result',
        'verify_task',
        'block_task',
        'resume_task',
      ].includes(action)
    )
      record.taskId = task?.id;
    if (needsEvidence) record.evidence = lines(evidence);
    if (needsNote) {
      if (action === 'submit_result') record.summary = note.trim();
      else record.reason = note.trim();
    }
    if (action === 'submit_result') {
      record.outcome = outcome === 'succeeded' ? 'succeeded' : 'failed';
      record.deliverables = lines(deliverables);
    }
    if (reviewing) {
      record.accepted = accepted;
      record.criterionResults = selectedCriteria.map((item) => ({
        criterionId: item.id,
        passed: criteria[item.id]?.passed === 'passed',
        evidence: lines(criteria[item.id]?.evidence ?? ''),
      }));
    }
    onRecord(record);
  }
  if (!actions.length)
    return (
      <p className={styles.muted}>
        {goal.state === 'draft'
          ? '未承認の計画です。既存AMCで範囲と条件を確認・承認したJSONを読み込んでください。'
          : 'このGoalに記録できる操作はありません。'}
      </p>
    );
  return (
    <details className={styles.manual}>
      <summary>作業・検収を手動で記録する</summary>
      <p className={styles.muted}>
        AIの開始ボタンではありません。実際に行った作業だけを記録してください。検収者の名前と証拠は自己申告で、本人性や証拠の中身の自動検証は行いません。
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={disabled}>
          <label htmlFor={`${uid}-action`}>記録すること</label>
          <select
            id={`${uid}-action`}
            value={action}
            onChange={(event) => {
              setChosenAction(event.target.value as RecordAction);
              setError('');
            }}
          >
            {actions.map((item) => (
              <option value={item} key={item}>
                {actionLabels[item]}
              </option>
            ))}
          </select>
          <label htmlFor={`${uid}-actor`}>
            {action === 'verify_task'
              ? '作業者とは別の検収者名'
              : 'この操作を行った人・担当名'}
          </label>
          <input
            id={`${uid}-actor`}
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            required
            maxLength={200}
            placeholder="例：実装担当A"
          />
          {action === 'submit_result' && (
            <>
              <p className={styles.muted}>
                着手記録と同じ担当名（{task?.startedBy}
                ）で提出します。成功は検収済みという意味ではありません。
              </p>
              <label htmlFor={`${uid}-outcome`}>作業の結果</label>
              <select
                id={`${uid}-outcome`}
                required
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
              >
                <option value="">選んでください</option>
                <option value="succeeded">成果を作成した</option>
                <option value="failed">失敗・未達がある</option>
              </select>
              <label htmlFor={`${uid}-deliverables`}>
                実際の成果物（1行に1つ）
              </label>
              <textarea
                id={`${uid}-deliverables`}
                value={deliverables}
                onChange={(event) => setDeliverables(event.target.value)}
                required={outcome === 'succeeded'}
                rows={3}
                maxLength={16000}
                placeholder={task?.deliverables
                  .map((item) => item.path)
                  .join('\n')}
              />
            </>
          )}
          {needsNote && (
            <>
              <label htmlFor={`${uid}-note`}>
                {action === 'submit_result'
                  ? '成果・残課題の説明'
                  : '理由と、再開に必要なこと'}
              </label>
              <textarea
                id={`${uid}-note`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                required
                rows={3}
                maxLength={8000}
              />
            </>
          )}
          {needsEvidence && (
            <>
              <label htmlFor={`${uid}-evidence`}>
                確認できる証拠の参照先（1行に1つ）
              </label>
              <textarea
                id={`${uid}-evidence`}
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
                required
                rows={3}
                maxLength={16000}
                placeholder="試験結果やレビュー記録のパス・参照先"
              />
            </>
          )}
          {reviewing && (
            <>
              <h4>条件ごとの確認</h4>
              {selectedCriteria.map((criterion, index) => (
                <div className={styles.criterion} key={criterion.id}>
                  <p>{criterion.criterion}</p>
                  <label htmlFor={`${uid}-criterion-${index}`}>判定</label>
                  <select
                    id={`${uid}-criterion-${index}`}
                    required
                    value={criteria[criterion.id]?.passed ?? ''}
                    onChange={(event) =>
                      setCriteria((current) => ({
                        ...current,
                        [criterion.id]: {
                          evidence: current[criterion.id]?.evidence ?? '',
                          passed: event.target.value,
                        },
                      }))
                    }
                  >
                    <option value="">未判定</option>
                    <option value="passed">合格を確認した</option>
                    <option value="failed">不合格・未達</option>
                  </select>
                  <label htmlFor={`${uid}-proof-${index}`}>
                    この条件を確認した証拠
                  </label>
                  <textarea
                    id={`${uid}-proof-${index}`}
                    required
                    rows={2}
                    maxLength={8000}
                    value={criteria[criterion.id]?.evidence ?? ''}
                    onChange={(event) =>
                      setCriteria((current) => ({
                        ...current,
                        [criterion.id]: {
                          passed: current[criterion.id]?.passed ?? '',
                          evidence: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
              ))}
              {action === 'verify_task' ? (
                <>
                  <label htmlFor={`${uid}-acceptance`}>検収結果</label>
                  <select
                    id={`${uid}-acceptance`}
                    required
                    value={acceptance}
                    onChange={(event) => setAcceptance(event.target.value)}
                  >
                    <option value="">選んでください</option>
                    <option value="accepted">すべての条件を満たした</option>
                    <option value="rejected">修正が必要</option>
                  </select>
                </>
              ) : (
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    required
                    checked={goalConfirmed}
                    onChange={(event) => setGoalConfirmed(event.target.checked)}
                  />
                  全タスクとGoal全体の条件・証拠を確認しました。本人の判断として受け入れます。
                </label>
              )}
            </>
          )}
          {action === 'pause' && (
            <p className={styles.warning}>
              これは管理上の停止です。外部で動いているAIや作業は停止できません。
            </p>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <button className={styles.primary} type="submit">
            {actionLabels[action]}
          </button>
        </fieldset>
      </form>
    </details>
  );
}

export function AmcToolRunner({
  initialText = '',
  onOutcome,
  onRunningChange,
  onDirtyChange,
  executionDisabled = false,
}: Props) {
  const [surface, setSurface] = useState<'board' | 'goals'>(
    initialText.trim() ? 'goals' : 'board',
  );
  const [mode, setMode] = useState<'request' | 'review' | 'saved'>(
    initialText.trim() ? 'review' : 'request',
  );
  const [request, setRequest] = useState(initialText);
  const [goalText, setGoalText] = useState(initialText);
  const [intent, setIntent] = useState('');
  const [jobs, setJobs] = useState<WorkJob[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<WorkJob | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsSignin, setNeedsSignin] = useState(false);
  const [retry, setRetry] = useState<Operation | null>(null);
  const [importText, setImportText] = useState('');
  const [importConfirmed, setImportConfirmed] = useState(false);
  const [manualDirty, setManualDirty] = useState(false);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  const callbacks = useRef({ onOutcome, onRunningChange, onDirtyChange });
  const uid = useId();
  useEffect(() => {
    callbacks.current = { onOutcome, onRunningChange, onDirtyChange };
  }, [onOutcome, onRunningChange, onDirtyChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      mutation.current?.abort();
      if (busyRef.current) callbacks.current.onRunningChange?.(false);
      callbacks.current.onDirtyChange?.(false);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/amc', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          jobs?: WorkJob[];
          error?: string;
        };
        if (controller.signal.aborted) return;
        setNeedsSignin(response.status === 401);
        if (!response.ok)
          throw new Error(
            payload.error ||
              (response.status === 401
                ? 'Goalの保存・復元にはログインが必要です。'
                : '保存済みGoalを読み込めませんでした。'),
          );
        if (!Array.isArray(payload.jobs))
          throw new Error('保存データの応答を確認できませんでした。');
        if (controller.signal.aborted) return;
        setJobs(payload.jobs);
        setError('');
      } catch (reason) {
        if (!controller.signal.aborted) setError(message(reason));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/amc?id=${encodeURIComponent(selectedId)}`,
          {
            credentials: 'same-origin',
            cache: 'no-store',
            signal: controller.signal,
          },
        );
        const payload = (await response.json()) as {
          job?: WorkJob;
          error?: string;
        };
        if (controller.signal.aborted) return;
        if (response.status === 401) setNeedsSignin(true);
        if (!response.ok || !payload.job?.amcGoal)
          throw new Error(payload.error || 'このGoalを読み込めませんでした。');
        const saved = {
          ...payload.job,
          amcGoal: validateAmcGoal(payload.job.amcGoal),
        };
        if (controller.signal.aborted) return;
        setSelectedRecord(saved);
        setRetry((pending) => {
          if (!pending) return null;
          const commandId = (
            pending.body.command as { id?: string } | undefined
          )?.id;
          const applies =
            saved.id ===
            (pending.method === 'POST' ? pending.body.id : pending.body.jobId);
          return applies &&
            (pending.method === 'POST' ||
              saved.events.some((event) => event.command.id === commandId))
            ? null
            : pending;
        });
      } catch (reason) {
        if (!controller.signal.aborted) setError(message(reason));
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    })();
    return () => controller.abort();
  }, [selectedId, refresh]);
  const selectedJob =
    selectedRecord?.id === selectedId ? selectedRecord : undefined;
  const goal = selectedJob?.amcGoal;
  const summary = useMemo(() => (goal ? amcSummary(goal) : null), [goal]);
  const effort = useMemo(() => (goal ? amcEffort(goal) : null), [goal]);
  const preview = useMemo(() => {
    if (mode !== 'review' || !goalText.trim() || !intent.trim()) return null;
    try {
      return createAmcGoal('preview', { request, goal: goalText, intent });
    } catch {
      return null;
    }
  }, [mode, request, goalText, intent]);
  const currentTask =
    goal?.tasks.find((item) => item.id === taskId) ?? goal?.tasks[0];
  const disabled =
    busy || loading || detailLoading || executionDisabled || !!retry;
  const dirty =
    (mode !== 'saved' &&
      !!(request.trim() || goalText.trim() || intent.trim())) ||
    manualDirty ||
    !!importText.trim() ||
    !!retry;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, busy]);
  async function perform(operation: Operation) {
    if (busyRef.current || executionDisabled) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const controller = new AbortController();
    mutation.current = controller;
    callbacks.current.onRunningChange?.(true);
    try {
      const response = await fetch('/api/amc', {
        method: operation.method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(operation.body),
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        job?: WorkJob;
        error?: string;
      };
      if (!mounted.current || controller.signal.aborted) return;
      if (response.status === 401) setNeedsSignin(true);
      if (!response.ok)
        throw new SaveError(
          payload.error ||
            (response.status === 409
              ? '別の画面で更新されています。再読込して内容を確認してください。'
              : '記録を保存できませんでした。'),
          response.status,
        );
      if (!payload.job?.amcGoal)
        throw new Error(
          '保存結果を確認できませんでした。同じ記録を再試行してください。',
        );
      const saved = {
        ...payload.job,
        amcGoal: validateAmcGoal(payload.job.amcGoal),
      };
      if (!mounted.current || controller.signal.aborted) return;
      setJobs((current) => [
        saved,
        ...current.filter((job) => job.id !== saved.id),
      ]);
      setSelectedRecord(saved);
      if (selectedId !== saved.id) setDetailLoading(true);
      setSelectedId(saved.id);
      setMode('saved');
      setSurface('goals');
      setRetry(null);
      if (operation.method === 'POST') {
        setTaskId(saved.amcGoal.tasks[0]?.id ?? '');
        setImportText('');
        setImportConfirmed(false);
      }
      const text =
        operation.method === 'POST'
          ? '計画を本人用の履歴に保存しました。実作業は開始していません。'
          : '手動記録を更新しました。外部の作業状態は自動確認していません。';
      setNotice(text);
      callbacks.current.onOutcome?.({
        ok: true,
        text: `${text} ${saved.amcGoal.state === 'accepted' ? 'Goalの受入は本人の手動記録です。' : 'Goalの完成を意味しません。'}`,
      });
    } catch (reason) {
      if (!mounted.current || controller.signal.aborted) return;
      setError(message(reason));
      // A definitive 4xx rejection can be corrected. An uncertain write must
      // reuse the original ID and body until the server result is reconciled.
      setRetry(
        reason instanceof SaveError && reason.status < 500 ? null : operation,
      );
    } finally {
      busyRef.current = false;
      if (mounted.current && !controller.signal.aborted) {
        setBusy(false);
        callbacks.current.onRunningChange?.(false);
      }
    }
  }
  function beginNew() {
    if (
      busy ||
      (dirty &&
        !window.confirm(
          '未保存の依頼・手動記録・読み込み内容を破棄して、新しい依頼を作りますか？ 保存済みGoalは残ります。',
        ))
    )
      return;
    setRequest('');
    setGoalText('');
    setIntent('');
    setImportText('');
    setImportConfirmed(false);
    setManualDirty(false);
    setMode('request');
    setSurface('goals');
    setNotice('');
  }
  function savePlan(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const brief: AmcBrief = { request, goal: goalText, intent };
    try {
      createAmcGoal('preview', brief);
      void perform({
        method: 'POST',
        body: { id: crypto.randomUUID(), brief },
      });
    } catch (reason) {
      setError(message(reason));
    }
  }
  function record(event: AmcEvent) {
    if (!selectedJob || disabled) return;
    void perform({
      method: 'PATCH',
      body: {
        jobId: selectedJob.id,
        revision: selectedJob.revision,
        command: { id: crypto.randomUUID(), action: 'amc_event', event },
      },
    });
  }
  function download(text: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copyPrompt() {
    if (!goal) return;
    try {
      await navigator.clipboard.writeText(amcPrompt(goal));
      if (mounted.current)
        setNotice('指示文をコピーしました。AIには送信していません。');
    } catch {
      if (mounted.current)
        setError(
          'コピーできませんでした。「指示文・バックアップ」から保存してください。',
        );
    }
  }
  function importGoal(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !importConfirmed) return;
    try {
      const imported = validateAmcGoal(JSON.parse(importText));
      void perform({
        method: 'POST',
        body: { id: crypto.randomUUID(), importGoal: imported },
      });
    } catch (reason) {
      setError(`読み込めません：${message(reason)}`);
    }
  }
  function refreshRecords() {
    if (
      manualDirty &&
      !retry &&
      !window.confirm(
        '未保存の手動記録があります。最新状態の再読込で入力が失われる場合があります。続けますか？',
      )
    )
      return;
    setLoading(true);
    if (selectedId) setDetailLoading(true);
    setRefresh((value) => value + 1);
  }
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>SKY TOOL</p>
          <h1>
            AMC <span>部隊とGoalの管理</span>
          </h1>
        </div>
        <button type="button" onClick={beginNew} disabled={busy}>
          新しい依頼
        </button>
      </header>
      <p className={styles.boundary}>{boundary}</p>
      <nav className={styles.tabs} aria-label="AMCの画面">
        <button
          type="button"
          aria-pressed={surface === 'board'}
          onClick={() => setSurface('board')}
        >
          部隊・進捗
        </button>
        <button
          type="button"
          aria-pressed={surface === 'goals'}
          onClick={() => setSurface('goals')}
        >
          依頼・Goal
        </button>
      </nav>
      {(error || retry) && (
        <div className={styles.error} role="alert">
          {error && <p>{error}</p>}
          {retry && (
            <p>
              保存結果が不明な場合があります。入力や元の記録は保持しています。
            </p>
          )}
          <div className={styles.actions}>
            {retry && (
              <button
                type="button"
                disabled={busy || executionDisabled}
                onClick={() => void perform(retry)}
              >
                同じ記録を再試行
              </button>
            )}
            <button
              type="button"
              disabled={busy || loading || detailLoading}
              onClick={refreshRecords}
            >
              保存済み記録を再読込
            </button>
          </div>
        </div>
      )}
      {needsSignin && (
        <p className={styles.warning}>
          <a href="/signin-with-chatgpt?return_to=/amc" target="_top">
            本人用のGoal管理にサインイン
          </a>
          {dirty &&
            ' · 入力途中の内容は未保存です。サインイン前に控えてください。'}
        </p>
      )}
      {notice && <output className={styles.notice}>{notice}</output>}
      {busy && (
        <output className={styles.muted}>
          記録を保存しています。AIを動かしている状態ではありません。
        </output>
      )}
      {executionDisabled && (
        <p className={styles.warning}>
          現在は保存・記録を変更できません。部隊の閲覧と書き出しは利用できます。
        </p>
      )}
      <div hidden={surface !== 'board'}>
        <MissionBoard />
      </div>
      <section hidden={surface !== 'goals'} aria-label="本人用の依頼とGoal">
        <div className={styles.historyBar}>
          <label htmlFor={`${uid}-saved`}>保存したGoal</label>
          <select
            id={`${uid}-saved`}
            value={mode === 'saved' ? selectedId : ''}
            disabled={busy || loading}
            onChange={(event) => {
              if (!event.target.value) return;
              if (
                dirty &&
                !window.confirm(
                  '未保存の依頼・手動記録・読み込み内容を破棄して、保存済みGoalを開きますか？',
                )
              )
                return;
              if (selectedId !== event.target.value) setDetailLoading(true);
              setImportText('');
              setImportConfirmed(false);
              setManualDirty(false);
              setSelectedId(event.target.value);
              setTaskId('');
              setMode('saved');
            }}
          >
            <option value="">
              {loading
                ? '読み込み中…'
                : jobs.length
                  ? `${jobs.length}件の履歴から選ぶ`
                  : '保存済みGoalはありません'}
            </option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title} · {statusLabels[job.amcGoal?.state ?? job.status]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || loading}
            onClick={refreshRecords}
          >
            再読込
          </button>
        </div>
        {mode === 'request' && (
          <section className={styles.request}>
            <p className={styles.eyebrow}>YOUR NEXT GOAL</p>
            <h2>つくりたい、と伝えるだけ。</h2>
            <p>Goalと意図を決めたら、部隊分けと作業の準備はAMCへ。</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!request.trim()) return;
                setGoalText(request);
                setMode('review');
                setError('');
              }}
            >
              <label htmlFor={`${uid}-request`}>何を作りたいですか？</label>
              <textarea
                id={`${uid}-request`}
                rows={5}
                maxLength={8000}
                required
                value={request}
                disabled={busy}
                onChange={(event) => setRequest(event.target.value)}
                placeholder="AMCを、指示するだけで部隊が動くツールにしたい"
              />
              <button type="submit" className={styles.primary} disabled={busy}>
                Goalと意図を確認する
              </button>
            </form>
            <p className={styles.muted}>
              アプリ・ツール・Webなどのソフトウェア試作向けです。既存OS・ハードウェアの計画は「部隊・進捗」で確認できます。
            </p>
          </section>
        )}
        {mode === 'review' && (
          <section className={styles.request}>
            <p className={styles.eyebrow}>確認するのは、この2つ</p>
            <h2>何を、何のために作る？</h2>
            <form onSubmit={savePlan}>
              <fieldset disabled={disabled}>
                <label htmlFor={`${uid}-goal`}>Goal — 何ができたら完成？</label>
                <textarea
                  id={`${uid}-goal`}
                  rows={3}
                  required
                  maxLength={8000}
                  value={goalText}
                  onChange={(event) => setGoalText(event.target.value)}
                />
                <label htmlFor={`${uid}-intent`}>
                  意図 — 誰の、何を良くしたい？
                </label>
                <textarea
                  id={`${uid}-intent`}
                  rows={3}
                  required
                  maxLength={2000}
                  value={intent}
                  onChange={(event) => setIntent(event.target.value)}
                  placeholder="例：毎回細かく指示せず、自分は必要な判断に集中したい"
                />
                <p className={styles.muted}>
                  部隊分けは共通の作業テンプレートです。依頼の細部は、実作業前に確認します。この画面からAIは起動しません。保存後にローカルCodexへ一件ずつ渡せます。
                </p>
                <p className={styles.warning}>
                  準備する範囲はソフトウェアのローカル試作。公開・外部送信・課金・実機操作などは含みません。意図しない目的や範囲は追加しません。
                </p>
                {preview && (
                  <details>
                    <summary>
                      準備する仕事 · {preview.squads.length}役割 /{' '}
                      {preview.tasks.length}工程
                    </summary>
                    <ol>
                      {preview.tasks.map((item) => (
                        <li key={item.id}>{item.title}</li>
                      ))}
                    </ol>
                    <p>全体の受入条件</p>
                    <TextList
                      values={preview.overallAcceptance.criteria.map(
                        (item) => item.criterion,
                      )}
                    />
                  </details>
                )}
                <div className={styles.actions}>
                  <button type="button" onClick={() => setMode('request')}>
                    依頼へ戻る
                  </button>
                  <button type="submit" className={styles.primary}>
                    このGoalと意図で計画を保存
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        )}
        {detailLoading && mode === 'saved' && (
          <output className={styles.muted}>
            選んだGoalの記録を読み込んでいます。
          </output>
        )}
        {mode === 'saved' && goal && summary && (
          <section>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>
                  YOUR GOAL · {statusLabels[goal.state]}
                </p>
                <h2>{goal.requestBrief?.goal ?? goal.instruction}</h2>
              </div>
            </div>
            {goal.requestBrief && <p>{goal.requestBrief.intent}</p>}
            <div className={styles.metrics}>
              <div>
                <strong>
                  {summary.leafCompleted} / {summary.leafTotal}
                </strong>
                <span>実行単位の検収記録</span>
              </div>
              <div>
                <strong>{summary.counts.running}</strong>
                <span>作業中の手動記録</span>
              </div>
              <div>
                <strong>{summary.counts.submitted}</strong>
                <span>別担当の検収待ち</span>
              </div>
              <div>
                <strong>
                  {summary.counts.blocked + summary.counts.failed}
                </strong>
                <span>保留・要修正</span>
              </div>
            </div>
            <p className={styles.muted}>
              件数は製品完成率ではありません。親の受入とGoal全体の受入は別に確認します。
              {goal.requestBrief
                ? '依頼用の役割は既存32部隊とは別です。'
                : '取り込んだ記録は正本32部隊の状態を更新しません。'}
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => void copyPrompt()}
              >
                AIへ渡す指示をコピー
              </button>
              <span className={styles.muted}>送信や実行は行いません</span>
            </div>
            <details>
              <summary>このPCのCodexで作業を進める</summary>
              <p>
                一度に着手可能な作業を1件だけCodexへ渡せます。結果は検収待ちまで記録し、完成の判断は別に行います。
              </p>
              <ol>
                <li>
                  <button
                    type="button"
                    onClick={() =>
                      download(
                        JSON.stringify(goal, null, 2),
                        `amc-goal-${goal.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`,
                        'application/json',
                      )
                    }
                  >
                    Codex用Goalを保存
                  </button>
                </li>
                <li>
                  このプロジェクトのターミナルで、保存したファイルを指定して実行します。
                  <pre className={styles.code}>
                    npm run mission:codex -- run --goal &lt;保存したGoal
                    JSONのパス&gt; --allow-codex-upload
                  </pre>
                </li>
                <li>
                  実行結果の<code>goal-r…-submitted.json</code>
                  を確認し、下の「Codexの結果・既存Goalを読み込む」からファイルを選び、内容を確認して保存します。元のWeb記録とは自動同期しません。同じ元JSONを再実行しないでください。
                </li>
              </ol>
              <p className={styles.muted}>
                このコマンドはGoal内容をCodexへ送信します。秘密情報は含めないでください。Codexが確認を求めた場合や結果が不明な場合はGoalを一時停止して保存します。Webの「着手を記録」はCodexを起動しません。
              </p>
            </details>
            {typeof goal.pauseReason === 'string' && goal.pauseReason && (
              <p className={styles.warning}>停止理由：{goal.pauseReason}</p>
            )}
            <GoalTasks
              goal={goal}
              taskId={currentTask?.id ?? ''}
              onSelect={(id) => {
                if (id === currentTask?.id) return;
                if (
                  manualDirty &&
                  !window.confirm(
                    '未保存の手動記録を破棄して、別のタスクを開きますか？',
                  )
                )
                  return;
                setManualDirty(false);
                setTaskId(id);
              }}
            />
            <ManualRecord
              key={`${selectedJob?.id}-${goal.revision}-${currentTask?.id}`}
              goal={goal}
              taskId={currentTask?.id ?? ''}
              disabled={disabled}
              onRecord={record}
              onDirtyChange={setManualDirty}
            />
            <details>
              <summary>承認範囲・Goal全体の条件</summary>
              <p>
                {goal.approval &&
                typeof goal.approval === 'object' &&
                'coverageStatement' in goal.approval &&
                typeof goal.approval.coverageStatement === 'string'
                  ? goal.approval.coverageStatement
                  : goal.scopeWarning}
              </p>
              <TextList values={goal.rules} />
              <TextList
                values={goal.overallAcceptance.criteria.map(
                  (item) => `${statusLabels[item.status]} · ${item.criterion}`,
                )}
              />
            </details>
            {effort && (
              <details>
                <summary>参考工数（未校正の仮置き）</summary>
                <p>
                  算定できる残作業：{effort.lowerHours}〜{effort.upperHours}
                  人時。未算定：{effort.unestimatedCount}件。
                </p>
                <p className={styles.muted}>{effort.basis}</p>
                <p className={styles.warning}>{effort.warning}</p>
                <ul>
                  {effort.bySquad.map((squad) => (
                    <li key={squad.squadId}>
                      {goal.squads.find((item) => item.id === squad.squadId)
                        ?.name ?? squad.squadId}
                      ：{squad.lowerHours}〜{squad.upperHours}人時 / 未算定
                      {squad.unestimatedCount}件
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <details>
              <summary>指示文・バックアップ</summary>
              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={() =>
                    download(
                      JSON.stringify(goal, null, 2),
                      'amc-goal.json',
                      'application/json',
                    )
                  }
                >
                  Goal JSONを保存
                </button>
                <button
                  type="button"
                  onClick={() =>
                    download(
                      amcPrompt(goal),
                      'amc-instructions.md',
                      'text/markdown',
                    )
                  }
                >
                  指示文を保存
                </button>
              </div>
              <pre className={styles.code}>{amcPrompt(goal)}</pre>
            </details>
            <details>
              <summary>記録履歴 · {goal.eventLog.length}件</summary>
              <ol>
                {goal.eventLog.map((entry) => (
                  <li key={entry.id}>
                    {entry.at ?? '日時未記録'} · {entry.actor} ·{' '}
                    {actionLabels[entry.type as RecordAction] ?? entry.type}
                    {entry.taskId ? ` / ${entry.taskId}` : ''}
                    {entry.summary ? ` — ${entry.summary}` : ''}
                  </li>
                ))}
              </ol>
            </details>
          </section>
        )}
        <details className={styles.import}>
          <summary>Codexの結果・既存Goalを読み込む</summary>
          <p className={styles.muted}>
            本人用の別記録として保存します。元の進捗・証拠・検収を維持しますが、記録の真正性を保証するものではありません。
          </p>
          <form onSubmit={importGoal}>
            <fieldset disabled={disabled}>
              <label htmlFor={`${uid}-import-file`}>
                Goal JSONファイルを選ぶ
              </label>
              <input
                id={`${uid}-import-file`}
                type="file"
                accept=".json,application/json"
                onChange={async (event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  setImportConfirmed(false);
                  try {
                    if (file.size > 1_500_000)
                      throw new Error('Goal JSONは1.5 MB以下にしてください。');
                    const content = await file.text();
                    validateAmcGoal(JSON.parse(content));
                    if (mounted.current) {
                      setImportText(content);
                      setError('');
                    }
                  } catch (reason) {
                    if (mounted.current)
                      setError(`読み込めません：${message(reason)}`);
                  } finally {
                    input.value = '';
                  }
                }}
              />
              <p className={styles.muted}>
                ファイルを選ぶだけでは保存されません。内容を確認してから下のボタンで追加します。
              </p>
              <label htmlFor={`${uid}-import`}>Goal JSON</label>
              <textarea
                id={`${uid}-import`}
                rows={6}
                value={importText}
                required
                maxLength={2000000}
                onChange={(event) => {
                  setImportText(event.target.value);
                  setImportConfirmed(false);
                }}
              />
              <label className={styles.check}>
                <input
                  type="checkbox"
                  required
                  checked={importConfirmed}
                  onChange={(event) => setImportConfirmed(event.target.checked)}
                />
                このJSONの範囲・進捗・証拠が自己申告の記録であることを理解し、本人の保存領域へ追加します。
              </label>
              <button type="submit">内容を検査して別記録に保存</button>
            </fieldset>
          </form>
        </details>
        <p className={styles.storage}>
          保存先はログイン中の本人用サーバー領域です。共有公開はしません。入力途中の内容は未保存です。
        </p>
      </section>
    </div>
  );
}

export default AmcToolRunner;
