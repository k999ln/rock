import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import registrySource from "../data/jennifer-knowledge.json" with { type: "json" };
import {
  createJenniferCoordinationPlan,
  isJenniferCoordinationPlan,
  jenniferResponsibilities,
} from "../lib/jennifer-coordination.ts";
import { parseJenniferKnowledgeRegistry } from "../lib/jennifer-amc-decomposition.ts";

const knowledge = parseJenniferKnowledgeRegistry(registrySource);

void test("Jennifer creates an advisory plan over the existing Zema responsibilities", () => {
  const plan = createJenniferCoordinationPlan(
    "既存資料を整理して、最新市場を調査し、比較分析して成果物を作成して",
    "request-1",
  );
  assert.equal(plan.authority, "advisory-only");
  assert.equal(plan.status, "proposed");
  assert.equal(plan.contextPolicy.defaultAccess, "none");
  assert.equal(plan.project, null);
  assert.equal(plan.amc.engine, "zema-amc");
  assert.equal(plan.amc.goalContract.confirmation, "required");
  assert.deepEqual(
    plan.steps.map(({ responsibility }) => responsibility),
    ["project-lead", "data-librarian", "research", "analysis", "delivery"],
  );
  assert.deepEqual(plan.steps[0].target, {
    kind: "amc",
    id: "rockstar-amc",
  });
  assert.deepEqual(plan.steps[3].dependsOn, ["step-research"]);
  assert.deepEqual(plan.steps[4].dependsOn, ["step-analysis"]);
  assert.equal(plan.steps[4].effect, "artifact-draft");
  assert.equal(isJenniferCoordinationPlan(plan), true);
});

void test("a selected real project binds one responsible AI without granting execution", () => {
  const plan = createJenniferCoordinationPlan(
    "OSの現状を確認して次の実装を進めて",
    "request-project",
    {
      id: "rockstaros-core",
      displayName: "RockstarOS",
      managerAgentId: "jennifer-os-manager",
      managerLabel: "OS担当AI",
      sourceRefs: ["PROJECTS.md"],
    },
    knowledge,
  );
  assert.equal(plan.project?.managerAgentId, "jennifer-os-manager");
  assert.equal(plan.amc.knowledge[0]?.id, "colombia");
  assert.equal(plan.authority, "advisory-only");
  assert.equal(isJenniferCoordinationPlan(plan), true);
  assert.equal(
    isJenniferCoordinationPlan({
      ...plan,
      project: { ...plan.project, approvalToken: "forbidden" },
    }),
    false,
  );
});

void test("dangerous effects stay proposed behind the existing gate", () => {
  const plan = createJenniferCoordinationPlan("調査結果を公開して支払いも実行して", "request-2");
  const delivery = plan.steps.find(({ responsibility }) => responsibility === "delivery");
  assert.equal(delivery?.effect, "financial-transaction");
  assert.equal(delivery?.approval, "existing-gate");
  assert.equal(plan.authority, "advisory-only");
  assert.equal("approvalToken" in plan, false);
  assert.equal("credential" in plan, false);
});

void test("saved plans reject escalated authority and invalid dependencies", () => {
  const plan = createJenniferCoordinationPlan("公開情報を調査して分析して", "request-3");
  assert.equal(isJenniferCoordinationPlan({ ...plan, authority: "root" }), false);
  assert.equal(
    isJenniferCoordinationPlan({ ...plan, approvalToken: "must-not-persist" }),
    false,
  );
  assert.equal(
    isJenniferCoordinationPlan({
      ...plan,
      steps: plan.steps.map((step, index) =>
        index === 1 ? { ...step, dependsOn: ["step-delivery"] } : step,
      ),
    }),
    false,
  );
});

void test("Jennifer is the visible coordinator while Zema remains the work system", () => {
  assert.deepEqual(
    jenniferResponsibilities.map(({ id }) => id),
    ["project-lead", "data-librarian", "research", "analysis", "delivery"],
  );
  const source = readFileSync(
    resolve(import.meta.dirname, "../lib/jennifer-coordination.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /operationRequest\s*\(/);
  assert.doesNotMatch(source, /workflowStatus\s*[:=]\s*['"]completed/);

  const chat = readFileSync(
    resolve(import.meta.dirname, "../components/sky-chat-workspace.tsx"),
    "utf8",
  );
  assert.match(chat, /Jennifer · Chief of Staff/);
  assert.match(chat, /ZEMA WORK SYSTEM/);
  assert.match(chat, /管理するプロジェクト/);
  assert.match(chat, /Jenniferは割当と確認を行い/);
  assert.match(chat, /<h1>Zema<\/h1>/);
});
