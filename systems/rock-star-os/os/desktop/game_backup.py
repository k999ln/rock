#!/usr/bin/env python3
"""One stopped OS/authority backup and recoverable same-host current-copy restore.

This component never imports historical authority data. The sandbox CLI retains
the existing C/router/Game databases and verifies its current-copy transaction.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT/'os'), str(ROOT/'src')]
import backup as b
import guest
from stage0 import DISKS, stopped_slots
from wallet_backend.authority_fence import private_directory, private_file, read_json, write_json

BASE = Path('/var/tmp/rockstaros-preview-backups')
SCHEMA = 'rock-desktop-game-backup/1'
GATE = 'rock-game-desktop-restore/1'


def require(value, message):
    guest.require(value, message)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def hash_json(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def decode(raw):
    def unique(pairs):
        value = {}
        for key, item in pairs:
            require(key not in value, 'duplicate transaction metadata field')
            value[key] = item
        return value
    def nonfinite(_): raise ValueError('nonfinite transaction metadata')
    return json.loads(raw, object_pairs_hook=unique, parse_constant=nonfinite)


def identity(value):
    require(type(value) is str and str(uuid.UUID(value)) == value, 'canonical restore/backup UUID required')
    return value


def name(value):
    require(type(value) is str and re.fullmatch('[a-z0-9][a-z0-9-]{0,31}', value), 'valid new device name required')
    return value


def stopped(state):
    marker = state/'running.json'
    require(not os.path.lexists(marker) or not guest.running(read_json(marker)), 'OS must remain stopped during the complete backup/restore')
    for item in ('vnc.sock', 'qmp.sock', 'websocket.sock'):
        guest.remove_stale_socket(state/item)


def device(config):
    guest.validate_config(config)
    require(config['schema'] == 'rock-desktop-device/7', 'explicit Game authority device required')
    from game_exchange import sandbox
    path = Path(config['game']['config'])
    require(guest.digest(path) == config['game']['sha256'], 'Game configuration hash differs')
    result = sandbox.load(path)
    require(result['authority_id'] == config['game']['authority_id'], 'Game authority identity differs')
    return result


def authority(config, action, *, backup=None, intent=None, new_device=None):
    """The public sandbox CLI remains the only authority mutation entry point."""
    command = [sys.executable, '-B', str(ROOT/'os/game_exchange/sandbox.py'), action,
               '--config', config['game']['config']]
    if backup is not None: command += ['--backup', str(backup), '--intent', identity(intent)]
    if new_device is not None: command += ['--new-device', name(new_device)]
    result = subprocess.run(command, capture_output=True, text=True, check=True, timeout=180)
    require(len(result.stdout.encode()) <= 262144, 'bounded authority receipt required')
    receipt = decode(result.stdout)
    require(type(receipt) is dict and receipt.get('authority_id') == config['game']['authority_id'] and
            receipt.get('config_sha256') == config['game']['sha256'] and receipt.get('simulation_only') is True,
            'authority receipt identity/configuration differs')
    if action == 'stop':
        require(receipt.get('schema') == 'rock-game-sandbox-status/1' and receipt.get('running') is False,
                'every authority writer must be stopped')
    elif action == 'snapshot-current':
        require(receipt.get('schema') == 'rock-game-sandbox-backup-receipt/1' and receipt.get('backup_id') == intent and
                receipt.get('manifest_sha256') == guest.digest(Path(backup)/'manifest.json'), 'authority backup receipt differs')
    elif action == 'restore-current':
        require(receipt.get('schema') == 'rock-game-sandbox-current-restore-receipt/1' and receipt.get('status') == 'DONE' and
                receipt.get('intent') == intent and receipt.get('new_device') == new_device and
                receipt.get('backup_manifest_sha256') == guest.digest(Path(backup)/'manifest.json') and
                receipt.get('source_retired') is True and receipt.get('same_host_current_copy_only') is True,
                'completed current-copy authority receipt required')
    else: raise ValueError('unsupported authority action')
    return receipt


def bundle_root(path):
    path = Path(path)
    require(path.parent == BASE and identity(path.name), 'owned installation backup UUID directory required')
    private_directory(BASE)
    return private_directory(path)


def inventory(os_path, authority_path, authority_manifest):
    sources = {'os/'+item: os_path/item for item in ('backup.json', *DISKS)}
    sources.update({'authority/'+item: authority_path/item for item in ('plan.json', 'manifest.json')})
    sources.update({'authority/files/'+item: authority_path/'files'/item for item in authority_manifest['files']})
    result = {}
    for member, path in sorted(sources.items()):
        require(path.resolve() == path, 'backup inventory cannot follow symlinks')
        fd = private_file(path)
        try: info = os.fstat(fd)
        finally: os.close(fd)
        result[member] = {'source': str(path), 'sha256': guest.digest(path), 'bytes': info.st_size}
    require(len(result) <= 264 and sum(item['bytes'] for item in result.values()) <= 7*1024**3,
            'complete backup inventory exceeds bound')
    return result


def verify_bundle(path, config):
    from game_exchange.sandbox_backup import verify_archive
    sandbox_config = device(config)
    root = bundle_root(path); report = read_json(root/'backup.json')
    require(set(report) == {'schema', 'backup', 'backup_id', 'source_device', 'config', 'os', 'authority', 'files',
                           'simulation_only', 'encrypted', 'restore_scope'} and
            report['schema'] == SCHEMA and report['backup'] == str(root) and report['backup_id'] == root.name and
            report['config'] == config and report['source_device'] == config['name'] and
            report['simulation_only'] is True and report['encrypted'] is False, 'complete backup ownership binding differs')
    os_path = Path(report['os']['backup'])
    require(os_path.parent == guest.BASE/config['name']/'backups' and os_path.resolve() == os_path,
            'OS backup is outside this device')
    private_directory(os_path)
    os_report = b.read_metadata(os_path/'backup.json')
    require(os_report['config'] == config and os_report['source_device'] == config['name'] and
            guest.digest(os_path/'backup.json') == report['os']['manifest_sha256'], 'OS backup metadata differs')
    b.validate_stage0_backup(os_path, os_report)
    authority_path, authority_manifest = verify_archive(sandbox_config, root/'authority')
    require(report['authority']['backup'] == str(authority_path) and
            report['authority']['receipt']['manifest_sha256'] == guest.digest(authority_path/'manifest.json') and
            report['authority']['receipt']['backup_id'] == root.name, 'authority archive binding differs')
    require(b.exact_json(inventory(os_path, authority_path, authority_manifest), report['files']), 'complete backup inventory changed')
    return root, report, os_path, os_report, authority_path


def create(config, intent):
    from game_exchange.sandbox_backup import verify_archive, desktop_ready
    sandbox_config = device(config); identity(intent)
    source = guest.state_path(config['name'])
    with b.locked(source):
        require(read_json(source/'device.json') == config, 'source OS configuration differs')
        stopped(source); desktop_ready(sandbox_config['state'], config['name'])
        authority(config, 'stop')
        private_directory(BASE, create=True); root = BASE/intent
        require(not os.path.lexists(root), 'backup intent already exists; preserve its evidence')
        private_directory(root, create=True)
        os_report = b.create_stage0_backup(config['name'], source, config)
        os_path = Path(os_report['backup'])
        receipt = authority(config, 'snapshot-current', backup=root/'authority', intent=intent)
        _, authority_manifest = verify_archive(sandbox_config, root/'authority')
        require(all(guest.digest(source/item) == os_report['disks'][item]['sha256'] for item in DISKS),
                'OS changed while authority was saved; complete backup refused')
        report = {'schema': SCHEMA, 'backup': str(root), 'backup_id': intent, 'source_device': config['name'], 'config': config,
                  'os': {'backup': str(os_path), 'manifest_sha256': guest.digest(os_path/'backup.json')},
                  'authority': {'backup': str(root/'authority'), 'receipt': receipt},
                  'files': inventory(os_path, root/'authority', authority_manifest), 'simulation_only': True, 'encrypted': False,
                  'restore_scope': 'same owned VM and unchanged current authority; original writers stopped; new device only'}
        write_json(root/'backup.json', report)
        verify_bundle(root, config)
        return report


def current_os(source, config, os_report):
    stopped(source)
    require(read_json(source/'device.json') == config, 'current source OS configuration changed')
    for item in DISKS:
        fd = private_file(source/item)
        os.close(fd)
    require(all(guest.digest(source/item) == os_report['disks'][item]['sha256'] and
                (source/item).stat().st_size == os_report['disks'][item]['bytes'] for item in DISKS),
            'OS backup is no longer current; historical rollback refused')


def preflight(config, path, intent, new_device, retired):
    """Reject ordinary stale backups before the host enters RESTORE_PENDING."""
    from game_exchange.sandbox_backup import desktop_ready
    identity(intent); name(new_device)
    root, report, os_path, os_report, authority_path = verify_bundle(path, config)
    require(type(retired) is list and len(retired) <= 63 and len(set(retired)) == len(retired), 'bounded unique retired devices required')
    for item in retired: name(item)
    require(new_device != config['name'] and new_device not in retired and config['name'] not in retired and
            len(retired) <= 63, 'new unretired restore device required')
    state = device(config)['state']; desktop_ready(state, config['name'])
    gate_path = Path(state)/'desktop-restore.json'
    if os.path.lexists(gate_path):
        gate = read_json(gate_path)
        require(gate['new_device'] == config['name'] and gate['retired_devices'] == retired, 'restore retirement chain differs')
    else: require(not retired, 'retired device gate is missing')
    source = guest.state_path(config['name']); destination = guest.BASE/new_device
    with b.locked(source):
        current_os(source, config, os_report)
        if os.path.lexists(destination):
            private_directory(destination)
            require({item.name for item in destination.iterdir()} <= {'lock'}, 'existing destination cannot be adopted')
        # An existing READY snapshot returns its original receipt only if every
        # current table and retained identity still matches. No historical import.
        receipt = authority(config, 'snapshot-current', backup=authority_path, intent=root.name)
        require(b.exact_json(receipt, report['authority']['receipt']), 'current authority no longer matches backup')
    return {'schema': 'rock-desktop-game-restore-preflight/1', 'status': 'READY', 'intent': intent,
            'backup': str(root), 'source_device': config['name'], 'new_device': new_device, 'simulation_only': True}


def prepare_gate(state, binding, retired):
    from game_exchange.sandbox_backup import desktop_ready
    require(type(retired) is list and len(retired) <= 63 and len(set(retired)) == len(retired), 'bounded unique prior retired devices required')
    for item in retired: name(item)
    require(binding['source_device'] not in retired and binding['new_device'] not in retired and
            binding['source_device'] != binding['new_device'], 'source/new device is retired or reused')
    gate = {'schema': GATE, **binding, 'state': 'PENDING', 'retired_devices': [*retired, binding['source_device']]}
    path = Path(state)/'desktop-restore.json'
    if os.path.lexists(path):
        old = read_json(path)
        if old.get('intent') == binding['intent']:
            require(b.exact_json({**old, 'state': 'PENDING'}, gate) and old['state'] in ('PENDING', 'DONE'),
                    'restore gate belongs to another transaction')
            return old
        desktop_ready(state, binding['source_device'])
        require(old['new_device'] == binding['source_device'] and old['retired_devices'] == retired,
                'restore retirement chain differs')
    else: require(not retired, 'retired device gate is missing')
    write_json(path, gate)
    return gate


def restore_os(os_path, os_report, destination, config, binding, authority_receipt):
    """Recover only our fresh, unbooted destination under its exact intent."""
    allowed = {'lock', 'restore-intent.json', 'device.json', 'restored.json', *DISKS}
    require(read_json(destination/'restore-intent.json') == binding, 'OS component restore intent differs')
    # Atomic metadata writes may leave a private mkstemp file after SIGKILL.
    # The exact durable intent proves this was our fresh unbooted destination.
    # Validate every unexpected name before removing any known writer temporary.
    temporary = []
    for path in destination.iterdir():
        if path.name in allowed: continue
        require(re.fullmatch(r'\.gx00-[a-z0-9_]{8}', path.name),
                'restore destination has unrelated or activated state; preserve it')
        fd = private_file(path)
        try: require(os.fstat(fd).st_size <= 262144, 'restore metadata temporary exceeds bound')
        finally: os.close(fd)
        temporary.append(path)
    for path in temporary: path.unlink()
    new_config = {**config, 'name': binding['new_device']}
    if (destination/'device.json').exists():
        require(read_json(destination/'device.json') == new_config, 'restored device configuration changed')
    if (destination/'restored.json').exists():
        receipt = read_json(destination/'restored.json')
        require(receipt.get('binding') == binding and receipt.get('authority') == authority_receipt,
                'completed OS receipt differs')
        # Completed destinations may be observed again, but never overwritten.
        verify_restored(destination, new_config, os_report)
        return receipt
    for item in DISKS:
        path = destination/item; expected = os_report['disks'][item]
        if os.path.lexists(path):
            fd = private_file(path)
            try: info = os.fstat(fd)
            finally: os.close(fd)
            if info.st_size == expected['bytes'] and guest.digest(path) == expected['sha256']: continue
            # The durable exact intent preceded every file in this fresh target.
            # No boot/runtime member is allowed above. Only our partial copy is replaced.
            path.unlink()
        copied, count = b.copy_data(os_path/item, path)
        require({'sha256': copied, 'bytes': count} == expected, 'OS restore copy differs')
    verification = verify_restored(destination, new_config, os_report)
    write_json(destination/'device.json', new_config)
    receipt = {'schema': 'rock-desktop-game-restore/1', 'status': 'RESTORED', 'binding': binding,
               'device': binding['new_device'], 'config': new_config, 'disks': os_report['disks'], 'update': os_report['update'],
               'authority': authority_receipt, 'filesystem_check': verification, 'original_device_preserved': True,
               'source_retired': True, 'simulation_only': True, 'same_host_current_copy_only': True}
    write_json(destination/'restored.json', receipt)
    return receipt


def verify_restored(destination, config, os_report):
    for item in DISKS:
        fd = private_file(destination/item)
        os.close(fd)
    verification = b.check_disk(destination/'userdata.ext4')
    require(b.exact_json(stopped_slots(config, destination), os_report['update']) and
            all(guest.digest(destination/item) == os_report['disks'][item]['sha256'] and
                (destination/item).stat().st_size == os_report['disks'][item]['bytes'] for item in DISKS),
            'restored OS final disk/update verification failed')
    return verification


def restore(config, path, intent, new_device, retired):
    identity(intent); name(new_device)
    root, report, os_path, os_report, authority_path = verify_bundle(path, config)
    sandbox_config = device(config)
    source = guest.state_path(config['name']); destination = guest.state_path(new_device)
    require(source != destination, 'new restore device is required')
    binding = {'intent': intent, 'source_device': config['name'], 'new_device': new_device,
               'os_backup_sha256': report['os']['manifest_sha256'],
               'authority_manifest_sha256': report['authority']['receipt']['manifest_sha256']}
    with b.locked(source), b.locked(destination):
        current_os(source, config, os_report)
        marker = destination/'restore-intent.json'
        if os.path.lexists(marker): require(read_json(marker) == binding, 'destination restore intent differs')
        else:
            require({item.name for item in destination.iterdir()} <= {'lock'}, 'existing destination cannot be adopted')
            write_json(marker, binding)
        gate = prepare_gate(sandbox_config['state'], binding, retired)
        authority_receipt = authority(config, 'restore-current', backup=authority_path, intent=intent, new_device=new_device)
        receipt = restore_os(os_path, os_report, destination, config, binding, authority_receipt)
        # The sandbox verifies its entire persisted post-snapshot on retry. Keep
        # all writers fenced until both components independently agree again.
        require(b.exact_json(authority(config, 'restore-current', backup=authority_path, intent=intent, new_device=new_device), authority_receipt),
                'authority completion changed while restoring OS')
        verify_restored(destination, receipt['config'], os_report)
        write_json(Path(sandbox_config['state'])/'desktop-restore.json', {**gate, 'state': 'DONE'})
        return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('backup', 'check-restore', 'restore'))
    parser.add_argument('--intent', required=True); parser.add_argument('--backup', type=Path); parser.add_argument('--name')
    args = parser.parse_args(); os.umask(0o077)
    raw = sys.stdin.buffer.read(65537); require(len(raw) <= 65536, 'bounded complete restore request required')
    request = decode(raw)
    require(type(request) is dict and set(request) == {'config', 'retired_devices'}, 'exact OS transaction request required')
    if args.action == 'backup': result = create(request['config'], args.intent)
    else:
        function = preflight if args.action == 'check-restore' else restore
        result = function(request['config'], args.backup, args.intent, args.name, request['retired_devices'])
    print(canonical(result).decode())


if __name__ == '__main__': main()
