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
