import { createNoahAskApi } from '@/lib/noah-ask';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
export const GET = (request: Request) => createNoahAskApi(noahIntakeDependencies()).collection(request);
export const POST = (request: Request) => createNoahAskApi(noahIntakeDependencies()).collection(request);
