import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
import { NOAH_EVE_HERMES_PROJECT, NOAH_CLOUD_PROFILES, noahCloudDigest, noahCloudId } from './noah-cloud-contract.ts';
import { noahSearchTerms, noahSearchMatcher } from './noah-search-terms.ts';
import { validEveMessages, parseEveChatReply, type EveChatCandidate } from './eve-chat.ts';
import type { DirectoryEntry } from './noah-agent-directory.ts';
export function eveChatCandidates(entries: DirectoryEntry[], query: string): EveChatCandidate[] {
  const matchers = noahSearchTerms(query).map(group => noahSearchMatcher([group]));
  return entries.map(entry => ({ entry, score: matchers.reduce((sum, match) => sum + Number(match((entry.card.name + ' ' + entry.card.summary).toLowerCase())), 0) }))
    .filter(({ entry, score }) => score > 0 && /^project-[a-f0-9]{64}$/.test(entry.card.feedbackId ?? entry.card.id))
    .sort((a, b) => b.score - a.score).slice(0, 6)
    .map(({ entry: { card } }) => ({ id: card.feedbackId ?? card.id, name: card.name.slice(0, 100), summary: card.summary.slice(0, 300) }));
}
type Dependencies = { authenticate: (request: Request) => Promise<string>; directory: () => Promise<DirectoryEntry[]>; authorize: (owner: string, target: string, action: string, digest: string, confirmed: boolean) => Promise<void>; runtime: (body: Record<string, unknown>) => Promise<Response>; available: boolean };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization', 'X-Content-Type-Options': 'nosniff' } });
/** No database, Work, receipt or transcript persistence dependency. */
export function createEveChatApi(deps: Dependencies) {
  return async (request: Request) => {
    try {
      if (!['GET', 'POST'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
      const owner = await deps.authenticate(request), ownerScope = await ownerScopeFor(owner);
      if (request.method === 'GET') return json({ ownerScope, available: deps.available });
      if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: '同じNoahから送信してください。' }, 403);
      if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope) return json({ error: '利用者が変わりました。画面を読み直してください。' }, 409);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSONで送信してください。' }, 415);
      const body = JSON.parse(new TextDecoder().decode(await boundedNoahBody(request, 20000)));
      if (!body || !noahCloudId(body.id) || !validEveMessages(body.messages) || Object.keys(body).some(key => !['id', 'messages', 'confirm'].includes(key))) return json({ error: '相談は短く分けて送信してください。' }, 400);
      if (!deps.available) return json({ error: 'Eveのクラウドを準備中です。入力は端末に残ります。' }, 503);
      try { await deps.authorize(owner, NOAH_EVE_HERMES_PROJECT, 'run', await noahCloudDigest(JSON.stringify(NOAH_CLOUD_PROFILES.hermes)), body.confirm === true); }
      catch (error) { if (error instanceof NoahAgentError && error.status === 409) return json({ error: error.message, confirmationRequired: true }, 409); throw error; }
      const candidates = eveChatCandidates(await deps.directory(), body.messages.filter((m: { role: string }) => m.role === 'user').map((m: { content: string }) => m.content).join(' ').slice(-6000));
      const response = await deps.runtime({ action: 'chat', owner: await noahCloudDigest(owner), id: body.id, messages: body.messages, candidates });
      if (!response.ok) { await response.body?.cancel(); return json({ error: response.status === 429 ? 'クラウドの利用枠が埋まっています。時間をおいて再送できます。会話はこの端末に残っています。' : '返答を受け取れませんでした。時間をおいてもう一度送信してください。' }, response.status === 429 ? 429 : 503); }
      const result = parseEveChatReply(await response.json(), candidates);
      if (!result) return json({ error: '設計案を読み取れませんでした。もう一度送信してください。' }, 502);
      return json({ ...result, candidates, ownerScope });
    } catch (error) {
      if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Noahを読み直して利用を開始してください。' }, 401);
      return json({ error: error instanceof NoahAgentError ? error.message : 'Eveに接続できませんでした。入力は端末に残ります。' }, error instanceof NoahAgentError ? error.status : error instanceof SyntaxError ? 400 : 503);
    }
  };
}
