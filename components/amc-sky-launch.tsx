'use client';
import integration from '@/data/amc/integration-input-status.json';

import { useId, useState } from 'react';
import plan from '@/data/amc/sky/sky-amc-plan.json';
import detailedSpecs from '@/data/amc/sky-directives-v2.json';
import sourceGoal from '@/data/amc/sky/sky-amc-goal.json';
import { prepareSkyGoal, skyReferencePaths } from '@/scripts/amc-sky-plan.mjs';
import { validateAmcGoal, type AmcGoal } from '@/lib/amc-tool';
import styles from './amc-tool-runner.module.css';

export const skyStarterGoal = validateAmcGoal(prepareSkyGoal(plan, sourceGoal));
const corrections: Record<string, string> = skyReferencePaths;

export default function AmcSkyLaunch({ disabled, onSave, savedGoal, initialTaskId = 'S0-01' }: {
  disabled: boolean;
  savedGoal?: AmcGoal;
  initialTaskId?: string;
  onSave: (goal: AmcGoal) => void;
}) {
  const uid = useId();
  const [squadId, setSquadId] = useState(plan.tasks.find(task => task.id === initialTaskId)?.squadId ?? 'S0');
  const [statusFilter, setStatusFilter] = useState('all');
  const [taskId, setTaskId] = useState(initialTaskId);
  const squad = plan.squads.find((item) => item.id === squadId)!;
  const task = plan.tasks.find((item) => item.id === taskId)!;
  const progress = savedGoal?.skyBrief ? savedGoal : undefined;
  const directives = (progress?.skyDirectives ?? []) as {taskId:string; directiveId:string; status:string; reason:string[]; taskSpecRevision:number; observedAt:string}[];
  const stateOf = (id:string) => {
    const record = progress?.tasks.find(t=>t.id===id);
    const directive = directives.filter(d=>d.taskId===id).at(-1);
    if(directive?.status==='stale') return 'stale';
    return record?.status ?? 'pending';
  };
  const owned = plan.tasks.filter((item) => item.squadId === squadId && (statusFilter==='all' || stateOf(item.id)===statusFilter));
  const detail = detailedSpecs.tasks[taskId as keyof typeof detailedSpecs.tasks];
  const currentDirective = directives.filter(d=>d.taskId===taskId).at(-1);
  function select(id: string) {
    const found = plan.tasks.find((item) => item.id === id);
    if (found) { setSquadId(found.squadId); setTaskId(id); }
  }
  return <section aria-label="Sky完全ローンチ専用計画">
    <p role="note">このmainにはSky計画の参照入力が{integration.missingInputs.length}件未統合です。計画は準備用で、該当任務の実行前に入力の統合・照合が必要です。</p>
    <div className={styles.sectionHeading}>
      <div><p className={styles.eyebrow}>SKY LAUNCH / PLAN {plan.revision}</p>
        <h2>Skyを、ローンチできる状態へ。</h2></div>
      <span className={styles.badge}>受入前</span>
    </div>
    <p>{plan.goal}</p>
    <p className={styles.muted}>12部隊・36件のローンチ準備＋公開後確認1件。原本を保持し、SKY-DIR-002の具体指示を別版で表示します。{progress ? ` 本人の保存済みGoal：${progress.id} / revision ${progress.revision}` : " 原本を閲覧中です。本人の進捗は保存したGoalを選択してください。"}</p>
    <div className={styles.metrics}>
      <div><strong>12</strong><span>Sky専用の部隊</span></div>
      <div><strong>{progress?.tasks.filter(t=>t.status==='done').length ?? 0} / 36</strong><span>{progress ? '本人の受入記録' : '原本の受入記録'}</span></div>
      <div><strong>未検証</strong><span>実Provider・本番</span></div>
      <div><strong>手動照合</strong><span>他担当・共有仕様の更新</span></div>
    </div>
    <p className={styles.warning}>既存コードや過去のテスト成功を、今回のローンチ受入へ繰り越していません。サーバーの最新観測接続は未設定です。着手・提出・検収のAPIは自己申告を拒否し、実行を止めます。</p>
    <div className={styles.actions}>
      <button type="button" className={styles.primary} disabled={disabled} onClick={() => onSave(skyStarterGoal)}>Sky専用Goalを未承認で保存</button>
      <span className={styles.muted}>本人用の記録を作成。AI実行・公開・課金は始まりません。</span>
    </div>
    <p className={styles.label}>最初に確認する作業</p>
    <div className={styles.actions}>{['S0-01', 'S0-02', 'S0-03', 'S10-01'].map((id) =>
      <button type="button" key={id} onClick={() => select(id)}>{id}</button>)}</div>
    <div className={styles.divisions}>
      {plan.groups.map((group) => <section key={group.id}>
        <h3>{group.name}</h3>
        <div className={`${styles.cells} ${styles.skyCells}`}>{plan.squads.filter((item) => item.division === group.id).map((item) =>
          <button type="button" key={item.id} aria-label={`${item.id} ${item.name}`} aria-pressed={squadId === item.id}
            onClick={() => select(item.taskIds[0])}><span>{item.id}</span> {item.name}</button>)}</div>
      </section>)}
    </div>
    <section className={styles.boardDetail} aria-live="polite">
      <h3>{squad.id}　{squad.name}</h3>
      <p>{squad.goal}</p>
      <dl className={styles.facts}>
        <dt>部隊の合格条件</dt><dd>{squad.acceptanceGate}</dd>
        <dt>既存作業との対応</dt><dd>{squad.sourceTaskIds.join(' / ')}</dd>
        <dt>調整する部隊</dt><dd>{squad.relatedSquadIds.join(' / ') || 'なし'}</dd>
      </dl>
      <label className={styles.label} htmlFor={`${uid}-filter`}>保存状態で絞り込み</label>
      <select id={`${uid}-filter`} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
        {[['all','すべて'],['pending','未着手'],['running','進行中'],['blocked','前提・判断待ち'],['stale','指示失効'],['submitted','未検収'],['done','検収済み']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
      {!owned.length && <p>この部隊には該当する作業がありません。</p>}
      <label className={styles.label} htmlFor={`${uid}-task`}>Skyの担当作業</label>
      <select id={`${uid}-task`} value={taskId} onChange={(event) => select(event.target.value)}>
        {owned.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}
      </select>
      <div className={styles.taskDetail}>
        <h3>{task.id}　{task.title}</h3>
        <p>{task.scope}</p>
        <dl className={styles.facts}>
          <dt>対応要求</dt><dd>{task.requirementIds.join(' / ')}</dd>
          <dt>受入状況</dt><dd>{stateOf(task.id)} · {task.requiredForLaunchReady ? 'ローンチ準備' : '公開後の別工程'}</dd>
          <dt>担当範囲</dt><dd>{task.responsibility}</dd>
          <dt>依存作業</dt><dd><div className={styles.actions}>{task.dependsOn.length ? task.dependsOn.map((id) =>
            <button type="button" key={id} onClick={() => select(id)}>{id}</button>) : 'なし'}</div></dd>
          <dt>次のGate</dt><dd>{task.gate}</dd>
          <dt>実行条件</dt><dd>{task.executionBoundary}</dd>
        </dl>
        {currentDirective && <p>指示 {currentDirective.directiveId} / 版 {currentDirective.taskSpecRevision} / 観測 {currentDirective.observedAt} / {currentDirective.status} {currentDirective.reason.join(' / ')}</p>}
        {detail && <section aria-label="担当への具体指示">
          <h4>利用者に現れる違い · 指示仕様 v{detail.revision}</h4><p>{detail.userChange}</p>
          <h4>入力・編集対象</h4><p>読む：{detail.readPaths.join(' / ')}</p><p>編集可能：{detail.writePaths.join(' / ')}</p><p>新設予定：{detail.newPaths.join(' / ')}</p>
          <p>主要関数：{detail.entryPoints.map(p=>`${p.path}: ${p.symbol}`).join(' / ') || '文書・設定を照合'}</p>
          <p>触らない範囲：{detail.doNotChange.join(' / ')}</p>
          <h4>着手条件と判断待ち</h4><p>{detail.startConditions.localWork}</p>
          {detail.startConditions.decisions.map(d=><p key={d.id}>{d.id}: {d.decision} / 担当 {d.owner} / 停止段階 {d.blocksStage} / 解除：{d.releaseEvidence}</p>)}
          <h4>正常・異常・復旧の検証</h4><ul>{detail.testCases.map(c=><li key={c.id}>{c.id}：{c.operationAndExpected}（{c.stage}）</li>)}</ul>
          <h4>提出と検収</h4><p>{detail.submission.path}（新設予定）</p><p>{detail.submission.requiredFields.join(' / ')}</p><p>{detail.reviewerAction}</p>
          <h4>次の引渡し</h4><p>{detail.handoff.toTaskIds.join(' / ')}：{detail.handoff.payload}</p>
        </section>}
        <h4>進め方</h4><ol>{(detail?.steps ?? task.steps).map((step) => <li key={step.id}>{step.action}</li>)}</ol>
        <h4>合格条件</h4><ul>{task.acceptanceCriteria.map((item) => <li key={item.id}>{item.criterion}<p className={styles.muted}>{item.verification}</p></li>)}</ul>
        <h4>成果物</h4><ul>{task.deliverables.map((item) => <li key={item.path}><code>{item.path}</code><p>{item.description}</p></li>)}</ul>
        <details><summary>再利用するコードと過去の記録</summary>
          <p>下記は現行実装の参照先です。今回の合格証拠ではありません。</p>
          <ul>{task.sourceEvidence.map((item) => <li key={item.path}><code>{corrections[item.path] || item.path}</code>
            {corrections[item.path] && <p className={styles.muted}>原資料の {item.path} を訂正。配備設定はローカル用で本番証拠ではありません。</p>}</li>)}</ul>
        </details>
      </div>
    </section>
    <details className={styles.boardDetail}>
      <summary>ローンチまでのGateと公開後確認</summary>
      {plan.gates.map((gate) => <section key={gate.id}>
        <h4>{gate.id} · {gate.name} · 未検証</h4><p>{gate.condition}</p>
        <div className={styles.actions}>{gate.required.map((id) => <button type="button" key={id} onClick={() => select(id)}>{id}</button>)}</div>
      </section>)}
    </details>
    <details className={styles.boardDetail}>
      <summary>方向性・他担当との照合・未決事項</summary>
      <h4>守る方向性</h4><ul>{plan.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
      <h4>照合の手順（現在は手動）</h4>
      {plan.alignmentProtocol.map((item) => <section key={item.id}><h4>{item.name}</h4><p>{item.when}：{item.check}</p><p className={styles.muted}>不一致時：{item.failure}</p></section>)}
      <h4>未決事項</h4><ul>{plan.openDecisions.map((item) => <li key={item.id}>{item.topic}<p>{item.impact}</p><p className={styles.muted}>担当：{item.owner} / 影響：{item.blocks.join(' / ')}</p></li>)}</ul>
      <p className={styles.muted}>他タスクの記録は受領時点の参照情報です。現在の担当・版・進捗を自動取得した表示ではありません。</p>
    </details>
  </section>;
}
