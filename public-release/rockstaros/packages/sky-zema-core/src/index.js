const TOOL_ID = /^[a-z0-9][a-z0-9:.-]{0,119}$/;
const PACKAGE_KEY =
  /^[a-z0-9]+(?:[.-][a-z0-9]+)+@[0-9]+\.[0-9]+\.[0-9]+$/;
const INSTALLATION_ID = /^[a-zA-Z0-9_-]{8,128}$/;
const OUTCOMES = new Set(["succeeded", "failed", "rejected", "unknown"]);

function required(value, name, max = 2_000) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > max
  ) {
    throw new TypeError(`${name} must be a non-empty string up to ${max} characters`);
  }
  return value.trim();
}

function validDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError("at must be a valid date");
  return date.toISOString();
}

function freeze(value) {
  return Object.freeze(value);
}

export function createSkyCatalog(tools) {
  if (!Array.isArray(tools)) throw new TypeError("tools must be an array");
  const ids = new Set();
  return freeze(
    tools.map((input) => {
      const id = required(input?.id, "tool.id", 120);
      if (!TOOL_ID.test(id)) throw new TypeError("tool.id has an invalid format");
      if (ids.has(id)) throw new TypeError(`duplicate tool.id: ${id}`);
      ids.add(id);
      return freeze({
        id,
        name: required(input?.name, "tool.name", 120),
        description: required(input?.description, "tool.description", 500),
        permission: input?.permission === "external" ? "external" : "local",
      });
    }),
  );
}

export function createSkyZemaHandoff(input) {
  const toolId = required(input?.toolId, "toolId", 120);
  if (!TOOL_ID.test(toolId)) throw new TypeError("toolId has an invalid format");
  const id =
    input?.id ??
    globalThis.crypto?.randomUUID?.() ??
    `handoff-${Date.now().toString(36)}`;
  return freeze({
    version: 1,
    id: required(id, "id", 100),
    source: "sky",
    toolId,
    request: required(input?.request, "request", 2_000),
    executionProvider: "local",
    createdAt: new Date(input?.at ?? Date.now()).valueOf(),
  });
}

export function createZemaSession(handoff) {
  if (handoff?.version !== 1 || handoff?.source !== "sky") {
    throw new TypeError("A valid Sky handoff is required");
  }
  return freeze({
    version: 1,
    id: handoff.id,
    toolId: handoff.toolId,
    request: handoff.request,
    status: "ready",
    messages: freeze([]),
    outcome: null,
  });
}

export function addZemaMessage(session, input) {
  if (!["user", "zema"].includes(input?.side)) {
    throw new TypeError("side must be user or zema");
  }
  const messages = [
    ...session.messages,
    freeze({
      side: input.side,
      text: required(input?.text, "message.text", 4_000),
    }),
  ].slice(-24);
  return freeze({ ...session, messages: freeze(messages) });
}

export function beginZemaRun(session) {
  if (session?.status !== "ready") {
    throw new Error("Only a ready Zema session can begin");
  }
  return freeze({ ...session, status: "running" });
}

export function completeZemaRun(session, result) {
  if (session?.status !== "running") {
    throw new Error("Only a running Zema session can complete");
  }
  if (!OUTCOMES.has(result?.status)) {
    throw new TypeError(`status must be one of: ${[...OUTCOMES].join(", ")}`);
  }
  return freeze({
    ...session,
    status: "completed",
    outcome: freeze({
      status: result.status,
      summary: required(result?.summary, "summary", 4_000),
    }),
  });
}

export function createAnonymousToolEvent(input) {
  const allowed = new Set([
    "packageKey",
    "toolName",
    "installationId",
    "outcome",
    "durationMs",
    "occurredAt",
  ]);
  if (
    !input ||
    typeof input !== "object" ||
    Object.keys(input).some((key) => !allowed.has(key))
  ) {
    throw new TypeError("event contains unsupported fields");
  }
  if (!PACKAGE_KEY.test(input.packageKey ?? "")) {
    throw new TypeError("packageKey has an invalid format");
  }
  if (!TOOL_ID.test(input.toolName ?? "")) {
    throw new TypeError("toolName has an invalid format");
  }
  if (!INSTALLATION_ID.test(input.installationId ?? "")) {
    throw new TypeError("installationId has an invalid format");
  }
  if (!OUTCOMES.has(input.outcome)) {
    throw new TypeError("outcome has an invalid value");
  }
  if (
    !Number.isInteger(input.durationMs) ||
    input.durationMs < 0 ||
    input.durationMs > 86_400_000
  ) {
    throw new TypeError("durationMs must be an integer between 0 and 86400000");
  }

  return freeze({
    packageKey: input.packageKey,
    toolName: input.toolName,
    installationId: input.installationId,
    outcome: input.outcome,
    durationMs: input.durationMs,
    occurredAt: validDate(input.occurredAt),
  });
}

export async function sendAnonymousToolEvent(
  event,
  {
    consent = false,
    endpoint = "",
    authorization = "",
    fetchImpl = globalThis.fetch,
  } = {},
) {
  if (!consent) return freeze({ sent: false, reason: "consent_required" });
  if (!endpoint) return freeze({ sent: false, reason: "endpoint_not_configured" });
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))
  ) {
    throw new TypeError("telemetry endpoint must use HTTPS");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetch is unavailable");
  }
  if (
    typeof authorization !== "string" ||
    authorization.length > 512 ||
    /[\r\n]/.test(authorization)
  ) {
    throw new TypeError("authorization has an invalid format");
  }

  const payload = createAnonymousToolEvent(event);
  const headers = { "content-type": "application/json" };
  if (authorization) headers.authorization = authorization;
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`telemetry request failed: ${response.status}`);
  return freeze({ sent: true, reason: null });
}

export const publicSkyZemaContract = freeze({
  outcomes: freeze([...OUTCOMES]),
  telemetryFields: freeze([
    "packageKey",
    "toolName",
    "installationId",
    "outcome",
    "durationMs",
    "occurredAt",
  ]),
});
