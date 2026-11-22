import { noahAgentDirectory } from '@/lib/noah-agent-directory-server';
import { createNoahProjectApi } from '@/lib/noah-project-api';
export const GET = (request: Request) => createNoahProjectApi({ directory: noahAgentDirectory })(request);
