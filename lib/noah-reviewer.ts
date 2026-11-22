import { ownerScopeFor } from './owner-intent.ts';

/** Resolve a server-pinned account scope after authentication. This object is request-local. */
export function noahReviewerAccess(authenticate: (request: Request) => Promise<string>, ids = '', scopes = '') {
  const reviewers = ids.split(',').map(value => value.trim()).filter(Boolean);
  const pinned = new Set(scopes.split(',').map(value => value.trim()).filter(value => /^owner-v1:[a-f0-9]{64}$/.test(value)));
  return {
    reviewers,
    authenticate: async (request: Request) => {
      const owner = await authenticate(request);
      if (pinned.size && !reviewers.includes(owner) && pinned.has(await ownerScopeFor(owner))) reviewers.push(owner);
      return owner;
    },
  };
}
