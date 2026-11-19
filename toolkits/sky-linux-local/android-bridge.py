"""Pixel-only mutual TLS client. All work still goes through the existing manager."""
import ipaddress
import json
import re
from pathlib import Path
import signal
import socket
import ssl
import struct
import time
import urllib.request

ROOT = Path.home() / 'sky-private' / 'android-bridge'
LIMIT = 5 * 1024 * 1024
RUNTIME_LIMIT = 110000
running = True


def runtime_socket_path():
    boot_id = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    if not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', boot_id):
        raise ValueError('Invalid runtime boot identity')
    return ROOT / ('runtime-' + boot_id + '.sock')


def gateway():
    for row in Path('/proc/net/route').read_text().splitlines()[1:]:
        fields = row.split()
        if fields[1] == '00000000' and int(fields[3], 16) & 2:
            address = socket.inet_ntoa(struct.pack('<I', int(fields[2], 16)))
            if ipaddress.ip_address(address).is_private and not ipaddress.ip_address(address).is_loopback:
                return address
    raise ValueError('No private VM gateway')


def request(command):
    if isinstance(command, dict) and command.get('action') in ('cache-inventory', 'prepare-cached', 'cancel-cached-prepare', 'cache-status'):
        required = {'action', 'cacheOnly'}
        if command['action'] != 'cache-inventory':
            required |= {'modelId', 'modelSha256', 'requestId', 'scopeSha256'}
        if command['action'] == 'prepare-cached':
            required.add('accepted')
        if set(command) != required or command.get('cacheOnly') is not True:
            raise ValueError('Cache-only command required')
    if isinstance(command, dict) and isinstance(command.get('action'), str) and command['action'].startswith('runtime-'):
        return runtime_request(command)
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


def runtime_request(command):
    """Private guest socket, reached through the existing pinned mTLS peer.

    Only one bounded local-text binding is relayed. Account credentials remain
    on Android; the Node endpoint validates scope, claim, digest and purpose.
    """
    # Preserve JSON's UTF-16 surrogate escapes across the native/Python/Node wire.
    # Valid Unicode stays UTF-8; an unpaired surrogate is escaped, never replaced.
    encoded = (json.dumps(command, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8', errors='backslashreplace')
    if len(encoded) > 24000:
        raise ValueError('Runtime command too large')
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as peer:
        peer.settimeout(12)
        peer.connect(str(runtime_socket_path()))
        peer.sendall(encoded)
        with peer.makefile('rb') as stream:
            raw = stream.readline(RUNTIME_LIMIT + 1)
        if len(raw) > RUNTIME_LIMIT or not raw.endswith(b'\n'):
            raise ValueError('Invalid runtime frame')
        result = json.loads(raw)
        if not isinstance(result, dict) or result.get('schema') != 'rockstaros.pixel-runtime-response/1':
            raise ValueError('Invalid runtime response')
        return result


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
                    hello = {'schema': 'sky.pixel-linux-bridge/1'}
                    if runtime_socket_path().is_socket():
                        hello['capabilities'] = ['portable-runtime/1']
                    peer.sendall((json.dumps(hello) + '\n').encode())
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
