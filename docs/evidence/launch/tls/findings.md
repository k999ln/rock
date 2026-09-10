# LCH01 independent native TLS / CI research

Source: `29e4f7203f72d9949e2dfc90b64c4215d4bbb765`. The checkout was read only;
all experiments and suggested code live in this scratch directory. Original
9ab ARM64 failing log still matches SHA
`e7e8e958b89fe095df559f6abe17544d3bd7d3692ef9b646f9e36040d23fc141`.

## What the historical evidence establishes

- 9ab ARM64: 10 actual TLS response/frame deadline errors during owner
  enrollment, connection begin/approval, and exchange quote/approval. Original
  main suite 1367 / 447.965s; 1631 executions across 14 checks, FAIL retained.
- e430 GitHub run 34477407336: main 1385 tests, 1 error; all 13 support checks
  passed. Exact failing statement is `test_game_connections_tls.py:436`, initial
  `approve`, through `wallet_backend/client.py:144` to TLS read timeout. Client
  default remains 1 second (`client.py:92`), server fixture remains 3 seconds.
  The GitHub failed-step log was independently read with `gh run view`.
- ba900 GitHub run 34478360425: main process exceeded 600s at a legacy case;
  no final outcome for that case and no complete suite count. Later checks did
  not run. It cannot establish that this last case alone hung for 600s.
- 3d07 GitHub run 34498721201: main reached 600s after 676 started cases. The
  MCP call shown at 570s completed later, and the test log advanced to backup.
  Existing four-job CI partitioning mitigates cumulative runtime, with the
  same 600s budget per job and full discovery/count/source/log reconciliation.
- Current source 29e4f72 GitHub run 34503440862 independently listed SUCCESS.
  This does not explain or erase the older failures.

## Concrete bottleneck, bounded proposal, and measured scope

`systems/rock-star-os/os/wallet_backend/server.py:41-59` installs an unbuffered
`io.RawIOBase` reader at `:72-74`. Its inherited `readline()` obtains one byte
per `recv_into()` call, rearming the socket timeout each time. In the exact
e430 test on this Mac (Python 3.14.7), the unmodified reader made 4671 receive
calls, including 4657 one-byte reads, to return 10522 bytes. The normal case
passed in 0.783s; approval requests took approximately 50ms each.

The scratch `buffered_reader.py` proposal keeps at most 8192 prefetched bytes,
charges only bytes delivered to the current header/body budget, and checks the
original absolute deadline even when returning already-buffered bytes. It
reduces actual TLS receive calls in the same scenario to 33, with zero one-byte
TLS calls and identical returned byte count. It passed in 0.686s. Four boundary
tests cover coalesced header/body accounting, overflow rejection, deadline
expiry after prefetch, and fragmented reads/EOF.

This is a proven syscall-amplification defect and an actionable scoped
optimization. It is NOT a proven root cause of the historical failures.
There were no original server-stage timings or thread stacks at the 1-second
Wallet failures. The 570s MCP stack is a different component and failure.

Controlled GIL competition during the whole approval reproduces the original
named `BackendUnavailable` / TLS read timeout in both readers (1.019s original,
1.007s buffered); those FAIL logs are retained. Limiting the competition to
header parsing yields PASS with both: original approvals 495/478ms versus
buffered 179/208ms. This supports sensitivity to many receive calls but does
not prove the original environments had the same contention, nor that the
buffer change solves arbitrary CPU saturation or all full-suite slowdown.

## Reproduction

From this scratch directory:

```sh
python3 -B profile_request.py
python3 -B profile_request.py --buffered
python3 -B test_buffered_reader.py
python3 -B reproduce_gil.py --competitor
python3 -B reproduce_gil.py --buffered --competitor
python3 -B reproduce_gil.py --competitor --header-only
python3 -B reproduce_gil.py --buffered --competitor --header-only
```

The existing experiment outputs are immutable evidence; use fresh log paths
for any future execution. `evidence.json` has results and source/log hashes.

GitHub checks:

```sh
gh run view 34477407336 --repo k999ln/rock --log-failed
gh run list --repo k999ln/rock --workflow native-os.yml --limit 30 \
  --json databaseId,headSha,status,conclusion,createdAt
```

Suggested integration: adopt the bounded-buffer change with deterministic
receive-count/budget tests and real Wallet malformed-framing/slow-body/ledger
regressions, then use current full native CI. Keep all original failure records
and `historical_cause: UNDETERMINED`. To close that historical cause gate needs
evidence of the relevant server wait/CPU state on recurrence, preferably a
test-only per-operation stage profiler and exception-triggered stacks that
store no payload, credential, account, or transaction values. Do not extend
timeouts, retry tests automatically, weaken budgets, rewrite immutable freeze
evidence, or claim fresh OS image acceptance for this source optimization.

## Final scope decision and CI-only proposal

Root requested preserving the accepted runtime/image, so the buffer proposal
above is deferred. No runtime code is proposed for integration in this turn.
LCH01 remains `BLOCKED_HISTORICAL_CAUSE_UNDETERMINED`.

`native-failure-diagnostics.patch` is the actionable **CI-only** alternative.
It changes the optional partition runner to capture all-thread stacks in
`addError`, `addFailure`, and failed `addSubTest`, before fixture cleanup can
destroy the waiting worker. A private 0600 exclusive sidecar records the test
ID, event type, monotonic time, process CPU/context switches/live thread count,
load average, and stacks without locals, source lines, exception messages, or
subtest parameter values. Current per-test timings, deadlines, verdicts and
all discovery/merge requirements remain. The existing `--diagnostic-stacks`
flag enables it and the parent report hashes the sidecar. The original
whole-process 570s stack observer remains independent.

Six new real-child/boundary tests plus all eleven existing partition/stack
tests passed on Mac: 17 tests / 2.752s / skip 0. They verify capture before
worker cleanup, original error/failure/subtest verdicts, payload exclusion,
success/no-observation behavior, opt-in behavior, and no overwrite of files
or links. The patch passed read-only `git apply --check` against the checkout.
It has not been applied or run on GitHub/Linux. Runtime/image is unchanged.

Test command from `ci-proposal/`:

```sh
PYTHONPATH=systems/rock-star-os/tests python3 -B -W error::ResourceWarning \
  -m unittest discover -s systems/rock-star-os/tests -p 'test_native_*.py' -v
```
