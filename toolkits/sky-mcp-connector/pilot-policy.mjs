import { timingSafeEqual } from 'node:crypto';

export const PILOT_ORIGIN = 'https://sky-marketplace.noellesugar1.chatgpt.site';
export const PILOT_TTL_MS = 30 * 60_000;
export const PILOT_TOOLS = Object.freeze([
  'coconala_check', 'format_citations', 'make_free_article', 'verify_delivery',
]);

function denied(message) {
  const error = new Error(message);
  error.status = 403;
  error.code = 'pilot_scope_denied';
  throw error;
}

export function validatePilotRegistry(specs) {
  if (specs.length !== 1 || specs[0].id !== 'rock-star-mr' || specs[0].transport !== 'stdio')
    denied('限定試験は基本自動化のstdio MCP 1件だけを指定してください。');
}

export function validatePilotRpc(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) denied('限定試験のMCP requestを確認してください。');
  if (['initialize', 'notifications/initialized', 'ping', 'tools/list'].includes(input.method)) return;
  if (input.method === 'tools/call' && PILOT_TOOLS.includes(input.params?.name)) return;
  denied('限定試験で許可されたMCP機能ではありません。');
}

export function pilotToolList(result) {
  if (!Array.isArray(result?.tools)) return result;
  return { ...result, tools: result.tools.filter(tool => PILOT_TOOLS.includes(tool?.name)) };
}

// Verification only: this helper never creates or refreshes a credential.
export function connectorAuthorizationValid(authorization, grant, now = Date.now()) {
  if (!Number.isSafeInteger(now) || !grant || typeof grant.token !== 'string' || !grant.token || typeof authorization !== 'string') return false;
  if (grant.expiresAt !== null && (!Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= now)) return false;
  const expected = `Bearer ${grant.token}`;
  const suppliedBytes = Buffer.from(authorization), expectedBytes = Buffer.from(expected);
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}
