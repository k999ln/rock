import { env } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { createNoahAgentApi } from './noah-agent-api';
import { resolveLocalProcessing } from './noah-processing-receipt';
export function noahAgentApi() {
  return createNoahAgentApi({ authenticate: requestUser, db: database(), bucket: (env as unknown as { BUCKET?: R2Bucket }).BUCKET, resolveProcessing: resolveLocalProcessing });
}
