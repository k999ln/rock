import type { AgentTaskDataClass, AgentTaskEffect } from "./agent-control-plane.ts";
import {
  createJenniferAmcDraft,
  isJenniferAmcDraft,
  type JenniferAmcDraft,
  type JenniferKnowledgeRegistry,
} from "./jennifer-amc-decomposition.ts";
import type { JenniferProject } from "./jennifer-projects.ts";

export const JENNIFER_COORDINATION_VERSION = 2 as const;

export type JenniferResponsibility =
  | "project-lead"
  | "data-librarian"
  | "research"
  | "analysis"
  | "delivery";

export type JenniferTaskEffect = AgentTaskEffect | "artifact-draft" | "external-send";

export type JenniferPlanStep = {
  id: string;
  responsibility: JenniferResponsibility;
  label: string;
  objective: string;
  target:
    | { kind: "amc"; id: "rockstar-amc" }
    | { kind: "existing-capability"; id: JenniferResponsibility };
  dataClass: AgentTaskDataClass;
  effect: JenniferTaskEffect;
  approval: "existing-gate";
  dependsOn: string[];
};

export type JenniferCoordinationPlan = {
  version: typeof JENNIFER_COORDINATION_VERSION;
  id: string;
  requestId: string;
  status: "proposed";
  authority: "advisory-only";
  requestSummary: string;
  project: Pick<
    JenniferProject,
    "id" | "displayName" | "managerAgentId" | "managerLabel" | "sourceRefs"
  > | null;
  amc: JenniferAmcDraft;
  steps: JenniferPlanStep[];
  contextPolicy: {
    mode: "least-privilege";
    defaultAccess: "none";
    retention: "zema-session-only";
  };
  acceptanceCriteria: string[];
  completionRule: string;
};

export const jenniferResponsibilities: ReadonlyArray<{
  id: JenniferResponsibility;
  label: string;
  objective: string;
}> = [
  {
    id: "project-lead",
    label: "プロジェクト長",
    objective: "目的、完了条件、工程、依存関係を固定する",
  },
  {
    id: "data-librarian",
    label: "データ司書",
    objective: "本人が選んだ資料だけを整理し、出典と版を保持する",
  },
  {
    id: "research",
    label: "探索担当",
    objective: "許可された外部情報源を調べ、URLと取得時点を返す",
  },
  {
    id: "analysis",
    label: "分析担当",
    objective: "証拠を比較し、矛盾、不足、不確実性を明示する",
  },
  {
    id: "delivery",
    label: "成果物担当",
    objective: "承認済みの入力から成果物案を作り、Zemaへ返す",
  },
];

const responsibilityPatterns: ReadonlyArray<{
  id: Exclude<JenniferResponsibility, "project-lead">;
  pattern: RegExp;
}> = [
  {
    id: "data-librarian",
    pattern:
      /(?:資料|データ|ファイル|文書|ドキュメント|履歴|ナレッジ|整理|分類|重複|版|library|document|file|data)/iu,
  },
  {
    id: "research",
    pattern:
      /(?:調査|検索|探して|調べて|最新|出典|引用|根拠|市場|競合|research|search|source|web)/iu,
  },
  {
    id: "analysis",
    pattern: /(?:分析|比較|検証|評価|傾向|矛盾|考察|要因|原因|analy[sz]e|compare|evaluate)/iu,
  },
  {
    id: "delivery",
    pattern:
      /(?:作って|作成|開発|実装|出力|成果物|納品|資料化|まとめて|書いて|公開|送信|build|create|develop|deliver|publish|send)/iu,
  },
];

const DATA_CLASSES = new Set<AgentTaskDataClass>([
  "public",
  "owner-private",
  "confidential",
  "secret",
]);
const EFFECTS = new Set<JenniferTaskEffect>([
  "none",
  "artifact-draft",
  "external-send",
  "repository-write",
  "production-deploy",
  "financial-transaction",
  "credential-change",
  "destructive-operation",
]);
const RESPONSIBILITIES = new Set<JenniferResponsibility>(
  jenniferResponsibilities.map(({ id }) => id),
);

function bounded(value: string, max: number) {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function safeProjectRef(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 240 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.split("/").includes("..")
  );
}

function hasOnlyKeys(value: object, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function stableId(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function responsibilityDefinition(id: JenniferResponsibility) {
  return jenniferResponsibilities.find((item) => item.id === id)!;
}

function dataClassFor(request: string): AgentTaskDataClass {
  if (/(?:秘密|secret|秘密鍵|seed phrase|認証情報)/iu.test(request)) return "secret";
  if (/(?:機密|confidential|顧客情報|個人情報)/iu.test(request)) return "confidential";
  if (/(?:公開情報|public|ウェブ|web)/iu.test(request)) return "public";
  return "owner-private";
}

function deliveryEffectFor(request: string): JenniferTaskEffect {
  if (/(?:削除|破棄|初期化|delete|destroy|reset)/iu.test(request)) return "destructive-operation";
  if (/(?:支払|送金|購入|決済|trade|payment|pay)/iu.test(request)) return "financial-transaction";
  if (/(?:credential|認証情報|鍵を変更|パスワード変更)/iu.test(request)) return "credential-change";
  if (/(?:公開|デプロイ|release|publish|deploy)/iu.test(request)) return "production-deploy";
  if (/(?:送信|連絡|メール|投稿|send|email|post)/iu.test(request)) return "external-send";
  if (/(?:コード|実装|開発|repository|repo|commit|pull request|PR)/iu.test(request))
    return "repository-write";
  return "artifact-draft";
}

function stepFor(
  responsibility: JenniferResponsibility,
  request: string,
  dependsOn: string[],
): JenniferPlanStep {
  const definition = responsibilityDefinition(responsibility);
  const dataClass = responsibility === "research" ? "public" : dataClassFor(request);
  return {
    id: `step-${responsibility}`,
    responsibility,
    label: definition.label,
    objective: definition.objective,
    target:
      responsibility === "project-lead"
        ? { kind: "amc", id: "rockstar-amc" }
        : { kind: "existing-capability", id: responsibility },
    dataClass,
    effect: responsibility === "delivery" ? deliveryEffectFor(request) : "none",
    approval: "existing-gate",
    dependsOn,
  };
}

/**
 * Build a bounded, deterministic proposal. This function does not call a model,
 * select credentials, grant access, dispatch an agent, or change a Job.
 */
export function createJenniferCoordinationPlan(
  request: string,
  requestId: string,
  project: JenniferCoordinationPlan["project"] = null,
  knowledge: JenniferKnowledgeRegistry = {
    schema: "rockstaros-jennifer-knowledge-registry/1",
    updatedAt: "unknown",
    sources: [],
  },
): JenniferCoordinationPlan {
  const summary = bounded(request, 240);
  if (!summary) throw new Error("JENNIFER_REQUEST_REQUIRED");
  const amc = createJenniferAmcDraft(request, project, knowledge);
  const selected = responsibilityPatterns
    .filter(({ pattern }) => pattern.test(summary))
    .map(({ id }) => id);
  if (selected.length === 0) selected.push("delivery");

  const ordered: JenniferResponsibility[] = [
    "project-lead",
    ...responsibilityPatterns.map(({ id }) => id).filter((id) => selected.includes(id)),
  ];
  const steps: JenniferPlanStep[] = [];
  for (const responsibility of ordered) {
    let dependsOn: string[] = [];
    if (responsibility !== "project-lead") {
      const priorEvidence = [...steps]
        .reverse()
        .find((step) =>
          responsibility === "analysis"
            ? step.responsibility === "research" || step.responsibility === "data-librarian"
            : responsibility === "delivery"
              ? step.responsibility === "analysis" ||
                step.responsibility === "research" ||
                step.responsibility === "data-librarian"
              : step.responsibility === "project-lead",
        );
      dependsOn = [priorEvidence?.id ?? "step-project-lead"];
    }
    steps.push(stepFor(responsibility, summary, dependsOn));
  }

  const criteria = [
    "目的と完成条件がZema上で確認されている",
    "各工程が本人の選んだデータ範囲と既存の権限ゲートを守っている",
  ];
  if (selected.includes("research") || selected.includes("analysis"))
    criteria.push("調査・分析の主張に出典と不確実性が付いている");
  if (selected.includes("delivery")) criteria.push("成果物と実行Receiptが別々に確認できる");

  return {
    version: JENNIFER_COORDINATION_VERSION,
    id: `jennifer-${stableId(`${requestId}:${summary}`)}`,
    requestId: bounded(requestId, 100) || "request",
    status: "proposed",
    authority: "advisory-only",
    requestSummary: summary,
    project,
    amc,
    steps,
    contextPolicy: {
      mode: "least-privilege",
      defaultAccess: "none",
      retention: "zema-session-only",
    },
    acceptanceCriteria: criteria,
    completionRule: "各工程の既存Job・Receipt・成果物をZemaで確認するまで完了にしない",
  };
}

export function isJenniferCoordinationPlan(value: unknown): value is JenniferCoordinationPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (
    !hasOnlyKeys(value, [
      "version",
      "id",
      "requestId",
      "status",
      "authority",
      "requestSummary",
      "project",
      "amc",
      "steps",
      "contextPolicy",
      "acceptanceCriteria",
      "completionRule",
    ])
  )
    return false;
  const plan = value as Partial<JenniferCoordinationPlan>;
  if (
    plan.version !== JENNIFER_COORDINATION_VERSION ||
    typeof plan.id !== "string" ||
    !/^jennifer-[0-9a-f]{8}$/.test(plan.id) ||
    typeof plan.requestId !== "string" ||
    plan.requestId.length < 1 ||
    plan.requestId.length > 100 ||
    plan.status !== "proposed" ||
    plan.authority !== "advisory-only" ||
    typeof plan.requestSummary !== "string" ||
    plan.requestSummary.length < 1 ||
    plan.requestSummary.length > 240 ||
    (plan.project !== null &&
      (!plan.project ||
        !hasOnlyKeys(plan.project, [
          "id",
          "displayName",
          "managerAgentId",
          "managerLabel",
          "sourceRefs",
        ]) ||
        typeof plan.project.id !== "string" ||
        !/^[a-z][a-z0-9-]{0,63}$/.test(plan.project.id) ||
        typeof plan.project.displayName !== "string" ||
        plan.project.displayName.length < 1 ||
        plan.project.displayName.length > 80 ||
        typeof plan.project.managerAgentId !== "string" ||
        !/^[a-z][a-z0-9-]{0,63}$/.test(plan.project.managerAgentId) ||
        typeof plan.project.managerLabel !== "string" ||
        plan.project.managerLabel.length < 1 ||
        plan.project.managerLabel.length > 80 ||
        !Array.isArray(plan.project.sourceRefs) ||
        plan.project.sourceRefs.length < 1 ||
        plan.project.sourceRefs.length > 16 ||
        !plan.project.sourceRefs.every(safeProjectRef))) ||
    !isJenniferAmcDraft(plan.amc) ||
    !plan.contextPolicy ||
    !hasOnlyKeys(plan.contextPolicy, ["mode", "defaultAccess", "retention"]) ||
    plan.contextPolicy.mode !== "least-privilege" ||
    plan.contextPolicy.defaultAccess !== "none" ||
    plan.contextPolicy.retention !== "zema-session-only" ||
    !Array.isArray(plan.steps) ||
    plan.steps.length < 2 ||
    plan.steps.length > 5 ||
    !Array.isArray(plan.acceptanceCriteria) ||
    plan.acceptanceCriteria.length < 2 ||
    plan.acceptanceCriteria.length > 4 ||
    !plan.acceptanceCriteria.every(
      (criterion) =>
        typeof criterion === "string" && criterion.length > 0 && criterion.length <= 160,
    ) ||
    typeof plan.completionRule !== "string" ||
    plan.completionRule.length < 1 ||
    plan.completionRule.length > 160
  )
    return false;

  const seen = new Set<string>();
  for (const step of plan.steps) {
    if (
      !step ||
      typeof step !== "object" ||
      !hasOnlyKeys(step, [
        "id",
        "responsibility",
        "label",
        "objective",
        "target",
        "dataClass",
        "effect",
        "approval",
        "dependsOn",
      ]) ||
      typeof step.id !== "string" ||
      !/^step-[a-z-]+$/.test(step.id) ||
      seen.has(step.id) ||
      !RESPONSIBILITIES.has(step.responsibility) ||
      typeof step.label !== "string" ||
      step.label.length < 1 ||
      step.label.length > 40 ||
      typeof step.objective !== "string" ||
      step.objective.length < 1 ||
      step.objective.length > 160 ||
      !DATA_CLASSES.has(step.dataClass) ||
      !EFFECTS.has(step.effect) ||
      step.approval !== "existing-gate" ||
      !Array.isArray(step.dependsOn) ||
      step.dependsOn.length > 2 ||
      !step.dependsOn.every(
        (dependency) => typeof dependency === "string" && seen.has(dependency),
      ) ||
      !step.target ||
      !hasOnlyKeys(step.target, ["kind", "id"]) ||
      (step.target.kind !== "amc" && step.target.kind !== "existing-capability") ||
      (step.target.kind === "amc" && step.target.id !== "rockstar-amc") ||
      (step.target.kind === "existing-capability" && step.target.id !== step.responsibility)
    )
      return false;
    seen.add(step.id);
  }
  return plan.steps[0]?.responsibility === "project-lead";
}
