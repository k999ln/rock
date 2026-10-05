# Development Execution Prompt for Sky Market Payments and Wallet

You are responsible for implementing changes in k999ln/rock. Reuse the existing payment and Wallet systems, and implement and verify the changes defined in the design. The goal is a product in which users and operators can accurately track state and recover from failures throughout purchase, paid Tool access, refunds and revocation, sales, and reconciliation of bank payouts. Do not stop after presenting a plan. Complete the development and verification that can proceed, and clearly identify only the work that still depends on missing external conditions.

This document contains development instructions. Creating or saving this prompt does not mean that any of the features or production acceptance procedures described here have been completed.

## 1. Starting Point and Historical Evidence

Initially authored on 2026-10-01 (America/New_York). Target repository: https://github.com/k999ln/rock . At initial authoring, both GitHub `main` and the local working branch `main` were based on `b3e2676abd8ae2a0b3f78f48483e067b429d9bc8`; a fresh fetch of GitHub `main` confirmed that match. The design changes were local artifacts at that time. This historical statement does not describe their current publication or integration status.

The following results describe the evidence collected on 2026-10-01 against that baseline:

- The existing Commerce, Stripe, and Billing regression suites passed 51 tests. These included historical Billing fixtures; their inclusion is not a reason to adopt the old pricing policy.
- The design model passed 32 tests. Its finite coverage comprised 1,440 decision-table rows, 26 specified permutations, and 6 cache orderings.
- The draft DDL added 14 tables to temporary SQLite databases after applying the 19 existing migrations, and passed 103 checks.
- The new v2 runtime and production migrations were not implemented by that design work. The 14-table DDL was a draft for design validation.
- The design TypeScript passed type checking. This is not evidence that input validation, actual Provider integration, penetration testing, or production operations passed acceptance.
- Local `npm run verify` stopped at an existing visual-baseline mismatch. GitHub checks for that same historical `main` SHA also included failures in `verify` and `prototype`; overall CI was not passing.
- Stripe sandbox acceptance, the deployed gateway, paid-access enforcement by external MCP providers, live payments, and bank receipt of funds had not been accepted. Production acceptance of the operator console, administrator authentication, monitoring, restoration drills, and related operations had not been established either.

The evidence is recorded in `docs/evidence/sky-commerce-design-validation.json`, the model and SQL results in the same directory, and `sky-commerce-development-prompt-context.json`. GitHub metadata is evidence only for the time at which it was retrieved. At implementation start, fetch the current refs and CI results for the exact target SHA again, and inspect the relevant source changes. A newly fetched main ref is not automatically a reviewed or accepted baseline. Do not transfer successes from unrelated branches or previous OS acceptance runs to this payment release candidate.

Integration note, 2026-10-05: main has advanced since the historical baseline, and PR #44 has since merged. Use the publication/integration evidence to identify the actual base SHA; do not assume an intermediate fetched ref is the final integration baseline. Later main work also addressed the earlier visual-baseline failure, so that historical failure is not a claim about current CI. Before applying this design, inspect and preserve the SIM/eSIM service-entitlement eligibility that prevents duplicate Package purchases (`isIncludedInActiveServiceOffer` in `lib/sky-commerce.ts`, `lib/rockstar-entitlement-claim.ts`, and `lib/rockstar-service-offers.ts`), the separate JPY 50 CSV trial checkout, and the shared Stripe adapters. The later README records a limited live test of that CSV flow from payment through retrieval and verification of the generated artifact. Preserve that scoped evidence; do not transfer it to Sky Market Connect, the commerce v2 proposal, or Wallet acceptance. Read the updated `docs/workstreams/03-wallet-billing-providers.md` for these integration boundaries. This note identifies integration requirements; it does not certify the new main source, v2 implementation, or production acceptance. Outstanding acceptance requirements in this prompt concern the proposed v2 capabilities and their release candidate, not every payment capability elsewhere in the repository.

## 2. Define the First-Party Scope Accurately

The design combines a payment and Wallet application and operational tooling developed by Rock with Stripe, Cloudflare, an identity platform, and open-source software. It does not eliminate external dependencies or make the card networks and banking infrastructure entirely first-party.

Rock implements and manages orders, sales terms, fee calculation, reconciliation of financial facts, purchase entitlements, Wallet presentation, audit records, operational administration, and failure recovery. Stripe is responsible for the external payment facts and services, including card processing, Connect identity verification, external accounts, execution of refunds, and payouts. Using external services does not transfer Rock's responsibility for user isolation, prevention of duplicate processing, accurate presentation, or safe shutdown.

If the user separately and explicitly requires Rock to operate the external payment processing or custody layer itself, do not claim to meet that requirement by renaming the current design. Present a separate design covering the entity responsible for funds, contracts, card and bank connections, key and card-data management, and operating responsibilities. Until then, use the existing Stripe architecture as the implementation baseline. Do not implement custom cryptographic, signing, or authentication algorithms merely to claim that the system is first-party. Maintain a dependency inventory that distinguishes Rock code, open-source software, and external services, including licenses and responsibility for updates.

## 3. Required Reading and Separation of Work

Read `AGENTS.md`, the five product-baseline files, `docs/prompt-playbook.md`, and the workstream responsibility boundaries. Use `03-wallet-billing-providers.md` as the primary workstream, with Security, Sky MCP, Web, and Git Operations as supporting workstreams. Continue existing task BIL02. Do not expand this task into unrelated OS, device, game, or hardware development.

If the design from `rock-payment-wallet-design-package.zip`, supplied in the original conversation, is missing from the checkout, inspect its contents and manifest and compare it with the baseline SHA before integrating it. Run `git apply --check` before applying any supplied patch. Do not apply the design twice if it is already present. Do not discard the user's uncommitted work or use a forced reset.

Required design documents:

- `docs/sky-commerce-design.md`
- `docs/wallet-commerce-design.md`
- `docs/contracts/sky-commerce-v2.ts`
- `docs/contracts/sky-wallet-v2.ts`
- `docs/contracts/sky-commerce-v2.sql`
- `docs/design-validation/README.md`
- `docs/workstreams/04-security-identity-compliance.md`

Reuse `lib/sky-commerce.ts`, `lib/sky-commerce-store.ts`, `lib/sky-stripe.ts`, `lib/sky-tool-package.ts`, `lib/request-auth.ts`, the existing Wallet, financial-provider and SDK contracts, `components/sky-commerce.tsx`, Web D1, and `db/schema.ts`. Read the actual current types and call sites before editing them.

In the GitHub metadata retrieved on 2026-10-01, related PRs #37 and #38 had been merged and placed the old pricing proposal on hold. PR #44's operation-key and outbox work was an unmerged fixture on a separate branch at that time, and there was no development PR containing this design yet. Treat these as historical observations. Recheck the current branches and PRs before choosing a starting point. Do not assume that a separate branch's functionality exists on main or integrate a dependency PR without authorization. Select real refs; do not invent or reuse a stale branch name without checking that it exists.

## 4. Product Conditions and Compatibility Boundaries to Preserve

- The user's explicit instruction excludes the old USD 8.88 monthly proposal. Do not revive it from older AGENTS instructions or historical monthly-fee references.
- Keep the initial release restricted to the existing card-payment flow (`payment_method_types=card`). Do not enable automatic payment methods or other payment methods without authorization.
- Preserve JPY one-time purchases of reviewed Packages, quantity 1, a license for the specific Package version, the existing 10% Sky fee, and free basic use. Do not promise unlimited cloud compute or free future versions.
- Keep `SkyToolPackage/1` and `id@version` immutable. Add purchase-entitlement integration through a versioned sidecar. Do not accept the amount, user identity, or funds destination from browser input.
- Preserve the four existing payment tables and their history. Treat the design DDL as a draft, align it with production migrations and the Drizzle schema, and introduce it in stages.
- Do not combine manually entered bookkeeping, historical USD settlement, or synthetic native balances with JPY payment accounting.
- The initial Wallet reads external-account balances and payout status. Leave top-ups, custody of user funds, payment from a stored balance, arbitrary transfers, cryptocurrency purchases, and manual payouts unsupported.
- Understand the existing v1 read responses: reconcile returns `{purchase}`, while refund returns the Purchase object directly. After switching to the v2 writer, reject new v1 checkout and refund requests with `CLIENT_UPDATE_REQUIRED`. Do not manufacture a consent quote for terms the user was never shown.

## 5. Implementation Sequence

### Stage 1: Shared Types and Existing Defects

Create shared DTOs and runtime parsers, separating database rows, external JSON, and public DTOs. Fix conversion of `active` from 0/1 to boolean, allow sellers to stop sales even when the Provider is unavailable, update successful-refund amounts while a refund is pending, and separate notification IDs from reconciliation-observation IDs. Add tests against the actual service and storage layers that reproduce each cause, and preserve the existing regression tests.

### Stage 2: Durable Processing and Migration

Implement quotes, order state, operation journals, individual Refund records, a signed-event inbox, observations, entitlement aggregates, an outbox, an account-creation journal, account state, nonces, and audit records. Use CAS, lease fencing, and revisions. A zero-row UPDATE in a D1 batch must not emit an audit record or outbox effect on its own. Make network calls outside database transactions.

For a retried quote, first look for an already accepted order using the authenticated user, mode, and request digest. Do not charge again because the quote has since expired. Do not convert an unknown outcome into a failure. Recover with the same key and body within the retry window, or perform read-only reconciliation. Never automatically recreate the request with a new key after the deadline.

Do not fabricate consent quotes when importing legacy orders. Explicitly represent historical terms that are unknown. Compare the counts, amounts, and unreconciled differences in the shadow projection before switching to a single writer. The normal rollback strategy is to stop writes and return to a compatible reader; do not pretend that reverting the database also reverses external transactions.

### Stage 3: Refunds, Disputes, and Purchase Entitlements

Separate payments, individual Refunds, refund cases, disputes, and purchase entitlements. Handle partial refunds, failures and cancellations, late failures caused by bank returns, and refunds created in the Provider dashboard. Do not use the same remaining-amount guard for accepting a new internal refund request and for recording external facts. If an unknown JPY 10,000 reservation overlaps an external successful refund of JPY 5,000, retain both facts, require reconciliation, and block new refunds and repurchases.

A resolved refund case alone must not restore access. Require an explicit restore decision, the appropriate scope, expected revisions, and evidence. An old observation for refunded order O1 must not revoke the entitlement from repurchased order O2. Never reset the entitlement revision on repurchase.

Separate Provider OAuth identity linking from purchase ownership. A buyer who has not linked their Provider identity is still a purchaser awaiting connection. Enforce paid-access authorization at execution time, including for read-only operations. Financial operations and external writes require a fresh entitlement lookup and separate approval by the authenticated user. Validate Provider, mode, subject, Package and hash, request binding, the revision vector, an independent recovery epoch, and a read-only allow lifetime of no more than 60 seconds.

### Stage 4: Wallet, Purchase, and Seller Interfaces

Connect summary, accounts, activity, detail, and reconciliations to the existing authentication boundary. Separate buyer and seller DTOs and authorization. Never return a seller's complete payout breakdown, other buyers' information, or platform balances to a buyer. Enforce the same user-isolation boundary for nested references, cursors, and exports.

Represent unavailable values as null, preserve negative balances, and display the observation time and scope. Distinguish sales, fees, Transfers, account balances, Payouts, and reconciliation against bank statements. Do not label a Provider payout marked paid as an independently verified bank deposit.

Implement aggregates covering the entire selected period and stable pagination backed by versioned rows and a commit watermark. Do not treat the first 100 records as the total. Recheck current viewing permissions on every page, even when serving an older snapshot. Use an actual browser to verify 320px and 390px layouts, keyboard operation, screen-reader accessibility, empty/error/unknown states, multiple devices, and reload behavior.

### Stage 5: Operational Capabilities

Implement the following as APIs, interfaces, persistence, authorization, and failure-path tests; prose alone is insufficient. Where an implementation already exists, verify its evidence and reuse it.

| Area | Required capabilities and acceptance evidence |
|---|---|
| Administrator authentication and authorization | Separate scopes for viewing records, handling refunds, resolving entitlement cases, and changing operational settings. Require strong administrator authentication and reauthentication for critical actions, session revocation, and an audit trail for permission changes. Test rejection of ordinary users, administrators with the wrong scope, and revoked administrators. |
| Support and transaction investigation | Provide safe searches for orders, refunds, and receipts of funds, plus case owners, states, deadlines, reasons, and evidence. Expose only the necessary personal data. Do not make arbitrary impersonation or direct database modification a normal operational workflow. |
| Reconciliation and exceptions | Provide daily and repeatable reconciliation, differences, unmatched references, unknown outcomes, retry deadlines, and assigned operator cases. Support corrections that preserve original facts and exports of the history. |
| Alerts and monitoring | Detect aging inbox/outbox items, unresolved operations, refund and balance discrepancies, payout failures, authentication anomalies, and Provider outages. Run drills demonstrating that notifications are delivered and an assigned operator can track the response. |
| Emergency stop and resumption | Continue persisting signed notifications and serving transaction history while new financial writes are stopped. Test which functions stop and which remain available. After recovery, reconcile unresolved work before resuming normal operation. |
| Backup and restoration | Restore into a separate database representative of the deployed environment. Reconcile external transactions after restoration, advance the epoch outside the restored database, retain previously used keys, and reject old allow decisions. Distinguish RPO/RTO targets from measured results. |
| Secrets and audit records | Implement server-side secret storage, scoped access, rotation, revocation, and log redaction. Define audit access controls, retention, and tamper detection or separate storage. Test the limits of application permissions and database-administrator privileges. |
| Sales terms and personal data | Provide final confirmation and consent snapshots, receipts and history, support contacts, seller status, retention, export, deletion, and required record preservation. Operators must establish the applicable terms; do not enable sales for a product whose required settings are incomplete. |

The earlier design tests did not complete production acceptance of administrator MFA, detailed RBAC, an operator case interface, notification destinations, audit storage, or restoration procedures. Before implementation, confirm what the existing identity provider and hosting platform actually support, and supply concrete designs for any gaps.

## 6. Security and Operational Acceptance Criteria

Create a threat model and a traceable mapping from requirement to enforcement point, rejection test, and evidence for the same release candidate. Cover at least the following:

1. Reject reads or writes to another user's orders, accounts, refunds, or nested details; mixing of test and live data; privilege escalation; CSRF; and unauthorized reuse of administrator sessions.
2. Verify in the deployed environment that the gateway's identity headers cannot be forged and that direct-origin, preview, custom-domain, or other paths cannot bypass the gateway. The webhook endpoint must remain reachable while preserving verification of the raw-body signature.
3. Ensure that invalid signatures, replay, different content under the same event ID, duplicate delivery, reversed ordering, stale GET responses, crashes, and unknown outcomes cannot cause duplicate effects or incorrect entitlement grants.
4. Test input and output validation, SQL injection, XSS in displays and sales terms, unsafe URLs and redirects, SSRF, request-body limits, rate limits, and resource exhaustion through excessive pagination or reconciliation requests.
5. Ensure that tokens, API keys, card data, and KYC information cannot appear in client bundles, public metadata, logs, Git, or exports. Review dependencies, secrets, static-analysis findings, and permissions, and report unresolved critical issues.
6. Exercise administration, entitlement restoration, emergency stop, key rotation, restoration, incident communication, and refund/dispute handling with users assigned different permissions, and verify the audit trail.
7. Actually check purchase entitlements before the external MCP handler runs. Reject reuse of a decision for another Provider or request, use after revocation, and stale caches restored from backup.

Passing tests of your own model alone is not a security PASS. Test the implemented HTTP, database, worker, and Provider-adapter paths with adversarial input and injected failures, and obtain a review independent of the implementation work. Do not describe a successful review as third-party certification, regulatory compliance, or a guarantee of absolute safety.

## 7. External Acceptance and Release Decisions

First implement and verify the Rock-owned code locally. Then exercise the full flow through Stripe test mode, the deployed gateway, and the actual Provider adapter: registration, confirmation of terms, purchase, use, refund, revocation, and Wallet reconciliation. If sandbox credentials are unavailable, record `NOT_RUN` or `BLOCKED` rather than substituting a passing mock test. Continue implementation that does not depend on those credentials.

Enable live operation only for the scope in which the target sellers, products and regions, sales terms, accountable operator, support, external contracts, permissions, secrets, monitoring, recovery, and acceptance of the same release candidate are all in place. Respect existing explicit authorization, but do not reinterpret an unexecuted instruction in this prompt as approval for an actual financial transaction. If an additional decision by the user is required, finish the preparatory work first and present only the concrete missing conditions.

Record these stages separately:

- `ROCK_IMPLEMENTED`: The specified Rock-owned functionality and implementation tests have passed.
- `SANDBOX_ACCEPTED`: The same candidate has completed an end-to-end flow with actual Stripe test mode, the gateway, and external authorization.
- `OPERATIONS_ACCEPTED`: Administrator permissions, monitoring and notifications, reconciliation, stop/recovery procedures, and restoration drills have been exercised.
- `LIMITED_LIVE_ACCEPTED`: Actual transactions within the explicitly authorized limited scope have been reconciled.
- `BANK_RECONCILED`: Each relevant payout has been reconciled against bank-side records.

These are evidence categories for this work, not replacements for existing task completion states or a certification scheme. Do not mark a stage PASS if a required item is FAIL, NOT_RUN, or BLOCKED. If an item is out of scope, record the reason and boundary. Never make an unqualified claim that all necessary operational capabilities are complete.

## 8. Verification, Evidence, and Handoff

Run the relevant tests before and after changes, and maintain the design model. For the new production schema, verify migrations, Drizzle alignment, existing data, and rollback or read-only recovery. The following commands are representative; add checks appropriate to the current package.json and the actual changes.

```sh
npm run typecheck
node --experimental-strip-types --test tests/sky-commerce.test.mjs tests/sky-stripe.test.mjs tests/billing.test.mjs tests/billing-worker.test.mjs
node --test docs/design-validation/commerce-state-model.test.mjs
python3 docs/design-validation/validate-sky-commerce-v2.py
npm run schema:check
npm run design:check
npm run project:check
npm run verify
```

Do not hide existing baseline failures by deleting tests, changing expectations without evidence, or skipping checks. Distinguish regressions introduced by the changes from pre-existing mismatches. Either align the implementation and checks with the correct baseline or leave the issue explicitly unresolved. Merely preserving the historical counts of 51, 32, and 103 is not an acceptance criterion for new functionality.

For each piece of evidence, record the requirement ID, source SHA or change hash, environment, mode, redacted Provider/account scope, time, command or procedure, expected result, actual result, PASS/FAIL/NOT_RUN/BLOCKED status, failure reason, and conditions for resumption. Store minimal reproducible summaries in `docs/evidence/`. Do not commit secrets or transaction-related personal data.

Update `project.md`, `data/project-status.json`, and the relevant workstream, then run `npm run project:update`. Keep the corresponding documentation synchronized when the design or usage changes. Preserve the applicable requirements for Wallet, identity, multiple devices, and product eligibility. Do not count this payment work as completion of RQ01-RQ15 or later OS, game, or device requirements. At the end, confirm that the old monthly fee has not been revived and that game-currency exchange, ATM functions, or cryptocurrency capabilities have not been newly enabled.

In the final report, state the implemented capabilities; the results of implementation tests and external acceptance; unresolved security and operational issues; external dependencies; the actual state of Git commits, PRs, integration into main, and deployment; and the precise next steps. Do not leave independently achievable Rock-owned code or verification unfinished merely because credentials or other external conditions are still pending.
