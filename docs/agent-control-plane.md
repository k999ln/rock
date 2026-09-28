# Agent Control Plane v1

Updated: 2026-09-27

## Purpose

This slice turns the existing Decision Fabric into a runnable engineering-control boundary without claiming that the full Decision Fabric is complete.

The runtime flow is:

```text
Owner / Zema / Grok Bot
        |
        v
Agent Control Plane
        |
        +--> deterministic execution gate
        |
        +--> Jev workflow decision (optional, public state + explicit consent only)
        |
        +--> Cursor Cloud Agent
                |
                +--> architecture reviewer
                +--> implementation work
                +--> independent verifier
                +--> security reviewer when required
                |
                v
             Pull request
                |
                v
          repository CI + owner review
```

## What is implemented

- `lib/agent-control-plane.ts`
  - typed task input validation
  - deterministic effect/risk gate
  - optional TypeSafe Jev workflow routing
  - risk-based clamping so Jev cannot lower the review floor or concurrency cap
  - Cursor Cloud Agents API v1 adapter
  - pull-request-only prompt contract
  - optional pstack guidance
- `app/api/agent-control-plane/route.ts`
  - authenticated, origin-checked, rate-limited entry point
  - repository allowlist
  - fail-closed feature flag
  - optional Jev and Cursor credentials
- `tests/agent-control-plane.test.mjs`
  - approval, dangerous-effect, privacy, Jev-clamping, Cursor payload, and hard-boundary tests

## Authority boundary

Jev is advisory. It chooses engineering workflow shape only. It cannot grant capability, merge code, deploy, move money, rotate credentials, export secrets, or authorize destructive actions.

The deterministic control plane runs before launch. A Cursor coding run is permitted only for:

- plan-only work with no external write effect; or
- repository-writing work with explicit `repository-pr-only` owner approval.

The following effects never auto-launch from this endpoint:

- production deployment
- real financial transaction
- credential change
- destructive operation
- critical-risk task
- secret-class task state

Cursor is configured to create a pull request, not merge it.

## Jev use

Jev is called only when all of the following are true:

1. the task is marked `public`;
2. `decisionConsent.approved` is true with a valid timestamp;
3. `SKY_REMOTE_LLM_ENABLED=true`;
4. `AI_GATEWAY_API_KEY` is configured.

Only a minimized state is sent: title, risk/effect class, acceptance-criteria count, allowed-path count, and whether pstack is requested. The full goal text and secrets are not sent to Jev by this control-plane adapter.

If Jev is unavailable, the control plane falls back to deterministic workflow routing. It does not fall back from local/private data to Jev.

## Cursor Cloud Agent use

The adapter calls the documented Cursor Cloud Agents API v1 `POST /v1/agents`.

Runtime configuration:

```text
AGENT_CONTROL_PLANE_ENABLED=true
AGENT_REPOSITORY_ALLOWLIST=https://github.com/k999ln/rock
CURSOR_API_KEY=<secret>
```

The Cursor API key stays in the server environment. It is never added to the task prompt, repository, Jev state, or client response.

The initial implementation deliberately does not use Cursor environment-variable injection or arbitrary MCP credentials. Those can be added later behind separate scoped secrets and acceptance tests.

## pstack

When `usePstack=true`, the task prompt asks Cursor to use `/poteto-mode` and `/interrogate` only if pstack is already installed in that Cursor environment.

The unattended agent is not told to install arbitrary plugins. If pstack is unavailable, it follows the equivalent repository-native sequence:

```text
inspect -> acceptance -> smallest implementation -> tests -> independent review
```

This keeps the repository runnable even when the Cursor account or worker image has not been configured with pstack yet.

## Cursor Projects

Cursor Projects remains the long-lived human-facing coordinator. The v1 API exposed by Cursor is the Cloud Agents API, so this repository integration targets Cloud Agents directly rather than inventing an undocumented Projects API.

A Project can still use this repository as its workspace and delegate to Cloud Agents. The same `AGENTS.md`, tests, PR-only boundaries, and control-plane task shape remain applicable.

## Grok Bot

Grok Bot is treated as an upstream chief-of-staff/research surface, not an authority boundary.

No undocumented Grok Bot API is invented here. Until an authenticated supported integration is available, Grok can hand work into the control plane through an owner-approved request, GitHub issue, or another explicit supported connector. Grok never receives production secrets or merge/deploy authority from this design.

## Example request

Planning only:

```json
{
  "dryRun": true,
  "task": {
    "requestId": "demo-1",
    "title": "Add status page tests",
    "goal": "Add regression coverage for the existing status page.",
    "repositoryUrl": "https://github.com/k999ln/rock",
    "startingRef": "main",
    "risk": "low",
    "dataClass": "public",
    "effect": "repository-write",
    "acceptanceCriteria": [
      "Existing behavior is unchanged",
      "Regression test demonstrates the protected behavior"
    ],
    "usePstack": true
  }
}
```

Launching a repository-writing agent additionally requires:

```json
{
  "executionApproval": {
    "approved": true,
    "approvedAt": "2026-09-27T20:00:00-04:00",
    "scope": "repository-pr-only"
  }
}
```

To allow Jev to choose the workflow, add:

```json
{
  "decisionConsent": {
    "approved": true,
    "approvedAt": "2026-09-27T20:00:00-04:00"
  }
}
```

## Deliberately not claimed complete

This commit does not prove:

- that a real Cursor API key is configured;
- that a live Cursor agent has been launched;
- that pstack is installed in the Cursor account;
- that Grok Bot is programmatically connected;
- that Origin replaces GitHub;
- that any pull request was merged;
- that production deployment, live finance, credentials, or destructive operations are automated.

Those are separate provider/owner acceptance steps.
