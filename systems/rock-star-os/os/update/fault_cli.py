"""Test-build-only CLI wrapper. Normal rock-update never imports this file."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from rock_update import Updater, main
from test_faults import kernel_fault

if __name__ == '__main__':
    raise SystemExit(main(updater=Updater(fault_hook=kernel_fault())))
