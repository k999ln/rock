#!/usr/bin/env python3
"""Open the actual ARM64 device through a private SSH-forwarded native display."""
import argparse
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import secrets
import shlex
import shutil
import socket
import subprocess
import sys
import time
import uuid
from urllib.parse import urlencode


def require(condition, message):
    if not condition:
        raise ValueError(message)


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=kwargs.pop('timeout', 30), **kwargs)


def remote(config, action, payload=None):
    environment = dict(os.environ, LIMA_HOME=config['lima_home'])
    return json.loads(run([config['limactl'], 'shell', '--workdir', '/mnt/rock-source', 'rock', 'python3', '-B',
                           '/mnt/rock-source/os/desktop/guest.py', action, '--name', config['device']['name']],
                          env=environment, input=json.dumps(payload) if payload is not None else None,
                          timeout=60).stdout)


def load(path):
    value = json.loads(path.read_text())
    require(set(value) == {'schema', 'mount_path', 'mount_uuid', 'lima_home', 'host_state', 'port', 'device'}, 'invalid launcher manifest')
    require(value['schema'] == 'rock-desktop-launcher/1', 'unknown launcher manifest')
    require(sys.platform == 'darwin', 'この起動ファイルは現在のMac用です。')
    require(type(value['port']) is int and 1024 <= value['port'] <= 65535, 'invalid private display port')
    require(Path(value['mount_path']).is_mount(), '外付けのRockStarBuild保存領域を接続・マウントしてください。データの初期化は行いません。')
    info = plistlib.loads(subprocess.check_output(['/usr/sbin/diskutil', 'info', '-plist', value['mount_path']], timeout=10))
    require(info.get('VolumeUUID') == value['mount_uuid'], '接続中の保存領域が開発環境と一致しません。')
    require(Path(value['lima_home']).resolve().is_relative_to(Path(value['mount_path']).resolve()), 'VM must be on the expected external volume')
    executable = shutil.which('limactl') or '/opt/homebrew/bin/limactl'
    require(Path(executable).is_file(), '開発用VMを起動するLimaが見つかりません。')
    value['limactl'] = executable
    value['ssh_config'] = str(Path(value['lima_home']) / 'rock/ssh.config')
    require(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,31}', value['device']['name']), 'invalid virtual-device name')
    if value['device'].get('viewer') == 'browser':
        require(value['device'].get('schema') in ('rock-desktop-device/3', 'rock-desktop-device/4', 'rock-desktop-device/5') and value['port'] == 5909,
                'browser display requires schema 3/4/5 and private port 5909')
    return value


def display_socket(device):
    return device['websocket_socket'] if device.get('viewer') == 'browser' else device['vnc_socket']


def tunnel_alive(record, config, device):
    try:
        command = run(['/bin/ps', '-p', str(record['pid']), '-o', 'command=']).stdout.strip()
        return (record['session'] == device['session'] and record['port'] == config['port'] and
                command == record['ps_command'] and '127.0.0.1:' + str(config['port']) + ':' + display_socket(device) in command)
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
    url = ensure_viewer(host_state, device['session'])
    require(url == 'http://127.0.0.1:8899/index.html', 'unexpected browser viewer origin')
    if not with_credentials:
        return url, url
    credential = remote(config, 'display-secret', {'session': device['session']})
    require(isinstance(credential,dict) and set(credential) == {'session','password'} and
            credential['session'] == device['session'] and isinstance(credential['password'],str) and
            re.fullmatch(r'[A-Za-z0-9_-]{8}',credential['password']), 'display credential does not match the current session')
    # Return the fragment only to the open() call. Never persist or report it.
    return url, url+'#'+urlencode({'port':5909,'password':credential['password']})


def launch(config, open_window=True):
    state = Path(config['host_state'])
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(state.is_dir() and not state.is_symlink(), 'unsafe launcher state directory')
    with (state / 'lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        environment = dict(os.environ, LIMA_HOME=config['lima_home'])
        listing = run([config['limactl'], 'list', '--json', 'rock'], env=environment).stdout
        instances = [json.loads(line) for line in listing.splitlines() if line.strip()]
        require(len(instances) == 1 and instances[0].get('name') == 'rock', '既存の開発用VMが見つかりません。')
        if instances[0].get('status') != 'Running':
            print('外付けの開発環境を起動しています。', flush=True)
            run([config['limactl'], 'start', '--tty=false', 'rock'], env=environment, timeout=120)
        ssh = ['/usr/bin/ssh', '-F', config['ssh_config'], '-S', 'none', '-o', 'ControlMaster=no',
               '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2']
        settings = run(ssh + ['-G', 'lima-rock']).stdout
        require('\nhostname 127.0.0.1\n' in '\n' + settings, 'display tunnel must end on this Mac')
        record_path = state / 'tunnel.json'
        record = json.loads(record_path.read_text()) if record_path.exists() else {}
        previous = remote(config, 'status')
        if not previous.get('running') or not tunnel_alive(record, config, previous):
            # Refuse a foreign listener before starting a new OS instance.
            with socket.socket() as probe:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                probe.bind(('127.0.0.1', config['port']))
                probe.listen(1)
        device = remote(config, 'start', config['device'])
        browser = device.get('viewer') == 'browser'
        display_ready = websocket_ready if browser else vnc_ready
        owned = tunnel_alive(record, config, device)
        if not owned:
            with socket.socket() as probe:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                probe.bind(('127.0.0.1', config['port']))
                probe.listen(1)
            command = ssh + ['-L', '127.0.0.1:' + str(config['port']) + ':' + display_socket(device),
                             'lima-rock', 'python3 -B /mnt/rock-source/os/desktop/guest.py wait --name ' + shlex.quote(config['device']['name'])]
            with (state / 'display-tunnel.log').open('ab') as log:
                child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                         start_new_session=True, close_fds=True)
            try:
                deadline = time.monotonic() + 15
                while not display_ready(config['port']):
                    require(child.poll() is None, '表示接続を開始できませんでした。OSデータは保持されています。')
                    require(time.monotonic() < deadline, '表示接続に時間がかかっています。OSデータは保持されています。')
                    time.sleep(.2)
                record = {'pid': child.pid, 'session': device['session'], 'port': config['port'],
                          'ps_command': run(['/bin/ps', '-p', str(child.pid), '-o', 'command=']).stdout.strip()}
                save_record(record_path, record)
            except BaseException:
                stop_new_child(child)
                raise
        require(display_ready(config['port']), 'OSの画面にまだ接続できません。')
        display = 'vnc://127.0.0.1:' + str(config['port'])
        opened_url = display
        if browser:
            require(config['port'] == 5909, 'browser display requires private port 5909')
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--no-open', action='store_true')
    parser.add_argument('--status', action='store_true')
    parser.add_argument('--backup', action='store_true', help='save a verified copy after normal OS shutdown')
    args = parser.parse_args()
    config = load(args.manifest)
    require(not (args.status and args.backup),'choose one operation')
    result = remote(config,'backup') if args.backup else remote(config, 'status') if args.status else launch(config, not args.no_open)
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
