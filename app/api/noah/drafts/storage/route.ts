import { noahDraftApi } from '@/lib/noah-drafts-server';
export const GET = (request: Request) => noahDraftApi().storage(request);
export const POST = GET;
