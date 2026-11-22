import { requestUser } from '@/lib/request-auth';
import { ownerScopeFor } from '@/lib/owner-intent';
export async function GET(request: Request) {
  try {
    const user = await requestUser(request);
    const url = new URL(request.url);
    return Response.json({ ownerScope: await ownerScopeFor(user), localHostOwner: user === 'local-preview:rockstar-owner' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: '本人の接続を確認できません。' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }); }
}
