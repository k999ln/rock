import { noahAgentApi } from '@/lib/noah-agent-server';
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, context: Context) => noahAgentApi().get(request, (await context.params).id);
export const DELETE = async (request: Request, context: Context) => noahAgentApi().remove(request, (await context.params).id);
