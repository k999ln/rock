/**
 * Noah の工程を「何を待つか」で段に並べる共通表示。
 *
 * 設計図・棚カード・Agent の説明画面で同じ graph API と見た目を使う。
 * business の能力表はここへ持ち込まず、必要な表示名だけ props で渡す。
 * そのため、Agent の詳細画面は全 business 分類表を読み込まない。
 */
import { noahBlueprintLevels, type NoahStep, type NoahStepKind } from '@/lib/noah-steps';
import styles from './noah-blueprint-levels.module.css';

const KIND: Record<NoahStepKind, string> = {
  auto: 'Noah が最後までやる',
  tap: 'Noah が用意し、本人が確かめて押す',
  human: '本人にしかできない',
  review: '本人が中身を確かめる',
};
const TAG: Record<Exclude<NoahStepKind, 'auto'>, string> = {
  tap: '本人が押す',
  human: '本人',
  review: '本人が確かめる',
};
const FLOW_LABELS = {
  receives: '受け取る物',
  returns: '返る物',
  none: 'なし',
  unknown: '未確認',
  parallel: '並行',
  collect: 'まとめる',
  review: '確認の関所',
  branch: '分かれる条件',
  repeat: '繰り返す条件',
} as const;
type FlowLabel = (typeof FLOW_LABELS)[keyof typeof FLOW_LABELS];
const unchanged = (label: string) => label;

/** 表示する言葉を Agent 側の言語設定に差し替えるための共通ラベル。 */
export type NoahStepLevelLabels = {
  ariaLabel: string;
  levelLabel: (level: number) => string;
  kindLabel: string;
  kind: Partial<Record<NoahStepKind, string>>;
  tag: Partial<Record<Exclude<NoahStepKind, 'auto'>, string>>;
  reasonLabel: string;
  waitsLabel: string;
  noWaits: string;
  waitReasonLabel: string;
  capabilityLabel: string;
  costLabel: (yen: number) => string;
};

const DEFAULT_LABELS: NoahStepLevelLabels = {
  ariaLabel: '工程の段（横に並ぶ工程は同時に進む）',
  levelLabel: (level) => `${level} 段目`,
  kindLabel: '種類',
  kind: KIND,
  tag: TAG,
  reasonLabel: '本人が入る理由',
  waitsLabel: '待つ物',
  noWaits: 'なし（最初から始められる）',
  waitReasonLabel: '待つ理由',
  capabilityLabel: '使う能力',
  costLabel: (yen) => `月 ${yen.toLocaleString('ja-JP')} 円`,
};

export type NoahStepCapabilityLabel = string | { readonly label: string };
export type NoahStepLevelsProps<T extends NoahStep = NoahStep> = {
  steps: readonly T[];
  /** Agent の画面だけ別言語にする場合に、既定の日本語を上書きする。 */
  labels?: Partial<NoahStepLevelLabels>;
  capabilityLabels?: Readonly<Record<string, NoahStepCapabilityLabel>>;
  flowLabel?: (label: FlowLabel) => string;
  materialLabel?: (material: string) => string;
  /** 'flow' の時は、受け渡しの記録（flow）がある工程だけに「受け取る物 → 返る物」を出す。 */
  showMaterials?: boolean | 'flow';
};

/** 設計図・棚カード・Agent の説明で使う共通の段表示。 */
export function NoahStepLevels<T extends NoahStep>({
  steps,
  labels,
  capabilityLabels = {},
  flowLabel = unchanged,
  materialLabel = unchanged,
  showMaterials = true,
}: NoahStepLevelsProps<T>) {
  const text: NoahStepLevelLabels = {
    ...DEFAULT_LABELS,
    ...labels,
    kind: { ...DEFAULT_LABELS.kind, ...labels?.kind },
    tag: { ...DEFAULT_LABELS.tag, ...labels?.tag },
  };
  const levels = noahBlueprintLevels(steps),
    label = new Map(steps.map((s) => [s.id, s.label]));
  return (
    <ol className={styles.levels} data-noah-step-levels aria-label={text.ariaLabel}>
      {levels.map((level, index) => (
        <li key={index} className={styles.level}>
          <span
            className={styles.number}
            aria-label={text.levelLabel(index + 1)}
          >
            {index + 1}
          </span>
          <div className={styles.steps}>
            {level.length > 1 && <p className={styles.parallel}>{flowLabel(FLOW_LABELS.parallel)}</p>}
            {level.map((s) => {
              const capability = s.capability
                ? capabilityLabels[s.capability]
                : undefined;
              const io = showMaterials === 'flow' ? Boolean(s.flow) : showMaterials;
              const links = io ? s.flow?.dataFrom ?? [] : [];
              const gate = s.kind === 'review' || s.flow?.gate;
              const describe = (items: readonly string[] | undefined) => items
                ? items.map(materialLabel).join('・') || flowLabel(FLOW_LABELS.none)
                : flowLabel(FLOW_LABELS.unknown);
              return (
                <details
                  key={s.id}
                  className={styles.step}
                  data-person={s.kind === 'auto' ? undefined : 'true'}
                >
                  <summary>
                    {links.length > 0 && <span className={styles.transfers}>
                      {links.map(({ from, material }) => (
                        <span className={styles.transfer} key={JSON.stringify([from, material])}>
                          <span className={styles.origin}>{label.get(from)}</span>
                          <span className={styles.wire}>{materialLabel(material)}</span>
                          {gate && <span className={styles.gate}>{flowLabel(FLOW_LABELS.review)}</span>}
                        </span>
                      ))}
                    </span>}
                    <span className={styles.stepTitle}>
                      {s.kind !== 'auto' && <span className={styles.tag}>{text.tag[s.kind]}</span>}
                      {gate && !links.length && <span className={styles.gate}>{flowLabel(FLOW_LABELS.review)}</span>}
                      {new Set(links.map(({ from }) => from)).size > 1 && <span className={styles.tag}>{flowLabel(FLOW_LABELS.collect)}</span>}
                      {s.label}
                    </span>
                    {io && <span className={styles.stepIo}>
                      <span><span className={styles.portLabel}>{flowLabel(FLOW_LABELS.receives)}</span>{describe(s.flow?.inputs)}</span>
                      <span className={styles.stepArrow} aria-hidden="true" />
                      <span><span className={styles.portLabel}>{flowLabel(FLOW_LABELS.returns)}</span>{describe(s.flow?.outputs)}</span>
                    </span>}
                    {s.flow?.branch && <span className={styles.control}><strong>{flowLabel(FLOW_LABELS.branch)}</strong> {s.flow.branch}</span>}
                    {s.flow?.repeat && <span className={styles.control}><strong>{flowLabel(FLOW_LABELS.repeat)}</strong> {s.flow.repeat}</span>}
                  </summary>
                  <dl className={styles.facts}>
                    <dt>{text.kindLabel}</dt>
                    <dd>{text.kind[s.kind] ?? s.kind}</dd>
                    {s.reason && (
                      <>
                        <dt>{text.reasonLabel}</dt>
                        <dd>{s.reason}</dd>
                      </>
                    )}
                    <dt>{text.waitsLabel}</dt>
                    <dd>
                      {s.after?.length
                        ? s.after.map((id) => label.get(id) ?? id).join('・')
                        : text.noWaits}
                    </dd>
                    {s.waitNote && (
                      <>
                        <dt>{text.waitReasonLabel}</dt>
                        <dd>{s.waitNote}</dd>
                      </>
                    )}
                    {s.capability && (
                      <>
                        <dt>{text.capabilityLabel}</dt>
                        <dd>
                          {capability
                            ? typeof capability === 'object'
                              ? capability.label
                              : capability
                            : s.capability}
                        </dd>
                      </>
                    )}
                    {s.costYen ? (
                      <>
                        <dt>費用の目安</dt>
                        <dd>{text.costLabel(s.costYen)}</dd>
                      </>
                    ) : null}
                  </dl>
                </details>
              );
            })}
          </div>
        </li>
      ))}
    </ol>
  );
}
