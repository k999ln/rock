export type JenniferProject = {
  id: string;
  displayName: string;
  mission: string;
  managerAgentId: string;
  managerLabel: string;
  taskPrefixes: string[];
  dependsOn: string[];
  sourceRefs: string[];
};

export type JenniferProjectPortfolio = {
  schema: "rockstaros-jennifer-project-portfolio/1";
  updatedAt: string;
  portfolioManager: {
    id: "jennifer";
    displayName: "Jennifer";
    role: "portfolio-chief-of-staff";
    authority: "advisory-and-assignment-only";
  };
  executionSystem: {
    id: "zema";
    displayName: "Zema";
    role: "work-control-system";
    authority: "existing-broker-gates-only";
  };
  projects: JenniferProject[];
};

const SAFE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const SAFE_PREFIX = /^[A-Z][A-Z0-9]{0,11}$/;

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function boundedStringList(
  value: unknown,
  maxItems: number,
  maxLength: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= maxItems &&
    value.every((item) => boundedString(item, maxLength)) &&
    new Set(value).size === value.length
  );
}

export function isJenniferProjectPortfolio(
  value: unknown,
): value is JenniferProjectPortfolio {
  if (
    !plainObject(value) ||
    !hasOnlyKeys(value, [
      "schema",
      "updatedAt",
      "portfolioManager",
      "executionSystem",
      "projects",
    ]) ||
    value.schema !== "rockstaros-jennifer-project-portfolio/1" ||
    typeof value.updatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.updatedAt) ||
    !plainObject(value.portfolioManager) ||
    !hasOnlyKeys(value.portfolioManager, ["id", "displayName", "role", "authority"]) ||
    value.portfolioManager.id !== "jennifer" ||
    value.portfolioManager.displayName !== "Jennifer" ||
    value.portfolioManager.role !== "portfolio-chief-of-staff" ||
    value.portfolioManager.authority !== "advisory-and-assignment-only" ||
    !plainObject(value.executionSystem) ||
    !hasOnlyKeys(value.executionSystem, ["id", "displayName", "role", "authority"]) ||
    value.executionSystem.id !== "zema" ||
    value.executionSystem.displayName !== "Zema" ||
    value.executionSystem.role !== "work-control-system" ||
    value.executionSystem.authority !== "existing-broker-gates-only" ||
    !Array.isArray(value.projects) ||
    value.projects.length < 1 ||
    value.projects.length > 32
  )
    return false;

  const projectIds = new Set<string>();
  const taskPrefixes = new Set<string>();
  for (const rawProject of value.projects) {
    if (
      !plainObject(rawProject) ||
      !hasOnlyKeys(rawProject, [
        "id",
        "displayName",
        "mission",
        "managerAgentId",
        "managerLabel",
        "taskPrefixes",
        "dependsOn",
        "sourceRefs",
      ]) ||
      typeof rawProject.id !== "string" ||
      !SAFE_ID.test(rawProject.id) ||
      projectIds.has(rawProject.id) ||
      !boundedString(rawProject.displayName, 80) ||
      !boundedString(rawProject.mission, 240) ||
      typeof rawProject.managerAgentId !== "string" ||
      !SAFE_ID.test(rawProject.managerAgentId) ||
      !boundedString(rawProject.managerLabel, 80) ||
      !boundedStringList(rawProject.taskPrefixes, 24, 12) ||
      !rawProject.taskPrefixes.every(
        (prefix) => SAFE_PREFIX.test(prefix) && !taskPrefixes.has(prefix),
      ) ||
      !Array.isArray(rawProject.dependsOn) ||
      rawProject.dependsOn.length > 12 ||
      !rawProject.dependsOn.every(
        (dependency) => typeof dependency === "string" && SAFE_ID.test(dependency),
      ) ||
      new Set(rawProject.dependsOn).size !== rawProject.dependsOn.length ||
      !boundedStringList(rawProject.sourceRefs, 16, 180)
    )
      return false;
    projectIds.add(rawProject.id);
    for (const prefix of rawProject.taskPrefixes) taskPrefixes.add(prefix);
  }

  const projects = value.projects as JenniferProject[];
  return projects.every(
    (project) =>
      !project.dependsOn.includes(project.id) &&
      project.dependsOn.every((dependency) => projectIds.has(dependency)),
  );
}

export function parseJenniferProjectPortfolio(
  value: unknown,
): JenniferProjectPortfolio {
  if (!isJenniferProjectPortfolio(value))
    throw new Error("JENNIFER_PROJECT_PORTFOLIO_INVALID");
  return value;
}

export function taskPrefixFor(taskId: string) {
  return taskId.match(/^[A-Z]+/)?.[0] ?? "";
}

export function projectForTask(
  portfolio: JenniferProjectPortfolio,
  taskId: string,
) {
  const prefix = taskPrefixFor(taskId);
  return (
    portfolio.projects.find((project) => project.taskPrefixes.includes(prefix)) ?? null
  );
}
