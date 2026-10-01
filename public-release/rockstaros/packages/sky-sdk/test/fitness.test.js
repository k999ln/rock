import assert from "node:assert/strict";
import test from "node:test";

import {
  createFitnessBridge,
  createHealthConnectAdapter,
  createHealthKitAdapter,
} from "../src/index.js";

const summary = {
  steps: 8_500,
  activeMinutes: 42,
  completedWorkouts: 2,
};

test("HealthKit requires authorization before reading activity", async () => {
  let requestedFields;
  const bridge = createFitnessBridge({
    adapter: createHealthKitAdapter({
      requestReadAuthorization: async (fields) => {
        requestedFields = fields;
        return true;
      },
      queryActivitySummary: async () => summary,
    }),
  });

  await assert.rejects(
    bridge.readActivitySummary({
      start: "2026-09-21T00:00:00Z",
      end: "2026-09-22T00:00:00Z",
    }),
    /not been authorized/,
  );
  assert.equal(await bridge.requestAccess(), true);
  assert.deepEqual(requestedFields, [
    "steps",
    "activeMinutes",
    "completedWorkouts",
  ]);
  assert.deepEqual(
    await bridge.readActivitySummary({
      start: "2026-09-21T00:00:00Z",
      end: "2026-09-22T00:00:00Z",
    }),
    { ...summary, generatedLocally: true },
  );
});

test("Health Connect receives an ISO date range", async () => {
  let receivedRange;
  const bridge = createFitnessBridge({
    adapter: createHealthConnectAdapter({
      requestReadPermissions: async () => true,
      aggregateActivitySummary: async (range) => {
        receivedRange = range;
        return summary;
      },
    }),
  });

  await bridge.requestAccess();
  await bridge.readActivitySummary({
    start: new Date("2026-09-21T00:00:00Z"),
    end: new Date("2026-09-22T00:00:00Z"),
  });
  assert.deepEqual(receivedRange, {
    start: "2026-09-21T00:00:00.000Z",
    end: "2026-09-22T00:00:00.000Z",
  });
});

test("a denied platform permission remains denied", async () => {
  const bridge = createFitnessBridge({
    adapter: createHealthKitAdapter({
      requestReadAuthorization: async () => false,
      queryActivitySummary: async () => summary,
    }),
  });
  assert.equal(await bridge.requestAccess(), false);
  assert.equal(bridge.isAuthorized(), false);
});
