import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { decisionErrorCode } from '../lib/decision/errors.ts';
import { makeDecisionRequest } from '../lib/decision/validation.ts';
import { TypeSafeJevProvider } from '../lib/decision/providers/typesafe-jev.ts';

export const PIXEL_JEV_BRIDGE_HOST = '127.0.0.1';
export const PIXEL_JEV_BRIDGE_PORT = 49211;
export const PIXEL_JEV_BRIDGE_PATH = '/v1/pixel-jev-preview';
export const PIXEL_JEV_FIXTURE_BODY = JSON.stringify({
  fixture: 'public-choice-v1',
});
export const PIXEL_JEV_MODEL = 'jev-latest';
export const PIXEL_JEV_RESPONSE_MODEL_PREFIX = 'jev-';
export const PIXEL_JEV_TIMEOUT_MS = 10_000;
export const PIXEL_JEV_ESTIMATED_COST_MICROS = 100;
export const PIXEL_JEV_MAX_COST_MICROS = 1_000;
export const PIXEL_JEV_MAX_BODY_BYTES = 1_024;
export const PIXEL_JEV_MAX_RESPONSE_BYTES = 4_096;
export const PIXEL_JEV_LIFETIME_MS = 120_000;

const ERROR_STATUSES = new Set([
  'already_used',
  'invalid_request',
  'provider_unavailable',
  'timeout',
  'rate_limited',
  'budget_blocked',
  'provider_error',
  'invalid_response',
]);

/**
 * The only request the physical preview is allowed to send. It is deliberately
 * made from constants so a caller cannot pass device text, a Tool id, or an
 * action payload into the relay.
 */
export function pixelJevFixtureRequest() {
  return makeDecisionRequest({
    requestId: 'pixel_jev_preview_1',
    ownerRef: 'pixel_jev_preview_owner',
    workId: 'pixel_jev_preview_work',
    purpose: 'route',
    state: {
      fixture: 'public_choice_v1',
      signal: 'keep_on_device',
    },
    questions: [
      {
        id: 'route',
        kind: 'choice',
        instructions: 'Given the signal, choose one route for this public developer fixture.',
        options: {
          local: 'Keep the choice on the device.',
          unknown: 'No confident choice.',
        },
        unknownOptionRequired: true,
      },
    ],
    dataClasses: ['public'],
    effect: 'none',
    constraints: {
      offlineRequired: false,
      cloudAllowed: true,
      maxLatencyMs: PIXEL_JEV_TIMEOUT_MS,
      maxCostMicros: PIXEL_JEV_MAX_COST_MICROS,
      maxAttempts: 1,
    },
    policyVersion: 'pixel-jev-developer-preview-v1',
  });
}

function emptyTokens() {
  return { input: 0, output: 0 };
}

function bridgeResult(status, answer = '', token = emptyTokens(), model = '') {
  if (
    typeof status !== 'string' ||
    (status !== 'ok' && !ERROR_STATUSES.has(status))
  )
    throw new Error('invalid bridge status');
  return { status, answer, token, model };
}

function providerErrorStatus(error) {
  switch (decisionErrorCode(error)) {
    case 'PROVIDER_TIMEOUT':
    case 'MAX_LATENCY_EXCEEDED':
      return 'timeout';
    case 'MAX_COST_EXCEEDED':
      return 'budget_blocked';
    case 'PROVIDER_RATE_LIMITED':
      return 'rate_limited';
    case 'PROVIDER_UNAVAILABLE':
      return 'provider_unavailable';
    case 'PROVIDER_MALFORMED_RESPONSE':
    case 'INVALID_RESULT':
      return 'invalid_response';
    default:
      return 'provider_error';
  }
}

function resultFromProvider(result) {
  const answer = result?.answers?.route;
  const usage = result?.usage;
  if (
    result?.provider !== 'typesafe_jev' ||
    result?.status !== 'answered' ||
    typeof result?.modelId !== 'string' ||
    !result.modelId.startsWith(PIXEL_JEV_RESPONSE_MODEL_PREFIX) ||
    answer?.kind !== 'choice' ||
    answer.value !== 'local' ||
    !Number.isSafeInteger(usage?.inputTokens) ||
    !Number.isSafeInteger(usage?.outputTokens)
  )
    return bridgeResult('invalid_response');
  return bridgeResult(
    'ok',
    answer.value,
    { input: usage.inputTokens, output: usage.outputTokens },
    result.modelId,
  );
}

function writeJson(response, statusCode, body) {
  const encoded = Buffer.from(JSON.stringify(body), 'utf8');
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'",
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': encoded.length,
    Connection: 'close',
  });
  response.end(encoded);
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let bytes = 0;
    let tooLarge = false;
    const chunks = [];
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes <= PIXEL_JEV_MAX_BODY_BYTES) chunks.push(chunk);
      else tooLarge = true;
    });
    request.on('end', () =>
      resolveBody({
        tooLarge,
        body: tooLarge ? '' : chunks.join(''),
      }),
    );
    request.on('error', () => rejectBody(new Error('request body failed')));
  });
}

function validRequest(request, body) {
  const contentType = request.headers['content-type'];
  return (
    request.method === 'POST' &&
    request.url === PIXEL_JEV_BRIDGE_PATH &&
    typeof contentType === 'string' &&
    contentType.toLowerCase().startsWith('application/json') &&
    !request.headers.origin &&
    body === PIXEL_JEV_FIXTURE_BODY
  );
}

/**
 * Create the one-call physical preview relay. The returned server never
 * accepts device text or an action. A valid request consumes the sole provider
 * slot before the provider is called; every later request is rejected.
 */
export function createPixelJevBridge({ provider } = {}) {
  if (!provider || typeof provider.decide !== 'function')
    throw new TypeError('provider is required');
  let consumed = false;
  let providerCalls = 0;
  const closeAfterResponse = (response) => {
    response.once('finish', () => {
      if (server.listening) server.close();
    });
  };
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== PIXEL_JEV_BRIDGE_PATH) {
      request.resume();
      writeJson(response, 405, bridgeResult('invalid_request'));
      return;
    }
    if (consumed) {
      request.resume();
      writeJson(response, 409, bridgeResult('already_used'));
      return;
    }
    if (Number(request.headers['content-length'] || 0) > PIXEL_JEV_MAX_BODY_BYTES) {
      request.resume();
      writeJson(response, 413, bridgeResult('invalid_request'));
      return;
    }
    let received;
    try {
      received = await readBody(request);
    } catch {
      writeJson(response, 400, bridgeResult('invalid_request'));
      return;
    }
    if (received.tooLarge || !validRequest(request, received.body)) {
      writeJson(response, 400, bridgeResult('invalid_request'));
      return;
    }
    consumed = true;
    providerCalls += 1;
    let body;
    try {
      const result = await provider.decide(pixelJevFixtureRequest());
      body = resultFromProvider(result);
    } catch (error) {
      body = bridgeResult(providerErrorStatus(error));
    }
    console.log(JSON.stringify(body));
    closeAfterResponse(response);
    writeJson(response, body.status === 'ok' ? 200 : 502, body);
  });
  server.requestTimeout = PIXEL_JEV_TIMEOUT_MS + 2_000;
  server.headersTimeout = 2_000;
  server.keepAliveTimeout = 1_000;
  const lifetimeTimer = setTimeout(() => {
    if (server.listening) server.close();
  }, PIXEL_JEV_LIFETIME_MS);
  lifetimeTimer.unref?.();
  return {
    server,
    get providerCalls() {
      return providerCalls;
    },
    get consumed() {
      return consumed;
    },
    listen(port = PIXEL_JEV_BRIDGE_PORT) {
      return new Promise((resolveListen, rejectListen) => {
        const onError = (error) => {
          server.removeListener('listening', onListening);
          rejectListen(error);
        };
        const onListening = () => {
          server.removeListener('error', onError);
          resolveListen(server);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, PIXEL_JEV_BRIDGE_HOST);
      });
    },
    close() {
      return new Promise((resolveClose) => {
        if (lifetimeTimer) clearTimeout(lifetimeTimer);
        if (!server.listening) {
          resolveClose();
          return;
        }
        server.close(() => resolveClose());
      });
    },
  };
}

async function main() {
  if (!process.env.TYPESAFE_API_KEY) {
    console.error('TYPESAFE_API_KEY_UNSET');
    process.exitCode = 1;
    return;
  }
  const provider = new TypeSafeJevProvider({
    apiKey: process.env.TYPESAFE_API_KEY,
    model: PIXEL_JEV_MODEL,
    timeoutMs: PIXEL_JEV_TIMEOUT_MS,
    estimatedCostMicros: PIXEL_JEV_ESTIMATED_COST_MICROS,
  });
  const bridge = createPixelJevBridge({ provider });
  await bridge.listen();
  console.log(
    `Pixel Jev preview relay listening on http://${PIXEL_JEV_BRIDGE_HOST}:${PIXEL_JEV_BRIDGE_PORT}${PIXEL_JEV_BRIDGE_PATH}; one provider call maximum`,
  );
  const shutdown = () => {
    void bridge.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) void main();
