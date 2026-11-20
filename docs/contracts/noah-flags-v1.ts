/**
 * Noah の切り替え（環境変数）を読む。閉じている物は、無い物として動く。値の形が違う時は、閉じた側・既定の数に倒す。
 *
 * Design contract only. 環境変数そのものを読むのは lib/*-server.ts だけ。ここは、渡された値を解釈する純関数。
 * 開けるのは本人（AGENTS.md §6）。開け方と戻し方は docs/noah/spec-97-launch-ops.md。
 */
import { NOAH_ASK_LIMITS } from './noah-form-v1.ts';
import { NOAH_PATROL_BUDGET } from './noah-intake-v1.ts';

export type NoahFlags = {
  /** NOAH_PATROL_ENABLED: 台帳の巡回と握手（Noah から外への、定期の通信）を行う。 */
  patrol: boolean;
  /** NOAH_INTAKE_PUBLIC: 取り込んだ Agent の一覧と詳細を、誰にでも見せる。閉じている間は審査者だけ。 */
  intakePublic: boolean;
  /** NOAH_ASK_FORM: 接続と、入力欄で頼むことを、誰にでも許す。閉じている間は審査者だけ。 */
  askForm: boolean;
  /** NOAH_PROBE_L2: 握手の後、読み取りだけの道具を Noah が自動で 1 回呼ぶ（見本）。ローンチの既定は閉。 */
  probeL2: boolean;
  /** NOAH_MODEL_RELAY: 1 文で頼む。off は無し。test は固定の応答（審査者だけ）。ローンチの既定は off。 */
  modelRelay: 'off' | 'test';
  askLimits: typeof NOAH_ASK_LIMITS;
  patrolBudget: typeof NOAH_PATROL_BUDGET;
  /** 読めなかった値の説明。運営の画面に出す。 */
  warnings: string[];
};

const on = (value: string | undefined) => value === 'true';

/** 数の上書き。JSON の object で、知っている項目の、1 以上 100,000 以下の整数だけを採る。それ以外は既定のまま。 */
function numbers<T extends Record<string, number>>(name: string, raw: string | undefined, defaults: T, warnings: string[]): T {
  if (raw === undefined || raw === '') return { ...defaults };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnings.push(`${name} を読めません。既定の数を使います。`);
    return { ...defaults };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    warnings.push(`${name} の形が違います。既定の数を使います。`);
    return { ...defaults };
  }
  const out: Record<string, number> = { ...defaults };
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Object.hasOwn(defaults, key)) warnings.push(`${name} の ${key} は、知らない項目です。`);
    else if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100_000) warnings.push(`${name} の ${key} は、1 以上 100000 以下の整数にしてください。既定の数を使います。`);
    else out[key] = value;
  }
  return out as T;
}

export function parseNoahFlags(env: Record<string, string | undefined>): NoahFlags {
  const warnings: string[] = [];
  for (const name of ['NOAH_PATROL_ENABLED', 'NOAH_INTAKE_PUBLIC', 'NOAH_ASK_FORM', 'NOAH_PROBE_L2']) {
    const value = env[name];
    if (value !== undefined && value !== '' && value !== 'true' && value !== 'false') warnings.push(`${name} は true か false です。閉じた物として扱います。`);
  }
  const relay = env.NOAH_MODEL_RELAY;
  if (relay !== undefined && relay !== '' && relay !== 'off' && relay !== 'test') warnings.push('NOAH_MODEL_RELAY は off か test です。off として扱います。');
  return {
    patrol: on(env.NOAH_PATROL_ENABLED),
    intakePublic: on(env.NOAH_INTAKE_PUBLIC),
    askForm: on(env.NOAH_ASK_FORM),
    probeL2: on(env.NOAH_PROBE_L2),
    modelRelay: relay === 'test' ? 'test' : 'off',
    askLimits: numbers('NOAH_ASK_LIMITS', env.NOAH_ASK_LIMITS, NOAH_ASK_LIMITS, warnings),
    patrolBudget: numbers('NOAH_PATROL_BUDGET', env.NOAH_PATROL_BUDGET, NOAH_PATROL_BUDGET, warnings),
    warnings,
  };
}

/**
 * その人に見せてよいか・使わせてよいか。閉じていても、審査者（NOAH_REVIEWER_USER_IDS）は使える。
 * 本番で、一般に開ける前の受入（docs/noah/spec-90-phone-only-loop.md）に使う。
 */
export function noahAllowed(flags: NoahFlags, feature: 'list' | 'ask', reviewer: boolean): boolean {
  return reviewer || (feature === 'list' ? flags.intakePublic : flags.askForm && flags.intakePublic);
}
