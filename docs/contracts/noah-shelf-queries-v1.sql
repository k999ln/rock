-- Noah: 棚の一覧、載せるかの見直し、実績の数え直し、見せた記録、つなげる数、300 人の試行の問い合わせ。
-- Design contract only. 実装する task が、同じ文を lib/ へ移す（文字列のまま。書き直さない）。
-- 表は docs/contracts/noah-shelf-v1.sql と docs/contracts/noah-v1.sql。
-- 検証: python3 docs/design-validation/noah/validate-noah-shelf-v1.py（索引を使うこと、手で数えた値と同じになること、5 人未満を出さないこと）。
-- 文の名前は「-- name: …」。引数は :名前。

-- name: shelf
-- 棚 1 段。載せているカードを、運営の順で。並べ替え（rankNoahShelf）は、この結果と実績を受け取って、呼ぶ側で行う。上限は 200 枚。
SELECT id, package_json FROM noah_packages WHERE shelf = :shelf AND listed = 1 ORDER BY position, id LIMIT 200;
--> statement-breakpoint
-- name: packages_of_family
-- 系列の握手・実行・取り下げの直後に、その系列を使っているカードを引く（載せるかを見直すため）。
SELECT package_id FROM noah_package_steps WHERE kind = 'family' AND ref = :family_id;
--> statement-breakpoint
-- name: package_touch
-- noahPackageListing の結果を写す。版が合う時だけ。:listed = 1 の時、:reason と :reason_step は NULL。
UPDATE noah_packages SET listed = :listed, reason = :reason, reason_step = :reason_step, checked_at = :now, updated_at = :now, revision = revision + 1
 WHERE id = :id AND revision = :revision;
--> statement-breakpoint
-- name: evidence_rollup
-- 実績の数え直し。1 日 1 回、巡回の合図の中で。対象は、自動の工程が「相手のサーバーの道具 1 つ」だけのカード（ローンチの形）。
-- :since より後の接続と依頼だけを数える（候補: 90 日前。古い実績が、いつまでも並びを決めないように）。
-- 数え方: connects は「接続」の行、connected は、つながった行。asks は、その道具への終わった依頼、succeeded は、成果が返った依頼。
-- first_users は、成果が 1 回以上返った人。returned は、そのうち、最初の成果の次の日（UTC）以降に、もう 1 回頼んだ人。
-- median_seconds は、最初に「接続」を押してから、最初の成果までの秒数の、人ごとの値の中央値。
-- 本人の ID は、数えるためだけに読む。書くのは数だけ。検収（reviewed・accepted）は、検収の記録ができるまで 0 のまま。
WITH card AS (
  SELECT s.package_id, s.ref AS family_key, s.tool
    FROM noah_package_steps s
   WHERE s.kind = 'family'
     AND (SELECT COUNT(*) FROM noah_package_steps x WHERE x.package_id = s.package_id AND x.kind IN ('family','home','builtin')) = 1
),
conn AS (
  SELECT card.package_id, card.tool, c.id, c.owner_id, c.created_at, c.connected_at
    FROM card JOIN noah_connections c ON c.family_key = card.family_key
   WHERE c.created_at > :since
),
ask AS (
  SELECT conn.package_id, a.owner_id, a.state, a.created_at, a.finished_at
    FROM conn JOIN noah_asks a ON a.owner_id = conn.owner_id AND a.created_at > :since AND a.connection_id = conn.id AND a.tool = conn.tool
   WHERE a.finished_at IS NOT NULL
),
first_ok AS (
  SELECT package_id, owner_id, MIN(finished_at) AS at FROM ask WHERE state = 'succeeded' GROUP BY package_id, owner_id
),
secs AS (
  SELECT f.package_id, (f.at - (SELECT MIN(c.created_at) FROM conn c WHERE c.package_id = f.package_id AND c.owner_id = f.owner_id)) / 1000 AS seconds FROM first_ok f
),
ranked AS (
  SELECT package_id, seconds, ROW_NUMBER() OVER (PARTITION BY package_id ORDER BY seconds) AS rn, COUNT(*) OVER (PARTITION BY package_id) AS n FROM secs
),
median AS (
  SELECT package_id, CAST(AVG(seconds) AS INTEGER) AS seconds FROM ranked WHERE rn IN ((n + 1) / 2, (n + 2) / 2) GROUP BY package_id
)
INSERT INTO noah_package_evidence(package_id, people, connects, connected, asks, succeeded, reviewed, accepted, first_users, returned, median_seconds, since_at, computed_at)
SELECT card.package_id,
       (SELECT COUNT(DISTINCT owner_id) FROM conn WHERE conn.package_id = card.package_id),
       (SELECT COUNT(*) FROM conn WHERE conn.package_id = card.package_id),
       (SELECT COUNT(*) FROM conn WHERE conn.package_id = card.package_id AND connected_at IS NOT NULL),
       (SELECT COUNT(*) FROM ask WHERE ask.package_id = card.package_id),
       (SELECT COUNT(*) FROM ask WHERE ask.package_id = card.package_id AND state = 'succeeded'),
       0, 0,
       (SELECT COUNT(*) FROM first_ok f WHERE f.package_id = card.package_id),
       (SELECT COUNT(*) FROM first_ok f WHERE f.package_id = card.package_id
          AND EXISTS (SELECT 1 FROM ask a WHERE a.package_id = f.package_id AND a.owner_id = f.owner_id AND a.created_at >= (f.at / 86400000 + 1) * 86400000)),
       (SELECT seconds FROM median m WHERE m.package_id = card.package_id),
       :since, :now
  FROM card WHERE true
ON CONFLICT(package_id) DO UPDATE SET
  people = excluded.people, connects = excluded.connects, connected = excluded.connected, asks = excluded.asks, succeeded = excluded.succeeded,
  first_users = excluded.first_users, returned = excluded.returned, median_seconds = excluded.median_seconds, since_at = excluded.since_at, computed_at = excluded.computed_at;
--> statement-breakpoint
-- name: evidence
-- 棚 1 段の実績。並び（rankNoahShelf）へ渡す。人数が足りない行も返す（使うかどうかは、noahCardScore が決める）。
SELECT e.package_id, e.people, e.connects, e.connected, e.asks, e.succeeded, e.reviewed, e.accepted, e.first_users, e.returned, e.median_seconds
  FROM noah_packages p JOIN noah_package_evidence e ON e.package_id = p.id
 WHERE p.shelf = :shelf AND p.listed = 1;
--> statement-breakpoint
-- name: shown
-- 一覧に出した回数を 1 足す（カード 1 枚・その日・その位置の区分）。:day は UTC の yyyymmdd。詳細を開いた時は opened。
INSERT INTO noah_shelf_daily(day, package_id, band, shown, opened) VALUES(:day, :package_id, :band, :shown, :opened)
ON CONFLICT(day, package_id, band) DO UPDATE SET shown = shown + excluded.shown, opened = opened + excluded.opened;
--> statement-breakpoint
-- name: seen
-- 履歴の利用に同意した本人が、カードを見た・開いた。同意していない本人では、この文を呼ばない。
INSERT INTO noah_shelf_seen(owner_id, package_id, shown, opened, hidden, first_at, last_at) VALUES(:owner, :package_id, :shown, :opened, 0, :now, :now)
ON CONFLICT(owner_id, package_id) DO UPDATE SET shown = shown + excluded.shown, opened = opened + excluded.opened, last_at = excluded.last_at;
--> statement-breakpoint
-- name: seen_hide
-- 本人が「非表示」にした・戻した。同意の有無に依らず受け付ける（本人が頼んだ事なので）。
INSERT INTO noah_shelf_seen(owner_id, package_id, shown, opened, hidden, first_at, last_at) VALUES(:owner, :package_id, 0, 0, :hidden, :now, :now)
ON CONFLICT(owner_id, package_id) DO UPDATE SET hidden = excluded.hidden, last_at = excluded.last_at;
--> statement-breakpoint
-- name: seen_of_owner
-- 並び（rankNoahShelf）へ渡す、本人の見た記録。
SELECT package_id, shown, opened, hidden FROM noah_shelf_seen WHERE owner_id = :owner;
--> statement-breakpoint
-- name: seen_forget
-- 本人が、履歴の利用をやめた・履歴を消した。見た記録の行を消す。「非表示」は本人が頼んだ事なので、行を残し、回数だけを 0 にする（次の文）。
DELETE FROM noah_shelf_seen WHERE owner_id = :owner AND hidden = 0;
--> statement-breakpoint
-- name: seen_forget_hidden
UPDATE noah_shelf_seen SET shown = 0, opened = 0 WHERE owner_id = :owner AND hidden = 1;
--> statement-breakpoint
-- name: live_cards
-- つなげる数（noahPlanConnectGate へ渡す liveCards）。同じカードの中の接続は、1 と数える。
SELECT COUNT(DISTINCT COALESCE(p.package_id, c.id)) AS live_cards
  FROM noah_connections c LEFT JOIN noah_package_connections p ON p.connection_id = c.id
 WHERE c.owner_id = :owner AND c.disconnected_at IS NULL;
--> statement-breakpoint
-- name: trial_totals
-- 段を終えたかの判定（noahTrialGate）へ渡す 4 つの数。試行に入った人（:wave までの段）だけを数える。試行の人から引く（接続と依頼の表を、端から読まない）。
SELECT
  (SELECT COUNT(*) FROM noah_trial_entries e WHERE e.wave <= :wave AND EXISTS (SELECT 1 FROM noah_connections c WHERE c.owner_id = e.owner_id)) AS pressed,
  (SELECT COUNT(*) FROM noah_trial_entries e WHERE e.wave <= :wave AND EXISTS (SELECT 1 FROM noah_connections c WHERE c.owner_id = e.owner_id AND c.connected_at IS NOT NULL)) AS connected,
  (SELECT COUNT(*) FROM noah_trial_entries e WHERE e.wave <= :wave AND EXISTS (SELECT 1 FROM noah_asks a WHERE a.owner_id = e.owner_id AND a.state = 'succeeded')) AS first_result,
  (SELECT COUNT(*) FROM noah_trial_entries e WHERE e.wave <= :wave AND EXISTS (
     SELECT 1 FROM noah_asks b WHERE b.owner_id = e.owner_id
        AND b.created_at >= ((SELECT MIN(a.finished_at) FROM noah_asks a WHERE a.owner_id = e.owner_id AND a.state = 'succeeded') / 86400000 + 1) * 86400000)) AS returned;
--> statement-breakpoint
-- name: trial_funnel
-- 経路ごとの数（運営の画面）。5 人未満の経路は出さない。
SELECT e.via, COUNT(*) AS entered,
       SUM(EXISTS (SELECT 1 FROM noah_connections c WHERE c.owner_id = e.owner_id AND c.connected_at IS NOT NULL)) AS connected,
       SUM(EXISTS (SELECT 1 FROM noah_asks a WHERE a.owner_id = e.owner_id AND a.state = 'succeeded')) AS first_result
  FROM noah_trial_entries e GROUP BY e.via HAVING COUNT(*) >= 5 ORDER BY e.via;
--> statement-breakpoint
-- name: trial_earn
-- 「稼ぐ・仕事を省く」の棚の、本人からの報告の合計（運営の画面と、本人への公開）。5 人未満のカードは出さない。
-- 割合は、呼ぶ側で作る: 出品した割合 = listed / people、売れた割合 = sellers / listed、1 件の手取り = net_yen / orders、1 件に掛かった分 = minutes / orders。
SELECT package_id, COUNT(*) AS people, SUM(listed) AS listed, SUM(sold > 0) AS sellers, SUM(sold) AS orders, SUM(net_yen) AS net_yen, SUM(minutes) AS minutes
  FROM noah_trial_reports GROUP BY package_id HAVING COUNT(*) >= 5 ORDER BY package_id;
