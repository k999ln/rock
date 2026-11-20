import { createNoahDataApi } from '@/lib/noah-result-data-api';
import { noahDataDependencies } from '@/lib/noah-result-data-server';
export const GET = (request: Request) => createNoahDataApi(noahDataDependencies())(request);
export const POST = (request: Request) => createNoahDataApi(noahDataDependencies())(request);
