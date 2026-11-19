import { noahAgentApi } from '@/lib/noah-agent-server';
export const GET = (request: Request) => noahAgentApi().list(request);
export const POST = (request: Request) => noahAgentApi().create(request);
