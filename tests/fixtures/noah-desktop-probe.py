"""Drive a synthetic GTK application exclusively inside the isolated work container."""
import json
import os
import pathlib
import subprocess
import sys
import time
import noah_desktop

# Linux resolves a GTK app to the registered executable name.
APP = pathlib.Path(sys.executable).resolve().name
FIELD = 'Noah private input'
OBSERVED = pathlib.Path('/workspace/observed.txt')
EDITOR = """
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import GLib, Gtk
from pathlib import Path
GLib.set_prgname('noah-guest-editor')
GLib.set_application_name('noah-guest-editor')
window = Gtk.Window(title='Noah guest editor')
field = Gtk.Entry()
field.get_accessible().set_name('Noah private input')
field.connect('changed', lambda entry: Path('/workspace/observed.txt').write_text(entry.get_text()))
window.add(field)
window.show_all()
Gtk.main()
"""


def field_in(node):
    if node.get('name') == FIELD and node.get('ref_id'):
        return node
    for child in node.get('children', []):
        match = field_in(child)
        if match:
            return match
    return None


request = json.loads(sys.stdin.readline())
editor = subprocess.Popen(['/usr/bin/python3', '-I', '-c', EDITOR], stdout=subprocess.DEVNULL)
try:
    field = None
    deadline = time.monotonic() + 20
    while not field and editor.poll() is None and time.monotonic() < deadline:
        try:
            field = field_in(noah_desktop.snapshot(APP)['tree'])
        except RuntimeError:
            pass
        if not field:
            time.sleep(0.15)
    if not field:
        raise RuntimeError('Guest editor is not visible to the accessibility adapter')
    noah_desktop.set_value(field['ref_id'], 'noah-private-input')
    deadline = time.monotonic() + 3
    while not OBSERVED.exists() and time.monotonic() < deadline:
        time.sleep(0.05)
    screenshot = pathlib.Path('/workspace/probe.png')
    subprocess.run(['scrot', str(screenshot)], check=True, timeout=5)
    checks = {
        'screenshotCreated': screenshot.stat().st_size > 0,
        'readWithAgentDesktop': field_in(noah_desktop.snapshot(APP)['tree']) is not None,
        'typedInGuest': OBSERVED.read_text() == 'noah-private-input',
        'guestDisplay': os.environ.get('DISPLAY') == ':99',
        'nonRoot': os.getuid() != 0,
        'noHostHome': not pathlib.Path('/Users').exists() and not pathlib.Path('/Volumes').exists(),
        'noInputDevice': not pathlib.Path('/dev/input').exists(),
        'noDaemonSocket': not pathlib.Path('/var/run/docker.sock').exists(),
    }
    if not all(checks.values()):
        raise RuntimeError('Private desktop checks failed')
    if request['prompt'] == 'hold-for-stop':
        editor.wait()
    else:
        print(json.dumps({'type': 'result', 'text': json.dumps(checks), 'files': [], 'exitCode': 0}), flush=True)
finally:
    editor.terminate()
    editor.wait(timeout=4)
