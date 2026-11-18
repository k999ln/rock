import type { ResearchKind, ResearchSummary } from './noah-research-types.ts';
import { researchKindLabels } from './noah-research-types.ts';
import { scoreNoahRecommendation, type NoahRecommendationContext } from './noah-recommendation-policy.ts';
import { recipeFor } from './noah-execution-contract.mjs';

export type ResearchIndex = {
  revision: string; asOf: string; threadId: string;
  stats: { total: number; kinds: Record<ResearchKind, number>; primaryReviewed: number; nameGroups: number };
  rows: [string, string, ResearchKind, 'primary' | 'discovered', string, string, string[]][];
};
const normalize = (s: string) => s.normalize('NFKC').toLocaleLowerCase('en-US');
export class ResearchQueryError extends Error { status = 400; }

export function createResearchCatalog(index: ResearchIndex) {
  const byId = new Map(index.rows.map(row => [row[0], row]));
  const searchable = index.rows.map(r => normalize([r[1], r[4], r[5], ...r[6]].join(' ')));
  const present = (r: ResearchIndex['rows'][number]): ResearchSummary => ({
    id: r[0], name: r[1], kind: r[2], level: r[3], summary: r[4] || (r[2] === 'candidate' ? '公開資料から収集した候補です。用途・実行環境・接続条件は確認待ちです。' : 'Agentに関連する資産です。配布元と確認状況を掲載しています。'), author: r[5], tags: r[6],
    detailPath: `/noah-research/${index.revision}/${r[0] === 'anicca' ? '00' : (parseInt(r[0].slice(9, 11), 16) % 64).toString(16).padStart(2, '0')}.json`,
  });
  return {
    get(id: string) {
      const row = byId.get(id);
      return row ? { entry: present(row), revision: index.revision, asOf: index.asOf, threadId: index.threadId } : null;
    },
    list(params: URLSearchParams, context?: NoahRecommendationContext, snapshot?: number) {
      const query = normalize((params.get('q') || '').trim());
      const kind = params.get('kind') || 'all';
      const order = params.get('order') || 'recommended';
      const rawLimit = params.get('limit') || '20';
      if (query.length > 200 || !/^[1-9]\d?$/.test(rawLimit) || Number(rawLimit) > 50 ||
          !['all', 'related', ...Object.keys(researchKindLabels)].includes(kind) || !['recommended', 'latest'].includes(order)) {
        throw new ResearchQueryError('検索条件を確認してください。件数は1〜50件、検索語は200文字以内です。');
      }
      const limit = Number(rawLimit);
      const signature = JSON.stringify([index.revision, query, kind, order, limit, context?.fingerprint ?? null]);
      let offset = 0;
      const cursor = params.get('cursor');
      if (cursor) {
        try {
          if (cursor.length > 2200) throw new Error();
          const c = JSON.parse(decodeURIComponent(cursor));
          if (c.signature !== signature || c.snapshot !== snapshot || !Number.isSafeInteger(c.offset) || c.offset < 0 || c.offset > index.rows.length) throw new Error();
          offset = c.offset;
        } catch { throw new ResearchQueryError('一覧が更新されたか検索条件が変わりました。最初から読み込んでください。'); }
      }
      const tokens = query.split(/\s+/u).filter(Boolean);
      const matches: Array<{row:ResearchIndex['rows'][number];score:number;reason:string}> = [];
      for (let i = 0; i < index.rows.length; i++) {
        const row = index.rows[i];
        if (context?.hidden.includes(row[0])) continue;
        if (kind === 'related' ? ['agent', 'candidate'].includes(row[2]) : kind !== 'all' && row[2] !== kind) continue;
        if (tokens.every(t => searchable[i].includes(t))) {
          const recipe = recipeFor(row[0]);
          const ranking = context && order === 'recommended' ? scoreNoahRecommendation({ id:row[0], author:row[5], tags:row[6], runtime:recipe ? recipe.provider ? 'codex' : 'local-model' : undefined },context) : {score:0,reason:''};
          matches.push({row,...ranking});
        }
      }
      // All entries share one observed date. Keep deterministic ordering rather
      // than invent provider publication dates for the "latest" tab.
      matches.sort((a,b)=>b.score-a.score);
      const total = matches.length;
      const next = offset + limit < total ? encodeURIComponent(JSON.stringify({ signature, offset: offset + limit, snapshot })) : null;
      return { entries: matches.slice(offset,offset+limit).map(({row,reason})=>({...present(row),...(reason?{reason}: {})})), total,
        nextCursor: next, revision: index.revision, asOf: index.asOf, stats: index.stats };
    },
  };
}

export function researchSnapshot(params:URLSearchParams, now:number) {
  const cursor=params.get('cursor'); if(!cursor) return now;
  try { if(cursor.length>2200) throw Error(); const value=JSON.parse(decodeURIComponent(cursor)).snapshot;
    if(!Number.isSafeInteger(value)||value>now||value<now-900000) throw Error(); return value as number;
  } catch { throw new ResearchQueryError('一覧の有効期限が切れました。先頭から読み直してください。'); }
}
