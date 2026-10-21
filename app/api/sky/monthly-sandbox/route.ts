import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { authorizeRemoteAiRequest, RemoteAiGuardError } from '@/lib/remote-ai-guard';
import { handleMonthlySandbox, monthlySandboxAllowed } from '@/lib/sky-monthly-sandbox-http';
async function handle(request: Request) {
  const mode = (env as unknown as Record<string,unknown>).SKY_MONTHLY_SANDBOX_MODE;
  if (!monthlySandboxAllowed(request, mode)) return new Response(null, { status: 404 });
  try {
    const db = database();
    const owner = await authorizeRemoteAiRequest(request, 'sky-monthly-sandbox', db);
    return handleMonthlySandbox(request, owner, db, mode);
  } catch (error) {
    return Response.json({ error: '本人確認または保存先を確認してください。' }, { status: error instanceof RemoteAiGuardError ? error.status : 503 });
  }
}
export const GET = handle;
export const POST = handle;
