import { createNoahRetentionApi } from '@/lib/noah-retention-api';
import { noahRetentionDependencies } from '@/lib/noah-retention-server';
export const GET = (request: Request) => createNoahRetentionApi(noahRetentionDependencies())(request);
