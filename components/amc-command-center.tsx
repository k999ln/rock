'use client';

import { amcSummary, type AmcGoal } from '@/lib/amc-tool';
import styles from './amc-command-center.module.css';

export default function AmcCommandCenter({
  goal,
  saved,
  onTask,
}: {
  goal?: AmcGoal;
  saved: boolean;
  onTask: (id: string) => void;
}) {
  if (!goal)
    return (
      <section className={styles.root} aria-label="司令部のGoal">
        <span className={styles.label}>COMMAND / 司令部</span>
        <h2>Goalを決めて、部隊を動かす。</h2>
        <p className={styles.intent}>
          達成すること・守る方針・完了条件を定め、依存と競合のない任務を同時に進めます。
        </p>
        <p className={styles.runtime}>
          現在のGoalは未選択です。依頼・Goalから作成または選択してください。参照用の部隊一覧は実行状態ではありません。
        </p>
      </section>
    );
  const summary = amcSummary(goal);
  const active = goal.tasks.filter((t) => t.status === 'running');
  const review = goal.tasks.filter((t) => t.status === 'submitted');
  const ready = goal.tasks.filter((t) => summary.readyTaskIds.includes(t.id));
  const held = goal.tasks.filter(
    (t) =>
      t.status === 'blocked' ||
      t.status === 'failed' ||
      t.holds.length ||
      t.scopeReviewRequired ||
      t.executionEligibility === 'authority_required',
  );
  const intent = goal.skyBrief?.intent ?? goal.requestBrief?.intent;
  function missions(tasks: AmcGoal['tasks'], empty: string) {
    return tasks.length ? (
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <button type="button" onClick={() => onTask(task.id)}>
              <span>
                {task.squadId} · {task.id}
              </span>
              {task.title}
            </button>
            {task.blockReason && <p>{task.blockReason}</p>}
          </li>
        ))}
      </ul>
    ) : (
      <p className={styles.empty}>{empty}</p>
    );
  }
  return (
    <section className={styles.root} aria-label="司令部のGoalと部隊状況">
      <header>
        <span className={styles.label}>COMMAND / 司令部</span>
        <span className={styles.source}>
          {saved
            ? `保存済み記録 · r${goal.revision}`
            : '計画原本 · 実行記録ではありません'}
        </span>
      </header>
      <h2>{goal.instruction.split('。')[0] || goal.instruction}</h2>
      {intent && <p className={styles.intent}>{intent}</p>}
      <div className={styles.chain} aria-label="AMCの指揮系統">
        <span>Goal・方針を固定</span>
        <b>→</b>
        <span>独立した任務を並列に分配</span>
        <b>→</b>
        <span>成果を照合・次の指示</span>
      </div>
      <div className={styles.metrics}>
        <div>
          <strong>{goal.squads.length}</strong>
          <span>編成部隊</span>
        </div>
        <div>
          <strong>
            {active.length} / {goal.maxParallel}
          </strong>
          <span>着手記録 / 設定枠</span>
        </div>
        <div>
          <strong>{review.length}</strong>
          <span>成果の検収待ち</span>
        </div>
        <div>
          <strong>
            {summary.completed} / {summary.total}
          </strong>
          <span>検収済み任務</span>
        </div>
      </div>
      <p className={styles.runtime}>
        ブラウザーからの部隊起動・自動同期は未接続です。ローカルの並列実行処理は検証段階で、この画面では実稼働を確認できません。
      </p>
      <div className={styles.columns}>
        <section>
          <h3>進行中の部隊</h3>
          {missions(active, '着手記録はありません。')}
          {active.length > 0 && (
            <p className={styles.empty}>
              記録上の状態です。プロセスの稼働は未確認。
            </p>
          )}
        </section>
        <section>
          <h3>次に着手できる任務</h3>
          {missions(
            ready,
            goal.state === 'draft'
              ? 'Goalと範囲の承認後に、依存関係と競合を照合します。'
              : '先行任務の検収・保留・同時実行枠を確認してください。',
          )}
        </section>
        <section>
          <h3>司令部の確認</h3>
          {missions(
            [...review, ...held].slice(0, 3),
            '検収待ち・保留の記録はありません。',
          )}
          {review.length + held.length > 3 && (
            <details>
              <summary>残り{review.length + held.length - 3}件を表示</summary>
              {missions([...review, ...held].slice(3), '')}
            </details>
          )}
        </section>
      </div>
      <details>
        <summary>守る方針とGoalの完了条件</summary>
        <h3>Goalの全文</h3>
        <p className={styles.intent}>{goal.instruction}</p>
        <h3>方針</h3>
        <ul>
          {goal.rules.map((rule, i) => (
            <li key={i}>{rule}</li>
          ))}
        </ul>
        <h3>完了条件</h3>
        <ul>
          {goal.overallAcceptance.criteria.map((c) => (
            <li key={c.id}>{c.criterion}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
