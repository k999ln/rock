/** Shared public wire contract. It grants no execution or approval authority. */
export const skyZemaLimits = Object.freeze({
  request: 2_000,
  message: 4_000,
  messages: 24,
  privateSessionTtlMs: 10 * 60 * 1_000,
  futureToleranceMs: 30_000,
});

/** @param {unknown} value */
export function isSkyToolId(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9:.-]{0,119}$/.test(value);
}

/**
 * @typedef {object} SkyZemaEnvelope
 * @property {1} version
 * @property {string} id
 * @property {'sky'} source
 * @property {string} toolId
 * @property {string} request
 * @property {'local-model'} executionProvider
 * @property {number} createdAt
 */

/**
 * Both v1 legacy spellings mean local execution; remote providers are rejected.
 * Storage expiry, UUID requirements, and one-shot consumption belong to the host.
 * @param {unknown} input
 * @returns {Readonly<SkyZemaEnvelope>}
 */
export function normalizeSkyZemaHandoff(input) {
  const value = /** @type {Partial<SkyZemaEnvelope> & { executionProvider?: unknown }} */ (input);
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    value.version !== 1 || value.source !== "sky" ||
    typeof value.id !== "string" || !value.id.trim() || value.id.length > 100 ||
    !isSkyToolId(value.toolId) ||
    typeof value.request !== "string" || value.request.length > skyZemaLimits.request ||
    ![undefined, "local", "local-model"].includes(value.executionProvider) ||
    typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)
  ) throw new TypeError("A valid local Sky handoff is required");
  return Object.freeze({
    version: 1,
    id: value.id,
    source: "sky",
    toolId: /** @type {string} */ (value.toolId),
    request: value.request,
    executionProvider: "local-model",
    createdAt: value.createdAt,
  });
}

/**
 * @param {{id: string, toolId: string, request: string, createdAt: number}} input
 * @returns {Readonly<SkyZemaEnvelope>}
 */
export function createSkyZemaEnvelope(input) {
  return normalizeSkyZemaHandoff({ ...input, version: 1, source: "sky", executionProvider: "local-model" });
}
