import {
  amcSummary,
  applyAmcEvent,
  validateAmcGoal,
  type AmcGoal,
  type AmcTask,
} from "./amc-tool.ts";
import type { JenniferCoordinationPlan } from "./jennifer-coordination.ts";
import type { JenniferAmcDomain, JenniferAmcNode } from "./jennifer-amc-decomposition.ts";
import { compileGoal } from "../scripts/amc-goal-engine.mjs";

export const JENNIFER_EXECUTION_SCHEMA = "rockstaros-jennifer-execution/1" as const;
export const JENNIFER_TASK_JOB_SCHEMA = "rockstaros-jennifer-task-job/1" as const;

export type JenniferExecutionCoordinationRef = {
  schema: typeof JENNIFER_EXECUTION_SCHEMA;
  planId: string;
  requestId: string;
  projectId: string | null;
  /** Durable source for rebuilding Jennifer on another browser/device. */
  planSnapshot: JenniferCoordinationPlan;
  phase: "draft" | "inventory" | "delivery" | "accepted";
  questionResolutions?: JenniferQuestionResolution[];
};

export type JenniferQuestionResolution = {
  question: string;
  disposition: "answered" | "deferred";
  note: string;
};

export type JenniferTaskJobCoordination = {
  schema: typeof JENNIFER_TASK_JOB_SCHEMA;
  rootJobId: string;
  planId: string;
  taskId: string;
  role: "worker" | "reviewer";
  specialistProfile: string;
};

export type JenniferExecutionDelegation = {
  id: string;
  parentJobId: string;
  idempotencyKey: string;
  state: string;
  artifactsCaptured: number;
  budgetCurrency?: string;
  budgetLimitMinor?: number;
};

export type JenniferExecutionReport = {
  schema: "zema-jennifer-final-report/1";
  goalId: string;
  goalRevision: number;
  overallStatus:
    | "accepted"
    | "awaiting_owner_acceptance"
    | "in_progress"
    | "blocked"
    | "failed"
    | "indeterminate";
  summary: string;
  taskCounts: Record<AmcTask["status"], number>;
  completed: Array<{
    taskId: string;
    title: string;
    evidence: string[];
    receiptRefs: string[];
  }>;
  unresolved: Array<{
    taskId: string;
    title: string;
    state: string;
    reason: string;
    nextAction: string;
  }>;
  receipts: Array<{
    taskId: string;
    delegationId: string;
    kind: "usage" | "execution";
    status: string;
  }>;
  limitations: string[];
  ownerAcceptance: {
    status: "not_ready" | "ready" | "accepted";
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/u;

const domainLabels: Record<JenniferAmcDomain, string> = {
  goal: "Goal設計",
  inventory: "既存資産調査",
  architecture: "設計",
  frontend: "フロントエンド",
  backend: "バックエンド",
  data: "データ",
  security: "セキュリティ",
  payments: "決済",
  agents: "Agent",
  integration: "統合",
  quality: "品質保証",
  review: "独立検収",
  handoff: "引継ぎ",
};

function leafNodes(plan: JenniferCoordinationPlan) {
  return plan.amc.nodes.filter(
    (node): node is JenniferAmcNode & { kind: "task"; ownerRole: string } =>
      node.kind === "task" && typeof node.ownerRole === "string",
  );
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function deliverablePath(planId: string, taskId: string) {
  const safePlan = planId.replace(/[^a-z0-9-]/giu, "-").toLowerCase();
  const safeTask = taskId.replace(/[^a-z0-9-]/giu, "-").toLowerCase();
  return `zema-executions/${safePlan}/${safeTask}/result.md`;
}

function goalContractEvidence(plan: JenniferCoordinationPlan) {
  return `zema:goal-contract:${plan.id}:revision-${plan.amc.goalContract.revision}`;
}

/** Turn Jennifer's advisory decomposition into a durable AMC draft. */
export function createJenniferExecutionGoal(
  plan: JenniferCoordinationPlan,
  now = new Date().toISOString(),
  goalSeriesId = plan.id,
): AmcGoal {
  if (!/^jennifer-[0-9a-f]{8}$/iu.test(goalSeriesId) && !UUID.test(goalSeriesId))
    throw new Error("JENNIFER_GOAL_SERIES_ID_INVALID");
  const nodes = leafNodes(plan);
  if (nodes.length === 0) throw new Error("JENNIFER_EXECUTION_TASKS_REQUIRED");
  const domains = unique(nodes.map(({ domain }) => domain));
  const squads = domains.map((domain) => ({
    id: `jennifer-${domain}`,
    name: domainLabels[domain],
    goal: `${domainLabels[domain]}のleaf taskを、証拠とReceipt付きで完了させる`,
    rules: [
      "一つの実行は一つのleaf taskだけを扱う。",
      "Brokerの権限、見積、予算、本人承認を代替しない。",
      "実行担当と検収担当を分離する。",
    ],
    acceptanceGate: "成果、証拠、Receiptを独立担当が条件ごとに検収する。",
    nextTaskIds: nodes.filter((node) => node.domain === domain).map(({ id }) => id),
  }));
  const project = {
    updatedAt: now,
    tasks: nodes.map((node) => ({
      id: node.id,
      title: node.title,
      status: "planned",
      evidence: [],
      dependsOn: [...node.dependsOn],
      workloadClass: "code_test",
    })),
  };
  const mission = {
    updatedAt: now,
    audit: {
      source: "Jennifer draft Goal Contract",
      planId: plan.id,
      requestId: plan.requestId,
    },
    squads,
    taskAssignments: nodes.map((node) => ({
      taskId: node.id,
      primarySquad: `jennifer-${node.domain}`,
      classification: "JENNIFER_LEAF",
    })),
    taskPlans: nodes.map((node) => ({
      taskId: node.id,
      scope: node.objective,
      inputs: node.contextRefs.map((path) => ({ path, locator: path })),
      steps: [
        { id: `${node.id}-inspect`, action: "許可された参照先と既存実装を確認する" },
        { id: `${node.id}-execute`, action: node.objective },
        { id: `${node.id}-verify`, action: "検査結果、未完了、次の判断を記録する" },
      ],
      deliverables: [
        {
          path: deliverablePath(plan.id, node.id),
          description: node.expectedOutputs.join(" / "),
        },
      ],
      acceptanceCriteria: node.acceptanceCriteria.map((criterion, index) => ({
        id: `${node.id}-AC${index + 1}`,
        criterion,
        verification: "成果artifact、検査証拠、実行Receiptを独立reviewerが照合する。",
      })),
      workloadClass: "code_test",
      executionBoundary:
        `変更可能path: ${node.allowedPaths.join(", ") || "なし"}。` +
        " 外部送信、本番公開、課金、credential変更、破壊操作は既存Brokerの個別承認なしに行わない。",
      unresolvedDecision: "実行先、送信データ、価格見積、予算上限はtask dispatch時に本人が決める。",
    })),
    executionHolds: [],
    globalRules: [
      "Jenniferは計画と統合報告を担当し、実行権限や検収結果を作らない。",
      "Zemaの保存状態を正本にし、Providerの自己申告だけで完了にしない。",
    ],
  };
  let goal = compileGoal({
    instruction: plan.amc.goalContract.goal,
    squadIds: squads.map(({ id }) => id),
    mission,
    project,
    goalId: `amc-${goalSeriesId}`,
    createdAt: now,
    maxParallel: 1,
  }) as AmcGoal;
  goal = {
    ...goal,
    requestBrief: {
      schema: "amc-request-brief/1",
      templateId: "software-local-prototype-v1",
      request: plan.requestSummary,
      goal: plan.amc.goalContract.goal,
      intent: plan.amc.goalContract.intent,
    },
    planningMethod: "jennifer_goal_backcast_domain_v1",
    scopeWarning:
      "Jenniferの保存済み草案。ownerがGoal ContractとCOLOMBIAの未決事項を明示承認するまで実行できない。各leafは別途、実行先・共有データ・見積・上限・Broker承認が必要。",
    coordinationRef: {
      schema: JENNIFER_EXECUTION_SCHEMA,
      planId: plan.id,
      requestId: plan.requestId,
      projectId: plan.project?.id ?? null,
      planSnapshot: structuredClone(plan),
      phase: "draft",
    } satisfies JenniferExecutionCoordinationRef,
    tasks: goal.tasks.map((task) => {
      const node = nodes.find(({ id }) => id === task.id)!;
      return {
        ...task,
        jenniferNodeId: node.id,
        specialistProfile: node.ownerRole,
        allowedPaths: [...node.allowedPaths],
        expectedOutputs: [...node.expectedOutputs],
      };
    }),
  };
  return validateAmcGoal(goal);
}

/**
 * The server calls this only after authenticating the owner. Saving a draft
 * never calls it. Every unresolved COLOMBIA question must be answered or
 * explicitly deferred with a reason before inventory may run.
 */
export function approveJenniferExecutionGoal(
  input: AmcGoal,
  resolutions: JenniferQuestionResolution[],
  ownerPrincipal: string,
  now = new Date().toISOString(),
): AmcGoal {
  const goal = validateAmcGoal(input);
  const reference = goal.coordinationRef as JenniferExecutionCoordinationRef | undefined;
  const plan = reference?.planSnapshot;
  if (reference?.schema !== JENNIFER_EXECUTION_SCHEMA || !plan)
    throw new Error("JENNIFER_PLAN_SNAPSHOT_REQUIRED");
  if (goal.state !== "draft") throw new Error("JENNIFER_DRAFT_REQUIRED");
  if (goal.maxParallel !== 1) throw new Error("JENNIFER_PARALLEL_LIMIT_INVALID");
  const questions = plan.amc.goalContract.unresolvedQuestions;
  if (
    resolutions.length !== questions.length ||
    questions.some((question) => {
      const resolution = resolutions.find((item) => item.question === question);
      return !resolution ||
        !["answered", "deferred"].includes(resolution.disposition) ||
        !resolution.note.trim() || resolution.note.length > 500;
    })
  ) throw new Error("JENNIFER_COLOMBIA_UNRESOLVED");
  let next = applyAmcEvent(goal, {
    id: `${goal.id}-owner-confirmation`,
    type: "approve_plan",
    expectedRevision: goal.revision,
    actor: ownerPrincipal,
    role: "owner",
    at: now,
    scopeConfirmed: true,
    coverageStatement:
      "利用者がJenniferのGoal Contract、対象、対象外、leaf task、依存、合格条件を確認してZema保存を指示した。",
    acceptanceCriteria: plan.acceptanceCriteria.map((criterion, index) => ({
      id: `goal-AC${index + 1}`,
      criterion,
      verification: "全leaf taskの独立検収済み証拠とReceiptをZemaで照合する。",
    })),
  });
  next = {
    ...next,
    coordinationRef: {
      ...reference,
      phase: "inventory",
      questionResolutions: resolutions.map((item) => ({ ...item })),
    },
  };

  // The first leaf is the owner-confirmation itself. Record the real owner
  // click and deterministic schema validation so dispatch starts at inventory.
  const contractTask = next.tasks.find(({ id }) => id === "task-goal-contract");
  if (contractTask && amcSummary(next).readyTaskIds.includes(contractTask.id)) {
    const evidence = goalContractEvidence(plan);
    next = applyAmcEvent(next, {
      id: `${next.id}-contract-start`,
      type: "start_task",
      expectedRevision: next.revision,
      actor: ownerPrincipal,
      role: "worker",
      taskId: contractTask.id,
      at: now,
    });
    next = applyAmcEvent(next, {
      id: `${next.id}-contract-submit`,
      type: "submit_result",
      expectedRevision: next.revision,
      actor: ownerPrincipal,
      role: "worker",
      taskId: contractTask.id,
      outcome: "succeeded",
      summary: "本人がGoal Contractを確認し、Zemaへの保存を明示した。",
      deliverables: contractTask.deliverables.map(({ path }) => path),
      evidence: [evidence],
      at: now,
    });
    next = applyAmcEvent(next, {
      id: `${next.id}-contract-verify`,
      type: "verify_task",
      expectedRevision: next.revision,
      actor: "server:zema-goal-contract-validator",
      role: "reviewer",
      taskId: contractTask.id,
      accepted: true,
      evidence: [evidence, `zema:goal-schema:${next.schema}`],
      criterionResults: contractTask.acceptanceCriteria.map(({ id }) => ({
        criterionId: id,
        passed: true,
        evidence: [evidence],
      })),
      at: now,
    });
  }
  return validateAmcGoal(next);
}

export function parseJenniferTaskJobCoordination(
  value: unknown,
): JenniferTaskJobCoordination | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<JenniferTaskJobCoordination>;
  if (
    Object.keys(candidate).some(
      (key) => !["schema", "rootJobId", "planId", "taskId", "role", "specialistProfile"].includes(key),
    ) ||
    candidate.schema !== JENNIFER_TASK_JOB_SCHEMA ||
    typeof candidate.rootJobId !== "string" ||
    !UUID.test(candidate.rootJobId) ||
    typeof candidate.planId !== "string" ||
    !/^jennifer-[0-9a-f]{8}$/u.test(candidate.planId) ||
    typeof candidate.taskId !== "string" ||
    !SAFE_ID.test(candidate.taskId) ||
    !["worker", "reviewer"].includes(candidate.role ?? "") ||
    typeof candidate.specialistProfile !== "string" ||
    !SAFE_ID.test(candidate.specialistProfile)
  )
    return null;
  return candidate as JenniferTaskJobCoordination;
}

export function createJenniferTaskJobCoordination(
  rootJobId: string,
  planId: string,
  task: AmcTask,
  role: "worker" | "reviewer" = "worker",
): JenniferTaskJobCoordination {
  const value = {
    schema: JENNIFER_TASK_JOB_SCHEMA,
    rootJobId,
    planId,
    taskId: task.id,
    role,
    specialistProfile:
      typeof task.specialistProfile === "string"
        ? task.specialistProfile
        : "specialist-agent",
  };
  const parsed = parseJenniferTaskJobCoordination(value);
  if (!parsed) throw new Error("JENNIFER_TASK_JOB_INVALID");
  return parsed;
}

export function buildJenniferDispatchPrompt(goal: AmcGoal, taskId: string) {
  const task = goal.tasks.find(({ id }) => id === taskId);
  if (!task) throw new Error("JENNIFER_TASK_NOT_FOUND");
  if (!amcSummary(goal).readyTaskIds.includes(taskId))
    throw new Error("JENNIFER_TASK_NOT_READY");
  const paths = Array.isArray(task.allowedPaths) ? task.allowedPaths.map(String) : [];
  return [
    `# Jennifer / Zema leaf task`,
    `Goal: ${goal.instruction}`,
    `Goal revision: ${goal.revision}`,
    `Task ID: ${task.id}`,
    `Task: ${task.title}`,
    `Specialist profile: ${
      typeof task.specialistProfile === "string"
        ? task.specialistProfile
        : task.squadId
    }`,
    `Objective: ${task.scope}`,
    `Dependencies accepted: ${task.dependsOn.length ? task.dependsOn.join(", ") : "none"}`,
    `Allowed paths: ${paths.length ? paths.join(", ") : "none"}`,
    "Steps:",
    ...task.steps.map((step, index) => `${index + 1}. ${step.action}`),
    "Required deliverables:",
    ...task.deliverables.map((item) => `- ${item.path}: ${item.description}`),
    "Acceptance criteria:",
    ...task.acceptanceCriteria.map((item) => `- ${item.id}: ${item.criterion}`),
    "Return the artifact, reproducible evidence, tests performed, unresolved items, and next action.",
    "Do not read or expose credentials. Do not send externally, deploy, charge, alter credentials, perform destructive actions, or widen scope without the existing RockstarOS Broker approval.",
    "Completion is not self-declared: Zema records the result and a different reviewer must accept every criterion.",
  ].join("\n");
}

export function jenniferDelegationKey(
  taskId: string,
  role: "worker" | "reviewer",
  nonce: string,
) {
  const normalizedNonce = nonce.replace(/[^A-Za-z0-9.-]/gu, "").slice(0, 48);
  if (!SAFE_ID.test(taskId) || !normalizedNonce)
    throw new Error("JENNIFER_DELEGATION_KEY_INVALID");
  return `jennifer:${taskId}:${role}:${normalizedNonce}`;
}

export function parseJenniferDelegationKey(value: string) {
  const match = /^jennifer:([a-z0-9][a-z0-9-]{0,79}):(worker|reviewer):([A-Za-z0-9.-]{1,48})$/u.exec(value);
  return match
    ? { taskId: match[1], role: match[2] as "worker" | "reviewer", nonce: match[3] }
    : null;
}

export function buildJenniferExecutionReport(
  goal: AmcGoal,
  delegations: JenniferExecutionDelegation[] = [],
): JenniferExecutionReport {
  const summary = amcSummary(goal);
  const delegationRefs = new Map<string, JenniferExecutionDelegation[]>();
  for (const delegation of delegations) {
    const parsed = parseJenniferDelegationKey(delegation.idempotencyKey);
    if (!parsed) continue;
    delegationRefs.set(parsed.taskId, [
      ...(delegationRefs.get(parsed.taskId) ?? []),
      delegation,
    ]);
  }
  const completed = goal.tasks
    .filter(({ status }) => status === "done")
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      evidence: unique([
        ...(task.result?.evidence ?? []),
        ...(task.review?.evidence ?? []),
      ]),
      receiptRefs: unique(
        [...(task.result?.evidence ?? []), ...(task.review?.evidence ?? [])].filter((item) =>
          /receipt/iu.test(item),
        ),
      ),
    }));
  const unresolved = goal.tasks
    .filter(({ status }) => status !== "done")
    .map((task) => {
      const related = delegationRefs.get(task.id) ?? [];
      const indeterminate = related.some(({ state }) =>
        ["indeterminate", "cancel_requested", "cancel_unconfirmed"].includes(state),
      );
      const failed = related.some(({ state }) =>
        ["remote_failed", "remote_rejected", "expired"].includes(state),
      );
      return {
        taskId: task.id,
        title: task.title,
        state: indeterminate ? "indeterminate" : failed ? "failed" : task.status,
        reason:
          task.blockReason ??
          (indeterminate
            ? "外部Agentの結果が確定していません。再dispatchせず照合が必要です。"
            : failed
              ? "外部Agentが失敗、拒否または期限切れです。"
              : task.status === "submitted"
                ? "成果提出済み。別の担当による条件別検収が必要です。"
                : task.status === "running"
                  ? "担当siの実行または成果取込を待っています。"
                  : "前提taskの完了またはtask単位の実行承認を待っています。"),
        nextAction:
          indeterminate
            ? "委任状態・Provider receiptを照合する"
            : task.status === "submitted"
              ? "独立reviewerへdispatchして検収する"
              : task.status === "running"
                ? "artifactとusage receiptを取得してZemaへ提出する"
                : "準備可能になったleafを担当siへdispatchする",
      };
    });
  const receipts = delegations.flatMap((delegation) => {
    const parsed = parseJenniferDelegationKey(delegation.idempotencyKey);
    if (!parsed) return [];
    return [
      {
        taskId: parsed.taskId,
        delegationId: delegation.id,
        kind: "execution" as const,
        status: delegation.state,
      },
      ...(delegation.state === "remote_completed" && delegation.artifactsCaptured === 1
        ? [
            {
              taskId: parsed.taskId,
              delegationId: delegation.id,
              kind: "usage" as const,
              status: "receipt-must-be-loaded-and-verified",
            },
          ]
        : []),
    ];
  });
  const hasIndeterminate = unresolved.some(({ state }) => state === "indeterminate");
  const hasFailed = unresolved.some(({ state }) => state === "failed");
  const hasBlocked = summary.counts.blocked > 0;
  const allDone = goal.tasks.every(({ status }) => status === "done");
  const overallStatus = goal.state === "accepted"
    ? "accepted"
    : hasIndeterminate
      ? "indeterminate"
      : hasFailed
        ? "failed"
        : hasBlocked
          ? "blocked"
          : allDone
            ? "awaiting_owner_acceptance"
            : "in_progress";
  return {
    schema: "zema-jennifer-final-report/1",
    goalId: goal.id,
    goalRevision: goal.revision,
    overallStatus,
    summary:
      overallStatus === "accepted"
        ? `全${goal.tasks.length}件を独立検収し、利用者がGoalを受け入れました。`
        : overallStatus === "awaiting_owner_acceptance"
          ? `全${goal.tasks.length}件の独立検収が完了しました。Jenniferの統合内容を確認し、Goalを最終受入してください。`
          : `${completed.length}/${goal.tasks.length}件を独立検収済み。未完了${unresolved.length}件を隠さず継続管理します。`,
    taskCounts: summary.counts as Record<AmcTask["status"], number>,
    completed,
    unresolved,
    receipts,
    limitations: [
      "Providerのremote_completedだけでは完了にしていません。",
      "各taskはartifact、実行証拠、usage Receipt、別reviewerの判定が揃うまで未完了です。",
    ],
    ownerAcceptance: {
      status: goal.state === "accepted" ? "accepted" : allDone ? "ready" : "not_ready",
    },
  };
}
