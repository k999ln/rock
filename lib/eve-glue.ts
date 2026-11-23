/**
 * つなぎ目の変換（eve-glue/1）。
 *
 * エージェント同士の出力と入力は、そのままでは合わない事が多い（調査のエージェントは表を返し、記事のエージェントは指示文を受け取る）。
 * その間を埋めるのが、つなぎ目の変換。エージェントエンジニアリングの中心の部品。
 *
 * 変換は「コード」ではなく、決まった操作の並び（宣言）にする。ここにある解釈器だけが動かすので:
 * - 外へ通信できない・ファイルに書けない・時間が来ても止まらない、という事が、作りの上で起きない。
 * - Workers でも Node でも、同じ結果になる。
 * - 人が手で書いても、Eve が LLM で書いても、同じ固定テストで確かめられる。試験に通った物だけを使う。
 */

export const EVE_GLUE_SCHEMA = 'eve-glue/1';

export type EveGlueOp =
  /** 入力の値をそのまま出力へ置く。 */
  | { op: 'pick'; from: string; as: string }
  /** 決まった値を置く。 */
  | { op: 'const'; as: string; value: string | number | boolean }
  /** 文を組み立てる。{{入力の道}} を値に置き換える。 */
  | { op: 'template'; as: string; text: string }
  /** 一覧の先頭から n 件だけ。 */
  | { op: 'take'; from: string; n: number; as: string }
  /** 一覧の各要素を、新しい項目名に組み替える（fields: 新しい名前 → 要素の中の道）。 */
  | { op: 'map'; from: string; as: string; fields: Readonly<Record<string, string>> }
  /** 一覧（文字・数）をつなげて 1 つの文にする。 */
  | { op: 'join'; from: string; sep: string; as: string }
  /** 文字を数にする（数にならなければ失敗）。 */
  | { op: 'number'; from: string; as: string }
  /** 一覧の件数。 */
  | { op: 'count'; from: string; as: string };

export type EveGlueSpec = {
  schema: typeof EVE_GLUE_SCHEMA;
  ops: readonly EveGlueOp[];
  /** 固定テスト（入力 → 期待する出力）。1 件以上。 */
  tests: readonly { input: unknown; expected: unknown }[];
};

const LIMITS = { ops: 50, tests: 20, text: 4_000, take: 1_000, outputBytes: 64 * 1024, pathParts: 12 } as const;
const PART = /^[A-Za-z0-9_\-ぁ-んァ-ヶ一-龠ー・々]{1,64}$/u;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

export class EveGlueError extends Error {}

/** 道（a.b.0.c）。$out. で始まると、ここまでに作った出力から読む。 */
function parsePath(path: string): { scope: 'in' | 'out'; parts: string[] } {
  if (typeof path !== 'string' || !path) throw new EveGlueError('道が空です。');
  const scope = path.startsWith('$out.') ? 'out' : 'in';
  const parts = (scope === 'out' ? path.slice(5) : path).split('.');
  if (parts.length > LIMITS.pathParts || parts.some((p) => !PART.test(p) || FORBIDDEN.has(p))) throw new EveGlueError(`道が不正です: ${path}`);
  return { scope, parts };
}

function read(root: unknown, parts: readonly string[]): unknown {
  let at: unknown = root;
  for (const p of parts) {
    if (at === null || typeof at !== 'object') return undefined;
    at = Array.isArray(at) ? at[Number(p)] : Object.hasOwn(at as object, p) ? (at as Record<string, unknown>)[p] : undefined;
  }
  return at;
}

function write(root: Record<string, unknown>, parts: readonly string[], value: unknown) {
  let at: Record<string, unknown> = root;
  for (const p of parts.slice(0, -1)) {
    if (!Object.hasOwn(at, p) || at[p] === null || typeof at[p] !== 'object' || Array.isArray(at[p])) at[p] = {};
    at = at[p] as Record<string, unknown>;
  }
  at[parts[parts.length - 1]] = value;
}

/** 形の問題を返す（無ければ null）。動かす前に必ず通す。 */
export function eveGlueProblem(spec: EveGlueSpec): string | null {
  try {
    if (!spec || spec.schema !== EVE_GLUE_SCHEMA) return `${EVE_GLUE_SCHEMA} だけを受け付けます。`;
    if (!Array.isArray(spec.ops) || spec.ops.length < 1 || spec.ops.length > LIMITS.ops) return `操作は 1〜${LIMITS.ops} 個です。`;
    if (!Array.isArray(spec.tests) || spec.tests.length < 1 || spec.tests.length > LIMITS.tests) return `固定テストは 1〜${LIMITS.tests} 件です。`;
    for (const [i, op] of spec.ops.entries()) {
      const at = `ops[${i}]`;
      parsePath(op.as);
      if (parsePath(op.as).scope === 'out') return `${at}: as に $out. は使えません。`;
      switch (op.op) {
        case 'pick': case 'number': case 'count': parsePath(op.from); break;
        case 'const': if (!['string', 'number', 'boolean'].includes(typeof op.value)) return `${at}: 値は文字・数・真偽です。`; break;
        case 'template': {
          if (typeof op.text !== 'string' || op.text.length > LIMITS.text) return `${at}: 文は ${LIMITS.text} 文字までです。`;
          for (const m of op.text.matchAll(/\{\{([^}]*)\}\}/gu)) parsePath(m[1].trim());
          break;
        }
        case 'take': parsePath(op.from); if (!Number.isSafeInteger(op.n) || op.n < 0 || op.n > LIMITS.take) return `${at}: n は 0〜${LIMITS.take} です。`; break;
        case 'map': {
          parsePath(op.from);
          const fields: [string, string][] = Object.entries(op.fields ?? ({} as Record<string, string>));
          if (!fields.length || fields.length > 30) return `${at}: 組み替える項目は 1〜30 個です。`;
          for (const [k, v] of fields) { if (!PART.test(k) || FORBIDDEN.has(k)) return `${at}: 項目名が不正です: ${k}`; parsePath(v); }
          break;
        }
        case 'join': parsePath(op.from); if (typeof op.sep !== 'string' || op.sep.length > 20) return `${at}: つなぐ文字は 20 文字までです。`; break;
        default: return `${at}: 知らない操作です（${(op as { op: string }).op}）。`;
      }
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** 変換を動かす。形が不正・出力が大きすぎる・数にならない時は投げる。 */
export function runEveGlue(spec: EveGlueSpec, input: unknown): Record<string, unknown> {
  const problem = eveGlueProblem(spec);
  if (problem) throw new EveGlueError(problem);
  const out: Record<string, unknown> = {};
  const get = (path: string) => {
    const { scope, parts } = parsePath(path);
    return read(scope === 'out' ? out : input, parts);
  };
  for (const op of spec.ops) {
    const as = parsePath(op.as).parts;
    switch (op.op) {
      case 'pick': write(out, as, structuredClone(get(op.from) ?? null)); break;
      case 'const': write(out, as, op.value); break;
      case 'template':
        write(out, as, op.text.replace(/\{\{([^}]*)\}\}/gu, (_, p: string) => {
          const v = get(p.trim());
          return v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        }));
        break;
      case 'take': { const v = get(op.from); write(out, as, Array.isArray(v) ? structuredClone(v.slice(0, op.n)) : []); break; }
      case 'map': {
        const v = get(op.from);
        write(out, as, (Array.isArray(v) ? v : []).map((item) =>
          Object.fromEntries(Object.entries(op.fields).map(([k, p]) => [k, structuredClone(read(item, parsePath(p).parts) ?? null)]))));
        break;
      }
      case 'join': { const v = get(op.from); write(out, as, (Array.isArray(v) ? v : []).filter((x) => ['string', 'number'].includes(typeof x)).join(op.sep)); break; }
      case 'number': {
        const v = get(op.from);
        const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/[,，円¥\s]/gu, '')) : Number.NaN;
        if (!Number.isFinite(n)) throw new EveGlueError(`数になりません: ${op.from}`);
        write(out, as, n);
        break;
      }
      case 'count': { const v = get(op.from); write(out, as, Array.isArray(v) ? v.length : 0); break; }
    }
  }
  if (new TextEncoder().encode(JSON.stringify(out)).length > LIMITS.outputBytes) throw new EveGlueError(`出力が ${LIMITS.outputBytes} バイトを超えました。`);
  return out;
}

/** キーの順番に左右されない JSON（固定テストの比べ方）。 */
export function eveStableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(eveStableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${eveStableJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

/** 固定テストの結果（1 件ずつ）。 */
export function eveGlueTestResults(spec: EveGlueSpec): { ok: boolean; index: number; reason: string }[] {
  const problem = eveGlueProblem(spec);
  if (problem) return [{ ok: false, index: -1, reason: problem }];
  return spec.tests.map((t, index) => {
    try {
      const got = runEveGlue(spec, t.input);
      const ok = eveStableJson(got) === eveStableJson(t.expected);
      return { ok, index, reason: ok ? '一致' : `期待と違います: ${eveStableJson(got).slice(0, 200)}` };
    } catch (e) {
      return { ok: false, index, reason: e instanceof Error ? e.message : String(e) };
    }
  });
}

export const eveGlueTestsPass = (spec: EveGlueSpec) => eveGlueTestResults(spec).every((r) => r.ok);
