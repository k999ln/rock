import catalog from '../data/noah-tool-catalog.json' with { type: 'json' };
import type { NoahToolDefinition } from './noah-agent-explanation.ts';

/**
 * 掲載中の系列について、握手（tools/list）で取れた道具の定義の写し。
 *
 * 本番データベースに表を足さずに道具の一覧を出すため、配備時の写しを同梱する。
 * 写しを取った時の tools_sha256 と、本番の今の tools_sha256 と道具の数が一致する時だけ使う。
 * 一致しなければ（道具の定義が変わっていれば）使わず、接続と依頼の2段に戻す。
 *
 * 1 つの系列に、写しを新しい順に 2 つまで持てる（取り直しは scripts/noah-tool-catalog-refresh.mjs）。
 * 本番の巡回が相手を確かめ直すのは 3〜7 日おきなので、取り直した直後の配備では、本番の今の hash が 1 つ前の写しと合う事がある。
 * その間も、道具の一覧を消さない。
 */
type CatalogEntry = { toolsSha256: string; tools: NoahToolDefinition[] };
const SERIES = (catalog as { schema: string; series: Record<string, CatalogEntry | CatalogEntry[]> }).series;

export function noahCatalogTools(candidateId: string, current: { toolsSha256: string | null; toolCount: number | null }): readonly NoahToolDefinition[] | null {
  const found = Object.hasOwn(SERIES, candidateId) ? SERIES[candidateId] : null;
  if (!found || !current.toolsSha256) return null;
  const entry = (Array.isArray(found) ? found : [found]).find((item) => item.toolsSha256 === current.toolsSha256);
  if (!entry || entry.tools.length !== current.toolCount) return null;
  return entry.tools;
}
