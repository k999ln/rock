"""Owned development backend with one Wallet and one purchaser authority.

All three TLS listeners share the same in-process entitlement Store. Registry
and Runner receive scoped service credentials, never a Wallet bearer token.
Only existing public fixtures are supported; there is no provider connection.
"""
from copy import deepcopy
from pathlib import Path
import threading

from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER
from registry.server import RegistryServer, RegistryStore
from runner.server import TLSRunnerServer
from runner.store import RunnerStore
from wallet_backend.server import WalletBackendServer
from .controller import ServiceAccessController
from .os_client import CONFIG_SCHEMA, private_directory

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / 'os/registry/fixtures'


class ClosedServiceAuthority:
    def __init__(self, state, *, consumers, device_credentials_file, executor,
                 provisioning_file=None, clock=None, grace_seconds=0,
                 paid_services=('runner.cloud',), max_automatic_failures=3,
                 registry_port=0, runner_port=0, wallet_port=0,
                 endpoint_id='runner-closed-cloud', start_scheduler=True, start_worker=True,
                 mcp_configuration=None, mcp_create=False):
        self.state = Path(state)
        private_directory(self.state)
        self.consumers = deepcopy(consumers)
        self.endpoint_id = endpoint_id
        self.wallet = self.registry_store = self.registry = self.runner_store = self.runner = None
        self.mcp = None
        self.threads = []
        self.lifecycle = threading.RLock()
        self.completed_closes = set()
        self.closed = False
        self.started = False
        self.start_scheduler, self.start_worker = start_scheduler, start_worker
        self.ca_file, self.key_file = FIXTURES / 'development-ca.pem', FIXTURES / 'PUBLIC-FIXTURE-KEY.pem'
        try:
            if mcp_configuration is None and ((self.state/'mcp').exists() or (self.state/'mcp').is_symlink()):
                raise ValueError('retained MCP state requires its explicit saved configuration')
            self.wallet = WalletBackendServer(('127.0.0.1', wallet_port), self.state / 'wallet',
                provisioning_file=provisioning_file, device_credentials_file=device_credentials_file,
                start_scheduler=False, clock=clock, authentication_required=True,
                max_automatic_failures=max_automatic_failures,
                service_status_provider=self._wallet_service_status)
            self.authority_id = self.wallet.authority_id
            for row in self.consumers.values():
                wallet_binding = self.wallet.device_credentials.get(row['device_ref'])
                if wallet_binding is None or wallet_binding['owner_actor'] != row['owner_actor']:
                    raise ValueError('service consumer does not match the authority device binding')
                if row['token'] == wallet_binding['token']:
                    raise ValueError('Wallet and service credentials must have separate scopes')
            self.access = ServiceAccessController(self.wallet.service.membership.store,
                authority_id=self.authority_id, consumers=self.consumers,
                grace_seconds=grace_seconds, paid_services=paid_services)
            self.registry_store = RegistryStore(self.state / 'registry', FIXTURES / 'approved-authors.json',
                                                 service_access=self.access)
            self.registry = RegistryServer(('127.0.0.1', registry_port), self.registry_store,
                                           self.ca_file, self.key_file, service_access=self.access)
            # Close waits for actual accepted Registry workers before the shared
            # Wallet authority may release its singleton lock or close its DB.
            self.registry.daemon_threads = False
            self.registry.block_on_close = True
            owners = {alias: {'token': row['token'], 'publishers': [TEST_PUBLISHER]}
                      for alias, row in self.consumers.items()}
            self.runner_store = RunnerStore(self.state / 'runner', endpoint_id=endpoint_id,
                target='cloud', transport_evidence='pinned_tls_loopback_fixture', owners=owners,
                publisher_trust={TEST_PUBLISHER: PUBLIC_TEST_KEY}, executor=executor,
                start_worker=False, service_access=self.access)
            self.runner = TLSRunnerServer(('127.0.0.1', runner_port), self.runner_store, self.ca_file, self.key_file)
            if mcp_configuration is not None:
                from mcp_broker.runtime import PersistentMCPRuntime, validate
                config = validate(mcp_configuration, occupied_ports=(self.registry.server_port,
                    self.runner.server_port, self.wallet.server_port))
                self.mcp = PersistentMCPRuntime(self.state/'mcp',self.access,self.ca_file,self.key_file,
                                                config,create=mcp_create,clock=clock)
        except BaseException:
            self.close()
            raise

    def start(self):
        with self.lifecycle:
            return self._start()

    def _start(self):
        if self.closed or self.started:
            raise ValueError('authority cannot be started twice')
        try:
            for server in (self.wallet, self.registry, self.runner):
                thread = threading.Thread(target=server.serve_forever,
                    kwargs={'poll_interval': 0.1}, daemon=False)
                thread.start()
                self.threads.append((server, thread))
            if self.start_worker:
                self.runner_store.start()
            if self.start_scheduler:
                self.wallet.service.membership.start()
            if self.mcp is not None:
                # An optional MCP failure must not take Wallet recovery offline.
                # Its status stays UNAVAILABLE; no route or fresh history fallback.
                self.mcp.start()
            self.started = True
            return self
        except BaseException:
            self.close()
            raise

    def metadata(self):
        result = {'schema': 'rock-closed-service-authority/1', 'authority_id': self.authority_id,
                'registry_port': self.registry.server_address[1], 'runner_port': self.runner.server_address[1],
                'wallet_port': self.wallet.server_address[1], 'endpoint_id': self.endpoint_id,
                'policy_id': self.access.policy_id, 'simulation_only': True,
                'shared_entitlement_store': True, 'provider_connected': False}
        if self.mcp is not None:
            result['mcp'] = self.mcp.metadata()
        return result

    def poll_optional_services(self):
        if self.mcp is not None:
            self.mcp.poll()

    def mcp_configuration(self, consumer, *, host='10.0.2.2'):
        if self.mcp is None:
            return None
        return self.mcp.device_configuration(consumer,host=host)

    def _wallet_service_status(self, device_ref):
        from .status import build
        credential = self.wallet.device_credentials.get(device_ref)
        if credential is None:
            return None
        aliases = [alias for alias, row in self.consumers.items()
                   if row['device_ref'] == device_ref and row['owner_actor'] == credential['owner_actor']]
        # A Wallet-only device or ambiguous alias is not a service grant.
        if len(aliases) != 1:
            return None
        return build(self.access, aliases[0])

    def device_configuration(self, consumer, *, host='10.0.2.2'):
        if host not in {'127.0.0.1', '10.0.2.2'}:
            raise ValueError('development host required')
        binding = self.consumers[consumer]
        return {'schema': CONFIG_SCHEMA, 'authority_id': self.authority_id,
                'consumer_id': consumer, 'device_ref': binding['device_ref'], 'token': binding['token'],
                'registry_origin': f'https://{host}:{self.registry.server_address[1]}',
                'runner_origin': f'https://{host}:{self.runner.server_address[1]}',
                'runner_endpoint_id': self.endpoint_id}

    def wallet_configuration(self, consumer, *, host='10.0.2.2'):
        device = self.consumers[consumer]['device_ref']
        if host not in {'127.0.0.1', '10.0.2.2'}:
            raise ValueError('development host required')
        return {'schema_version': 2, 'mode': 'development-remote-authority',
                'origin': f'https://{host}:{self.wallet.server_address[1]}',
                'authority_id': self.authority_id, 'device_ref': device,
                'ca_file': '/usr/share/rock/development-store-ca.pem',
                'token_file': '/etc/rock-wallet/backend-token'}

    def close(self):
        with self.lifecycle:
            self._close()

    def _close(self):
        if self.closed:
            return
        # Its Broker can still be using the provider and shared Wallet Store.
        # Keep all dependencies alive if draining optional work needs a retry.
        if self.mcp is not None:
            self.mcp.close()
        for server, thread in self.threads:
            if thread.is_alive():
                server.shutdown()
        for _server, thread in self.threads:
            thread.join(5)
            if thread.is_alive():
                raise RuntimeError('authority listener has not stopped')
        # The Wallet is last: Registry requests and Runner work retain access to
        # the same authoritative Store until their actual operations finish.
        for name, resource, method in (
            ('registry-listener', self.registry, 'server_close'),
            ('runner-listener', self.runner, 'server_close'),
            ('runner-store', self.runner_store, 'close'),
            ('registry-store', self.registry_store, 'close'),
            ('wallet', self.wallet, 'server_close'),
        ):
            if resource is not None and name not in self.completed_closes:
                getattr(resource, method)()
                self.completed_closes.add(name)
        self.closed = True

    def __enter__(self):
        return self.start()

    def __exit__(self, *_):
        self.close()
