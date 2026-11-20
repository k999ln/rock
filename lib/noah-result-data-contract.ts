export const NOAH_DATA_POLICY = 'noah-quality-v1';
export type NoahDataFile = { name: string; base64: string; sha256: string; bytes: number };
export type NoahDataResult = {
  agentId: string; version: string; completedAt: string;
  verification: 'host_observed_unverified';
  text: string; files: NoahDataFile[]; exitCode: number;
};
export type NoahDataSummary = { id: string; agentId: string; completedAt: string; state?: 'active' | 'revoked' };
export type NoahContribution = { id: string; state: 'active' | 'revoked'; createdAt: number; revokedAt: number | null };
export type NoahDataDetail = {
  id: string; revision?: number; result: NoahDataResult;
  contribution?: NoahContribution | null; sourceSha256?: string; policyVersion?: string;
};
export type NoahDataResponse = {
  ownerScope: string; operatorAllowed: boolean; items?: NoahDataSummary[]; nextCursor?: string | null;
  detail?: NoahDataDetail; contribution?: NoahContribution; error?: string;
};
