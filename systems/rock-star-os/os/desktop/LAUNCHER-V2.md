# Explicit Mac launcher profile for the isolated development VM

Launcher schema `rock-desktop-launcher/1` keeps the original external volume
UUID check, VM `rock`, source `/mnt/rock-source` and existing device profiles.
Schema `rock-desktop-launcher/2` selects an already configured ARM64 Lima VZ VM
and an offline signed local A/B `rock-desktop-device/6`. It does not create,
migrate or replace a VM, the old SSD environment or a physical phone.

The exact v2 manifest fields are:

| Field | Meaning |
|---|---|
| `schema` | `rock-desktop-launcher/2` |
| `lima_home` | Existing canonical mode-0700 Lima directory on this Mac |
| `vm_name` | Exact existing instance name, e.g. `rock-native` |
| `vm_config_sha256` | SHA256 of that instance's `lima.yaml` |
| `vm_identity_sha256` | SHA256 of that instance's existing `vz-identifier` |
| `guest_source` | Canonical protected Linux directory containing `os/desktop/guest.py` |
| `guest_script_sha256` | SHA256 of that exact `guest.py` entry point |
| `host_state` | Separate canonical private directory for this launcher's binding, SSH and viewer records |
| `port` | Fixed loopback WebSocket port `5909` |
| `device` | Full strict device/6 manifest: name, immutable image directory, all three image hashes, offline browser and signed local factory binding |

The manifest is bounded and duplicate fields are rejected. The VM's directory,
hostname, architecture/type and SSH configuration path must agree with Lima's
actual instance listing. A changed VM identifier/configuration is not accepted
as the original instance. The selected guest entry point is checked read-only
before each action; its source directory remains a trusted host-side bundle,
not a signed guest runtime replacement. The existing guest validator still
checks the complete immutable image triple and signed factory before start.

The first launch binds the host display state to this exact manifest. A new
manifest cannot silently reuse another launcher's saved tunnel/viewer state.
The host uses `lima-<vm_name>` and the selected `guest.py` for its actual wait
command. Returned device config, session and private socket paths must identify
the selected device. Existing image/data markers continue to forbid replacing
the saved OS configuration or formatting an unknown disk.

Both local ports are fixed: `8899` serves the existing static framebuffer viewer,
and `5909` is the SSH-forwarded private guest WebSocket. An existing viewer is
reused only when its recorded process command, instance and build match; a
foreign listener is refused before starting the OS. The later socket reservation
and exact tunnel process/session checks are retained. The launcher neither
searches for a spare public port nor stops an unrelated listener.

The preflight reservation uses the viewer server's `SO_REUSEADDR` behavior so
a just-closed HTTP connection in `TIME_WAIT` does not block a valid relaunch.
It does not enable `SO_REUSEPORT`; an active unrelated listener still fails.
After a WebSocket response, v2 also asks macOS `/usr/sbin/lsof` to verify that
this exact SSH PID owns the exact IPv4 loopback port in `LISTEN` state. Endpoint
readiness alone is insufficient: another process can bind after preflight while
SSH is still connecting. The launcher checks the new child's liveness before
and after readiness, verifies socket ownership before saving the new tunnel and
again before retrieving the display password, and includes these observations
in the original 15-second connection deadline. Missing or ambiguous ownership
fails closed. A new child is cleaned up on failure; an existing process or
foreign listener is never stopped. The legacy v1 behavior is preserved.

V2 guest operations use the explicit standard Linux tool path, including
`/usr/sbin` for the existing read-only `debugfs` image checks. Lima's interactive
shell path is not assumed. The original v1 command behavior is retained.

The display password is read only for the current session when a browser is
actually opened. Its fragment is handed directly to the system browser and
removed by the viewer; launcher results, saved records and error messages omit
it. `--no-open` does not request a display password. This remains a private
development display, not public network access.

Use the same manifest to reopen the same saved device:

```sh
python3 -B os/desktop/launcher.py --manifest /absolute/path/launcher.json
```

Closing the browser window does not power off the OS. Use the device control in
the upper right of the actual OS, choose `電源を切る`, then `確認して実行`.
After normal shutdown, another invocation starts the same saved A/B slots and
userdata. `--backup` requires this profile's existing host binding and its matching stopped
session before invoking the existing locked backup path; it checks the returned
backup identity again. It does not adopt an unmarked device for backup. Failed checks preserve the existing data and require the conflicting
configuration/session to be resolved explicitly.

The portable profile/ownership tests mock VM/display operations and include a
real read-only subprocess source-hash check. They are not a QEMU boot or actual
browser acceptance result. The concrete Mac profile must still be checked with
the intended immutable image and a fresh device during the separate viewer run.

## Separate release ports: schema v3

`rock-desktop-launcher/3` preserves the same exact VM/source/identity/display
ownership guards and adds `viewer_port`. Both `port` (WebSocket) and
`viewer_port` (HTTP) must be distinct integer loopback ports in 1024–65535.
The release package pins 5910/8900 in its signed manifest; the launcher never
searches for a spare port or stops a listener owned by another profile. V1/V2
keep their existing fixed ports and do not accept the new field.

The viewer process records both ports with its unique instance and source build.
Its command, health endpoint and lsof listener ownership still have to match.
The CSP allows only the pinned WebSocket endpoint. The viewer server substitutes
one validated integer into the reviewed client source; session passwords remain
in URL fragments and never enter HTTP responses or logs.

V3 also admits the separate `rock-desktop-device/7` development Game profile:
`network=game-authority`, signed-stage0 boot fields `profile`, `factory_sha256`,
`profile_sha256`, and the strict `game={config,sha256,authority_id}` binding.
The profile name is `development-game-authority`; it is never reinterpreted as
offline device/6 or used through a v2 launcher. Actual image, authority and
service validation remains inside the selected immutable guest toolchain.
