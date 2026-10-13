'use client';

import Link from 'next/link';
import SkyAppOutputSlot from '@/components/sky-app-output-slot';
import { parseFitnessPlan, type FitnessPlan } from '@/lib/sky-fitness-output';
import styles from './sky-fitness-plugin.module.css';

const previewPlan: FitnessPlan = {
  schema: 'sky.fitness.plan/1',
  title: '今週の運動プラン（表示サンプル）',
  sessions: [
    { label: '月曜日', durationMinutes: 30, activities: ['ウォームアップ', 'ウォーキング', 'クールダウン'] },
    { label: '水曜日', durationMinutes: 25, activities: ['軽いストレッチ', '自重エクササイズ'] },
    { label: '土曜日', durationMinutes: 40, activities: ['屋外での運動', 'クールダウン'] },
  ],
  notes: ['このサンプルは実際のAgent結果ではありません。'],
};

function PlanCard({ plan }: { plan: FitnessPlan }) {
  return <article className={styles.plan}>
    <h3>{plan.title}</h3>
    <div className={styles.sessions}>{plan.sessions.map((session, sessionIndex) => <section key={sessionIndex}>
      <div><strong>{session.label}</strong><span>{session.durationMinutes}分</span></div>
      <ul>{session.activities.map((activity, activityIndex) => <li key={activityIndex}>{activity}</li>)}</ul>
    </section>)}</div>
    {plan.notes.length > 0 && <div className={styles.notes}><h4>メモ</h4><ul>{plan.notes.map((note, noteIndex) => <li key={noteIndex}>{note}</li>)}</ul></div>}
    <p className={styles.disclaimer}>Agentの提案を表示する場所です。実際の成果は本人が確認し、体調や環境に合わせて調整してください。</p>
  </article>;
}

export default function SkyFitnessPlugin({ delegationId, preview = false }: { delegationId?: string; preview?: boolean }) {
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/sky" className={styles.brand}>FITNESS <span>× Sky Agent</span></Link>
      <Link href="/sky/outputs">Skyの成果</Link>
    </header>
    <section className={styles.hero}>
      <small>FITNESS / MY SPACE</small>
      <h1>マイプラン</h1>
      <p>Sky Agentが保存したプランを、このアプリで表示します。</p>
    </section>
    <section className={styles.panel} aria-labelledby="fitness-plan-title">
      <div className={styles.panelHead}><div><small>YOUR PLAN</small><h2 id="fitness-plan-title">運動プラン</h2></div><span>Sky成果の表示枠</span></div>
      {preview ? <><p className={styles.preview}>表示サンプル · 保存済み成果やAgent実行ではありません</p><PlanCard plan={previewPlan} /></>
        : !delegationId ? <div className={styles.empty}><strong>まだプランを接続していません</strong><p>Skyの保存済み成果から、フィットネス用のプランを選択できます。</p><Link href="/sky/outputs">Skyの成果から選ぶ →</Link><p><Link href="/fitness?preview=1">画面の表示サンプルを見る</Link></p></div>
        : <SkyAppOutputSlot delegationId={delegationId} returnTo={`/fitness?delegation=${encodeURIComponent(delegationId)}`}>{(documents) => {
          const plans = documents.flatMap((document) =>
            document.truncated || document.omittedNonTextParts > 0 ? []
              : document.artifacts.flatMap((artifact) =>
                artifact.textParts.map(parseFitnessPlan).filter((plan) => plan !== null)));
          if (plans.length === 0) return <div className={styles.empty}><p>このAgent成果はフィットネス用の形式ではありません。Skyで元のテキストを確認できます。</p><Link href="/sky/outputs">Skyの成果へ戻る →</Link></div>;
          return plans.map((plan, index) => <PlanCard key={index} plan={plan} />);
        }}</SkyAppOutputSlot>}
    </section>
  </main>;
}
