import { readOwnerScope } from './owner-intent.ts';
import { noahSha256 } from './noah-agent-upload.ts';

export type ComputePilot = { owners: string[]; expiresAt: number; id: string };
export const PILOT_JOB_LIMIT = 30;

// The operator must supply two authenticated owner scopes and an explicit UTC cutoff.
// The cohort ID binds enrollments and jobs to this exact configuration.
export async function readComputePilot(
  env: Record<string, unknown>,
): Promise<ComputePilot | null> {
  const raw = env.NOAH_COMPUTE_PILOT_OWNER_SCOPES,
    until = env.NOAH_COMPUTE_PILOT_UNTIL;
  if (
    typeof raw !== 'string' ||
    typeof until !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(until)
  )
    return null;
  const owners = raw
    .split(',')
    .map((s) => s.trim())
    .sort();
  const expiresAt = Date.parse(until);
  if (
    owners.length !== 2 ||
    owners[0] === owners[1] ||
    !owners.every(readOwnerScope) ||
    !Number.isFinite(expiresAt)
  )
    return null;
  if (new Date(expiresAt).toISOString().replace('.000Z', 'Z') !== until)
    return null;
  const id =
    'pilot.' +
    (await noahSha256(
      new TextEncoder().encode(JSON.stringify([owners, expiresAt])),
    ));
  return { owners, expiresAt, id };
}
