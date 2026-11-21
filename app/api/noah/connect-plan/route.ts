import { createNoahConnectPlanApi } from '@/lib/noah-connect';
import { noahRemoteDependencies } from '@/lib/noah-remote-server';
export const GET = (request: Request) => createNoahConnectPlanApi(noahRemoteDependencies())(request);
export const POST = GET;
