"""Explicit public-fixture backend, independent of a virtual device's power.

The first setup creates a new private authority; subsequent starts pin its UUID.
There is no real provider, signing-key generation or owner-facing credit API.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT / 'os')]
from blackberryrock.packages import canonical
from entitlement.protocol import PUBLIC_TOKENS
from registry.publish import publish
from runner.build_fixture import remote_fixture
from runner.executor import IsolatedRecipeExecutor
from service_access.authority import ClosedServiceAuthority
from service_access.controller import PUBLIC_SERVICE_TOKENS
from service_access.os_client import private_directory, protected_read, write_marker, require

SCHEMA = 'rock-closed-services-launch/1'
DEVICE = 'fixture-rock-arm64-001'
CONSUMERS = {'alice-a': {'owner_actor': 'alice', 'device_ref': DEVICE,
                        'token': PUBLIC_SERVICE_TOKENS['alice-a']}}


def validate(value):
    fields = {'schema', 'state', 'authority_id', 'registry_port', 'runner_port', 'wallet_port',
              'grace_seconds', 'max_automatic_failures'}
    require(isinstance(value, dict) and set(value) in (fields,fields|{'mcp'}) and value['schema'] == SCHEMA,
            'invalid purchaser backend configuration')
    require(isinstance(value['authority_id'], str) and
            str(uuid.UUID(value['authority_id'])) == value['authority_id'], 'invalid authority')
    path = Path(value['state'])
    require(path.is_absolute() and path == path.resolve() and
            str(path).startswith('/var/tmp/rock-star-closed-services/'), 'private backend path required')
    ports = [value[name] for name in ('registry_port', 'runner_port', 'wallet_port')]
    require(all(type(p) is int and 1024 <= p <= 65535 for p in ports) and len(set(ports)) == 3,
            'three distinct unprivileged ports required')
    require(type(value['grace_seconds']) is int and 0 <= value['grace_seconds'] <= 7*86400,
            'invalid development grace')
    require(type(value['max_automatic_failures']) is int and 1 <= value['max_automatic_failures'] <= 100,
            'invalid bounded automatic retry policy')
    result = dict(value)
    if 'mcp' in value:
        from mcp_broker.runtime import validate as validate_mcp
        result['mcp'] = validate_mcp(value['mcp'],occupied_ports=ports)
        require(result['mcp']['consumer_id'] in CONSUMERS, 'MCP consumer is not in the purchaser profile')
    return result


def load(path, expected_hash=None, expected_authority=None):
    path = Path(path)
    value = validate(protected_read(path, private=True))
    if expected_hash is not None:
        require(hashlib.sha256(canonical(value)).hexdigest() == expected_hash,
                'purchaser backend configuration changed')
    if expected_authority is not None:
        require(value['authority_id'] == expected_authority, 'different purchaser authority')
    return value


def credentials(state):
    path = Path(state) / 'PUBLIC-device-credentials.json'
    value = {'schema_version': 1, 'kind': 'public-development-device-credentials',
             'devices': [{'device_ref': DEVICE, 'owner_actor': 'alice', 'token': PUBLIC_TOKENS['alice']}]}
    if path.exists() or path.is_symlink():
        require(protected_read(path, private=True) == value, 'different public device fixture')
    else:
        write_marker(path, value)
    return path


def executor(state):
    require(sys.platform == 'linux', 'actual isolated executor requires Linux')
    build = Path(state) / 'tools'
    private_directory(build)
    target = build / 'runner-sandbox'
    temporary = build / ('runner-sandbox-' + uuid.uuid4().hex)
    try:
        subprocess.run(['/usr/bin/cc', '-O2', '-Wall', '-Wextra', '-Werror', '-o', str(temporary),
                        str(ROOT / 'os/runner/sandbox_launcher.c')], check=True, timeout=30,
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
        temporary.chmod(0o700)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    return IsolatedRecipeExecutor(target, ROOT / 'src/blackberryrock/recipe_worker.py',
                                  ROOT / 'os/runner/isolated_entry.py')


def open_authority(config, *, first_setup=False):
    config = validate(config)
    state = Path(config['state'])
    private_directory(state)
    if not first_setup:
        marker = protected_read(state / 'authority/wallet/AUTHORITY.json', private=True)
        require(marker.get('authority_id') == config['authority_id'], 'saved authority missing or changed')
        require('mcp' in config or not ((state/'authority/mcp').exists() or (state/'authority/mcp').is_symlink()),
                'saved MCP configuration is missing; restore the original configuration')
    authority = ClosedServiceAuthority(state / 'authority', consumers=CONSUMERS,
        device_credentials_file=credentials(state), executor=executor(state),
        grace_seconds=config['grace_seconds'], max_automatic_failures=config['max_automatic_failures'],
        registry_port=config['registry_port'], runner_port=config['runner_port'], wallet_port=config['wallet_port'],
        mcp_configuration=config.get('mcp'),mcp_create=first_setup)
    if not first_setup and authority.authority_id != config['authority_id']:
        authority.close()
        raise ValueError('saved authority changed')
    return authority


def seed(authority):
    path = authority.state / 'PUBLIC-remote-tool.rock.json'
    raw = canonical(remote_fixture())
    if path.exists():
        require(path.read_bytes() == raw and not path.is_symlink(), 'public seed Tool changed')
    else:
        with path.open('xb') as stream:
            stream.write(raw)
        path.chmod(0o600)
    fixtures = ROOT / 'os/registry/fixtures'
    packages = [path, ROOT / 'examples/registry/org.rockstar.proposal-draft--1.1.0.rock.json']
    return [publish(f'https://127.0.0.1:{authority.registry.server_port}', fixtures / 'development-ca.pem',
                    fixtures / 'PUBLIC-AUTHOR-TOKEN.txt', item,
                    'closed-seed-' + hashlib.sha256(item.read_bytes()).hexdigest(), timeout=2)
            for item in packages]


def prepare(state, output, *, registry_port=9743, runner_port=9744, wallet_port=9745,
            mcp_port=None, mcp_provider_port=None):
    state, output = Path(state), Path(output)
    require(not state.exists() and not state.is_symlink() and not output.exists() and not output.is_symlink(),
            'first setup requires a new state and configuration path')
    require((mcp_port is None) == (mcp_provider_port is None), 'both explicit MCP ports are required')
    config = {'schema': SCHEMA, 'state': str(state), 'authority_id': str(uuid.uuid4()),
                       'registry_port': registry_port, 'runner_port': runner_port, 'wallet_port': wallet_port,
                       'grace_seconds': 0, 'max_automatic_failures': 3}
    if mcp_port is not None:
        from mcp_broker.runtime import SCHEMA as MCP_SCHEMA
        config['mcp'] = {'schema':MCP_SCHEMA,'gateway_port':mcp_port,'provider_port':mcp_provider_port,
                         'consumer_id':'alice-a','alias':'memo'}
    config = validate(config)
    with open_authority(config, first_setup=True) as authority:
        if authority.mcp is not None:
            require(authority.mcp.metadata()['status'] == 'READY',
                    'first MCP setup did not complete; private failed state is retained')
        seed(authority)
        config['authority_id'] = authority.authority_id
        private_directory(output.parent)
        write_marker(output, config)
        profile = {'device': authority.device_configuration('alice-a'),
                   'wallet': authority.wallet_configuration('alice-a')}
        if authority.mcp is not None:
            profile['mcp'] = authority.mcp_configuration('alice-a')
        profile_path = state / 'PUBLIC-device-profile.json'
        write_marker(profile_path, profile)
        result = {'config': config, 'config_sha256': hashlib.sha256(canonical(config)).hexdigest(),
                'device_profile_path': str(profile_path),
                'services': authority.metadata(), 'device': authority.device_configuration('alice-a'),
                'wallet': authority.wallet_configuration('alice-a')}
        if authority.mcp is not None:
            result['mcp'] = authority.mcp_configuration('alice-a')
        return result


def run(config, ready_path):
    stopped = threading.Event()
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, lambda *_: stopped.set())
    record = {'status': 'STARTING', 'pid': os.getpid(), 'authority_id': config['authority_id'],
              'simulation_only': True, 'independent_of_os_power': True}
    authority = None
    try:
        with open_authority(config) as authority:
            receipts = seed(authority)
            require(not stopped.is_set(), 'backend startup stopped')
            record.update(status='READY', **authority.metadata(), published=receipts)
            write_marker(ready_path, record)
            while not stopped.wait(.5):
                require(all(thread.is_alive() for _, thread in authority.threads), 'backend listener stopped')
                authority.poll_optional_services()
                # Only rewrite health when an optional service changes; preserve
                # a usable core backend status during an MCP outage.
                metadata = authority.metadata()
                if metadata.get('mcp') != record.get('mcp'):
                    record.update(metadata)
                    write_marker(ready_path,record)
            record['status'] = 'STOPPED'
    except BaseException as error:
        record.update(status='FAILED', error_type=type(error).__name__)
        raise
    finally:
        if authority is not None and authority.mcp is not None:
            record['mcp'] = authority.mcp.metadata()
        write_marker(ready_path, record)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('prepare', 'run'))
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--state', type=Path)
    parser.add_argument('--ready', type=Path)
    parser.add_argument('--mcp-port', type=int)
    parser.add_argument('--mcp-provider-port', type=int)
    args = parser.parse_args()
    os.umask(0o077)
    if args.action == 'prepare':
        require(args.state is not None, 'new state required')
        result = prepare(args.state, args.config,mcp_port=args.mcp_port,mcp_provider_port=args.mcp_provider_port)
        # Protected fixture credentials belong in the profile file, never in
        # a generic preparation log or the launcher status response.
        print(json.dumps({key: value for key, value in result.items() if key not in ('device', 'wallet')},
                         ensure_ascii=False, sort_keys=True))
    else:
        require(args.ready is not None, 'private readiness path required')
        require(args.mcp_port is None and args.mcp_provider_port is None, 'run uses saved MCP ports only')
        run(load(args.config), args.ready)


if __name__ == '__main__':
    main()
