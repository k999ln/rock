# RockstarOS Sky + Zema Core

This public package contains a small, runnable part of the Sky and Zema flow:

1. Sky validates a local catalog of tools.
2. Sky creates an explicit handoff for the selected tool.
3. Zema keeps the request, messages, run state, and outcome distinct.
4. Anonymous tool events can be sent only after explicit consent.

It is a public preview, not the complete RockstarOS source tree.

## Run the tests

```bash
npm test
```

## Anonymous tool events

Telemetry is off by default. The public event contract permits only:

- package and tool identifiers;
- a random installation identifier;
- outcome;
- duration;
- timestamp.

Prompts, chat messages, results, files, credentials, and personal information
are rejected by the public event builder. The destination must be configured
separately and must use HTTPS, except for local development.

## Private boundary

The full Sky marketplace, Zema UI, production integrations, hardware
implementation, local LLM design, account data, and private APIs remain in the
restricted `k999ln/rock` repository.
