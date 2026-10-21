"""Pixel-only mutual TLS client. All work still goes through the existing manager."""
import ipaddress
import json
from pathlib import Path
import signal
import socket
import ssl
import struct
import time
import urllib.request

ROOT = Path.home() / 'sky-private' / 'android-bridge'
LIMIT = 5 * 1024 * 1024
running = True


def gateway():
    for row in Path('/proc/net/route').read_text().splitlines()[1:]:
        fields = row.split()
        if fields[1] == '00000000' and int(fields[3], 16) & 2:
            address = socket.inet_ntoa(struct.pack('<I', int(fields[2], 16)))
            if ipaddress.ip_address(address).is_private and not ipaddress.ip_address(address).is_loopback:
                return address
    raise ValueError('No private VM gateway')


def request(command):
    body = json.dumps(command, ensure_ascii=False).encode()
    if len(body) > 32000:
        raise ValueError('Command too large')
    req = urllib.request.Request('http://127.0.0.1:5199/__sky/linux', data=body,
                                 headers={'Content-Type': 'application/json', 'Origin': 'http://127.0.0.1:5199'})
    # A phone's proxy environment may never reroute the owner-local API.
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=10) as response:
        raw = response.read(LIMIT + 1)
        if len(raw) > LIMIT:
            raise ValueError('Result too large')
        return json.loads(raw)


def stop(_number, _frame):
    global running
    running = False


def main():
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False  # Identity is the exact paired certificate, not DNS.
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_verify_locations(cafile=str(ROOT / 'server.pem'))
    context.load_cert_chain(str(ROOT / 'client.pem'), str(ROOT / 'client.key'))
    expected = json.loads((ROOT / 'pairing.json').read_text())['serverSha256']
    import hashlib
    for number in (signal.SIGTERM, signal.SIGINT):
        signal.signal(number, stop)
    while running:
        try:
            with socket.create_connection((gateway(), 5198), timeout=8) as raw:
                with context.wrap_socket(raw, server_hostname=None) as peer:
                    if hashlib.sha256(peer.getpeercert(binary_form=True)).hexdigest() != expected:
                        raise ValueError('Unpaired Android endpoint')
                    peer.sendall(b'{"schema":"sky.pixel-linux-bridge/1"}\n')
                    peer.settimeout(20)
                    with peer.makefile('rb') as stream:
                        while running:
                            line = stream.readline(LIMIT + 1)
                            if not line or len(line) > LIMIT or not line.endswith(b'\n'):
                                raise ValueError('Invalid frame')
                            frame = json.loads(line)
                            if set(frame) != {'id', 'command'} or not isinstance(frame['id'], str) or len(frame['id']) > 64:
                                raise ValueError('Invalid request')
                            result = {'id': frame['id']}
                            try:
                                result['result'] = request(frame['command'])
                            except Exception:
                                # The caller keeps its job ID; no automatic command replay.
                                result['error'] = 'Linuxの状態か実行結果を確認してください。'
                            encoded = (json.dumps(result, ensure_ascii=False) + '\n').encode()
                            if len(encoded) > LIMIT:
                                raise ValueError('Result too large')
                            peer.sendall(encoded)
        except (OSError, ValueError, KeyError):
            if running:
                time.sleep(1)


if __name__ == '__main__':
    main()
