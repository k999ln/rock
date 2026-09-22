import assert from "node:assert/strict";
import test from "node:test";

import { createSky } from "../src/index.js";

const manifest = {
  id: "fitness.activity-summary",
  version: "1.0.0",
  name: "Activity Summary",
  description: "Summarize activity values supplied by the fitness app.",
  permission: "read",
  capabilities: ["fitness.summary"],
};

test("an app can register, discover, and run a Sky tool", async () => {
  const sky = createSky({ installationId: "fitness_demo_001" });
  sky.register(manifest, ({ steps, activeMinutes }) => ({
    steps,
    activeMinutes,
  }));

  assert.equal(sky.list({ capability: "fitness.summary" }).length, 1);
  const value = await sky.run("fitness.activity-summary", {
    steps: 7_200,
    activeMinutes: 34,
  });
  assert.equal(value.ok, true);
  assert.deepEqual(value.data, { steps: 7_200, activeMinutes: 34 });
});

test("write and external tools require host-app approval", async () => {
  let approvals = 0;
  const sky = createSky({
    installationId: "fitness_demo_002",
    requestApproval: async () => {
      approvals += 1;
      return false;
    },
  });
  sky.register(
    { ...manifest, id: "fitness.plan-save", permission: "local-write" },
    () => ({ saved: true }),
  );

  const value = await sky.run("fitness.plan-save", {});
  assert.equal(approvals, 1);
  assert.equal(value.outcome, "rejected");
});

test("tool input and output never enter telemetry events", async () => {
  const events = [];
  const sky = createSky({
    installationId: "fitness_demo_003",
    telemetryConsent: () => true,
    eventSink: async (event) => events.push(event),
    now: () => new Date("2026-09-21T12:00:00.000Z"),
    clock: (() => {
      let value = 0;
      return () => (value += 5);
    })(),
  });
  sky.register(manifest, ({ privateNote }) => ({ privateResult: privateNote }));
  await sky.run("fitness.activity-summary", {
    privateNote: "never send this",
  });

  assert.equal(events.length, 1);
  assert.deepEqual(Object.keys(events[0]).sort(), [
    "durationMs",
    "installationId",
    "occurredAt",
    "outcome",
    "packageKey",
    "toolName",
  ]);
  assert.equal(JSON.stringify(events[0]).includes("never send this"), false);
});

test("telemetry stays local when consent is false", async () => {
  let sent = false;
  const sky = createSky({
    installationId: "fitness_demo_004",
    telemetryConsent: () => false,
    eventSink: async () => {
      sent = true;
    },
  });
  sky.register(manifest, () => ({ ok: true }));
  await sky.run("fitness.activity-summary", {});
  assert.equal(sent, false);
});
