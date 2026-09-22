import { createSky } from "../../packages/sky-sdk/src/index.js";
import { registerFitnessTools } from "./fitness-tools.mjs";

const sky = createSky({
  installationId: "fitness_demo_public_001",
  telemetryConsent: () => false,
});

registerFitnessTools(sky);

console.log("Fitness capabilities:", sky.list());
console.log(
  "Activity summary:",
  await sky.run("fitness.activity-summary", {
    steps: 7_200,
    activeMinutes: 34,
    completedWorkouts: 1,
  }),
);
console.log(
  "Workout checklist:",
  await sky.run("fitness.workout-checklist", {
    workouts: ["Warm up", "Strength session", "Cool down"],
  }),
);
