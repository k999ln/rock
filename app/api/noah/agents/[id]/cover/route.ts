import { noahAgentApi } from '@/lib/noah-agent-server';
export const GET = async (request: Request, context: { params: Promise<{ id: string }> }) =>
  noahAgentApi().cover(request, (await context.params).id);
