import { createNoahDirectoryApi } from '@/lib/noah-agent-directory-api';
import { noahPinsDependencies } from '@/lib/noah-pins-server';
import { noahAgentDirectory } from '@/lib/noah-agent-directory-server';
export const GET = (request: Request) => createNoahDirectoryApi({...noahPinsDependencies(), directory:noahAgentDirectory})(request);
