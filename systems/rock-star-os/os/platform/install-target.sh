#!/bin/sh
set -eu
target=$1
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
dest="$target/usr/lib/rock-platform"
mkdir -p "$dest/blackberryrock" "$dest/registry" "$dest/entitlement" "$dest/runner" "$target/usr/share/rock/registry" "$target/usr/share/fonts/rock" "$target/usr/share/licenses/rock-font"
mkdir -p "$dest/atm" "$dest/wallet_backend"
mkdir -p "$dest/wallet_auth" "$target/etc/rock-authenticator"
cp "$repo/os/wallet_auth/"*.py "$dest/wallet_auth/"
mkdir -p "$dest/service_access" "$target/etc/rock-platform"
chmod 0755 "$dest/service_access" "$target/etc/rock-platform"
for module in __init__ controller os_client status; do
  cp "$repo/os/service_access/$module.py" "$dest/service_access/"
done
mkdir -p "$dest/operations"
chmod 0755 "$dest/operations"
for module in __init__ state release onboarding device; do
  cp "$repo/os/operations/$module.py" "$dest/operations/"
  chmod 0644 "$dest/operations/$module.py"
done
cp "$repo/os/platform/wallet_view.py" "$dest/wallet_view.py"
chmod 0644 "$dest/wallet_view.py"
mkdir -p "$dest/mcp_broker"
chmod 0755 "$dest/mcp_broker"
# Device image contains the scoped client only; authority/upstream secrets and
# the Broker worker are hosted with the purchaser authority.
printf '%s\n' '"""Rock MCP device client package."""' > "$dest/mcp_broker/__init__.py"
cp "$repo/os/mcp_broker/device_client.py" "$dest/mcp_broker/device_client.py"
cp "$repo/os/mcp_broker/http.py" "$dest/mcp_broker/http.py"
chmod 0644 "$dest/mcp_broker/"*.py
cat > "$target/usr/libexec/rock-activation-boot-status" <<'EOF'
#!/bin/sh
exec /usr/bin/python3 -I -B -c 'import sys;sys.path.insert(0,"/usr/lib/rock-platform");from operations.device import publish_boot_status;publish_boot_status()'
EOF
chmod 0755 "$target/usr/libexec/rock-activation-boot-status"
auth_binding="$target/etc/rock-authenticator/device.json"
[ ! -L "$auth_binding" ] && { [ ! -e "$auth_binding" ] || [ -f "$auth_binding" ]; } || { echo 'Unsafe authenticator binding target' >&2; exit 1; }
auth_temporary=$(mktemp "$target/etc/rock-authenticator/.device.json.XXXXXX")
trap 'rm -f "$auth_temporary"' EXIT HUP INT TERM
cat > "$auth_temporary" <<'EOF'
{"schema_version":1,"kind":"public-software-test-authenticator","device_ref":"fixture-rock-arm64-001"}
EOF
chmod 0444 "$auth_temporary"
mv -f "$auth_temporary" "$auth_binding"
trap - EXIT HUP INT TERM
cat > "$target/usr/libexec/rock-authenticator-launch" <<'EOF'
#!/bin/sh
exec >>/var/log/rock-authenticator.log 2>&1
exec /usr/bin/python3 -I -B /usr/lib/rock-platform/wallet_auth/daemon.py
EOF
chmod 0755 "$target/usr/libexec/rock-authenticator-launch" "$target/etc/init.d/S55rockauthenticator"
cat > "$target/usr/libexec/rock-authenticator-health" <<'EOF'
#!/bin/sh
exec /usr/bin/python3 -I -B /usr/lib/rock-platform/wallet_auth/health.py
EOF
chmod 0755 "$target/usr/libexec/rock-authenticator-health"
mkdir -p "$dest/game_exchange"
chmod 0755 "$dest/game_exchange"
# Device contains protocol/client modules only, never Game/Wallet issuer signers,
# author credentials, Game asset journals, C coordinator or grant worker.
for module in __init__ protocol exchange_protocol storage client http reference_sdk device_client; do
  cp "$repo/os/game_exchange/$module.py" "$dest/game_exchange/"
  chmod 0644 "$dest/game_exchange/$module.py"
done
cp "$repo/os/wallet_backend/__init__.py" "$repo/os/wallet_backend/client.py" "$dest/wallet_backend/"
cp "$repo/os/atm/__init__.py" "$repo/os/atm/simulator.py" "$dest/atm/"
cp "$repo/os/platform/atm-guest-test.py" "$dest/"
chmod 0755 "$target/etc/init.d/S99rock-atm-verify"
for module in __init__ hub packages recipe_worker storage wallet sdk deadline; do
  cp "$repo/src/blackberryrock/$module.py" "$dest/blackberryrock/$module.py"
done
cp "$repo/os/platform/service.py" "$repo/os/platform/registry_control.py" "$repo/os/platform/sandbox-probe.py" "$repo/os/platform/guest-test.py" "$repo/os/platform/store-guest-test.py" "$dest/"
cp "$repo/os/platform/system-guest-test.py" "$dest/"
cp "$repo/os/platform/remote-guest-test.py" "$dest/"
cp "$repo/os/security/guest-inventory.py" "$dest/"
cp "$repo/os/platform/runner_control.py" "$dest/"
for module in __init__ client protocol transport; do
  cp "$repo/os/runner/$module.py" "$dest/runner/$module.py"
done
chmod 0755 "$target/etc/init.d/S99rock-system-verify"
chmod 0755 "$target/etc/init.d/S99rock-remote-verify"
mkdir -p "$target/usr/lib/rock-benchmark"
cp "$repo/os/benchmark/common.py" "$repo/os/benchmark/guest.py" "$repo/os/benchmark/prepared/20260908-v1/preregistration.md" "$target/usr/lib/rock-benchmark/"
chmod 0755 "$target/etc/init.d/S99rock-benchmark-verify"
for module in __init__ client common transport; do
  cp "$repo/os/registry/$module.py" "$dest/registry/$module.py"
done
cp "$repo/os/registry/fixtures/development-ca.pem" "$target/usr/share/rock/development-store-ca.pem"
for module in __init__ protocol store wallet_bridge device; do
  cp "$repo/os/entitlement/$module.py" "$dest/entitlement/$module.py"
done
cp "$repo/os/entitlement/fixtures/device-handoff.json" "$target/usr/share/rock/development-device-handoff.json"
cp "$repo/os/entitlement/guest_observer.py" "$dest/entitlement/guest_observer.py"
mkdir -p "$target/usr/lib/rock-system"
cp "$repo/os/system/power_service.py" "$repo/os/system/powerctl.py" "$target/usr/lib/rock-system/"
cp "$repo/os/system/mount-check-lib.sh" "$target/usr/lib/rock-system/"
cp "$repo/os/system/rock-mount-check" "$target/usr/libexec/rock-mount-check"
chmod 0755 "$target/usr/libexec/rock-mount-check"
cat > "$target/usr/libexec/rock-system-launch" <<'EOF'
#!/bin/sh
exec >>/var/log/rock-system.log 2>&1
exec /usr/bin/python3 -I -B /usr/lib/rock-system/power_service.py
EOF
chmod 0755 "$target/usr/libexec/rock-system-launch" "$target/etc/init.d/S45rocksystem"
cp "$repo/os/tools/guest_acceptance.py" "$dest/tools-guest-acceptance.py"
cp "$repo/os/ui/guest-ui-evidence.py" "$target/usr/libexec/rock-ui-evidence.py"
cp "$repo/os/ui/guest-ui-remote-evidence.py" "$target/usr/libexec/rock-ui-remote-evidence.py"
cp "$repo/os/ui/guest-ui-wallet-evidence.py" "$target/usr/libexec/rock-ui-wallet-evidence.py"
cp "$repo/os/ui/guest-ui-power-evidence.py" "$target/usr/libexec/rock-ui-power-evidence.py"
cp "$repo/os/ui/guest-ui-runner-evidence.py" "$target/usr/libexec/rock-ui-runner-evidence.py"
cp "$repo/os/ui/guest-ui-atm-evidence.py" "$target/usr/libexec/rock-ui-atm-evidence.py"
cp "$repo/os/ui/wallet-evidence-auth.py" "$target/usr/libexec/rock-wallet-evidence-auth.py"
chmod 0755 "$target/etc/init.d/S98rock-ui-atm-verify"
chmod 0755 "$target/etc/init.d/S98rock-ui-runner-verify"
chmod 0755 "$target/etc/init.d/S98rock-ui-wallet-verify"
chmod 0755 "$target/etc/init.d/S98rock-ui-power-verify"
chmod 0755 "$target/etc/init.d/S99rock-platform-verify" "$target/etc/init.d/S98rock-ui-verify" "$target/etc/init.d/S99rock-store-verify"
cp "$repo/examples/registry/"*.rock.json "$target/usr/share/rock/registry/"
cp "$repo/os/assets/NotoSansCJKjp-Regular.otf" "$target/usr/share/fonts/rock/"
cp "$repo/os/assets/NotoSansCJK-LICENSE.txt" "$target/usr/share/licenses/rock-font/"
cat > "$target/usr/libexec/rock-platform-health" <<'EOF'
#!/usr/bin/python3 -I
import sys
sys.path.insert(0, '/usr/lib/rock-platform')
from service import call, PLATFORM_SOCKET, PLATFORM_UID
result = call(PLATFORM_SOCKET, {'v':1,'op':'health'}, PLATFORM_UID)
if not result.get('result', {}).get('ready'):
    raise SystemExit(1)
EOF
chmod 0755 "$target/usr/libexec/rock-platform-health"
for role in platform wallet; do
  cat > "$target/usr/libexec/rock-$role-launch" <<EOF
#!/bin/sh
exec >>/var/log/rock-$role.log 2>&1
exec /usr/bin/python3 -I -B /usr/lib/rock-platform/service.py --role $role
EOF
  chmod 0755 "$target/usr/libexec/rock-$role-launch"
done
cat > "$target/usr/libexec/rock-ui-launch" <<'EOF'
#!/bin/sh
exec >>/var/log/rock-ui.log 2>&1
exec /usr/bin/rock-ui
EOF
chmod 0755 "$target/usr/libexec/rock-ui-launch"
