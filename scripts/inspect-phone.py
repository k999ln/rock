#!/usr/bin/env python3
"""Read a small Android property allowlist from one explicitly selected device.

Requires an already installed adb and an already authorized connection. This
does not establish hardware compatibility or prove that an image can be flashed.
Only stdout JSON is retained; callers decide whether to save that non-secret
report. The selected adb serial and adb diagnostics are never included in it.
"""

import argparse
import json
import os
import re
import selectors
import subprocess
import sys
import time


PROPERTIES = {
    "manufacturer": "ro.product.manufacturer",
    "model": "ro.product.model",
    "device": "ro.product.device",
    "product": "ro.product.name",
    "hardware_sku": "ro.boot.hardware.sku",
    "product_hardware_sku": "ro.boot.product.hardware.sku",
    "build_id": "ro.build.id",
    "build_fingerprint": "ro.build.fingerprint",
    "android_release": "ro.build.version.release",
    "api_level": "ro.build.version.sdk",
    "security_patch": "ro.build.version.security_patch",
    "verified_boot_state": "ro.boot.verifiedbootstate",
    "vbmeta_device_state": "ro.boot.vbmeta.device_state",
    "flash_locked": "ro.boot.flash.locked",
}
MAX_PROPERTY_BYTES = 1024
PROPERTY_TIMEOUT_SECONDS = 5
TOTAL_TIMEOUT_SECONDS = 45


class InspectionError(Exception):
    """Only messages authored here may reach the diagnostic output."""


def validate_serial(serial):
    # -s always has one argument, never a shell expression or implicit device.
    if not isinstance(serial, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}", serial):
        raise InspectionError("--serial must explicitly identify one adb device (1–256 ASCII identifier characters).")


def read_property(serial, prop, deadline):
    """Bound stdout while reading; do not collect raw stderr or a full getprop."""
    if prop not in PROPERTIES.values():
        raise InspectionError("Property is outside the read-only allowlist.")
    validate_serial(serial)
    if os.name != "posix":
        raise InspectionError("This bounded reader currently supports macOS and Linux hosts.")
    end = min(deadline, time.monotonic() + PROPERTY_TIMEOUT_SECONDS)
    if end <= time.monotonic():
        raise InspectionError("Device inspection deadline exceeded; no report produced.")
    try:
        child = subprocess.Popen(
            ["adb", "-s", serial, "shell", "getprop", prop],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, bufsize=0, shell=False,
        )
    except OSError:
        raise InspectionError("Could not start adb; install Android Platform Tools before inspection.") from None
    raw = bytearray()
    try:
        with selectors.DefaultSelector() as ready:
            ready.register(child.stdout, selectors.EVENT_READ)
            while True:
                remaining = end - time.monotonic()
                if remaining <= 0 or not ready.select(remaining):
                    raise InspectionError("Device property read timed out; no report produced.")
                chunk = os.read(child.stdout.fileno(), MAX_PROPERTY_BYTES + 1 - len(raw))
                if not chunk:
                    break
                raw.extend(chunk)
                if len(raw) > MAX_PROPERTY_BYTES:
                    raise InspectionError("Device property exceeded the output bound; no report produced.")
        try:
            code = child.wait(timeout=max(0, end - time.monotonic()))
        except subprocess.TimeoutExpired:
            raise InspectionError("Device property read timed out; no report produced.") from None
        if code != 0:
            raise InspectionError("adb could not read the selected device; check its existing connection and authorization.")
    except OSError:
        raise InspectionError("Could not read the selected device; no report produced.") from None
    finally:
        if child.poll() is None:
            child.kill()
        child.wait()
        child.stdout.close()
    try:
        value = bytes(raw).decode("utf-8")
    except UnicodeDecodeError:
        raise InspectionError("Device property is not valid UTF-8; no report produced.") from None
    if value.endswith("\r\n"):
        value = value[:-2]
    elif value.endswith("\n"):
        value = value[:-1]
    if any(not char.isprintable() for char in value):
        raise InspectionError("Device property contains control characters; no report produced.")
    if serial in value:
        raise InspectionError("Device property contains the selected identifier; output suppressed.")
    return value or None


def inspect(serial):
    validate_serial(serial)
    deadline = time.monotonic() + TOTAL_TIMEOUT_SECONDS
    values = {label: read_property(serial, prop, deadline) for label, prop in PROPERTIES.items()}
    return {
        "schema": "rock-phone-inspection/1",
        "status": "READ_ONLY_PROPERTIES_OBSERVED",
        "scope": "Device-reported properties only; no flash compatibility or cryptographic attestation established.",
        "missing_property_meaning": "null means empty/unavailable, never unlocked, supported, or passed.",
        "properties": values,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", required=True, help="Explicit adb device identifier; omitted from report and diagnostics.")
    args = parser.parse_args(argv)
    try:
        report = inspect(args.serial)
    except InspectionError as error:
        print("Phone inspection failed: " + str(error), file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
