"""Fixed read-only native authenticator readiness check. No PIN or signing."""
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys


def main():
    if os.geteuid() == 0:
        result = subprocess.run(['/usr/bin/python3', '-I', '-B', str(Path(__file__).resolve())],
            user=1000, group=1000, extra_groups=[], capture_output=True, timeout=5)
        return 0 if result.returncode == 0 and result.stdout == b'READY SOFTWARE_TEST_ONLY\n' else 1
    if os.getuid() != 1000 or os.geteuid() != 1000:
        return 1
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.settimeout(3)
        connection.connect('/run/rock-authenticator/api.sock')
        _, uid, _ = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        if uid != 1004: return 1
        connection.sendall(b'{"v":1,"op":"auth.status"}\n')
        raw = bytearray()
        while b'\n' not in raw and len(raw) < 4096:
            chunk = connection.recv(4096 - len(raw))
            if not chunk: return 1
            raw.extend(chunk)
    if not raw.endswith(b'\n') or raw.count(b'\n') != 1: return 1
    value = json.loads(raw)
    metadata = value.get('metadata', {})
    if value.get('ok') is not True or metadata != {
        'simulation_only': True, 'authenticator': 'public-software-test',
        'user_presence': 'simulated', 'user_verification': 'public-test-pin',
        'hardware_backed': False, 'shared_public_test_key': True}: return 1
    print('READY SOFTWARE_TEST_ONLY')
    return 0


if __name__ == '__main__':
    try: raise SystemExit(main())
    except Exception: raise SystemExit(1)
