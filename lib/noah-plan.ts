/**
 * 本人の料金（task 113）。つなげるカードの数を、無料 6・有料 50 にする時に使う（docs/noah/spec-110-shelf.md の 8 章）。
 *
 * どの利用権を「有料」と見るかは、本人が決める（値段・月額に含めるか・既存のどの月額の型か）。決まるまで、読み方（NOAH_PLAN_SOURCE）は置かない。
 * 読み方が無い間は、切り替え NOAH_PLAN_LIMITS を開けても、料金ごとの数は使わない（全員を無料に倒さない。今の上限 50 のまま）。
 * 決まったら、ここの 1 か所に、本人の利用権を読む関数を置く（新しい課金の型は作らない）。
 */
import { NOAH_PLAN_CARDS, type NoahPlan } from './noah-shelf.ts';

/** 本人が有料なら true。 */
export type NoahPlanSource = (owner: string) => Promise<boolean>;
/** 料金ごとの数を使うか（切り替え）と、本人の料金の読み方。 */
export type NoahPlanLimits = { open: boolean; source: NoahPlanSource | null };

/** 本人が決めるまで、置かない。 */
export const NOAH_PLAN_SOURCE: NoahPlanSource | null = null;

/** 料金ごとの数を使うのは、切り替えが開いていて、読み方がある時だけ。 */
export const noahPlanActive = (limits: NoahPlanLimits | undefined): limits is { open: true; source: NoahPlanSource } => !!limits && limits.open && limits.source !== null;

export async function noahPlanOf(source: NoahPlanSource, owner: string): Promise<NoahPlan> {
  return (await source(owner)) ? 'paid' : 'free';
}

/** 「つながっているもの」の見出しに添える文。 */
export const noahPlanCardsText = (live: number, plan: NoahPlan) => `${NOAH_PLAN_CARDS[plan]} 個のうち ${live} 個`;

/**
 * つないでいるカードの数（docs/contracts/noah-shelf-queries-v1.sql の live_cards。:owner を ? に置き換えただけ）。同じカードの中の接続は、1 と数える。
 */
export const NOAH_LIVE_CARDS = `SELECT COUNT(DISTINCT COALESCE(p.package_id, c.id)) AS live_cards
  FROM noah_connections c LEFT JOIN noah_package_connections p ON p.connection_id = c.id
 WHERE c.owner_id = ? AND c.disconnected_at IS NULL`;
/** 本人が、そのカードの中で、もう切っていない接続を持っているか（あれば、新しい接続はカードの数を増やさない）。 */
export const NOAH_SAME_PACKAGE = `SELECT 1 AS ok FROM noah_package_connections p JOIN noah_connections c ON c.id = p.connection_id
 WHERE c.owner_id = ? AND c.disconnected_at IS NULL AND p.package_id = ? LIMIT 1`;
/** カードから始めた接続か: そのカードが確かめた物で、この系列を工程に持つ時だけ、カードの中の接続として数える。 */
export const NOAH_CARD_OF_FAMILY = `SELECT 1 AS ok FROM noah_package_steps s JOIN noah_packages p ON p.id = s.package_id
 WHERE s.package_id = ? AND s.kind = 'family' AND s.ref = ? AND p.status = 'verified' LIMIT 1`;
