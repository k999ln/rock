import { database, requestUser } from '@/lib/fund-store';
import { ownerScopeFor } from '@/lib/owner-intent';
import { noahModelReferences } from '@/lib/noah-model-references';
import { NoahAgentError } from '@/lib/noah-agent-upload';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store, private' };
  try {
    const user = await requestUser(request);
    return Response.json(
      {
        references: await noahModelReferences(
          database(),
          user,
          new URL(request.url).searchParams.get('model') || '',
        ),
        ownerScope: await ownerScopeFor(user),
      },
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof NoahAgentError
            ? e.message
            : 'モデルの参照先を確認できません。',
      },
      {
        status:
          e instanceof NoahAgentError
            ? e.status
            : e instanceof Error && e.message === 'UNAUTHORIZED'
              ? 401
              : 503,
        headers,
      },
    );
  }
}
