export type DecisionErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_RESULT'
  | 'SECRET_DATA_PROHIBITED'
  | 'CLOUD_CONSENT_REQUIRED'
  | 'OFFLINE_REQUIRED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_OVERLOADED'
  | 'PROVIDER_HTTP_ERROR'
  | 'PROVIDER_MALFORMED_RESPONSE'
  | 'PROVIDER_ABORTED'
  | 'POLICY_BLOCKED'
  | 'DATA_CLASS_UNSUPPORTED'
  | 'RETRY_LIMIT_EXCEEDED'
  | 'MAX_LATENCY_EXCEEDED'
  | 'MAX_COST_EXCEEDED';

/**
 * A bounded, code-only error that is safe to expose to observability.
 * Provider responses and credentials must never be copied into its message.
 */
export class DecisionError extends Error {
  readonly code: DecisionErrorCode;
  readonly retryable: boolean;

  constructor(
    code: DecisionErrorCode,
    message: string = code,
    options: { retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'DecisionError';
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

export function decisionErrorCode(error: unknown): DecisionErrorCode {
  if (error instanceof DecisionError) return error.code;
  return 'PROVIDER_HTTP_ERROR';
}

export function isRetryableDecisionError(error: unknown): boolean {
  return error instanceof DecisionError && error.retryable;
}
