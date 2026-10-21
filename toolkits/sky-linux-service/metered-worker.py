"""Operator-owned Linux adapter around the existing, fixed text worker. No billing keys enter the child."""
import importlib.util
import json
import math
import os
from pathlib import Path
import resource
import shutil
import sys
import time

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('sky_fixed_text_worker', root / 'toolkits/sky-linux-local/worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

if len(sys.argv) != 2 or sys.argv[1] not in ('run', 'stop', 'probe'):
    raise ValueError('fixed run/stop operation required')
data = json.loads(sys.stdin.buffer.read(32001))
if sys.argv[1] == 'probe':
    probe_spec = importlib.util.spec_from_file_location('sky_setup_probe', Path(__file__).with_name('setup-probe.py'))
    probe_module = importlib.util.module_from_spec(probe_spec)
    probe_spec.loader.exec_module(probe_module)
    print(json.dumps(probe_module.probe(worker)))
    sys.exit(0)
if sys.argv[1] == 'stop':
    print(json.dumps(worker.stop(data['jobId'])))
else:
    cpu_limit = data.pop('cpuLimitMs')
    if type(cpu_limit) is not int or cpu_limit < 1000 or cpu_limit > 170000:
        raise ValueError('CPU budget required')
    original_limits = worker.limits

    def limits():
        original_limits()
        seconds = math.ceil(cpu_limit / 1000)
        resource.setrlimit(resource.RLIMIT_CPU, (seconds, seconds))

    worker.limits = limits
    # The fixed model process gets only its runtime, one model and one prompt.
    # Missing namespace support is an error; never fall back to an unrestricted child.
    bwrap = shutil.which('bwrap')
    if not bwrap:
        raise RuntimeError('bubblewrap is required for managed Linux execution')
    original_popen = worker.subprocess.Popen

    def sandboxed_popen(args, **kwargs):
        binary = Path(args[0]).resolve()
        model = Path(args[args.index('-m') + 1]).resolve()
        prompt = Path(args[args.index('-f') + 1]).resolve()
        translated = list(args)
        translated[0] = '/runtime/' + binary.name
        translated[translated.index('-m') + 1] = '/model.gguf'
        translated[translated.index('-f') + 1] = '/prompt.txt'
        mounts = []
        for location in ('/usr', '/lib', '/lib64', '/etc/ld.so.cache'):
            if Path(location).exists():
                mounts += ['--ro-bind', location, location]
        command = [bwrap, '--die-with-parent', '--unshare-user', '--unshare-pid', '--unshare-net',
                   '--unshare-ipc', '--unshare-uts', '--cap-drop', 'ALL', *mounts,
                   '--ro-bind', str(binary.parent), '/runtime', '--ro-bind', str(model), '/model.gguf',
                   '--ro-bind', str(prompt), '/prompt.txt', '--proc', '/proc', '--dev', '/dev',
                   '--tmpfs', '/tmp', '--chdir', '/tmp', '--', *translated]
        kwargs['env'] = {'PATH': '/usr/bin:/bin', 'HOME': '/tmp', 'LD_LIBRARY_PATH': '/runtime', 'LANG': 'C.UTF-8'}
        return original_popen(command, **kwargs)

    worker.subprocess.Popen = sandboxed_popen
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    started = time.monotonic()
    try:
        result = worker.run(data)
        result['outcome'] = 'cancelled' if result.get('cancelled') else 'succeeded'
    except Exception:
        stopped = worker.stop(data['jobId'])
        if not stopped['confirmed']:
            raise RuntimeError('process stop unconfirmed; operator reconciliation required')
        result = {'outcome': 'failed', 'text': ''}
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    result['cpuMs'] = math.ceil(1000 * (after.ru_utime + after.ru_stime - before.ru_utime - before.ru_stime))
    result['durationMs'] = math.ceil(1000 * (time.monotonic() - started))
    result['meter'] = 'linux-wait4-child-cpu/1'
    print(json.dumps(result, ensure_ascii=False))
