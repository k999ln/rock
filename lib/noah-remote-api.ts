import type { ProbeDependencies } from './noah-probe.ts';
import type { NoahFlags } from './noah-flags.ts';
import { noahAllowed } from './noah-flags.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
export type RemoteDependencies = ProbeDependencies & {
  authenticate: (request: Request) => Promise<string>;
  reviewers: string[];
  flags: NoahFlags;
  defer: (work: Promise<unknown>) => void;
};
export const remoteJson = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
export const remoteObject = (
  value: unknown,
): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export const remoteUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    value,
  );
export const remoteHash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function requireRemoteEnabled(
  deps: RemoteDependencies,
  owner: string | null,
  feature: 'list' | 'ask',
) {
  if (
    !noahAllowed(deps.flags, feature, !!owner && deps.reviewers.includes(owner))
  )
    throw new NoahAgentError(
      feature === 'list'
        ? 'まだ公開していません。'
        : '今は、新しい接続・依頼を受け付けていません。',
      feature === 'list' ? 404 : 503,
    );
}
export async function remoteIdentity(
  deps: RemoteDependencies,
  request: Request,
  optional = false,
) {
  let owner: string | null = null;
  try {
    owner = await deps.authenticate(request);
  } catch (e) {
    if (!optional || !(e instanceof Error && e.message === 'UNAUTHORIZED'))
      throw e;
  }
  return { owner, ownerScope: owner ? await ownerScopeFor(owner) : null };
}
export async function remoteBody(request: Request, scope: string | null) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new NoahAgentError('同じNoahから操作してください。', 403);
  if (!scope || request.headers.get(OWNER_SCOPE_HEADER) !== scope)
    throw new NoahAgentError(
      'アカウントが変わりました。再読込してください。',
      409,
    );
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new NoahAgentError('JSONで操作してください。', 415);
  const input: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(
      await boundedNoahBody(request, 16000),
    ),
  );
  if (!remoteObject(input))
    throw new NoahAgentError('入力形式を確認してください。');
  return input;
}
export async function remoteResponse(run: () => Promise<Response>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NoahAgentError)
      return remoteJson({ error: error.message }, error.status);
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return remoteJson({ error: 'サインインして続けてください。' }, 401);
    if (error instanceof SyntaxError)
      return remoteJson({ error: '入力形式を確認してください。' }, 400);
    return remoteJson(
      {
        error:
          'Noahの処理を確認できません。少し待ってから再読み込みしてください。',
      },
      503,
    );
  }
}
