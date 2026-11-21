import { createNoahShelfApi } from '@/lib/noah-shelf-api';
import { noahShelfDependencies } from '@/lib/noah-shelf-server';
export const GET = (request: Request) => createNoahShelfApi(noahShelfDependencies())(request);
export const POST = (request: Request) => createNoahShelfApi(noahShelfDependencies())(request);
