import { createNoahConnectApi } from '@/lib/noah-connect';
import { noahRemoteDependencies } from '@/lib/noah-remote-server';
export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) => createNoahConnectApi(noahRemoteDependencies())(request, (await params).id);
export const POST = GET;
