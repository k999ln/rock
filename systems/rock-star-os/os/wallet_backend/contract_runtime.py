"""One existing WalletService per owned contract; no replacement ledger engine."""
from contextlib import contextmanager, closing, nullcontext, ExitStack
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import threading
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location('rock_backend_existing_platform', ROOT / 'os/platform/service.py')
platform_service = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(platform_service)
from blackberryrock.packages import canonical
from entitlement.protocol import PUBLIC_TOKENS, EntitlementError, identifier, verify_event
from .runtime_contracts import (ContractDescriptor, ContractIdentity, AuthenticatedDevicePrincipal,
    RuntimeAdmissionRejected, RuntimeUnavailable, RuntimeCleanupRequired)

MAX_REQUEST = 65536
PUBLIC_OWNER_TOKEN = PUBLIC_TOKENS['alice']
FIXTURES = ROOT / 'os/registry/fixtures'
OWNER_FIELDS = {
    'snapshot': set(), 'health': set(), 'wallet.membership': set(), 'wallet.billing.status': set(),
    'wallet.register': {'key'}, 'wallet.consent': {'key', 'accepted', 'terms_version'},
    'wallet.bill': {'key', 'period'}, 'wallet.atm.issue': {'key', 'amount_minor', 'atm_id'},
    'wallet.atm.status': {'withdrawal_id'}, 'wallet.atm.history': {'limit'},
    'wallet.atm.cancel': {'key', 'withdrawal_id'}, 'wallet.atm.expire': {'key', 'withdrawal_id'},
    'wallet.atm.timeout': {'key', 'withdrawal_id'},
}
AUTH_OWNER_FIELDS = {**OWNER_FIELDS,
    'wallet.auth.begin': {'key'},
    'wallet.auth.enroll': {'key', 'challenge_id', 'credential'},
    'wallet.auth.status': set(),
    'wallet.terms': {'key', 'accepted', 'terms_version'},
    'wallet.atm.quote': {'key', 'issue_key', 'amount_minor', 'atm_id'},
    'wallet.atm.issue': {'key', 'quote_id', 'credential'},
    'wallet.atm.quote.cancel': {'key', 'quote_id'},
}
AUTHORITY_SCHEMA = 'public-wallet-authority/1'
AUTHORITY_HEADER = 'X-Rock-Wallet-Authority'
DEVICE_HEADER = 'X-Rock-Wallet-Device'
DEVICE_MARKER = 'DEVICE-CREDENTIALS.json'
MAX_DEVICES = 32
# Explicit public fixture text, not a generated secret or production identity.
PUBLIC_SECOND_DEVICE_TOKEN = 'PUBLIC-FIXTURE-ENTITLEMENT-DEVICE-ALICE-B-v1'


def decode(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('duplicate JSON field')
            result[key] = value
        return result
    def nonfinite(_):
        raise ValueError('non-finite JSON')
    return json.loads(raw.decode('utf-8'), object_pairs_hook=unique, parse_constant=nonfinite)


def validate_request(request, *, authentication_required=True):
    if (not isinstance(request, dict) or type(request.get('v')) is not int or request['v'] != 1
            or not isinstance(request.get('op'), str)):
        raise ValueError('invalid protocol')
    op = request['op']
    allowed = AUTH_OWNER_FIELDS if authentication_required else OWNER_FIELDS
    if op not in allowed:
        raise PermissionError('operation not permitted for HTTP owner')
    if set(request) != {'v', 'op'} | allowed[op]:
        raise ValueError('unexpected fields')
    if 'key' in request and (not isinstance(request['key'], str) or not 1 <= len(request['key']) <= 128):
        raise ValueError('invalid request identity')
    return request


def _project_service_status(reply, request, provider, device_ref):
    if request['op'] == 'snapshot' and reply.get('ok') is True and provider is not None:
        try:
            status = provider(device_ref)
        except (ValueError, RuntimeError):
            status = None
        reply['snapshot']['service_access'] = status


def write_private_marker(state, path, value):
    descriptor, temporary = tempfile.mkstemp(prefix='.authority-mode-', dir=state)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(canonical(value) + b'\n'); stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(state, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class _LegacyContractRuntime:
    """Private v1/v2 compatibility profile; never opens a managed marker."""
    def __init__(self, state, *, provisioning_file=None, device_credentials_file=None,
                 clock=None, authentication_required=True, max_automatic_failures=3,
                 service_status_provider=None, _marker_writer=None):
        self.state = Path(state).absolute()
        self._marker_writer = _marker_writer
        self.service_status_provider = service_status_provider
        self.authentication_required = authentication_required
        self.service, self.lock_fd, self._closed = None, None, False
        self.state.mkdir(parents=True, mode=0o700, exist_ok=True)
        info = self.state.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise ValueError('Wallet authority state must be owned mode 0700 directory')
        self._reject_unmarked_import()
        self.lock_fd = os.open(self.state / 'authority.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            info = os.fstat(self.lock_fd)
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
                    or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
                raise ValueError('invalid authority singleton lock')
            fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self._mark_fresh_authority()
            self._check_existing_storage()
            self.device_credentials = self._configure_devices(device_credentials_file)
            self.device_bound = self.device_credentials is not None
            options = {'contract_devices': True} if self.device_bound else {}
            self.service = platform_service.WalletService(self.state,
                provisioning_file=provisioning_file or ROOT / 'os/entitlement/fixtures/device-handoff.json',
                start_scheduler=False, clock=clock, authentication_required=authentication_required,
                authority_id=self.authority_id, max_automatic_failures=max_automatic_failures, **options)
            if (self.service.membership._binding() or {}).get('owner_actor') != 'alice':
                raise ValueError('only the provisioned Alice fixture authority is supported')
        except BaseException:
            self.close()
            raise

    def start_scheduler(self):
        if self._closed:
            raise RuntimeUnavailable('closed Wallet authority')
        self.service.membership.start()

    def dispatch(self, request, *, device_ref, deadline):
        if self._closed:
            raise RuntimeUnavailable('closed Wallet authority')
        if time.monotonic() >= deadline:
            raise TimeoutError('request expired before contract admission')
        scope = (self.service.membership.device_scope(device_ref, 'alice')
                 if self.device_bound else nullcontext())
        with ExitStack() as stack:
            try:
                stack.enter_context(scope)
            except (EntitlementError, PermissionError) as exc:
                raise RuntimeAdmissionRejected('current purchased device eligibility required') from exc
            if time.monotonic() >= deadline:
                raise TimeoutError('request expired during contract admission')
            reply = self.service.dispatch(request, peer_uid=1002)
            _project_service_status(reply, request, self.service_status_provider, device_ref)
            return reply

    def close(self):
        if self._closed:
            return
        if self.service is not None:
            self.service.close()
            worker = self.service.membership.thread
            if worker is not None and worker.is_alive():
                raise RuntimeError('scheduler still owns authority; lock not released')
        if self.lock_fd is not None:
            os.close(self.lock_fd)
            self.lock_fd = None
        self._closed = True
        self.service_status_provider = None

    @staticmethod
    def _protected_json(path, limit, *, private=False):
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, 'rb') as stream:
            info = os.fstat(stream.fileno())
            if (not stat.S_ISREG(info.st_mode) or info.st_uid not in (0, os.geteuid()) or info.st_nlink != 1
                    or info.st_mode & 0o022 or info.st_size > limit
                    or private and (info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600)):
                raise ValueError('device credential configuration must be a protected regular file')
            raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise ValueError('device credential configuration exceeds limit')
        return decode(raw)

    @staticmethod
    def _device_mapping(value, *, hashed=False):
        required = {'schema_version', 'kind', 'devices'} | ({'authority_id'} if hashed else set())
        kind = 'public-device-bound-authority' if hashed else 'public-development-device-credentials'
        if (not isinstance(value, dict) or set(value) != required or type(value['schema_version']) is not int
                or value['schema_version'] != 1 or value['kind'] != kind
                or not isinstance(value['devices'], list) or not 1 <= len(value['devices']) <= MAX_DEVICES):
            raise ValueError('invalid bounded device credential configuration')
        mapping, tokens = {}, set()
        token_field = 'token_sha256' if hashed else 'token'
        for device in value['devices']:
            if not isinstance(device, dict) or set(device) != {'device_ref', 'owner_actor', token_field}:
                raise ValueError('invalid device credential fields')
            ref = identifier(device['device_ref'], fixture=True)
            token = device[token_field]
            if device['owner_actor'] != 'alice' or not isinstance(token, str):
                raise ValueError('only public Alice fixture devices are supported')
            if hashed:
                valid = len(token) == 64 and all(character in '0123456789abcdef' for character in token)
            else:
                valid = (16 <= len(token) <= 256 and token.startswith('PUBLIC-FIXTURE-')
                         and all(33 <= ord(character) <= 126 for character in token))
            if not valid or ref in mapping or token in tokens:
                raise ValueError('invalid or duplicate device credential identity')
            mapping[ref] = dict(device)
            tokens.add(token)
        return mapping

    def _configure_devices(self, config_path):
        marker_path = self.state / DEVICE_MARKER
        old = None
        if marker_path.exists() or marker_path.is_symlink():
            stored = self._protected_json(marker_path, MAX_REQUEST, private=True)
            old = self._device_mapping(stored, hashed=True)
            if stored['authority_id'] != self.authority_id:
                raise ValueError('device credential marker belongs to another authority')
        if self.authority_device_bound and old is None:
            raise ValueError('bound authority credential history is missing; explicit recovery required')
        if config_path is None:
            if old is not None:
                raise ValueError('bound Wallet authority requires its device credentials; no legacy fallback')
            return None
        mapping = self._device_mapping(self._protected_json(config_path, MAX_REQUEST))
        hashed = {ref: {'device_ref': ref, 'owner_actor': row['owner_actor'],
                        'token_sha256': hashlib.sha256(row['token'].encode()).hexdigest()} for ref, row in mapping.items()}
        if old is not None and any(ref not in hashed or hashed[ref] != row for ref, row in old.items()):
            raise ValueError('device credential mappings are append-only; existing bindings cannot be removed or changed')
        if old != hashed:
            value = {'schema_version': 1, 'kind': 'public-device-bound-authority', 'authority_id': self.authority_id,
                     'devices': [hashed[ref] for ref in sorted(hashed)]}
            self._write_private_marker(marker_path, value)
        if not self.authority_device_bound:
            # Legacy readers reject the new explicit field before opening a
            # ledger. If a crash precedes this second write, the device marker
            # above still prevents this reader from falling back to v1.
            self._write_private_marker(self.state / 'AUTHORITY.json',
                {'schema': AUTHORITY_SCHEMA, 'owner': 'alice', 'migration': False,
                 'authority_id': self.authority_id, 'device_bound': True})
            self.authority_device_bound = True
        return mapping

    def _write_private_marker(self, path, value):
        if self._marker_writer is not None:
            return self._marker_writer(path, value)
        return write_private_marker(self.state, path, value)

    def _reject_unmarked_import(self):
        marker = self.state / 'AUTHORITY.json'
        if not marker.exists() and not marker.is_symlink():
            if {path.name for path in self.state.iterdir()} - {'authority.lock'}:
                raise ValueError('refuse device-state import; use a fresh backend account directory')

    def _check_existing_storage(self):
        # Check before SQLite can follow, recover, or mutate any existing file.
        names = ['device.lock'] + [name + suffix for name in ('wallet-simulator.db', 'entitlement.db')
                                  for suffix in ('', '-wal', '-shm', '-journal')]
        for name in names:
            try:
                info = (self.state / name).lstat()
            except FileNotFoundError:
                continue
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_nlink != 1
                    or stat.S_IMODE(info.st_mode) != 0o600):
                raise ValueError('invalid private authority storage')

    def _mark_fresh_authority(self):
        marker = self.state / 'AUTHORITY.json'
        if marker.exists() or marker.is_symlink():
            descriptor = os.open(marker, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(descriptor, 'rb') as source:
                info = os.fstat(source.fileno())
                if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
                        or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 or info.st_size > 1024):
                    raise ValueError('invalid authority marker')
                try:
                    value = decode(source.read(1025))
                    identifier = uuid.UUID(value['authority_id'])
                    base_fields = {'schema', 'owner', 'migration', 'authority_id'}
                    if (set(value) not in (base_fields, base_fields | {'device_bound'})
                            or value['schema'] != AUTHORITY_SCHEMA or value['owner'] != 'alice'
                            or value['migration'] is not False or identifier.version != 4
                            or str(identifier) != value['authority_id']
                            or 'device_bound' in value and value['device_bound'] is not True):
                        raise ValueError('invalid authority marker')
                except (ValueError, KeyError, TypeError, AttributeError, UnicodeError, RecursionError) as exc:
                    raise ValueError('invalid authority marker') from exc
                self.authority_id = str(identifier)
                self.authority_device_bound = value.get('device_bound', False)
        else:
            self._reject_unmarked_import()
            self.authority_id = str(uuid.uuid4())
            self.authority_device_bound = False
            value = {'schema': AUTHORITY_SCHEMA, 'owner': 'alice', 'migration': False,
                     'authority_id': self.authority_id}
            descriptor = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(descriptor, 'wb') as destination:
                destination.write(canonical(value) + b'\n')
                destination.flush()
                os.fsync(destination.fileno())
            descriptor = os.open(self.state, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)



class ContractRuntime:
    """Managed single-contract lifetime under a real coordinator permit.

    The coordinator owns storage identity, migration and writer fencing. This
    class only composes the existing Wallet/Entitlement/ATM/Auth once and keeps
    one admission around each complete operation. No unmanaged fallback.
    """
    @classmethod
    def open_fresh(cls, spec, *, coordinator, provisioning_file, verifier, **options):
        cls._validate_options(verifier, options)
        coordinator.bind_owner_registry(*verifier.registry_identity())
        return cls._open_with_permit(coordinator.prepare_fresh(spec),
            provisioning_file=provisioning_file, verifier=verifier, **options)

    @classmethod
    def open_active(cls, ledger_ref, *, coordinator, provisioning_file, verifier, **options):
        cls._validate_options(verifier, options)
        coordinator.bind_owner_registry(*verifier.registry_identity())
        return cls._open_with_permit(coordinator.open_active(ledger_ref),
            provisioning_file=provisioning_file, verifier=verifier, **options)

    @classmethod
    def open_current_game_restore(cls, restore_id, *, index, coordinator, provisioning_file, verifier, **options):
        """Nonpublic management lifetime bound to a real C/index restore plan.

        It never starts a scheduler or serves normal Wallet/game operations.
        Complete resume, close, then use the ordinary fully joined bootstrap.
        """
        from game_exchange.current_restore import _record, GameIndex, AuthorityFenceCoordinator
        cls._validate_options(verifier,options)
        if type(index) is not GameIndex or type(coordinator) is not AuthorityFenceCoordinator:
            raise RuntimeUnavailable('actual retained game index/coordinator required')
        coordinator.bind_owner_registry(*verifier.registry_identity())
        _,plan=_record(index,restore_id)
        return cls._open_with_permit(coordinator.open_active(plan['new_descriptor']['ledger_ref']),
            provisioning_file=provisioning_file,verifier=verifier,
            _current_game_restore=(index,coordinator,restore_id),**options)

    @classmethod
    def open_adopted(cls, plan, *, coordinator, provisioning_file, verifier, **options):
        cls._validate_options(verifier, options)
        coordinator.bind_owner_registry(*verifier.registry_identity())
        return cls._open_with_permit(coordinator.prepare_legacy(plan),
            provisioning_file=provisioning_file, verifier=verifier, **options)

    @staticmethod
    def _validate_options(verifier, options):
        if set(options) - {'clock', 'max_automatic_failures', 'service_status_provider'}:
            raise ValueError('unsupported managed runtime option')
        if (not callable(getattr(verifier, 'assert_current', None))
                or not callable(getattr(verifier, 'registry_identity', None))):
            raise ValueError('a current principal verifier with protected registry identity is required')
        provider = options.get('service_status_provider')
        if provider is not None and not callable(provider):
            raise ValueError('service status provider must be callable')

    @classmethod
    def _open_with_permit(cls, opening, *, provisioning_file, verifier, clock=None,
                          max_automatic_failures=3, service_status_provider=None, _current_game_restore=None):
        self = cls.__new__(cls)
        self._descriptor = opening.descriptor
        self._hooks = opening.hooks
        self._writer = None
        self._opening = opening
        self._service = None
        self._verifier = verifier
        self._state = 'INITIALIZING'
        self._lifetime_lock, self._close_lock = threading.RLock(), threading.Lock()
        self._service_status_provider = service_status_provider
        self._bound_account = None
        self._restore_management = None
        self._requires_game_binding = False
        try:
            if not isinstance(self._descriptor, ContractDescriptor):
                raise ValueError('coordinator descriptor required')
            with opening.initialize(), ExitStack() as bootstrap:
                self._hooks.require_held()
                from game_exchange.current_restore import require_normal_open, validate_management_open
                if _current_game_restore is None:
                    self._requires_game_binding = require_normal_open(self.descriptor)
                else:
                    index,coordinator,restore_id = _current_game_restore
                    plan_hash = bootstrap.enter_context(validate_management_open(index,coordinator,restore_id,self.descriptor))
                    self._restore_management = (index,coordinator,restore_id,plan_hash)
                self._service = platform_service.WalletService(self.descriptor.canonical_state,
                    provisioning_file=provisioning_file, start_scheduler=False,
                    contract_devices=True, authentication_required=True,
                    authority_id=self.descriptor.wallet_authority_id, clock=clock,
                    max_automatic_failures=max_automatic_failures,
                    managed_write_hooks=self._hooks, write_admission=self._component_admission)
                observed = self._observe_identity()
            # The opening permit still owns the authority lock after the
            # bootstrap scope exits. Activate only a completed initialization;
            # scheduler and requests remain unavailable throughout this gap.
            self._writer = opening.activate(observed)
            if self._writer.descriptor != self.descriptor or self._writer.hooks is not self._hooks:
                raise ValueError('activation changed runtime identity or write capability')
            self._bound_account = observed.account_id
            self._opening = None
            self._state = ('RESTORE_MANAGEMENT' if self._restore_management is not None else
                           'AWAITING_GAME_BIND' if self._requires_game_binding else 'READY')
            return self
        except BaseException:
            # Expose only an internal cleanup handle if release cannot finish;
            # losing the Python local must not orphan a still-owned permit.
            self._state = 'CLOSING'
            try:
                self.close()
            except BaseException as cleanup_error:
                raise RuntimeCleanupRequired(self) from cleanup_error
            raise

    @property
    def descriptor(self):
        return self._descriptor

    def _observe_identity(self):
        self._hooks.require_held()
        descriptor = self.descriptor
        membership = self._service.membership
        # Read the canonical primary binding, never the thread-local device
        # scope of the current request, when checking lifetime identity.
        with closing(membership.store._connect()) as db:
            binding = db.execute('SELECT device_ref,owner_actor FROM device_binding WHERE singleton=1').fetchone()
            device = db.execute('SELECT owner_ref FROM devices WHERE device_ref=?',
                                (descriptor.primary_device_ref,)).fetchone()
            accounts = db.execute('SELECT account_id,owner_ref FROM accounts').fetchall()
        if (binding is None or binding['device_ref'] != descriptor.primary_device_ref
                or binding['owner_actor'] != descriptor.owner_actor or device is None
                or device['owner_ref'] != descriptor.owner_ref or len(accounts) > 1
                or accounts and accounts[0]['owner_ref'] != descriptor.owner_ref
                or self._service.authentication.authority_id != descriptor.wallet_authority_id):
            raise RuntimeUnavailable('provisioned contract identity does not match its coordinator')
        return ContractIdentity(descriptor, accounts[0]['account_id'] if accounts else None)

    def identity(self):
        with self._component_admission():
            return self._observe_identity()

    def _ensure_account_binding(self):
        observed = self._observe_identity()
        account = observed.account_id
        if self._bound_account is not None and account != self._bound_account:
            raise RuntimeUnavailable('registered contract account changed')
        if account is not None:
            # Repeat exact binding after an interrupted cross-DB registration
            # before allowing any different request to make another mutation.
            self._writer.bind_registered_account(account)
            self._bound_account = account

    @contextmanager
    def _component_admission(self):
        if self._hooks.held_by_current_thread():
            self._hooks.require_held()
            yield
        else:
            with self.admit_write(self.descriptor.writer_epoch):
                yield

    @contextmanager
    def admit_write(self, expected_epoch):
        # Existing admitted actions can finish nested calls while CLOSING.
        # New actions must go through the coordinator's atomic outer gate.
        with self._lifetime_lock:
            nested = self._hooks.held_by_current_thread()
            if self._writer is None or (self._state not in ('READY', 'RUNNING') and not nested):
                raise RuntimeUnavailable('contract runtime is not accepting operations')
            writer = self._writer
        with writer.admit_write(expected_epoch):
            yield

    def require_serving_ready(self, game_gateway=None):
        with self._lifetime_lock:
            if self._state not in ('READY','RUNNING'):
                raise RuntimeUnavailable('contract is not fully bound for normal service')
            games=getattr(self,'_games',None)
            if self._requires_game_binding or games is not None:
                if games is None or games.gateway is not game_gateway or not game_gateway.bound:
                    raise RuntimeUnavailable('retained game contract requires its exact current gateway')

    def start_scheduler(self):
        with self._close_lock:
            with self._lifetime_lock:
                if self._state == 'RUNNING':
                    return
                if self._state != 'READY':
                    raise RuntimeUnavailable('contract runtime cannot start its scheduler')
                self._service.membership.start()
                self._state = 'RUNNING'

    def bind_game_connections(self, gateway, signer, cursor):
        from game_exchange.connections import WalletConnections, GameGateway
        if type(gateway) is not GameGateway or getattr(self, '_games', None) is not None:
            raise RuntimeUnavailable('game connections already bound or invalid gateway')
        with self._close_lock:
            with self._lifetime_lock:
                if self._state not in ('READY','AWAITING_GAME_BIND'):
                    raise RuntimeUnavailable('runtime cannot bind games in its current lifetime')
                self._state = 'AWAITING_GAME_BIND'
            with self._writer.admit_write(self.descriptor.writer_epoch):
                self._ensure_account_binding()
                self._games = WalletConnections(self, gateway, signer, cursor)
            with self._lifetime_lock:self._state = 'READY'

    @contextmanager
    def _current_game_restore_admission(self,index,coordinator,restore_id,plan_hash):
        with self._close_lock:
            with self._lifetime_lock:
                if self._state != 'RESTORE_MANAGEMENT' or self._restore_management != (index,coordinator,restore_id,plan_hash):
                    raise RuntimeUnavailable('matching C/index management lifetime required')
            with self._writer.admit_write(self.descriptor.writer_epoch):
                yield

    def validate_owner_request(self, request):
        if isinstance(request, dict) and isinstance(request.get('op'), str) and request['op'].startswith('game.'):
            from game_exchange.protocol import validate_owner_request
            if getattr(self, '_games', None) is None:
                raise RuntimeAdmissionRejected('game connections are disabled')
            return validate_owner_request(request)
        return validate_request(request, authentication_required=True)

    def dispatch_game_author(self, gateway, principal, request, *, deadline):
        games = getattr(self, '_games', None)
        if games is None or games.gateway is not gateway or time.monotonic() >= deadline:
            raise RuntimeAdmissionRejected('game connection runtime unavailable')
        with self.admit_write(self.descriptor.writer_epoch), gateway.author_gate:
            self._ensure_account_binding()
            result = games.author(principal, request, deadline)
            self._ensure_account_binding()
            return result

    def dispatch(self, principal, request, *, deadline):
        if (not isinstance(principal, AuthenticatedDevicePrincipal)
                or (principal.ledger_ref, principal.owner_actor, principal.owner_ref) !=
                   (self.descriptor.ledger_ref, self.descriptor.owner_actor, self.descriptor.owner_ref)):
            raise RuntimeAdmissionRejected('principal does not identify this contract')
        if time.monotonic() >= deadline:
            raise TimeoutError('request expired before contract admission')
        self.validate_owner_request(request)
        with self.admit_write(self.descriptor.writer_epoch):
            self._verifier.assert_current(principal, self.descriptor)
            if time.monotonic() >= deadline:
                raise TimeoutError('request expired during contract admission')
            with ExitStack() as stack:
                try:
                    stack.enter_context(self._service.membership.device_scope(principal.device_ref, principal.owner_actor))
                except (EntitlementError, PermissionError) as exc:
                    raise RuntimeAdmissionRejected('current purchased device eligibility required') from exc
                if time.monotonic() >= deadline:
                    raise TimeoutError('request expired during device admission')
                self._ensure_account_binding()
                if request['op'].startswith('game.'):
                    with self._games.gateway.author_gate, self._service.membership.game_connection_guard(request['op'], peer_uid=1002) as context:
                        reply = self._games.owner(principal, request, context, deadline=deadline)
                else:
                    reply = self._service.dispatch(request, peer_uid=1002)
                self._ensure_account_binding()
                _project_service_status(reply, request, self._service_status_provider, principal.device_ref)
                return reply

    def ingest_fulfillment(self, signed_event):
        with self.admit_write(self.descriptor.writer_epoch):
            self._ensure_account_binding()
            store = self._service.membership.store
            event, _ = verify_event(signed_event, store._now())
            store._validate_event_payload(event)
            if event['issuer'] != 'fulfillment':
                raise RuntimeAdmissionRejected('only scoped fulfillment events are accepted here')
            payload = event['payload']
            if event['kind'] == 'handoff':
                owner_ref = payload['owner_ref']
            else:
                with closing(store._connect()) as db:
                    row = db.execute('SELECT owner_ref FROM devices WHERE device_ref=?',
                                     (payload['device_ref'],)).fetchone()
                owner_ref = row['owner_ref'] if row else None
            if owner_ref != self.descriptor.owner_ref:
                raise RuntimeAdmissionRejected('fulfillment event is not bound to this contract')
            return store.ingest(signed_event)

    def revoke_credential(self, credential_id, key):
        with self.admit_write(self.descriptor.writer_epoch):
            self._ensure_account_binding()
            return self._service.authentication.revoke_credential(credential_id, key)

    def seed_fixture_sale(self, amount_minor, key):
        with self.admit_write(self.descriptor.writer_epoch):
            self._ensure_account_binding()
            return self._service.wallet.simulate_sale(amount_minor, key)

    def settle_fixture_sale(self, sale_id, key):
        with self.admit_write(self.descriptor.writer_epoch):
            self._ensure_account_binding()
            return self._service.wallet.settle_sale(sale_id, key)

    def close(self):
        with self._close_lock:
            with self._lifetime_lock:
                if self._state == 'CLOSED':
                    return
                if self._state not in ('READY', 'RUNNING', 'CLOSING','AWAITING_GAME_BIND','RESTORE_MANAGEMENT'):
                    raise RuntimeUnavailable('runtime initialization has not completed')
                self._state = 'CLOSING'
            if self._writer is not None:
                self._writer.quiesce()
            # Never join while holding admission, Device or Store locks. A
            # timeout retains the writer; release refuses outstanding actions.
            if self._service is not None:
                self._service.close()
                worker = self._service.membership.thread
                if worker is not None and worker.is_alive():
                    raise RuntimeUnavailable('scheduler still owns its contract')
            if self._writer is not None:
                self._writer.release()
            elif self._opening is not None:
                self._opening.abort()
                self._opening = None
            self._service_status_provider = None
            with self._lifetime_lock:
                self._state = 'CLOSED'
