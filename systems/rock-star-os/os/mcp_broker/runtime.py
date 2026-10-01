"""Persistent, optional MCP service for the owned purchaser development backend.

This supervises the real local text fixture and the purchaser-bound TLS bridge.
No public provider, credential issuance, Wallet credit or financial settlement.
An unavailable optional service retains its histories and never enables a new
route. Its parent keeps Wallet recovery available until final backend shutdown.
"""
import fcntl
import hashlib
import os
from pathlib import Path
import stat
import threading

from service_access.os_client import private_directory, protected_read, write_marker, require
from .fixture import FixtureServer, PUBLIC_TOKEN, PROFILE_NAME
from .gateway import HubGateway, HubGatewayServer
from .http import MCPHttpClient, identifier

SCHEMA = 'rock-mcp-owned-runtime/1'


def validate(configuration, *, occupied_ports=()):
    fields = {'schema', 'gateway_port', 'provider_port', 'consumer_id', 'alias'}
    require(type(configuration) is dict and set(configuration) == fields and
            configuration['schema'] == SCHEMA, 'explicit owned MCP configuration required')
    ports = [configuration['gateway_port'], configuration['provider_port']]
    require(all(type(port) is int and 1024 <= port <= 65535 for port in ports) and
            len(set(ports)) == 2 and not set(ports).intersection(occupied_ports),
            'MCP listeners require two distinct, unprivileged, unused configured ports')
    identifier(configuration['consumer_id']); identifier(configuration['alias'])
    return dict(configuration)


class PersistentMCPRuntime:
    def __init__(self, directory, controller, ca_file, key_file, configuration, *, create=False, clock=None):
        require(type(create) is bool, 'explicit creation mode required')
        self.directory = Path(directory)
        require(self.directory.is_absolute(), 'absolute private MCP state required')
        self.controller, self.configuration = controller, validate(configuration)
        # Verify this consumer before any filesystem or listener mutation.
        controller.snapshot(self.configuration['consumer_id'])
        self.ca_file, self.key_file = Path(ca_file), Path(key_file)
        self.create, self.clock = create, clock
        self.provider = self.gateway = self.server = self.thread = None
        self.fd = None
        self.attempted = False
        self.state, self.error_type = 'STOPPED', None
        self.lifecycle = threading.RLock()

    def _open(self):
        if not self.create:
            require(self.directory.is_dir() and not self.directory.is_symlink(),
                    'saved MCP state is missing; recovery required')
        private_directory(self.directory)
        flags = os.O_RDWR | os.O_NOFOLLOW | (os.O_CREAT if self.create else 0)
        self.fd = os.open(self.directory/'runtime.lock', flags, 0o600)
        info = os.fstat(self.fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and
                stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1, 'invalid MCP runtime lock')
        fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        binding = {'schema':SCHEMA, 'authority_id':self.controller.authority_id,
                   'configuration':self.configuration,
                   'ca_sha256':hashlib.sha256(self.ca_file.read_bytes()).hexdigest()}
        marker = self.directory/'binding.json'
        if self.create:
            require({p.name for p in self.directory.iterdir()} == {'runtime.lock'},
                    'MCP creation requires a new empty state; retained data is never initialized')
            write_marker(marker, binding)
        else:
            require(protected_read(marker, private=True) == binding,
                    'saved MCP authority or configuration changed')
            for name in ('provider', 'gateway'):
                path = self.directory/name
                require(path.is_dir() and not path.is_symlink(), 'saved MCP component is missing')
            consumer = self.configuration['consumer_id']
            consumer_directory = self.directory/'gateway'/consumer
            require(consumer_directory.is_dir() and not consumer_directory.is_symlink(),
                    'saved MCP consumer history is missing')
            # The component constructors also support first setup. Never let an
            # emptied retained directory be mistaken for a new provider/Broker.
            for relative in (f'provider/{PROFILE_NAME}', 'provider/effects.sqlite3', 'provider/fixture.lock',
                             'gateway/binding.json','gateway/gateway.lock',
                             f'gateway/{consumer}/broker.sqlite3',f'gateway/{consumer}/broker.lock'):
                info = (self.directory/relative).lstat()
                require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and
                        stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1,
                        'saved MCP component files are missing or unprotected')
        config = self.configuration
        self.provider = FixtureServer(self.directory/'provider', port=config['provider_port'],
            persistent=True, profile_binding=self.controller.authority_id)
        client = MCPHttpClient(self.provider.origin, [self.provider.policy],
            authorization='Bearer '+PUBLIC_TOKEN, allow_http_fixture=True)
        connections = {config['consumer_id']:{config['alias']:{
            'label':'テキストを大文字にする', 'tool':'text.upper', 'client':client}}}
        self.gateway = HubGateway(self.directory/'gateway', self.controller, connections,
                                  clock=self.clock, start_worker=False)
        self.server = HubGatewayServer(('127.0.0.1',config['gateway_port']),self.gateway,
                                       self.ca_file,self.key_file)

    def start(self):
        with self.lifecycle:
            require(not self.attempted, 'MCP runtime cannot start twice; use a new owned process')
            self.attempted, self.state = True, 'STARTING'
            try:
                self._open()
                self.thread = threading.Thread(target=self.server.serve_forever,
                    kwargs={'poll_interval':.1},name='rock-mcp-gateway',daemon=False)
                self.thread.start()
                for broker in self.gateway.brokers.values():
                    broker.start()
                require(self._live(), 'MCP workers did not start')
                self.state = 'READY'
                return True
            except Exception as error:
                self.error_type = type(error).__name__
                try: self._close_resources()
                except Exception: self.error_type = 'CleanupIncomplete'
                self.state = 'UNAVAILABLE'
                return False
            except BaseException:
                self.state = 'UNAVAILABLE'
                self._close_resources()
                raise

    def _live(self):
        return (self.thread is not None and self.thread.is_alive() and self.provider is not None
                and self.provider.thread.is_alive() and self.gateway is not None and
                all(broker._worker is not None and broker._worker.is_alive()
                    for broker in self.gateway.brokers.values()))

    def poll(self):
        with self.lifecycle:
            if self.state == 'READY' and not self._live():
                self.state, self.error_type = 'UNAVAILABLE', 'ListenerStopped'
            if self.state == 'UNAVAILABLE':
                try: self._close_resources()
                except Exception: self.error_type = 'CleanupIncomplete'
            return self.metadata()

    def metadata(self):
        with self.lifecycle:
            state = 'UNAVAILABLE' if self.state == 'READY' and not self._live() else self.state
            return {'schema':SCHEMA, 'status':state, 'gateway_port':self.configuration['gateway_port'],
                    'provider_port':self.configuration['provider_port'],
                    'consumer_id':self.configuration['consumer_id'], 'alias':self.configuration['alias'],
                    'error_type':self.error_type, 'simulation_only':True, 'provider_connected':False,
                    'financial_settlement':False, 'persistent_history':True}

    def device_configuration(self, consumer, *, host='10.0.2.2'):
        require(consumer == self.configuration['consumer_id'] and host in ('127.0.0.1','10.0.2.2'),
                'configured MCP consumer and development host required')
        return {'schema':'rock-mcp-hub-device/1',
                'gateway_origin':f'https://{host}:{self.configuration["gateway_port"]}'}

    def _close_resources(self):
        # Stop ingress and drain accepted calls before stopping Broker workers.
        # A failed drain keeps the provider and Wallet dependency alive for retry.
        if self.thread is not None and self.thread.ident is not None:
            if self.thread.is_alive(): self.server.shutdown()
            self.thread.join(5)
            require(not self.thread.is_alive(), 'MCP listener did not stop')
        if self.server is not None:
            self.server.server_close()
            self.server = None
        if self.gateway is not None:
            self.gateway.close()
            self.gateway = None
        if self.provider is not None:
            self.provider.close()
            self.provider = None
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None

    def close(self):
        with self.lifecycle:
            try: self._close_resources()
            except BaseException:
                self.state, self.error_type = 'UNAVAILABLE', 'CleanupIncomplete'
                raise
            self.state = 'STOPPED'
