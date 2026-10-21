import type { JenniferProject } from "./jennifer-projects.ts";

export const JENNIFER_AMC_DECOMPOSITION_VERSION = 1 as const;

export type JenniferKnowledgeSource = {
  id: string;
  displayName: string;
  purpose: "goal-shaping";
  status: "ready" | "awaiting-source";
  authority: "advisory-only";
  version: string | null;
  contentHash: string | null;
  sourceRefs: string[];
  note: string;
};

export type JenniferKnowledgeRegistry = {
  schema: "rockstaros-jennifer-knowledge-registry/1";
  updatedAt: string;
  sources: JenniferKnowledgeSource[];
};

export type JenniferGoalContract = {
  revision: 1;
  status: "draft";
  confirmation: "required";
  goal: string;
  intent: string;
  scopeIn: string[];
  scopeOut: string[];
  successCriteria: string[];
  assumptions: string[];
  unresolvedQuestions: string[];
  appliedKnowledge: Array<{
    id: string;
    version: string;
    contentHash: string;
  }>;
};

export type JenniferAmcDomain =
  | "goal"
  | "inventory"
  | "architecture"
  | "frontend"
  | "backend"
  | "data"
  | "security"
  | "payments"
  | "agents"
  | "integration"
  | "quality"
  | "review"
  | "handoff";

export type JenniferAmcNode = {
  id: string;
  kind: "milestone" | "work-package" | "task";
  parentId: string | null;
  domain: JenniferAmcDomain;
  title: string;
  objective: string;
  ownerRole: string | null;
  dependsOn: string[];
  contextRefs: string[];
  allowedPaths: string[];
  expectedOutputs: string[];
  acceptanceCriteria: string[];
  state: "proposed";
};

export type JenniferAmcDraft = {
  version: typeof JENNIFER_AMC_DECOMPOSITION_VERSION;
  engine: "zema-amc";
  method: "goal-backcast-domain-v1";
  status: "draft";
  assignmentMode: "ephemeral-specialist-profiles";
  goalContract: JenniferGoalContract;
  knowledge: JenniferKnowledgeSource[];
  nodes: JenniferAmcNode[];
  planningLimits: {
    maxDepth: 5;
    maxChildrenPerNode: 12;
    maxNodes: 100;
    initialLeafWave: 1;
  };
};

type DomainDefinition = {
  id: JenniferAmcDomain;
  title: string;
  objective: string;
  ownerRole: string;
  criterion: string;
  pattern: RegExp;
};

const DOMAIN_DEFINITIONS: readonly DomainDefinition[] = [
  {
    id: "frontend",
    title: "フロントエンドを実装する",
    objective: "利用者の操作、表示、入力、失敗表示を具体的な画面として実装する",
    ownerRole: "frontend-engineer",
    criterion: "主要操作とエラー状態が実画面で再現でき、アクセシビリティ境界を確認できる",
    pattern: /(?:front(?:end)?|フロント|画面|ui|ux|web|サイト|dashboard|ダッシュボード)/iu,
  },
  {
    id: "backend",
    title: "バックエンドを実装する",
    objective: "業務規則、API、状態遷移と失敗時の扱いを実装する",
    ownerRole: "backend-engineer",
    criterion: "正常系と異常系の契約が試験され、未接続処理を成功扱いしない",
    pattern: /(?:back(?:end)?|バックエンド|api|server|サーバ|runtime|ロジック|サーバーサイド)/iu,
  },
  {
    id: "data",
    title: "データ境界を実装する",
    objective: "schema、保存、migration、復旧、保持期間とアクセス範囲を決めて実装する",
    ownerRole: "data-engineer",
    criterion: "schemaと保存復旧が検証され、秘密・個人情報の保持範囲が明記されている",
    pattern: /(?:データ|database|db|sql|schema|storage|保存|履歴|memory|ナレッジ)/iu,
  },
  {
    id: "security",
    title: "セキュリティ境界を実装する",
    objective: "脅威、権限、秘密、入力、実行、送信境界を定義しSpiderの深い検査へ渡す",
    ownerRole: "security-engineer",
    criterion: "権限拡張なしで防御検査が通り、残存riskと未検証範囲が記録されている",
    pattern: /(?:security|セキュリティ|auth|認証|権限|permission|secret|\.env|ハッキング|攻撃|spider)/iu,
  },
  {
    id: "payments",
    title: "決済境界を実装する",
    objective: "決済状態、金額、冪等性、webhook、返金、照合と本人承認を分離して実装する",
    ownerRole: "payment-engineer",
    criterion: "二重処理と結果不明を安全に扱い、実送金・本番決済は既存承認gateなしに動かない",
    pattern: /(?:決済|支払|payment|pay|billing|stripe|wallet|送金|返金|課金|売上)/iu,
  },
  {
    id: "agents",
    title: "エージェント実行境界を実装する",
    objective: "担当profile、入力context、Tool許可、停止、報告、独立検収を定義する",
    ownerRole: "agent-engineer",
    criterion: "各runが一つのleaf taskへ結び付き、自分で受入済みに変更できない",
    pattern: /(?:agent|エージェント|bot|ボット|ai|llm|jennifer|zema|amc)/iu,
  },
];
const DOMAINS = new Set<JenniferAmcDomain>([
  "goal",
  "inventory",
  "architecture",
  "frontend",
  "backend",
  "data",
  "security",
  "payments",
  "agents",
  "integration",
  "quality",
  "review",
  "handoff",
]);
const DOMAIN_PATHS: Record<JenniferAmcDomain, string[]> = {
  goal: ["docs/", "data/"],
  inventory: ["README.md", "PROJECTS.md", "docs/", "data/", "lib/", "app/", "components/"],
  architecture: ["docs/", "data/", "lib/"],
  frontend: ["app/", "components/", "tests/"],
  backend: ["app/api/", "lib/", "tests/"],
  data: ["data/", "db/", "drizzle/", "lib/", "tests/"],
  security: ["toolkits/spider-guard/", ".github/workflows/", "lib/", "tests/", "docs/"],
  payments: ["app/api/", "lib/", "services/", "tests/", "docs/"],
  agents: ["lib/", "scripts/", ".codex/", "tests/", "docs/"],
  integration: ["app/", "components/", "lib/", "tests/"],
  quality: ["tests/", "docs/evidence/"],
  review: ["tests/", "docs/evidence/", "project.md"],
  handoff: ["README.md", "project.md", "data/project-status.json", "docs/"],
};

const STRING = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

function onlyKeys(value: object, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function bounded(value: string, max: number) {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function safeRepositoryRef(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 240 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.split("/").includes("..")
  );
}

function sourceValid(value: unknown): value is JenniferKnowledgeSource {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Partial<JenniferKnowledgeSource>;
  return (
    onlyKeys(value, [
      "id",
      "displayName",
      "purpose",
      "status",
      "authority",
      "version",
      "contentHash",
      "sourceRefs",
      "note",
    ]) &&
    STRING(source.id, 64) &&
    /^[a-z][a-z0-9-]*$/u.test(source.id) &&
    STRING(source.displayName, 80) &&
    source.purpose === "goal-shaping" &&
    (source.status === "ready" || source.status === "awaiting-source") &&
    source.authority === "advisory-only" &&
    (source.version === null || STRING(source.version, 80)) &&
    (source.contentHash === null ||
      (typeof source.contentHash === "string" &&
        /^[a-f0-9]{64}$/u.test(source.contentHash))) &&
    Array.isArray(source.sourceRefs) &&
    source.sourceRefs.length <= 16 &&
    source.sourceRefs.every((reference) => STRING(reference, 240)) &&
    STRING(source.note, 300) &&
    (source.status !== "ready" ||
      (source.version !== null &&
        source.contentHash !== null &&
        source.sourceRefs.length > 0))
  );
}

export function parseJenniferKnowledgeRegistry(
  value: unknown,
): JenniferKnowledgeRegistry {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("JENNIFER_KNOWLEDGE_INVALID");
  const registry = value as Partial<JenniferKnowledgeRegistry>;
  if (
    !onlyKeys(value, ["schema", "updatedAt", "sources"]) ||
    registry.schema !== "rockstaros-jennifer-knowledge-registry/1" ||
    !STRING(registry.updatedAt, 40) ||
    !Array.isArray(registry.sources) ||
    registry.sources.length > 16 ||
    !registry.sources.every(sourceValid) ||
    new Set(registry.sources.map(({ id }) => id)).size !== registry.sources.length
  )
    throw new Error("JENNIFER_KNOWLEDGE_INVALID");
  return registry as JenniferKnowledgeRegistry;
}

function selectedDomains(request: string): DomainDefinition[] {
  const selected = new Set(
    DOMAIN_DEFINITIONS.filter(({ pattern }) => pattern.test(request)).map(
      ({ id }) => id,
    ),
  );
  if (selected.has("payments")) {
    selected.add("data");
    selected.add("security");
  }
  if (selected.has("agents")) selected.add("security");
  return DOMAIN_DEFINITIONS.filter(({ id }) => selected.has(id));
}

function milestone(
  id: string,
  domain: JenniferAmcDomain,
  title: string,
  objective: string,
): JenniferAmcNode {
  return {
    id,
    kind: "milestone",
    parentId: null,
    domain,
    title,
    objective,
    ownerRole: null,
    dependsOn: [],
    contextRefs: [],
    allowedPaths: [],
    expectedOutputs: [],
    acceptanceCriteria: [],
    state: "proposed",
  };
}

function workPackage(
  id: string,
  domain: JenniferAmcDomain,
  title: string,
  objective: string,
): JenniferAmcNode {
  return {
    id,
    kind: "work-package",
    parentId: "milestone-build",
    domain,
    title,
    objective,
    ownerRole: null,
    dependsOn: [],
    contextRefs: [],
    allowedPaths: [],
    expectedOutputs: [],
    acceptanceCriteria: [],
    state: "proposed",
  };
}

function task(
  id: string,
  parentId: string,
  domain: JenniferAmcDomain,
  title: string,
  objective: string,
  ownerRole: string,
  dependsOn: string[],
  criterion: string,
): JenniferAmcNode {
  const allowedPaths = DOMAIN_PATHS[domain];
  return {
    id,
    kind: "task",
    parentId,
    domain,
    title,
    objective,
    ownerRole,
    dependsOn,
    contextRefs: allowedPaths,
    allowedPaths,
    expectedOutputs: [
      `${title}の変更または設計成果`,
      "実行した検査と結果",
      "未検証、blocker、次の担当",
    ],
    acceptanceCriteria: [criterion],
    state: "proposed",
  };
}

export function createJenniferAmcDraft(
  request: string,
  project: Pick<JenniferProject, "displayName" | "sourceRefs"> | null,
  registry: JenniferKnowledgeRegistry,
): JenniferAmcDraft {
  const summary = bounded(request, 800);
  if (!summary) throw new Error("JENNIFER_GOAL_REQUIRED");
  const domains = selectedDomains(summary);
  const knowledge = registry.sources.map((source) => ({
    ...source,
    sourceRefs: [...source.sourceRefs],
  }));
  const readyKnowledge = knowledge.filter(({ status }) => status === "ready");
  const missingKnowledge = knowledge.filter(
    ({ status }) => status === "awaiting-source",
  );
  const projectLabel = project ? `${project.displayName}で` : "";
  const goalContract: JenniferGoalContract = {
    revision: 1,
    status: "draft",
    confirmation: "required",
    goal: `${projectLabel}${summary}`.slice(0, 1000),
    intent: "作りたいものを、専門担当が実装・検証できる具体的な仕事へ変換する",
    scopeIn:
      domains.length > 0
        ? domains.map(({ title }) => title)
        : ["依頼内容の調査・設計・成果物化"],
    scopeOut: [
      "依頼にない製品目的の追加",
      "本人確認前の外部送信・本番公開・課金・資産移動",
    ],
    successCriteria: [
      "Goalと各作業の対応を説明できる",
      "各leaf taskに担当、依存、成果物相当の目的、合格条件がある",
      "実装と独立検収の証拠がZemaへ戻るまで完了にしない",
    ],
    assumptions: [
      "既存コードと正本を優先して再利用する",
      "専門担当は必要なleaf taskの実行中だけ起動する",
    ],
    unresolvedQuestions: missingKnowledge.map(
      ({ displayName }) =>
        `${displayName}の原本・参照先・版が未登録のため、内容はまだGoalへ適用していない`,
    ),
    appliedKnowledge: readyKnowledge.map(({ id, version, contentHash }) => ({
      id,
      version: version!,
      contentHash: contentHash!,
    })),
  };

  const nodes: JenniferAmcNode[] = [
    milestone("milestone-understand", "goal", "目的を固定する", "曖昧な願望を確認可能なGoalへ変換する"),
    milestone("milestone-design", "architecture", "逆算して設計する", "既存資産と依存を確認し、実装単位へ分ける"),
    milestone("milestone-build", "backend", "専門担当が作る", "独立したleaf taskを担当profileへ割り当てる"),
    milestone("milestone-accept", "quality", "統合して検収する", "個別成果と全体Goalの両方を証拠で確認する"),
    task(
      "task-goal-contract",
      "milestone-understand",
      "goal",
      "Goal Contractを確認する",
      "目的、意図、対象、対象外、成功条件、仮定、未決事項を利用者と確認する",
      "product-planner",
      [],
      "本人がGoal revisionを確認し、方向を変える未決事項が残っていない",
    ),
    task(
      "task-inventory",
      "milestone-understand",
      "inventory",
      "既存コードと正本を調べる",
      "再利用する実装、制約、現在地、不足、関連する検査を実物から特定する",
      "repository-analyst",
      ["task-goal-contract"],
      "確認したpathと不足が区別され、推測を実装済みと扱っていない",
    ),
    task(
      "task-architecture",
      "milestone-design",
      "architecture",
      "実装境界と依存を設計する",
      "front、back、data、security、外部作用の境界と接続順を決める",
      "solution-architect",
      ["task-inventory"],
      "各実装単位の入出力、依存、権限、失敗時の扱いが決まっている",
    ),
  ];

  const buildTaskIds: string[] = [];
  for (const definition of domains) {
    const packageId = `work-package-${definition.id}`;
    const contractId = `task-${definition.id}-contract`;
    const implementationId = `task-${definition.id}-implementation`;
    const verificationId = `task-${definition.id}-verification`;
    buildTaskIds.push(verificationId);
    nodes.push(
      workPackage(
        packageId,
        definition.id,
        `${definition.title.replace(/を実装する$/u, "")}の作業群`,
        definition.objective,
      ),
      task(
        contractId,
        packageId,
        definition.id,
        `${definition.title.replace(/を実装する$/u, "")}の契約を確定する`,
        `${definition.objective}ために必要な入出力、状態、権限、失敗時の扱いを固定する`,
        definition.ownerRole,
        ["task-architecture"],
        "実装前に入出力、状態、権限、失敗時の扱いが確認できる",
      ),
      task(
        implementationId,
        packageId,
        definition.id,
        definition.title,
        definition.objective,
        definition.ownerRole,
        [contractId],
        definition.criterion,
      ),
      task(
        verificationId,
        packageId,
        definition.id,
        `${definition.title.replace(/を実装する$/u, "")}を専門検証する`,
        "正常、異常、権限、停止、復旧の境界を再現可能な検査で確認する",
        `${definition.ownerRole}-verifier`,
        [implementationId],
        `${definition.criterion}ことを実行結果で示し、未検証範囲を分けて記録する`,
      ),
    );
  }
  nodes.push(
    task(
      "task-integration",
      "milestone-accept",
      "integration",
      "各成果を統合する",
      "専門担当の成果を同じGoal revisionへ結合し、境界間の不整合を解消する",
      "integration-engineer",
      buildTaskIds.length > 0 ? buildTaskIds : ["task-architecture"],
      "成果物の競合がなく、全実装単位が同じGoalとplan revisionへ追跡できる",
    ),
    task(
      "task-quality",
      "milestone-accept",
      "quality",
      "全体動作を検証する",
      "正常、異常、権限、保存復旧、停止、結果不明を実際の検査で確認する",
      "qa-engineer",
      ["task-integration"],
      "再現可能な検査結果と未検証範囲が記録されている",
    ),
    task(
      "task-review",
      "milestone-accept",
      "review",
      "独立担当が検収する",
      "実装担当とは別の担当がGoalと成果を条件ごとに照合する",
      "independent-reviewer",
      ["task-quality"],
      "各条件に証拠付き判定があり、担当の自己申告だけで合格していない",
    ),
    task(
      "task-handoff",
      "milestone-accept",
      "handoff",
      "Jenniferへ結果を戻す",
      "ZemaのTaskReport、成果物、Receipt、未完了、次の判断をJenniferが一つにまとめる",
      "delivery-manager",
      ["task-review"],
      "利用者が完成、未完成、次の判断を区別できる",
    ),
  );

  const contextualNodes = nodes.map((node) =>
    node.kind === "task"
      ? {
          ...node,
          contextRefs: [
            ...new Set([...(project?.sourceRefs ?? []), ...node.contextRefs]),
          ].slice(0, 16),
        }
      : node,
  );

  return {
    version: JENNIFER_AMC_DECOMPOSITION_VERSION,
    engine: "zema-amc",
    method: "goal-backcast-domain-v1",
    status: "draft",
    assignmentMode: "ephemeral-specialist-profiles",
    goalContract,
    knowledge,
    nodes: contextualNodes,
    planningLimits: {
      maxDepth: 5,
      maxChildrenPerNode: 12,
      maxNodes: 100,
      initialLeafWave: 1,
    },
  };
}

export function isJenniferAmcDraft(value: unknown): value is JenniferAmcDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as Partial<JenniferAmcDraft>;
  if (
    !onlyKeys(value, [
      "version",
      "engine",
      "method",
      "status",
      "assignmentMode",
      "goalContract",
      "knowledge",
      "nodes",
      "planningLimits",
    ]) ||
    draft.version !== JENNIFER_AMC_DECOMPOSITION_VERSION ||
    draft.engine !== "zema-amc" ||
    draft.method !== "goal-backcast-domain-v1" ||
    draft.status !== "draft" ||
    draft.assignmentMode !== "ephemeral-specialist-profiles" ||
    !draft.goalContract ||
    !onlyKeys(draft.goalContract, [
      "revision",
      "status",
      "confirmation",
      "goal",
      "intent",
      "scopeIn",
      "scopeOut",
      "successCriteria",
      "assumptions",
      "unresolvedQuestions",
      "appliedKnowledge",
    ]) ||
    draft.goalContract.revision !== 1 ||
    draft.goalContract.status !== "draft" ||
    draft.goalContract.confirmation !== "required" ||
    !STRING(draft.goalContract.goal, 1000) ||
    !STRING(draft.goalContract.intent, 300) ||
    !Array.isArray(draft.goalContract.scopeIn) ||
    draft.goalContract.scopeIn.length < 1 ||
    draft.goalContract.scopeIn.length > 12 ||
    !draft.goalContract.scopeIn.every((item) => STRING(item, 160)) ||
    !Array.isArray(draft.goalContract.scopeOut) ||
    draft.goalContract.scopeOut.length > 8 ||
    !draft.goalContract.scopeOut.every((item) => STRING(item, 200)) ||
    !Array.isArray(draft.goalContract.successCriteria) ||
    draft.goalContract.successCriteria.length < 1 ||
    draft.goalContract.successCriteria.length > 8 ||
    !draft.goalContract.successCriteria.every((item) => STRING(item, 240)) ||
    !Array.isArray(draft.goalContract.assumptions) ||
    draft.goalContract.assumptions.length > 8 ||
    !draft.goalContract.assumptions.every((item) => STRING(item, 240)) ||
    !Array.isArray(draft.goalContract.unresolvedQuestions) ||
    draft.goalContract.unresolvedQuestions.length > 8 ||
    !draft.goalContract.unresolvedQuestions.every((item) => STRING(item, 300)) ||
    !Array.isArray(draft.goalContract.appliedKnowledge) ||
    draft.goalContract.appliedKnowledge.length > 16 ||
    !draft.goalContract.appliedKnowledge.every(
      (item) =>
        item &&
        onlyKeys(item, ["id", "version", "contentHash"]) &&
        STRING(item.id, 64) &&
        STRING(item.version, 80) &&
        /^[a-f0-9]{64}$/u.test(item.contentHash),
    ) ||
    !Array.isArray(draft.knowledge) ||
    draft.knowledge.length > 16 ||
    !draft.knowledge.every(sourceValid) ||
    !Array.isArray(draft.nodes) ||
    draft.nodes.length < 8 ||
    draft.nodes.length > 100 ||
    !draft.planningLimits ||
    !onlyKeys(draft.planningLimits, [
      "maxDepth",
      "maxChildrenPerNode",
      "maxNodes",
      "initialLeafWave",
    ]) ||
    draft.planningLimits.maxDepth !== 5 ||
    draft.planningLimits.maxChildrenPerNode !== 12 ||
    draft.planningLimits.maxNodes !== 100 ||
    draft.planningLimits.initialLeafWave !== 1
  )
    return false;

  const ids = new Set<string>();
  const taskIds = new Set<string>();
  for (const node of draft.nodes) {
    if (
      !node ||
      !onlyKeys(node, [
        "id",
        "kind",
        "parentId",
        "domain",
        "title",
        "objective",
        "ownerRole",
        "dependsOn",
        "contextRefs",
        "allowedPaths",
        "expectedOutputs",
        "acceptanceCriteria",
        "state",
      ]) ||
      !STRING(node.id, 80) ||
      !/^(?:milestone|work-package|task)-[a-z-]+$/u.test(node.id) ||
      ids.has(node.id) ||
      (node.kind !== "milestone" &&
        node.kind !== "work-package" &&
        node.kind !== "task") ||
      !DOMAINS.has(node.domain) ||
      !STRING(node.title, 160) ||
      !STRING(node.objective, 300) ||
      node.state !== "proposed" ||
      !Array.isArray(node.dependsOn) ||
      node.dependsOn.length > 12 ||
      !node.dependsOn.every((id) => typeof id === "string") ||
      !Array.isArray(node.contextRefs) ||
      node.contextRefs.length > 16 ||
      !node.contextRefs.every(safeRepositoryRef) ||
      !Array.isArray(node.allowedPaths) ||
      node.allowedPaths.length > 12 ||
      !node.allowedPaths.every(safeRepositoryRef) ||
      !Array.isArray(node.expectedOutputs) ||
      node.expectedOutputs.length > 6 ||
      !node.expectedOutputs.every((item) => STRING(item, 200)) ||
      !Array.isArray(node.acceptanceCriteria) ||
      node.acceptanceCriteria.length > 4 ||
      !node.acceptanceCriteria.every((item) => STRING(item, 300)) ||
      (node.kind === "milestone" &&
        (node.parentId !== null ||
          node.ownerRole !== null ||
          node.contextRefs.length !== 0 ||
          node.allowedPaths.length !== 0 ||
          node.expectedOutputs.length !== 0 ||
          node.acceptanceCriteria.length !== 0)) ||
      (node.kind === "work-package" &&
        (!STRING(node.parentId, 80) ||
          node.ownerRole !== null ||
          node.dependsOn.length !== 0 ||
          node.contextRefs.length !== 0 ||
          node.allowedPaths.length !== 0 ||
          node.expectedOutputs.length !== 0 ||
          node.acceptanceCriteria.length !== 0)) ||
      (node.kind === "task" &&
        (!STRING(node.parentId, 80) ||
          !STRING(node.ownerRole, 80) ||
          node.acceptanceCriteria.length < 1))
    )
      return false;
    ids.add(node.id);
    if (node.kind === "task") taskIds.add(node.id);
  }
  const nodeMap = new Map(draft.nodes.map((node) => [node.id, node]));
  for (const node of draft.nodes) {
    const parent = node.parentId === null ? null : nodeMap.get(node.parentId);
    if (
      (node.kind === "work-package" && parent?.kind !== "milestone") ||
      (node.kind === "task" &&
        parent?.kind !== "milestone" &&
        parent?.kind !== "work-package") ||
      node.dependsOn.some((dependency) => !taskIds.has(dependency) || dependency === node.id)
    )
      return false;
  }
  const childCounts = new Map<string, number>();
  for (const node of draft.nodes) {
    if (node.parentId === null) continue;
    childCounts.set(node.parentId, (childCounts.get(node.parentId) ?? 0) + 1);
  }
  if ([...childCounts.values()].some((count) => count > draft.planningLimits!.maxChildrenPerNode))
    return false;
  const depthFor = (node: JenniferAmcNode): number => {
    let depth = 1;
    let parentId = node.parentId;
    const ancestors = new Set<string>([node.id]);
    while (parentId !== null) {
      if (ancestors.has(parentId)) return Number.POSITIVE_INFINITY;
      ancestors.add(parentId);
      const parent = nodeMap.get(parentId);
      if (!parent) return Number.POSITIVE_INFINITY;
      depth += 1;
      parentId = parent.parentId;
    }
    return depth;
  };
  if (draft.nodes.some((node) => depthFor(node) > draft.planningLimits!.maxDepth))
    return false;
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const dependency of nodeMap.get(id)?.dependsOn ?? [])
      if (!visit(dependency)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  return [...taskIds].every(visit);
}
