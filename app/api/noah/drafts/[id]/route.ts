import { noahDraftApi } from '@/lib/noah-drafts-server';
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, context: Context) => noahDraftApi().get(request, (await context.params).id);
export const PUT = async (request: Request, context: Context) => noahDraftApi().put(request, (await context.params).id);
export const DELETE = async (request: Request, context: Context) => noahDraftApi().remove(request, (await context.params).id);
