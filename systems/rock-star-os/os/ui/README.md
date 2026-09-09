# Native Rock star os Hub

## Startup readiness candidate

The native framebuffer loop now answers a bounded private readiness challenge
only after Cairo rendering and the framebuffer copy succeed and the main loop
poll returns. The root update health checker requires two fresh nonces with
advancing loop counters, stable PID/start time/executable/socket identity,
UID/GID1000 and at least one input device. Screenshot generation does not open
the readiness socket. A frozen, unprepared or exited UI cannot confirm a trial
update. This checks software presentation and loop response, not physical
display scanout, actual user input or continuous monitoring after confirmation.

Normal GUI boot requires this check, including when no `rock.ui` argument is
given. The explicit `rock.ui=headless` development mode is reserved for existing
headless update tests; their reports set `native_ui_checked` to false. Malformed
or duplicate mode arguments fail closed. An unexpected UI crash can leave its
private socket until reboot; this condition fails closed and uses the existing
boot rollback path rather than replacing an unknown live listener.

Startup snapshots refresh automatically without activating, consenting,
signing or paying. A single outstanding request is retained; retries wait from
completion, initially every second for thirty seconds and then up to eight
seconds. Background reads preserve current input, navigation, operation errors
and uncertain mutation requests.

Verification commands inside an isolated Linux copy:

```sh
python3 -B -W error::ResourceWarning -m unittest tests.test_ui_startup_health -v
make -C os/ui all rock-ui-test rock-ui-health-test
os/ui/rock-ui-test os/assets/NotoSansCJKjp-Regular.otf
sudo make -C os/ui test-health
```

The Python adversarial peers use real processes, pidfds, `/proc` and Unix
seqpacket sockets. They validate the checker; the C target separately exercises
the production server under real root/UID1000 credentials. Linux/C/QEMU results
must be recorded for the current candidate before adopting it. Historical
passes below predate this change and do not validate it.

This is the native Linux UI for the ARM64 virtual development OS. It draws with
Cairo and FreeType into `/dev/fb0` and reads Linux evdev input. It does not use an
HTML page, browser, X server, Wayland compositor, Qt, or C++ runtime.

All catalog, installation, execution, history and Wallet values come from the
local platform API. There are no catalog or balance fixtures in the installed
executable. The separate `test_*.c`, `test_remote.inc`, `test_ipc.py` and `preview_live.py` files are
test programs and are not installed. The Wallet is explicitly labeled as a
simulator and its operations change the backend test ledger only.

## Build

```sh
make
make install DESTDIR=/path/to/rootfs
```

Required Linux libraries are Cairo with FreeType/PNG support, FreeType, json-c,
libm and POSIX threads. The Makefile accepts `CC`, `PKG_CONFIG`, `CFLAGS`,
`CPPFLAGS`, `LDFLAGS` and `LDLIBS`, and retains C11, `-Wall -Wextra -Werror`, stack
protection and thread flags even when Buildroot overrides compilation flags.
The application loads the font file directly; no font lookup is required.
`remote-ui.inc` contains the remote page implementation and must accompany
`ui.c` when copying sources to an out-of-tree test build. `test_remote.inc` is
included only in the test binary.

The Buildroot package is in `os/buildroot/package/rock-ui/`. Its dependency
selection enables Cairo, Cairo PNG, FreeType and json-c; Buildroot also pulls
the dependencies of these libraries. It installs `/usr/bin/rock-ui` only.

The target must separately install this reviewed font and its license:

```text
/usr/share/fonts/rock/NotoSansCJKjp-Regular.otf
```

The source font is `os/assets/NotoSansCJKjp-Regular.otf`, sourced by the image
integration task from the fixed official Noto CJK commit recorded in that
asset's provenance. If the font is missing or unreadable, the UI reports an
error and exits; it does not silently replace Japanese labels with empty boxes.

## Init and display requirements

Run the framebuffer UI as UID 1000. It refuses to run the framebuffer mode as
another UID, including root, and enables `no_new_privs`. Root init prepares
read/write access to `/dev/fb0`, read access to the required `/dev/input/event*`
nodes, and group-1000 access to the platform API directory/socket. The platform
service remains UID 1002. Root init owns device permissions and supervision.

```sh
rock-ui --framebuffer /dev/fb0 --input '/dev/input/event*'
```

The default logical interface is 720×960. It scales uniformly and centers on
other framebuffer sizes. Packed true-color 16-, 24- and 32-bit framebuffers
are supported; the mapped framebuffer size, visible offsets and line stride
are checked before use. A 32-bit ARGB Cairo image is converted to the device's
color channel layout. The common 32-bit RGB framebuffer uses a direct copy.

For QEMU, the image needs the virtio GPU driver with framebuffer emulation,
evdev and virtio input. Add a virtio keyboard and absolute tablet. Actual
BlackBerry display, keyboard, touchscreen, GPU drivers and boot compatibility
have not been verified by this component.

## Input

- Pointer or single touch: activate visible cards and buttons. Drag content
  vertically to scroll; a mouse wheel also scrolls.
- Tab / Shift+Tab: move between visible controls. Arrow keys move focus when
  not editing. Enter activates the focused control.
- Page Up / Page Down: scroll content to reach further controls.
- Click or focus an input field to type. Backspace removes the final character,
  including a complete UTF-8 character. Ctrl+A selects the entire input for
  replacement. Enter adds a newline to tool text.
- Ctrl+Enter runs the selected tool. Ctrl+R refreshes state. Escape leaves an
  input field, dismisses a confirmation, or returns from a detail screen.
- Hub search filters the actual catalog's ID, name and description locally.
  ASCII matching ignores letter case; other UTF-8 text uses exact substring
  matching. Queries are limited to 128 bytes and are never sent to the server.
  Enter finishes search entry, and `消す` restores the full local catalog.

This development editor accepts an evdev US-layout physical keyboard. There
is no Japanese IME, clipboard integration, on-screen keyboard, arbitrary caret
placement, or text selection range yet. Japanese UI labels and UTF-8 result
display work; English/ASCII entry can be tested with the QEMU keyboard. The
tool editor limits input to 4096 bytes. Backend tools may support larger input,
but this UI deliberately uses the smaller bound. Result display is limited to
the first 16 KiB / 240 lines, with an explicit notice when truncated.

Each input device's pointer coordinates and button transition are accumulated
until `SYN_REPORT`. A `BTN_TOUCH` event that precedes coordinates therefore does
not start a false drag at the previous touch location. `SYN_DROPPED` discards
the incomplete frame and cancels an active press instead of making a click.
Only a single active pointer/contact is supported.

## Local API contract

The default endpoint is `/run/rock-platform/api.sock`. The client verifies Linux
`SO_PEERCRED` UID 1002 before sending any input. Each connection carries one
newline-terminated JSON request and one JSON response. Limits: 256 KiB request,
1 MiB response, 32 parser nesting levels, three-second total transport deadline.
`install`, `update`, `device.poweroff` and `device.reboot` have a 15-second total
deadline for bounded downloads or a durable power receipt. The platform's power
relay has a shorter 12-second deadline; uncertain transport errors preserve the
request key. All calls use a background thread, leaving
native navigation/input/rendering active while a request is pending.
There are no IPv4/IPv6 endpoints or remote API fallback paths.

```json
{"v":1,"op":"snapshot"}
```

```json
{
  "ok": true,
  "snapshot": {
    "catalog": [{"manifest": {}, "hash": "...", "size": 123, "filename": "..."}],
    "hub": {"installed": [], "jobs": [], "audit": [], "revoked": []},
    "wallet": {"simulation_only": true, "currency": "USD", "available_minor": 0},
    "device": {"name": "Rock star os", "version": "0.2.0"}
  }
}
```

The values above illustrate the protocol shape, not UI fallback data. Tool
manifests contain the actual name, description, publisher, version, permissions,
execution targets, data destinations and price. Installation records contain
the installed hash, enabled state and cached versions. Jobs use their actual
backend state, including `succeeded`, `failed`, `running`, `cancelled` and
`interrupted`. Missing Wallet values render as unavailable rather than zero.

Every mutation has `v:1`, `op` and a `key` generated by Linux `getrandom`.
Remote submit retains its prepared job key; cancellation also has a separate
random `cancel_key`. Retries retain the complete original request payload.

| Operation | Additional fields |
| --- | --- |
| `registry.refresh` | none; queues the configured signed catalog refresh |
| `install`, `update` | `id`, `version` |
| `approve` | `id`, `approved_hash` (installed package hash) |
| `rollback` | `id`, `version` (cached version) |
| `uninstall` | `id` |
| `run` | `id`, `text`, `target:"device_local"` |
| `cancel` | `id` (job ID) |
| `wallet.register` | none; public development handoff fixture only |
| `wallet.consent` | `accepted`, exact `terms_version` |
| `wallet.sale`, `wallet.reserve` | `amount_minor` |
| `wallet.settle`, `wallet.unknown` | `id` |
| `wallet.bill` | `period` (`YYYY-MM`, current UTC month) |
| `wallet.dispense` | `id`, `dispensed_minor` (cumulative amount) |
| `wallet.reconcile` | `id`, `total_dispensed_minor` |
| `device.poweroff`, `device.reboot` | none; explicit native confirmation required |
| `remote.prepare` | `id`, `target`, exact `text`; new job key |
| `remote.submit` | unchanged complete `consent`; original prepared key |
| `remote.cancel` | `cancel_key`; original job key |
| `remote.status` (read only) | original job key; never resolves an uncertain mutation |

A mutation is acknowledged only after `{"ok":true,"result":...}`. Queued jobs,
monthly billing and OS power requests require their separate completion evidence.
The UI then refreshes
the authoritative snapshot rather than inventing a local installed state or
balance. Errors are shown directly. State is refreshed every two seconds.
On a remote result page, reads alternate between its status and the snapshot.

On Hub, `状態更新` reads the local snapshot; `カタログ更新` explicitly requests a
signed catalog refresh from the backend's configured source. The UI has no
URL field, direct HTTPS code or automatic download trigger. It reads
`snapshot.registry` fields `configured`, `can_refresh`, `status`, `source_label`,
`last_checked_unix`, `last_error` and `fresh`. Missing state is shown as unavailable,
unconfigured refresh is disabled, and queued/running refresh is visibly pending.
An accepted queue request is not displayed as a successful download. A failed
refresh shows the backend error with the retained catalog. Metadata such as
revision, expiry and counts stays authoritative in the snapshot; the UI does
not invent download statistics.

When the backend limits installed records, the installed screen displays
`total_installed` and a partial-list notice. An omitted record is not treated as
proof that a tool is uninstalled: installation stays disabled until its current
state is available. A bounded catalog also shows that search covers only the
currently returned entries.

After a transport failure, the UI retains the exact uncertain mutation in
memory and offers an explicit retry with the same key. New mutations are
disabled until that request receives a matching-key success or a definitive
`rejected`/`unauthorized` response. An unrelated response or successful snapshot
cannot discard the key. A process restart loses this in-memory retry request;
the backend durable history/receipts remain authoritative. This client does
not claim persistent recovery of pending UI input across process restarts.

When disconnected, cached state is clearly labeled as old and mutations are
disabled. With no prior snapshot, the UI shows a connection error rather than
a sample catalog or zero balance.

## QEMU pointer/keyboard verification at 720×960

These coordinates assume the actual unscaled 720×960 framebuffer. Inspect the
framebuffer between actions and wait until `取得中…` disappears. The information
banner can move content down by 42 pixels, so use the two button positions below
as appropriate. Text wrapping can also change a long tool's layout; scroll if
the primary button is below the content area.

1. The search field is around **(250, 247)**. Select the first catalog card at
   approximately **(360, 363)**. For the current
   embedded catalog, this is the checklist tool. Its detail page shows author,
   version, permissions, processing location, destinations and price.
2. The current checklist catalog has both v1.0.0 and v2.0.0. Leave the
   default **v2.0.0** selected, press **PageDown once**, then tap **(360, 793)**
   to install. The version selector has moved the install button below the
   initial viewport; tapping that position before scrolling does not install.
   After the success banner and live installed snapshot arrive, press
   **PageUp once**. The permission approval button is then near **(360, 758)**.
   Tap it to approve the displayed installed hash.
3. After approval and snapshot refresh, tap **(360, 758)** to open the tool.
   On the editor page, click **(250, 425)** and send real evdev keys, or choose
   the explicit sample-input button at **(190, 708)**.
4. To exercise keyboard entry, use Ctrl+A, type `Native OS`, press Enter, type
   `Local result`, and Backspace/retype the final character. Ctrl+Enter runs it;
   the pointer run button is approximately **(360, 786)**.
5. Wait for the actual job to finish. The result screen must show `完了` only
   when the backend job is `succeeded`/`completed`, with the actual output.
6. Bottom navigation centers are Hub **(114, 913)**, installed tools
   **(278, 913)**, history **(442, 913)** and Wallet **(606, 913)**. History opens
actual jobs; Wallet initially shows the actual simulator zero balance.

`test_native_replay.py` verifies the public package signatures, loads their
actual manifests into the C renderer, and runs the shared default replay
through the install/approval/editor hitboxes. It also rejects the old unscrolled
install sequence. This is a host geometry test, not guest lifecycle proof; the
native verifier still requires its independent observer and all nine captures.

The images in `evidence/target-native-0814/` record a real, passing guest run
before the later registry/search header was added. That older build's first
card used **(360, 291)**; its event log records the exact old coordinates.

For QMP `input-send-event` with an absolute tablet, scale pixel coordinates to
the QEMU absolute range, typically 0–32767. Send x/y plus button-down in one
input batch and button-up in the next. The UI also accepts button-before-axes
ordering in the same evdev frame. A framebuffer screenshot of the running
guest, taken after these real events, is the target UI verification artifact.

The bounded replay helper attaches to an already-running QEMU on the same host:

```sh
python3 os/ui/replay_qmp.py --qmp /path/to/qmp.sock --output /path/to/evidence
```

Its default sequence uses the coordinates above, real key input and Backspace,
then captures the result/history/Wallet screens. It does not start or stop the
VM, alter disks, run monitor shell commands, or infer successful installation or
execution merely because input was sent. The replay report explicitly leaves
`application_success` unasserted; correlate screenshots with the actual Hub
receipts. `--steps FILE.json` accepts an explicit array of `capture`, `click`,
`keys`, `type`, `wait` and `wheel` actions for changed catalog/layout state.
`--validate-only` checks the action schema without connecting to QMP.

### Full guest evidence harness

`verify-native.py` runs on the Linux QEMU build host against an already-built
Rock OS image. Image integration must install `guest-ui-evidence.py` as
`/usr/libexec/rock-ui-evidence.py`, then start it as root in the background only
when `/proc/cmdline` contains the exact token `rock.ui.verify=1`. The observer
itself checks that token, root identity and ARM64 before writing or powering
off. Normal boots do not invoke it. It requires the target Python standard
library including SQLite, and BusyBox `/sbin/poweroff`.

```sh
python3 os/ui/verify-native.py --artifacts /path/to/built/os
```

The input directory must contain `Image` and `rootfs.ext4`. The harness creates
a new evidence directory and a new 128 MiB ext4 data image there; `--output DIR`
can select a different existing parent. It never formats an existing file or
device. Required host commands are `qemu-system-aarch64`, `mkfs.ext4`, `debugfs`
and Python 3.11 or newer. No host root privilege is required.

The VM has a read-only OS disk, a fresh data disk, 720×960 virtio GPU, keyboard
and tablet, no NIC and no shared host directory. `vt.global_cursor_default=0`
disables the Linux console cursor while preserving the fbdev scanout setup;
mapping fbcon to a nonexistent display left actual QEMU scanout inactive.
`rootflags=noload` also prevents ext4 journal replay on the immutable OS image.
The observer records the kernel's
`lo`/`dummy0`/`sit0` virtual interfaces and rejects a hardware-backed NIC.
Kernel and rootfs SHA-256 values are checked before and after the run.

The guest observer performs **only** `snapshot`, `job.result` and fixed-path
SQLite `mode=ro` reads. It never invokes install, approve, run, health probes or
Wallet mutations. Starting with empty Hub state, it waits for the real GUI
audit sequence and checks the exact package hash, typed input hash and result,
the three durable UI request receipts, service UID/GID and `no_new_privs`, root
and data mount protections, and an unchanged simulator Wallet snapshot.

The harness sends actual QMP pointer/key input. It waits for the guest's
installation and approval observations before advancing, types
`Native OS\nLocal resultx`, removes the final `x` with Backspace and runs with
Ctrl+Enter. The expected actual checklist output is:

```text
- [ ] Local result
- [ ] Native OS
```

After observing the completed job, the guest allows 30 seconds for framebuffer
captures, writes and syncs `/data/ui-proof.json`, emits matching serial JSON,
then powers off. The host reads the proof back from the stopped data image with
read-only `debugfs`, compares it to serial evidence and rechecks its contents.
Sending input or capturing a PNG alone never produces a PASS. On failure the
host keeps `boot.log`, `report.json`, data image and any available screenshots.

Nine captures show the Hub, tool details, permission review, approval, editor,
real keyboard input, result, history and unchanged Wallet. Inspect these actual
guest framebuffer images to assess layout and rendering. A PASS proves this
bounded QEMU native flow; it does not prove physical BlackBerry compatibility,
general downloaded-code execution or real income.

Actual native guest evidence was recorded twice on 2026-09-08, using frozen
image `rock-os-gui-0806`. `evidence/target-native-0814/` contains the reviewed
second run: nine original framebuffer PNGs, serial log, host report and guest
proof. The complete typed 22-byte input, local sandbox result, three durable
receipts, unchanged simulator Wallet, stable dedicated UIDs and immutable OS
image hashes all passed. The initial inactive-display failure is retained as
`evidence/target-inactive-display.png`; no image was edited to conceal it.

### Native signed-store GUI verification

`verify-remote.py` owns a fresh local TLS development registry on
`127.0.0.1:9443` and one fresh ARM64 guest. It refuses an occupied registry port
and terminates only its own child processes. Run it separately from
`os/verify-store.py`, which uses the same port:

```sh
python3 os/ui/verify-remote.py --artifacts /path/to/built/os
```

Image integration must also install `guest-ui-remote-evidence.py` as
`/usr/libexec/rock-ui-remote-evidence.py`. Run that helper as root in the
background only for the exact flag `rock.ui.remote.verify=1`. It explicitly
imports the adjacent installed `rock-ui-evidence.py`, so install both current
observers together. It requires one explicitly attached virtio network adapter
for this store test, while the ordinary `verify-native.py` guest has no NIC.

The harness uses `os/verify-store.py`'s SDK helper and the repository's public
development TLS/signing/author fixtures to publish only to its own local test
server. The independent `org.rockstar.remote-text-kit` v1 package is absent from
the immutable OS image. Real native input searches for it before download,
requests `カタログ更新`, discovers the verified catalog entry, installs it,
approves its hash and runs the typed text. The guest observer sends no mutations
and checks all four durable UI receipts plus the completed refresh queue.

Eleven original framebuffer captures, the SDK artifact/publish receipt, exact
job result and unchanged Wallet are recorded. After a 30-second capture grace
period, the guest syncs `/data/ui-remote-proof.json` and powers off. The harness
compares that durable proof with serial output and the independently built
package hash, and checks that kernel/rootfs hashes never changed. Implementation
and unit tests alone do not count as this actual guest test passing; its run
report is authoritative. It demonstrates a local development registry and a
finite signed text recipe, not general downloaded program execution.

The actual remote GUI flow passed on 2026-09-08 at 09:00–09:01 UTC against
frozen image `rock-os-store-0853`. `evidence/target-remote-0900/` preserves all
eleven original framebuffer captures, the independently SDK-built package,
host report, serial log and durable guest proof. Visual review confirmed the
empty search before refresh, discovered Tool, author/permission/fee details,
complete 22-byte keyboard input, sorted output, completed history and unchanged
simulator Wallet. The guest executed package SHA-256
`a002d977b57d14e0f04dbe989d024c7ad72222cfd73b29a4312fb005c9bf9eab`;
four request receipts and the refresh queue matched the real UI actions. This
run used one explicit virtio network adapter for the platform service's
configured development store endpoint. Its result does not
replace the separate store update/disconnection/restart or physical-device
tests.

## Tests and renderer evidence

```sh
make test FONT=/path/to/NotoSansCJKjp-Regular.otf
```

`rock-ui-test` checks native control requests, pointer/keyboard behavior,
hash-specific approval, bounded input, uncertain-request identity retention,
simulator amount conversion, all pages, invalid-UTF-8 rendering safety,
framebuffer conversion/stride, and button-first evdev frame handling.
`test_ipc.py` uses disposable local socket fixtures to test authenticated peers,
success/error replies, malformed/truncated JSON, input/output size limits and
the transport deadline. It does not touch production service state.
`test_evidence.py` checks the observer's read-only boundary, peer rejection,
framing limits, exact input/output/receipt checks, false-PASS rejection and
non-mutating SQLite reads using disposable fixtures. These unit fixtures are
not OS boot evidence.

The same renderer can capture a live service without opening a framebuffer:

```sh
rock-ui --screenshot /tmp/native-hub.png --page hub --socket /run/rock-platform/api.sock
rock-ui --screenshot /tmp/native-result.png --page result --job JOB_ID
```

Other screenshot options are `--size 720x960`, `--font PATH`, `--tool ID`,
`--text-file PATH` (at most 4096 bytes), `--scroll PIXELS` and `--wallet-tests`.
`--test-backend-uid UID` is restricted to explicit screenshot tests and is
rejected in framebuffer mode. Screenshot mode writes the actual disconnected
view and exits 3 if no service snapshot is available; successful connected
rendering exits 0. Other initialization/render failures exit 1, usage errors 2.

`preview_live.py` can run only as root in a disposable Linux test VM. It creates
temporary UID-1002 platform and UID-1003 Wallet instances from the real service
classes, using the signed embedded catalog and the existing host Hub recipe
interpreter. It verifies live install/approval/run/update/rollback/uninstall and
captures the same native renderer. Its evidence explicitly says this is a
Debian renderer integration check, **not a Rock OS boot or sandbox test**. Actual
guest framebuffer/input evidence is produced separately by image integration.

### Native Wallet registration and monthly simulator flow

The Wallet now reads `snapshot.wallet.membership` and `.billing` from the
separate real Wallet service. Registration uses the installed public device
handoff fixture and requests no personal fields. It does not approve a monthly
fee. The monthly card requires the exact displayed
`simulator-monthly-usd-8.88-v1` terms and USD 888 minor units; unknown terms cannot
be approved. The current renewal intent comes from `membership.entitlement`,
while the ledger's older consent record remains history. Billing acceptance is
shown separately from the worker's actual `paid`, `retry_wait` or `blocked`
record. The registration, balances and controls explicitly remain simulator
operations, with real identity and payment services unconnected.

New simulated credit/reservation requires registered, eligible membership.
Settlement and withdrawal resolution remain available to registered users after
eligibility expires so unfinished records can still be resolved. Cancellation
stops renewal while the service determines remaining paid-period access.

`guest-ui-wallet-evidence.py` must be installed as
`/usr/libexec/rock-ui-wallet-evidence.py` alongside `rock-ui-evidence.py` and run
as root only on the exact `rock.ui.wallet.verify=1` boot flag. It accepts no
caller paths or mutation operations: it reads snapshots and fixed SQLite
queries with `mode=ro`/`query_only`. The test requires fresh unregistered state,
then independently checks native receipts, separate registration/consent,
USD 20.00 simulated credit and settlement, one USD 8.88 debit despite two
billing requests, and cancellation preserving the paid period. Tool state,
service identities and protected mounts must remain unchanged. The fixed
`/data/ui-wallet-proof.json` is synced after a 30-second capture window and
compared with serial output by the host harness.

```sh
python3 os/ui/verify-wallet.py --artifacts /path/to/frozen/os
sudo python3 -B os/ui/test_wallet_evidence.py -v  # disposable Linux VM only
```

The harness owns one fresh 128 MiB userdata image and one NIC-free ARM64 guest.
At 720×960, bottom Wallet navigation is `(606,913)` and resets the view. The
unregistered action is `(360,417)`; registered consent/cancel is `(360,616)`;
monthly billing is `(360,679)`. Three PageDown presses reach the collapsed
simulator action at `(360,807)`. After expansion, two further PageDown presses
show the amount `(250,443)` and credit action `(195,521)`; the new settlement
action is `(560,700)` after the actual credit response. The C regression checks
these coordinates against the native control hitboxes, including billing error
text and the post-action message. The actual harness waits for each durable
guest stage and saves eleven original framebuffer captures. Sending input or
passing renderer/unit checks does not count as this guest test passing.

`test_wallet_evidence.py` creates disposable real adapter and double-entry
ledger state, including an insufficient-funds retry followed by explicit
monthly rescheduling. It tests the observer's valid receipt/ledger combination,
rejection of altered or missing records, read-only database access and refusal
to write or shut down an unflagged host. This is unit evidence, not a Rock OS
boot. `evidence/renderer-wallet-onboarding/` is the separately labeled live
Debian renderer check.

The actual native Wallet sequence passed on 2026-09-08 at 09:53:08–09:54:27 UTC
against frozen `rock-os-wallet-0952` (Linux 6.18.50).
`evidence/target-wallet-0953/` preserves all eleven original framebuffer captures,
host report, serial log and durable guest proof. All eleven images were visually
reviewed: registration precedes consent, insufficient funds visibly waits for
retry, keyboard input is 20.00, credit becomes SETTLED, one 8.88 bill remains
after both requests, cancellation stops renewal, and the final displayed test
balance is 11.12 USD. Seven native mutation receipts, one monthly due/paid
authorization/bill, three journals and four account totals matched actual state.
The observer recorded every stage 0–7, unchanged Tools, stable dedicated service
identities and protected mounts. The NIC-free guest synced its matching serial
and disk proof and exited; immutable kernel/rootfs hashes stayed unchanged.
This is a public-fixture simulator flow, with real identity, real money and
physical BlackBerry testing still unconnected or NOT_RUN.

### Native normal shutdown and reboot

The top-right `端末` control opens a native device page. `再起動する…` and
`電源を切る…` each open a separate confirmation. Escape or `戻る` cancels without
sending an operation. The final confirmation sends exactly `v`, `op` and a new
random `ui-` key to the platform, which relays the fixed action to the root power
daemon. No caller command, argument or path is accepted. An uncertain reply
retains the same request for retry; a matching accepted key/operation/boot receipt
is displayed explicitly as **acceptance, not confirmed completion**. Returning
through the device page preserves the original Tool/detail back destination.
The new header action is added last to the focus order, preserving existing
Hub/detail keyboard sequences and Wallet control coordinates.

For the independent real guest test, install `guest-ui-power-evidence.py` as
`/usr/libexec/rock-ui-power-evidence.py` beside the base observer and start it as
root only for `rock.ui.power.verify=1`. It reads snapshots and the fixed power
ledger using SQLite `mode=ro`/`query_only`, writing only
`/data/ui-power-proof.json`. It never invokes a power command, even on failure.
The first native UI boot cancels a shutdown confirmation; two subsequent
read-only idle observations must show no request. Real pointer input then
confirms reboot. The same QEMU instance must reboot by the guest's normal init,
start a second kernel/UI with a new boot ID and accept a GUI-confirmed shutdown.

```sh
python3 os/ui/verify-power.py --artifacts /path/to/frozen/os
sudo python3 -B os/ui/test_power_evidence.py -v  # isolated Linux VM only
```

The harness permits only QMP input, screenshots, capability negotiation and
status reads; it sends no host reset/shutdown operation. It independently
requires one guest RESET and one guest SHUTDOWN event, both kernel completion
markers, exactly two durable GUI requests with different keys and boot IDs,
unchanged Wallet/Tools, original immutable OS hashes and a clean ext4 data
filesystem. Fixed post-shutdown Hub, Wallet and membership database tables
must still have zero business actions, with independent SQLite integrity checks;
this extends the snapshot comparison through the final shutdown.
Eight original framebuffer captures cover the confirmation,
cancellation and both boots. If an independently observed request remains
pending after 20 seconds, the harness may press the native same-request retry
once per boot and saves an additional original screenshot. It still requires
exactly two durable identities and both actual guest power events. The observer
retries only SQLite BUSY/LOCKED within 15 seconds and never substitutes old rows.
A saved acceptance alone never passes this test.
The corrected frozen `rock-os-power-1058` passed the actual two-boot test on
2026-09-08 10:58:41–10:59:28 UTC. Both callbacks returned zero; each of the two
native request identities was dispatched once, with no receipt retry needed in
this run. All 20 final business table counts remained zero and all three
business databases passed integrity checks. The eight original PNGs were
visually inspected and adopted with serial, proof and filesystem check under
`evidence/target-power-1058/`. The immutable rootfs hash is
`02e0d9cf7737432e2fcb99310d0e9482e73cb37ce2325edb46148233c0164769`.

The C test covers canceled and confirmed actions, exact request fields, missing
and mismatched receipt identities, same-key retry, durable busy rejection and
nested back navigation. `test_power_evidence.py` uses the real power service with
injected callbacks on disposable root-owned state, and rejects changed receipt,
boot, Wallet, mount, UID and host-origin reset evidence. Images under
`evidence/renderer-power-unit/` are explicitly labeled unit renderer fixtures;
no real OS power action was performed by those tests.

The first actual power GUI attempt on frozen `rock-os-hush-1020` stopped before
UI readiness: the new shell configuration rejected `set -eu` in init scripts.
No GUI input or power request was sent. Original failure log, framebuffer and
report are retained under `evidence/target-power-hush1020-failure/`; the owned
test guest was stopped after that startup failure. This attempt is not a pass.

The next actual attempt on `rock-os-dash-1040` canceled without creating a request
and completed a real native reboot. Its final poweroff did not complete: a slow
durable receipt exceeded the UI/relay deadlines, leaving the action `pending`
with no reply or dispatch timestamp. The callback was correctly not executed.
The read-only observer also exceeded its former two-second SQLite busy wait.
Original eight flow captures, failure display and report are retained under
`evidence/target-power-dash1040-failure/`. A separate copy of the interrupted data
disk was journal-recovered for diagnosis; the original failed disk was preserved.
This failure motivated the bounded deadline and same-key retry changes above.

### Native remote execution and explicit sending consent

An installed signed schema-3 Tool can declare `cloud` or `pc_usb`. Its editor
keeps local run disabled when `device_local` is not declared and provides
`別の場所で実行 · 送信内容を確認`. The destination must also be available in
`snapshot.remote.destinations`. This first implementation accepts only the
configured `pinned_tls_loopback_fixture` transport and explicitly labels the
owned VM TLS test scope. Physical USB and production cloud are not connected.

`remote.prepare` creates an unapproved, unsent preview. The UI retains the exact
original input separately from the editor and displays the target, endpoint,
Tool/version/hash and complete input byte count. Rendering, Escape and opening
history do not send it. A separate fully visible consent button sends the
unchanged consent object and the same prepared key. Changed input, installed
version/hash, availability or endpoint disables approval and requires a new
preview. Old unsent previews remain visible in remote history and can be
canceled; history without its original input cannot grant sending approval.
Once the user consents, the UI closes that unsent preview immediately and follows
the same job key on the status screen. A missing receipt cannot leave the old
"not sent" claim on screen, and an older preparation response cannot restore it.

A local queue receipt is shown as acceptance only. Remote results require an
actual status object, matching receipt identity/endpoint/target, returned output
and the fixed isolated-executor evidence (including denied sockets and no Wallet
path visibility). Incomplete proof stays an explicit error. Remote history is
separate from local Hub jobs and Wallet sales.
Unavailable responses retain the entire unresolved prepare/submit/cancel
payload. Read-only status responses cannot resolve a mutation sharing the job
key, and two cancellations with different cancellation keys are distinct.
Unresolved retry controls remain visible after navigation. Cancel after sending
never claims to retract transmitted information or undo a completed result.

`guest-ui-runner-evidence.py` is a fixed, read-only root observer for the explicit
`rock.ui.runner.verify=1` boot flag, installed beside the base/store observers.
It reads only snapshots and fixed SQLite databases and writes
`/data/ui-runner-proof.json`. Its flagged test shutdown is not normal power-path
evidence. The normal native power flow has its separate two-boot proof above.

```sh
python3 os/ui/verify-runner.py --artifacts /path/to/frozen/os
python3 -B os/ui/test_runner_evidence.py -v  # isolated Linux VM
```

The host owns fresh TLS registry/runner services on loopback ports 9443/9444,
a fresh guest disk and QEMU. It uses the reviewed public SDK fixture
`org.rockstar.remote-text@1.0.0`, absent from the immutable OS. Real evdev input
must refresh/search/install/approve, type the fixed input, prepare and discard
without any remote request, then create a new preview and explicitly consent.
The remote runner must receive precisely that input/package/consent, survive
one deliberately lost acceptance reply and execute exactly one isolated job.
Fifteen original PNGs, GUI receipts, remote endpoint records, exact output,
input erasure, unchanged Wallet/local-job records and serial/disk proof must
agree. The frozen `rock-os-atm-1244` passed the actual native flow on 2026-09-08
12:53:55–12:55:26 UTC. Fifteen original PNGs were visually inspected and adopted
with the serial/disk proof under `evidence/target-runner-1253/`. Two earlier input
replay failures are retained separately. The successful replay used two bounded
destination taps. The subsequent source revision retains at most one user
mutation while a read is running, then sends the original key and payload
before another refresh. Focused native guards verify this path. Final-image
`rock-os-final-1327` then passed the actual replay with one destination tap per
preview and no duplicate-input fallback on 2026-09-08 13:26:17–13:27:41 UTC.
All fifteen original PNGs were visually inspected; the adopted records are in
`evidence/target-runner-final-1326/`.

At 720×960 with the fixed two-line input, the C renderer geometry check records:
editor after Page Down `(360,761)`, cloud preview `(360,554)`, preview after Page
Down consent `(360,652)` and discard `(360,728)`. The canceled-result editor
button shifts with transient banners; the connected actual framebuffer places
it at `(360,731)` after status polling clears the receipt message. The replay still waits for independent durable stages;
sending these inputs alone never passes it. `evidence/renderer-remote-unit/`
contains explicitly labeled unit screenshots, not real remote execution proof.

The small native ATM owner page is described in `ATM-UI-CONTRACT.md`. It offers
simulator reservation, current state, hidden-by-default code display and owner
cancellation. It has no real ATM connection or actor payout controls. Unit
compilation/rendering passed. The final `rock-os-final-1327` image also passed
the actual native ATM registration, test credit, reservation and cancellation
flow; eleven original PNGs and redacted proofs are under `evidence/target-atm-1326/`.
The same final image passed the local Tool GUI (`target-native-final-1328`, nine
visually inspected PNGs) and normal native reboot/shutdown (`target-power-final-1330`,
eight visually inspected PNGs). These runs use separate fresh guest data.
