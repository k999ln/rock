import type { NoahConnect } from './noah-connect-requirements.ts';
import type { NoahFamilyItem } from './noah-intake-family.ts';
export const NOAH_LISTING_REASONS = [
  'withdrawn',         // 出どころから外れた、または運営が取り下げた
  'hidden',            // 30 日つながらなかった
  'unsupported',       // 接続要件の下書きを作れない（理由は NOAH_INTAKE_REASONS）
  'later_source',      // 公式台帳の外（Space・ACP）。ローンチの後
  'later_mouth',       // 端末で動かす配布。ローンチの後
  'bulk',              // 同じ提供者の量産。ローンチの後（1 枚のカードの中身の見せ方を決めてから）
  'needs_key',         // 本人の鍵の入力が要る。ローンチの後
  'not_checked',       // まだ握手していない
  'needs_permission',  // 相手の許可（OAuth か鍵）が要る。ローンチの後
  'needs_payment',     // 呼ぶたびの支払いが要る。未対応
  'not_responding',    // 握手が通らない（2 回続けて失敗した物を含む）
  'no_form_tool',      // 入力欄で使える道具が 1 つも無い
] as const;
export type NoahListingReason = (typeof NOAH_LISTING_REASONS)[number];
export type NoahListingInput = {
  source: NoahFamilyItem['source'];
  familyId: string;
  candidateState: 'active' | 'unsupported' | 'withdrawn';
  withdrawn: boolean;
  hidden: boolean;
  /** 握手の表（noah_intake_checks）の行。下書きを作れなかった候補は null。 */
  check: null | {
    mouth: NoahConnect['mouth']; setup: boolean; auth: 'none' | 'oauth' | 'key' | 'payment' | 'unknown';
    result: string; level: 0 | 1 | 2; formTools: number | null; oneTapTools: number | null;
  };
};
export type NoahListing =
  | { listed: true; section: 'ran' | 'new'; oneTap: boolean }
  | { listed: false; reason: NoahListingReason };

/**
 * ローンチの一覧に載せるか。載せるのは、公式台帳の、相手のサーバーで動く物で、鍵も許可も無しで握手が通っていて（level 1 以上）、
 * 入力欄で使える道具が 1 つ以上ある系列。量産の系列は載せない。理由は上から順に見て、最初に当たった物。
 * 握手の 1 回の失敗と、相手の「混んでいる」では外さない（level が変わらないため）。2 回続けて失敗すると level が 0 になり、外れる。
 * section: 'ran' は、人が動かして成果が返った物（L2）。'new' は、握手までの物（「まだ誰も動かしていない」）。
 */
export function noahListing(input: NoahListingInput): NoahListing {
  const no = (reason: NoahListingReason): NoahListing => ({ listed: false, reason });
  if (input.candidateState === 'withdrawn' || input.withdrawn) return no('withdrawn');
  if (input.hidden) return no('hidden');
  const k = input.check;
  if (input.candidateState === 'unsupported' || !k) return no('unsupported');
  if (input.source !== 'mcp-registry') return no('later_source');
  if (k.mouth !== 'mcp-remote') return no('later_mouth');
  if (input.familyId.startsWith('bulk:')) return no('bulk');
  if (k.setup) return no('needs_key');
  if (k.level < 1) {
    if (k.result === 'unchecked') return no('not_checked');
    if (k.auth === 'oauth' || k.auth === 'key' || k.result === 'auth_required') return no('needs_permission');
    if (k.auth === 'payment' || k.result === 'payment_required') return no('needs_payment');
    return no('not_responding');
  }
  if (k.auth !== 'none') return no('needs_permission');
  if ((k.formTools ?? 0) < 1) return no('no_form_tool');
  return { listed: true, section: k.level === 2 ? 'ran' : 'new', oneTap: (k.oneTapTools ?? 0) >= 1 };
}


export const NOAH_LISTING_SQL = {
ran: String.raw`-- Noah: ローンチの一覧（タイムライン・検索）と、つなぐ前・頼む前の上限の問い合わせ。
-- Design contract only. 実装する task が、同じ文を lib/ へ移す（文字列のまま。書き直さない）。
-- 載せる条件の正本は docs/contracts/noah-intake-v1.ts の noahListing。系列の行の listed・one_tap は noah-regroup-v1.sql と、下の touch が書く。
-- 検証: python3 docs/design-validation/noah/validate-noah-v1.py（索引を使うこと、頁の継ぎ目で重ならず抜けないこと、表と同じ結果になること）。
-- 文の名前は「-- name: …」。引数は :名前。

-- name: ran
-- 「動いた」: 人が動かして成果が返った系列（L2）。新しい順。最初の頁は :before_at = 9007199254740991、:after_id = ''。
SELECT id, l2_at FROM noah_intake_families
 WHERE level = 2 AND withdrawn_at IS NULL AND hidden_at IS NULL AND listed = 1
   AND (l2_at < :before_at OR (l2_at = :before_at AND id > :after_id))
 ORDER BY l2_at DESC, id LIMIT :limit;
`,
new: String.raw`
-- name: new
-- 「まだ誰も動かしていない」: 握手まで（L1）の系列。その日の並び（shuffle）。:one_tap = 1 で、押すだけで頼める物だけ。
-- 最初の頁は :before = 1000000000、:after_id = ''。
SELECT id, shuffle FROM noah_intake_families
 WHERE listed = 1 AND level = 1 AND withdrawn_at IS NULL AND hidden_at IS NULL
   AND (:one_tap = 0 OR one_tap = 1)
   AND (shuffle < :before OR (shuffle = :before AND id > :after_id))
 ORDER BY shuffle DESC, id LIMIT :limit;
`,
reshuffle: String.raw`
-- name: reshuffle
-- 並びの引き直し。UTC の日付が変わって最初の巡回で 1 回。名前の順や、台帳での更新の多さが並びに出ないようにする。
UPDATE noah_intake_families SET shuffle = abs(random()) % 1000000000 WHERE listed = 1 AND level = 1;
`,
touch: String.raw`
-- name: touch
-- 握手・実行で noah_intake_checks を書いた直後に、その候補が代表の系列へ写す（次の名寄せを待たない）。
-- :listed・:one_tap・:badge_hint は noahListing の結果から。L2 になった時は :l2_at に時刻、それ以外は今の値のまま（COALESCE）。
UPDATE noah_intake_families
   SET level = :level, l2_at = CASE WHEN :level = 2 THEN COALESCE(:l2_at, l2_at) ELSE NULL END, badge_hint = :badge_hint,
       listed = :listed, one_tap = :one_tap, updated_at = :now, revision = revision + 1
 WHERE representative_id = :candidate_id;
`,
search: String.raw`
-- name: search
-- 語で探す（名前と説明の部分一致）。載せている系列だけ。:like は、% と _ と \ を \ で逃がした語の前後に % を付けた物。
-- 載せている系列（約 18,000）を読む。件数が 10 万を越えたら、検索用の表を足す。
SELECT f.id FROM noah_intake_families f JOIN noah_intake_candidates c ON c.id = f.representative_id
 WHERE f.listed = 1 AND f.level >= 1 AND f.withdrawn_at IS NULL AND f.hidden_at IS NULL
   AND (c.name LIKE :like ESCAPE '\' OR c.summary LIKE :like ESCAPE '\')
 ORDER BY f.level DESC, f.shuffle DESC, f.id LIMIT :limit OFFSET :offset;
`,
counts: String.raw`
-- name: counts
-- 運営の画面: 載せている数と、載せていない理由を数えるための集計。理由そのものは、行ごとに noahListing が決める。
SELECT c.source, c.state, (c.family_id LIKE 'bulk:%') AS bulk, k.mouth, k.setup, k.auth, k.result, k.level,
       (COALESCE(k.form_tools, 0) >= 1) AS has_form, (COALESCE(k.one_tap_tools, 0) >= 1) AS has_one_tap, COUNT(*) AS n
  FROM noah_intake_candidates c LEFT JOIN noah_intake_checks k ON k.candidate_id = c.id
 GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10;
`,
host_wait: String.raw`
-- name: host_wait
-- 相手が「混んでいる」（429）と返した時。Retry-After の時刻（:until）まで、巡回も、利用者の操作から始める握手も待つ。短くはしない。
INSERT INTO noah_probe_hosts(host, last_probe_at, not_before) VALUES(:host, 0, :until)
ON CONFLICT(host) DO UPDATE SET not_before = MAX(noah_probe_hosts.not_before, excluded.not_before);
`
};
