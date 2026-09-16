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
- Source: partial. 最終Home／Sky／Zemaを載せるAndroid launcher／UI入口は`dev.rock.shell`、database／scheduler／Keystore／Engineは`dev.rock.automation`へ分離済み。Shellは通信権限と広いPlatform管理権限を持たず、Shell専用の署名権限、固定package、同一signer、固定API版を検証するBinderだけでBrokerへ接続する。Brokerも呼出UIDを毎回`dev.rock.shell`へ固定する。現UIはP1操作画面で、最終Home／Sky／Zema native UIの完成を意味しない。
- Split verification: 3 APKのAndroid Gradle build／lint、ホストcore 34 test、Android 15 emulator上のShell→Broker 1 testとBroker／Tool／SQLite 4 testは合格。別APKを要するLocal AI testはこの組から除外し、既存の独立試験証拠を転用しない。これはSoong full build、SELinux domain適用、production署名またはPixel実機受入の証拠ではない。
- Local AI: standalone physical inference passed, but its final OS image/domain has not been built and accepted.
- Operator: Dock/API/queue/audit exist separately; the Android agent does not.
- Backup: the active Shell/Broker route uses v2, owner 24-word confirmation, allowlisted transactional import and fresh-device Keystore rebinding. Android 15 emulator acceptance passed; the destructive physical Pixel wipe/restore drill remains blocked.
- Final image and physical acceptance: not complete. Production signing, first-flash gates, enforcing proof, CTS/VTS, OTA/rollback and stock recovery remain blocked.

The machine-readable authority is [`data/android-release-architecture-policy.json`](../data/android-release-architecture-policy.json). `npm run android:architecture:check` rejects a false completion claim, a weakened isolation boundary or a missing VTS/SELinux release gate.

## Security and compatibility basis

Android's SELinux guidance requires default denial, least privilege and component compartmentalization; `neverallow` rules are enforced by compatibility testing. VTS covers Android kernel and HAL testing, while CTS Verifier contains applicable manual and interactive tests. The release audit therefore treats all of these as same-build evidence rather than interchangeable checks.

- <https://source.android.com/docs/security/features/selinux/customize>
- <https://source.android.com/docs/core/tests/vts/systems>
- <https://source.android.com/docs/core/tests/vts/hal-testability>
- <https://source.android.com/docs/compatibility/17/android-17-cdd>
- <https://source.android.com/docs/whatsnew/android-17-release>
