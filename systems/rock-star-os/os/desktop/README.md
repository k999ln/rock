# Actual virtual-device desktop lifecycle

This module launches the existing ARM64 QEMU Linux prototype with a persistent
private data image. It is not BlackBerry firmware support. Actual desktop connection and restored-OS boot evidence are recorded separately
from the focused tests below.

## Display contracts

- Device schemas 1 and 2 retain private UNIX VNC and the existing SSH display.
- Schema 3 requires `viewer: browser` and explicit `network: none` or
  `development-services`. The Mac launcher requires local port 5909 and forwards
  it over the existing authenticated Lima SSH connection to private
  `websocket.sock`. QEMU also retains its private UNIX VNC endpoint.
- Each new session creates an eight-byte password from 64 ASCII symbols using
  cryptographic randomness (48 bits). The password exists in an owned 0600 file
  and QEMU receives only the file path in `-object secret`. Records, command-line
  arguments to QEMU, serial logs and ordinary launcher JSON contain no password.
- `display-secret` is a dedicated private SSH action bound to the current live
  session. The launcher reads it once when opening a browser. The credential is
  passed only in the viewer URL fragment, never in its HTTP path or query. The
  root-owned `browser_server.ensure_viewer(host_state, session)` returns
  `http://127.0.0.1:8899/index.html`; that viewer removes its fragment immediately.
  Launcher return values omit the fragment; `--no-open` never reads a credential.
- VNC password authentication here protects a private SSH-forwarded development
  display. This is not a production public-network authentication claim.

QEMU documents UNIX WebSockets, VNC `password-secret`, and secret objects in its
[official user manual](https://www.qemu.org/docs/master/system/qemu-manpage.html).
The browser server and pinned noVNC intake are maintained separately by the
parent task. No website replaces or reimplements the guest OS framebuffer.

## Failure and restoration behavior

A newly spawned service supervisor owns a separate process group. Readiness
polling uses `waitid(... WNOWAIT)` so its leader PID cannot be recycled before
group cleanup. Startup failure sends TERM and then KILL only to that new group,
reaps the leader last, and includes the registry/compiler descendants. Existing
supervisors are reused by exact process identity, never killed by this path.
Publish attempts have one-second deadlines with stop checks between packages;
compiler startup is interruptible. The recorded display is available before
optional service startup, so a service failure does not prevent normal OS
shutdown through the screen.

Backup reads a stopped, clean filesystem without repair. Restore copies only to
a new device, rechecks the final copy hash and size against the backup manifest,
checks that destination filesystem without repair, and activates its marker only
after those checks. A failed partial restore remains unactivated for inspection;
source data is retained. External runner journals are not included, so restored
schema 2 and 3 devices are forced to `network: none`. Browser credentials are
session files outside userdata and are not included in a backup.

## Focused evidence

`evidence/linux-desktop-31-tests.log` records the original three fixes and actual
disposable Linux process-group faults. `evidence/linux-desktop-38-result.json`
records all 38 focused tests passing after browser integration. The later
`evidence/linux-desktop-43-result.json` adds five actual ephemeral HTTP server
tests and confirms both port probes preserve restart behavior. Browser tests
check command, secret, response and URL boundaries; filesystem guard tests use
temporary fixtures. They do not replace a real QEMU browser connection or a real
ext4 backup→restore→boot verification.

On macOS, the first actual static-server startup returned HTTP 200 with the
correct instance/build but timed out: Homebrew Python re-executed its Python.app
binary after the initial process-command capture. Startup now waits for its
unique HTTP readiness before fixing the command identity. Existing-server reuse
still requires the saved exact command and instance/build. The new regression
and all 44 focused tests pass (`evidence/linux-desktop-44-tests.log`).
`evidence/actual-viewer-start-macos.json` records a real Mac startup on port 8899,
three static asset responses, same-process reuse and owned listener shutdown on
2026-09-08 at 12:50 UTC. That test did not start an OS or read display credentials;
the full browser-to-QEMU connection is a separate integration result.

## Actual backup verification harness

`verify-backup.py --source browser-1244 --restored browser-restored-1244` is
available for a controlled verification window. It refuses a live
source or any existing restore destination. It calls the actual backup/restore
operations, compares full source/backup/restored hashes before boot, and starts
one new offline device using the original frozen images. QMP sends native
pointer input and captures the installed Tools, job history/result, Wallet
membership and balance (navigation/scroll only), and normal shutdown confirmation.
It cannot send a host power/reset command and never
forces the restored process off on failure.

The harness accepts the actual backup schema `/1` (data only) and `/2`
(complete A/B/data) without converting or relabeling either format. Every
manifest disk is checked by size and full SHA-256 at source, backup and restored
destination before boot. Source and backup disks are rechecked on exit even
after failures; both restored A/B slots must also remain unchanged after boot.
Schema 5's pinned stage0 image is included in the frozen-image checks.

After the guest's UI-initiated shutdown, the harness checks clean ext4 and exact
retention of every table in the profile's required SQLite databases. Device
schemas 1–3 require the local simulator profile's 44 base tables: Hub/registry 7,
Wallet/ATM/authentication 16, membership 15, OS remote controller 2,
authenticator 3, and power 1. Schemas 4–5 require the purchaser profile's 16
local tables, replacing the local Wallet/membership databases with the remote
Wallet cache's identity, requests and snapshot tables. A conflicting second
Wallet database is refused. Required databases/tables cannot be omitted, and
every additional table is included in the bounded hash comparison. It verifies
database integrity/foreign keys, complete table coverage, schema and internal
autoincrement sequences. Added table content/schema changes fail the comparison.
The power exception applies only to its requests table, never additional tables.
Each completed job's
durable request receipt, and exactly one additional native power request with a
different kernel boot ID must agree. Wallet evidence contains only counts/digests
and financial totals (including balance and bill count); exported
databases exist only in a temporary directory. The source and saved backup must
still have their original full hashes. Failures retain the new device/data and
report for inspection.

For local-only scope its successful automated status is `AUTOMATED_PASS`, with
`visual_review: PENDING`. Original screenshots need a separate visual review
before claiming the screen shows restored Tools/results/Wallet. If the source
uses an external authority or runner, local success instead returns `INCOMPLETE`
(nonzero exit) and `local_checks: AUTOMATED_PASS`. The report names external
Wallet/membership, registry, runner and optional MCP/provider state as `NOT_RUN`.
These journals and authority bindings are not backed up by the existing device
backup module. Fresh external restoration, reconciliation and writer fencing
remain required; a remote cache cannot substitute for that evidence. There is
no flag to waive required external coverage.

The current harness uses report schema `/3` and the same eight frame captures.
The schema `/2` and six-frame 1305 reports/images below are historical and remain
unchanged. Host fixture checks for both manifest formats, actual SQLite schemas,
extra-table retention and missing external coverage do not prove actual ext4,
QEMU startup/shutdown or restored backend operation.

This strict comparison requires quiescent local/remote jobs, registry requests
and monthly due work, plus unresolved remote Wallet requests. The same
UTC-month counter and all business rows must
remain unchanged; a legitimate new-month scheduler transition is not silently
excluded or called data loss. Power alone may append the one verified shutdown.
Entropy seeds, locks, filesystem metadata and OS boot-health metadata can change
during normal boot and are outside the postboot SQLite comparison. The full
preboot image hash covers all disk files; postboot registry cache/file trees and
unlisted databases are not separately enumerated after boot. External
runner/provider state is recorded as a separate incomplete scope when needed.
The exact scope
and exclusions are embedded as `comparison_contract` in each new report.

The first restricted Mac invocation passed the new file/launcher checks, but its
two existing UNIX-socket tests were denied by the host sandbox and the three
then-existing Linux-specific group tests were skipped. The Linux run passed all
of them; no permission failure was treated as a product pass.

## Actual restored-device evidence

`evidence/backup-restore-1305/RESULT.md` records the 2026-09-08 13:05–13:06 UTC
backup→new offline device→boot→native shutdown PASS. Source/backup remained
byte-identical, as did the restored image before boot. After boot, fixed Hub,
Wallet and membership business contents matched; one installed Tool, one
completed job and all three request receipts survived. Wallet/membership tables
were empty in this fixture, so populated-wallet restoration is not claimed.
All six original framebuffer captures were viewed, including the retained
checklist output. The original automated report remains untouched; separate
`visual-review.json` binds the acceptance to its hash and the image hashes.
Normal shutdown was verified by guest events, durable receipts, distinct kernel
boot IDs and clean ext4, with zero host power/reset commands.

## Parent actual browser verification, 13:09 UTC

`evidence/browser-1244-progress.json` and original screenshots record authenticated actual QEMU framebuffer access on the Mac, native Hub selection, package installation, permission approval, per-key input, offline result, and normal UI shutdown. Network was `none`; package installation in this specific run used the embedded signed development catalog. Direct HTTPS acquisition is a separate OS Store / Native Remote evidence run.

Independent review found the original static module import could delay fragment removal until all RFB dependencies loaded. The wrapper now clears the fragment before dynamic import and also consumes same-document hash changes. `evidence/viewer-fragment-guards.json` records an actual browser dependency-request abort, explicit safe failure, empty URL fragment, repeated fragment removal, and a no-credential visit. The fault route was removed. Only the three wrapper assets and reviewed core/pako JavaScript are served; upstream app/tests pages are refused. Six focused HTTP boundary tests passed after this restriction.

## Final populated Wallet restoration

`evidence/backup-restore-final-1404/RESULT.md` and `adoption.json` record the
2026-09-08 14:04–14:05 UTC final-device restoration PASS, including all eight
original screen captures. The source had one enabled proposal Tool/job, one
settled simulator sale, one USD 8.88 monthly bill, USD 41.12 available, and
revoked automatic renewal. All of that state survived the new offline boot.
The 32-table contract checks schema/sequences and exact business content;
only one additional native shutdown row is allowed. Source/backup remained
byte-identical, ext4 was clean, and host power/reset commands were zero.
The optional redacted Hub/registry join verifies the 69-byte typed input
against the actual job/request hashes and the retained signed catalog cache.
Raw Wallet/credential rows are not exported. This later populated fixture is
separate from the earlier empty-Wallet restoration at 13:05 UTC.
