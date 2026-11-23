/**
 * Noah の工程を「何を待つか」で段に並べる共通表示。
 *
 * 設計図・棚カード・Agent の説明画面で同じ graph API と見た目を使う。
 * business の能力表はここへ持ち込まず、必要な表示名だけ props で渡す。
 * そのため、Agent の詳細画面は全 business 分類表を読み込まない。
 */
import {
  NOAH_STEP_KINDS,
  noahBlueprintLevels,
  type NoahStep,
  type NoahStepKind,
} from '@/lib/noah-steps';
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

/** Built-in UI のキーと既定の文を受け取り、選択中の言語へ変換する。 */
export type NoahStepLevelTranslate = (key: string, fallback: string) => string;

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
  labels?: Partial<NoahStepLevelLabels> & {
    kind?: Partial<Record<NoahStepKind, string>>;
    tag?: Partial<Record<Exclude<NoahStepKind, 'auto'>, string>>;
  };
  capabilityLabels?: Readonly<Record<string, NoahStepCapabilityLabel>>;
  translate?: NoahStepLevelTranslate;
};

/** 設計図・棚カード・Agent の説明で使う共通の段表示。 */
export function NoahStepLevels<T extends NoahStep>({
  steps,
  labels,
  capabilityLabels = {},
  translate,
}: NoahStepLevelsProps<T>) {
  const base: NoahStepLevelLabels = {
    ...DEFAULT_LABELS,
    ...labels,
    kind: { ...DEFAULT_LABELS.kind, ...labels?.kind },
    tag: { ...DEFAULT_LABELS.tag, ...labels?.tag },
  };
  const t = translate ?? ((_key: string, fallback: string) => fallback);
  const text: NoahStepLevelLabels = {
    ...base,
    ariaLabel: t('levels.ariaLabel', base.ariaLabel),
    levelLabel: (level) => t('levels.level', base.levelLabel(level)),
    kindLabel: t('step.kindLabel', base.kindLabel),
    kind: Object.fromEntries(
      NOAH_STEP_KINDS.map((kind) => [
        kind,
        t(`step.kind.${kind}`, base.kind[kind] ?? kind),
      ]),
    ) as Record<NoahStepKind, string>,
    tag: Object.fromEntries(
      (['tap', 'human', 'review'] as const).map((kind) => [
        kind,
        t(`step.tag.${kind}`, base.tag[kind] ?? kind),
      ]),
    ) as Record<Exclude<NoahStepKind, 'auto'>, string>,
    reasonLabel: t('step.reasonLabel', base.reasonLabel),
    waitsLabel: t('step.waitsLabel', base.waitsLabel),
    noWaits: t('step.noWaits', base.noWaits),
    waitReasonLabel: t('step.waitReasonLabel', base.waitReasonLabel),
    capabilityLabel: t('step.capabilityLabel', base.capabilityLabel),
    costLabel: (yen) => t('step.costLabel', base.costLabel(yen)),
  };
  const levels = noahBlueprintLevels(steps),
    label = new Map(steps.map((s) => [s.id, s.label]));
  return (
    <ol className={styles.levels} aria-label={text.ariaLabel}>
      {levels.map((level, index) => (
        <li key={index} className={styles.level}>
          <span
            className={styles.number}
            aria-label={text.levelLabel(index + 1)}
          >
            {index + 1}
          </span>
          <div className={styles.steps}>
            {level.map((s) => {
              const capability = s.capability
                ? capabilityLabels[s.capability]
                : undefined;
              return (
                <details
                  key={s.id}
                  className={styles.step}
                  data-person={s.kind === 'auto' ? undefined : 'true'}
                >
                  <summary>
                    {s.kind !== 'auto' && (
                      <span className={styles.tag}>{text.tag[s.kind]}</span>
                    )}
                    {s.label}
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
                        <dt>{t('step.costHeading', '費用の目安')}</dt>
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
