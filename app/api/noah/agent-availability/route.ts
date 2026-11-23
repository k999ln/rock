import { createNoahAvailabilityApi } from '@/lib/noah-agent-availability-api';
import { noahVerifiedIdentities } from '@/lib/noah-verified-directory';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
import { createNoahProviderRuntime } from '@/lib/noah-provider-runtime';
export const GET = (request: Request) => {
  const deps = noahIntakeDependencies();
  return createNoahAvailabilityApi({ store: deps.availability, identities: noahVerifiedIdentities,
    waitUntil: deps.waitUntil, recheck: () => createNoahProviderRuntime(deps).checkAvailability() })(request);
};
