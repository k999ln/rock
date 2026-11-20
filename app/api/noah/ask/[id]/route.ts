import { createNoahAskApi } from '@/lib/noah-ask';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, { params }: Context) => createNoahAskApi(noahIntakeDependencies()).item(request, (await params).id);
export const POST = async (request: Request, { params }: Context) => createNoahAskApi(noahIntakeDependencies()).item(request, (await params).id);
