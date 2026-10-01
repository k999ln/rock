# RockstarOS Control Core

This small public package demonstrates two parts of the RockstarOS control model:

- actions that can change state require an explicit approval;
- succeeded, failed, interrupted, and unknown outcomes stay distinct.

It is runnable reference code, not the complete operating system.

## Run

```bash
npm test
```

## Example

```js
import {
  approveAction,
  createActionRequest,
  recordOutcome,
} from "@avokado-ink/rockstaros-control-core";

const request = createActionRequest({
  id: "publish-1",
  toolId: "site.publish",
  action: "publish",
  destination: "external",
  risk: "external",
});

const approved = approveAction(request, {
  approved: true,
  actor: "user",
});

const completed = recordOutcome(approved, {
  status: "succeeded",
  receipt: "release-42",
});
```

## Boundary

This package does not contain hardware implementation, local LLM design,
credentials, production integrations, or the private RockstarOS source tree.
Reuse terms have not yet been granted.
