import { env, waitUntil } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { createNoahOutboxApi } from './noah-outbox-api';
export const noahOutboxApi=()=>createNoahOutboxApi({db:database(),authenticate:requestUser,bindings:env as unknown as Record<string,unknown>,defer:waitUntil});
