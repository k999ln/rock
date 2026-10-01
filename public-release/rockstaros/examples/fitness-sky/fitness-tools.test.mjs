import assert from "node:assert/strict";
import test from "node:test";

import { createSky } from "../../packages/sky-sdk/src/index.js";
import { registerFitnessTools } from "./fitness-tools.mjs";

test("a fitness app can discover and run the public Sky tools", async () => {
  const sky = createSky({ installationId: "fitness_test_public_001" });
  registerFitnessTools(sky);

  assert.equal(sky.list({ capability: "fitness.summary" }).length, 1);
  const value = await sky.run("fitness.activity-summary", {
    steps: 8_000,
    activeMinutes: 45,
    completedWorkouts: 2,
  });
  assert.equal(value.ok, true);
  assert.deepEqual(value.data, {
    steps: 8_000,
    activeMinutes: 45,
    completedWorkouts: 2,
    generatedLocally: true,
  });
});

test("the example rejects invalid activity values", async () => {
  const sky = createSky({ installationId: "fitness_test_public_002" });
  registerFitnessTools(sky);

  const value = await sky.run("fitness.activity-summary", {
    steps: -1,
    activeMinutes: 45,
    completedWorkouts: 2,
  });
  assert.equal(value.outcome, "failed");
});
