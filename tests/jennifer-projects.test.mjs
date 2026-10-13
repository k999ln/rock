import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  isJenniferProjectPortfolio,
  parseJenniferProjectPortfolio,
  projectForTask,
} from "../lib/jennifer-projects.ts";

const root = resolve(import.meta.dirname, "..");
const source = JSON.parse(
  readFileSync(resolve(root, "data/jennifer-projects.json"), "utf8"),
);
const portfolio = parseJenniferProjectPortfolio(source);

void test("every real project has one responsible AI and Zema remains the execution system", () => {
  assert.equal(portfolio.portfolioManager.id, "jennifer");
  assert.equal(portfolio.executionSystem.id, "zema");
  assert.equal(portfolio.executionSystem.authority, "existing-broker-gates-only");
  assert.equal(new Set(portfolio.projects.map(({ managerAgentId }) => managerAgentId)).size, portfolio.projects.length);
  assert(portfolio.projects.every(({ managerAgentId }) => managerAgentId.length > 0));
});

void test("the portfolio assigns every current task prefix exactly once", () => {
  const status = JSON.parse(
    readFileSync(resolve(root, "data/project-status.json"), "utf8"),
  );
  const assignments = status.tasks.map((task) => [task.id, projectForTask(portfolio, task.id)]);
  assert.deepEqual(
    assignments.filter(([, project]) => project === null),
    [],
  );
  assert.equal(projectForTask(portfolio, "SKY22")?.id, "jennifer-zema");
  assert.equal(projectForTask(portfolio, "SYS15")?.id, "spider-security");
  assert.equal(projectForTask(portfolio, "MINI01")?.id, "hardware");
});

void test("portfolio validation rejects authority changes, duplicate prefixes and missing dependencies", () => {
  assert.equal(
    isJenniferProjectPortfolio({
      ...source,
      portfolioManager: { ...source.portfolioManager, authority: "root" },
    }),
    false,
  );
  assert.equal(
    isJenniferProjectPortfolio({
      ...source,
      projects: source.projects.map((project, index) =>
        index === 1 ? { ...project, taskPrefixes: [source.projects[0].taskPrefixes[0]] } : project,
      ),
    }),
    false,
  );
  assert.equal(
    isJenniferProjectPortfolio({
      ...source,
      projects: source.projects.map((project, index) =>
        index === 0 ? { ...project, dependsOn: ["missing-project"] } : project,
      ),
    }),
    false,
  );
});

void test("the CLI produces a metadata-only overview and relationship map", () => {
  for (const args of [["overview", "--json"], ["map"]]) {
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/jennifer-projects.mjs", ...args],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /approvalToken|credentialValue|secretValue/);
    if (args[0] === "overview") {
      const overview = JSON.parse(result.stdout);
      assert.equal(overview.projects.length, portfolio.projects.length);
      assert.deepEqual(overview.unassignedTaskIds, []);
    } else {
      assert.match(result.stdout, /Jennifer/);
      assert.match(result.stdout, /Zema work control/);
      assert.match(result.stdout, /Spider Security/);
    }
  }
});
