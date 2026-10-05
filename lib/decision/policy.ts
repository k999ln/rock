import { DecisionError } from './errors.ts';
import { containsSecret } from './digest.ts';
import { validateDecisionRequest } from './validation.ts';
import type {
  DecisionProvider,
  DecisionRequest,
  EffectClass,
  ProviderCapabilities,
} from './types.ts';

export type PolicyAction = 'allow' | 'ask_user' | 'block';

export type PolicyDecision = {
  action: PolicyAction;
  reasonCodes: string[];
};

export type DecisionPolicyOptions = {
  /** Fixture providers are opt-in and never enabled by the default policy. */
  allowMock?: boolean;
};

const REMOTE_PROVIDERS = new Set(['typesafe_jev', 'cloud_llm', 'openjev']);

function hasSecret(request: DecisionRequest): boolean {
  return (
    request.dataClasses.includes('secret') ||
    containsSecret(request.state) ||
    containsSecret(request.questions)
  );
}

/**
 * Hard checks that run before a provider can see a request. This function is
 * intentionally independent from confidence or model output.
 */
export class DecisionPolicy {
  private readonly options: DecisionPolicyOptions;

  constructor(options: DecisionPolicyOptions = {}) {
    this.options = options;
  }

  preflight(value: unknown): PolicyDecision {
    let request: DecisionRequest;
    try {
      request = validateDecisionRequest(value);
    } catch (error) {
      if (
        error instanceof DecisionError &&
        error.code === 'SECRET_DATA_PROHIBITED'
      )
        return { action: 'block', reasonCodes: ['SECRET_DATA_PROHIBITED'] };
      throw error;
    }
    if (hasSecret(request))
      return { action: 'block', reasonCodes: ['SECRET_DATA_PROHIBITED'] };
    if (request.effect === 'external-write')
      return {
        action: 'ask_user',
        reasonCodes: ['EXTERNAL_WRITE_REQUIRES_APPROVAL'],
      };
    return { action: 'allow', reasonCodes: [] };
  }

  checkProvider(
    request: DecisionRequest,
    capabilities: ProviderCapabilities,
  ): PolicyDecision {
    if (capabilities.id === 'mock' && !this.options.allowMock)
      return { action: 'block', reasonCodes: ['MOCK_FIXTURE_DISABLED'] };
    if (hasSecret(request))
      return { action: 'block', reasonCodes: ['SECRET_DATA_PROHIBITED'] };
    if (request.constraints.offlineRequired && capabilities.network !== 'none')
      return { action: 'block', reasonCodes: ['OFFLINE_REQUIRED'] };
    if (
      !request.constraints.cloudAllowed &&
      REMOTE_PROVIDERS.has(capabilities.id)
    )
      return { action: 'block', reasonCodes: ['CLOUD_CONSENT_REQUIRED'] };
    if (!capabilities.supportsPurposes.includes(request.purpose))
      return { action: 'block', reasonCodes: ['PURPOSE_UNSUPPORTED'] };
    if (
      !request.dataClasses.every((dataClass) =>
        capabilities.supportsDataClasses.includes(dataClass),
      )
    )
      return { action: 'block', reasonCodes: ['DATA_CLASS_UNSUPPORTED'] };
    if (!capabilities.supportsEffects.includes(request.effect))
      return { action: 'block', reasonCodes: ['EFFECT_UNSUPPORTED'] };
    if (
      capabilities.execution !== 'shadow' &&
      capabilities.execution !== 'read-only'
    )
      return { action: 'block', reasonCodes: ['EXECUTION_MODE_UNSUPPORTED'] };
    return { action: 'allow', reasonCodes: [] };
  }

  assertProvider(request: DecisionRequest, provider: DecisionProvider): void {
    const decision = this.checkProvider(request, provider.describe());
    if (decision.action !== 'allow')
      throw new DecisionError('POLICY_BLOCKED', decision.reasonCodes[0]);
  }
}

export const defaultDecisionPolicy = new DecisionPolicy();

export function isRemoteProvider(
  provider: ProviderCapabilities | string,
): boolean {
  const id = typeof provider === 'string' ? provider : provider.id;
  return REMOTE_PROVIDERS.has(id);
}

export function effectRequiresUserApproval(effect: EffectClass): boolean {
  return effect === 'external-write';
}
