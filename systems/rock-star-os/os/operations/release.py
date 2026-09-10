"""Use the existing fixed update verifier in source and the installed image."""
import importlib.util
from pathlib import Path

try:
    from update.rock_update import Updater, verify_envelope
except ModuleNotFoundError as error:
    if error.name not in ('update','update.rock_update'):
        raise
    # The installed updater is root-owned in the signed immutable rootfs.
    # There is no caller-supplied module path or general signing interface.
    path = Path('/usr/lib/rock-update/rock_update.py')
    spec = importlib.util.spec_from_file_location('rock_operations_update', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    Updater, verify_envelope = module.Updater, module.verify_envelope
