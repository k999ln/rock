import { noahIntakeDependencies } from './noah-intake-server';
import { createIntakeStore } from './noah-intake-store';
import { loadNoahShareAgent, noahShareId } from './noah-agent-share';

export async function publicNoahShareAgent(id: unknown) {
  if (!noahShareId(id)) return null;
  try {
    const deps = noahIntakeDependencies();
    return await loadNoahShareAgent(id, { publicListing: deps.flags.intakePublic, detail: createIntakeStore(deps).detail });
  } catch { return null; }
}
