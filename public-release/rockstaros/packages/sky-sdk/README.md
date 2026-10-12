# RockstarOS Sky SDK

The Sky SDK lets another application embed the public Sky tool layer without
copying the complete RockstarOS codebase.

## Install from npm

```bash
npm install @avokado-ink/rockstaros-sky-sdk
```

To install directly from the public source repository instead:

```bash
npm install github:avokado-ink/RockstarOS
```

## Register and run a tool

```js
import { createSky } from "@avokado-ink/rockstaros-sky-sdk";

const sky = createSky({
  installationId: "fitness_app_4f92a18b",
  requestApproval: async ({ tool, permission }) =>
    window.confirm(`Allow ${tool.name} to use ${permission}?`),
});

sky.register(
  {
    id: "fitness.activity-summary",
    version: "1.0.0",
    name: "Activity Summary",
    description: "Summarize activity values supplied by the fitness app.",
    permission: "read",
    capabilities: ["fitness.summary"],
  },
  ({ steps, activeMinutes }) => ({ steps, activeMinutes }),
);

const result = await sky.run("fitness.activity-summary", {
  steps: 7200,
  activeMinutes: 34,
});
```

The host application owns its UI, health-data permissions, validation, storage,
and user relationship. Sky supplies tool discovery, permission classification,
execution, outcome handling, and an optional anonymous event boundary.

## Native fitness providers

The SDK includes adapters for an application's existing iOS HealthKit or
Android Health Connect bridge. Sky never asks the platform for broader access
than steps, active minutes, and completed workouts.

```js
import {
  createFitnessBridge,
  createHealthKitAdapter,
} from "@avokado-ink/rockstaros-sky-sdk/fitness";

const fitness = createFitnessBridge({
  adapter: createHealthKitAdapter(yourNativeHealthKitBridge),
});

if (await fitness.requestAccess()) {
  const summary = await fitness.readActivitySummary({ start, end });
}
```

The native application remains responsible for its Apple or Android
entitlements, platform permission dialog, and on-device query implementation.
The adapter will not read before the platform grants access.

## Permissions

- `read`: runs without a state-changing approval;
- `local-write`: requires the host application's approval callback;
- `external`: requires the host application's approval callback.

## Telemetry

There is no built-in destination and no hidden network request. The host must
provide an event sink and return `true` from `telemetryConsent`. Events never
contain tool inputs or outputs. The public repository includes an
[aggregate-only receiver example](../../examples/tool-event-receiver).

## License

MIT. Applications may use, modify, and redistribute the public SDK subject to
the license terms in the repository.
