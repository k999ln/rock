"""Read and edit the accessibility tree in the current Noah guest session."""
import json
import os
import re
import subprocess

_BINARY = '/usr/local/bin/agent-desktop'


def _invoke(*args, stdin=None):
    if os.environ.get('DISPLAY') != ':99' or not os.environ.get('DBUS_SESSION_BUS_ADDRESS'):
        raise RuntimeError('No active Noah guest desktop session')
    result = subprocess.run([_BINARY, *args], input=stdin, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, encoding='utf-8', timeout=12,
                            check=False)
    if len(result.stdout) > 1024 * 1024:
        raise RuntimeError('Guest desktop response exceeds the size limit')
    if not result.stdout.strip():
        raise RuntimeError('Guest desktop command did not return a response')
    reply = json.loads(result.stdout)
    if result.returncode != 0 or reply.get('ok') is not True:
        raise RuntimeError('Guest desktop command failed: ' + str(reply.get('error', {}).get('code', 'unknown')))
    return reply['data']


def status():
    data = _invoke('status')
    accessibility = data.get('permissions', {}).get('accessibility', {}).get('state')
    if data.get('platform') != 'linux' or accessibility != 'granted' or 'window' not in data.get('supported_surfaces', []):
        raise RuntimeError('The guest Linux accessibility bus is unavailable')
    return data


def snapshot(app):
    """Read a single guest app's interactive elements and their current refs."""
    if not isinstance(app, str) or not app.strip() or app.startswith('-') or len(app) > 160:
        raise ValueError('A guest application name is required')
    return _invoke('snapshot', '--app', app, '-i')


def set_value(ref, text):
    """Set a field from the most recent guest snapshot; keep text out of argv."""
    if not isinstance(ref, str) or not re.fullmatch(r'@[a-zA-Z0-9]+:e[0-9]+', ref):
        raise ValueError('A current guest snapshot reference is required')
    if not isinstance(text, str) or len(text.encode('utf-8')) > 16384:
        raise ValueError('Guest field text exceeds the size limit')
    return _invoke('set-value', ref, '--stdin', stdin=text)
