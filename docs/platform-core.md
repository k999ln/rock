# RockstarOS platform core v1

This layer is the OS-owned boundary for Tool, MCP and Provider components. It is intentionally separate from the website UI and from individual app implementations.

## Registration and compatibility

`IPlatformApi` is a versioned Binder contract. The broker reads the installed APK through `PackageManager`, derives its UID and signing-certificate SHA-256 digest, and rejects a declaration whose package version or signer does not match the installed bytes. A component can be activated only when Platform API ranges overlap and its stored-data schema is readable.

Runtime registration never grants an SELinux label. First-party package-to-domain mappings are a build-time allowlist. Android assigns a distinct application UID; the registry additionally rejects UID or package rebinding across component identities.

## Approval and money

An app can create only a `PROPOSED` operation. The non-exported OS confirmation activity displays component, action, payload digest, cost ceiling and expiry, then requires the device credential. Only that trusted UI can move the proposal to `ISSUED`. Execution consumes that exact approval and writes its Wallet receipt in one SQLite transaction.

Approvals are owner-, component-, action-, payload-, cost-, expiry- and component-generation-bound. They are single use. Stop, update or revocation fences outstanding approvals. The ledger is append-only: corrections create a compensating reversal. Owner request keys, broker-attested provider references and reversal targets are unique to prevent duplicate entries. Provider-specific cryptographic receipt verification stays in the Provider adapter; the platform stores its digest and deduplicates it.

The Android owner boundary is derived from the public Binder/process UID values using AOSP's per-user UID range. The broker and its non-exported confirmation activity therefore resolve the same Android user without depending on hidden `UserHandle` methods that are absent from the public SDK.

## Storage, backup and updates

Schema creation and migration run transactionally. Schema v2 migrates v1 approval rows into the two-stage approval model and stops legacy unconfirmed grants, while an unknown newer version fails closed without reset. Backups are owner-scoped binary snapshots encrypted with AES-256-GCM under a non-exportable Android Keystore key; only an ID and ciphertext digest cross the callback. Application backup remains disabled.

Updates require the same identity and signer, a newer version, API compatibility and readable stored schema. Rollback accepts only a cached older version that can read the current data schema. Activation increments a component generation so old grants cannot survive an update.

## Verification boundary

Host unit tests cover registry isolation, approval scope and lifecycle, cost caps, ledger idempotency and reversals, update/rollback checks, schema failure, and authenticated encryption. CI is configured to compile Android/AIDL and execute device tests. The current source is not evidence of a successful AOSP image build, SELinux enforcing boot, production signing, OTA rollback, or physical-device acceptance; those remain release gates.
