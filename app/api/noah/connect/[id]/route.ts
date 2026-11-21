import { createNoahConnectApi } from '@/lib/noah-connect';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, { params }: Context) => createNoahConnectApi(noahIntakeDependencies()).item(request, (await params).id);
export const POST = async (request: Request, { params }: Context) => createNoahConnectApi(noahIntakeDependencies()).item(request, (await params).id);
