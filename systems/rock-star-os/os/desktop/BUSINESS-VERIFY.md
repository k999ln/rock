# Native business lifecycle and soak evidence

`verify-business.py` is a Linux-host verification candidate. Importing it or
passing its host fixtures does not execute QEMU and does not prove D2 or D6.
It requires the native UI version selector and Tool disable confirmation added
after the initial OS operational-base build. It never installs a guest observer.

The host needs Python 3, OpenSSL, `qemu-system-aarch64`, `e2fsprogs`,
`tesseract-ocr`, `tesseract-ocr-eng`, `tesseract-ocr-jpn`, and `python3-pil`. Confirm both `eng`
and `jpn` appear in `tesseract --list-langs`. Evidence and image directories must
have absolute paths without spaces or QEMU/debugfs option characters. The
evidence parent must be owned by the invoking user with mode 0700.

```sh
python3 os/desktop/verify-business.py \
  --images /absolute/immutable-build/images \
  --output /absolute/private-evidence \
  --source-commit FULL_40_CHARACTER_BUILD_COMMIT \
  --mode lifecycle
```

The default `--boot-profile legacy-local` uses a fresh offline device with one
data disk. `--boot-profile local-ab` selects strict local development schema 6
and the signed stage0/A/B/data machinery described in `LOCAL-AB.md`. It requires
the immutable `Image`, `rootfs.ext4`, and `stage0.cpio.gz` triple and verifies the
real signed factory record and unconfigured image before starting. It cannot
select or reinterpret purchaser schema 5.

Use `--preflight-only` to write the frozen plan and verify host prerequisites,
image profile and both signed business packages without creating disks or
starting QEMU. Its result is `PREFLIGHT_ONLY`, with D2 and D6 `NOT_RUN`.
Use `--prepare-backup` when a successful run must become a populated source for
`verify-backup.py`: after the actual deletion/history check, the harness uses the
UI to reinstall 1.0.0, approve it, and complete a new uniquely identified job.
It then performs the independent nonempty Wallet prerequisite described below.
The successful report records `source_device` and `backup_source_ready` only
after these additional boots pass.

`--mode lifecycle` uses a new, random device name and two normal boots. The first
boot/shutdown establishes the untouched Wallet/Hub/credential baseline and
preserves a private full data-image copy. The second uses real native input to:

1. Find the signed `org.rockstar.proposal-draft` product in the catalog, explicitly
   select 1.0.0, review its version and permissions, install and approve it.
2. Type a synthetic client brief, run it, inspect the proposal and reopen it from
   history. The expected result is a useful proposal draft; it is not a diagnostic
   hash job and does not submit a proposal or claim revenue.
3. Update to the separately signed 1.1.0, approve its package hash and run a second
   brief, then roll back to cached 1.0.0, approve again and run a third brief.
4. Confirm Tool disable, observe the disabled permission screen, approve again
   and run a fourth brief, then confirm deletion and reopen its retained result.
5. Confirm normal native shutdown. No QMP power/reset/quit operation is permitted.

`--mode soak` uses a separate fresh device and repeats the same lifecycle. It
retains the installation through five normal boot/shutdown cycles in total:
baseline, lifecycle, two additional saved-data boots with a job each, then 61
new proposal jobs at 60-second intended start intervals for at least 3600 seconds.
Deletion occurs after the last job; history is reopened after deletion. Each
closed cycle must preserve every previous job, receipt, output and audit row.
No existing desktop, backup or userdata file is used as the test device.

With `--prepare-backup`, two further normal boots run after all business
assertions. They are frozen in `wallet_preparation` before launch and recorded
in `wallet_cycles`, separately from D6's original five cycles. The first uses
native UI registration, the public software authenticator, separate Wallet
terms, a USD 20.00 test credit and settlement, explicit monthly consent, two
same-month billing requests that must resolve to one USD 8.88 debit, and renewal
cancellation. It then authorizes one USD 10.00 ATM test hold using the dedicated
quote and public authenticator, and cancels the unused reservation. The ATM's
own fee must remain zero. The raw reservation code is never revealed. The
second additional boot only views the retained paid month and canceled hold.
The Wallet input phase has a fixed 600-second limit; normal boot, UI-state,
shutdown, resource and evidence limits still apply. These are synthetic units,
not real money or a real ATM connection.

After each additional shutdown, read-only evidence joins the actual 15 native
request keys, signature-verified enrollment and assertion, separate consents,
paid monthly authorization, one settled credit, one canceled withdrawal, five
journals and ten postings. The expected available balance is 1112 cents, with
no pending/held/dispensed amount. Monthly work must be `paid`, with no pending
manual retry or unfinished receipt. The second closed snapshot must preserve
all Wallet/membership/authenticator rows, including extra tables, and all Tool
state. This is reported as a D5 prerequisite; it does not replace the actual
backup, new-device restore and restored boot in `verify-backup.py`. In
particular, an existing Wallet binding is not assumed portable from an empty
ledger: the nonempty restored boot still has to succeed.

The plan is written and hashed **before the first boot**. Its fixed acceptance
thresholds are: boot 180 s, normal shutdown 60 s, individual UI state 30 s,
complete business UI job 90 s, durable worker record 30 s, soak 3600–4200 s,
61 soak jobs, maximum job start gap 180 s, host QEMU peak RSS 2 GiB, RSS growth
during the already-booted soak at most 512 MiB, and QEMU process average CPU at
most 3.5 CPU cores. Sampling is every 2 s with no gap over 10 s. Screenshot
retention is bounded to 1000 files/256 MiB per cycle; total evidence including
the 256 MiB baseline disk is bounded to 600 MiB. No threshold override is
accepted during a run. To change a threshold, review the failure, change the
test contract, and start a separately identified test; retain the failed run.

State waits use QMP screenshots and Tesseract `eng+jpn`, page segmentation 11,
with minimum matched-word confidence 45. Bounded dark-green button regions get a
second OCR pass: bright label pixels become black text on a white background,
with fixed 2× bicubic enlargement, a 10-pixel white border and page segmentation 7. Only pixels inside each row's observed green contour
can become label ink; rounded exterior corners stay white rather than becoming
border noise. Disabled labels below the existing brightness threshold remain
unselectable. Only words wholly inside the detected region replace
the original OCR hypothesis there. Region geometry alone cannot select or click
a control. Search text and the first catalog/installed/history card title may
receive at most two additional one-line passes over explicit native-layout
regions: 2× for search/catalog/installed titles, original size for history titles. Their full text must match; a rectangle alone cannot authorize a click.
Catalog selection requires the typed product ID in the same frame and clicks
the large signed product name. Detail validation requires its product name,
publisher and exact version together. Installed/history selection reads the
first card title; history then requires the unique job label in the opened
result. Deletion uses the catalog name that the native renderer displays.
The signed package preflight pins these names and publisher. No small catalog
version or fixed card coordinate triggers navigation. Recognized page errors
survive text refinement. Tesseract TSV is parsed literally, with CSV quote
handling disabled, so JSON quote text cannot swallow subsequent OCR rows.
The original evidence PNG remains unchanged. OCR text uses
NFKC, case folding and whitespace removal, followed by exact phrase comparison;
there is no fuzzy-text match. Two observations of the same exact phrase are
deduplicated only when their boxes overlap at least 70 percent by intersection
over union. Distinct controls with matching phrases remain an ambiguity error.
All OCR passes share the original UI state deadline, and a late match is
rejected before a click. The pointer is moved to an empty margin after each click without another button
press; this prevents the native cursor dot from covering label text.
Clicks use the matched words' boxes,
including when update/rollback/delete share a row. An ambiguous selector,
unrecognized state, visible error, timeout or resource fault stops the run.
Only transient blank/disconnected boot frames may wait within the original
180-second boot budget. The known QEMU 640×480 “Display output is not active.”
frame and a blank 720×960 native framebuffer return no selectable UI and run no
OCR. Their PNG structure, CRCs and bounded decoded size are validated; the
640×480 startup content must match the captured QEMU fixture. The first frame
of each pending kind is retained with `boot_pending` metadata. Repeated pending
frames cannot reset the deadline or cause clicks/scrolling. Malformed images,
other unexpected content, or pending frames after boot are fatal.
There is no happy-path sleep that substitutes for a state observation and no
fallback direct platform mutation. NativeInput still supplies its existing short
key/button delivery intervals. Saved actual search and power frames, plus
actual C-rendered product/lifecycle/result fixtures, exercise the OCR selectors.
They validate recognition only; they do not turn the preserved failed QEMU run
into a pass or replace a new complete run of the built image.

After actual QMP guest shutdown, the verifier holds the existing device lock,
checks the current process record and rejects live/orphan display sockets. It
keeps that lock across read-only `e2fsck -f -n`,
then reuses the backup verifier's `debugfs` SQLite export and complete schema
inventory. It refuses pending WAL/journal data. It compares every table in all
six required local business databases, including additional tables. The only
allowed mutations are the declared Hub lifecycle/jobs and exactly one new
dispatched native power receipt for each distinct kernel boot. Wallet,
membership, authenticator and remote tables must equal the first closed
baseline. Crossing a month boundary is not silently exempted. Both signed
packages are extracted from the immutable built rootfs and signature-verified
before launch; cached and executed hashes must match these exact versions.

`plan.json`, `report.json`, per-cycle screenshots and resource samples link the
typed input, exact expected proposal, actual persisted result, native request
key, receipt hash, package hash, audit and data-image hash. The input/expected
files are explicitly labelled expectations; their existence alone is not a
passing result. `source_commit_declared` is the operator's build-source claim;
the independent build report must link it to the measured immutable image
hashes. Source identity is not inferred from an arbitrary string.

On failure, the harness writes `FAIL` and preserves the owned device for
inspection. It does not force shutdown, repair data, reset QEMU or repeat an
uncertain mutation with another key. A host interruption is not success. Retain
the evidence and inspect the device before deciding a recovery action.

Successful scoped automation is `PASS_SCOPED`. D2's complete gate remains
`INCOMPLETE`: an actual timed in-flight cancellation is not performed here.
The Wallet synthetic flow is `NOT_RUN` unless the separate `--prepare-backup`
phase passes. Tool disable demonstrates later use
requires approval; it does not establish cancellation timing for a running job.
In lifecycle mode D6 is `NOT_RUN`; only a complete soak can report its bounded
workload `PASS`. Resource observations are of the host QEMU process, not guest
per-service UID/cgroup measurements. Hardware installation, MetaMask, real funds,
provider behavior, whole-OS acceptance and production release are not attested.

Host fixtures, with no VM or money operations:

```sh
python3 -m unittest discover -s tests -p 'test_os_business_ui_*.py' -v
```
