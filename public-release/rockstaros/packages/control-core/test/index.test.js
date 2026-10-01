import assert from "node:assert/strict";
import test from "node:test";

import {
  approveAction,
  canExecute,
  createActionRequest,
  recordOutcome,
} from "../src/index.js";

test("read-only actions are ready without an approval", () => {
  const request = createActionRequest({
    id: "read-1",
    toolId: "sky.catalog",
    action: "list",
    destination: "local",
    risk: "read",
  });

  assert.equal(request.status, "ready");
  assert.equal(canExecute(request), true);
});

test("external actions require an explicit approval", () => {
  const request = createActionRequest({
    id: "send-1",
    toolId: "messages.send",
    action: "send",
    destination: "external",
    risk: "external",
  });

  assert.equal(canExecute(request), false);

  const approved = approveAction(request, {
    approved: true,
    actor: "user",
    at: "2026-09-21T12:00:00.000Z",
  });

  assert.equal(canExecute(approved), true);
  assert.equal(approved.approval.actor, "user");
});

test("outcomes preserve unknown and interrupted as distinct states", () => {
  const request = createActionRequest({
    id: "read-2",
    toolId: "local.status",
    action: "inspect",
    destination: "local",
  });

  const completed = recordOutcome(request, {
    status: "unknown",
    receipt: "receipt-42",
    at: "2026-09-21T12:01:00.000Z",
  });

  assert.equal(completed.status, "complete");
  assert.equal(completed.outcome.status, "unknown");
  assert.equal(completed.outcome.receipt, "receipt-42");
});

test("rejected actions cannot execute or record an outcome", () => {
  const request = createActionRequest({
    id: "write-1",
    toolId: "wallet.note",
    action: "create",
    destination: "local",
    risk: "write",
  });
  const rejected = approveAction(request, {
    approved: false,
    actor: "user",
  });

  assert.equal(canExecute(rejected), false);
  assert.throws(
    () => recordOutcome(rejected, { status: "failed" }),
    /not ready/,
  );
});
