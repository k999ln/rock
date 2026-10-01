# Registry commit and admission boundary

`RegistryClient.refresh(*, commit_guard=None)` preserves the existing return
dictionary. The optional zero-argument context-manager factory defaults to
`contextlib.nullcontext`. Network I/O and signature validation happen first;
the guard then wraps the mutex, file lock, monotonic-state checks and atomic
cache write. Exit order is file lock, mutex, guard.

`RegistryControl` supplies `commit_guard()`, which holds `Hub.lock` and always
calls `sync_revocations()` in `finally`, before releasing the Hub lock. This
includes an exception after `os.replace` made the new signed cache visible but
before directory fsync completed. Returned refresh failure is not proof that
the old cache remains installed.

All platform mutation admissions must share the same lock and call
`sync_revocations()` before executing. `admission_guard()` provides this scope:

```python
with store.admission_guard():
    result = hub.request(key, payload, mutation)
```

Using `sync_revocations()` inside an already-held Hub lock is also supported.
Calling it and then releasing that lock before mutation would reopen a race.
The controller acquires Hub before client locks everywhere; it never holds a
client file lock while waiting for Hub. A failed sync raises
`RegistrySafetyError(ValueError)` and records `admission_blocked`/`safety_error`.
A successful retry clears that diagnostic only after all observed subjects were
applied. The flag alone is not an admission mechanism. Low-level direct Hub
calls outside the platform guard are not made safe by inspecting the flag.

One controller/consumer owns the queue for one Hub. `process_one()` resumes
`running` before `queued`, preserving the operation key after a failed final
queue commit. Normal registry failures finish the operation with `error`; queue
SQLite/OSError failures reach the worker retry loop. Exponential delay starts
at 0.1 seconds and is capped at 5 seconds, interruptible by close. Configuration
bounds are 0.01–30 seconds. Unexpected ordinary exceptions are also visible and
retried rather than silently killing the daemon. A thread killed by a
BaseException leaves its row recoverable; `start`, `enqueue`, or `snapshot`
restarts a dead previous worker. `start=False` does not launch an unstarted
controller merely by reading snapshot. A closed controller does not restart.

Existing snapshot fields are preserved. Added fields:

| Field | Meaning |
| --- | --- |
| `admission_blocked` | Known cache/synchronization failure; guarded mutations fail closed. |
| `safety_error` | Most recent synchronization or cache-verification problem. |
| `worker_alive` | Actual `thread.is_alive()`, not presence of a reference. |
| `worker_error` | Current queue/worker exception, cleared after successful recovery. |
| `worker_failures` | Consecutive outer worker failures. |
| `retry_at_unix` | Next bounded retry estimate, or `None`. |

`tests/test_os_registry_failure_boundaries.py` verifies actual Ed25519 index
verification, actual cache rename and Hub SQLite transactions. Its transport
is controlled to place concurrent operations at precise boundaries. Separate
`os/registry/tests` exercises real loopback TLS. Neither host suite is a guest
boot claim. Hardware disk rollback and privileged hostile cache mutation remain
outside the prototype's protections.
