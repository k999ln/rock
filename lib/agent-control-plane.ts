import { experimental_evaluate as evaluate } from 'ai';
import { JEV_MODEL } from './jev-evaluation.ts';

export const AGENT_CONTROL_PLANE_VERSION = 'agent-control-plane-v1' as const;

export type AgentTaskRisk = 'low' | 'medium' | 'high' | 'critical';
export type AgentTaskDataClass =
  | 'public'
  | 'owner-private'
  | 'confidential'
  | 'secret';
export type AgentTaskEffect =
  | 'none'
  | 'repository-write'
  | 'production-deploy'
  | 'financial-transaction'
  | 'credential-change'
  | 'destructive-operation';
export type AgentTaskMode = 'plan' | 'agent';
export type AgentStrategy =
  | 'single-worker'
  | 'parallel-workers'
  | 'verify-first'
  | 'human-review';
export type AgentReviewMode = 'standard' | 'strict' | 'security';

export type AgentTask = {
  requestId: string;
  title: string;
  goal: string;
  repositoryUrl: string;
  startingRef: string;
  risk: AgentTaskRisk;
  dataClass: AgentTaskDataClass;
  effect: AgentTaskEffect;
  acceptanceCriteria: string[];
  allowedPaths?: string[];
  mode?: AgentTaskMode;
  usePstack?: boolean;
  decisionConsent?: {
    approved: true;
    approvedAt: string;
  };
  executionApproval?: {
    approved: true;
    approvedAt: string;
    scope: 'repository-pr-only';
  };
};

export type AgentExecutionGate = {
  launchAllowed: boolean;
  code:
    | 'allowed'
    | 'approval_required'
    | 'dangerous_effect_requires_owner'
    | 'critical_risk_requires_owner'
    | 'private_input_requires_local_handling';
  reason: string;
  minimumReview: AgentReviewMode;
};

export type AgentDecisionPlan = {
  strategy: AgentStrategy;
  reviewMode: AgentReviewMode;
  maxWorkers: number;
  confidence: number;
  providerId: 'deterministic' | 'typesafe-jev';
  reasonCode: string;
  authority: 'advisory-only';
};

export type AgentControlReceipt = {
  schemaVersion: 1;
  controlPlaneVersion: typeof AGENT_CONTROL_PLANE_VERSION;
  requestId: string;
  status: 'planned' | 'launched' | 'blocked' | 'unavailable';
  executionGate: AgentExecutionGate;
  plan: AgentDecisionPlan;
  agent?: {
    id: string;
    runId: string;
    url?: string;
  };
  authority: 'owner-and-policy-engine';
};

export type AgentStrategyProvider = {
  readonly id: 'typesafe-jev';
  decide(task: AgentTask): Promise<AgentDecisionPlan>;
};

type JevChoiceAnswer = {
  type: 'choice';
  choice: string;
  probabilities?: Record<string, number>;
};

const JEV_AGENT_CONTROL_RUBRIC = {
  strategy: {
    type: 'choice',
    instructions:
      'Choose an engineering workflow only. This is advisory and cannot grant permission, merge code, deploy, move money, change credentials, or authorize destructive operations.',
    criteria: {
      'single-worker':
        'One implementation worker is sufficient and parallelism would add coordination cost.',
      'parallel-workers':
        'Independent implementation or verification slices can safely run in parallel.',
      'verify-first':
        'The task should emphasize reproduction, tests, or independent verification before broad implementation.',
      'human-review':
        'The task is too ambiguous or sensitive to choose an automated engineering workflow safely.',
    },
  },
  reviewMode: {
    type: 'choice',
    instructions:
      'Choose the minimum independent review intensity for a pull-request-only engineering workflow.',
    criteria: {
      standard: 'Normal isolated code change with ordinary tests.',
      strict:
        'Cross-module or medium-risk change requiring stronger regression and acceptance checks.',
      security:
        'Authentication, permissions, secrets, financial boundaries, or other high-impact code requiring adversarial review.',
    },
  },
  workerCount: {
    type: 'choice',
    instructions:
      'Choose a small concurrency cap. More workers are not automatically better; prefer the fewest workers that can operate on independent slices.',
    criteria: {
      '1': 'One worker.',
      '2': 'Two workers.',
      '3': 'Three workers.',
      '4': 'Four workers.',
    },
  },
} as const;

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function assertString(
  value: unknown,
  field: string,
  min: number,
  max: number,
): string {
  if (typeof value !== 'string') throw new Error(`INVALID_${field.toUpperCase()}`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max)
    throw new Error(`INVALID_${field.toUpperCase()}`);
  return trimmed;
}

function assertStringArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number,
  optional = false,
): string[] | undefined {
  if (value === undefined && optional) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems)
    throw new Error(`INVALID_${field.toUpperCase()}`);
  return value.map((entry) =>
    assertString(entry, field, 1, maxLength),
  );
}

export function validateAgentTaskInput(value: unknown): AgentTask {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_TASK');
  const input = value as Partial<AgentTask>;

  const repositoryUrl = assertString(
    input.repositoryUrl,
    'repository_url',
    1,
    500,
  );
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(repositoryUrl);
  } catch {
    throw new Error('INVALID_REPOSITORY_URL');
  }
  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname !== 'github.com' ||
    parsedUrl.username ||
    parsedUrl.password
  )
    throw new Error('INVALID_REPOSITORY_URL');

  const startingRef = assertString(input.startingRef, 'starting_ref', 1, 128);
  if (!/^[A-Za-z0-9._/-]+$/.test(startingRef) || startingRef.includes('..'))
    throw new Error('INVALID_STARTING_REF');

  const risks = new Set<AgentTaskRisk>(['low', 'medium', 'high', 'critical']);
  const dataClasses = new Set<AgentTaskDataClass>([
    'public',
    'owner-private',
    'confidential',
    'secret',
  ]);
  const effects = new Set<AgentTaskEffect>([
    'none',
    'repository-write',
    'production-deploy',
    'financial-transaction',
    'credential-change',
    'destructive-operation',
  ]);
  const modes = new Set<AgentTaskMode>(['plan', 'agent']);

  if (!input.risk || !risks.has(input.risk)) throw new Error('INVALID_RISK');
  if (!input.dataClass || !dataClasses.has(input.dataClass))
    throw new Error('INVALID_DATA_CLASS');
  if (!input.effect || !effects.has(input.effect))
    throw new Error('INVALID_EFFECT');
  if (input.mode !== undefined && !modes.has(input.mode))
    throw new Error('INVALID_MODE');

  const acceptanceCriteria = assertStringArray(
    input.acceptanceCriteria,
    'acceptance_criteria',
    24,
    800,
  )!;
  const allowedPaths = assertStringArray(
    input.allowedPaths,
    'allowed_paths',
    64,
    300,
    true,
  );

  const decisionConsent =
    input.decisionConsent?.approved === true &&
    isIsoDate(input.decisionConsent.approvedAt)
      ? {
          approved: true as const,
          approvedAt: input.decisionConsent.approvedAt,
        }
      : undefined;

  const executionApproval =
    input.executionApproval?.approved === true &&
    input.executionApproval.scope === 'repository-pr-only' &&
    isIsoDate(input.executionApproval.approvedAt)
      ? {
          approved: true as const,
          approvedAt: input.executionApproval.approvedAt,
          scope: 'repository-pr-only' as const,
        }
      : undefined;

  return {
    requestId: assertString(input.requestId, 'request_id', 1, 128),
    title: assertString(input.title, 'title', 1, 200),
    goal: assertString(input.goal, 'goal', 1, 8_000),
    repositoryUrl,
    startingRef,
    risk: input.risk,
    dataClass: input.dataClass,
    effect: input.effect,
    acceptanceCriteria,
    allowedPaths,
    mode: input.mode ?? (input.effect === 'none' ? 'plan' : 'agent'),
    usePstack: input.usePstack === true,
    decisionConsent,
    executionApproval,
  };
}

function reviewRank(mode: AgentReviewMode): number {
  if (mode === 'security') return 3;
  if (mode === 'strict') return 2;
  return 1;
}

function strongerReview(
  first: AgentReviewMode,
  second: AgentReviewMode,
): AgentReviewMode {
  return reviewRank(first) >= reviewRank(second) ? first : second;
}

export function evaluateAgentExecutionGate(
  task: AgentTask,
): AgentExecutionGate {
  const minimumReview: AgentReviewMode =
    task.risk === 'high' || task.risk === 'critical'
      ? 'security'
      : task.risk === 'medium'
        ? 'strict'
        : 'standard';

  if (task.dataClass !== 'public')
    return {
      launchAllowed: false,
      code: 'private_input_requires_local_handling',
      reason:
        'Non-public task state stays out of remote decision and cloud-agent execution in v1.',
      minimumReview: 'security',
    };

  if (task.risk === 'critical')
    return {
      launchAllowed: false,
      code: 'critical_risk_requires_owner',
      reason:
        'Critical-risk work requires an explicit owner-reviewed workflow before any remote coding agent is launched.',
      minimumReview: 'security',
    };

  if (
    task.effect === 'production-deploy' ||
    task.effect === 'financial-transaction' ||
    task.effect === 'credential-change' ||
    task.effect === 'destructive-operation'
  )
    return {
      launchAllowed: false,
      code: 'dangerous_effect_requires_owner',
      reason:
        'The control plane may prepare code and plans, but it does not autonomously deploy, move funds, rotate credentials, or perform destructive operations.',
      minimumReview: 'security',
    };

  if (
    task.effect === 'repository-write' &&
    task.executionApproval?.approved !== true
  )
    return {
      launchAllowed: false,
      code: 'approval_required',
      reason:
        'Repository-writing agents require explicit approval scoped to pull-request-only changes.',
      minimumReview,
    };

  return {
    launchAllowed: true,
    code: 'allowed',
    reason:
      task.effect === 'repository-write'
        ? 'Explicit pull-request-only approval is present.'
        : 'The task is plan-only and carries no external write effect.',
    minimumReview,
  };
}

function deterministicPlan(task: AgentTask): AgentDecisionPlan {
  if (task.risk === 'critical')
    return {
      strategy: 'human-review',
      reviewMode: 'security',
      maxWorkers: 0,
      confidence: 1,
      providerId: 'deterministic',
      reasonCode: 'critical_risk',
      authority: 'advisory-only',
    };
  if (task.risk === 'high')
    return {
      strategy: 'verify-first',
      reviewMode: 'security',
      maxWorkers: 2,
      confidence: 1,
      providerId: 'deterministic',
      reasonCode: 'high_risk_verify_first',
      authority: 'advisory-only',
    };
  if (task.risk === 'medium')
    return {
      strategy: 'parallel-workers',
      reviewMode: 'strict',
      maxWorkers: 3,
      confidence: 1,
      providerId: 'deterministic',
      reasonCode: 'medium_risk_parallel_cap',
      authority: 'advisory-only',
    };
  return {
    strategy: 'single-worker',
    reviewMode: 'standard',
    maxWorkers: 1,
    confidence: 1,
    providerId: 'deterministic',
    reasonCode: 'low_risk_default',
    authority: 'advisory-only',
  };
}

function choice(
  answers: Record<string, unknown>,
  key: string,
): JevChoiceAnswer {
  const answer = answers[key] as JevChoiceAnswer | undefined;
  if (!answer || answer.type !== 'choice' || typeof answer.choice !== 'string')
    throw new Error('TYPE_SAFE_JEV_INVALID_RESPONSE');
  return answer;
}

function selectedProbability(answer: JevChoiceAnswer): number {
  const value = answer.probabilities?.[answer.choice];
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0.5;
}

export type JevEvaluate = typeof evaluate;

export class JevAgentStrategyProvider implements AgentStrategyProvider {
  readonly id = 'typesafe-jev' as const;
  private readonly apiKey: string;
  private readonly evaluateFn: JevEvaluate;

  constructor(apiKey: string, evaluateFn: JevEvaluate = evaluate) {
    this.apiKey = apiKey;
    this.evaluateFn = evaluateFn;
  }

  async decide(task: AgentTask): Promise<AgentDecisionPlan> {
    if (!this.apiKey) throw new Error('TYPE_SAFE_JEV_UNAVAILABLE');
    const state = JSON.stringify({
      task: {
        title: task.title,
        risk: task.risk,
        effect: task.effect,
        acceptanceCriteriaCount: task.acceptanceCriteria.length,
        allowedPathCount: task.allowedPaths?.length ?? 0,
        usePstack: task.usePstack === true,
      },
      boundary:
        'Choose workflow only. Never authorize merge, deployment, money movement, credential changes, destructive operations, or permission grants.',
    });
    const evaluated = await this.evaluateFn({
      model: JEV_MODEL,
      state,
      questions: JEV_AGENT_CONTROL_RUBRIC,
      maxRetries: 0,
      headers: { Authorization: `Bearer ${this.apiKey}` },
      providerOptions: { gateway: { zeroDataRetention: true } },
    });
    const answers = evaluated.answers as Record<string, unknown>;
    const strategyAnswer = choice(answers, 'strategy');
    const reviewAnswer = choice(answers, 'reviewMode');
    const workerAnswer = choice(answers, 'workerCount');

    const strategies = new Set<AgentStrategy>([
      'single-worker',
      'parallel-workers',
      'verify-first',
      'human-review',
    ]);
    const reviewModes = new Set<AgentReviewMode>([
      'standard',
      'strict',
      'security',
    ]);
    const workers = Number.parseInt(workerAnswer.choice, 10);
    if (
      !strategies.has(strategyAnswer.choice as AgentStrategy) ||
      !reviewModes.has(reviewAnswer.choice as AgentReviewMode) ||
      !Number.isInteger(workers) ||
      workers < 1 ||
      workers > 4
    )
      throw new Error('TYPE_SAFE_JEV_INVALID_RESPONSE');

    return {
      strategy: strategyAnswer.choice as AgentStrategy,
      reviewMode: reviewAnswer.choice as AgentReviewMode,
      maxWorkers: workers,
      confidence: Math.min(
        selectedProbability(strategyAnswer),
        selectedProbability(reviewAnswer),
        selectedProbability(workerAnswer),
      ),
      providerId: this.id,
      reasonCode: 'typesafe_jev_agent_workflow',
      authority: 'advisory-only',
    };
  }
}

function shouldUseJev(task: AgentTask): boolean {
  return (
    task.dataClass === 'public' &&
    task.decisionConsent?.approved === true
  );
}

function clampPlan(
  task: AgentTask,
  gate: AgentExecutionGate,
  plan: AgentDecisionPlan,
): AgentDecisionPlan {
  const deterministic = deterministicPlan(task);
  const maxByRisk =
    task.risk === 'critical'
      ? 0
      : task.risk === 'high'
        ? 2
        : task.risk === 'medium'
          ? 3
          : 4;
  const reviewMode = strongerReview(gate.minimumReview, plan.reviewMode);
  const strategy =
    task.risk === 'critical'
      ? 'human-review'
      : task.risk === 'high' && plan.strategy === 'parallel-workers'
        ? 'verify-first'
        : plan.strategy;
  const maxWorkers =
    strategy === 'human-review'
      ? 0
      : Math.max(1, Math.min(plan.maxWorkers, maxByRisk));
  const clamped =
    strategy !== plan.strategy ||
    reviewMode !== plan.reviewMode ||
    maxWorkers !== plan.maxWorkers;
  return {
    ...plan,
    reviewMode,
    maxWorkers,
    strategy,
    reasonCode: clamped
      ? `${plan.reasonCode}_policy_clamped`
      : plan.reasonCode,
    confidence:
      plan.providerId === 'deterministic'
        ? deterministic.confidence
        : plan.confidence,
  };
}

function pstackGuidance(enabled: boolean): string {
  if (!enabled) return 'Use the repository\'s existing engineering workflow.';
  return [
    'If the pstack plugin is already installed in this Cursor environment, use /poteto-mode for the task and /interrogate for the final adversarial review.',
    'If pstack is unavailable, do not install arbitrary tooling during an unattended run; follow the equivalent sequence: inspect -> define acceptance -> implement smallest change -> test -> independent review.',
  ].join(' ');
}

export function buildCursorAgentPrompt(
  task: AgentTask,
  plan: AgentDecisionPlan,
): string {
  const criteria = task.acceptanceCriteria
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');
  const paths =
    task.allowedPaths && task.allowedPaths.length > 0
      ? task.allowedPaths.map((path) => `- ${path}`).join('\n')
      : '- No explicit path allowlist was supplied; minimize blast radius and justify every touched area.';

  return [
    `Task: ${task.title}`,
    '',
    'Goal:',
    task.goal,
    '',
    'Acceptance criteria:',
    criteria,
    '',
    'Allowed paths / scope hints:',
    paths,
    '',
    `Workflow: ${plan.strategy}; independent review: ${plan.reviewMode}; concurrency cap: ${plan.maxWorkers}.`,
    pstackGuidance(task.usePstack === true),
    '',
    'Hard boundaries:',
    '- Work on an isolated branch or workspace. Never push directly to main.',
    '- Never merge the pull request.',
    '- Never deploy to production.',
    '- Never move real funds, sign financial transactions, rotate credentials, export secrets, or perform destructive operations.',
    '- Do not weaken tests, authorization, approval gates, or security controls to make a check pass.',
    '- Treat AGENTS.md and repository-local rules as authoritative engineering instructions.',
    '- Before editing, inspect existing implementation and reuse contracts instead of creating duplicate systems.',
    '- Run the narrowest relevant tests first, then the repository-required verification before declaring completion.',
    '- Open or update a pull request with evidence, remaining uncertainty, and any checks that could not be run.',
    '',
    'The control-plane decision is advisory only. Repository policy and owner approval remain authoritative.',
  ].join('\n');
}

function buildCursorSubagents(plan: AgentDecisionPlan) {
  const subagents = [
    {
      name: 'verification-reviewer',
      description:
        'Independent verifier that tries to falsify completion claims and checks acceptance criteria.',
      prompt:
        'Review the implementation independently. Do not merge or deploy. Run relevant tests yourself, inspect the diff, and report PASS, FAIL, or BLOCKED with concrete evidence.',
    },
  ];
  if (plan.reviewMode === 'strict' || plan.reviewMode === 'security')
    subagents.unshift({
      name: 'architecture-reviewer',
      description:
        'Checks blast radius, contract reuse, and whether the change fits the existing architecture before broad edits.',
      prompt:
        'Inspect callers, contracts, data boundaries, and existing abstractions. Prefer the smallest compatible change. Do not merge or deploy.',
    });
  if (plan.reviewMode === 'security')
    subagents.push({
      name: 'security-reviewer',
      description:
        'Adversarial reviewer for authentication, authorization, secrets, money, and destructive side effects.',
      prompt:
        'Review only. Look for privilege escalation, secret exposure, unsafe retries, authorization bypasses, financial side effects, and destructive behavior. Never approve deployment or execute external side effects.',
    });
  return subagents;
}

export type CursorAgentCreateResponse = {
  agent: {
    id: string;
    url?: string;
  };
  run: {
    id: string;
  };
};

export class CursorCloudAgentClient {
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(apiKey: string, fetchFn: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
  }

  async createAgent(
    task: AgentTask,
    plan: AgentDecisionPlan,
  ): Promise<CursorAgentCreateResponse> {
    if (!this.apiKey) throw new Error('CURSOR_API_UNAVAILABLE');
    const response = await this.fetchFn('https://api.cursor.com/v1/agents', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${this.apiKey}:`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: { text: buildCursorAgentPrompt(task, plan) },
        repos: [
          {
            url: task.repositoryUrl,
            startingRef: task.startingRef,
          },
        ],
        customSubagents: buildCursorSubagents(plan),
        mode: task.effect === 'none' ? 'plan' : task.mode ?? 'agent',
        autoCreatePR: task.effect === 'repository-write',
      }),
    });
    if (!response.ok)
      throw new Error(`CURSOR_API_${response.status}`);
    const payload = (await response.json()) as Partial<CursorAgentCreateResponse>;
    if (
      !payload.agent ||
      typeof payload.agent.id !== 'string' ||
      !payload.run ||
      typeof payload.run.id !== 'string'
    )
      throw new Error('CURSOR_API_INVALID_RESPONSE');
    return payload as CursorAgentCreateResponse;
  }
}

export class AgentControlPlane {
  private readonly decisionProvider?: AgentStrategyProvider;
  private readonly cursorClient?: CursorCloudAgentClient;

  constructor(options: {
    decisionProvider?: AgentStrategyProvider;
    cursorClient?: CursorCloudAgentClient;
  } = {}) {
    this.decisionProvider = options.decisionProvider;
    this.cursorClient = options.cursorClient;
  }

  async plan(task: AgentTask): Promise<AgentControlReceipt> {
    const gate = evaluateAgentExecutionGate(task);
    let plan = deterministicPlan(task);

    if (this.decisionProvider && shouldUseJev(task)) {
      try {
        plan = await this.decisionProvider.decide(task);
      } catch {
        plan = {
          ...plan,
          reasonCode: `${plan.reasonCode}_jev_unavailable`,
        };
      }
    }
    plan = clampPlan(task, gate, plan);

    return {
      schemaVersion: 1,
      controlPlaneVersion: AGENT_CONTROL_PLANE_VERSION,
      requestId: task.requestId,
      status: 'planned',
      executionGate: gate,
      plan,
      authority: 'owner-and-policy-engine',
    };
  }

  async launch(task: AgentTask): Promise<AgentControlReceipt> {
    const receipt = await this.plan(task);
    if (
      !receipt.executionGate.launchAllowed ||
      receipt.plan.strategy === 'human-review'
    )
      return { ...receipt, status: 'blocked' };

    if (!this.cursorClient) return { ...receipt, status: 'unavailable' };

    const created = await this.cursorClient.createAgent(task, receipt.plan);
    return {
      ...receipt,
      status: 'launched',
      agent: {
        id: created.agent.id,
        runId: created.run.id,
        url: created.agent.url,
      },
    };
  }
}
