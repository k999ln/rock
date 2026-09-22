# Anonymous Tool Event Receiver

This reference server accepts the six-field public tool event after explicit
user consent. It validates every event and immediately reduces it to aggregate
counts. Installation identifiers, timestamps, and individual events are not
stored.

## Local run

```bash
export ROCKSTAROS_EVENT_TOKEN="replace-with-at-least-24-random-characters"
npm start
```

The ingest URL is `http://127.0.0.1:8787/v1/tool-events`. A production endpoint
must use HTTPS and keep the token on a trusted backend. Do not embed a reusable
server token in a public browser or mobile application.

```js
import {
  createHttpToolEventSink,
  createSky,
} from "@avokado-ink/rockstaros-sky-sdk";

const sky = createSky({
  installationId: "persisted_random_identifier",
  telemetryConsent: () => userSettings.shareAnonymousToolEvents,
  eventSink: createHttpToolEventSink({
    endpoint: process.env.ROCKSTAROS_EVENT_ENDPOINT,
    token: process.env.ROCKSTAROS_EVENT_TOKEN,
  }),
});
```

Run `npm test` to verify authorization, strict event validation, and aggregate-
only retention.
