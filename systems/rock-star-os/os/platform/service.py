#!/usr/bin/env python3
"""Rock OS local platform and separately owned Wallet simulator IPC services.

No HTTP listener, arbitrary command, caller-selected path, or real-money adapter.
The native OS UI authenticates by Linux peer credentials on a filesystem socket.
"""
from __future__ import annotations

import argparse
from contextlib import closing
import ctypes
import fcntl
import json
import os
from pathlib import Path
import signal
import socket
import socketserver
import sqlite3
import stat
import struct
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
# Source-tree tests use the same modules that install-target copies into ROOT.
if not (ROOT / 'blackberryrock').is_dir():
    sys.path.insert(0, str(ROOT.parent.parent / 'src'))
    sys.path.insert(0, str(ROOT.parent))
from blackberryrock.hub import Hub
from blackberryrock.packages import CURRENT_PROFILE, MAX_PACKAGE_BYTES, PUBLIC_TEST_KEY, TEST_PUBLISHER, PackageError, canonical, compatibility_status, verify_package
from blackberryrock.wallet import Wallet
from registry_control import RegistryControl
from runner_control import RunnerControl
from operations.device import DeviceActivation
from wallet_view import WalletView
from wallet_backend.client import READS as WALLET_READS

MAX_REQUEST = 256 * 1024
MAX_RESPONSE = 1024 * 1024
PLATFORM_UID, WALLET_UID, UI_UID = 1002, 1003, 1000
PLATFORM_SOCKET = '/run/rock-platform/api.sock'
WALLET_SOCKET = '/run/rock-wallet/api.sock'
POWER_SOCKET = '/run/rock-system/power.sock'


def peer_uid(connection):
    return struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))[1]


def decode(data):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('duplicate JSON field')
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=pairs,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError('non-finite JSON')))


def bounded_records(items, count, byte_budget):
    """Budget encoded JSON, including worst-case escaping, not raw text bytes."""
    result, used = [], 2
    for item in items[:count]:
        size = len(canonical(item)) + 1
        if used + size > byte_budget:
            break
        result.append(item)
        used += size
    return result


def wallet_summary(snapshot):
    snapshot['history_truncated'] = {}
    snapshot['record_counts'] = {}
    for key in ('sales', 'withdrawals', 'bills', 'journals'):
        total = len(snapshot[key])
        snapshot[key] = bounded_records(snapshot[key], 50, 32768)
        snapshot['record_counts'][key] = total
        snapshot['history_truncated'][key] = total > len(snapshot[key])
    return snapshot


class ServiceUnavailable(Exception):
    """An accepted operation may exist; retain the exact request key."""


def read_frame(connection, limit, timeout=5):
    data = bytearray()
    deadline = time.monotonic() + timeout
    while b'\n' not in data:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('request deadline exceeded')
        connection.settimeout(remaining)
        piece = connection.recv(min(16384, limit + 1 - len(data)))
        if not piece:
            raise ValueError('incomplete JSON frame')
        data.extend(piece)
        if len(data) > limit:
            raise ValueError('JSON frame exceeds limit')
    line, tail = bytes(data).split(b'\n', 1)
    if tail.strip():
        raise ValueError('one request per connection')
    return decode(line)


def call(path, payload, expected_uid, *, timeout=6, response_timeout=5, return_errors=False):
    frame = canonical(payload) + b'\n'
    if len(frame) > MAX_REQUEST:
        raise ValueError('request exceeds limit')
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        deadline = time.monotonic() + timeout
        connection.settimeout(timeout)
        connection.connect(str(path))
        if peer_uid(connection) != expected_uid:
            raise PermissionError('unexpected service identity')
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('service request deadline exceeded')
        connection.settimeout(remaining)
        connection.sendall(frame)
        response = read_frame(connection, MAX_RESPONSE, timeout=min(response_timeout,deadline-time.monotonic()))
    if not isinstance(response, dict) or type(response.get('ok')) is not bool:
        raise ValueError('invalid service response')
    if not response['ok'] and not return_errors:
        raise ValueError(response.get('error', 'service rejected request'))
    return response


class DeviceHub(Hub):
    def worker_command(self):
        return ['/usr/libexec/rock-sandbox-exec', 'recipe']

    def actual_host(self):
        return 'rock_os_linux_namespace'

    def state(self):
        result = super().state()
        result.update(maturity='virtual_os_integrated', execution_host='この端末のOS',
                      modes={'device_local': 'linux_namespace_seccomp',
                             'cloud': 'unavailable', 'pc_usb': 'not_verified'})
        return result


class Platform:
    def __init__(self, state, registry, wallet_socket=WALLET_SOCKET, wallet_uid=WALLET_UID,
                 remote_registry=None, start_registry=True, remote_clients=None, start_runner=True,
                 service_status=None, async_wallet_view=False, mcp_client=None, mcp_status=None):
        if type(async_wallet_view) is not bool:
            raise ValueError('asynchronous Wallet view opt-in must be boolean')
        self.hub = DeviceHub(Path(state) / 'hub.db', {TEST_PUBLISHER: PUBLIC_TEST_KEY})
        self.registry = Path(registry)
        self.wallet_socket, self.wallet_uid = wallet_socket, wallet_uid
        self.catalog_lock = threading.RLock()
        self.catalog_cache = None
        self.readiness_lock = threading.Lock()
        self.readiness = None
        self.service_status = dict(service_status or {'mode': 'development-fixture', 'state': 'configured',
                                                     'simulation_only': True})
        self.remote_registry = remote_registry
        self.mcp_client = mcp_client
        self.mcp_status = dict(mcp_status or {'configured': mcp_client is not None,
            'state': 'configured' if mcp_client is not None else 'unconfigured', 'simulation_only': True})
        self.store = RegistryControl(self.hub, remote_registry, start=start_registry) if remote_registry is not None else None
        # Lost closed configuration is an endpoint outage, not revocation of the
        # user's pending consent. Retain readable remote receipts/input without
        # starting a worker that would misclassify missing clients as rejection.
        runner_available = not (self.service_status.get('mode') == 'purchaser-fixture'
                                and self.service_status.get('state') != 'configured')
        self.runner = (RunnerControl(self.hub, Path(state) / 'remote', registry_control=self.store,
                                     clients=remote_clients, start=start_runner and runner_available)
                       if remote_clients is not None else None)
        self.wallet_view = (WalletView(self._read_wallet_snapshot)
                            if async_wallet_view and self.service_status.get('mode') == 'purchaser-fixture' else None)
        self.activation = DeviceActivation(Path(state) / 'activation', wallet_snapshot=self.wallet_snapshot)

    def _read_wallet_snapshot(self):
        reply = call(self.wallet_socket, {'v':1,'op':'snapshot'}, self.wallet_uid, return_errors=True)
        return reply.get('snapshot') if reply['ok'] else None

    def wallet_snapshot(self):
        if self.wallet_view is not None:
            return self.wallet_view.snapshot()
        try:
            return self._read_wallet_snapshot()
        except (OSError, ValueError, ServiceUnavailable):
            return None

    def close(self):
        # No background reader can survive a successful service close.
        try:
            if self.wallet_view is not None:
                self.wallet_view.close()
        finally:
            try:
                if self.runner is not None:
                    self.runner.close()
            finally:
                if self.store is not None:
                    self.store.close()

    def catalog(self):
        # The initial embedded catalog is immutable. Downloaded catalog support
        # must also verify each signed package before adding it to this cache.
        with self.catalog_lock:
            if self.catalog_cache is None:
                items, rejected = [], 0
                for path in sorted(self.registry.glob('*.rock.json'))[:100]:
                    try:
                        info = path.lstat()
                        if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_PACKAGE_BYTES:
                            raise PackageError('invalid registry file')
                        package = decode(path.read_bytes())
                        # Integrity and current eligibility are separate. A valid
                        # revoked package must not make the OS health check fail.
                        manifest, sha = verify_package(package, self.hub.trust)
                        items.append({'manifest': manifest, 'hash': sha, 'size': info.st_size,
                                      'filename': path.name, 'source': 'embedded', 'package': package})
                    except (OSError, ValueError, TypeError, RecursionError):
                        rejected += 1
                self.catalog_cache = (items, rejected)
            return self.catalog_cache

    def available_catalog(self):
        embedded, rejected = self.catalog()
        with self.hub.connect() as connection:
            revoked = {row[0] for row in connection.execute('SELECT subject FROM hub_revoked')}
        def allowed(item):
            manifest = item['manifest']
            return manifest['publisher'] not in revoked and f"{manifest['id']}@{manifest['version']}" not in revoked
        items = {(x['manifest']['id'], x['manifest']['version']): x for x in embedded if allowed(x)}
        if self.remote_registry is not None:
            for item in self.remote_registry.catalog():
                identity = (item['manifest']['id'], item['manifest']['version'])
                if not allowed(item):
                    continue
                if identity in items:
                    if items[identity]['hash'] != item['hash']:
                        rejected += 1
                    continue
                items[identity] = item
        return [dict(item, compatibility=compatibility_status(item['manifest']))
                for item in items.values()], rejected

    def snapshot(self):
        items, rejected = self.available_catalog()
        wallet = self.wallet_snapshot()
        # An unreachable financial backend must not take offline local Tools
        # away from their owner. Missing Wallet data is explicit, never zero.

        hub = self.hub.state()
        hub['total_installed'] = len(hub['installed'])
        for installed in hub['installed'][:100]:
            installed['compatibility'] = compatibility_status(installed['manifest'])
        hub['installed'] = bounded_records(hub['installed'], 100, 192 * 1024)
        hub['installed_truncated'] = hub['total_installed'] > len(hub['installed'])
        with self.hub.connect() as c:
            hub['total_jobs'] = c.execute('SELECT COUNT(*) FROM hub_jobs').fetchone()[0]
        hub['jobs'] = hub['jobs'][:32]
        hub['jobs_truncated'] = hub['total_jobs'] > len(hub['jobs'])
        for job in hub['jobs']:
            if isinstance(job.get('output'), str):
                encoded = job['output'].encode()
                job['output_bytes'] = len(encoded)
                job['output_truncated'] = len(encoded) > 16384
                job['output'] = encoded[:16384].decode('utf-8', errors='ignore')
        hub['jobs'] = bounded_records(hub['jobs'], 32, 320 * 1024)
        hub['jobs_truncated'] = hub['total_jobs'] > len(hub['jobs'])
        audit_total = len(hub['audit'])
        hub['audit'] = bounded_records(hub['audit'], 50, 48 * 1024)
        hub['audit_truncated'] = audit_total > len(hub['audit'])
        hub['revoked'] = bounded_records(hub['revoked'], 128, 24 * 1024)
        catalog = bounded_records([{k: v for k, v in item.items() if k != 'package'} for item in items], 30, 192 * 1024)
        remote = self.runner.snapshot(byte_budget=32 * 1024) if self.runner is not None else {
            'configured': False, 'destinations': [
                {'target': target, 'available': False, 'endpoint_id': None,
                 'transport_evidence': None, 'physical_usb': 'NOT_RUN'} for target in ('cloud', 'pc_usb')],
            'history': [], 'total_history': 0, 'history_truncated': False,
            'worker_alive': False, 'worker_error': None, 'simulation_only': True}
        for destination in remote['destinations']:
            if destination['available']:
                hub['modes'][destination['target']] = 'configured_development_runner'
        registry_view = self.store.snapshot() if self.store else {
            'configured': False, 'can_refresh': False, 'status': 'embedded',
            'source_label': '内蔵カタログ・配信元未設定',
            'last_checked_unix': None, 'last_error': None, 'revision': None,
            'issued_at': None, 'expires_at': None, 'fresh': False, 'count': 0}
        if self.service_status['mode'] == 'purchaser-fixture':
            registry_view['source_label'] = ('購入者限定の開発ストア' if self.store else '購入者サービス・設定要確認')
            if self.service_status['state'] != 'configured':
                registry_view['last_error'] = self.service_status['message']
        return {'catalog': catalog, 'catalog_truncated': len(items) > len(catalog), 'total_catalog': len(items),
                'catalog_rejected': rejected, 'hub': hub, 'wallet': wallet,
                'remote': remote, 'service_access': self.purchaser_service_view(wallet),
                # This is protected local configuration, not current eligibility.
                # The separate MCP page requests live status; ordinary Hub and
                # offline local Tools never wait for the network here.
                'mcp': dict(self.mcp_status),
                'device_activation': self.activation.snapshot(wallet=wallet),
                'registry': registry_view,
                'device': {'name': 'Rock star os', 'version': CURRENT_PROFILE['os_version'], 'execution': 'device_local',
                           'sandbox': 'Linux namespaces + seccomp; finite text recipes',
                           'hardware': 'QEMU ARM64 development board',
                           'blackberry_verified': False, 'registry': 'signed_https_development_registry' if self.store else 'embedded_development_catalog'}}

    def purchaser_service_view(self, wallet):
        view = dict(self.service_status)
        if view.get('mode') != 'purchaser-fixture':
            return view
        view.update(fresh=False, current=None)
        if view.get('state') != 'configured' or not isinstance(wallet, dict):
            return view
        from service_access.status import validate
        try:
            # Match both locally provisioned endpoints to the same scoped
            # Wallet response. A saved balance or old PAID status is not a grant.
            status = validate(wallet.get('service_access'), authority_id=view['authority_id'],
                              device_ref=view['device_ref'], consumer_id=view['consumer_id'])
            backend = wallet.get('backend')
            if (isinstance(backend, dict) and backend.get('connected') is True and
                    backend.get('stale') is False and backend.get('pending_reconciliation') is False):
                view.update(fresh=True, current=status)
        except (ValueError, TypeError, KeyError):
            pass
        return view

    def verify_readiness(self):
        with self.readiness_lock:
            # resolve() checked the protected image configuration against the
            # retained private binding when this daemon started. A bad update
            # may still serve local Tools/history, but must not be marked good.
            # This is local configuration integrity, never network reachability,
            # membership payment, or current purchase eligibility.
            if (self.service_status.get('mode') not in ('development-fixture', 'purchaser-fixture')
                    or self.service_status.get('state') != 'configured'):
                raise ValueError('local purchaser service configuration or retained binding is unavailable')
            if self.readiness is None:
                try:
                    items, rejected = self.catalog()
                    if not items or rejected:
                        raise RuntimeError('embedded signed catalog failed validation')
                    diagnostic = subprocess.run(['/usr/libexec/rock-sandbox-exec', 'probe'],
                                                capture_output=True, timeout=8)
                    result = decode(diagnostic.stdout) if diagnostic.stdout else {}
                    print('ROCK_SANDBOX_STARTUP_CHECK ' + json.dumps({'exit': diagnostic.returncode, 'result': result,
                          'stderr': diagnostic.stderr.decode(errors='replace')[:1000]}), flush=True)
                    if diagnostic.returncode or result.get('ok') is not True:
                        raise RuntimeError('OS sandbox startup diagnostic failed')
                    probe = {'text': '  Rock  ', 'recipe': [{'op': 'trim_lines'}]}
                    executed = subprocess.run(['/usr/libexec/rock-sandbox-exec', 'recipe'],
                                              input=canonical(probe), capture_output=True, timeout=8)
                    if executed.returncode or decode(executed.stdout) != {'text': 'Rock'}:
                        raise RuntimeError('OS isolated recipe startup roundtrip failed')
                    self.readiness = {'ready': True, 'sandbox_verified': True, 'catalog_verified': True}
                except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
                    self.readiness = {'ready': False, 'error': str(error)}
            if not self.readiness['ready']:
                raise ValueError(self.readiness['error'])
            return dict(self.readiness)

    def dispatch(self, request, *, peer_uid=None):
        op = request['op']
        if isinstance(op,str) and op.startswith('device.activation.'):
            return self.activation.dispatch(request, peer_uid=peer_uid)
        if isinstance(op, str) and op.startswith('atm.'):
            raise PermissionError('ATM assertions require the root Wallet socket, never the owner channel')
        if isinstance(op, str) and op.startswith('mcp.'):
            if peer_uid != UI_UID:
                raise PermissionError('MCP Hub requests require the OS owner channel')
            if self.mcp_client is None:
                raise ServiceUnavailable('MCP接続の設定を確認してください。端末内の道具は利用できます。')
            # No Hub lock or reusable cached PAID grant around this network call.
            return {'ok': True, 'result': self.mcp_client.request(request)}
        if isinstance(op, str) and op.startswith('remote.'):
            if self.runner is None:
                raise ValueError('remote execution is not configured; no automatic fallback')
            return self.runner.dispatch(request)
        if op == 'snapshot':
            return {'ok': True, 'snapshot': self.snapshot()}
        if op == 'health':
            self.hub.state()
            call(self.wallet_socket, {'v': 1, 'op': 'health'}, self.wallet_uid)
            return {'ok': True, 'result': {**self.verify_readiness(), 'uid': os.geteuid()}}
        if op == 'job.result':
            return {'ok': True, 'result': self.hub.job(request['id'])}
        if op in ('device.poweroff', 'device.reboot'):
            if set(request) != {'v', 'op', 'key'}:
                raise ValueError('power actions accept only the protocol version, operation and request key')
            try:
                return call(POWER_SOCKET, {'v':1, 'op':op.split('.')[1], 'key':request['key']}, 0,
                            timeout=12,response_timeout=12,return_errors=True)
            except PermissionError:
                raise
            except (OSError,ValueError) as error:
                # Lost/malformed transport replies cannot prove rejection. The
                # root daemon may already have persisted this exact request.
                raise ServiceUnavailable('power response unresolved; retry with the same key') from error
        if op.startswith('wallet.'):
            invalidate = True
            try:
                reply = call(self.wallet_socket, request, self.wallet_uid, return_errors=True)
                invalidate = op not in WALLET_READS or reply.get('ok') is not True
                return reply
            except PermissionError:
                raise
            except (OSError, ValueError) as error:
                # A lost/malformed reply may follow a Wallet commit. Preserve
                # unavailable instead of falsely classifying it as rejection.
                raise ServiceUnavailable('Wallet response unresolved; retry with the same key') from error
            finally:
                # Even an unresolved reply may follow an actual mutation. A
                # concurrent older read must not restore a fresh pre-action view.
                if self.wallet_view is not None and invalidate:
                    self.wallet_view.invalidate()
        def mutate():
            if op == 'registry.refresh':
                if self.store is None:
                    raise ValueError('no store is provisioned on this OS')
                return self.store.enqueue(request['key'])
            if op in ('install', 'update'):
                items, _ = self.available_catalog()
                item = next((x for x in items if x['manifest']['id'] == request['id']
                             and x['manifest']['version'] == request['version']), None)
                if item is None:
                    raise PackageError('catalog package not found')
                package = item.get('package')
                if package is None:
                    package = self.remote_registry.download(request['id'], request['version'])
                return self.hub.install(package)
            if op == 'approve':
                self.hub.enable(request['id'], request['approved_hash'])
                return {'id': request['id'], 'enabled': True}
            if op in ('rollback', 'uninstall', 'disable'):
                self.hub.lifecycle(request['id'], op, request.get('version'))
                return {'id': request['id'], 'action': op}
            if op == 'run':
                return self.hub.run(request['id'], request['text'], request['key'], request.get('target', 'device_local'))
            if op == 'cancel':
                return self.hub.cancel(request['id'])
            raise ValueError('unsupported operation')
        # The store's commit guard uses this same lock. A received revocation
        # and a new Tool admission cannot pass each other unnoticed. This also
        # fails closed if an earlier cache write only partially acknowledged.
        with self.hub.lock:
            if self.store is not None:
                self.store.sync_revocations()
            result = self.hub.request(request['key'], request, mutate)
        if op == 'registry.refresh':
            self.store.start()
        return {'ok': True, 'result': result}


class WalletService:
    def __init__(self, state, *, provisioning_file=None, start_scheduler=True, clock=None, contract_devices=False,
                 authentication_required=True, authority_id=None, max_automatic_failures=3,
                 managed_write_hooks=None, write_admission=None):
        if type(authentication_required) is not bool:
            raise ValueError('explicit Wallet authentication mode must be boolean')
        if (managed_write_hooks is None) != (write_admission is None):
            raise ValueError('managed Wallet requires its hooks and admission together')
        if managed_write_hooks is not None:
            if not authentication_required:
                raise ValueError('managed Wallet authentication cannot be disabled')
            managed_write_hooks.require_held()
        from entitlement.device import DeviceWalletAdapter
        self._managed_write_hooks = managed_write_hooks
        self.membership = None
        options = {'managed_write_hooks': managed_write_hooks} if managed_write_hooks is not None else {}
        try:
            self.wallet = Wallet(Path(state) / 'wallet-simulator.db', **options)
            if not authentication_required:
                with closing(self.wallet._connect()) as db:
                    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wallet_auth_mode'").fetchone():
                        raise ValueError('an authenticated Wallet cannot downgrade to a legacy fixture')
            self.membership = DeviceWalletAdapter(state, self.wallet, provisioning_file=provisioning_file,
                                                  start_scheduler=False, clock=clock,
                                                  max_automatic_failures=max_automatic_failures,
                                                  managed_write_hooks=managed_write_hooks, write_admission=write_admission)
            from atm import CardlessATMSimulator
            self.atm = CardlessATMSimulator(self.wallet, clock=clock if clock is not None else time.time,
                                          device_authorizer=self.membership.authorize_atm_device if contract_devices else None)
            self.authentication = None
            if authentication_required:
                from wallet_auth.service import WalletAuthorization
                self.authentication = WalletAuthorization(self.wallet, self.atm, authority_id=authority_id,
                                                           clock=clock if clock is not None else time.time)
                self.membership.authentication = self.authentication
                self.atm.redemption_authorizer = self._authorize_redemption
                self.wallet.new_bill_authorizer = self._authorize_new_bill
            if start_scheduler:
                self.membership.start()

        except BaseException:
            if self.membership is not None:
                self.membership.close()
                thread = self.membership.thread
                if thread is not None and thread.is_alive():
                    raise RuntimeError('partial Wallet scheduler still owns its state')
            raise

    def _authorize_redemption(self, account_id, device_ref, withdrawal_id):
        return (self.membership.authorize_credential_origin(account_id, device_ref) and
                self.authentication.credential_for_redemption(account_id, device_ref, withdrawal_id))

    def _authorize_new_bill(self):
        # WalletBridge already holds the entitlement Store lock through the
        # actual Wallet bill. Wallet.bill invokes this under its writer lock.
        from entitlement.protocol import NotEligible
        try:
            self.membership._billing_eligible()
            return True
        except NotEligible:
            return False

    def _membership_view(self):
        result = self.membership.membership()
        result['authentication_required'] = self.authentication is not None
        if self.authentication is not None:
            if result['registered']:
                with self.membership.atm_guard('wallet.auth.status', peer_uid=1002) as context:
                    result['authentication'] = self.authentication.status(context)
            else:
                result['authentication'] = {'simulation_only': True, 'active': False,
                                             'activation_state': result['registration_status']}
        return result

    def dispatch(self, request, *, peer_uid=None):
        if self._managed_write_hooks is not None:
            self._managed_write_hooks.require_held()
        self.membership._peer(peer_uid)
        if not isinstance(request, dict) or type(request.get('v')) is not int or request['v'] != 1:
            raise ValueError('Wallet protocol version 1 is required')
        op, w = request['op'], self.wallet
        if op == 'snapshot':
            with self.membership.snapshot_guard(peer_uid=peer_uid):
                state = wallet_summary(w.snapshot())
                state['membership'] = self._membership_view()
                if self.authentication is not None:
                    state['auth'] = state['membership']['authentication']
                state['billing'] = self.membership.billing_status()
            return {'ok': True, 'snapshot': state}
        if op == 'health':
            w.snapshot()
            return {'ok': True, 'result': {'ready': True, 'simulation_only': True}}
        if op == 'wallet.membership':
            if set(request) != {'v', 'op'}:
                raise ValueError('unexpected membership fields')
            with self.membership.snapshot_guard(peer_uid=peer_uid):
                return {'ok': True, 'result': self._membership_view()}
        if op in ('wallet.register', 'wallet.consent', 'wallet.bill', 'wallet.billing.status'):
            if self.authentication is not None and op == 'wallet.consent' and request.get('accepted') is True:
                with self.membership.atm_guard('wallet.auth.status', peer_uid=peer_uid) as context:
                    self.authentication.require_active(context)
            return self.membership.dispatch(request, peer_uid=peer_uid)
        auth_ops = ('wallet.auth.begin', 'wallet.auth.enroll', 'wallet.auth.status', 'wallet.terms',
                    'wallet.atm.quote', 'wallet.atm.quote.cancel')
        if op in auth_ops or op == 'wallet.atm.issue' and self.authentication is not None:
            if self.authentication is None:
                raise PermissionError('authentication operations are unavailable in the legacy test fixture')
            with self.membership.atm_guard(op, peer_uid=peer_uid) as context:
                return self.authentication.dispatch(request, context=context,
                    handoff_ref=self.membership.handoff_reference(context.device_id))
        if isinstance(op, str) and op.startswith('wallet.atm.'):
            # The adapter validates the exact owner operation and keeps the
            # protected membership lock through credential + ledger commit.
            with self.membership.atm_guard(op, peer_uid=peer_uid) as context:
                return self.atm.dispatch({**request, 'op': op.removeprefix('wallet.')}, context=context)
        if isinstance(op, str) and op.startswith('atm.'):
            if peer_uid != 0 or op not in ('atm.redeem', 'atm.dispense', 'atm.reconcile'):
                raise PermissionError('ATM assertions require the root Wallet socket')
            from atm import ATMActor, PUBLIC_ATM_FIXTURES
            # This intentionally public fixture is fixed in OS code. Neither
            # actor nor token can be chosen by request fields or the UI.
            actor = ATMActor(*PUBLIC_ATM_FIXTURES['SIM-ATM-001'])
            with self.membership.snapshot_guard(peer_uid=peer_uid):
                return self.atm.dispatch(request, actor=actor)
        key = request['key']
        if op == 'wallet.reserve' and self.authentication is not None:
            raise PermissionError('a confirmed quote and verified authenticator assertion are required')
        operation_fields = {
            'wallet.sale': {'amount_minor'}, 'wallet.settle': {'id'},
            'wallet.reserve': {'amount_minor'}, 'wallet.dispense': {'id', 'dispensed_minor'},
            'wallet.unknown': {'id'}, 'wallet.reconcile': {'id', 'total_dispensed_minor'},
        }
        if op not in operation_fields or set(request) != {'v', 'op', 'key'} | operation_fields[op]:
            raise ValueError('missing or unsupported Wallet fields')
        # The same adapter lock protects membership changes and the associated
        # existing ledger operation. No direct monthly billing path remains.
        with self.membership.admission_guard(op, peer_uid=peer_uid):
            if op == 'wallet.sale' and self.authentication is not None:
                with self.membership.atm_guard('wallet.auth.status', peer_uid=peer_uid) as context:
                    self.authentication.require_active(context)
            if op in ('wallet.dispense', 'wallet.unknown', 'wallet.reconcile'):
                # Every ATM mutation holds this same adapter lock, so an
                # owner cannot check then race into a legacy resolution path.
                with closing(w._connect()) as connection:
                    credential = connection.execute('SELECT 1 FROM atm_credentials WHERE withdrawal_id=?',
                                                    (request['id'],)).fetchone()
                if credential is not None:
                    raise PermissionError('cardless credential requires its scoped ATM API')
            if op == 'wallet.sale':
                result = w.simulate_sale(request['amount_minor'], key)
            elif op == 'wallet.settle':
                result = w.settle_sale(request['id'], key)
            elif op == 'wallet.reserve':
                result = w.reserve(request['amount_minor'], key)
            elif op == 'wallet.dispense':
                result = w.dispense(request['id'], request['dispensed_minor'], key)
            elif op == 'wallet.unknown':
                result = w.mark_unknown(request['id'], key)
            elif op == 'wallet.reconcile':
                result = w.reconcile(request['id'], request['total_dispensed_minor'], key)
            else:
                raise ValueError('unsupported Wallet simulator operation')
        return {'ok': True, 'result': result}

    def close(self):
        self.membership.close()


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        try:
            authenticated_uid = peer_uid(self.request)
            if authenticated_uid not in self.server.allowed_uids:
                raise PermissionError('OS identity is not authorized')
            request = read_frame(self.request, MAX_REQUEST)
            if not isinstance(request, dict) or type(request.get('v')) is not int or request['v'] != 1:
                raise ValueError('protocol version 1 required')
            if not isinstance(request.get('op'), str) or len(request['op']) > 40:
                raise ValueError('valid operation required')
            response = self.server.service.dispatch(request, peer_uid=authenticated_uid)
        except PermissionError as error:
            response = {'ok': False, 'code': 'unauthorized', 'error': str(error)}
        except ServiceUnavailable as error:
            response = {'ok':False,'code':'unavailable','error':str(error)}
        except (ValueError, KeyError, TypeError, RecursionError, TimeoutError) as error:
            response = {'ok': False, 'code': 'rejected', 'error': str(error)[:300]}
        except (OSError, sqlite3.Error):
            response = {'ok': False, 'code': 'unavailable', 'error': 'OS service or storage unavailable; retry with the same key'}
        data = canonical(response) + b'\n'
        if len(data) > MAX_RESPONSE:
            data = canonical({'ok': False, 'code': 'response_limit', 'error': 'response exceeds limit'}) + b'\n'
        try:
            self.request.settimeout(3)
            self.request.sendall(data)
        except OSError:
            pass  # The durable receipt remains available to the identical retry.


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    request_queue_size = 16

    def __init__(self, path, service, allowed_uids, group):
        self.service, self.allowed_uids = service, set(allowed_uids)
        self.slots = threading.BoundedSemaphore(12)
        self.lockfile = open(str(path) + '.lock', 'a+b')
        fcntl.flock(self.lockfile.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        p = Path(path)
        try:
            info = p.lstat()
            if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.geteuid():
                raise PermissionError('unexpected existing socket path')
            p.unlink()
        except FileNotFoundError:
            pass
        super().__init__(str(path), Handler)
        os.chown(path, -1, group)
        os.chmod(path, 0o660)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


def device_wallet_service(wallet_state, backend_config, *, provisioning_file=None):
    """Choose a new device profile without silently changing an existing authority."""
    state, config = Path(wallet_state), Path(backend_config)
    if config.exists() or config.is_symlink():
        from wallet_backend.client import configured_service
        return configured_service(config, state)
    remote_cache = state / 'backend-cache'
    if remote_cache.exists() or remote_cache.is_symlink():
        raise ValueError('remote Wallet configuration is missing; restore the pinned configuration before starting Wallet')
    return WalletService(state, provisioning_file=provisioning_file)


def platform_clients(state, config_file, ca_file):
    from service_access.os_client import clients, resolve
    profile = resolve(state, config_file)
    if not profile.legacy_development:
        try:
            registry, remote = clients(profile, state, ca_file)
            return registry, remote, profile.status
        except (ValueError, OSError):
            return None, {}, {**profile.status, 'state': 'unavailable',
                              'message': '購入者サービスに接続できません。端末内の道具と履歴は利用できます。'}
    from registry.client import RegistryClient
    from runner.client import RunnerClient
    from runner.protocol import PUBLIC_ALICE_TOKEN
    from runner.transport import HTTPSRunnerTransport
    registry = RegistryClient('https://10.0.2.2:9443', ca_file, Path(state) / 'registry-cache',
                              timeout=5, attempts=2)
    cloud = RunnerClient(HTTPSRunnerTransport('https://10.0.2.2:9444', ca_file, timeout=3),
                         endpoint_id='runner-linux-cloud', owner='alice', token=PUBLIC_ALICE_TOKEN,
                         attempts=2, publisher_trust={TEST_PUBLISHER: PUBLIC_TEST_KEY})
    return registry, {'cloud': cloud}, profile.status


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--role', choices=['platform', 'wallet'], required=True)
    args = parser.parse_args()
    uid = PLATFORM_UID if args.role == 'platform' else WALLET_UID
    if os.getuid() != uid or os.geteuid() != uid:
        raise SystemExit('service must run under its dedicated OS identity')
    os.umask(0o077)
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(38, 1, 0, 0, 0) != 0 or libc.prctl(4, 0, 0, 0, 0) != 0:
        raise SystemExit('cannot establish no_new_privs / non-dumpable process')
    if args.role == 'platform':
        remote_registry, remote_clients, service_status = platform_clients(
            '/data/platform', '/etc/rock-platform/service-access.json', '/usr/share/rock/development-store-ca.pem')
        from service_access.os_client import resolve as resolve_services
        from mcp_broker.device_client import resolve as resolve_mcp
        mcp_client, mcp_status = resolve_mcp('/data/platform',
            resolve_services('/data/platform', '/etc/rock-platform/service-access.json'),
            '/etc/rock-platform/mcp-services.json', '/usr/share/rock/development-store-ca.pem')
        service = Platform('/data/platform', '/usr/share/rock/registry', remote_registry=remote_registry,
                           remote_clients=remote_clients, service_status=service_status, async_wallet_view=True,
                           mcp_client=mcp_client, mcp_status=mcp_status)
        server = Server(PLATFORM_SOCKET, service, {0, UI_UID}, UI_UID)
    else:
        service = device_wallet_service('/data/wallet', '/etc/rock-wallet/backend.json',
                                        provisioning_file='/usr/share/rock/development-device-handoff.json')
        server = Server(WALLET_SOCKET, service, {0, PLATFORM_UID}, PLATFORM_UID)
    def terminate(*_):
        # serve_forever shutdown must run outside its serving thread.
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, terminate)
    with server:
        print('ROCK_SERVICE_READY role=' + args.role, flush=True)
        server.serve_forever(poll_interval=0.2)
    if args.role == 'platform':
        service.close()
    if args.role == 'wallet':
        service.close()


if __name__ == '__main__':
    main()
