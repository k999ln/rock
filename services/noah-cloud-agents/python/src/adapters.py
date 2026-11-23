"""Profile-specific imports keep unrelated official packages out of each job."""
from functools import cache
import importlib
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent / 'vendor'))
from runtime_shared import CAPABILITY, Stopped, live

@cache
def adapter(profile):
    if profile not in {'time', 'boss', 'hermes'}:
        raise ValueError('Unsupported profile')
    return importlib.import_module(profile + '_adapter')

def hermes(prompt, home):
    return adapter('hermes').hermes(prompt, home)

def boss(prompt, home):
    return adapter('boss').boss(prompt, home)
