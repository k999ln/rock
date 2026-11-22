import type { ProfileField } from './noah-profile-contract.ts';
export type RegistrationField = { key: string; label: string; type: 'text' | 'email' | 'password' | 'file'; profileField?: ProfileField | 'identityDocument'; required: boolean; maxLength: number };
export type RegistrationProvider = {
  id: string; name: string; agentIds: string[]; revision: number; providerOrigin: string;
  verificationUrl: string; termsUrl: string; termsVersion: string;
  executorName: string; executorOrigin: string; fields: RegistrationField[];
  accountState?: 'ready' | 'pending' | 'unavailable' | 'cooldown';
  retryAt?: number;
  requiresAccount?: boolean; notice?: string; execution?: 'browser'; mcpUrl?: string;
};
export type RegistrationState = 'running' | 'needs_user' | 'completed' | 'failed' | 'unknown';
export type RegistrationOutcome = RegistrationState | { state: 'failed'; retryAt: number };
export type RegistrationAvailability = 'ready' | 'pending' | 'unavailable' | { accountState: 'cooldown'; retryAt: number };
export type RegistrationRecord = {
  schema: 'noah-registration/1'; providerId: string; providerName: string; providerRevision: number; providerDigest: string;
  providerOrigin: string; agentId: string; requestDigest: string; termsVersion: string;
  state: RegistrationState; startedAt: number; lastCheckedAt: number; expiresAt: number;
  retryAt?: number;
  verification: 'registration_agent_reported';
};
export type RegistrationStatus = {
  id: string; providerName: string; providerOrigin: string; agentId: string; state: RegistrationState;
  expiresAt: number; verificationUrl: string | null; returnTo: string;
  retryAt?: number;
};
