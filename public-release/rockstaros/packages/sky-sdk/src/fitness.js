const ACTIVITY_FIELDS = Object.freeze([
  "steps",
  "activeMinutes",
  "completedWorkouts",
]);

function callable(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}

function date(value, name) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new TypeError(`${name} must be a valid date`);
  }
  return parsed.toISOString();
}

function count(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return value;
}

function normalizeSummary(value) {
  return Object.freeze({
    steps: count(value?.steps, "steps"),
    activeMinutes: count(value?.activeMinutes, "activeMinutes"),
    completedWorkouts: count(
      value?.completedWorkouts,
      "completedWorkouts",
    ),
    generatedLocally: true,
  });
}

function createNativeAdapter({ id, requestAuthorization, readActivitySummary }) {
  if (typeof id !== "string" || id.length < 3 || id.length > 80) {
    throw new TypeError("adapter id must be between 3 and 80 characters");
  }
  return Object.freeze({
    id,
    requestAuthorization: callable(
      requestAuthorization,
      "requestAuthorization",
    ),
    readActivitySummary: callable(
      readActivitySummary,
      "readActivitySummary",
    ),
  });
}

export function createHealthKitAdapter(nativeBridge) {
  return createNativeAdapter({
    id: "apple-healthkit",
    requestAuthorization: () =>
      callable(
        nativeBridge?.requestReadAuthorization,
        "nativeBridge.requestReadAuthorization",
      )([...ACTIVITY_FIELDS]),
    readActivitySummary: (range) =>
      callable(
        nativeBridge?.queryActivitySummary,
        "nativeBridge.queryActivitySummary",
      )(range),
  });
}

export function createHealthConnectAdapter(nativeBridge) {
  return createNativeAdapter({
    id: "android-health-connect",
    requestAuthorization: () =>
      callable(
        nativeBridge?.requestReadPermissions,
        "nativeBridge.requestReadPermissions",
      )([...ACTIVITY_FIELDS]),
    readActivitySummary: (range) =>
      callable(
        nativeBridge?.aggregateActivitySummary,
        "nativeBridge.aggregateActivitySummary",
      )(range),
  });
}

export function createFitnessBridge({ adapter } = {}) {
  if (
    !adapter ||
    typeof adapter.requestAuthorization !== "function" ||
    typeof adapter.readActivitySummary !== "function"
  ) {
    throw new TypeError("a valid fitness adapter is required");
  }

  let authorized = false;

  async function requestAccess() {
    authorized = (await adapter.requestAuthorization()) === true;
    return authorized;
  }

  async function readActivitySummary({ start, end }) {
    if (!authorized) {
      throw new Error("fitness access has not been authorized");
    }
    const range = Object.freeze({
      start: date(start, "start"),
      end: date(end, "end"),
    });
    if (new Date(range.start) >= new Date(range.end)) {
      throw new TypeError("start must be before end");
    }
    return normalizeSummary(await adapter.readActivitySummary(range));
  }

  return Object.freeze({
    provider: adapter.id,
    requestAccess,
    readActivitySummary,
    isAuthorized: () => authorized,
  });
}

export const fitnessSdkContract = Object.freeze({
  activityFields: ACTIVITY_FIELDS,
  providers: Object.freeze(["apple-healthkit", "android-health-connect"]),
});
