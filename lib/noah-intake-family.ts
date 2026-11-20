/**
 * Noah 取り込み: 名寄せ（系列）と、ローンチの一覧に載せる条件。規則の正本は、ここの純関数。同じ規則の SQL を、下に文字列で持つ。
 *
 * 純関数は、通信も保存もしない。仕様: docs/noah/spec-85-intake.md、docs/noah/spec-88-mass-probe.md 9 章、docs/noah/mvp-launch.md 5 章。
 * docs/contracts/noah-intake-v1.ts と noah-regroup-v1.sql から移した（L3）。SQL が純関数と同じ結果になる事は tests/noah-intake-family.test.mjs が確かめる。
 */
import type { NoahConnect } from './noah-connect-requirements.ts';

// ---------------------------------------------------------------------------
// 名寄せ（系列）
// ---------------------------------------------------------------------------

export type NoahFamilyItem = {
  id: string;
  source: 'mcp-registry' | 'hf-mcp-space' | 'acp-registry' | 'discovery';
  /** 台帳の名前（`名前空間/名前`）、Space の id、ACP の id。 */
  name: string;
  /** 接続先の host。package は無い。 */
  host?: string;
  /** リポジトリの URL。 */
  repository?: string;
  /** L1 の後に分かる、道具の定義の hash。 */
  toolsSha256?: string;
  running?: boolean;
  level?: 0 | 1 | 2;
  likes?: number;
  updatedAt?: number;
};
/** 同じ提供者の量産と、同じ名前のコピーを 1 系列にまとめる件数（候補）。 */
export const NOAH_BULK_THRESHOLD = 20;

/** リポジトリの URL を、比べられる鍵にする。対応する host だけ。 */
export function noahRepositoryKey(url: string | undefined): string | null {
  const m = /^https:\/\/(github\.com|gitlab\.com|huggingface\.co)\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(url ?? '');
  return m ? `${m[1]}/${m[2].toLowerCase()}` : null;
}
const spaceName = (id: string) => id.slice(id.indexOf('/') + 1).toLowerCase();
const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

/**
 * 系列の鍵を決める。規則は上から順に当て、最初に当たった物を採る。
 * 1) 台帳で、同じ名前空間かつ同じ host の記録が 20 件以上 → `bulk:名前空間@host`（量産）
 * 2) 台帳で、同じリポジトリの記録が 20 件以上 → `bulk:repo:…`（量産）
 * 3) 道具の定義の hash が同じで、リポジトリか host か Space の名前も同じ物が 2 件以上 → `same:hash16:…`（同じ物のコピー）
 * 4) 出どころが違い、リポジトリが同じで、どの出どころにも 1 件ずつ → `repo:…`（同じ物の別の載り方）
 * 5) Space で、小文字にした名前が同じ物が 20 件以上 → `space:名前`（教材などの写し）
 * 6) それ以外 → `出どころ:名前`（1 件で 1 系列）
 * 同じリポジトリの 2〜19 件は、別の道具のことが多いので、握手の前はまとめない（実測は仕様書 85）。
 */
export function groupNoahFamilies(items: NoahFamilyItem[]): { familyOf: Map<string, string>; representative: Map<string, string> } {
  const nsHost = new Map<string, number>();
  const registryRepo = new Map<string, number>();
  const repoSources = new Map<string, Map<string, number>>();
  const spaces = new Map<string, number>();
  const same = new Map<string, number>();
  const anchorOf = (i: NoahFamilyItem) =>
    i.source === 'hf-mcp-space' ? `space/${spaceName(i.name)}` : noahRepositoryKey(i.repository) ?? (i.host ? `host/${i.host}` : null);
  const sameKey = (i: NoahFamilyItem) => (i.toolsSha256 && anchorOf(i) ? `same:${i.toolsSha256.slice(0, 16)}:${anchorOf(i)}` : null);
  for (const i of items) {
    const repo = noahRepositoryKey(i.repository);
    if (i.source === 'mcp-registry' && i.host) bump(nsHost, `${i.name.split('/')[0]}@${i.host}`);
    if (i.source === 'mcp-registry' && repo) bump(registryRepo, repo);
    if (repo) {
      if (!repoSources.has(repo)) repoSources.set(repo, new Map());
      bump(repoSources.get(repo)!, i.source);
    }
    if (i.source === 'hf-mcp-space') bump(spaces, spaceName(i.name));
    const sk = sameKey(i);
    if (sk) bump(same, sk);
  }

  const familyOf = new Map<string, string>();
  for (const i of items) {
    const repo = noahRepositoryKey(i.repository);
    const ns = `${i.name.split('/')[0]}@${i.host}`;
    const sk = sameKey(i);
    const sources = repo ? repoSources.get(repo)! : null;
    let family: string;
    if (i.source === 'mcp-registry' && i.host && (nsHost.get(ns) ?? 0) >= NOAH_BULK_THRESHOLD) family = `bulk:${ns}`;
    else if (i.source === 'mcp-registry' && repo && (registryRepo.get(repo) ?? 0) >= NOAH_BULK_THRESHOLD) family = `bulk:repo:${repo}`;
    else if (sk && (same.get(sk) ?? 0) >= 2) family = sk;
    else if (repo && sources && sources.size >= 2 && [...sources.values()].every((n) => n === 1)) family = `repo:${repo}`;
    else if (i.source === 'hf-mcp-space' && (spaces.get(spaceName(i.name)) ?? 0) >= NOAH_BULK_THRESHOLD) family = `space:${spaceName(i.name)}`;
    else family = `${i.source}:${i.name}`;
    familyOf.set(i.id, family);
  }
  // 代表: 動いている → 接続試験が深い → いいねが多い → 更新が新しい → ID の順
  const better = (a: NoahFamilyItem, b: NoahFamilyItem) =>
    Number(b.running ?? false) - Number(a.running ?? false) || (b.level ?? 0) - (a.level ?? 0) ||
    (b.likes ?? 0) - (a.likes ?? 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || (a.id < b.id ? -1 : 1);
  const representative = new Map<string, string>();
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const i of items) {
    const family = familyOf.get(i.id)!;
    const current = representative.get(family);
    if (!current || better(i, byId.get(current)!) < 0) representative.set(family, i.id);
  }
  return { familyOf, representative };
}

// ---------------------------------------------------------------------------
// ローンチの一覧に載せる条件（docs/noah/mvp-launch.md 3 章）。同じ条件を noah-regroup-v1.sql が SQL で持つ。
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 名寄せのやり直し（SQL）。1 日 1 回と、全件の巡回が終わった時に、上から順に流す（lib/noah-intake-store.ts の regroup）。
// まとめた候補（量産・コピー）だけを書き直し、1 件で 1 系列の候補と、変わらない系列の行は書かない（D1 は、書いた行の数で数える）。
// 文は docs/contracts/noah-regroup-v1.sql と同じ（注釈だけを外した）。引数は :threshold（NOAH_BULK_THRESHOLD）と :now。
// 順: 6) 既定 → 5) 同じ名前の Space → 4) 出どころが違い同じリポジトリ → 3) 道具の定義が同じ → 2) 同じリポジトリの量産
//     → 1) 同じ名前空間・同じ host の量産（最後に流すので、最も優先される）→ 系列の表を作り直す → 候補の無くなった系列を隠す。
// ---------------------------------------------------------------------------
export const NOAH_REGROUP_SQL: readonly string[] = [
  `UPDATE noah_intake_candidates SET family_id = id WHERE state = 'active' AND family_id <> id;`,
  `UPDATE noah_intake_candidates SET family_id = 'space:' || group_key
 WHERE source = 'hf-mcp-space' AND state = 'active'
   AND group_key IN (SELECT group_key FROM noah_intake_candidates WHERE source = 'hf-mcp-space' AND state = 'active' GROUP BY group_key HAVING COUNT(*) >= :threshold);`,
  `UPDATE noah_intake_candidates SET family_id = 'repo:' || repository
 WHERE state = 'active' AND repository IS NOT NULL AND source <> 'hf-mcp-space'
   AND repository IN (SELECT repository FROM noah_intake_candidates WHERE state = 'active' AND repository IS NOT NULL
                       GROUP BY repository HAVING COUNT(DISTINCT source) >= 2 AND COUNT(*) = COUNT(DISTINCT source));`,
  `WITH anchored AS (
  SELECT c.id, k.tools_sha256 AS tools,
         CASE WHEN c.source = 'hf-mcp-space' THEN 'space/' || c.group_key WHEN c.repository IS NOT NULL THEN c.repository WHEN c.host IS NOT NULL THEN 'host/' || c.host END AS anchor
    FROM noah_intake_candidates c JOIN noah_intake_checks k ON k.candidate_id = c.id
   WHERE c.state = 'active' AND k.tools_sha256 IS NOT NULL
), copies AS (
  SELECT tools, anchor FROM anchored WHERE anchor IS NOT NULL GROUP BY tools, anchor HAVING COUNT(*) >= 2
)
UPDATE noah_intake_candidates SET family_id = (SELECT 'same:' || substr(a.tools, 1, 16) || ':' || a.anchor FROM anchored a WHERE a.id = noah_intake_candidates.id)
 WHERE id IN (SELECT a.id FROM anchored a JOIN copies x ON x.tools = a.tools AND x.anchor = a.anchor);`,
  `UPDATE noah_intake_candidates SET family_id = 'bulk:repo:' || repository
 WHERE source = 'mcp-registry' AND state = 'active' AND repository IS NOT NULL
   AND repository IN (SELECT repository FROM noah_intake_candidates WHERE source = 'mcp-registry' AND state = 'active' AND repository IS NOT NULL
                       GROUP BY repository HAVING COUNT(*) >= :threshold);`,
  `UPDATE noah_intake_candidates SET family_id = 'bulk:' || group_key || '@' || host
 WHERE source = 'mcp-registry' AND state = 'active' AND host IS NOT NULL
   AND (group_key, host) IN (SELECT group_key, host FROM noah_intake_candidates WHERE source = 'mcp-registry' AND state = 'active' AND host IS NOT NULL
                              GROUP BY group_key, host HAVING COUNT(*) >= :threshold);`,
  `INSERT INTO noah_intake_families(id, representative_id, members, level, l2_at, badge_hint, listed, one_tap, shuffle, updated_at, revision)
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
  WHERE noah_intake_families.representative_id <> excluded.representative_id OR noah_intake_families.members <> excluded.members
     OR noah_intake_families.level <> excluded.level OR noah_intake_families.l2_at IS NOT excluded.l2_at OR noah_intake_families.badge_hint <> excluded.badge_hint
     OR noah_intake_families.listed <> excluded.listed OR noah_intake_families.one_tap <> excluded.one_tap;`,
  `UPDATE noah_intake_families SET hidden_at = :now
 WHERE hidden_at IS NULL AND id NOT IN (SELECT DISTINCT family_id FROM noah_intake_candidates WHERE state = 'active');`,
];
