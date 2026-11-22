import { env } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { createNoahDraftApi } from './noah-drafts';
export function noahDraftApi() { return createNoahDraftApi({ authenticate: requestUser, db: database(), bucket: (env as unknown as { BUCKET?: R2Bucket }).BUCKET }); }
