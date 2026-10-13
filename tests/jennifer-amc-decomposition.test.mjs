import assert from "node:assert/strict";
import test from "node:test";
import registrySource from "../data/jennifer-knowledge.json" with { type: "json" };
import {
  createJenniferAmcDraft,
  isJenniferAmcDraft,
  parseJenniferKnowledgeRegistry,
} from "../lib/jennifer-amc-decomposition.ts";

const registry = parseJenniferKnowledgeRegistry(registrySource);

void test("COLOMBIA is registered for Jennifer without inventing unavailable content", () => {
  const colombia = registry.sources.find(({ id }) => id === "colombia");
  assert.equal(colombia?.status, "awaiting-source");
  assert.equal(colombia?.authority, "advisory-only");
  assert.deepEqual(colombia?.sourceRefs, []);
  assert.equal(colombia?.contentHash, null);
});

void test("Zema AMC backcasts an agent request into bounded specialist leaf tasks", () => {
  const draft = createJenniferAmcDraft(
    "セキュリティエージェントを開発して、管理画面から検査結果を確認したい",
    {
      displayName: "Jennifer / Zema",
      sourceRefs: ["lib/jennifer-coordination.ts", "docs/jennifer-coordination.md"],
    },
    registry,
  );
  assert.equal(draft.engine, "zema-amc");
  assert.equal(draft.goalContract.confirmation, "required");
  assert.match(draft.goalContract.goal, /セキュリティエージェント/);
  assert.equal(draft.goalContract.appliedKnowledge.length, 0);
  assert.match(draft.goalContract.unresolvedQuestions[0], /COLOMBIA/);
  const domains = draft.nodes
    .filter(({ kind }) => kind === "task")
    .map(({ domain }) => domain);
  assert(domains.includes("frontend"));
  assert(domains.includes("backend"));
  assert(domains.includes("security"));
  assert(domains.includes("agents"));
  assert.equal(draft.planningLimits.maxNodes, 100);
  const backendImplementation = draft.nodes.find(
    ({ id }) => id === "task-backend-implementation",
  );
  assert.deepEqual(backendImplementation?.dependsOn, ["task-backend-contract"]);
  assert(backendImplementation?.contextRefs.includes("lib/jennifer-coordination.ts"));
  assert(backendImplementation?.allowedPaths.includes("lib/"));
  assert.equal(backendImplementation?.expectedOutputs.length, 3);
  assert.equal(isJenniferAmcDraft(draft), true);
});

void test("a broad build request becomes ten concrete leaf tasks instead of one backend task", () => {
  const draft = createJenniferAmcDraft("APIを開発したい", null, registry);
  const tasks = draft.nodes.filter(({ kind }) => kind === "task");
  assert.equal(tasks.length, 10);
  assert.deepEqual(
    tasks
      .filter(({ domain }) => domain === "backend")
      .map(({ id }) => id),
    [
      "task-backend-contract",
      "task-backend-implementation",
      "task-backend-verification",
    ],
  );
  assert.equal(isJenniferAmcDraft(draft), true);
});

void test("payment work automatically receives data and security specialists", () => {
  const draft = createJenniferAmcDraft(
    "決済システムを作りたい",
    null,
    registry,
  );
  const domains = new Set(draft.nodes.map(({ domain }) => domain));
  assert(domains.has("payments"));
  assert(domains.has("data"));
  assert(domains.has("security"));
  assert(domains.has("backend"));
});

void test("AMC draft validation rejects cycles and knowledge authority escalation", () => {
  const draft = createJenniferAmcDraft("APIを開発したい", null, registry);
  const cycle = structuredClone(draft);
  cycle.nodes.find(({ id }) => id === "task-goal-contract").dependsOn = [
    "task-handoff",
  ];
  assert.equal(isJenniferAmcDraft(cycle), false);

  const escalated = structuredClone(draft);
  escalated.knowledge[0].authority = "execute";
  assert.equal(isJenniferAmcDraft(escalated), false);
});
