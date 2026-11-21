import { createNoahAskApi } from '@/lib/noah-ask';
import { noahRemoteDependencies } from '@/lib/noah-remote-server';
export const GET = (request: Request) => createNoahAskApi(noahRemoteDependencies())(request);
export const POST = GET;
