import { body, handle } from '@/lib/operations-api';
import { ownerScopeFor, rejectChangedOwner } from '@/lib/owner-intent';

export const GET = (request: Request) =>
  handle(request, async (store, user) => ({
    ...(await store.wallet()),
    ownerScope: await ownerScopeFor(user),
  }));

export const POST = (request: Request) =>
  handle(request, async (store, user) => {
    const mismatch = await rejectChangedOwner(request, user);
    if (mismatch) return mismatch;
    await store.book(await body(request));
    return { ...(await store.wallet()), ownerScope: await ownerScopeFor(user) };
  });
