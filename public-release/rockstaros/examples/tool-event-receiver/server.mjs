import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { createAnonymousToolEvent } from "../../packages/sky-zema-core/src/index.js";

const MAX_BODY_BYTES = 8_192;

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function digest(value) {
  return createHash("sha256").update(value).digest();
}

function authorized(request, expectedAuthorizationDigest) {
  const supplied = request.headers.authorization ?? "";
  return timingSafeEqual(digest(supplied), expectedAuthorizationDigest);
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RangeError("request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createToolEventReceiver({ token }) {
  if (typeof token !== "string" || token.length < 24 || token.length > 512) {
    throw new TypeError("token must contain between 24 and 512 characters");
  }
  const expectedAuthorizationDigest = digest(`Bearer ${token}`);

  const totals = {
    accepted: 0,
    durationMs: 0,
    byOutcome: Object.create(null),
    byTool: Object.create(null),
  };

  function summary() {
    return Object.freeze({
      accepted: totals.accepted,
      averageDurationMs:
        totals.accepted === 0
          ? 0
          : Math.round(totals.durationMs / totals.accepted),
      byOutcome: Object.freeze({ ...totals.byOutcome }),
      byTool: Object.freeze({ ...totals.byTool }),
    });
  }

  async function handler(request, response) {
    if (request.method === "GET" && request.url === "/healthz") {
      return json(response, 200, { ok: true });
    }
    if (!authorized(request, expectedAuthorizationDigest)) {
      return json(response, 401, { error: "unauthorized" });
    }
    if (request.method === "GET" && request.url === "/v1/tool-events/summary") {
      return json(response, 200, summary());
    }
    if (request.method !== "POST" || request.url !== "/v1/tool-events") {
      return json(response, 404, { error: "not_found" });
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      return json(response, 415, { error: "json_required" });
    }

    try {
      const event = createAnonymousToolEvent(await readJson(request));
      totals.accepted += 1;
      totals.durationMs += event.durationMs;
      totals.byOutcome[event.outcome] =
        (totals.byOutcome[event.outcome] ?? 0) + 1;
      totals.byTool[event.toolName] = (totals.byTool[event.toolName] ?? 0) + 1;
      return json(response, 202, { accepted: true });
    } catch (error) {
      const status = error instanceof RangeError ? 413 : 400;
      return json(response, status, { error: "invalid_event" });
    }
  }

  return Object.freeze({ handler, summary });
}

export function startToolEventReceiver({
  token,
  host = "127.0.0.1",
  port = 8787,
} = {}) {
  const receiver = createToolEventReceiver({ token });
  const server = createServer(receiver.handler);
  server.listen(port, host, () => {
    console.log(`Tool event receiver listening on http://${host}:${port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startToolEventReceiver({ token: process.env.ROCKSTAROS_EVENT_TOKEN });
}
