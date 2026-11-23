"""Start a job-private display inside Noah's container; never contact a host display."""
import os
import pathlib
import signal
import subprocess
import sys
import time


def main():
    if len(sys.argv) != 2:
        return 64
    probe = sys.argv[1] == '--probe'
    entry = None if probe else pathlib.Path(sys.argv[1]).resolve()
    if not probe and (not entry.is_relative_to('/input') or not entry.is_file() or entry.suffix != '.py'):
        return 64
    # No forwarded X11, Wayland, D-Bus, audio or login state. Everything below
    # is scoped to this container's private network, /tmp, HOME and PID space.
    env = {k: v for k, v in os.environ.items() if k not in (
        'DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS',
        'PULSE_SERVER', 'XDG_RUNTIME_DIR', 'SSH_AUTH_SOCK')}
    env.update(DISPLAY=':99', HOME='/home/agent', XAUTHORITY='/tmp/noah-xauth',
               XDG_RUNTIME_DIR='/tmp/noah-session', PYTHONDONTWRITEBYTECODE='1')
    pathlib.Path(env['XDG_RUNTIME_DIR']).mkdir(mode=0o700)
    pathlib.Path(env['XAUTHORITY']).touch(mode=0o600)
    subprocess.run(['xauth', '-f', env['XAUTHORITY'], 'add', ':99', '.', os.urandom(16).hex()],
                   env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
    children = []
    stopping = False

    def stop(_signum, _frame):
        nonlocal stopping
        stopping = True
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()

    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, stop)
    try:
        display = subprocess.Popen(['Xvfb', ':99', '-screen', '0', '1280x800x24',
                                    '-nolisten', 'tcp', '-auth', env['XAUTHORITY'], '-noreset'],
                                   env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        children.append(display)
        ready = False
        for _ in range(50):
            if stopping or display.poll() is not None:
                break
            try:
                ready = subprocess.run(['xdpyinfo', '-display', ':99'], env=env,
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       timeout=1).returncode == 0
            except subprocess.TimeoutExpired:
                pass
            if ready:
                break
            time.sleep(0.1)
        if not ready or stopping:
            return 70
        wm = subprocess.Popen(['openbox'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        children.append(wm)
        # Do not race the first application with the window manager's initial
        # reparent/map pass. A display socket alone is not a ready desktop.
        managed = False
        for _ in range(50):
            if stopping or display.poll() is not None or wm.poll() is not None:
                break
            try:
                prop = subprocess.run(['xprop', '-root', '_NET_SUPPORTING_WM_CHECK'], env=env,
                                      stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=1)
                managed = prop.returncode == 0 and b'window id # 0x' in prop.stdout
            except subprocess.TimeoutExpired:
                pass
            if managed:
                break
            time.sleep(0.1)
        if not managed or stopping:
            return 70
        # Service activation can log to stdout; only the job may write to Noah's
        # JSON stream. The bus and every service it starts have a separate sink.
        address = 'unix:path=/tmp/noah-session/bus'
        env = {**env, 'DBUS_SESSION_BUS_ADDRESS': address}
        bus = subprocess.Popen(['dbus-daemon', '--session', '--nofork', '--nopidfile', '--address=' + address],
                               env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        children.append(bus)
        bus_ready = False
        for _ in range(50):
            if stopping or bus.poll() is not None:
                break
            bus_ready = pathlib.Path('/tmp/noah-session/bus').is_socket()
            if bus_ready:
                break
            time.sleep(0.1)
        if not bus_ready or stopping:
            return 70
        command = ['/usr/bin/python3', '-I', '-u', '/opt/noah/desktop_session.py',
                   '--probe' if probe else str(entry)]
        agent = subprocess.Popen(command, env=env)
        children.append(agent)
        while agent.poll() is None:
            if stopping:
                return 143
            if display.poll() is not None or wm.poll() is not None or bus.poll() is not None:
                return 70
            time.sleep(0.05)
        return agent.returncode
    finally:
        stop(None, None)
        for child in reversed(children):
            try:
                child.wait(timeout=2)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        # Keep stdout exclusively for bounded agent messages.
        print('Noah could not prepare its private display.', file=sys.stderr)
        sys.exit(70)
