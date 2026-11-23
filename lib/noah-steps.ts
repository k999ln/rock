/**
 * Noah の工程と待つ相手を扱う共通の小さなグラフ層。
 *
 * 設計図・棚のカード・Agent の説明画面は、工程の名前や能力の詳細は
 * それぞれ持つが、「何を待つか」の解釈は同じである。ここには business
 * の分類表や接続先の知識を入れず、工程に必要な最小の形と決まった
 * グラフ操作だけを置く。追加のフィールド（consumes / produces など）を
 * 持つ工程も構造的にそのまま扱える。
 */

/** Noah が扱う工程の種類。auto 以外は本人が関わる工程である。 */
export const NOAH_STEP_KINDS = ['auto', 'tap', 'human', 'review'] as const;
export type NoahStepKind = (typeof NOAH_STEP_KINDS)[number];

/**
 * 待つ相手を持つ工程の共通形。
 *
 * `capability` は business の能力名にも、Agent の道具名にも使えるよう
 * string としている。各利用側は必要なら、より狭い型へ上書きできる。
 */
export type NoahStep = {
  id: string;
  label: string;
  kind: NoahStepKind;
  capability?: string;
  reason?: string;
  account?: string;
  costYen?: number;
  /** この工程を始める前に終わっている工程の id。空なら最初から始められる。 */
  after?: readonly string[];
  /** 待つ相手が必要な理由。決まりきった待ちには付けなくてよい。 */
  waitNote?: string;
};

/**
 * 工程の待つ相手を検査する。
 *
 * after は同じ工程の、配列上で前に並ぶ工程だけを指す。これを境界に
 * することで、入力の並びを壊さず、輪にならない DAG として扱える。
 */
export function noahBlueprintWaitProblem<T extends NoahStep>(
  steps: readonly T[],
): string | null {
  const seen = new Set<string>();
  for (const step of steps) {
    if (!step.after)
      return `「${step.label}」に、何を待つかが書かれていません。`;
    if (new Set(step.after).size !== step.after.length)
      return `「${step.label}」が、同じ工程を 2 回待っています。`;
    const missing = step.after.find((id) => !seen.has(id));
    if (missing)
      return `「${step.label}」が、前に無い工程（${missing}）を待っています。`;
    seen.add(step.id);
  }
  return null;
}

/**
 * 工程を段に分ける。待つ相手がない工程が 1 段目で、同じ段の工程は
 * 同時に進められる。入力工程の追加フィールドと配列の型は保つ。
 */
export function noahBlueprintLevels<T extends NoahStep>(
  steps: readonly T[],
): T[][] {
  const problem = noahBlueprintWaitProblem(steps);
  if (problem) throw Error(problem);
  const level = new Map<string, number>();
  const out: T[][] = [];
  for (const step of steps) {
    const at =
      Math.max(-1, ...(step.after ?? []).map((id) => level.get(id)!)) + 1;
    level.set(step.id, at);
    (out[at] ??= []).push(step);
  }
  return out;
}

/**
 * まだ終わっていない工程のうち、待つ相手がすべて終わった工程を返す。
 * 入力順を保つので、同じ段の表示・実行順を安定させられる。
 */
export function noahBlueprintReady<T extends NoahStep>(
  steps: readonly T[],
  done: ReadonlySet<string>,
): T[] {
  const problem = noahBlueprintWaitProblem(steps);
  if (problem) throw Error(problem);
  return steps.filter(
    (step) =>
      !done.has(step.id) && (step.after ?? []).every((id) => done.has(id)),
  );
}

/**
 * 既に済ませた工程を外し、そこを待っていた工程を、外した工程が待って
 * いた物へつなぎ直す。複数段を外しても、元の順序と重複除去を保つ。
 */
export function noahBlueprintWithout<T extends NoahStep>(
  steps: readonly T[],
  drop: (step: T) => boolean,
): T[] {
  const dropped = new Map<string, readonly string[]>();
  const out: T[] = [];
  const expand = (ids: readonly string[]) => [
    ...new Set(ids.flatMap((id) => dropped.get(id) ?? [id])),
  ];
  for (const step of steps) {
    const after = expand(step.after ?? []);
    if (drop(step)) dropped.set(step.id, after);
    else out.push({ ...step, after });
  }
  return out;
}
