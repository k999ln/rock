"""Linux namespace packet gate for the Mini tethering control prototype.

Requires root INSIDE a dedicated Linux test environment. No AP/modem/network
configuration, public IPC, authentication or provider charge guarantee here.
Only a pre-created mini-tether-* namespace is eligible. The owning service must
use this facade for all controller changes, never mutate Controller alongside it.
"""
from datetime import datetime, timezone
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import threading
from functools import wraps

from controller import Controller, Rejected, require, fields, identity, number

TABLE = 'mini_tether'


def binding(value):
    fields(value, 'clientId lanInterface wanInterface mac ipv4 ipv6')
    result = dict(value)
    identity(result['clientId'])
    for key in ('lanInterface', 'wanInterface'):
        require(type(result[key]) is str and re.fullmatch('[a-zA-Z][a-zA-Z0-9_-]{0,14}', result[key]), 'invalid_interface')
    require(result['lanInterface'] != result['wanInterface'], 'same_interface')
    require(type(result['mac']) is str and re.fullmatch('[0-9a-f]{2}(:[0-9a-f]{2}){5}', result['mac']), 'invalid_mac')
    require(int(result['mac'][:2], 16) & 1 == 0 and result['mac'] != '00:00:00:00:00:00', 'invalid_mac')
    for version in (4, 6):
        key = f'ipv{version}'
        require(type(result[key]) is str and '%' not in result[key], 'invalid_address')
        try:
            address = ipaddress.ip_address(result[key])
        except (ValueError, TypeError):
            raise Rejected('invalid_address') from None
        require(address.version == version and not (address.is_multicast or address.is_unspecified or address.is_loopback), 'invalid_address')
        result[key] = str(address)
    return result


def token_name(grant_id):
    identity(grant_id)
    return 'g' + hashlib.sha256(grant_id.encode()).hexdigest()[:32]


def rules_for(grant, client, now):
    """Compile fixed-schema data only. No shell/include/arbitrary nft expressions."""
    b = binding(client)
    require(grant['clientId'] == b['clientId'] and grant['status'] == 'reserved', 'grant_binding')
    number(grant['maxBytes'], 1)
    number(grant['expiresAt'], 1)
    number(now)
    ttl = grant['expiresAt'] - now
    require(1 <= ttl <= 60, 'expired_or_long_grant')
    # Both wall-clock and monotonic kernel set expiry: daemon exit cannot renew.
    until = datetime.fromtimestamp(grant['expiresAt'], timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    name = token_name(grant['grantId'])
    lines = [f'add quota inet {TABLE} {name}q {{ until {grant["maxBytes"]} bytes; }}',
             f'add counter inet {TABLE} {name}tx', f'add counter inet {TABLE} {name}rx']
    for v, family in ((4, 'ip'), (6, 'ip6')):
        addr = b[f'ipv{v}']
        lines.append(f'add set inet {TABLE} {name}v{v} {{ type ipv{v}_addr; flags timeout; elements = {{ {addr} timeout {ttl}s }}; }}')
        for direction in ('tx', 'rx'):
            inbound, outbound = (b['lanInterface'], b['wanInterface']) if direction == 'tx' else (b['wanInterface'], b['lanInterface'])
            endpoint = 'saddr' if direction == 'tx' else 'daddr'
            mac = f'ether saddr {b["mac"]} ' if direction == 'tx' else ''
            lines.append(f'add rule inet {TABLE} forward iifname "{inbound}" oifname "{outbound}" '
                         f'{mac}{family} {endpoint} @{name}v{v} meta time < "{until}" '
                         f'quota name {name}q counter name {name}{direction} accept comment "{name}"')
    return '\n'.join(lines) + '\n'


def operation(method):
    @wraps(method)
    def wrapped(self, *args, **kwargs):
        with self.mutex:
            require(self.lock is not None, 'gate_closed')
            return method(self, *args, **kwargs)
    return wrapped


class LinuxGate:
    def __init__(self, controller, namespace):
        require(sys.platform.startswith('linux') and os.geteuid() == 0, 'linux_root_required')
        require(isinstance(controller, Controller), 'controller_required')
        require(type(namespace) is str and re.fullmatch('mini-tether-[a-z0-9-]{1,32}', namespace), 'dedicated_namespace_required')
        self.mutex = threading.RLock()
        self.controller = controller
        self.namespace = namespace
        self.directory = controller.directory / 'linux-gate'
        require(not self.directory.is_symlink(), 'unsafe_gate_storage')
        self.directory.mkdir(mode=0o700, exist_ok=True)
        require(self.directory.stat().st_uid == os.getuid() and self.directory.stat().st_mode & 0o077 == 0, 'unsafe_gate_storage')
        self.namespace_fd = None
        self.namespace_lock = None
        self.lock = os.open(self.directory / 'lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            shared = Path('/run/mini-tether-gates')
            require(not shared.is_symlink(), 'unsafe_namespace_storage')
            shared.mkdir(mode=0o700, exist_ok=True)
            require(shared.stat().st_uid == 0 and shared.stat().st_mode & 0o077 == 0, 'unsafe_namespace_storage')
            self.namespace_fd = os.open('/run/netns/' + namespace, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
            ns = os.fstat(self.namespace_fd)
            namespace_key = f'{ns.st_dev}-{ns.st_ino}'
            self.namespace_lock = os.open(shared / (namespace_key + '.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            require(os.fstat(self.namespace_lock).st_uid == 0 and os.fstat(self.namespace_lock).st_mode & 0o077 == 0, 'unsafe_namespace_lock')
            fcntl.flock(self.namespace_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            ownership = dict(directory=str(controller.directory.resolve()), device=ns.st_dev, inode=ns.st_ino,
                             policySha256=hashlib.sha256(json.dumps(controller.snapshot(self._now())['policy'], sort_keys=True).encode()).hexdigest())
            owner_path = shared / (namespace_key + '.json')
            if owner_path.exists():
                owner_record = self._read(owner_path)
                require(owner_record.get('binding') == ownership, 'namespace_owner_mismatch')
            else:
                owner_record = dict(binding=ownership, initialized=False)
                self._save(owner_path, owner_record, exclusive=True)
            claim = dict(namespace=namespace, device=ns.st_dev, inode=ns.st_ino)
            path = self.directory / 'namespace.json'
            if path.exists():
                require(self._read(path) == claim, 'namespace_replaced')
            else:
                self._save(path, claim, exclusive=True)
            # Exclusive namespace: an unknown ruleset/offload cannot be adopted.
            items = self._list('ruleset')
            require(not any('flowtable' in x for x in items), 'flowtable_not_supported')
            tables = [x['table'] for x in items if 'table' in x]
            require(all(t['family'] == 'inet' and t['name'] == TABLE for t in tables), 'foreign_ruleset')
            require(owner_record['initialized'] or not tables, 'unowned_existing_table')
            if not tables:
                self._nft(f'add table inet {TABLE}\n' + '\n'.join(
                    f'add chain inet {TABLE} {hook} {{ type filter hook {hook} priority 0; policy drop; }}'
                    for hook in ('input', 'output', 'forward')) + '\n')
            else:
                chains = {x['chain']['name']: x['chain'] for x in items if 'chain' in x}
                require(set(chains) == {'input', 'output', 'forward'}, 'invalid_chains')
                require(all(chains[h].get('policy') == 'drop' and chains[h].get('hook') == h and chains[h].get('type') == 'filter' and chains[h].get('prio') == 0 for h in chains), 'invalid_default_policy')
                require(not any('rule' in x and x['rule'].get('chain') in ('input','output') for x in items), 'unexpected_local_rule')
            # Close kernel path FIRST; a DB failure cannot leave old permits open.
            self._fence()
            if not owner_record['initialized']:
                owner_record['initialized'] = True
                self._save(owner_path, owner_record)
            self.controller.recover(self._revision(), self._now())
        except BaseException:
            if self.namespace_fd is not None:
                os.close(self.namespace_fd)
                self.namespace_fd = None
            if self.namespace_lock is not None:
                os.close(self.namespace_lock)
                self.namespace_lock = None
            os.close(self.lock)
            self.lock = None
            raise

    @staticmethod
    def _now():
        return int(time.time())

    def _revision(self):
        return self.controller.snapshot(self._now())['revision']

    def _nft(self, script=None, args=None):
        require(self.namespace_fd is not None, 'namespace_closed')
        command = ['/usr/bin/nsenter', f'--net=/proc/self/fd/{self.namespace_fd}', '--', '/usr/sbin/nft']
        command += ['-f', '-'] if script is not None else args
        result = subprocess.run(command, input=script, text=True, capture_output=True, timeout=10, pass_fds=(self.namespace_fd, self.lock, self.namespace_lock),
                                env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'TZ': 'UTC', 'LC_ALL': 'C'})
        require(result.returncode == 0, 'nft_failed:' + result.stderr[:400])
        return result.stdout

    def _list(self, target):
        args = ['-j', 'list', 'ruleset'] if target == 'ruleset' else ['-j', 'list', 'table', 'inet', TABLE]
        result = json.loads(self._nft(args=args))
        require(type(result) is dict and type(result.get('nftables')) is list, 'invalid_nft_readback')
        return result['nftables']

    def _read(self, path):
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd) as stream:
            require(os.fstat(stream.fileno()).st_mode & 0o077 == 0, 'unsafe_gate_storage')
            return json.load(stream)

    def _save(self, path, data, exclusive=False):
        content = json.dumps(data, sort_keys=True).encode()
        if exclusive:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
        else:
            tmp = path.with_suffix('.pending')
            fd = os.open(tmp, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(tmp, path)
        fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

    def _records(self):
        return [(p, self._read(p)) for p in self.directory.glob('g*.json')]

    @operation
    def counters(self, grant_id):
        name = token_name(grant_id)
        result = {}
        for item in self._list('table'):
            if 'counter' in item:
                c = item['counter']
                for direction in ('tx', 'rx'):
                    if c['name'] == name + direction:
                        result[direction + 'Bytes'] = number(c['bytes'])
        return dict(grantId=grant_id, countersKnown=len(result) == 2,
                    snapshotFinal=False, **result)

    def _fence(self):
        self._nft(f'flush chain inet {TABLE} forward\n')
        # Keep counters/quotas and all controller reservations. Netlink ack is
        # not promoted into a final in-flight counter/Provider billing receipt.
        for path, record in self._records():
            if record['state'] != 'closed':
                record.update(state='closed', observed=self.counters(record['grantId']))
                self._save(path, record)

    @operation
    def owner_command(self, owner, revision, command):
        current = self.controller.snapshot(self._now())
        require(owner == current['policy']['ownerId'], 'owner_mismatch')
        require(revision == current['revision'], 'revision_conflict')
        self._fence()
        return self.controller.owner_command(owner, revision, command, self._now())

    @operation
    def observe(self, revision, observation):
        self._fence()
        return self.controller.observe(revision, observation, self._now())

    @operation
    def attachment(self, revision, dock_id):
        self._fence()
        return self.controller.attachment(revision, dock_id, self._now())

    @operation
    def open(self, revision, grant_id, client, max_bytes):
        b = binding(client)
        # One outstanding token per client, including unknown install outcomes.
        records = self._records()
        require(not any(r['clientId'] == b['clientId'] and r['state'] != 'closed' for _, r in records), 'client_token_active')
        now = self._now()
        reserved = self.controller.reserve(revision, grant_id, b['clientId'], max_bytes, now)
        require(reserved['result']['installAllowed'], 'grant_replay_not_installable')
        grant = reserved['result']['grant']
        script = rules_for(grant, b, self._now())
        require(self.controller.can_forward(grant_id, self._now()), 'grant_no_longer_valid')
        path = self.directory / (token_name(grant_id) + '.json')
        record = dict(grantId=grant_id, clientId=b['clientId'], binding=b, state='attempted')
        # Durable attempt BEFORE packet effects. Failure retains reservation and
        # prevents any replay under the same grant even after process restart.
        self._save(path, record, exclusive=True)
        try:
            self._nft(script)
            items = self._list('table')
            name = token_name(grant_id)
            quotas = [x['quota'] for x in items if 'quota' in x and x['quota']['name'] == name + 'q']
            rules = [x['rule'] for x in items if 'rule' in x and x['rule'].get('comment') == name]
            require(len(quotas) == 1 and quotas[0]['bytes'] == max_bytes and not quotas[0]['inv'] and len(rules) == 4, 'install_readback_mismatch')
            require(self.controller.can_forward(grant_id, self._now()), 'grant_expired_during_install')
            record['state'] = 'installed'
            self._save(path, record)
        except BaseException:
            # Best-effort fence; if nft is unavailable, kernel byte+time limits
            # remain. Never claim stop confirmed or release the reservation.
            try:
                self._fence()
            except BaseException:
                pass
            raise
        return dict(grantId=grant_id, epoch=grant['epoch'], expiresAt=grant['expiresAt'],
                    maxBytes=max_bytes, kernelInstalled=True, physicalAccepted=False)

    @operation
    def close(self, grant_id):
        name = token_name(grant_id)
        path = self.directory / (name + '.json')
        record = self._read(path)
        handles = [number(x['rule']['handle'], 1) for x in self._list('table')
                   if 'rule' in x and x['rule'].get('comment') == name]
        if handles:
            self._nft(''.join(f'delete rule inet {TABLE} forward handle {h}\n' for h in handles))
        record.update(state='closed', observed=self.counters(grant_id))
        self._save(path, record)
        return dict(forwardRulesRemoved=True, reservationRetained=True, **record['observed'])

    def shutdown(self):
        with self.mutex:
            self._shutdown_locked()

    def _shutdown_locked(self):
        if self.lock is not None:
            try:
                self._fence()
                self.controller.recover(self._revision(), self._now())
            finally:
                os.close(self.lock)
                self.lock = None
                if self.namespace_fd is not None:
                    os.close(self.namespace_fd)
                    self.namespace_fd = None
                if self.namespace_lock is not None:
                    os.close(self.namespace_lock)
                    self.namespace_lock = None
