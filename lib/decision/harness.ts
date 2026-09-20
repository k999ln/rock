import { DecisionError, decisionErrorCode } from './errors.ts';
import { emitDecisionEvent, eventId, buildReceipt } from './observability.ts';
import { digestResult, requestInputDigest } from './digest.ts';
import { DecisionPolicy, defaultDecisionPolicy } from './policy.ts';
import { DecisionRouter, type Catalog } from './router.ts';
import {
  validateDecisionRequest,
  validateDecisionResult,
} from './validation.ts';
import type {
  DecisionEvent,
  DecisionObserver,
  DecisionProvider,
  DecisionRequest,
  HarnessOutcome,
  ProviderId,
  RouterContext,
} from './types.ts';

type HarnessOptions = {
  providers?: Catalog;
  policy?: DecisionPolicy;
  router?: DecisionRouter;
  observer?: DecisionObserver;
  now?: () => Date;
  context?: RouterContext;
  /** Explicit test-only switch for the non-production MockDecisionProvider. */
  allowMock?: boolean;
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function elapsed(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function available(
  provider: DecisionProvider | undefined,
  health: 'available' | 'unavailable' | undefined,
): boolean {
  return Boolean(provider && health === 'available');
}

function withAvailabilityOverride(
  advertised: boolean | undefined,
  healthy: boolean,
): boolean {
  return advertised === false ? false : healthy;
}

async function healthWithin(
  provider: DecisionProvider | undefined,
  timeoutMs: number,
): Promise<'available' | 'unavailable' | undefined> {
  if (!provider) return undefined;
  if (timeoutMs <= 0) return 'unavailable';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<'unavailable'>((resolve) => {
      timer = setTimeout(() => resolve('unavailable'), timeoutMs);
    });
    const health = await Promise.race([provider.health(), timeout]);
    return health === 'unavailable' ? 'unavailable' : health.status;
  } catch {
    return 'unavailable';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function remainingBudget(started: number, maxLatencyMs: number): number {
  return maxLatencyMs - (performance.now() - started);
}

async function decideWithinBudget(
  provider: DecisionProvider,
  request: DecisionRequest,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Awaited<ReturnType<DecisionProvider['decide']>>> {
  if (timeoutMs <= 0)
    throw new DecisionError(
      'MAX_LATENCY_EXCEEDED',
      'decision latency budget exceeded',
    );
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  let timedOut = false;
  try {
    const decision = Promise.resolve().then(() =>
      provider.decide(request, controller.signal),
    );
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          timedOut = true;
          controller.abort();
          reject(
            new DecisionError(
              'MAX_LATENCY_EXCEEDED',
              'decision latency budget exceeded',
            ),
          );
        },
        Math.max(1, Math.floor(timeoutMs)),
      );
    });
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => {
        controller.abort();
        reject(
          new DecisionError('PROVIDER_ABORTED', 'decision request aborted'),
        );
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
    });
    try {
      return await Promise.race([decision, timeout, aborted]);
    } catch (error) {
      if (timedOut)
        throw new DecisionError(
          'MAX_LATENCY_EXCEEDED',
          'decision latency budget exceeded',
        );
      throw error;
    }
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    controller.abort();
  }
}

function isLowRiskFallback(request: DecisionRequest): boolean {
  return (
    (request.effect === 'none' || request.effect === 'local-pure') &&
    request.dataClasses.every((dataClass) => dataClass === 'public')
  );
}

/**
 * Executes at most two distinct providers and at most request.maxAttempts.
 * Providers can only return typed advice; this class never invokes a Tool,
 * Wallet, MCP, shell, or other external action.
 */
export class DecisionHarness {
  private readonly providers: Catalog;
  private readonly policy: DecisionPolicy;
  private readonly router: DecisionRouter;
  private readonly observer?: DecisionObserver;
  private readonly now: () => Date;
  private readonly context: RouterContext;
  private readonly allowMock: boolean;

  constructor(options: HarnessOptions = {}) {
    this.providers = options.providers ?? {};
    this.allowMock = options.allowMock ?? false;
    this.policy =
      options.policy ??
      (this.allowMock
        ? new DecisionPolicy({ allowMock: true })
        : defaultDecisionPolicy);
    this.router = options.router ?? new DecisionRouter(this.policy);
    this.observer = options.observer;
    this.now = options.now ?? (() => new Date());
    this.context = options.context ?? {};
  }

  private observe(
    request: DecisionRequest,
    input: Omit<
      DecisionEvent,
      | 'schemaVersion'
      | 'eventId'
      | 'ownerRef'
      | 'workId'
      | 'requestId'
      | 'policyVersion'
      | 'inputDigest'
      | 'timestamp'
    >,
  ): void {
    emitDecisionEvent(this.observer, {
      schemaVersion: 1,
      eventId: eventId(),
      ownerRef: request.ownerRef,
      workId: request.workId,
      requestId: request.requestId,
      policyVersion: request.policyVersion,
      inputDigest: this.inputDigest(request),
      timestamp: this.now().toISOString(),
      ...input,
    });
  }

  private inputDigest(request: DecisionRequest): string {
    // Importing this lazily keeps the event construction above easy to audit.
    // The value is a digest of metadata and question/state digests only.
    return requestInputDigest(request);
  }

  private routedOutcome(
    request: DecisionRequest,
    routeDecision: ReturnType<DecisionRouter['route']>,
    started: number,
  ): HarnessOutcome | undefined {
    this.observe(request, {
      attempt: 0,
      phase: 'routed',
      route: routeDecision.route,
      provider: routeDecision.provider,
      status: 'routed',
      reasonCodes: routeDecision.reasonCodes,
      latencyMs: elapsed(started),
    });
    if (
      routeDecision.route !== 'CODE' &&
      routeDecision.route !== 'TOOL' &&
      routeDecision.route !== 'ASK_USER' &&
      routeDecision.route !== 'BLOCK'
    )
      return undefined;
    const status =
      routeDecision.route === 'ASK_USER'
        ? 'awaiting_user'
        : routeDecision.route === 'BLOCK'
          ? 'blocked'
          : 'routed';
    return {
      route: routeDecision.route,
      status,
      receipt: buildReceipt({
        request,
        route: routeDecision.route,
        status,
        reasonCodes: routeDecision.reasonCodes,
        attempt: 0,
        latencyMs: elapsed(started),
        now: this.now(),
      }),
    };
  }

  async decide(
    requestValue: DecisionRequest,
    signal?: AbortSignal,
    context: RouterContext = {},
  ): Promise<HarnessOutcome> {
    const request = validateDecisionRequest(requestValue);
    const started = performance.now();
    const preflight = this.policy.preflight(request);
    if (preflight.action === 'block' || preflight.action === 'ask_user') {
      const route = preflight.action === 'block' ? 'BLOCK' : 'ASK_USER';
      const status = preflight.action === 'block' ? 'blocked' : 'awaiting_user';
      this.observe(request, {
        attempt: 0,
        phase: 'blocked',
        route,
        status,
        reasonCodes: preflight.reasonCodes,
        latencyMs: elapsed(started),
      });
      return {
        route,
        status,
        receipt: buildReceipt({
          request,
          route,
          status,
          reasonCodes: preflight.reasonCodes,
          attempt: 0,
          latencyMs: elapsed(started),
          now: this.now(),
        }),
      };
    }

    const routeContext = { ...this.context, ...context };
    const routableProviders: Catalog = this.allowMock
      ? this.providers
      : { ...this.providers, mock: undefined };
    if (routeContext.codeCanHandle || routeContext.explicitToolRequired) {
      const routeDecision = this.router.route(request, routableProviders, {
        ...routeContext,
        localProviderAvailable: false,
        typesafeProviderAvailable: false,
        cloudProviderAvailable: false,
        mockProviderAvailable: false,
      });
      const earlyOutcome = this.routedOutcome(request, routeDecision, started);
      if (earlyOutcome) return earlyOutcome;
    }
    const healthTimeoutMs = Math.max(
      1,
      Math.floor(remainingBudget(started, request.constraints.maxLatencyMs)),
    );
    const [localHealth, typesafeHealth, cloudHealth, mockHealth] =
      await Promise.all([
        healthWithin(this.providers.local_qwen, healthTimeoutMs),
        request.constraints.offlineRequired
          ? Promise.resolve(undefined)
          : healthWithin(this.providers.typesafe_jev, healthTimeoutMs),
        request.constraints.offlineRequired
          ? Promise.resolve(undefined)
          : healthWithin(this.providers.cloud_llm, healthTimeoutMs),
        this.allowMock
          ? healthWithin(this.providers.mock, healthTimeoutMs)
          : Promise.resolve(undefined),
      ]);
    const routedContext: RouterContext = {
      ...routeContext,
      localProviderAvailable: withAvailabilityOverride(
        routeContext.localProviderAvailable,
        available(this.providers.local_qwen, localHealth),
      ),
      typesafeProviderAvailable: withAvailabilityOverride(
        routeContext.typesafeProviderAvailable,
        available(this.providers.typesafe_jev, typesafeHealth),
      ),
      cloudProviderAvailable: withAvailabilityOverride(
        routeContext.cloudProviderAvailable,
        available(this.providers.cloud_llm, cloudHealth),
      ),
      mockProviderAvailable: withAvailabilityOverride(
        routeContext.mockProviderAvailable,
        this.allowMock && available(this.providers.mock, mockHealth),
      ),
    };
    const routeDecision = this.router.route(
      request,
      routableProviders,
      routedContext,
    );
    const earlyOutcome = this.routedOutcome(request, routeDecision, started);
    if (earlyOutcome) return earlyOutcome;

    const maxAttempts = Math.min(request.constraints.maxAttempts, 3);
    const candidateLimit =
      routeDecision.route === 'JEV' && !isLowRiskFallback(request) ? 1 : 2;
    const candidates = unique(routeDecision.candidates).slice(
      0,
      candidateLimit,
    );
    const failures: string[] = [];
    let attempt = 0;
    let firstProvider: ProviderId | undefined;
    let lastProvider: ProviderId | undefined;
    for (const candidateId of candidates) {
      if (attempt >= maxAttempts) break;
      attempt += 1;
      const provider = this.providers[candidateId as keyof Catalog];
      lastProvider = candidateId as ProviderId;
      if (!firstProvider) firstProvider = candidateId as ProviderId;
      if (!provider) {
        failures.push('PROVIDER_UNAVAILABLE');
        this.observe(request, {
          attempt,
          phase: 'deciding',
          route: routeDecision.route,
          provider: candidateId as ProviderId,
          status: 'failed',
          reasonCodes: ['PROVIDER_UNAVAILABLE'],
          latencyMs: elapsed(started),
        });
        continue;
      }
      if (candidateId === 'mock' && !this.allowMock) {
        failures.push('MOCK_FIXTURE_DISABLED');
        this.observe(request, {
          attempt,
          phase: 'blocked',
          route: routeDecision.route,
          provider: candidateId,
          status: 'blocked',
          reasonCodes: ['MOCK_FIXTURE_DISABLED'],
          latencyMs: elapsed(started),
        });
        continue;
      }
      const providerPolicy = this.policy.checkProvider(
        request,
        provider.describe(),
      );
      if (providerPolicy.action !== 'allow') {
        failures.push(...providerPolicy.reasonCodes);
        this.observe(request, {
          attempt,
          phase: 'blocked',
          route: routeDecision.route,
          provider: candidateId as ProviderId,
          status: 'blocked',
          reasonCodes: providerPolicy.reasonCodes,
          latencyMs: elapsed(started),
        });
        continue;
      }
      try {
        const remaining = remainingBudget(
          started,
          request.constraints.maxLatencyMs,
        );
        const result = validateDecisionResult(
          await decideWithinBudget(provider, request, signal, remaining),
          request,
        );
        if (remainingBudget(started, request.constraints.maxLatencyMs) < 0)
          throw new DecisionError(
            'MAX_LATENCY_EXCEEDED',
            'decision latency budget exceeded',
          );
        if (
          result.usage.costMicros !== undefined &&
          result.usage.costMicros > request.constraints.maxCostMicros
        )
          throw new DecisionError(
            'MAX_COST_EXCEEDED',
            'decision cost budget exceeded',
          );
        if (result.provider !== candidateId)
          throw new DecisionError(
            'INVALID_RESULT',
            'provider identity mismatch',
          );
        if (result.status === 'failed' || result.status === 'blocked') {
          failures.push(...result.reasonCodes);
          this.observe(request, {
            attempt,
            phase: result.status === 'blocked' ? 'blocked' : 'completed',
            route: routeDecision.route,
            provider: result.provider,
            modelRevision: result.modelRevision,
            status: result.status,
            reasonCodes: result.reasonCodes,
            outputDigest: undefined,
            latencyMs: elapsed(started),
            usage: result.usage,
          });
          continue;
        }
        const resultStatus = result.status;
        this.observe(request, {
          attempt,
          phase: 'completed',
          route: routeDecision.route,
          provider: result.provider,
          modelRevision: result.modelRevision,
          status: resultStatus,
          reasonCodes: result.reasonCodes,
          outputDigest: digestResult(result),
          latencyMs: elapsed(started),
          usage: result.usage,
        });
        return {
          route: routeDecision.route,
          status: resultStatus,
          result,
          receipt: buildReceipt({
            request,
            route: routeDecision.route,
            status: resultStatus,
            reasonCodes: unique([
              ...routeDecision.reasonCodes,
              ...result.reasonCodes,
            ]),
            attempt,
            latencyMs: elapsed(started),
            provider: result.provider,
            ...(firstProvider && firstProvider !== result.provider
              ? { fallbackFrom: firstProvider }
              : {}),
            result,
            now: this.now(),
          }),
        };
      } catch (error) {
        const code = decisionErrorCode(error);
        failures.push(code);
        this.observe(request, {
          attempt,
          phase: 'deciding',
          route: routeDecision.route,
          provider: candidateId as ProviderId,
          status: 'failed',
          reasonCodes: [code],
          latencyMs: elapsed(started),
        });
      }
    }
    const reasonCodes = unique([
      ...routeDecision.reasonCodes,
      ...failures,
      'ALL_PROVIDERS_FAILED',
    ]);
    const status = 'failed' as const;
    return {
      route: routeDecision.route,
      status,
      receipt: buildReceipt({
        request,
        route: routeDecision.route,
        status,
        reasonCodes,
        attempt,
        latencyMs: elapsed(started),
        ...(lastProvider ? { provider: lastProvider } : {}),
        ...(firstProvider && lastProvider && firstProvider !== lastProvider
          ? { fallbackFrom: firstProvider }
          : {}),
        now: this.now(),
      }),
    };
  }
}
