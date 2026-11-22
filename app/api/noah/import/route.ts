import { noahAgentApi } from '@/lib/noah-agent-server';
export const POST = (request: Request) => noahAgentApi().importSource(request);
