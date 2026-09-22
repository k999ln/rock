# RockstarOS Sky SDK

The Sky SDK lets another application embed the public Sky tool layer without
copying the complete RockstarOS codebase.

## Install from GitHub

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

## Permissions

- `read`: runs without a state-changing approval;
- `local-write`: requires the host application's approval callback;
- `external`: requires the host application's approval callback.

## Telemetry

There is no built-in destination and no hidden network request. The host must
provide an event sink and return `true` from `telemetryConsent`. Events never
contain tool inputs or outputs.

## License status

The package is installable from GitHub for evaluation. A reuse license has not
yet been granted.
