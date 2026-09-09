# OS Wallet integration — simulator only

The source now routes cardless ATM operations through `WalletService`. This is distinct from the earlier standalone core proof. The new `tests/test_os_atm_integration.py` suite contains 10 tests, including uncertain proxy response classification. The focused combined run passed all 27 tests: these, the 8 existing Wallet membership integration tests and 9 existing Platform boundary tests. See `evidence/os-integration-host.json` for the result and exact source hashes.

**Actual guest acceptance: 32 checks PASS across two no-NIC ARM64 kernel boots.** The root-coordinated `/var/tmp/rock-os-atm-1244` image produced the results preserved in `evidence/guest-1247/report.json` and the two redacted guest proofs. This demonstrates the local OS simulator path, not real ATM connectivity or real cash dispensing.

The first boot passed 21 checks, including actual UID 1000 owner requests, direct UID 1002 assertion rejection at the Wallet socket, root UID 0 fixed-fixture consumption and an `UNKNOWN` 1000-cent hold. The second boot passed 11 checks: the original credential/receipts and hold survived a changed kernel boot ID, a 400-cent cumulative fixture assertion was recorded, and final reconciliation returned the remaining 600 cents. The final synthetic Wallet held 4600 available, 400 dispensed, zero held, zero billed and zero journal imbalance. Both OS images were unchanged; userdata filesystem consistency passed after normal shutdown.

The actual root filesystem SHA-256 is `df8df0d24767feda7beafd7e90edff22d22a704030a807647901b6bfc185f667`; the collected report SHA-256 is `eb05c03822bc4d1352ee6466ba736e4ff76aed6a26709bba3698128469713af3`. `evidence/guest-1247/copy-receipt.json` records source hashes and the exact files copied. Wallet SQLite, WAL/SHM and userdata images were excluded from the copied proof set.

The initial host attempt remains recorded as a harness failure: the guest had passed its first 21 checks, but the init hook redirected helper output into a guest log instead of the serial console. The host observer was corrected to require normal guest poweroff and read the persisted redacted proof; a new private userdata image was then used for the complete two-boot rerun. Serial proof was not observed and is explicitly marked false in the successful report. No service, ATM core, guest helper or OS image was changed for that correction.

## Owner and ATM boundaries

- Native UID 1000 uses the Platform API, whose Wallet requests reach the Wallet daemon as authenticated UID 1002. `wallet.atm.issue/status/history/cancel/expire/timeout` require a registered account. `DeviceWalletAdapter.atm_guard()` derives owner ID from the registered `account_id` and device ID from the protected provisioning binding. Its existing membership lock remains held until the ATM/Wallet transaction completes.
- `wallet.atm.issue` additionally requires current device eligibility. Existing holds remain inspectable and resolvable after eligibility expires. Monthly billing consent remains separate; issuing a simulator withdrawal neither grants that consent nor bypasses the existing billing scheduler.
- The bare `atm.redeem/dispense/reconcile` operations require actual peer UID 0 at the Wallet socket. The actor is fixed in OS code to the intentionally public `SIM-ATM-001` fixture. Supplying another ATM ID does not select another actor. The Platform rejects bare `atm.*`, and the owner namespace rejects assertion operations. JSON fields cannot supply owner, device, actor, token or peer UID.
- The existing legacy `wallet.dispense/unknown/reconcile` routes reject IDs present in `atm_credentials`, including requests from UID 0. Their credential lookup and subsequent legacy operation execute under the same membership lock used by every integrated ATM mutation. Ordinary legacy withdrawals remain in their prior simulator scope; this is not a claim that their independent upstream Wallet methods gained production authentication.

The original exact payload contract in `README.md` is preserved, with `wallet.` prepended for the owner API. `wallet.atm.history` requires an explicit `limit`. Owner cleanup batching is not exposed as a new socket operation; existing individual cancel/expire/timeout routes are available. The caller must keep the original request key after uncertain results. Raw issuance code is returned only to the authorized caller and retained only by the documented private Wallet receipt.

The Platform Wallet proxy preserves explicit Wallet `unavailable`, `rejected` and `unauthorized` responses. A transport timeout, lost connection or malformed reply becomes `ServiceUnavailable` with same-key retry guidance, because it may follow a successful Wallet commit. A mismatched service UID remains an authentication failure. Snapshot does not currently embed ATM-specific history: clients read `wallet.atm.status/history` separately. New-issue eligibility is `snapshot.wallet.membership.registered` plus `snapshot.wallet.membership.entitlement.device_eligible`; unregistered membership has `entitlement: null`.

## Target wiring owned by the main integrator

Copy `os/atm/__init__.py` and `simulator.py` to `/usr/lib/rock-platform/atm/`, and `os/platform/atm-guest-test.py` to `/usr/lib/rock-platform/atm-guest-test.py`. The service and entitlement module must come from the same integration source. No Buildroot or install hook was edited by this subtask.

Run the guest helper only with the explicit `rock.atm.verify=1` kernel flag on the ARM64 development board. It uses the existing normal poweroff API; a test hook should launch it after services are ready, in the background so normal init can finish.

In the coordinated Linux QEMU environment:

```sh
python3 os/verify-atm.py --artifacts /path/to/immutable/image-directory
```

The host harness creates a new private userdata image and boots the same immutable kernel/root filesystem twice, with no NIC on either boot. It never builds the OS or modifies an existing user disk.

1. First guest boot: actual UID 1000 registers, creates and settles synthetic sale funds, issues 1000 cents, retries the same key, and checks owner/legacy assertion rejection. A separate actual UID 1002 process verifies that the Wallet socket itself rejects ATM assertions. Root Wallet IPC verifies the fixed ATM actor, consumes the code, and leaves an `UNKNOWN` hold after timeout. Only hashes and redacted database observations are saved.
2. Second guest boot: a changed kernel boot ID and the same durable credential/hold must be observed. The same issuance and authorization keys recover their historical receipts. Root ATM fixture assertions record 400 cents cumulatively, finalize 400 cents, and return the remaining 600-cent hold. The expected final synthetic balance is 4600 available, 400 dispensed, zero held and balanced journals.

The guest root observer opens Wallet SQLite read-only and exports selected credential metadata, withdrawal amounts, account totals, journal counts and receipt counts. It never exports `wallet_idempotency.result_json` or raw codes. The host exports only `/atm-proof.json` and `/atm-final-proof.json`; the private userdata image still contains the documented private issuance receipt, is mode 0600 inside a mode 0700 experiment directory, and must not be published as a redacted proof artifact.

The harness checks actual QEMU exit and normal poweroff, the persisted redacted proof, different boot IDs, credential identity, final ledger amounts, unchanged OS images and userdata filesystem consistency. If serial proof is present, it must match the persisted proof; its absence is recorded, not invented. Host dispatch tests, guest execution and actual physical ATM connectivity are separate scopes. Real ATM, real funds, production authentication, provider settlement, encrypted retention and secure deletion remain unimplemented.
