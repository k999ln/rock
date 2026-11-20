/** Noah 接続計画と状態遷移。計画は権限や利用権を発行しない。 */
import { canonicalJson, sha256Hex } from './noah-connect-requirements.ts';
import type { NoahConnect, NoahPlace } from './noah-connect-requirements.ts';

// ---------------------------------------------------------------------------
// 接続計画
// ---------------------------------------------------------------------------

export type NoahPlanState = {
  signedIn: boolean;
  /** その版への本人の利用権。owner は作者本人。 */
  entitlement: 'owner' | 'free' | 'paid' | 'trial' | 'none' | 'revoked';
  price: { model: 'free' | 'one_time'; amountMinor?: number; currency?: string };
  hasPaymentMethod: boolean;
  /** 本人が承認した端末。順は、本人が選んだ既定の端末が先。 */
  devices: { id: string; place: 'home' | 'pocket'; online: boolean }[];
  /** 雲の端末を使えるか（flag と本人の設定）。 */
  cloudEnabled: boolean;
  /** 本人の契約のログインが、家の端末で済んでいるか。 */
  ownAccountReady: boolean;
  /** 既に許可を持っているサービスの id。 */
  grantedServices: string[];
  /** サービスごとに、Noah が client として登録できるか。 */
  serviceRegistration: Record<string, 'available' | 'unavailable'>;
  /** 本人が前に同意した接続要件の hash。 */
  consentedSha256: string | null;
  /** 今の接続要件の hash。 */
  connectSha256: string;
  /** その版が宣言した権限。 */
  permissions: string[];
  preference: 'auto' | 'own_device' | 'cloud_only';
  /** 取り込んだ物の接続試験の深さ。載せた版には無い。 */
  intakeLevel?: 0 | 1 | 2;
};
export type NoahPlanStepKind =
  | 'account' | 'entitlement' | 'place' | 'runtime' | 'model' | 'services' | 'secrets' | 'consent';
export type NoahPlanStep = {
  kind: NoahPlanStepKind;
  /** auto: 何もしない。tap: 1 タップ。typed: 入力・導入・外での用意が要る。 */
  fill: 'auto' | 'tap' | 'typed';
  state: 'satisfied' | 'needed' | 'blocked';
  /** 足りない物の 1 行。画面にそのまま出す。 */
  label?: string;
  serviceId?: string;
};
export type NoahPlanBadge = 'one_click' | 'taps' | 'setup' | 'unverified' | 'blocked';
export type NoahPlan = {
  badge: NoahPlanBadge;
  cost: { taps: number; typed: number };
  place: NoahPlace | null;
  deviceId: string | null;
  steps: NoahPlanStep[];
  /** 最初に足りない物の 1 行。無ければ null。 */
  need: string | null;
  /** blocked の理由。 */
  reason?: string;
};

/** 追加の確認なしで通す権限。入力を受け取り、成果を返すだけの物。 */
export const NOAH_SILENT_PERMISSIONS: readonly string[] = ['read_user_input', 'write_results'];
/** 手数が同じ時の置き場所の順。 */
export const NOAH_PLACE_ORDER: readonly NoahPlace[] = ['provider', 'home', 'cloud', 'pocket'];

const done = (kind: NoahPlanStepKind): NoahPlanStep => ({ kind, fill: 'auto', state: 'satisfied' });
const need = (kind: NoahPlanStepKind, fill: 'tap' | 'typed', label: string, serviceId?: string): NoahPlanStep => ({
  kind, fill, state: 'needed', label, ...(serviceId ? { serviceId } : {}),
});

function stepsFor(req: NoahConnect, s: NoahPlanState, place: NoahPlace): { steps: NoahPlanStep[]; deviceId: string | null } {
  const steps: NoahPlanStep[] = [];
  steps.push(s.signedIn ? done('account') : need('account', 'tap', 'サインイン'));

  if (['owner', 'free', 'paid', 'trial'].includes(s.entitlement) || (s.entitlement === 'none' && s.price.model === 'free')) steps.push(done('entitlement'));
  else steps.push(s.hasPaymentMethod ? need('entitlement', 'tap', '購入') : need('entitlement', 'typed', '支払い方法の登録'));

  let deviceId: string | null = null;
  if (place === 'home' || place === 'pocket') {
    const mine = s.devices.filter((d) => d.place === place);
    const online = mine.find((d) => d.online);
    deviceId = online?.id ?? null;
    if (online) steps.push(done('place'));
    else steps.push(need('place', 'typed', mine.length ? '端末を動かす' : place === 'home' ? '端末を足す' : 'この端末で開く'));
  } else steps.push(done('place'));

  steps.push(done('runtime'));
  steps.push(req.model.use === 'own_account' && !s.ownAccountReady ? need('model', 'typed', '提供元のアカウントにログイン') : done('model'));

  for (const service of req.services) {
    if (!service.required || service.method === 'none' || s.grantedServices.includes(service.id)) continue;
    const tap = service.method === 'oauth' && s.serviceRegistration[service.id] === 'available';
    steps.push(need('services', tap ? 'tap' : 'typed', service.purpose, service.id));
  }
  if (!steps.some((x) => x.kind === 'services')) steps.push(done('services'));

  for (const name of req.secrets) steps.push(need('secrets', 'typed', `${name} を入力`));
  if (!req.secrets.length) steps.push(done('secrets'));

  const silent = s.price.model === 'free' && s.permissions.every((p) => NOAH_SILENT_PERMISSIONS.includes(p));
  steps.push(s.consentedSha256 === s.connectSha256 || silent ? done('consent') : need('consent', 'tap', '権限の確認'));
  return { steps, deviceId };
}

/** 接続要件と本人の今の状態から、足りない物と手数を計算する。権限も利用権も与えない。 */
export function planNoahConnection(req: NoahConnect, s: NoahPlanState): NoahPlan {
  const blocked = (reason: string): NoahPlan => ({
    badge: 'blocked', cost: { taps: 0, typed: 0 }, place: null, deviceId: null, steps: [], need: null, reason,
  });
  if (req.surface === 'own-device') return blocked('本人が使っている端末そのものを操作する物は、つなげません。');
  if (s.entitlement === 'revoked') return blocked('利用権が取り消されています。');

  const allowed = NOAH_PLACE_ORDER.filter((p) => {
    if (!req.places.includes(p)) return false;
    if (p === 'cloud') return s.cloudEnabled && s.preference !== 'own_device';
    if (p === 'home' || p === 'pocket') return s.preference !== 'cloud_only';
    return true;
  });
  if (!allowed.length) return blocked('この Agent が動ける置き場所が、今の設定にありません。');

  let best: { place: NoahPlace; deviceId: string | null; steps: NoahPlanStep[]; taps: number; typed: number } | null = null;
  for (const place of allowed) {
    const { steps, deviceId } = stepsFor(req, s, place);
    const taps = steps.filter((x) => x.state === 'needed' && x.fill === 'tap').length;
    const typed = steps.filter((x) => x.state === 'needed' && x.fill === 'typed').length;
    if (!best || typed < best.typed || (typed === best.typed && taps < best.taps)) best = { place, deviceId, steps, taps, typed };
  }
  const chosen = best!;
  const badge: NoahPlanBadge =
    chosen.typed > 0 ? 'setup'
    : s.intakeLevel !== undefined && s.intakeLevel < 2 ? 'unverified'
    : chosen.taps > 0 ? 'taps'
    : 'one_click';
  return {
    badge,
    cost: { taps: chosen.taps, typed: chosen.typed },
    place: chosen.place,
    deviceId: chosen.deviceId,
    steps: chosen.steps,
    need: chosen.steps.find((x) => x.state === 'needed')?.label ?? null,
  };
}

/** 計画の hash。client が見た計画と、接続の時の計画が同じかを確かめるのに使う。 */
export const noahPlanSha256 = (plan: NoahPlan, connectSha256: string, price: NoahPlanState['price']) =>
  sha256Hex(canonicalJson({ connectSha256, price, place: plan.place, deviceId: plan.deviceId, badge: plan.badge, steps: plan.steps }));

// ---------------------------------------------------------------------------
// 接続の状態遷移（noah_connections.state）
// ---------------------------------------------------------------------------

export const NOAH_CONNECTION_STATES = [
  'planned', 'entitling', 'preparing', 'probing', 'needs_action', 'connected', 'failed', 'unknown', 'blocked', 'disconnected',
] as const;
export type NoahConnectionState = (typeof NOAH_CONNECTION_STATES)[number];
export const NOAH_CONNECTION_EVENTS = [
  'entitle_start', 'entitle_ok', 'entitle_needs_action', 'entitle_revoked', 'prepare_ok', 'prepare_needs_action',
  'prepare_failed', 'probe_ok', 'probe_failed', 'probe_unknown', 'resume', 'retry', 'reconciled_ok',
  'reconciled_failed', 'tools_changed', 'revoked', 'disconnect',
] as const;
export type NoahConnectionEvent = (typeof NOAH_CONNECTION_EVENTS)[number];

const TRANSITIONS: Record<NoahConnectionState, Partial<Record<NoahConnectionEvent, NoahConnectionState>>> = {
  planned: { entitle_start: 'entitling' },
  entitling: { entitle_ok: 'preparing', entitle_needs_action: 'needs_action', entitle_revoked: 'blocked' },
  preparing: { prepare_ok: 'probing', prepare_needs_action: 'needs_action', prepare_failed: 'failed' },
  probing: { probe_ok: 'connected', probe_failed: 'failed', probe_unknown: 'unknown' },
  needs_action: { resume: 'planned' },
  connected: { tools_changed: 'needs_action', revoked: 'blocked' },
  failed: { retry: 'planned' },
  unknown: { reconciled_ok: 'connected', reconciled_failed: 'failed' },
  blocked: {},
  disconnected: {},
};
/** 次の状態を返す。決まっていない組み合わせは null（呼び出し側は 409 を返す）。切るのは、切った後を除いて、いつでもできる。 */
export function nextNoahConnectionState(state: NoahConnectionState, event: NoahConnectionEvent): NoahConnectionState | null {
  if (event === 'disconnect') return state === 'disconnected' ? null : 'disconnected';
  return TRANSITIONS[state][event] ?? null;
}
/** 「頼む」を受け付けてよい状態。 */
export const noahConnectionUsable = (state: NoahConnectionState) => state === 'connected';

