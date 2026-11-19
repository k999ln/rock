-- Noah: 名寄せのやり直し。全件の巡回が 1 巡終わるたびと、接続試験で道具の定義の hash が変わった後に、上から順に流す。
-- Design contract only. 規則の正本は docs/contracts/noah-intake-v1.ts の groupNoahFamilies。同じ入力で同じ系列になることを
-- docs/design-validation/noah/validate-noah-v1.py が確かめる。:threshold は NOAH_BULK_THRESHOLD（20）。

-- 6) 既定: 1 件で 1 系列。
UPDATE noah_intake_candidates SET family_id = id WHERE state = 'active';
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
INSERT INTO noah_intake_families(id, representative_id, members, level, l2_at, badge_hint, updated_at, revision)
SELECT family_id, id, members, level, l2_at, badge_hint, :now, 1 FROM (
  SELECT c.family_id, c.id, COUNT(*) OVER w AS members, COALESCE(k.level, 0) AS level, k.l2_at,
         CASE WHEN COALESCE(k.setup, 0) = 1 THEN 'setup' WHEN COALESCE(k.level, 0) < 2 THEN 'unverified' WHEN k.auth = 'oauth' THEN 'taps' ELSE 'one_click' END AS badge_hint,
         ROW_NUMBER() OVER (PARTITION BY c.family_id ORDER BY c.running DESC, COALESCE(k.level, 0) DESC, c.likes DESC, COALESCE(c.source_updated_at, 0) DESC, c.id) AS position
    FROM noah_intake_candidates c LEFT JOIN noah_intake_checks k ON k.candidate_id = c.id
   WHERE c.state = 'active'
  WINDOW w AS (PARTITION BY c.family_id)
) WHERE position = 1
ON CONFLICT(id) DO UPDATE SET representative_id = excluded.representative_id, members = excluded.members, level = excluded.level, l2_at = excluded.l2_at,
  badge_hint = excluded.badge_hint, updated_at = excluded.updated_at, revision = noah_intake_families.revision + 1;
--> statement-breakpoint
-- 候補が 1 件も無くなった系列を隠す（行は消さない。引き取りと取り下げの記録が残る）。
UPDATE noah_intake_families SET hidden_at = COALESCE(hidden_at, :now)
 WHERE id NOT IN (SELECT DISTINCT family_id FROM noah_intake_candidates WHERE state = 'active');
