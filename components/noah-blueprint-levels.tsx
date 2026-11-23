/**
 * 工程を「何を待つか」で段に並べた図（task 122）。
 * 本人の評価（2026-11-22）「（この図は）いいとおもう。でもエージェントのピン画像にはわかりにくすぎる、遷移先の説明画面ならいい」。だから、ピンの絵には使わず、説明画面だけで使う。
 * 横に並ぶ工程は同時に進む。点線の枠と「本人」の印は、本人の工程（human・tap・review）。押すと、種類・理由・待つ物・待つ理由が開く。
 * 状態を持たない（サーバーで描ける）。進み具合（終わった工程・今の工程）は、会社で回す仕組み（task 122 の 3 段目）が出来てから足す。
 */
import { NOAH_CAPABILITIES, noahBlueprintLevels, type NoahBlueprintStep, type NoahStepKind } from '@/lib/noah-business';
import styles from './noah-blueprint-levels.module.css';

const KIND: Record<NoahStepKind, string> = {
  auto: 'Noah が最後までやる',
  tap: 'Noah が用意し、本人が確かめて押す',
  human: '本人にしかできない',
  review: '本人が中身を確かめる',
};
const TAG: Record<Exclude<NoahStepKind, 'auto'>, string> = { tap: '本人が押す', human: '本人', review: '本人が確かめる' };

export default function NoahBlueprintLevels({ steps }: { steps: readonly NoahBlueprintStep[] }) {
  const levels = noahBlueprintLevels(steps), label = new Map(steps.map((s) => [s.id, s.label]));
  return (
    <ol className={styles.levels} aria-label="工程の段（横に並ぶ工程は同時に進む）">
      {levels.map((level, index) => (
        <li key={index} className={styles.level}>
          <span className={styles.number} aria-label={`${index + 1} 段目`}>{index + 1}</span>
          <div className={styles.steps}>
            {level.map((s) => (
              <details key={s.id} className={styles.step} data-person={s.kind === 'auto' ? undefined : 'true'}>
                <summary>{s.kind !== 'auto' && <span className={styles.tag}>{TAG[s.kind]}</span>}{s.label}</summary>
                <dl className={styles.facts}>
                  <dt>種類</dt><dd>{KIND[s.kind]}</dd>
                  {s.reason && <><dt>本人が入る理由</dt><dd>{s.reason}</dd></>}
                  <dt>待つ物</dt><dd>{s.after?.length ? s.after.map((id) => label.get(id) ?? id).join('・') : 'なし（最初から始められる）'}</dd>
                  {s.waitNote && <><dt>待つ理由</dt><dd>{s.waitNote}</dd></>}
                  {s.capability && <><dt>使う能力</dt><dd>{NOAH_CAPABILITIES[s.capability].label}</dd></>}
                  {s.costYen ? <><dt>費用の目安</dt><dd>月 {s.costYen.toLocaleString('ja-JP')} 円</dd></> : null}
                </dl>
              </details>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
