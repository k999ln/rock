"""Host acceptance observer only: never distributed with the PC toolkit.

Normal modes wrap observation points but retain the real fixed CLI execution.
term-fixture is explicitly a synthetic fault process for shutdown regression.
"""
import argparse
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=('adapter', 'mcp', 'term-fixture'))
parser.add_argument('toolkit', type=Path)
args = parser.parse_args()
sys.path.insert(0, str(args.toolkit.resolve()))
import pc_citations

observed = []
original_spawn = pc_citations._spawn
original_collect = pc_citations._collect
original_run = pc_citations.run_citations


def emit(value):
    print(json.dumps(value), file=sys.__stderr__, flush=True)


def spawn(directory):
    if args.mode == 'term-fixture':
        process = subprocess.Popen([sys.executable, '-I', '-B', '-c', 'import time; time.sleep(30)'],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=directory, start_new_session=True)
    else:
        process = original_spawn(directory)
    observed.append((process, directory))
    return process


def collect(process, deadline):
    emit({'event': 'child_started', 'pid': process.pid, 'parent_pid': os.getpid(),
          'synthetic_fault': args.mode == 'term-fixture'})
    return original_collect(process, deadline)


def run(text):
    before = len(observed)
    try:
        return original_run(text)
    finally:
        for process, directory in observed[before:]:
            emit({'event': 'child_finished', 'pid': process.pid, 'parent_pid': os.getpid(),
                  'exit_code': process.returncode, 'temporary_removed': not directory.exists(),
                  'pipes_closed': process.stdout.closed and process.stderr.closed,
                  'poisoned': pc_citations._POISONED,
                  'synthetic_fault': args.mode == 'term-fixture'})


pc_citations._spawn, pc_citations._collect, pc_citations.run_citations = spawn, collect, run
if args.mode == 'adapter':
    sys.stdout.write(run(sys.stdin.read()))
else:
    sys.argv = [str(args.toolkit / 'mcp_server.py')]
    runpy.run_path(sys.argv[0], run_name='__main__')
