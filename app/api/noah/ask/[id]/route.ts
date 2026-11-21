import { createNoahAskApi } from '@/lib/noah-ask';
import { noahRemoteDependencies } from '@/lib/noah-remote-server';
export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) => createNoahAskApi(noahRemoteDependencies())(request, (await params).id);
export const POST = GET;
