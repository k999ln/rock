import { noahDraftApi } from '@/lib/noah-drafts-server';
export const GET = (request: Request) => noahDraftApi().list(request);
