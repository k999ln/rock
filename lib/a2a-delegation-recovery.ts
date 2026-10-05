export type A2ADelegationRecoveryRequest = {
  id: string;
  parentJobId: string;
  predecessorDelegationId?: string | null;
  idempotencyKey: string;
  messageId: string;
  targetOrigin: string;
  targetAgentName: string;
  targetAgentVersion: string;
  message: string;
  budgetCurrency: string;
  budgetLimitMinor: number;
  parentBudgetLimitMinor: number;
  continueWhileDeviceOffline: boolean;
  deadlineAt: number;
};

export type A2ADelegationRecoveryRecord = {
  id: string;
  parentJobId: string;
  predecessorDelegationId?: string | null;
  idempotencyKey: string;
  messageId: string;
  targetOrigin: string;
  targetAgentName: string;
  targetAgentVersion: string;
  inputSha256: string;
  authorizationSha256: string;
  state: string;
  budgetCurrency: string;
  budgetLimitMinor: number;
  parentBudgetLimitMinor: number;
  continueWhileDeviceOffline: boolean;
  deadlineAt: number;
};

/** Accept a lost-response lookup only when every persisted intent field matches. */
export function matchesA2ADelegationRecovery(
  request: A2ADelegationRecoveryRequest,
  record: A2ADelegationRecoveryRecord | null | undefined,
  inputSha256: string,
): record is A2ADelegationRecoveryRecord {
  return !!record &&
    /^[a-f0-9]{64}$/.test(inputSha256) &&
    record.id === request.id &&
    record.parentJobId === request.parentJobId &&
    (record.predecessorDelegationId ?? null) === (request.predecessorDelegationId ?? null) &&
    record.idempotencyKey === request.idempotencyKey &&
    record.messageId === request.messageId &&
    record.targetOrigin === request.targetOrigin &&
    record.targetAgentName === request.targetAgentName &&
    record.targetAgentVersion === request.targetAgentVersion &&
    record.inputSha256 === inputSha256 &&
    /^[a-f0-9]{64}$/.test(record.authorizationSha256) &&
    typeof record.state === 'string' && record.state.length > 0 &&
    record.budgetCurrency === request.budgetCurrency &&
    record.budgetLimitMinor === request.budgetLimitMinor &&
    record.parentBudgetLimitMinor === request.parentBudgetLimitMinor &&
    record.continueWhileDeviceOffline === request.continueWhileDeviceOffline &&
    record.deadlineAt === request.deadlineAt;
}
