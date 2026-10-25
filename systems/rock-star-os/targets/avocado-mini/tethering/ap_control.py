"""Private hostapd adapter. WPA authentication is performed by hostapd, not MAC ACLs.

Only the authenticated Broker may manage credentials. No public IPC is provided.
Radio/driver acceptance is separate from control-socket protocol tests.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import socket
import stat
import subprocess
import sys
import time

from controller import require, identity
from linux_gate import binding


def private_directory(path):
    p = Path(path)
    require(p.is_absolute() and not p.is_symlink(), 'unsafe_ap_directory')
    p.mkdir(mode=0o700, parents=True, exist_ok=True)
    s = p.stat()
    require(s.st_uid == os.geteuid() and s.st_mode & 0o077 == 0, 'unsafe_ap_directory')
    return p


def read_private(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as f:
        s = os.fstat(f.fileno())
        require(stat.S_ISREG(s.st_mode) and s.st_uid == os.geteuid() and s.st_mode & 0o077 == 0
                and s.st_nlink == 1 and s.st_size <= 65536, 'unsafe_ap_file')
        return f.read(65537)


def write_private(path, value):
    if path.exists() or path.is_symlink():
        read_private(path)
    # Unique names: an interrupted fsync/rename cannot block the next write.
    tmp = path.with_name(path.name + '.' + secrets.token_hex(12) + '.pending')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(value)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def properties(text):
    result = {}
    for line in text.splitlines():
        if '=' not in line:
            continue
        k, v = line.split('=', 1)
        require(k not in result, 'duplicate_ap_field')
        result[k] = v
    return result


class HostapdControl:
    """Connected UNIX datagrams; no event subscription on the request socket."""
    def __init__(self, directory, interface):
        self.directory = private_directory(directory)
        require(type(interface) is str and re.fullmatch('[a-zA-Z][a-zA-Z0-9_-]{0,14}', interface), 'invalid_interface')
        self.interface = interface
        self.path = self.directory / interface

    def request(self, command):
        require(command in {'PING', 'STATUS', 'GET_CONFIG', 'DISABLE', 'ENABLE', 'RELOAD'}
                or re.fullmatch(r'STA [0-9a-f]{2}(:[0-9a-f]{2}){5}', command), 'invalid_ap_command')
        before = self.path.lstat()
        require(stat.S_ISSOCK(before.st_mode) and before.st_uid == os.geteuid()
                and before.st_mode & 0o007 == 0, 'unsafe_ap_socket')
        local = self.directory / ('q-' + secrets.token_hex(8))
        require(len(str(local).encode()) < 104, 'ap_socket_path_too_long')
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as s:
            s.settimeout(2)
            try:
                s.bind(str(local))
                os.chmod(local, 0o600)
                s.connect(str(self.path))
                s.send(command.encode('ascii'))
                data, _, flags, _ = s.recvmsg(16384)
                require(not flags & socket.MSG_TRUNC, 'oversize_ap_reply')
                after = self.path.lstat()
                require((before.st_dev, before.st_ino) == (after.st_dev, after.st_ino), 'ap_socket_replaced')
                text = data.decode('utf-8', errors='strict').strip()
                require(not text.startswith('<'), 'unexpected_ap_event')
                return text
            finally:
                local.unlink(missing_ok=True)


class OwnedHostapd(HostapdControl):
    """Own a foreground daemon in the gate's pinned namespace; never adopt one.

    Radio settings are approved installation inputs, not client request data.
    Requires root Linux and /usr/sbin/hostapd. No real radio is assumed available.
    """
    def __init__(self, directory, interface, gate, *, country, channel, band):
        super().__init__(directory, interface)
        require(os.geteuid() == 0 and gate.namespace_fd is not None, 'ap_linux_root_required')
        require(re.fullmatch('[A-Z]{2}', country) and type(channel) is int and 1 <= channel <= 196
                and band in ('a', 'g'), 'invalid_radio_profile')
        self.radio = f'country_code={country}\nhw_mode={band}\nchannel={channel}\n'.encode()
        self.gate = gate
        self.process = None
        self.generation = None
        self.socket_identity = None
        self.ap_lock = None
        self.receipt = self.directory / 'mini-daemon.json'

    def claim(self, directory, lock):
        # Called only after ManagedAP's persistent owner claim and exclusive lock.
        ns = os.fstat(self.gate.namespace_fd)
        self.owner = dict(directory=str(directory.resolve()), interface=self.interface,
                          namespaceDevice=ns.st_dev, namespaceInode=ns.st_ino)
        if self.path.exists() or self.path.is_symlink():
            require(self.receipt.exists(), 'unmanaged_ap_socket')
            old = json.loads(read_private(self.receipt))
            require(old['owner'] == self.owner and old['state'] in ('launching', 'live'), 'ap_orphan_owner_mismatch')
            st = self.path.lstat()
            require(stat.S_ISSOCK(st.st_mode) and st.st_uid == os.geteuid() and not st.st_mode & 0o007, 'unsafe_ap_socket')
            require(old['identity'] is None or old['identity'] == list(self._identity()), 'ap_socket_replaced')
            # Every owned child inherits this same AP lock; obtaining it proves
            # that no earlier owned child can still use or later create a socket.
            self.path.unlink()
        self.ap_lock = lock
        self._journal('stopped')

    def _journal(self, state):
        write_private(self.receipt, json.dumps(dict(owner=self.owner, state=state, identity=self.socket_identity), sort_keys=True).encode())

    def radio_config(self):
        return self.radio

    def _identity(self):
        s = self.path.lstat()
        return s.st_dev, s.st_ino

    def stop(self):
        if self.process is not None:
            if self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=3)
            self.process = None
        self.generation = None
        if self.path.exists():
            require(self.socket_identity == self._identity(), 'ap_socket_replaced')
            self.path.unlink()
        self.socket_identity = None
        if self.ap_lock is not None:
            self._journal('stopped')

    def deploy(self, config, credentials):
        self.stop()
        require(not self.path.exists(), 'unmanaged_ap_socket')
        for executable in ('/usr/bin/nsenter', '/usr/sbin/hostapd'):
            st = Path(executable).stat()
            require(stat.S_ISREG(st.st_mode) and st.st_uid == 0 and not st.st_mode & 0o022, 'unsafe_ap_executable')
        self.files = (config, credentials)
        expected = tuple(hashlib.sha256(read_private(f)).hexdigest() for f in self.files)
        g = self.gate
        require(self.ap_lock is not None, 'ap_owner_unclaimed')
        self._journal('launching')
        self.process = subprocess.Popen([sys.executable, '-B', str(Path(__file__).with_name('hostapd_child.py')),
            str(os.getpid()), str(g.namespace_fd), str(config)], stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            pass_fds=(g.namespace_fd, g.lock, g.namespace_lock, self.ap_lock), env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C'})
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                require(self.process.poll() is None, 'ap_daemon_failed')
                if self.path.exists():
                    self.socket_identity = self._identity()
                    if self.request('PING') == 'PONG':
                        self.generation = expected
                        self._journal('live')
                        self.verify_loaded(config, credentials)
                        return
                time.sleep(.05)
            raise TimeoutError('ap_daemon_start_timeout')
        except BaseException:
            # Only this owned process can create a socket in the private directory.
            if self.path.exists() and self.socket_identity is None:
                self.socket_identity = self._identity()
            self.stop()
            raise

    def verify_loaded(self, config, credentials):
        require(self.process is not None and self.process.poll() is None
                and (config, credentials) == self.files
                and self.generation == tuple(hashlib.sha256(read_private(f)).hexdigest() for f in self.files)
                and self.socket_identity == self._identity(), 'ap_generation_unproven')

    def request(self, command):
        if self.process is None:
            require(not self.path.exists(), 'unmanaged_ap_socket')
            require(command in ('STATUS', 'DISABLE'), 'ap_daemon_not_started')
            return 'state=DISABLED' if command == 'STATUS' else 'FAIL'
        require(self.process.poll() is None, 'ap_daemon_failed')
        return super().request(command)


class ManagedAP:
    def __init__(self, directory, control, ssid='Mini'):
        self.directory = private_directory(directory)
        self.control = control
        require(all(callable(getattr(control, k, None)) for k in ("claim", "deploy", "verify_loaded", "stop", "radio_config")), "managed_ap_supervisor_required")
        require(type(ssid) is str and 1 <= len(ssid.encode()) <= 32, 'invalid_ssid')
        self.ssid = ssid
        self.path = self.directory / 'clients.json'
        if not self.path.exists():
            write_private(self.path, b'{}')
        self.enabled = False  # Restart never inherits an enabled AP claim.
        self.lock = os.open(control.directory / 'mini-owner.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            claim = control.directory / 'mini-owner.json'
            expected = json.dumps(dict(directory=str(self.directory.resolve()), interface=control.interface), sort_keys=True).encode()
            if claim.exists():
                require(read_private(claim) == expected, 'ap_owner_mismatch')
            else:
                write_private(claim, expected)
            control.claim(self.directory, self.lock)
            self.disable()
        except BaseException:
            os.close(self.lock)
            self.lock = None
            raise

    def _clients(self):
        value = json.loads(read_private(self.path))
        require(type(value) is dict and len(value) <= 64, 'invalid_ap_registry')
        seen = {k: set() for k in ('psk', 'mac', 'ipv4', 'ipv6')}
        for client_id, v in value.items():
            identity(client_id)
            require(type(v) is dict and set(v) == {'binding', 'psk'}, 'invalid_ap_registry')
            b = binding(v['binding'])
            require(b['clientId'] == client_id and b['lanInterface'] == self.control.interface
                    and type(v['psk']) is str and re.fullmatch('[0-9a-f]{64}', v['psk']), 'invalid_ap_registry')
            for k in seen:
                item = v['psk'] if k == 'psk' else b[k]
                require(item not in seen[k], 'duplicate_ap_registry')
                seen[k].add(item)
        return value

    def _psks(self, clients):
        return ''.join(f'{v["binding"]["mac"]} {v["psk"]}\n' for _, v in sorted(clients.items())).encode()

    def config(self):
        # Paths are local configuration, never request-provided nft/shell input.
        for p in (self.directory, self.control.directory):
            require(re.fullmatch(r'/[A-Za-z0-9_./-]+', str(p)), 'invalid_ap_config_path')
        return (f'interface={self.control.interface}\ndriver=nl80211\nssid2={self.ssid.encode().hex()}\n'
                f'ctrl_interface={self.control.directory}\nctrl_interface_group=0\n'
                f'wpa_psk_file={self.directory / "clients.psk"}\n'
                'wpa=2\nwpa_key_mgmt=WPA-PSK\nrsn_pairwise=CCMP\nieee80211w=2\n'
                'ap_isolate=1\nwds_sta=0\nwps_state=0\nstart_disabled=1\n').encode() + self.control.radio_config()

    def disable(self):
        require(self.lock is not None, 'ap_closed')
        self.enabled = False
        self.control.request('DISABLE')
        require(properties(self.control.request('STATUS')).get('state') == 'DISABLED', 'ap_stop_unconfirmed')

    def halt(self):
        """Independent process stop, usable even when the control socket fails."""
        require(self.lock is not None, 'ap_closed')
        self.enabled = False
        self.control.stop()

    def provision(self, client_id, client_binding, psk=None):
        identity(client_id)
        b = binding(client_binding)
        require(b['clientId'] == client_id and b['lanInterface'] == self.control.interface, 'ap_binding_mismatch')
        key = secrets.token_hex(32) if psk is None else psk
        require(type(key) is str and re.fullmatch('[0-9a-f]{64}', key), 'invalid_psk')
        clients = self._clients()
        require(client_id not in clients and len(clients) < 64, 'ap_client_exists_or_limit')
        require(not any(key == v['psk'] or any(b[k] == v['binding'][k] for k in ('mac', 'ipv4', 'ipv6'))
                        for v in clients.values()), 'duplicate_ap_identity_or_key')
        self.disable()
        clients[client_id] = dict(binding=b, psk=key)
        write_private(self.path, json.dumps(clients, sort_keys=True).encode())
        self._deploy(clients)
        return key  # One protected enrollment response; never in snapshots/logs.

    def revoke(self, client_id):
        identity(client_id)
        self.disable()
        clients = self._clients()
        clients.pop(client_id, None)
        write_private(self.path, json.dumps(clients, sort_keys=True).encode())
        self._deploy(clients)

    def _deploy(self, clients):
        self.control.stop()
        write_private(self.directory / 'clients.psk', self._psks(clients))
        write_private(self.directory / 'hostapd.conf', self.config())
        # A fresh foreground child loads exactly these files; RELOAD cannot prove that.
        if clients:
            self.control.deploy(self.directory / 'hostapd.conf', self.directory / 'clients.psk')
        self.disable()

    def enable(self):
        self.disable()
        try:
            clients = self._clients()
            require(bool(clients), 'ap_no_credentials')
            self._deploy(clients)
            require(self.control.request('ENABLE') == 'OK', 'ap_enable_unconfirmed')
            deadline = time.monotonic() + 10
            while True:
                self.control.verify_loaded(self.directory / 'hostapd.conf', self.directory / 'clients.psk')
                state = properties(self.control.request('STATUS')).get('state')
                if state == 'ENABLED':
                    break
                require(state in ('COUNTRY_UPDATE', 'HT_SCAN', 'ACS', 'DFS') and time.monotonic() < deadline, 'ap_enable_not_ready')
                time.sleep(.05)
            self._status()
            self.enabled = True
        except BaseException:
            try:
                self.disable()
            finally:
                self.control.stop()
            raise

    def _status(self):
        self.control.verify_loaded(self.directory / 'hostapd.conf', self.directory / 'clients.psk')
        s = properties(self.control.request('STATUS'))
        require(s.get('state') == 'ENABLED' and s.get('bss[0]') == self.control.interface
                and s.get('ssid[0]') == self.ssid, 'ap_not_ready')
        c = properties(self.control.request('GET_CONFIG'))
        require(c.get('wpa') == '2' and c.get('key_mgmt') == 'WPA-PSK'
                and c.get('rsn_pairwise_cipher') == 'CCMP', 'ap_security_mismatch')

    def authenticated(self, client_id):
        require(self.enabled, 'ap_disabled')
        clients = self._clients()
        require(client_id in clients, 'ap_client_denied')
        require(read_private(self.directory / 'clients.psk') == self._psks(clients)
                and read_private(self.directory / 'hostapd.conf') == self.config(), 'ap_configuration_changed')
        self._status()
        b = clients[client_id]['binding']
        response = self.control.request('STA ' + b['mac'])
        require(bool(response.splitlines()) and response.splitlines()[0] == b['mac'], 'ap_station_missing')
        p = properties(response)
        flags = set(re.findall(r'\[([A-Z0-9_]+)\]', p.get('flags', '')))
        require({'AUTH', 'ASSOC', 'AUTHORIZED', 'MFP'} <= flags, 'ap_station_unauthenticated')
        return dict(b)

    def client_ids(self):
        return sorted(self._clients())

    def shutdown(self):
        if self.lock is not None:
            try:
                try:
                    self.disable()
                finally:
                    self.control.stop()
            finally:
                os.close(self.lock)
                self.lock = None
