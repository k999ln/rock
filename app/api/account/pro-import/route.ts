import { env } from 'cloudflare:workers';
import { requestUser, database } from '@/lib/fund-store';
import { eveHistoryKeys } from '@/lib/eve-history';
import { createProImportHandler } from '@/lib/pro-account-import.server';

const handle = createProImportHandler({ authenticate: requestUser, database,
  keys: () => eveHistoryKeys((env as unknown as { EVE_HISTORY_KEYRING?: string }).EVE_HISTORY_KEYRING) });
export const GET = handle;
export const POST = handle;
