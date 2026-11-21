import { createNoahConnectApi } from '@/lib/noah-connect';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) => createNoahConnectApi(noahIntakeDependencies()).tools(request, (await params).id);
