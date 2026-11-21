import { createNoahConnectApi } from '@/lib/noah-connect';
import { noahRemoteDependencies } from '@/lib/noah-remote-server';
export const GET = (request: Request) => createNoahConnectApi(noahRemoteDependencies())(request);
export const POST = GET;
