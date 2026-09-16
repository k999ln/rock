# avocadoOS Android 1.0 production architecture

This is the authoritative overview for how the Android OS pieces are combined. It records the selected end state and separately records what exists today. A selected design is never treated as implementation or physical-device proof.

## Selected combination

The stable product namespace remains `dev.rock`; marketing releases such as 1.0, 1.5 and 2.0 do not change package identity. The first native-OS target is the owned Google Pixel 10, codename `frankel`, exact SKU `GL066`. Other devices reuse the OS core but require their own Device Support Package and complete acceptance run.

The user-facing Home, Sky and Zema shell becomes `dev.rock.shell`. The existing `dev.rock.automation` identity remains the headless privileged Platform Broker so current Tool and Local AI trust contracts do not need a risky identity migration. The broker alone owns approvals, scheduling, the component registry, Wallet ledger and device-side backup binding.

Local AI (`com.localactionassistant`), each Tool, each MCP connector, each Provider adapter and the emergency Operator Agent use distinct Android UIDs and SELinux domains. Runtime registration cannot grant a domain. New packages enter a domain only through an exact build-time allowlist. UI and Local AI have no direct network path; external traffic goes through an explicitly approved MCP or Provider. All cross-component file access is denied and approved calls pass through the broker.

The Operator Dock stays outside the user OS in its separate Worker and database. A future pre-enrolled `dev.rock.operator.agent` accepts only signed, expiring, allowlisted incident commands. It does not expose arbitrary/root shell, private user content, Wallet authority, recovery phrases or release-signing keys, and it is not shown in the user launcher.

## Seven release decisions

1. Device: Pixel 10 / `frankel` / `GL066`; read-only identity evidence is fixed.
2. BSP/vendor/partitions: signed GrapheneOS source baseline, `adevtool` vendor generation, and the observed Dynamic Partitions, Virtual A/B and AVB layout; final vendor inventory is still pending.
3. Boot/recovery: production Verified Boot with a matching Google factory image and full OTA pair; exact downloaded bytes and recovery drill are pending.
4. OTA/rollback: signed Virtual A/B full OTA; avocado-managed rollback values use a fixed release epoch and are committed only after a successful slot. No recovery downgrade exception.
5. SELinux: user build, enforcing, no permissive domain, upstream `neverallow` unchanged, separate UID/domain, explicit Binder graph and negative isolation tests.
6. Backup: the v2 payload key is dual wrapped by the device Keystore and an owner-held 24-word recovery secret. Wallet keys, credentials, signing keys and operator credentials are excluded. The core envelope exists; phrase UI, import, rebinding and wipe/restore drill are pending.
7. Acceptance: the exact same final device and build fingerprint must pass Android 17 CDD review, CTS, applicable CTS Verifier, VTS, VTS HAL, VTS kernel and the SELinux negative tests. The AOSP-without-GMS product does not claim GMS and does not substitute GTS for these gates.

## Truthful current state

- Specification: aligned and machine checked.
- Source: partial. Platform Broker, shell UI and scheduling still share one APK/domain; the final split is not implemented.
- Local AI: standalone physical inference passed, but its final OS image/domain has not been built and accepted.
- Operator: Dock/API/queue/audit exist separately; the Android agent does not.
- Backup: v2 cryptographic core exists, but the active Binder backup route still creates the legacy v1 envelope.
- Final image and physical acceptance: not complete. Production signing, first-flash gates, enforcing proof, CTS/VTS, OTA/rollback and stock recovery remain blocked.

The machine-readable authority is [`data/android-release-architecture-policy.json`](../data/android-release-architecture-policy.json). `npm run android:architecture:check` rejects a false completion claim, a weakened isolation boundary or a missing VTS/SELinux release gate.

## Security and compatibility basis

Android's SELinux guidance requires default denial, least privilege and component compartmentalization; `neverallow` rules are enforced by compatibility testing. VTS covers Android kernel and HAL testing, while CTS Verifier contains applicable manual and interactive tests. The release audit therefore treats all of these as same-build evidence rather than interchangeable checks.

- <https://source.android.com/docs/security/features/selinux/customize>
- <https://source.android.com/docs/core/tests/vts/systems>
- <https://source.android.com/docs/core/tests/vts/hal-testability>
- <https://source.android.com/docs/compatibility/17/android-17-cdd>
- <https://source.android.com/docs/whatsnew/android-17-release>
