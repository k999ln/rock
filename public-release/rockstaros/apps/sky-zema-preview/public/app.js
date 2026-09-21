import {
  addZemaMessage,
  beginZemaRun,
  completeZemaRun,
  createAnonymousToolEvent,
  createSkyCatalog,
  createSkyZemaHandoff,
  createZemaSession,
  sendAnonymousToolEvent,
} from "/core/index.js";

const tools = createSkyCatalog([
  {
    id: "public.text-tidy",
    name: "Text Tidy",
    description: "Normalize whitespace and return a clean local draft.",
    permission: "local",
  },
  {
    id: "public.action-checklist",
    name: "Action Checklist",
    description: "Turn local lines into a clear action checklist.",
    permission: "local",
  },
  {
    id: "public.unique-list",
    name: "Unique List",
    description: "Remove duplicate local lines while preserving their order.",
    permission: "local",
  },
]);

const elements = {
  catalog: document.querySelector("#catalog"),
  request: document.querySelector("#request"),
  result: document.querySelector("#result"),
  run: document.querySelector("#run"),
  selection: document.querySelector("#selection"),
  telemetry: document.querySelector("#telemetry"),
  telemetryLabel: document.querySelector("#telemetry-label"),
};
const config = await fetch("/config.json").then((response) => response.json());
const installationId =
  localStorage.getItem("rockstaros.public.installation") ??
  `install_${crypto.randomUUID().replaceAll("-", "")}`;
localStorage.setItem("rockstaros.public.installation", installationId);

let selected = null;
let session = null;

if (config.telemetryAvailable) {
  elements.telemetry.disabled = false;
  elements.telemetry.checked = false;
  elements.telemetryLabel.textContent =
    "Share anonymous tool events after each run.";
}

function execute(toolId, input) {
  if (toolId === "public.text-tidy") {
    return input.trim().replaceAll(/\s+/g, " ");
  }
  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (toolId === "public.action-checklist") {
    return lines.map((line) => `- [ ] ${line}`).join("\n");
  }
  if (toolId === "public.unique-list") {
    return [...new Set(lines)].join("\n");
  }
  throw new Error("Unknown public tool");
}

function selectTool(tool) {
  selected = tool;
  const handoff = createSkyZemaHandoff({
    toolId: tool.id,
    request: `Run ${tool.name} locally.`,
  });
  session = createZemaSession(handoff);
  session = addZemaMessage(session, {
    side: "zema",
    text: `${tool.name} is ready. Your text remains in this browser.`,
  });
  elements.selection.textContent = `${tool.name} · ${tool.permission}`;
  elements.request.disabled = false;
  elements.request.placeholder = "Enter a local sample.";
  elements.run.disabled = false;
  elements.request.focus();
  document.querySelectorAll(".tool").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.id === tool.id));
  });
}

for (const tool of tools) {
  const button = document.createElement("button");
  button.className = "tool";
  button.dataset.id = tool.id;
  button.setAttribute("aria-pressed", "false");
  const permission = document.createElement("span");
  permission.className = "tool-permission";
  permission.textContent = tool.permission;
  const name = document.createElement("strong");
  name.textContent = tool.name;
  const description = document.createElement("span");
  description.textContent = tool.description;
  button.append(permission, name, description);
  button.addEventListener("click", () => selectTool(tool));
  elements.catalog.append(button);
}

elements.run.addEventListener("click", async () => {
  const input = elements.request.value;
  if (!selected || !session || input.trim() === "") return;
  const started = performance.now();
  elements.run.disabled = true;
  elements.result.textContent = "Running locally…";
  try {
    session = addZemaMessage(session, { side: "user", text: input });
    session = beginZemaRun(session);
    const output = execute(selected.id, input);
    session = completeZemaRun(session, {
      status: "succeeded",
      summary: output,
    });
    elements.result.textContent = output;

    const event = createAnonymousToolEvent({
      packageKey: "ink.avokado.sky-zema-preview@0.1.0",
      toolName: selected.id,
      installationId,
      outcome: "succeeded",
      durationMs: Math.round(performance.now() - started),
      occurredAt: new Date().toISOString(),
    });
    await sendAnonymousToolEvent(event, {
      consent: elements.telemetry.checked,
      endpoint: config.telemetryEndpoint,
    });
  } catch (error) {
    elements.result.textContent =
      error instanceof Error ? error.message : "The local run failed.";
  } finally {
    elements.run.disabled = false;
  }
});
