import assert from "node:assert/strict";
import test from "node:test";

import {
  addZemaMessage,
  beginZemaRun,
  completeZemaRun,
  createAnonymousToolEvent,
  createSkyCatalog,
  createSkyZemaHandoff,
  createZemaSession,
  sendAnonymousToolEvent,
} from "../src/index.js";

const handoff = () =>
  createSkyZemaHandoff({
    id: "handoff-1",
    toolId: "public.text-tidy",
    request: "Tidy this public sample.",
    at: "2026-09-21T12:00:00.000Z",
  });

test("Sky validates and freezes a public tool catalog", () => {
  const catalog = createSkyCatalog([
    {
      id: "public.text-tidy",
      name: "Text Tidy",
      description: "Clean up a local text sample.",
      permission: "local",
    },
  ]);
  assert.equal(catalog[0].permission, "local");
  assert.equal(Object.isFrozen(catalog), true);
});

test("Sky hands a selected tool to Zema", () => {
  const value = handoff();
  assert.equal(value.source, "sky");
  assert.equal(value.executionProvider, "local");
});

test("Zema keeps the workflow explicit", () => {
  let session = createZemaSession(handoff());
  session = addZemaMessage(session, { side: "user", text: "Start." });
  session = beginZemaRun(session);
  session = completeZemaRun(session, {
    status: "succeeded",
    summary: "The local sample completed.",
  });
  assert.equal(session.status, "completed");
  assert.equal(session.outcome.status, "succeeded");
});

test("telemetry refuses extra fields such as prompts", () => {
  assert.throws(
    () =>
      createAnonymousToolEvent({
        packageKey: "ink.avokado.text-tidy@1.0.0",
        toolName: "public.text-tidy",
        installationId: "install_12345678",
        outcome: "succeeded",
        durationMs: 12,
        occurredAt: "2026-09-21T12:00:00.000Z",
        prompt: "private text",
      }),
    /unsupported fields/,
  );
});

test("telemetry stays off without explicit consent", async () => {
  let called = false;
  const result = await sendAnonymousToolEvent(
    {
      packageKey: "ink.avokado.text-tidy@1.0.0",
      toolName: "public.text-tidy",
      installationId: "install_12345678",
      outcome: "succeeded",
      durationMs: 12,
      occurredAt: "2026-09-21T12:00:00.000Z",
    },
    {
      consent: false,
      endpoint: "https://example.test/events",
      fetchImpl: async () => {
        called = true;
        return { ok: true };
      },
    },
  );
  assert.deepEqual(result, { sent: false, reason: "consent_required" });
  assert.equal(called, false);
});

test("telemetry sends only the allowlisted event after consent", async () => {
  let body;
  let headers;
  const result = await sendAnonymousToolEvent(
    {
      packageKey: "ink.avokado.text-tidy@1.0.0",
      toolName: "public.text-tidy",
      installationId: "install_12345678",
      outcome: "succeeded",
      durationMs: 12,
      occurredAt: "2026-09-21T12:00:00.000Z",
    },
    {
      consent: true,
      endpoint: "https://example.test/events",
      authorization: "Bearer receiver_test_token_123456789",
      fetchImpl: async (_url, options) => {
        body = JSON.parse(options.body);
        headers = options.headers;
        return { ok: true };
      },
    },
  );
  assert.equal(result.sent, true);
  assert.deepEqual(Object.keys(body).sort(), [
    "durationMs",
    "installationId",
    "occurredAt",
    "outcome",
    "packageKey",
    "toolName",
  ]);
  assert.equal(headers.authorization, "Bearer receiver_test_token_123456789");
});
