import { noahDraftApi } from '@/lib/noah-drafts-server';
export const GET = async (request: Request, context: { params: Promise<{ id: string }> }) => noahDraftApi().download(request, (await context.params).id);
