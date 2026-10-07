# RockstarOS SIM/eSIM-led service: current implementation prompt (2026-10-02)

2026-10-06 add-on request: `/add` reuses Sky and the existing Zema LLM flow; `/add/data` collects only explicitly selected files and notes into a portable encrypted archive. Continue from the Web workstream acceptance record. Do not treat a Home shortcut as a local model installation, entitlement grant, native OS install, or Provider acceptance. Confirm the user's intended collection sources before extending to automatic service imports or whole-device backup.

Treat `docs/product-baseline.md`'s 2026-10-02 product direction and this prompt as authoritative over older OS-first or eSIM-store copy. The product is physical-SIM/eSIM-led access to RockstarOS services, not an eSIM store inside an OS. A purchased SIM/eSIM offer includes RockstarOS, Sky, Zema, and integrated-agent access; the OS binary is delivered separately through an accepted device route.

Historical audit anchors retained by `data/product-baseline.json` (not claims about this checkout's current HEAD): main `7cdbb5fedc86ee3978ed329d9312147d137c9199`, native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`, design `de5b102d3525daccf604efd5685bdf8c14ad5d50`. Confirm current refs independently before a merge or release.

## Required user journey

1. A physical SIM or eSIM is purchased through a carrier, Rockstar, device retailer, or online channel. Purchase distribution and carrier activation may be separate systems.
2. The user activates the carrier line through the carrier's supported flow. Display line activation independently from Rockstar service entitlement.
3. The user signs into one Rockstar account and claims a one-time, seller-issued service entitlement. Do not infer service access from a SIM profile or network registration.
4. Route using exact device/SKU evidence: accepted signed RockstarOS install only when image, OEM permissions, boot/recovery, and rollback are accepted; otherwise use an existing-OS app/client or browser. SIM/eUICC capability alone never proves OS compatibility.
5. Home opens Sky, Zema, and Agents directly using one identity. A submitted cloud job persists and runs while the client is offline; reconnect retrieves the same job's progress/result without automatic duplicate submission.
6. Before paid execution, show provider price/rate and estimate, obtain explicit user approval for a task budget cap, and reject work that would exceed it. During execution distinguish the reserved ceiling from provider-reported spend. Afterward show itemized provider usage and separately identify invoice/payment reconciliation status.

## Reuse and implementation order

Preserve channel-neutral signed entitlement claims, owner-scoped identity/device authorization, device capability/attestation, durable A2A/Cloudflare jobs and recovery, quote/rate-card verification, shared atomic budget reservations, signed cumulative meter snapshots, receipts, and result artifacts. Do not replace these with a new billing/job framework.

Current local coverage: channel-neutral signed entitlement claims, owner binding, claim-code redaction, seller handoff fragment/file parsing, refund/revocation events and `/connect` claim registration are implemented and locally tested; these do not represent a connected seller or real SIM sale. The Android Shell now also has a source-level native claim import through its owner-scoped device session (Shell API v18), with explicit account binding and no automatic retry. Local Worker/D1 API tests pass 960 assertions, including claim first redemption, same-owner retry, cross-owner/tamper rejection, and device-home redemption availability. Android Shell exposes service scopes and same-job task detail; API v17 added cancellation, and task detail now performs same-delegation Cloud/Wallet readback after app restart. The Broker compares exact owner/job/agent/quote/approval terms to its persistent Wallet reservation and does not replay work; confirmed pre-dispatch terminal jobs have a separate explicit release action.

Offer-specific initial agent packs now have a shared, optional `ROCKSTAR_SERVICE_OFFER_PROFILES` mapping from signed `issuerId + offerId` to a versioned set of exact Sky package keys and manifest hashes. Only currently verified packages are listed as ready, and installation/execution remains an owner choice. Keep Lifeline/Healthcare/Developer packages unset until real package review and product contracts exist; the local fixture package is not a healthcare product or evidence of automatic installation.

Next independent work: run the existing Android CI workflow to compile the AIDL/APKs and execute Shell/Broker instrumentation; test same-job process restart, exact local reservation recovery, owner/terms mismatch, pre-dispatch-only reservation release, and native purchase-claim submission. This checkout has no usable JDK/Gradle/Android SDK and no attached test device, so the workflow/device result is still absent. Continue auditing stale/missing meter and invoice-state presentation without opening the paid execution gate. The authenticated channel-neutral seller delivery API and encrypted idempotent store are now locally implemented; actual checkout/refund/webhook adapters remain contract- and sandbox-dependent. Keep carrier activation separate from Rockstar entitlement and retain the capability-based native OS/app/browser route. Do not claim local usage or test claims are production bills or purchases.

## Evidence labels

Record behavior in three separate categories: implemented in source; locally verified by named tests/fixtures; accepted in a provider/carrier/device/production environment. Local usage rows and synthetic receipts are not production bills. A source build is not an Android APK/device acceptance. A signed claim fixture is not a real purchase. Do not claim carrier activation, production billing, or OS installation without matching external readback and exact-SKU acceptance.

## Completion checks

Run focused tests first, then `npm run project:check`, `npm run baseline:check`, `git diff --check`, and `npm run verify` when feasible. Preserve all existing user changes and unrelated dirty files. Keep `SIM01` in progress until purchase distribution, carrier activation, production billing, and at least one supported client/OS route have their required acceptance evidence.
