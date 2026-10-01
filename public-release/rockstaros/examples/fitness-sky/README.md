# Fitness App + Sky

This example shows how a fitness application can embed Sky as a tool layer.
The fitness app keeps ownership of health permissions and data. It passes only
the values required for the selected local tool.

## Run

```bash
npm test
npm run demo
```

The example registers:

- `fitness.activity-summary`;
- `fitness.workout-checklist`.

Both tools run locally and do not transmit fitness data. They demonstrate app
integration, not medical advice, diagnosis, or treatment.

For an application using the GitHub-installed package:

```js
import { createSky } from "@avokado-ink/rockstaros-sky-sdk";

const sky = createSky({
  installationId: yourPersistedAnonymousId,
  telemetryConsent: () => userSettings.shareAnonymousToolEvents,
  eventSink: yourExplicitEventSink,
});

sky.register(manifest, handler);
const tools = sky.list({ capability: "fitness.summary" });
const result = await sky.run(tools[0].id, authorizedFitnessValues);
```

The event sink receives usage metadata only. Tool inputs and outputs remain
inside the fitness application.

## Connect real platform data

Use `createHealthKitAdapter` with an iOS native bridge or
`createHealthConnectAdapter` with an Android native bridge. The SDK requests
only steps, active minutes, and completed-workout access, and it refuses to
read until the platform authorization succeeds.

```js
import {
  createFitnessBridge,
  createHealthConnectAdapter,
} from "@avokado-ink/rockstaros-sky-sdk/fitness";

const fitness = createFitnessBridge({
  adapter: createHealthConnectAdapter(yourAndroidNativeBridge),
});

if (await fitness.requestAccess()) {
  const activity = await fitness.readActivitySummary({ start, end });
  const result = await sky.run("fitness.activity-summary", activity);
}
```

The host app must configure the required platform entitlements and implement
the native bridge. Health data remains on the device unless the host app
separately and visibly chooses otherwise.
