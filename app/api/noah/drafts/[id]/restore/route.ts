import { noahDraftApi } from '@/lib/noah-drafts-server';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return noahDraftApi().restore(request, (await context.params).id); }
