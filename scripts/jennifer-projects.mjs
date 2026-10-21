import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseJenniferProjectPortfolio,
  projectForTask,
} from "../lib/jennifer-projects.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const portfolio = parseJenniferProjectPortfolio(
  JSON.parse(readFileSync(resolve(root, "data/jennifer-projects.json"), "utf8")),
);
const status = JSON.parse(
  readFileSync(resolve(root, "data/project-status.json"), "utf8"),
);

if (!Array.isArray(status.tasks)) throw new Error("PROJECT_STATUS_INVALID");

const argumentsList = process.argv.slice(2);
const jsonOutput = argumentsList.includes("--json");
const positional = argumentsList.filter((value) => value !== "--json");
const command = positional[0] ?? "overview";

function statusFor(project) {
  const tasks = status.tasks.filter(
    (task) => projectForTask(portfolio, String(task.id))?.id === project.id,
  );
  const counts = { planned: 0, in_progress: 0, done: 0, blocked: 0 };
  for (const task of tasks) {
    if (!Object.hasOwn(counts, task.status))
      throw new Error(`PROJECT_TASK_STATUS_INVALID:${task.id}`);
    counts[task.status] += 1;
  }
  return {
    id: project.id,
    displayName: project.displayName,
    mission: project.mission,
    managerAgentId: project.managerAgentId,
    managerLabel: project.managerLabel,
    dependsOn: project.dependsOn,
    sourceRefs: project.sourceRefs,
    taskCount: tasks.length,
    counts,
    openTasks: tasks
      .filter((task) => task.status !== "done")
      .slice(0, 12)
      .map(({ id, title, status: taskStatus }) => ({ id, title, status: taskStatus })),
  };
}

const projects = portfolio.projects.map(statusFor);
const unassigned = status.tasks
  .filter((task) => !projectForTask(portfolio, String(task.id)))
  .map((task) => task.id);

if (command === "overview") {
  const output = {
    schema: portfolio.schema,
    updatedAt: status.updatedAt,
    manager: portfolio.portfolioManager,
    executionSystem: portfolio.executionSystem,
    projects,
    unassignedTaskIds: unassigned,
  };
  if (jsonOutput) console.log(JSON.stringify(output, null, 2));
  else {
    console.log("# Jennifer project portfolio");
    console.log("");
    console.log(`更新: ${status.updatedAt} / 実行基盤: ${portfolio.executionSystem.displayName}`);
    console.log("");
    console.log("| Project | 担当si | 未着手 | 進行中 | 完了 | 停止 |");
    console.log("| --- | --- | ---: | ---: | ---: | ---: |");
    for (const project of projects)
      console.log(
        `| ${project.displayName} | ${project.managerLabel} | ${project.counts.planned} | ${project.counts.in_progress} | ${project.counts.done} | ${project.counts.blocked} |`,
      );
    if (unassigned.length)
      console.log(`\n未割当task: ${unassigned.join(", ")}`);
  }
} else if (command === "project") {
  const id = positional[1];
  const project = projects.find((item) => item.id === id);
  if (!project) throw new Error("JENNIFER_PROJECT_NOT_FOUND");
  if (jsonOutput) console.log(JSON.stringify(project, null, 2));
  else {
    console.log(`# ${project.displayName}`);
    console.log("");
    console.log(`${project.mission}`);
    console.log("");
    console.log(`担当si: ${project.managerLabel} (${project.managerAgentId})`);
    console.log(`依存: ${project.dependsOn.join(", ") || "なし"}`);
    console.log(`task: ${project.taskCount}件 / 進行中${project.counts.in_progress} / 未着手${project.counts.planned} / 停止${project.counts.blocked}`);
    console.log("");
    console.log("## 次の未完了task");
    for (const task of project.openTasks)
      console.log(`- ${task.id} [${task.status}] ${task.title}`);
    console.log("");
    console.log("## 正本入口");
    for (const source of project.sourceRefs) console.log(`- ${source}`);
  }
} else if (command === "map") {
  console.log("flowchart LR");
  console.log('  user["利用者"] --> jennifer["Jennifer"]');
  console.log('  jennifer --> zema["Zema work control"]');
  for (const project of portfolio.projects) {
    console.log(
      `  jennifer --> ${project.id.replaceAll("-", "_")}["${project.displayName}<br/>${project.managerLabel}"]`,
    );
    for (const dependency of project.dependsOn)
      console.log(
        `  ${project.id.replaceAll("-", "_")} -. depends on .-> ${dependency.replaceAll("-", "_")}`,
      );
  }
} else {
  throw new Error("JENNIFER_PROJECT_COMMAND_INVALID");
}
