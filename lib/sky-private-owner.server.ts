import { env } from 'cloudflare:workers';
import { requestUser } from './fund-store.ts';
import { privateSkyOwnersAllowed } from './sky-app-foundation.ts';
import { WorkError } from './workflow.ts';

/** Private preview remains closed on an ordinary public deployment. */
export async function skyPrivateOwner(request: Request): Promise<string> {
  const allowed = (env as unknown as { SKY_APP_WORK_PRIVATE_OWNERS?: string }).SKY_APP_WORK_PRIVATE_OWNERS;
  if (!allowed) throw new WorkError('見つかりません。', 404);
  const user = await requestUser(request);
  if (!privateSkyOwnersAllowed(user, allowed)) throw new WorkError('見つかりません。', 404);
  return user;
}
