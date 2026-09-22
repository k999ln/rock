function nonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return value;
}

export function registerFitnessTools(sky) {
  sky.register(
    {
      id: "fitness.activity-summary",
      version: "1.0.0",
      name: "Activity Summary",
      description:
        "Summarize activity values already authorized by the fitness app.",
      permission: "read",
      capabilities: ["fitness.summary"],
    },
    ({ steps, activeMinutes, completedWorkouts }) => ({
      steps: nonNegativeInteger(steps, "steps"),
      activeMinutes: nonNegativeInteger(activeMinutes, "activeMinutes"),
      completedWorkouts: nonNegativeInteger(
        completedWorkouts,
        "completedWorkouts",
      ),
      generatedLocally: true,
    }),
  );

  sky.register(
    {
      id: "fitness.workout-checklist",
      version: "1.0.0",
      name: "Workout Checklist",
      description:
        "Turn workout labels supplied by the app into a local checklist.",
      permission: "read",
      capabilities: ["fitness.checklist"],
    },
    ({ workouts }) => {
      if (
        !Array.isArray(workouts) ||
        workouts.length > 50 ||
        workouts.some(
          (value) =>
            typeof value !== "string" ||
            value.trim() === "" ||
            value.length > 120,
        )
      ) {
        throw new TypeError("workouts must contain up to 50 short labels");
      }
      return workouts.map((workout) => ({
        label: workout.trim(),
        completed: false,
      }));
    },
  );
}
