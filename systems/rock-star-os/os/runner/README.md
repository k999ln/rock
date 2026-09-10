# Explicit remote Tool runner — public development fixture

This module executes only signed finite `rock-recipe/1` text recipes that explicitly permit the selected remote target. It adds a durable remote execution service and target client, not an OS, a public cloud deployment, a payment service, or a physical USB driver. Existing schema 2 packages remain local-only. No source outside `os/runner/` was changed for this implementation; the parent integrated the agreed schema 3 verifier separately.

The two owned development endpoints are:

| Signed target | Listener | Reported transport evidence | What was actually verified |
|---|---|---|---|
| `cloud` | TLS on `127.0.0.1:9444` | `pinned_tls_loopback_fixture` | A real Debian isolated process reached through pinned TLS |
| `pc_usb` | Private authenticated framed Unix socket | `authenticated_unix_fixture` | A real Debian isolated process reached through a Unix stream |

`pc_usb` is the canonical product selection, retained for compatibility. Every receipt and execution proof says `physical_usb: NOT_RUN`. A caller cannot make a Unix job become a TLS job by changing a JSON label. Physical USB, virtual UART hardware and public cloud hosting remain **NOT_RUN**. The initial module handoff also had no OS-originated request; the later actual guest evidence is recorded separately below.

## Later native OS integration evidence

The 2026-09-08 13:27 actual native runner run（元snapshot内の参照。履歴資料は今回のGit対象外）
started inside the ARM64 Rock OS framebuffer UI. It downloaded the schema 3
package from the signed TLS registry, discarded one unsent preview, obtained
separate consent for the next preview, and completed exactly one real isolated
Linux execution through the owned TLS runner. Host observations retained zero
remote requests/jobs/executions before consent, one deliberately lost acceptance
reply, and one executor invocation. [UI semantics](../ui/REMOTE-UI-CONTRACT.md)
and the [SDK guide](../../docs/TOOL-SDK.md) describe this integration.
The `cloud` name still refers to the pinned loopback TLS development endpoint;
this is not public cloud deployment or physical USB evidence. Historical host
and target-handoff reports below remain unchanged.

## Signed package and per-job consent contract

Schema 3 has the schema 2 fields plus exactly:

```json
{"remote":{"consent":"per_job_input_sha256","retention":"job_receipts","protocol":"rock-runner/1"}}
```

`execution_targets` is a unique list from `device_local`, `cloud`, `pc_usb`, with at least one remote target. `permissions` is exactly `text.input`, `text.output`, `execution.remote`. `data` is `{input: user_supplied_text, destinations: [...]}` where the destinations are only the signed remote targets in the same order. No URLs, paths, arbitrary Python, shell, secrets, Wallet access or network actions enter the recipe language.

Before transmitting text, `RunnerClient.submit()` verifies the package signature, publisher trust, revocations, signed target and explicit consent. The server independently repeats the checks, including the owner's approved publishers, at acceptance and immediately before dispatch. The immutable signed consent object is bound by the owner's authenticated request:

```json
{"approved":true,"package_sha256":"<canonical package hash>","input_sha256":"<exact UTF-8 hash>","target":"cloud","endpoint_id":"runner-linux-cloud","key":"stable-job-key"}
```

`consent_for()` prepares this object for display/approval; merely constructing it is not evidence that a human approved it. The integrating UI must show the destination, package and input scope, retain the approved object, and pass it only after explicit approval. Cancellation or an unknown outcome never authorizes an automatic new key or fallback to another mode.

## Target interface

```python
from runner.client import RunnerClient, consent_for
from runner.transport import HTTPSRunnerTransport, UnixRunnerTransport

transport = HTTPSRunnerTransport("https://10.0.2.2:9444", explicit_ca_file)
client = RunnerClient(transport, endpoint_id="runner-linux-cloud",
                      owner="alice", token=provisioned_public_fixture_token,
                      publisher_trust=verified_publisher_keys,
                      revoked=current_verified_revocations)
# consent is the exact object retained at the real UI approval boundary.
receipt = client.submit(signed_package, text, stable_key, consent=approved_consent)
state = client.status(stable_key)
state = client.cancel(stable_key)
```

The development HTTPS client accepts only explicitly configured `localhost`, `127.0.0.1`, or QEMU-host alias `10.0.2.2`. It loads the explicit CA, verifies its hostname, rejects redirects and ambiguous framing, bounds request/response bodies to 1 MiB, and applies total request deadlines. The same authenticated envelope travels over a four-byte big-endian length plus bounded UTF-8 JSON on the Unix path. Linux Unix peers additionally use `SO_PEERCRED`; the socket is private and owner checked. On macOS host tests the HMAC and filesystem boundary are exercised; Linux peer UID checks are exercised by the actual Debian harness.

The request envelope is `{owner,request,auth}`. Domain-separated HMAC covers the owner plus the whole request. Responses independently authenticate the request SHA and result. Operations are exact-field `submit`, `status`, `cancel`; no wire field can set peer UID, execution evidence, worker path, publisher trust or revocations. Cross-owner keys and results are invisible. Replay of an identical authenticated request has the same idempotency semantics; this development protocol is not a replacement for production credential enrollment.

`revoked` on the client may be a set or a callable returning a current verified set. Server `RunnerStore.revoke(subject)` is an internal policy hook only: it appends a publisher or `id@version` revocation, blocks queued work, requests cancellation of affected live work and discards its result even if persisting cancellation failed after the revocation commit. There is no owner-accessible revoke endpoint. A production remote service still needs an authenticated fresh policy distribution system; none is claimed here.

## Durable execution and retention

SQLite DELETE journaling with `synchronous=EXTRA`, private state ownership and an exclusive instance lock protect the journal. Each `(owner,key)` stores the SHA of the full original request plus an immutable acceptance receipt. A different request under that key is rejected. Every retained job reserves bounded storage; default quotas are 1,000 jobs and 64 MiB, with a worst-case output reservation making the byte quota effective before the count quota.

`queued → running` commits before the one possible executor dispatch. Completion becomes `succeeded`, `failed` or `cancelled`. A daemon or completion-storage failure after dispatch becomes `indeterminate`, which is never automatically requeued. Only `queued` resumes on restart. A dead worker may be restarted using `start()`; ordinary storage failures use bounded backoff and visible worker error state. A single execution lock serializes manual ticks and the worker.

A successful `submit` returns an **acceptance receipt**, not completed output. If its response is lost, the client first calls `status` with the same key. It compares the recovered request SHA before accepting the receipt. Repeating `submit` never executes that key again, including after completion and restart. If both submission and status responses are unavailable, it raises an unknown-outcome error and requires retaining the key.

Queued cancellation prevents dispatch. Running cancellation first persists intent, then signals the actual process adapter to stop its process group; completion and cancellation serialize under the same journal lock. Terminal jobs retain request hash, receipt, bounded output and executor proof, and remove their raw input/package request column. SQLite secure deletion is enabled, but this is not a claim of encryption, secure physical erasure, or removal from filesystem backups. Output can itself contain user text and is retained for result recovery. No real sales, ledger entries or monthly debits are created.

## Actual process boundary

`IsolatedRecipeExecutor` has no unisolated fallback. Its configured launcher, fixed recipe worker and fixed probe entry are service configuration, never wire-supplied executable paths. On Linux the C launcher uses a fixed bubblewrap invocation, separate user/mount/PID/network namespaces, read-only runtime files, empty `/data`, empty temporary home, no capabilities, no-new-privileges, a syscall filter denying sockets/process creation/namespace escape primitives, and fixed CPU (2 s), wall (3 s), address-space (256 MiB), file, descriptor and process limits. Input is at most 64 KiB UTF-8 and output at most 128 KiB UTF-8.

The trusted entry reports actual PID, UID, namespace IDs, denied socket creation and Wallet path nonvisibility before calling the unchanged finite recipe worker. The parent process verifies that the observed mount/network namespaces differ. The launcher is compiled against Linux syscall headers, works as a nonroot user and must never be installed setuid. Arbitrary application or adversarial kernel isolation is outside this finite-language prototype's claim.

## Reproducible development checks

From the project root, using the existing public registry TLS fixture files:

```sh
PYTHONPATH=src:os python3 -m runner.build_fixture
PYTHONPATH=src:os python3 -m unittest discover -s os/runner/tests -v
```

The host suite uses real TLS and Unix transports but an explicitly labelled `fake_callback` executor for fault injection. It must not be cited as actual isolated execution. The separate Linux acceptance harness compiles the launcher, runs both real transports with `IsolatedRecipeExecutor`, observes output/isolation, checks the lost-response path, retries the same key and reopens the persistent Store:

```sh
PYTHONPATH=/mnt/rock-source/src:/mnt/rock-source/os /usr/bin/python3 -m runner.linux_acceptance --project /mnt/rock-source --work-dir /tmp/rock-runner-acceptance-unique --port 9444
```

Use a new private work directory for each changed package fixture. Preserve earlier failed journal evidence rather than changing an immutable job's key/body history. `ROCK_RUNNER_LINUX_ACTUAL_PASS` is printed only after both actual transports and isolation checks pass. The C compile uses `-Wall -Wextra -Werror`; no Buildroot build or existing VM data is modified.

For a long-lived sandbox endpoint, compile the launcher into an operator-owned location (mode 0755) and use `python -m runner.serve --state ... --endpoint-id ... --mode cloud --launcher ... --worker ... --ca ... --public-fixture-key ... --port 9444`. The Unix form uses `--mode pc_usb --socket ...`. The CLI always requires the actual isolation launcher; there is no fake-executor CLI option.

## Fixture and evidence notice

`fixtures/remote-text.rock.json` is signed using the existing public RFC 8032 section 7.1 seed already used by the SDK. TLS references `os/registry/fixtures/development-ca.pem` and `PUBLIC-FIXTURE-KEY.pem`; no new private key was generated. Alice/Bob tokens in `protocol.py` are public synthetic fixture strings. Anyone knows these values: they demonstrate protocol validation and fault handling, **not production identity, secrecy, pairing, attestation or trust**.

Evidence is indexed in `evidence/host-verification.json`, `evidence/linux-actual.json` and `evidence/target-handoff.json`. The target-handoff report records the initial absence of guest integration; later guest evidence appears above. Physical USB, production provisioning, server storage encryption, secure clocks/hardware antirollback, public deployment and real provider connections remain NOT_RUN.
