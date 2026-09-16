# RockstarOS platform core v1

This layer is the OS-owned boundary for Tool, MCP and Provider components. It is intentionally separate from the website UI and from individual app implementations.

## Registration and compatibility

`IPlatformApi` is a versioned Binder contract. The broker reads the installed APK through `PackageManager`, derives its UID and signing-certificate SHA-256 digest, and rejects a declaration whose package version or signer does not match the installed bytes. A component can be activated only when Platform API ranges overlap and its stored-data schema is readable.

Runtime registration never grants an SELinux label. First-party package-to-domain mappings are a build-time allowlist. Android assigns a distinct application UID; the registry additionally rejects UID or package rebinding across component identities.

The selected production layout keeps `dev.rock.automation` as the headless broker and places Home, Sky and Zema in the separate `dev.rock.shell` launcher APK. The shell has no network permission, database, Keystore or execution-core dependency and cannot request the broader Platform-management permission. Its private Binder client verifies the exact broker package, signer and API version; the broker verifies the exact shell UID/package, signer and version for every call. Local AI, Tool, MCP, Provider and the on-device Operator Agent each have their own selected domain. The split source compiles and its Binder path passes on an Android 15 emulator, but the final Soong image and SELinux domain enforcement are not yet proved. The exact target graph and truthful completion fields are fixed in [Android production architecture](android-production-architecture.md).

## Native Sky to Zema to selected Tool

Shell API v3 adds Broker-owned native Sky selection without giving the UI, model or Tool direct access to Broker storage. `selectSkyTool` stores the v1 allowlisted Tool and a random selection token in Engine SQLite schema v2; `skySelection` restores it after UI or process recreation. Schema v1 migrates transactionally and an unknown newer schema fails closed. Zema must present that exact persisted token, and the Broker validates it before and after Local AI planning so an unselected or stale handoff creates no work.

The natural-language request then enters `ZemaOrchestrator`; Local AI Binder API v2 exposes a separate plan-only call for the exact `article-preparation@1/input-v1` schema. The runtime uses JSON Schema constrained decoding with Tool calls disabled. `ZemaToolPlan` independently requires one exact JSON object, rejects wrappers, unknown fields and Tool substitution, and proves both pure Tool transforms can accept the closed input before `Engine.submit` creates any work. Request IDs are idempotent. A model proposal, invalid plan, missing model, stale selection or denied consent returns a bounded structured `blocked` response and creates no partial work.

This first connection is deliberately limited to `article-preparation@1`; it is not yet the general Sky Tool registry. Android 15 emulator passed 9 Broker and 4 Shell checks, including schema migration, selection restoration, stale-token rejection and a no-model stop with zero partial work. The earlier stock Pixel plan path remains verified, but the new two-phase physical reboot acceptance is still pending device reconnection. See [plan v2 physical evidence](evidence/android-local-ai-plan-v2-20260916.json); the earlier rejected-plan record remains as fail-closed regression evidence in [the initial Zema record](evidence/android-zema-selected-tool-20260916.json).

## Approval and money

An app can create only a `PROPOSED` operation. The non-exported OS confirmation activity displays component, action, payload digest, cost ceiling and expiry, then requires the device credential. Only that trusted UI can move the proposal to `ISSUED`. Execution consumes that exact approval and writes its Wallet receipt in one SQLite transaction.

Approvals are owner-, component-, action-, payload-, cost-, expiry- and component-generation-bound. They are single use. Stop, update or revocation fences outstanding approvals. The ledger is append-only: corrections create a compensating reversal. Owner request keys, broker-attested provider references and reversal targets are unique to prevent duplicate entries. Provider-specific cryptographic receipt verification stays in the Provider adapter; the platform stores its digest and deduplicates it.

## Storage, backup and updates

Schema creation and migration run transactionally. Schema v2 migrates v1 approval rows into the two-stage approval model and stops legacy unconfirmed grants, while an unknown newer version fails closed without reset. Legacy backups are owner-scoped binary snapshots encrypted with AES-256-GCM under a non-exportable Android Keystore key. The new `avocadoos-recoverable-backup/2` core uses a fresh AES-256-GCM data key for every backup and wraps it through both the device Keystore and an independent 256-bit owner recovery secret derived from a checksum-protected 24-word phrase. Header, owner binding, salt, nonce and length fields are authenticated; wrong device key, phrase, owner or modified ciphertext are rejected. The current Binder service still creates legacy envelopes until the 24-word confirmation UI, transactional import and new-device Keystore rebinding are implemented. Application backup remains disabled. The complete boundary is [Android backup recovery](android-backup-recovery.md).

Updates require the same identity and signer, a newer version, API compatibility and readable stored schema. Rollback accepts only a cached older version that can read the current data schema. Activation increments a component generation so old grants cannot survive an update.

## Verification boundary

Host unit tests cover registry isolation, approval scope and lifecycle, cost caps, ledger idempotency and reversals, update/rollback checks, schema failure, legacy authenticated encryption, both v2 unwrap routes, Engine request lookup, native Sky persistence and strict Zema plan parsing. Android Gradle compiles Broker, Shell and Tool; emulator tests prove that a no-INTERNET Shell with only `USE_SHELL_API` can persist one selection, reject an unpersisted token, submit and read progress through the signed Broker while lacking `MANAGE_PLATFORM`. The current source and emulator run are not evidence of whole-flow physical reboot recovery, AOSP image build, Keystore-loss data import, SELinux enforcing boot, production signing, OTA rollback, or full physical-device acceptance; those remain release gates.
