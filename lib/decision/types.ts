export const PROVIDER_IDS = [
  'mock',
  'local_qwen',
  'typesafe_jev',
  'cloud_llm',
  'openjev',
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PURPOSES = [
  'route',
  'classify',
  'score',
  'detect',
  'retrieve',
  'verify',
  'plan',
  'generate',
] as const;
export type DecisionPurpose = (typeof PURPOSES)[number];

export const DATA_CLASSES = [
  'public',
  'owner_private',
  'confidential',
  'secret',
] as const;
export type DataClass = (typeof DATA_CLASSES)[number];

export const EFFECT_CLASSES = [
  'none',
  'local-pure',
  'remote-read',
  'external-write',
] as const;
export type EffectClass = (typeof EFFECT_CLASSES)[number];

export type ChoiceQuestion = {
  id: string;
  kind: 'choice';
  instructions: string;
  options: Record<string, string>;
  unknownOptionRequired: boolean;
};

export type ScoreQuestion = {
  id: string;
  kind: 'score';
  instructions: string;
  levels: string[];
};

export type BooleanProbabilityQuestion = {
  id: string;
  kind: 'boolean_probability';
  instructions: string;
  yesMeans: string;
  noMeans: string;
};

export type DecisionQuestion =
  | ChoiceQuestion
  | ScoreQuestion
  | BooleanProbabilityQuestion;

export type DecisionConstraints = {
  offlineRequired: boolean;
  cloudAllowed: boolean;
  maxLatencyMs: number;
  maxCostMicros: number;
  maxAttempts: number;
};

export type DecisionRequest = {
  schemaVersion: 1;
  requestId: string;
  ownerRef: string;
  workId: string;
  purpose: DecisionPurpose;
  state: unknown;
  stateDigest: string;
  questions: DecisionQuestion[];
  dataClasses: DataClass[];
  effect: EffectClass;
  constraints: DecisionConstraints;
  policyVersion: string;
};

export type ChoiceAnswer = {
  kind: 'choice';
  value: string;
  probabilities?: Record<string, number>;
  confidence?: number;
};

export type ScoreAnswer = {
  kind: 'score';
  value: number;
  probabilities?: Record<string, number>;
  confidence?: number;
};

export type BooleanProbabilityAnswer = {
  kind: 'boolean_probability';
  value: number;
  probabilities?: Record<string, number>;
  confidence?: number;
};

export type DecisionAnswer =
  | ChoiceAnswer
  | ScoreAnswer
  | BooleanProbabilityAnswer;

export type DecisionStatus = 'answered' | 'abstained' | 'blocked' | 'failed';

export type DecisionResult = {
  schemaVersion: 1;
  requestId: string;
  provider: ProviderId;
  providerVersion: string;
  modelId: string;
  modelRevision: string;
  answers: Record<string, DecisionAnswer>;
  status: DecisionStatus;
  reasonCodes: string[];
  stateDigest: string;
  questionSetDigest: string;
  startedAt: string;
  completedAt: string;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    costMicros?: number;
  };
};

export type ProviderHealth = {
  status: 'available' | 'unavailable';
  reasonCode: string;
};

export type ProviderCapabilities = {
  id: ProviderId;
  providerVersion: string;
  modelId: string;
  modelRevision: string;
  network: 'none' | 'remote';
  execution: 'shadow' | 'read-only';
  productionAllowed: boolean;
  supportsPurposes: DecisionPurpose[];
  supportsDataClasses: DataClass[];
  supportsEffects: EffectClass[];
};

export interface DecisionProvider {
  describe(): ProviderCapabilities;
  health(): Promise<ProviderHealth>;
  decide(
    request: DecisionRequest,
    signal?: AbortSignal,
  ): Promise<DecisionResult>;
}

export const DECISION_ROUTES = [
  'CODE',
  'JEV',
  'LOCAL_QWEN',
  'CLOUD_LLM',
  'TOOL',
  'ASK_USER',
  'BLOCK',
] as const;
export type DecisionRoute = (typeof DECISION_ROUTES)[number];

export type RouteDecision = {
  route: DecisionRoute;
  provider?: ProviderId;
  candidates: ProviderId[];
  reasonCodes: string[];
};

export type RouterContext = {
  codeCanHandle?: boolean;
  explicitToolRequired?: boolean;
  complexGeneration?: boolean;
  /** Fixture-only route used by tests when no production provider is wired. */
  mockProviderAvailable?: boolean;
  localProviderAvailable?: boolean;
  typesafeProviderAvailable?: boolean;
  cloudProviderAvailable?: boolean;
};

export type DecisionReceipt = {
  schemaVersion: 1;
  receiptId: string;
  requestId: string;
  ownerRef: string;
  workId: string;
  route: DecisionRoute;
  provider?: ProviderId;
  fallbackFrom?: ProviderId;
  status: DecisionStatus | 'routed' | 'awaiting_user';
  reasonCodes: string[];
  inputDigest: string;
  outputDigest?: string;
  policyVersion: string;
  attempt: number;
  latencyMs: number;
  usage?: DecisionResult['usage'];
  createdAt: string;
};

export type DecisionEvent = {
  schemaVersion: 1;
  eventId: string;
  ownerRef: string;
  workId: string;
  requestId: string;
  attempt: number;
  phase: 'preflight' | 'routed' | 'deciding' | 'completed' | 'blocked';
  route: DecisionRoute;
  provider?: ProviderId;
  modelRevision?: string;
  policyVersion: string;
  inputDigest: string;
  outputDigest?: string;
  status: DecisionStatus | 'routed' | 'awaiting_user';
  reasonCodes: string[];
  latencyMs: number;
  usage?: DecisionResult['usage'];
  timestamp: string;
};

export type DecisionObserver = (event: DecisionEvent) => void;

export type HarnessOutcome = {
  route: DecisionRoute;
  status: DecisionStatus | 'routed' | 'awaiting_user';
  result?: DecisionResult;
  receipt: DecisionReceipt;
};
