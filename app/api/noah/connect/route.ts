import { createNoahConnectApi } from '@/lib/noah-connect';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
export const GET = (request: Request) => createNoahConnectApi(noahIntakeDependencies()).collection(request);
export const POST = (request: Request) => createNoahConnectApi(noahIntakeDependencies()).collection(request);
