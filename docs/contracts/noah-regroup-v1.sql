-- Noah: 名寄せのやり直し。1 日 1 回（UTC の日付が変わって最初に台帳の巡回が終わった時）と、全件の巡回が終わった時に、上から順に流す。
-- まとめた候補（量産・コピー）だけを書き直し、1 件で 1 系列の候補と、変わらない系列の行は書かない（D1 は、書いた行の数で数える）。
-- 巡回の間に新しく入った候補は、入った時に「1 件で 1 系列」の行を持つ（lib/noah-intake-store.ts）。まとめ直しは、次の名寄せで起きる。
-- Design contract only. 規則の正本は docs/contracts/noah-intake-v1.ts の groupNoahFamilies。同じ入力で同じ系列になることを
-- docs/design-validation/noah/validate-noah-v1.py が確かめる。:threshold は NOAH_BULK_THRESHOLD（20）。

-- 6) 既定: 1 件で 1 系列。すでにそうなっている行は書かない（D1 は、書いた行の数で数える。全件 6 万行を毎回書かない）。
UPDATE noah_intake_candidates SET family_id = id WHERE state = 'active' AND family_id <> id;
--> statement-breakpoint
-- 5) Space で、小文字にした名前が同じ物が :threshold 件以上（教材などの写し）。
UPDATE noah_intake_candidates SET family_id = 'space:' || group_key
 WHERE source = 'hf-mcp-space' AND state = 'active'
   AND group_key IN (SELECT group_key FROM noah_intake_candidates WHERE source = 'hf-mcp-space' AND state = 'active' GROUP BY group_key HAVING COUNT(*) >= :threshold);
--> statement-breakpoint
-- 4) 出どころが違い、リポジトリが同じで、どの出どころにも 1 件ずつ（同じ物の別の載り方）。
UPDATE noah_intake_candidates SET family_id = 'repo:' || repository
 WHERE state = 'active' AND repository IS NOT NULL AND source <> 'hf-mcp-space'
   AND repository IN (SELECT repository FROM noah_intake_candidates WHERE state = 'active' AND repository IS NOT NULL
                       GROUP BY repository HAVING COUNT(DISTINCT source) >= 2 AND COUNT(*) = COUNT(DISTINCT source));
--> statement-breakpoint
-- 3) 道具の定義の hash が同じで、リポジトリか host か Space の名前も同じ物が 2 件以上（同じ物のコピー）。
WITH anchored AS (
  SELECT c.id, k.tools_sha256 AS tools,
         CASE WHEN c.source = 'hf-mcp-space' THEN 'space/' || c.group_key WHEN c.repository IS NOT NULL THEN c.repository WHEN c.host IS NOT NULL THEN 'host/' || c.host END AS anchor
    FROM noah_intake_candidates c JOIN noah_intake_checks k ON k.candidate_id = c.id
   WHERE c.state = 'active' AND k.tools_sha256 IS NOT NULL
), copies AS (
  SELECT tools, anchor FROM anchored WHERE anchor IS NOT NULL GROUP BY tools, anchor HAVING COUNT(*) >= 2
)
UPDATE noah_intake_candidates SET family_id = (SELECT 'same:' || substr(a.tools, 1, 16) || ':' || a.anchor FROM anchored a WHERE a.id = noah_intake_candidates.id)
 WHERE id IN (SELECT a.id FROM anchored a JOIN copies x ON x.tools = a.tools AND x.anchor = a.anchor);
--> statement-breakpoint
-- 2) 台帳で、同じリポジトリの記録が :threshold 件以上（量産）。
UPDATE noah_intake_candidates SET family_id = 'bulk:repo:' || repository
 WHERE source = 'mcp-registry' AND state = 'active' AND repository IS NOT NULL
   AND repository IN (SELECT repository FROM noah_intake_candidates WHERE source = 'mcp-registry' AND state = 'active' AND repository IS NOT NULL
                       GROUP BY repository HAVING COUNT(*) >= :threshold);
--> statement-breakpoint
-- 1) 台帳で、同じ名前空間かつ同じ host の記録が :threshold 件以上（量産）。最後に流すので、これが最も優先される。
UPDATE noah_intake_candidates SET family_id = 'bulk:' || group_key || '@' || host
 WHERE source = 'mcp-registry' AND state = 'active' AND host IS NOT NULL
   AND (group_key, host) IN (SELECT group_key, host FROM noah_intake_candidates WHERE source = 'mcp-registry' AND state = 'active' AND host IS NOT NULL
                              GROUP BY group_key, host HAVING COUNT(*) >= :threshold);
--> statement-breakpoint
-- 系列の表を作り直す。代表は、動いている → 接続試験が深い → いいねが多い → 更新が新しい → ID の順。引き取り・取り下げ・隠した印は残す。
-- listed は、ローンチの一覧に載せる条件（規則の正本は noahListing。同じ結果になることを検証キットが確かめる）:
-- 公式台帳の、相手のサーバーで動く物で、鍵も許可も無しで握手が通っていて（level 1 以上）、入力欄で使える道具が 1 つ以上あり、量産の系列でない。
-- shuffle（「まだ誰も動かしていない」の並び）は、初めて作る行にだけ引く。今ある行の値は変えない（引き直すのは、下の 1 日 1 回の文）。
INSERT INTO noah_intake_families(id, representative_id, members, level, l2_at, badge_hint, listed, one_tap, shuffle, updated_at, revision)
SELECT family_id, id, members, level, l2_at, badge_hint, listed, one_tap, abs(random()) % 1000000000, :now, 1 FROM (
  SELECT c.family_id, c.id, COUNT(*) OVER w AS members, COALESCE(k.level, 0) AS level, k.l2_at,
         CASE WHEN COALESCE(k.setup, 0) = 1 THEN 'setup' WHEN COALESCE(k.level, 0) < 2 THEN 'unverified' WHEN k.auth = 'oauth' THEN 'taps' ELSE 'one_click' END AS badge_hint,
         CASE WHEN c.source = 'mcp-registry' AND c.family_id NOT LIKE 'bulk:%' AND k.mouth = 'mcp-remote' AND k.setup = 0 AND k.auth = 'none'
                   AND k.level >= 1 AND COALESCE(k.form_tools, 0) >= 1 THEN 1 ELSE 0 END AS listed,
         CASE WHEN COALESCE(k.one_tap_tools, 0) >= 1 THEN 1 ELSE 0 END AS one_tap,
         ROW_NUMBER() OVER (PARTITION BY c.family_id ORDER BY c.running DESC, COALESCE(k.level, 0) DESC, c.likes DESC, COALESCE(c.source_updated_at, 0) DESC, c.id) AS position
    FROM noah_intake_candidates c LEFT JOIN noah_intake_checks k ON k.candidate_id = c.id
   WHERE c.state = 'active'
  WINDOW w AS (PARTITION BY c.family_id)
) WHERE position = 1
ON CONFLICT(id) DO UPDATE SET representative_id = excluded.representative_id, members = excluded.members, level = excluded.level, l2_at = excluded.l2_at,
  badge_hint = excluded.badge_hint, listed = excluded.listed, one_tap = excluded.one_tap, updated_at = excluded.updated_at, revision = noah_intake_families.revision + 1
  -- 変わった系列だけを書く。
  WHERE noah_intake_families.representative_id <> excluded.representative_id OR noah_intake_families.members <> excluded.members
     OR noah_intake_families.level <> excluded.level OR noah_intake_families.l2_at IS NOT excluded.l2_at OR noah_intake_families.badge_hint <> excluded.badge_hint
     OR noah_intake_families.listed <> excluded.listed OR noah_intake_families.one_tap <> excluded.one_tap;
--> statement-breakpoint
-- 候補が 1 件も無くなった系列を隠す（行は消さない。引き取りと取り下げの記録が残る）。
UPDATE noah_intake_families SET hidden_at = COALESCE(hidden_at, :now)
 WHERE id NOT IN (SELECT DISTINCT family_id FROM noah_intake_candidates WHERE state = 'active');
