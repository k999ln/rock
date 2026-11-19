"""Fixed readiness probe; no inference, network, arbitrary commands or billing credentials."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def probe(worker):
    if os.getuid() == 0:
        raise RuntimeError('dedicated non-root user required')
    root = worker.ROOT
    if root.is_symlink() or root.stat().st_uid != os.getuid() or root.stat().st_mode & 0o077:
        raise RuntimeError('owner-private workspace required')
    model, path, lock = worker.selected_model()
    if path.stat().st_size != model['bytes'] or worker.digest(path) != model['sha256']:
        raise RuntimeError('installed model verification failed')
    directory = (root / 'runtime' / lock['directory']).resolve()
    if not directory.is_relative_to((root / 'runtime').resolve()):
        raise RuntimeError('runtime directory must remain in the private runtime')
    manifest = json.loads((root / 'runtime-files.json').read_text())
    for name, digest in manifest.items():
        location = (directory / name).resolve()
        if not location.is_relative_to(directory) or worker.digest(location) != digest:
            raise RuntimeError('installed runtime verification failed')
    if not (directory / 'llama-completion').is_file():
        raise RuntimeError('fixed inference executable required')
    bwrap = shutil.which('bwrap')
    if not bwrap:
        raise RuntimeError('bubblewrap required')
    mounts = []
    for location in ('/usr', '/lib', '/lib64', '/etc/ld.so.cache'):
        if Path(location).exists():
            mounts += ['--ro-bind', location, location]
    subprocess.run([bwrap, '--die-with-parent', '--unshare-user', '--unshare-pid', '--unshare-net',
                    '--unshare-ipc', '--unshare-uts', '--cap-drop', 'ALL', *mounts,
                    '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--chdir', '/tmp',
                    '--', '/usr/bin/true'], check=True, timeout=10, capture_output=True,
                   env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})
    with tempfile.NamedTemporaryFile(dir=root, prefix='.service-probe-') as out:
        content = os.urandom(32)
        out.write(content)
        out.flush()
        os.fsync(out.fileno())
        if Path(out.name).read_bytes() != content:
            raise RuntimeError('private storage readback failed')
    return {'schema': 'rockstar.linux-setup-probe/1', 'modelSha256': model['sha256'],
            'runtimeManifestSha256': hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest(),
            'isolation': 'bubblewrap-exec-true', 'privateStorageReadback': True,
            'inferenceAccepted': False}
