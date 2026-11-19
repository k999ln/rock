import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError, noahSha256 } from './noah-agent-upload.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
import { noahRuntimePreferences, normalizeRecommendationTag, type NoahRecommendationContext, type NoahRecommendationSettings } from './noah-recommendation-policy.ts';

type Database = Pick<D1Database, 'prepare'>;
type Row = { revision: number; history_enabled: number; history_since: number; runtime: NoahRecommendationSettings['runtime'] };
export async function noahRecommendationSettings(db: Database, owner: string | null): Promise<NoahRecommendationSettings> {
  const row = owner ? (await db.prepare('SELECT revision,history_enabled,history_since,runtime FROM noah_recommendation_settings WHERE owner_id=?').bind(owner).all<Row>()).results[0] : null;
  return row ? { revision: row.revision, historyEnabled: row.history_enabled === 1, historySince: row.history_since, runtime: row.runtime } : { revision: 0, historyEnabled: false, historySince: 0, runtime: 'any' };
}
export async function noahRecommendationContext(db: Database, owner: string | null, asOf: number, settings: NoahRecommendationSettings, preferences: Array<{kind:string;subject:string}>, publicTags: (id:string)=>string[] = ()=>[]): Promise<NoahRecommendationContext> {
  const enabled = preferences.some(p => p.kind === 'personalize' && p.subject === 'enabled');
  const tags = new Set<string>();
  if (owner && enabled && settings.historyEnabled) {
    // Select metadata only. No prompt, result text, file contents or other users.
    // Successful runs starting after consent/erase, completed before this page's
    // snapshot, prevent late completions from resurrecting erased history.
    const rows = (await db.prepare(`SELECT json_extract(payload,'$.noahExecution.agentId') AS agent_id
      FROM work_jobs WHERE user_id=? AND json_extract(payload,'$.noahExecution.state')='returned'
      AND json_extract(payload,'$.noahExecution.result.exitCode')=0
      AND json_extract(payload,'$.noahExecution.startedAt')>?
      AND json_extract(payload,'$.noahExecution.completedAt')<=?
      ORDER BY json_extract(payload,'$.noahExecution.completedAt') DESC,id DESC LIMIT 500`)
      .bind(owner, Math.max(settings.historySince, asOf - 30 * 86400000), asOf).all<{agent_id:string}>()).results;
    for (const row of rows) {
      for (const tag of publicTags(row.agent_id)) if (tags.size < 64) tags.add(normalizeRecommendationTag(tag));
    }
  }
  return { enabled, fingerprint: await noahSha256(new TextEncoder().encode(JSON.stringify([owner, settings, preferences]))),
    interests: preferences.filter(p=>p.kind==='interest').map(p=>normalizeRecommendationTag(p.subject)),
    followed: preferences.filter(p=>p.kind==='follow').map(p=>p.subject), hidden: preferences.filter(p=>p.kind==='hide').map(p=>p.subject),
    historyTags: [...tags].sort(), runtime: settings.runtime };
}

export function createNoahRecommendationsApi({ db, authenticate, clock = Date.now }: { db: Database; authenticate: (r:Request)=>Promise<string>; clock?:()=>number }) {
  const json = (data:unknown, status=200) => Response.json(data, {status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  async function handle(request:Request, mutate:boolean) {
    try {
      const owner = await authenticate(request), scope = await ownerScopeFor(owner);
      if (mutate) {
        if (request.headers.get('origin') !== new URL(request.url).origin) throw new NoahAgentError('同じNoahから操作してください。',403);
        if (request.headers.get(OWNER_SCOPE_HEADER) !== scope) throw new NoahAgentError('アカウントが変わりました。読み直してください。',409);
        if (!request.headers.get('content-type')?.startsWith('application/json')) throw new NoahAgentError('JSONで操作してください。',415);
        const input = JSON.parse(new TextDecoder().decode(await boundedNoahBody(request,2048)));
        if (!input || Array.isArray(input) || Object.keys(input).some(k=>!['revision','historyEnabled','runtime','clearHistory'].includes(k)) || !Number.isSafeInteger(input.revision) || input.revision < 0 || typeof input.historyEnabled !== 'boolean' || !noahRuntimePreferences.includes(input.runtime) || typeof input.clearHistory !== 'boolean') throw new NoahAgentError('推薦の設定を確認してください。');
        const previous = await noahRecommendationSettings(db,owner);
        if (previous.revision !== input.revision) throw new NoahAgentError('設定が更新されています。読み直してください。',409);
        const since = input.clearHistory || previous.historyEnabled !== input.historyEnabled ? Math.max(clock(),previous.historySince+1) : previous.historySince;
        const saved = await db.prepare(`INSERT INTO noah_recommendation_settings(owner_id,revision,history_enabled,history_since,runtime,updated_at)
          VALUES(?,1,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET revision=revision+1,history_enabled=excluded.history_enabled,
          history_since=excluded.history_since,runtime=excluded.runtime,updated_at=excluded.updated_at WHERE revision=? RETURNING revision`)
          .bind(owner,Number(input.historyEnabled),since,input.runtime,clock(),input.revision).all();
        if (!saved.results.length) throw new NoahAgentError('別の画面で設定が変更されました。読み直してください。',409);
      }
      return json({settings:await noahRecommendationSettings(db,owner),ownerScope:scope});
    } catch(e) {
      if(e instanceof NoahAgentError) return json({error:e.message},e.status);
      if(e instanceof Error && e.message==='UNAUTHORIZED') return json({error:'サインインが必要です。'},401);
      if(e instanceof SyntaxError) return json({error:'入力形式を確認してください。'},400);
      return json({error:'推薦の設定を確認できません。再試行してください。'},503);
    }
  }
  return { get:(r:Request)=>handle(r,false), put:(r:Request)=>handle(r,true) };
}
