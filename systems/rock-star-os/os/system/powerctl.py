#!/usr/bin/python3
"""Request a fixed normal OS power action; retain the key for uncertain retries."""
import argparse
import json
from pathlib import Path
import socket
import struct
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
from power_service import SOCKET, canonical, validate

RECEIPT_SECONDS = 12


def request_power(operation, key, path=SOCKET):
    request = validate({'v': 1, 'op': operation, 'key': key})
    deadline = time.monotonic() + RECEIPT_SECONDS
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.settimeout(RECEIPT_SECONDS)
        connection.connect(path)
        _, uid, _ = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize('3i')))
        if uid != 0:
            raise PermissionError('power daemon must have kernel peer UID 0')
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('power receipt deadline exceeded; retry the same key')
        connection.settimeout(remaining)
        connection.sendall(canonical(request) + b'\n')
        data = bytearray()
        while b'\n' not in data:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('power receipt deadline exceeded; retry the same key')
            connection.settimeout(remaining)
            block = connection.recv(min(512, 2049 - len(data)))
            if not block:
                raise ValueError('power receipt incomplete; retry the same key')
            data.extend(block)
            if len(data) > 2048:
                raise ValueError('power receipt exceeds limit')
        raw, trailing = data.split(b'\n', 1)
        if trailing:
            raise ValueError('power daemon returned multiple frames')
        response = json.loads(raw)
        if type(response) is not dict or type(response.get('ok')) is not bool:
            raise ValueError('invalid power receipt')
        if response['ok']:
            result = response.get('result')
            if type(result) is not dict or result.get('key') != key or result.get('op') != operation or result.get('accepted') is not True:
                raise ValueError('power receipt differs from requested operation')
        return response


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('poweroff', 'reboot'))
    parser.add_argument('--key', required=True, help='stable ASCII key reused only for this action')
    parser.add_argument('--socket', default=SOCKET)
    args = parser.parse_args()
    try:
        response = request_power(args.operation, args.key, args.socket)
        print(json.dumps(response, ensure_ascii=False, sort_keys=True))
        return 0 if response['ok'] else 1
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
