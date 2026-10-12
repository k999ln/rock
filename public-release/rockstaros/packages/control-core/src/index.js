const RISKS = new Set(["read", "write", "external"]);
const OUTCOMES = new Set(["succeeded", "failed", "interrupted", "unknown"]);

function required(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function isoTimestamp(value = new Date()) {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.valueOf())) {
    throw new TypeError("at must be a valid date");
  }
  return timestamp.toISOString();
}

export function createActionRequest(input) {
  const risk = input?.risk ?? "read";
  if (!RISKS.has(risk)) {
    throw new TypeError(`risk must be one of: ${[...RISKS].join(", ")}`);
  }

  return Object.freeze({
    id: required(input?.id, "id"),
    toolId: required(input?.toolId, "toolId"),
    action: required(input?.action, "action"),
    destination: required(input?.destination, "destination"),
    risk,
    status: risk === "read" ? "ready" : "approval_required",
    approval: null,
    outcome: null,
  });
}

export function approveAction(request, decision) {
  if (request?.status !== "approval_required") {
    throw new Error("Only an action awaiting approval can be decided");
  }

  const approved = decision?.approved === true;
  return Object.freeze({
    ...request,
    status: approved ? "ready" : "rejected",
    approval: Object.freeze({
      approved,
      actor: required(decision?.actor, "actor"),
      at: isoTimestamp(decision?.at),
    }),
  });
}

export function canExecute(request) {
  return request?.status === "ready";
}

export function recordOutcome(request, result) {
  if (!canExecute(request)) {
    throw new Error("The action is not ready to execute");
  }
  if (!OUTCOMES.has(result?.status)) {
    throw new TypeError(
      `status must be one of: ${[...OUTCOMES].join(", ")}`,
    );
  }

  return Object.freeze({
    ...request,
    status: "complete",
    outcome: Object.freeze({
      status: result.status,
      receipt: result.receipt ?? null,
      at: isoTimestamp(result.at),
    }),
  });
}

export const publicContract = Object.freeze({
  risks: Object.freeze([...RISKS]),
  outcomes: Object.freeze([...OUTCOMES]),
});
