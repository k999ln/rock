import { createNoahConnectPlanApi } from '@/lib/noah-connect-plan-api';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
export const GET = (request: Request) => createNoahConnectPlanApi(noahIntakeDependencies())(request);
