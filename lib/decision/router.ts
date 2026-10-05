import { DecisionPolicy, defaultDecisionPolicy } from './policy.ts';
import { validateDecisionRequest } from './validation.ts';
import type {
  DecisionProvider,
  DecisionRequest,
  ProviderId,
  RouteDecision,
  RouterContext,
} from './types.ts';

export type Catalog = Partial<
  Record<
    'mock' | 'local_qwen' | 'typesafe_jev' | 'cloud_llm' | 'openjev',
    DecisionProvider
  >
>;

function healthAvailable(
  provider: DecisionProvider | undefined,
  advertised?: boolean,
): boolean {
  return advertised ?? Boolean(provider);
}

/**
 * Deterministic routing based on hard request metadata and explicit provider
 * availability. It never asks a model to choose a route.
 */
export class DecisionRouter {
  private readonly policy: DecisionPolicy;

  constructor(policy: DecisionPolicy = defaultDecisionPolicy) {
    this.policy = policy;
  }

  route(
    value: DecisionRequest,
    providers: Catalog = {},
    context: RouterContext = {},
  ): RouteDecision {
    const request = validateDecisionRequest(value);
    const preflight = this.policy.preflight(request);
    if (preflight.action === 'block')
      return {
        route: 'BLOCK',
        candidates: [],
        reasonCodes: preflight.reasonCodes,
      };
    if (preflight.action === 'ask_user')
      return {
        route: 'ASK_USER',
        candidates: [],
        reasonCodes: preflight.reasonCodes,
      };
    if (context.codeCanHandle)
      return {
        route: 'CODE',
        candidates: [],
        reasonCodes: ['DETERMINISTIC_FAST_PATH'],
      };
    if (context.explicitToolRequired)
      return {
        route: 'TOOL',
        candidates: [],
        reasonCodes: ['EXPLICIT_TOOL_REQUIRED'],
      };

    const localAvailable = healthAvailable(
      providers.local_qwen,
      context.localProviderAvailable,
    );
    const mockAvailable = healthAvailable(
      providers.mock,
      context.mockProviderAvailable,
    );
    const mockAllowed =
      mockAvailable &&
      providers.mock !== undefined &&
      this.policy.checkProvider(request, providers.mock.describe()).action ===
        'allow';
    const jevAvailable = healthAvailable(
      providers.typesafe_jev,
      context.typesafeProviderAvailable,
    );
    const cloudAvailable = healthAvailable(
      providers.cloud_llm,
      context.cloudProviderAvailable,
    );

    if (request.constraints.offlineRequired) {
      if (localAvailable)
        return {
          route: 'LOCAL_QWEN',
          provider: 'local_qwen',
          candidates: ['local_qwen'],
          reasonCodes: ['OFFLINE_REQUIRED'],
        };
      if (mockAllowed)
        return {
          route: 'LOCAL_QWEN',
          provider: 'mock',
          candidates: ['mock'],
          reasonCodes: ['OFFLINE_REQUIRED', 'MOCK_FIXTURE'],
        };
      return {
        route: 'ASK_USER',
        candidates: [],
        reasonCodes: ['LOCAL_PROVIDER_UNAVAILABLE_OFFLINE'],
      };
    }

    // TypeSafe's initial adapter accepts public data only. Keep private and
    // confidential requests on a local provider when one is available.
    if (request.dataClasses.some((dataClass) => dataClass !== 'public')) {
      if (localAvailable)
        return {
          route: 'LOCAL_QWEN',
          provider: 'local_qwen',
          candidates: ['local_qwen'],
          reasonCodes: ['PRIVATE_DATA_LOCAL_ONLY'],
        };
      if (mockAllowed)
        return {
          route: 'LOCAL_QWEN',
          provider: 'mock',
          candidates: ['mock'],
          reasonCodes: ['PRIVATE_DATA_MOCK_FIXTURE'],
        };
      return {
        route: 'ASK_USER',
        candidates: [],
        reasonCodes: ['PRIVATE_DATA_LOCAL_PROVIDER_UNAVAILABLE'],
      };
    }

    if (
      request.purpose === 'generate' ||
      request.purpose === 'plan' ||
      context.complexGeneration
    ) {
      if (cloudAvailable && request.constraints.cloudAllowed) {
        const candidates: ProviderId[] = localAvailable
          ? ['cloud_llm', 'local_qwen']
          : ['cloud_llm'];
        return {
          route: 'CLOUD_LLM',
          provider: 'cloud_llm',
          candidates,
          reasonCodes: ['COMPLEX_REASONING_REQUEST'],
        };
      }
      if (localAvailable)
        return {
          route: 'LOCAL_QWEN',
          provider: 'local_qwen',
          candidates: ['local_qwen'],
          reasonCodes: ['CLOUD_UNAVAILABLE_LOCAL_FALLBACK'],
        };
      if (mockAllowed)
        return {
          route: 'LOCAL_QWEN',
          provider: 'mock',
          candidates: ['mock'],
          reasonCodes: ['CLOUD_UNAVAILABLE_MOCK_FIXTURE'],
        };
      return {
        route: 'ASK_USER',
        candidates: [],
        reasonCodes: ['REASONING_PROVIDER_UNAVAILABLE'],
      };
    }

    if (jevAvailable && request.constraints.cloudAllowed) {
      const candidates: ProviderId[] = localAvailable
        ? ['typesafe_jev', 'local_qwen']
        : ['typesafe_jev'];
      return {
        route: 'JEV',
        provider: 'typesafe_jev',
        candidates,
        reasonCodes: ['ATOMIC_SEMANTIC_DECISION'],
      };
    }
    if (localAvailable)
      return {
        route: 'LOCAL_QWEN',
        provider: 'local_qwen',
        candidates: ['local_qwen'],
        reasonCodes: ['JEV_UNAVAILABLE_LOCAL_FALLBACK'],
      };
    if (mockAllowed)
      return {
        route: 'JEV',
        provider: 'mock',
        candidates: ['mock'],
        reasonCodes: ['MOCK_FIXTURE'],
      };
    return {
      route: 'ASK_USER',
      candidates: [],
      reasonCodes: ['DECISION_PROVIDER_UNAVAILABLE'],
    };
  }
}

export const defaultDecisionRouter = new DecisionRouter();

export function routeDecision(
  request: DecisionRequest,
  providers: Catalog = {},
  context: RouterContext = {},
): RouteDecision {
  return defaultDecisionRouter.route(request, providers, context);
}
