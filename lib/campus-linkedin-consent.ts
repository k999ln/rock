import type { CampusId } from './campus.ts';

export const LINKEDIN_CAMPUS_CONSENT_VERSION =
  'campus-linkedin-basic-v1' as const;

export type LinkedInCampusDecision = {
  version: typeof LINKEDIN_CAMPUS_CONSENT_VERSION;
  campusId: CampusId;
  status: 'consented' | 'skipped';
  decidedAt: string;
  providerAuthorized: false;
  imported: false;
};

export function linkedinCampusDecisionStorageKey(campus: CampusId) {
  return `avocado-campus-linkedin-choice:${LINKEDIN_CAMPUS_CONSENT_VERSION}:${campus}`;
}

export function createLinkedInCampusDecision(
  campusId: CampusId,
  status: LinkedInCampusDecision['status'],
  decidedAt = new Date().toISOString(),
): LinkedInCampusDecision {
  if (!Number.isFinite(Date.parse(decidedAt)))
    throw new Error('Consent date is invalid.');
  return {
    version: LINKEDIN_CAMPUS_CONSENT_VERSION,
    campusId,
    status,
    decidedAt: new Date(decidedAt).toISOString(),
    providerAuthorized: false,
    imported: false,
  };
}

export function serializeLinkedInCampusDecision(
  decision: LinkedInCampusDecision,
) {
  return JSON.stringify(decision);
}

export function parseLinkedInCampusDecision(
  campus: CampusId,
  stored: string | null,
): LinkedInCampusDecision | null {
  if (!stored || stored.length > 2_000) return null;
  try {
    const value = JSON.parse(stored) as Partial<LinkedInCampusDecision>;
    if (
      value.version !== LINKEDIN_CAMPUS_CONSENT_VERSION ||
      value.campusId !== campus ||
      (value.status !== 'consented' && value.status !== 'skipped') ||
      typeof value.decidedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.decidedAt)) ||
      value.providerAuthorized !== false ||
      value.imported !== false
    )
      return null;
    return createLinkedInCampusDecision(campus, value.status, value.decidedAt);
  } catch {
    return null;
  }
}
