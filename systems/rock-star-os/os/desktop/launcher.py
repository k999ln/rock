#!/usr/bin/env python3
"""Open the actual ARM64 device through a private SSH-forwarded native display."""
import argparse
import base64
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import re
import secrets
import shlex
import shutil
import socket
import stat
import subprocess
import sys
import time
import uuid
from urllib.parse import urlencode

BROWSER_PORT = 8899
LINUX_TOOL_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'


def explicit_profile(config):
    return config.get('schema') in ('rock-desktop-launcher/2', 'rock-desktop-launcher/3')


def browser_port(config):
    return config['viewer_port'] if config.get('schema') == 'rock-desktop-launcher/3' else BROWSER_PORT


def guest_python(config):
    # Lima's non-login shell can omit /usr/sbin, where Debian installs
    # debugfs/e2fsck. Pin the same system-tool path used by OS acceptance.
    prefix = ['/usr/bin/env', 'PATH=' + LINUX_TOOL_PATH] if explicit_profile(config) else []
    return prefix + ['python3', '-B']


def require(condition, message):
    if not condition:
        raise ValueError(message)


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=kwargs.pop('timeout', 30), **kwargs)


def vm_name(config):
    return config.get('vm_name', 'rock')


def guest_source(config):
    return config.get('guest_source', '/mnt/rock-source')


def private_file(path, limit=65536):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1 and
                not info.st_mode & 0o022 and info.st_size <= limit, 'unsafe launcher configuration file')
        raw = stream.read(limit + 1)
    require(len(raw) <= limit, 'launcher configuration exceeds bound')
    return raw


def protected_directory(value, *, optional=False):
    require(type(value) is str and len(value) <= 1024, 'invalid launcher directory')
    path = Path(value)
    require(path.is_absolute() and path == path.resolve(), 'canonical launcher directory required')
    for parent in path.parents:
        info = parent.lstat()
        require(stat.S_ISDIR(info.st_mode) and (not info.st_mode & 0o022 or
                info.st_uid == 0 and info.st_mode & stat.S_ISVTX),
                'unprotected launcher directory parent')
    if optional and not path.exists(): return path
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode) and info.st_uid == os.geteuid() and
            stat.S_IMODE(info.st_mode) == 0o700, 'owned private launcher directory required')
    return path


def decode_manifest(raw):
    def unique(pairs):
        value = {}
        for key, item in pairs:
            require(key not in value, 'duplicate launcher manifest field'); value[key] = item
        return value
    value = json.loads(raw, object_pairs_hook=unique)
    require(type(value) is dict, 'launcher manifest object required')
    return value


def posix_directory(value):
    require(type(value) is str and len(value) <= 1024 and re.fullmatch(r'/[A-Za-z0-9_./-]+', value) and
            not value.startswith('//') and '..' not in PurePosixPath(value).parts and
            str(PurePosixPath(value)) == value, 'canonical guest source/image directory required')
    return value


def sha256_text(value):
    require(type(value) is str and re.fullmatch('[0-9a-f]{64}', value), 'explicit SHA256 pin required')
    return value


def check_guest_source(config):
    if not explicit_profile(config): return
    # A fixed read-only probe, not an import of the selected unverified script.
    script = '''import hashlib,json,os,stat,sys
from pathlib import Path
def check(value):
    if not value: raise ValueError('selected guest source differs')
root=Path(sys.argv[1]); path=root/'os/desktop/guest.py'
check(root.is_absolute() and root==root.resolve() and path==path.resolve())
for parent in path.parents:
    info=parent.lstat()
    check(stat.S_ISDIR(info.st_mode) and (not info.st_mode & 0o022 or info.st_uid==0 and info.st_mode & stat.S_ISVTX))
fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
with os.fdopen(fd,'rb') as source:
    info=os.fstat(source.fileno())
    check(stat.S_ISREG(info.st_mode) and info.st_uid in (0,os.geteuid()) and info.st_nlink==1 and not info.st_mode & 0o022 and info.st_size<=1048576)
    raw=source.read(1048577)
check(len(raw)<=1048576 and hashlib.sha256(raw).hexdigest()==sys.argv[2])
print(json.dumps({'source_verified':True}))'''
    try:
        result = run([config['limactl'], 'shell', '--workdir', '/', vm_name(config), 'python3', '-B', '-c', script,
                      guest_source(config), config['guest_script_sha256']], env=dict(os.environ, LIMA_HOME=config['lima_home']))
        require(json.loads(result.stdout) == {'source_verified':True}, 'selected guest source differs')
    except (ValueError, OSError, subprocess.SubprocessError):
        raise ValueError('選択した起動用ファイルを確認できません。保存データは変更していません。') from None


def remote(config, action, payload=None):
    check_guest_source(config)
    environment = dict(os.environ, LIMA_HOME=config['lima_home'])
    source = guest_source(config)
    return json.loads(run([config['limactl'], 'shell', '--workdir', source, vm_name(config), *guest_python(config),
                           source + '/os/desktop/guest.py', action, '--name', config['device']['name']],
                          env=environment, input=json.dumps(payload) if payload is not None else None,
                          timeout=60).stdout)


def load(path):
    value = decode_manifest(private_file(path))
    require(sys.platform == 'darwin', 'この起動ファイルは現在のMac用です。')
    if value.get('schema') == 'rock-desktop-launcher/1':
        require(set(value) == {'schema', 'mount_path', 'mount_uuid', 'lima_home', 'host_state', 'port', 'device'}, 'invalid launcher manifest')
        require(type(value['port']) is int and 1024 <= value['port'] <= 65535, 'invalid private display port')
        require(Path(value['mount_path']).is_mount(), '外付けのRockStarBuild保存領域を接続・マウントしてください。データの初期化は行いません。')
        info = plistlib.loads(subprocess.check_output(['/usr/sbin/diskutil', 'info', '-plist', value['mount_path']], timeout=10))
        require(info.get('VolumeUUID') == value['mount_uuid'], '接続中の保存領域が開発環境と一致しません。')
        require(Path(value['lima_home']).resolve().is_relative_to(Path(value['mount_path']).resolve()), 'VM must be on the expected external volume')
    else:
        fields = {'schema','lima_home','vm_name','vm_config_sha256','vm_identity_sha256','guest_source',
                  'guest_script_sha256','host_state','port','device'}
        if value.get('schema') == 'rock-desktop-launcher/3': fields.add('viewer_port')
        require(explicit_profile(value) and set(value) == fields, 'unknown/invalid launcher manifest')
        require(type(value['vm_name']) is str and re.fullmatch(r'[a-z0-9][a-z0-9-]{0,31}', value['vm_name']), 'invalid existing VM name')
        home = protected_directory(value['lima_home']); vm = protected_directory(str(home/value['vm_name']))
        protected_directory(value['host_state'], optional=True)
        require(not Path(value['host_state']).is_relative_to(home) and not home.is_relative_to(Path(value['host_state'])),
                'launcher host state must be separate from VM storage')
        for filename, field in (('lima.yaml','vm_config_sha256'),('vz-identifier','vm_identity_sha256')):
            require(hashlib.sha256(private_file(vm/filename)).hexdigest() == sha256_text(value[field]), 'selected existing VM identity/configuration differs')
        private_file(vm/'ssh.config')
        posix_directory(value['guest_source']); sha256_text(value['guest_script_sha256'])
        if value.get('schema') == 'rock-desktop-launcher/3':
            require(all(type(value[field]) is int and 1024 <= value[field] <= 65535 for field in ('port','viewer_port')) and
                    value['port'] != value['viewer_port'], 'distinct explicit loopback display ports required')
        else:
            require(type(value['port']) is int and value['port'] == 5909, 'local A/B browser display requires private port 5909')
        device = value['device']
        game_profile = type(device) is dict and device.get('schema') == 'rock-desktop-device/7'
        device_fields = {'schema','name','images','sha256','network','viewer','boot'}
        if game_profile: device_fields.add('game')
        require(type(device) is dict and set(device) == device_fields and
                (device['schema'] == 'rock-desktop-device/6' and device['network'] == 'none' or
                 game_profile and value['schema'] == 'rock-desktop-launcher/3' and device['network'] == 'game-authority') and
                device['viewer'] == 'browser', 'explicit local device/6 or v3 development Game device/7 required')
        posix_directory(device['images'])
        require(type(device['sha256']) is dict and set(device['sha256']) == {'Image','rootfs.ext4','stage0.cpio.gz'}, 'complete signed image triple pins required')
        for digest in device['sha256'].values(): sha256_text(digest)
        boot_fields = {'mode','profile','factory_sha256'}
        if game_profile: boot_fields.add('profile_sha256')
        require(type(device['boot']) is dict and set(device['boot']) == boot_fields and
                device['boot']['mode'] == 'signed-stage0' and
                device['boot']['profile'] == ('development-game-authority' if game_profile else 'local-development'),
                'explicit signed stage0 profile required')
        sha256_text(device['boot']['factory_sha256'])
        if game_profile:
            sha256_text(device['boot']['profile_sha256'])
            game = device['game']
            require(type(game) is dict and set(game) == {'config','sha256','authority_id'}, 'strict Game authority binding required')
            posix_directory(game['config']); sha256_text(game['sha256'])
            require(type(game['authority_id']) is str and str(uuid.UUID(game['authority_id'])) == game['authority_id'],
                    'canonical Game authority UUID required')
        value['binding_sha256'] = hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    executable = shutil.which('limactl') or '/opt/homebrew/bin/limactl'
    require(Path(executable).is_file(), '開発用VMを起動するLimaが見つかりません。')
    value['limactl'] = executable
    value['ssh_config'] = str(Path(value['lima_home']) / vm_name(value) / 'ssh.config')
    require(type(value.get('device')) is dict and type(value['device'].get('name')) is str and
            re.fullmatch(r'[a-z0-9][a-z0-9-]{0,31}', value['device']['name']), 'invalid virtual-device name')
    if value['device'].get('viewer') == 'browser':
        schemas = (('rock-desktop-device/6', 'rock-desktop-device/7') if value['schema'] == 'rock-desktop-launcher/3' else
                   ('rock-desktop-device/6',) if explicit_profile(value) else
                   ('rock-desktop-device/3', 'rock-desktop-device/4', 'rock-desktop-device/5'))
        require(value['device'].get('schema') in schemas and
                (value['schema'] == 'rock-desktop-launcher/3' or value['port'] == 5909),
                'browser display requires the selected schema and explicit private port')
    return value


def display_socket(device):
    return device['websocket_socket'] if device.get('viewer') == 'browser' else device['vnc_socket']


def verify_device_record(config, device, *, started=False):
    if not explicit_profile(config): return
    require(type(device) is dict and type(device.get('running')) is bool, 'invalid virtual-device status')
    if started: require(device['running'], 'selected virtual device did not start')
    if 'session' not in device:
        require(not device['running'] and not started, 'running device has no owned session')
        return
    expected = '/var/tmp/rock-star-desktop/' + config['device']['name']
    require(device.get('config') == config['device'] and device.get('viewer') == 'browser' and
            device.get('network') == config['device']['network'] and
            type(device.get('session')) is str and re.fullmatch(re.escape(expected) + '/sessions/[0-9a-f]{32}',device['session']),
            'saved virtual device/session belongs to different launcher settings')
    for field, filename in (('vnc_socket','vnc.sock'),('websocket_socket','websocket.sock'),('qmp_socket','qmp.sock')):
        require(device.get(field) == expected+'/'+filename, 'display socket belongs to a different virtual device')


def tunnel_listening(config, pid):
    """The selected SSH PID must own this exact IPv4 loopback listener.

    A protocol response proves endpoint readiness, not process ownership. A
    foreign process can bind after preflight while SSH is still connecting.
    macOS lsof uses kernel descriptor ownership; no endpoint is contacted here.
    """
    if not explicit_profile(config): return True
    if type(pid) is not int or pid <= 0: return False
    try:
        result = run(['/usr/sbin/lsof', '-nP', '-a', '-p', str(pid),
                      '-iTCP@127.0.0.1:' + str(config['port']), '-sTCP:LISTEN', '-FpnT'], timeout=2)
        rows = result.stdout.splitlines()
        if len(result.stdout) > 8192 or not rows or rows[0] != 'p' + str(pid): return False
        descriptors = []; current = None
        for row in rows[1:]:
            if re.fullmatch(r'f[0-9]+', row):
                current = {}; descriptors.append(current)
            elif current is not None and row.startswith('n') and 'address' not in current:
                current['address'] = row[1:]
            elif current is not None and row.startswith('TST=') and 'state' not in current:
                current['state'] = row[4:]
            elif current is not None and re.fullmatch(r'TQ[RS]=[0-9]+', row):
                pass
            else: return False
        return any(item == {'address':'127.0.0.1:' + str(config['port']), 'state':'LISTEN'}
                   for item in descriptors)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        return False


def tunnel_alive(record, config, device):
    try:
        command = run(['/bin/ps', '-p', str(record['pid']), '-o', 'command=']).stdout.strip()
        return (record['session'] == device['session'] and record['port'] == config['port'] and
                command == record['ps_command'] and '127.0.0.1:' + str(config['port']) + ':' + display_socket(device) in command
                and tunnel_listening(config, record['pid']))
    except (KeyError, OSError, subprocess.SubprocessError):
        return False


def vnc_ready(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=.3) as connection:
            return connection.recv(12).startswith(b'RFB 003.')
    except OSError:
        return False


def websocket_ready(port):
    key = base64.b64encode(secrets.token_bytes(16)).decode('ascii')
    expected = base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode('ascii')).digest()).decode('ascii')
    request = ('GET / HTTP/1.1\r\nHost: 127.0.0.1:'+str(port)+'\r\nUpgrade: websocket\r\n'
               'Connection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: binary\r\n'
               'Sec-WebSocket-Key: '+key+'\r\n\r\n').encode('ascii')
    try:
        with socket.create_connection(('127.0.0.1',port),timeout=.3) as connection:
            connection.sendall(request)
            raw=b''; deadline=time.monotonic()+.5
            while b'\r\n\r\n' not in raw and len(raw)<4096:
                remaining=deadline-time.monotonic()
                if remaining<=0: return False
                connection.settimeout(min(.3,remaining))
                part=connection.recv(4096-len(raw))
                if not part: return False
                raw+=part
            if b'\r\n\r\n' not in raw: return False
            lines=raw.split(b'\r\n\r\n',1)[0].decode('ascii').split('\r\n')
            fields={name.lower().strip():value.strip() for name,value in (line.split(':',1) for line in lines[1:])}
            return (lines[0].split()[:2] == ['HTTP/1.1','101'] and fields.get('sec-websocket-accept') == expected and
                    fields.get('upgrade','').lower() == 'websocket' and
                    'upgrade' in fields.get('connection','').lower().split(',') and fields.get('sec-websocket-protocol') == 'binary')
    except (OSError,ValueError,UnicodeError):
        return False


def save_record(path, record):
    temporary = path.with_name(path.name + '.new-' + uuid.uuid4().hex)
    with temporary.open('x') as stream:
        json.dump(record, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.chmod(0o600)
    os.replace(temporary, path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)


@contextmanager
def launcher_lock(config, state):
    if not explicit_profile(config):
        with (state/'lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX); yield
        return
    protected_directory(str(state))
    fd = os.open(state/'lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1 and
                stat.S_IMODE(info.st_mode) == 0o600, 'unsafe launcher ownership lock')
        fcntl.flock(fd,fcntl.LOCK_EX)
        binding = {'schema':'rock-desktop-launcher-binding/1','manifest_sha256':config['binding_sha256']}
        path = state/'launcher-binding.json'
        if path.exists():
            require(decode_manifest(private_file(path)) == binding, 'host display state belongs to a different launcher profile')
        else:
            require({entry.name for entry in state.iterdir()} == {'lock'}, 'existing display state has no matching launcher binding')
            save_record(path,binding)
        yield
    finally: os.close(fd)


def verify_instance(config, instance):
    require(instance.get('name') == vm_name(config), '選択した開発用VMが見つかりません。')
    if explicit_profile(config):
        require(instance.get('dir') == str(Path(config['lima_home'])/vm_name(config)) and
                instance.get('sshConfigFile') == config['ssh_config'] and
                instance.get('hostname') == 'lima-'+vm_name(config) and
                instance.get('vmType') == 'vz' and instance.get('arch') == 'aarch64',
                'selected existing VM metadata differs from launcher profile')


def stop_new_child(child):
    if child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=5)


def browser_display_url(config, device, host_state, with_credentials):
    from browser_server import ensure_viewer
    if config.get('schema') == 'rock-desktop-launcher/3':
        url = ensure_viewer(host_state, device['session'], port=browser_port(config), websocket_port=config['port'])
    else:
        url = ensure_viewer(host_state, device['session'])
    require(url == 'http://127.0.0.1:' + str(browser_port(config)) + '/index.html', 'unexpected browser viewer origin')
    if not with_credentials:
        return url, url
    credential = remote(config, 'display-secret', {'session': device['session']})
    require(isinstance(credential,dict) and set(credential) == {'session','password'} and
            credential['session'] == device['session'] and isinstance(credential['password'],str) and
            re.fullmatch(r'[A-Za-z0-9_-]{8}',credential['password']), 'display credential does not match the current session')
    # Return the fragment only to the open() call. Never persist or report it.
    return url, url+'#'+urlencode({'port':config.get('port',5909),'password':credential['password']})


def browser_port_preflight(config, state):
    if not explicit_profile(config): return
    from browser_server import healthy, fingerprint
    path = state/'viewer.json'
    if path.exists():
        record = decode_manifest(private_file(path))
        if healthy(record):
            require(record.get('build') == fingerprint(), 'existing owned viewer uses different display files')
            if config.get('schema') == 'rock-desktop-launcher/3':
                require(record.get('port') == browser_port(config) and record.get('websocket_port') == config['port'],
                        'existing owned viewer uses different pinned display ports')
            return
    # Never start the OS merely to discover a foreign static-viewer listener.
    # ensure_viewer still atomically reserves/rechecks this port later.
    with socket.socket() as probe:
        # Match ThreadingHTTPServer's address reuse: a closed viewer's TCP
        # TIME_WAIT is not a live foreign listener. SO_REUSEPORT is not used.
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe.bind(('127.0.0.1',browser_port(config))); probe.listen(1)


def launch(config, open_window=True):
    state = Path(config['host_state'])
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(state.is_dir() and not state.is_symlink(), 'unsafe launcher state directory')
    with launcher_lock(config,state):
        environment = dict(os.environ, LIMA_HOME=config['lima_home'])
        selected = vm_name(config); alias = 'lima-' + selected
        listing = run([config['limactl'], 'list', '--json', selected], env=environment).stdout
        instances = [json.loads(line) for line in listing.splitlines() if line.strip()]
        require(len(instances) == 1, '既存の開発用VMが見つかりません。')
        verify_instance(config,instances[0])
        if instances[0].get('status') != 'Running':
            print('選択した開発環境を起動しています。', flush=True)
            run([config['limactl'], 'start', '--tty=false', selected], env=environment, timeout=120)
            if explicit_profile(config):
                current = [json.loads(line) for line in run([config['limactl'],'list','--json',selected],env=environment).stdout.splitlines() if line.strip()]
                require(len(current) == 1 and current[0].get('status') == 'Running', 'selected VM did not reach Running')
                verify_instance(config,current[0])
        ssh = ['/usr/bin/ssh', '-F', config['ssh_config'], '-S', 'none', '-o', 'ControlMaster=no',
               '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2']
        settings = run(ssh + ['-G', alias]).stdout
        require('\nhostname 127.0.0.1\n' in '\n' + settings, 'display tunnel must end on this Mac')
        record_path = state / 'tunnel.json'
        record = (decode_manifest(private_file(record_path)) if explicit_profile(config)
                  else json.loads(record_path.read_text())) if record_path.exists() else {}
        previous = remote(config, 'status')
        verify_device_record(config,previous)
        browser_port_preflight(config,state)
        if not previous.get('running') or not tunnel_alive(record, config, previous):
            # Refuse a foreign listener before starting a new OS instance.
            with socket.socket() as probe:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                probe.bind(('127.0.0.1', config['port']))
                probe.listen(1)
        device = remote(config, 'start', config['device'])
        verify_device_record(config,device,started=True)
        browser = device.get('viewer') == 'browser'
        display_ready = websocket_ready if browser else vnc_ready
        owned = tunnel_alive(record, config, device)
        if not owned:
            with socket.socket() as probe:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                probe.bind(('127.0.0.1', config['port']))
                probe.listen(1)
            wait_command = shlex.join([*guest_python(config),guest_source(config)+'/os/desktop/guest.py','wait','--name',config['device']['name']])
            command = ssh + ['-L', '127.0.0.1:' + str(config['port']) + ':' + display_socket(device), alias, wait_command]
            with (state / 'display-tunnel.log').open('ab') as log:
                child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                         start_new_session=True, close_fds=True)
            try:
                deadline = time.monotonic() + 15
                while True:
                    require(child.poll() is None, '表示接続を開始できませんでした。OSデータは保持されています。')
                    ready = display_ready(config['port'])
                    require(child.poll() is None, '表示接続を開始できませんでした。OSデータは保持されています。')
                    if ready:
                        require(tunnel_listening(config, child.pid), '表示ポートの所有者が選択した接続と一致しません。')
                    require(time.monotonic() < deadline, '表示接続に時間がかかっています。OSデータは保持されています。')
                    if ready: break
                    time.sleep(.2)
                record = {'pid': child.pid, 'session': device['session'], 'port': config['port'],
                          'ps_command': run(['/bin/ps', '-p', str(child.pid), '-o', 'command=']).stdout.strip()}
                save_record(record_path, record)
            except BaseException:
                stop_new_child(child)
                raise
        try:
            require(display_ready(config['port']), 'OSの画面にまだ接続できません。')
            # Recheck after readiness and before retrieving any display credential.
            require(tunnel_listening(config, record['pid']), '表示ポートの所有者が選択した接続と一致しません。')
            if not owned:
                require(child.poll() is None, '表示接続を開始できませんでした。OSデータは保持されています。')
                require(time.monotonic() < deadline, '表示接続に時間がかかっています。OSデータは保持されています。')
        except BaseException:
            if not owned: stop_new_child(child)
            raise
        display = 'vnc://127.0.0.1:' + str(config['port'])
        opened_url = display
        if browser:
            require(config.get('schema') == 'rock-desktop-launcher/3' or config['port'] == 5909,
                    'browser display requires the explicit private port')
            display, opened_url = browser_display_url(config, device, state, open_window)
        if open_window:
            # Do not surface a CalledProcessError containing its argv: browser
            # open arguments briefly contain the session credential fragment.
            try:
                subprocess.run(['/usr/bin/open', opened_url], check=True, timeout=10,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except subprocess.SubprocessError:
                raise ValueError('画面を開けませんでした。接続とOSデータは保持されています。') from None
            finally:
                opened_url = None
        services = {'status': 'DISABLED'}
        if config['device'].get('network') in ('development-services', 'closed-services'):
            try:
                services = remote(config, 'services')
            except (ValueError, OSError, subprocess.SubprocessError) as error:
                # A usable display is already recorded/open. The user can keep
                # using local tools or normally shut down the OS from its UI.
                services = {'status': 'UNAVAILABLE', 'error_type': type(error).__name__,
                            'message': '補助サービスを起動できませんでした。OS の画面は利用できます。画面内の電源操作で終了できます。'}
        return {'running': True, 'display': display, 'session': device['session'],
                'blackberry': 'NOT_RUN', 'wallet': 'SIMULATOR_ONLY', 'network': device['network'], 'services': services}


def backup_profile(config):
    if not explicit_profile(config): return remote(config,'backup')
    state = protected_directory(config['host_state'])
    require((state/'launcher-binding.json').exists(), 'backup requires this launcher profile to have an existing saved binding')
    with launcher_lock(config,state):
        current = remote(config,'status')
        verify_device_record(config,current)
        require(current.get('running') is False and 'session' in current,
                'この起動ファイルで利用した OS を、画面内の電源操作で終了してから保存してください。')
        # Device markers are immutable under the existing guest start contract;
        # the actual stopped check and full copy stay under backup.locked.
        result = remote(config,'backup')
        require(type(result) is dict and result.get('status') == 'SAVED' and
                result.get('schema') == 'rock-desktop-backup/2' and result.get('source_device') == config['device']['name'] and
                result.get('config') == config['device'], 'saved backup differs from the selected launcher profile')
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--no-open', action='store_true')
    parser.add_argument('--status', action='store_true')
    parser.add_argument('--backup', action='store_true', help='save a verified copy after normal OS shutdown')
    args = parser.parse_args()
    config = load(args.manifest)
    require(not (args.status and args.backup),'choose one operation')
    result = backup_profile(config) if args.backup else remote(config, 'status') if args.status else launch(config, not args.no_open)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if args.backup:
        print('終了済みOSのデータを、検証付きバックアップに保存しました。')
    elif not args.status:
        if result.get('services', {}).get('status') == 'UNAVAILABLE':
            print(result['services']['message'])
        print(('Rock star os の画面接続を準備しました。' if args.no_open else 'Rock star os の実画面を開きました。')+
              '起動には少し時間がかかります。\n画面を閉じてもOSは動作を続けます。終了時はOS内の電源操作を使ってください。')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print('Rock star os: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
