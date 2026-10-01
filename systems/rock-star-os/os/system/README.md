# Fixed OS power control

`power_service.py` runs as root and accepts only normal init-mediated poweroff
and reboot. It never uses a shell, caller-supplied path/arguments, network API,
or `-f`. The only executable choices are `/sbin/poweroff` and `/sbin/reboot`.
BusyBox init and the OS shutdown service hooks remain responsible for stopping
services and syncing/unmounting data. Receipt acceptance is not proof that this
shutdown sequence completed.

Default daemon invocation:

```sh
/usr/bin/python3 -B -I /usr/lib/rock-system/power_service.py
```

Install both Python files together under `/usr/lib/rock-system/`. A control
wrapper may invoke `/usr/bin/python3 -B -I /usr/lib/rock-system/powerctl.py`.
The integration owner must add the service to init and the Platform relay.
This directory does not modify those hooks or any existing service.

The daemon is root-only. `/data/system` must be root:root mode 0700 and its
SQLite/lock files root:root mode 0600. The Unix socket is
`/run/rock-system/power.sock`, root:1002 mode 0660, inside a root:1002 mode 0750
directory. Every accepted socket is checked using Linux `SO_PEERCRED` before
reading a frame. Only UID 0 and the Platform UID 1002 are authorized; UI UID
1000 cannot call this socket directly, even if a test loosens file permissions.

One newline JSON request per connection, at most 1024 bytes including newline:

```json
{"v":1,"op":"poweroff","key":"ui-0123456789abcdef"}
```

`op` is exactly `poweroff` or `reboot`; `key` is 1–128 ASCII letters, digits,
underscores or hyphens. Other fields, duplicate JSON fields, wrong types and
multiple frames are rejected. Receive deadline is two seconds for the entire
frame; the server handles one client at a time with backlog eight and one
dedicated power worker. Reply writes have a one-second deadline.
The CLI allows 12 seconds total for connection, send and durable receipt. A
timeout remains uncertain: retry the identical key; it does not authorize a new
action or imply that the OS completed shutdown. The native UI's outer deadline
is 15 seconds, and the platform power relay has its own 12-second limit.

An accepted response is `{ok:true,result:{accepted:true,key,op,boot_id,meaning}}`.
The request and this immutable receipt commit with SQLite `synchronous=EXTRA`
before the reply. The worker is armed only after `sendall` succeeds and waits
750 ms before dispatch. It first commits `status=dispatched`, then invokes the
fixed command once. A lost reply may be retried with the exact same key and
payload, but cannot cause a second command. The same key with another action
is rejected. A distinct action while one is pending/dispatched receives a
durable `busy` receipt. An explicit new key may be used after a command failure.

Every daemon restart abandons previous pending/ready work, including requests
from the same kernel boot. Old dispatched requests are never replayed. Kernel
`/proc/sys/kernel/random/boot_id` separates boots, so a previous boot's action
does not execute on a new boot or block a fresh request there. A crash after
the durable dispatch claim but before invoking init can leave an action
unexecuted; at-most-once dispatch deliberately does not mean guaranteed
execution. Same-key replay still returns the original acceptance receipt.
No success claim should be inferred from it. The root-only database records
abandoned, failed, dispatched and rejected states for independent observation.

The DELETE journal uses `EXTRA` so its containing directory is synced when the
journal is removed, as described by [SQLite](https://www.sqlite.org/pragma.html#pragma_synchronous).
An unknown storage failure before dispatch or while recording its result sets
a fatal worker error and exits the daemon with failure. The service does not
silently keep accepting requests with a dead worker. A supervisor may restart
it after storage recovers; outstanding work is abandoned and never replayed.

At most 10,000 receipts are retained. Capacity, malformed requests and key
conflicts fail closed. There is no API to erase receipts or reset the limit.
The CLI exits 0 for accepted receipt, 1 for a service rejection, 2 for a
transport/authentication/receipt error. CLI usage:

```sh
python3 powerctl.py poweroff --key local-shutdown-1
python3 powerctl.py reboot --key local-reboot-1
```

`--socket`/daemon `--state-dir` are root deployment or isolated test options,
not request fields. Tests use temporary directories, injected Python callbacks
and subprocess UID changes inside the authorized disposable Linux VM; they
never call an actual power command. Run `make test` as root in that VM. Required
libraries are Python's socket, sqlite3, threading, fcntl and subprocess modules.

## Proposed actual guest evidence

Use an explicit test-image flag `rock.system.verify=1` and a fixed read-only
observer with no request/mutation endpoint. It observes the root-owned database
with SQLite `mode=ro`/`query_only`, records the current boot ID, action key,
dispatch timestamp and mount/service identities, and emits one serial marker.
The native GUI or a separately identified control test issues the real action
through Platform. The host must correlate this receipt with QEMU's actual
normal shutdown/reboot event and init shutdown/sync logs; input or an acceptance
reply alone is not a PASS. A reboot second boot uses the same userdata and must
show the old receipt unchanged with no automatic redispatch. No observer is
installed or actual power test claimed by the unit suite in this directory.
