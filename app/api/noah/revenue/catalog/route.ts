import { createNoahRevenueCatalog } from '@/lib/noah-revenue-catalog';
import { noahAgentDirectory } from '@/lib/noah-agent-directory-server';
export const GET = createNoahRevenueCatalog(noahAgentDirectory);
