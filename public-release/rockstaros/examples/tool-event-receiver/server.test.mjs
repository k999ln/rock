import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import { createToolEventReceiver } from "./server.mjs";

const token = "receiver_test_token_123456789";

async function invoke(handler, { method = "GET", url = "/", headers = {}, body }) {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  Object.assign(request, { method, url, headers });
  const reply = { status: 0, headers: {}, body: "" };
  const response = {
    writeHead(status, responseHeaders) {
      reply.status = status;
      reply.headers = responseHeaders;
    },
    end(value = "") {
      reply.body = value;
    },
  };
  await handler(request, response);
  return { ...reply, json: JSON.parse(reply.body) };
}

test("receiver validates an event and retains aggregate metadata only", async () => {
  const receiver = createToolEventReceiver({ token });
  const response = await invoke(receiver.handler, {
    method: "POST",
    url: "/v1/tool-events",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      packageKey: "fitness.activity-summary@1.0.0",
      toolName: "fitness.activity-summary",
      installationId: "private_installation_123",
      outcome: "succeeded",
      durationMs: 12,
      occurredAt: "2026-09-22T12:00:00.000Z",
    }),
  });
  assert.equal(response.status, 202);
  assert.deepEqual(receiver.summary(), {
    accepted: 1,
    averageDurationMs: 12,
    byOutcome: { succeeded: 1 },
    byTool: { "fitness.activity-summary": 1 },
  });
  assert.equal(
    JSON.stringify(receiver.summary()).includes("private_installation"),
    false,
  );
});

test("receiver rejects missing authorization and extra event fields", async () => {
  const receiver = createToolEventReceiver({ token });
  assert.equal(
    (await invoke(receiver.handler, { method: "POST", url: "/v1/tool-events" }))
      .status,
    401,
  );
  const response = await invoke(receiver.handler, {
    method: "POST",
    url: "/v1/tool-events",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ prompt: "must not be accepted" }),
  });
  assert.equal(response.status, 400);
});
