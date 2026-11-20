import { env, waitUntil } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { parseNoahFlags } from './noah-flags';
import { createIntakeApi } from './noah-intake-api';

/**
 * Noah の取り込み・接続・依頼が使う実行時の値。環境変数（切り替え・審査者・合図の鍵）を読むのは、ここだけ。
 * 切り替えは、値が `true` の時だけ開く。開けるのは本人（docs/noah/spec-97-launch-ops.md 7 章）。
 */
export function noahIntakeDeps() {
  const config = env as unknown as Record<string, string | undefined>;
  const text = (name: string) => (typeof config[name] === 'string' ? config[name] : undefined);
  return {
    db: database(),
    authenticate: requestUser,
    reviewers: (text('NOAH_REVIEWER_USER_IDS') ?? '').split(',').map((id) => id.trim()).filter(Boolean),
    flags: parseNoahFlags({
      NOAH_PATROL_ENABLED: text('NOAH_PATROL_ENABLED'), NOAH_INTAKE_PUBLIC: text('NOAH_INTAKE_PUBLIC'), NOAH_ASK_FORM: text('NOAH_ASK_FORM'),
      NOAH_PROBE_L2: text('NOAH_PROBE_L2'), NOAH_MODEL_RELAY: text('NOAH_MODEL_RELAY'), NOAH_ASK_LIMITS: text('NOAH_ASK_LIMITS'), NOAH_PATROL_BUDGET: text('NOAH_PATROL_BUDGET'),
    }),
    wakeKey: text('NOAH_PATROL_WAKE_KEY'),
    fetcher: ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)) as typeof fetch,
    now: Date.now,
    defer: waitUntil,
  };
}

export const noahIntakeApi = () => createIntakeApi(noahIntakeDeps());
