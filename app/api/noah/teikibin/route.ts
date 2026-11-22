import { createNoahTeikibinApi } from '@/lib/noah-teikibin-api';
import { noahTeikibinDependencies } from '@/lib/noah-teikibin-server';
export const GET = (request: Request) => createNoahTeikibinApi(noahTeikibinDependencies())(request);
export const POST = (request: Request) => createNoahTeikibinApi(noahTeikibinDependencies())(request);
