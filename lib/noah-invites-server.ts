import { env } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { createNoahInviteApi } from './noah-invites';
export function noahInviteApi() { return createNoahInviteApi({ db: database(), authenticate: requestUser, bucket: (env as unknown as { BUCKET?: R2Bucket }).BUCKET }); }
