"""Entered on the job-private D-Bus session after the guest X server is ready."""
import json
import pathlib
import runpy
import sys
import noah_desktop

if len(sys.argv) != 2:
    sys.exit(64)

# Check the actual released CLI and its session before accepting a job.
noah_desktop.status()
if sys.argv[1] == '--probe':
    print(json.dumps({'type': 'probe', 'schema': 'noah-desktop/1', 'displayReady': True,
                      'driver': 'agent-desktop/1.3.1'}), flush=True)
else:
    entry = pathlib.Path(sys.argv[1]).resolve()
    if not entry.is_relative_to('/input') or not entry.is_file() or entry.suffix != '.py':
        sys.exit(64)
    sys.path.insert(0, str(entry.parent))
    runpy.run_path(str(entry), run_name='__main__')
