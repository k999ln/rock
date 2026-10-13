import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import registrySource from "../data/jennifer-knowledge.json" with { type: "json" };
import { validateAmcGoal, amcSummary, applyAmcEvent } from "../lib/amc-tool.ts";
import { createJenniferCoordinationPlan } from "../lib/jennifer-coordination.ts";
import { parseJenniferKnowledgeRegistry } from "../lib/jennifer-amc-decomposition.ts";
import {
  buildJenniferDispatchPrompt,
  buildJenniferExecutionReport,
  createJenniferExecutionGoal,
  createJenniferTaskJobCoordination,
  jenniferDelegationKey,
  parseJenniferDelegationKey,
  parseJenniferTaskJobCoordination,
} from "../lib/jennifer-amc-execution.ts";
import { createWorkJob } from "../lib/workflow.ts";

const knowledge = parseJenniferKnowledgeRegistry(registrySource);
const plan = () => createJenniferCoordinationPlan(
  "Jenniferから担当AIへ実dispatchし、成果、Receipt、未完了をZemaで管理する",
  "request-execution",
  {
    id: "rockstaros-core",
    displayName: "RockstarOS",
    managerAgentId: "jennifer-os-manager",
    managerLabel: "OS担当si",
    sourceRefs: ["PROJECTS.md"],
  },
  knowledge,
);

void test("owner confirmation compiles Jennifer's proposal into a valid active AMC goal", () => {
  const source = plan();
  const goal = createJenniferExecutionGoal(source, "2026-10-10T12:00:00.000Z");
  assert.equal(validateAmcGoal(goal), goal);
  assert.equal(goal.state, "active");
  assert.equal(goal.coordinationRef.planId, source.id);
  assert.equal(goal.requestBrief.goal, goal.instruction);
  assert.equal(goal.tasks.find(({ id }) => id === "task-goal-contract")?.status, "done");
  assert.ok(goal.tasks.every((task) => typeof task.specialistProfile === "string"));
  assert.ok(goal.tasks.every((task) => Array.isArray(task.allowedPaths)));
  assert.deepEqual(amcSummary(goal).readyTaskIds, ["task-inventory"]);
});

void test("dispatch prompt is bounded to one schedulable leaf and its allowed paths", () => {
  const goal = createJenniferExecutionGoal(plan());
  const prompt = buildJenniferDispatchPrompt(goal, "task-inventory");
  assert.match(prompt, /Task ID: task-inventory/);
  assert.match(prompt, /Allowed paths:/);
  assert.match(prompt, /Do not read or expose credentials/);
  assert.throws(() => buildJenniferDispatchPrompt(goal, "task-architecture"), /NOT_READY/);
});

void test("task execution stays submitted until a different reviewer accepts evidence", () => {
  let goal = createJenniferExecutionGoal(plan());
  const task = goal.tasks.find(({ id }) => id === "task-inventory");
  const worker = "a2a-worker:worker-delegation";
  goal = applyAmcEvent(goal, {
    id: randomUUID(), type: "start_task", expectedRevision: goal.revision,
    actor: worker, role: "worker", taskId: task.id,
  });
  goal = applyAmcEvent(goal, {
    id: randomUUID(), type: "submit_result", expectedRevision: goal.revision,
    actor: worker, role: "worker", taskId: task.id, outcome: "succeeded",
    summary: "artifactと利用Receiptを取得した",
    deliverables: task.deliverables.map(({ path }) => path),
    evidence: ["a2a:worker-delegation:artifact", "a2a:worker-delegation:usage-receipt"],
  });
  assert.equal(goal.tasks.find(({ id }) => id === task.id)?.status, "submitted");
  assert.throws(() => applyAmcEvent(goal, {
    id: randomUUID(), type: "verify_task", expectedRevision: goal.revision,
    actor: worker, role: "reviewer", taskId: task.id, accepted: true,
    evidence: ["a2a:reviewer-delegation:artifact"],
    criterionResults: task.acceptanceCriteria.map(({ id }) => ({
      criterionId: id, passed: true, evidence: ["a2a:reviewer-delegation:artifact"],
    })),
  }), /Independent reviewer/);
  goal = applyAmcEvent(goal, {
    id: randomUUID(), type: "verify_task", expectedRevision: goal.revision,
    actor: "a2a-reviewer:reviewer-delegation", role: "reviewer", taskId: task.id,
    accepted: true,
    evidence: ["a2a:reviewer-delegation:artifact", "a2a:reviewer-delegation:usage-receipt"],
    criterionResults: task.acceptanceCriteria.map(({ id }) => ({
      criterionId: id, passed: true, evidence: ["a2a:reviewer-delegation:artifact"],
    })),
  });
  assert.equal(goal.tasks.find(({ id }) => id === task.id)?.status, "done");
  assert.equal(buildJenniferExecutionReport(goal).overallStatus, "in_progress");
});

void test("delegation correlation and per-leaf cloud jobs are validated", () => {
  const goal = createJenniferExecutionGoal(plan());
  const task = goal.tasks.find(({ id }) => id === "task-inventory");
  const rootJobId = randomUUID();
  const coordination = createJenniferTaskJobCoordination(
    rootJobId, goal.coordinationRef.planId, task, "worker",
  );
  const job = createWorkJob({
    id: randomUUID(),
    title: task.title,
    templateId: "cloud-agent",
    coordination,
  });
  assert.deepEqual(job.coordination, coordination);
  assert.deepEqual(parseJenniferTaskJobCoordination(coordination), coordination);
  assert.equal(parseJenniferTaskJobCoordination({ ...coordination, rootJobId: "no" }), null);
  const key = jenniferDelegationKey(task.id, "worker", "nonce.1");
  assert.deepEqual(parseJenniferDelegationKey(key), {
    taskId: task.id, role: "worker", nonce: "nonce.1",
  });
});

void test("Jennifer report never turns remote completion into accepted AMC completion", () => {
  const goal = createJenniferExecutionGoal(plan());
  const report = buildJenniferExecutionReport(goal, [{
    id: randomUUID(),
    parentJobId: randomUUID(),
    idempotencyKey: jenniferDelegationKey("task-inventory", "worker", "run-1"),
    state: "remote_completed",
    artifactsCaptured: 1,
  }]);
  assert.equal(report.overallStatus, "in_progress");
  assert.equal(report.ownerAcceptance.status, "not_ready");
  assert.ok(report.unresolved.some(({ taskId }) => taskId === "task-inventory"));
});
