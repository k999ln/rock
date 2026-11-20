/**
 * つなぐ相手（取り込んだ系列）と、本人の今の状態を読み、接続計画を作る。
 * 計画の API（lib/noah-connect-plan-api.ts）と、接続（lib/noah-connect.ts）が、同じ関数を通る（画面に出した計画と、接続の時の計画が、同じ計算になる）。
 *
 * ローンチの範囲: 相手は、取り込んだ系列（相手のサーバーで動く物）だけ。今ある Agent（家の端末）の接続要件（connectForPin）と、
 * 端末・利用権・相手の許可の読み取りは、出した後に足す。ここは、何も書かない。権限も利用権も与えない。
 * 仕様: docs/noah/spec-96-connect-plan.md の 4.4・5.1・9.3・9.4、spec-74-one-click-connect.md の 11.3。
 */
import { parseNoahConnect, type NoahConnect } from './noah-connect-requirements.ts';
import { noahPlanSha256, planNoahConnection, type NoahPlan, type NoahPlanState } from './noah-connect-plan.ts';
import type { IntakeDb } from './noah-intake-db.ts';
import { noahListing, type NoahListing, type NoahListingInput } from './noah-intake-listing.ts';

/** 取り込んだ物の権限。入力を受け取り、成果を返すだけ（追加の確認なしで通す。NOAH_SILENT_PERMISSIONS）。 */
export const NOAH_INTAKE_PERMISSIONS: readonly string[] = ['read_user_input', 'write_results'];

/** 動く所の 1 行。画面にそのまま出す。 */
export function noahPlaceLabel(place: NoahPlan['place'], host: string | null): string | null {
  if (place === 'provider') return `相手のサーバー${host ? `（${host}）` : ''}`;
  return place === 'home' ? '自分の端末' : null;
}

/** 相手のサーバーの接続先（URL と host）。相手のサーバーの口でない・URL を読めない時は null。 */
export function noahProviderTarget(connect: NoahConnect): { url: string; host: string } | null {
  if (connect.mouth !== 'mcp-remote' || !('url' in connect.target)) return null;
  try {
    return { url: connect.target.url, host: new URL(connect.target.url).hostname.toLowerCase() };
  } catch {
    return null;
  }
}

/** つなぐ相手: 系列と、その代表の候補と、握手の記録。 */
export type NoahSubject = {
  /** 系列の ID（接続の agentId・family_key）。 */
  familyId: string;
  candidateId: string;
  name: string;
  /** つなぐ版（代表の候補の record_sha256）。 */
  digest: string;
  /** 接続試験の深さ（握手の表の level）。握手の記録が無ければ 0。 */
  level: 0 | 1 | 2;
  /** 一覧に載せているか（noahListing）。載せていない物は、つなげない。 */
  listing: NoahListing;
  /** 接続要件と接続先。下書きを作れなかった候補・相手のサーバーの口でない候補は null。 */
  target: null | { connect: NoahConnect; connectJson: string; connectSha256: string; url: string; host: string };
};

type SubjectRow = {
  id: string; representative_id: string; withdrawn_at: number | null; hidden_at: number | null;
  name: string; source: NoahListingInput['source']; state: NoahListingInput['candidateState']; record_sha256: string;
  mouth: NonNullable<NoahListingInput['check']>['mouth'] | null; setup: number | null; auth: NonNullable<NoahListingInput['check']>['auth'] | null;
  result: string | null; level: 0 | 1 | 2 | null; form_tools: number | null; one_tap_tools: number | null;
  connect_json: string | null; connect_sha256: string | null;
};
const SUBJECT = `SELECT f.id,f.representative_id,f.withdrawn_at,f.hidden_at,c.name,c.source,c.state,c.record_sha256,
 k.mouth,k.setup,k.auth,k.result,k.level,k.form_tools,k.one_tap_tools,k.connect_json,k.connect_sha256
 FROM noah_intake_families f JOIN noah_intake_candidates c ON c.id=f.representative_id LEFT JOIN noah_intake_checks k ON k.candidate_id=c.id WHERE f.id=?`;

/** 系列の ID から、つなぐ相手を読む。無ければ null。 */
export async function readNoahSubject(db: IntakeDb, familyId: string): Promise<NoahSubject | null> {
  const row = await db.prepare(SUBJECT).bind(familyId).first<SubjectRow>();
  if (!row) return null;
  const listing = noahListing({
    source: row.source, familyId: row.id, candidateState: row.state, withdrawn: row.withdrawn_at !== null, hidden: row.hidden_at !== null,
    check: row.mouth && row.auth ? { mouth: row.mouth, setup: !!row.setup, auth: row.auth, result: row.result ?? 'unchecked', level: row.level ?? 0, formTools: row.form_tools, oneTapTools: row.one_tap_tools } : null,
  });
  let target: NoahSubject['target'] = null;
  if (row.connect_json && row.connect_sha256) {
    try {
      const connect = parseNoahConnect(JSON.parse(row.connect_json));
      const found = noahProviderTarget(connect);
      if (found) target = { connect, connectJson: row.connect_json, connectSha256: row.connect_sha256, ...found };
    } catch { /* 読めない接続要件は、つなげない物として扱う（下で target が null のまま）。 */ }
  }
  return { familyId: row.id, candidateId: row.representative_id, name: row.name, digest: row.record_sha256, level: row.level ?? 0, listing, target };
}

/**
 * 本人の状態（ローンチ版。spec-96 の 9.3）。取り込んだ系列は、無料で、端末も相手の許可も見ない。
 * 一覧の各項目（lib/noah-intake-store.ts）も、同じ関数で計算する（一覧の印と、計画の API の印が、ずれない）。
 */
export function noahLaunchPlanState(input: { signedIn: boolean; connectSha256: string; level: 0 | 1 | 2; consentedSha256: string | null }): NoahPlanState {
  return {
    signedIn: input.signedIn, entitlement: 'free', price: { model: 'free' }, hasPaymentMethod: false,
    devices: [], cloudEnabled: false, ownAccountReady: false, grantedServices: [], serviceRegistration: {},
    consentedSha256: input.consentedSha256, connectSha256: input.connectSha256,
    permissions: [...NOAH_INTAKE_PERMISSIONS], preference: 'auto', intakeLevel: input.level,
  };
}

/** つなげる相手（接続要件と接続先がある物）。 */
export type NoahConnectableSubject = NoahSubject & { target: NonNullable<NoahSubject['target']> };

/**
 * 本人の状態を集める。前に同意した接続要件は、その本人の、同じ系列の切っていない接続から読む。
 * 呼ぶ側が、その接続をもう読んでいる時は、consented で渡す（無い時は null。渡さなければ、ここで読む）。
 */
export async function planStateFor(deps: { db: IntakeDb }, owner: string | null, subject: NoahConnectableSubject, consented?: string | null): Promise<NoahPlanState> {
  const consentedSha256 = consented !== undefined || owner === null ? consented ?? null
    : (await deps.db.prepare('SELECT connect_sha256 FROM noah_connections WHERE owner_id=? AND family_key=? AND disconnected_at IS NULL').bind(owner, subject.familyId).first<{ connect_sha256: string }>())?.connect_sha256 ?? null;
  return noahLaunchPlanState({ signedIn: owner !== null, connectSha256: subject.target.connectSha256, level: subject.level, consentedSha256 });
}

/** 計画の API の応答（spec-96 の 5.1）。接続が「条件が変わった」と返す時の、新しい計画も、この形。 */
export type NoahPlanView = {
  agentId: string; digest: string; connectSha256: string; planSha256: string;
  badge: NoahPlan['badge']; cost: NoahPlan['cost']; place: NoahPlan['place']; placeLabel: string | null; deviceId: string | null;
  need: string | null; steps: NoahPlan['steps']; sendsTo: { host: string } | null; price: NoahPlanState['price']; note: string | null;
};

/** つなぐ相手と本人の状態から、計画と、その応答の形を作る。 */
export async function planNoahSubject(
  deps: { db: IntakeDb }, owner: string | null, subject: NoahConnectableSubject, consented?: string | null,
): Promise<{ plan: NoahPlan; view: NoahPlanView }> {
  const state = await planStateFor(deps, owner, subject, consented);
  const plan = planNoahConnection(subject.target.connect, state);
  const view: NoahPlanView = {
    agentId: subject.familyId, digest: subject.digest, connectSha256: subject.target.connectSha256,
    planSha256: await noahPlanSha256(plan, subject.target.connectSha256, state.price),
    badge: plan.badge, cost: plan.cost, place: plan.place, placeLabel: noahPlaceLabel(plan.place, subject.target.host), deviceId: plan.deviceId,
    need: plan.need, steps: plan.steps, sendsTo: plan.place === 'provider' ? { host: subject.target.host } : null, price: state.price, note: null,
  };
  return { plan, view };
}
