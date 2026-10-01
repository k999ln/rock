import { experimental_evaluate as evaluate } from 'ai';
import {
  JEV_MODEL,
  JEV_ROUTING_RUBRIC,
  JEV_ROUTING_RUBRIC_ID,
} from './jev-evaluation.ts';

export type DecisionIntent =
  | 'route'
  | 'verify'
  | 'retrieve'
  | 'extract'
  | 'risk';
export type DecisionPrivacy = 'local-only' | 'remote-allowed';
export type DecisionComplexity = 'simple' | 'complex';
export type DecisionRisk = 'low' | 'high';
export type DecisionAction = 'none' | 'reversible' | 'irreversible';
export type DecisionDestination =
  | 'code'
  | 'local-qwen'
  | 'cloud-llm'
  | 'ask-user'
  | 'block';

export type DecisionRequest = {
  requestId: string;
  intent: DecisionIntent;
  state: string;
  privacy: DecisionPrivacy;
  complexity: DecisionComplexity;
  risk: DecisionRisk;
  action: DecisionAction;
};

export type DecisionResult = {
  requestId: string;
  destination: DecisionDestination;
  confidence: number;
  providerId: DecisionProviderId;
  reasonCode: string;
  authority: 'advisory-only';
  metadata?: Record<string, unknown>;
};

export type DecisionProviderId =
  | 'rule'
  | 'mock'
  | 'local-qwen'
  | 'typesafe-jev';

export interface DecisionProvider {
  readonly id: DecisionProviderId;
  canHandle(request: DecisionRequest): boolean;
  decide(request: DecisionRequest): Promise<DecisionResult>;
}

function result(
  request: DecisionRequest,
  providerId: DecisionProviderId,
  destination: DecisionDestination,
  reasonCode: string,
  confidence = 1,
): DecisionResult {
  return {
    requestId: request.requestId,
    destination,
    confidence,
    providerId,
    reasonCode,
    authority: 'advisory-only',
  };
}

export class RuleDecisionProvider implements DecisionProvider {
  readonly id = 'rule' as const;

  canHandle(): boolean {
    return true;
  }

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    if (request.action === 'irreversible')
      return result(
        request,
        this.id,
        'ask-user',
        'irreversible_action_requires_approval',
      );
    if (request.risk === 'high')
      return result(
        request,
        this.id,
        'ask-user',
        'high_risk_requires_human_review',
      );
    if (request.complexity === 'simple')
      return result(request, this.id, 'code', 'deterministic_fast_path');
    if (request.privacy === 'local-only')
      return result(
        request,
        this.id,
        'local-qwen',
        'privacy_requires_local_processing',
      );
    return result(
      request,
      this.id,
      'cloud-llm',
      'complex_remote_reasoning_candidate',
    );
  }
}

export type MockDecision =
  | Partial<DecisionResult>
  | ((request: DecisionRequest) => Partial<DecisionResult>);

export class MockDecisionProvider implements DecisionProvider {
  readonly id = 'mock' as const;
  private readonly decision: MockDecision;

  constructor(decision: MockDecision) {
    this.decision = decision;
  }

  canHandle(): boolean {
    return true;
  }

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    const value =
      typeof this.decision === 'function'
        ? this.decision(request)
        : this.decision;
    const destination = value.destination ?? 'ask-user';
    return result(
      request,
      this.id,
      destination,
      value.reasonCode ?? 'mock_decision',
      value.confidence ?? 0.5,
    );
  }
}

export type LocalQwenDecisionTransport = (
  request: DecisionRequest,
) => Promise<Pick<DecisionResult, 'destination' | 'confidence' | 'reasonCode'>>;

export class LocalQwenDecisionProvider implements DecisionProvider {
  readonly id = 'local-qwen' as const;
  private readonly transport?: LocalQwenDecisionTransport;

  constructor(transport?: LocalQwenDecisionTransport) {
    this.transport = transport;
  }

  canHandle(request: DecisionRequest): boolean {
    return Boolean(this.transport) && request.privacy === 'local-only';
  }

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    if (!this.transport) throw new Error('LOCAL_QWEN_UNAVAILABLE');
    const decision = await this.transport(request);
    return {
      ...result(
        request,
        this.id,
        decision.destination,
        decision.reasonCode,
        decision.confidence,
      ),
      metadata: { transport: 'local-action-assistant-binder-v2' },
    };
  }
}

type JevRouteAnswer = {
  type: 'choice';
  choice: string;
  probabilities?: Record<string, number>;
};

export type JevEvaluate = typeof evaluate;

export class TypeSafeJevProvider implements DecisionProvider {
  readonly id = 'typesafe-jev' as const;
  private readonly apiKey: string;
  private readonly evaluateFn: JevEvaluate;

  constructor(apiKey: string, evaluateFn: JevEvaluate = evaluate) {
    this.apiKey = apiKey;
    this.evaluateFn = evaluateFn;
  }

  canHandle(request: DecisionRequest): boolean {
    return request.privacy === 'remote-allowed';
  }

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    if (!this.apiKey) throw new Error('TYPE_SAFE_JEV_UNAVAILABLE');
    const evaluated = await this.evaluateFn({
      model: JEV_MODEL,
      state: JSON.stringify(request),
      questions: JEV_ROUTING_RUBRIC,
      maxRetries: 0,
      headers: { Authorization: `Bearer ${this.apiKey}` },
      providerOptions: { gateway: { zeroDataRetention: true } },
    });
    const answer = evaluated.answers.destination as unknown as JevRouteAnswer;
    const allowed: DecisionDestination[] = [
      'code',
      'local-qwen',
      'cloud-llm',
      'ask-user',
      'block',
    ];
    if (
      !answer ||
      answer.type !== 'choice' ||
      !allowed.includes(answer.choice as DecisionDestination)
    )
      throw new Error('TYPE_SAFE_JEV_INVALID_RESPONSE');
    const probability = answer.probabilities?.[answer.choice];
    const confidence =
      typeof probability === 'number' && Number.isFinite(probability)
        ? Math.min(1, Math.max(0, probability))
        : 0.5;
    return {
      ...result(
        request,
        this.id,
        answer.choice as DecisionDestination,
        'typesafe_jev_routing',
        confidence,
      ),
      metadata: {
        rubricId: JEV_ROUTING_RUBRIC_ID,
        usage: evaluated.usage,
      },
    };
  }
}

export class DecisionRouter {
  private readonly rules: DecisionProvider;
  private readonly providers: readonly DecisionProvider[];

  constructor(
    rules: DecisionProvider = new RuleDecisionProvider(),
    providers: readonly DecisionProvider[] = [],
  ) {
    this.rules = rules;
    this.providers = providers;
  }

  async route(request: DecisionRequest): Promise<DecisionResult> {
    const baseline = await this.rules.decide(request);
    if (baseline.destination === 'code' || baseline.destination === 'ask-user')
      return baseline;
    const provider = this.providers.find((candidate) =>
      candidate.canHandle(request),
    );
    if (provider) return provider.decide(request);
    return result(
      request,
      this.rules.id,
      'ask-user',
      `${baseline.destination.replace('-', '_')}_provider_unavailable`,
      1,
    );
  }
}
