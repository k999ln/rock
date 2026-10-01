import {
  createAnonymousToolEvent,
  sendAnonymousToolEvent,
} from "../../sky-zema-core/src/index.js";

export {
  createFitnessBridge,
  createHealthConnectAdapter,
  createHealthKitAdapter,
  fitnessSdkContract,
} from "./fitness.js";

const TOOL_ID = /^[a-z0-9][a-z0-9:.-]{0,119}$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const CAPABILITY = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const INSTALLATION_ID = /^[a-zA-Z0-9_-]{8,128}$/;
const PERMISSIONS = new Set(["read", "local-write", "external"]);

function text(value, name, max) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > max
  ) {
    throw new TypeError(`${name} must be a non-empty string up to ${max} characters`);
  }
  return value.trim();
}

function publicManifest(input) {
  const id = text(input?.id, "manifest.id", 120);
  const version = text(input?.version, "manifest.version", 30);
  const permission = input?.permission ?? "read";
  if (!TOOL_ID.test(id)) throw new TypeError("manifest.id has an invalid format");
  if (!VERSION.test(version)) {
    throw new TypeError("manifest.version must use major.minor.patch");
  }
  if (!PERMISSIONS.has(permission)) {
    throw new TypeError("manifest.permission has an invalid value");
  }
  if (
    !Array.isArray(input?.capabilities) ||
    input.capabilities.length === 0 ||
    input.capabilities.some(
      (value) => typeof value !== "string" || !CAPABILITY.test(value),
    )
  ) {
    throw new TypeError("manifest.capabilities must contain valid capability IDs");
  }

  return Object.freeze({
    id,
    version,
    name: text(input?.name, "manifest.name", 120),
    description: text(input?.description, "manifest.description", 500),
    permission,
    capabilities: Object.freeze([...new Set(input.capabilities)]),
  });
}

function result(value) {
  return Object.freeze(value);
}

export function createHttpToolEventSink({ endpoint, token, fetchImpl } = {}) {
  return async (event) =>
    sendAnonymousToolEvent(event, {
      consent: true,
      endpoint,
      authorization: token ? `Bearer ${token}` : "",
      fetchImpl,
    });
}

export function createSky({
  installationId =
    `install_${globalThis.crypto?.randomUUID?.().replaceAll("-", "") ?? Date.now().toString(36)}`,
  requestApproval = async () => false,
  telemetryConsent = () => false,
  eventSink = null,
  onEventError = () => {},
  now = () => new Date(),
  clock = () => performance.now(),
} = {}) {
  if (!INSTALLATION_ID.test(installationId)) {
    throw new TypeError("installationId has an invalid format");
  }
  if (typeof requestApproval !== "function") {
    throw new TypeError("requestApproval must be a function");
  }
  if (typeof telemetryConsent !== "function") {
    throw new TypeError("telemetryConsent must be a function");
  }
  if (eventSink !== null && typeof eventSink !== "function") {
    throw new TypeError("eventSink must be a function or null");
  }

  const tools = new Map();
  const listeners = new Set();

  async function notify(manifest, outcome, durationMs) {
    const event = createAnonymousToolEvent({
      packageKey: `${manifest.id}@${manifest.version}`,
      toolName: manifest.id,
      installationId,
      outcome,
      durationMs: Math.max(0, Math.round(durationMs)),
      occurredAt: now().toISOString(),
    });
    for (const listener of listeners) listener(event);
    if (!eventSink || !telemetryConsent()) return;
    try {
      await eventSink(event);
    } catch (error) {
      onEventError(error);
    }
  }

  function register(manifestInput, handler) {
    const manifest = publicManifest(manifestInput);
    if (typeof handler !== "function") {
      throw new TypeError("handler must be a function");
    }
    if (tools.has(manifest.id)) {
      throw new Error(`tool already registered: ${manifest.id}`);
    }
    tools.set(manifest.id, Object.freeze({ manifest, handler }));
    return () => tools.delete(manifest.id);
  }

  function list({ capability } = {}) {
    if (capability !== undefined && !CAPABILITY.test(capability)) {
      throw new TypeError("capability has an invalid format");
    }
    return Object.freeze(
      [...tools.values()]
        .map(({ manifest }) => manifest)
        .filter(
          (manifest) =>
            capability === undefined || manifest.capabilities.includes(capability),
        ),
    );
  }

  function get(toolId) {
    return tools.get(toolId)?.manifest ?? null;
  }

  async function run(toolId, input, { signal } = {}) {
    const entry = tools.get(toolId);
    if (!entry) throw new Error(`unknown Sky tool: ${toolId}`);
    const { manifest, handler } = entry;
    const started = clock();

    if (manifest.permission !== "read") {
      const approved = await requestApproval(
        Object.freeze({
          tool: manifest,
          permission: manifest.permission,
        }),
      );
      if (approved !== true) {
        const durationMs = clock() - started;
        await notify(manifest, "rejected", durationMs);
        return result({
          ok: false,
          outcome: "rejected",
          data: null,
          durationMs: Math.max(0, Math.round(durationMs)),
        });
      }
    }

    try {
      const data = await handler(input, Object.freeze({ signal }));
      const durationMs = clock() - started;
      await notify(manifest, "succeeded", durationMs);
      return result({
        ok: true,
        outcome: "succeeded",
        data,
        durationMs: Math.max(0, Math.round(durationMs)),
      });
    } catch (error) {
      const durationMs = clock() - started;
      await notify(manifest, "failed", durationMs);
      return result({
        ok: false,
        outcome: "failed",
        data: null,
        error: error instanceof Error ? error.message : "Tool execution failed",
        durationMs: Math.max(0, Math.round(durationMs)),
      });
    }
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("listener must be a function");
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({ register, list, get, run, subscribe });
}

export const skySdkContract = Object.freeze({
  permissions: Object.freeze([...PERMISSIONS]),
});
