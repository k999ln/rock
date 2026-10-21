import { matchesSkyAddHostFit, type SkyAddDiscoveryContract, type SkyAddHostFit } from './sky-add-host-contract.ts';

/** Discovery gate only. The caller must obtain policy and grants from a verified host session on the server. */
export type SkyAddCapabilityEnvelope = {
  hostAppId: string;
  appVersion: string;
  disclosedPurposeIds: readonly string[];
  approvedScopes: readonly string[];
  approvedDataClasses: readonly string[];
  approvedFits: readonly SkyAddHostFit[];
};

export type SkyAddCandidateRequirement = SkyAddDiscoveryContract & {
  hostAppId: string;
  purposeId: string;
  requiredScopes: readonly string[];
  requiredDataClasses: readonly string[];
  requiredSdkMethods: readonly string[];
};

export type SkyAddGrantedHostScopes = {
  hostAppId: string;
  appVersion: string;
  scopes: readonly string[];
  supportedSdkMethods: readonly string[];
  userContextStatus: 'unauthenticated' | 'authenticated' | 'authorized';
  expiresAtEpochMs: number;
};

export type SkyAddCapabilityDecision =
  | 'candidate-only'
  | 'host-app-update-required'
  | 'host-reauthorization-required'
  | 'host-session-required'
  | 'host-action-unavailable';

function includesEvery(have: readonly string[], required: readonly string[]): boolean {
  return required.every((item) => have.includes(item));
}

/**
 * A candidate result never authorizes data access, Agent installation or execution.
 * The host App's review envelope and the user's current grant are separate gates.
 */
export function evaluateSkyAddCapabilityEnvelope(input: {
  candidate: SkyAddCandidateRequirement;
  requestedFit: SkyAddHostFit;
  envelope: SkyAddCapabilityEnvelope | null;
  grant: SkyAddGrantedHostScopes | null;
  nowEpochMs: number;
}): SkyAddCapabilityDecision {
  const { candidate, requestedFit, envelope, grant, nowEpochMs } = input;
  if (!envelope || envelope.hostAppId !== candidate.hostAppId) return 'host-app-update-required';
  if (!matchesSkyAddHostFit(candidate, requestedFit)) return 'host-app-update-required';
  if (!envelope.disclosedPurposeIds.includes(candidate.purposeId)
    || !includesEvery(envelope.approvedScopes, candidate.requiredScopes)
    || !includesEvery(envelope.approvedDataClasses, candidate.requiredDataClasses)
    || !envelope.approvedFits.some((fit) => fit.surface === requestedFit.surface
      && fit.inputSource === requestedFit.inputSource
      && fit.returnSlot === requestedFit.returnSlot)) return 'host-app-update-required';
  if (!grant || grant.hostAppId !== envelope.hostAppId || grant.appVersion !== envelope.appVersion
    || grant.userContextStatus !== 'authorized'
    || !Number.isFinite(nowEpochMs) || !Number.isFinite(grant.expiresAtEpochMs)
    || grant.expiresAtEpochMs <= nowEpochMs) {
    return 'host-session-required';
  }
  if (!includesEvery(grant.scopes, candidate.requiredScopes)) return 'host-reauthorization-required';
  if (!includesEvery(grant.supportedSdkMethods, candidate.requiredSdkMethods)) return 'host-action-unavailable';
  return 'candidate-only';
}
