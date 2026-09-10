# Rock star os boot service

`rockd` is a small Linux userspace service for the boot-foundation milestone. It
uses an AF_UNIX socket and implements two built-in operations: `status` and text
`normalize`. It never executes a shell, external tool, downloaded code, or network
request. It is not a general application sandbox, Android runtime, or earning
system. The completed counter measures local normalization operations, not money,
income, transactions, or rewards.

Normalization is a diagnostic operation for testing OS IPC, bounds, and storage.
It is not a product Tool bundled into the kernel or a replacement for the planned
independently distributed packages installed through the standard Hub.

## Build and install

Build on Linux, or use the Buildroot Linux cross compiler:

```sh
make CC=aarch64-buildroot-linux-musl-gcc
make install DESTDIR=/path/to/rootfs
```

The compiler requires Linux libc headers and support for `SO_PEERCRED`, `accept4`,
`prctl`, `flock`, `openat`, `renameat`, `poll`, `clock_gettime`, and `fsync`.
No third-party libraries are required. The Makefile enables C11, `-Wall`,
`-Wextra`, `-Werror`, and stack protection. `LDFLAGS=-static` can be used with a
compatible toolchain. `install` requires the build host's `install -D` command.

Installed binaries:

- `/usr/sbin/rockd`
- `/usr/bin/rockctl`
- `/usr/libexec/rocktest` (integration tests, only for an isolated Linux guest)

## Init integration

Create a dedicated account with UID 1000 and GID 1000. The service refuses real or
effective UID/GID other than 1000, including root. Supplementary groups must be
empty or contain only GID 1000. It requires `PR_SET_NO_NEW_PRIVS` and disables
process dumpability before serving requests.

Before starting the service, root init prepares:

```text
/run/rock       owner 1000:1000, mode 0750
/var/lib/rock   owner 1000:1000, mode 0700, on writable persistent storage
```

Start `rockd` in the foreground through the init system, after dropping identity
to 1000:1000. With a BusyBox init script, `start-stop-daemon -S -b -m -p
/run/rockd.pid -c rock:rock -x /usr/sbin/rockd -- --state-dir /data/rock` is one
integration option when the named account/group are defined and `/data/rock`
is the mounted persistent directory. This needs the BusyBox start-stop-daemon
applet with its background and pidfile options. The daemon itself needs no
BusyBox commands. Init is responsible for mounting storage, directory creation,
identity dropping, supervision, and shutdown.

```sh
rockd [--socket /run/rock/rockd.sock] [--state-dir /var/lib/rock]
rockctl [--socket /run/rock/rockd.sock] status
rockctl [--socket /run/rock/rockd.sock] normalize '  ROCK   Star OS  '
rockctl [--socket /run/rock/rockd.sock] self-test
```

`status` reports the product, service version, actual `uname` architecture
(`aarch64` in the ARM64 guest), UID, enabled no-new-privileges state, and completed
counter. It does not increment the counter. `normalize` lowercases ASCII A–Z,
collapses runs of ASCII whitespace to one space, and trims leading/trailing
whitespace. It accepts at most 4096 bytes, including whitespace. Empty input is
valid. NUL, other non-whitespace ASCII controls, and DEL are rejected. Non-ASCII
bytes are retained; this operation is not Unicode normalization.

`self-test` performs a status/normalize/status round trip and checks the result
and the counter increment. It adds one completed operation and assumes another
client is not simultaneously submitting operations. Exit codes: `0` success,
`1` local/transport/self-test failure, `2` usage or local input limit, `3`
credential rejection, `4` other daemon rejection. Normalization replies include
the normalized text and the committed counter value.

## Local protocol and limits

The socket is mode 0660, owned by 1000:1000. The server checks Linux
`SO_PEERCRED` on every accepted connection and permits only UID 0 and UID 1000,
even if someone loosens filesystem access to the socket. The CLI also verifies
the server has UID 1000. Root is an authorized client, but cannot run the daemon
as root. Socket-parent directories must be owned by 1000:1000 and must not be
group- or world-writable. The state directory must be owned by 1000:1000 and must
not grant group/other access. The final directory components and state file
entries cannot be symlinks; init must supply trusted ancestor directories.

One connection carries one request. The client must half-close its write side
after sending the complete request. Commands are ASCII and case-sensitive:

```text
STATUS\n                     → OK STATUS product=Rock_star_os ... completed=N\n
NORMALIZE <decimal bytes>\n<body>
                             → OK NORMALIZE completed=N bytes=M\n<result>\n
```

The decimal length is 0–4096; the header is limited to 79 bytes before newline.
Extra bytes, truncated bodies, and unsupported commands are rejected. Requests
have a total two-second receive deadline, including slow clients and the final
half-close. Sending each reply also has a two-second deadline. There is one
active client, a listen backlog of 16, fixed-size buffers, and no worker or child
process creation. These limits bound a single request; an authorized account
can still monopolize the service by opening repeated connections.

## Durability and recovery

`counter` stores an unsigned 64-bit decimal count. A lock file prevents multiple
daemons from sharing the state directory. Each valid normalization writes a new
0600 `counter.tmp`, syncs its contents, renames it over `counter`, and syncs the
directory before sending success. An interrupted temporary update is discarded
on restart; a corrupt counter causes startup to fail instead of resetting it.
The service stops on a storage failure, and refuses to wrap at `UINT64_MAX`.

The count is monotonic across process restarts when the same state directory is
retained. Survival across guest reboot also requires a mounted persistent disk
and a filesystem/storage stack that honors `fsync`; a RAM-only rootfs cannot
provide that. A committed request may be counted even if the client disconnects
before receiving its reply. Retrying is a new normalization operation. This is
not an exactly-once job runner or a transaction ledger.

## Tests

Run only as root inside a disposable Linux test VM, with executable binary paths:

```sh
/usr/libexec/rocktest /usr/sbin/rockd /usr/bin/rockctl
```

The test executable creates and removes its own new `/tmp/rock-core-test.XXXXXX`
directory. It does not use the production socket/state or arbitrary home data.
It forks test children and changes their credentials itself, so no shell,
`sudo`, account database entries, or BusyBox helpers are needed inside the test.

Checks cover root startup refusal; authorized root and UID 1000 clients;
UID 1001 rejection even with a mode-0666 socket; socket ownership; singleton
locking; exact 4096-byte behavior; over-limit, malformed, and control-byte input;
receive timeout; `SIGKILL` and stale-temporary-file recovery; graceful restart;
storage failure; and corrupt, symlink, and FIFO state rejection. Success ends
with `PASS ALL rockd integration tests` and exit code 0. These tests exercise
service/process recovery; a whole-guest persistent-disk reboot test is a
separate image-integration check.
