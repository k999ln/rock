"""Opt-in host test observations, never request payloads or runtime changes."""
import faulthandler
import json
import os
import resource
import threading
import time


def resource_snapshot():
    usage = resource.getrusage(resource.RUSAGE_SELF)
    try:
        load = list(os.getloadavg())
    except (AttributeError, OSError):
        load = None
    return {'process_cpu_seconds': usage.ru_utime + usage.ru_stime,
            'voluntary_context_switches': usage.ru_nvcsw,
            'involuntary_context_switches': usage.ru_nivcsw,
            'live_threads': threading.active_count(), 'load_average': load}


def private_sidecar(path):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    return os.fdopen(descriptor, 'w', buffering=1)


def capture_failure(stream, test_id, event):
    # Called by unittest's failure callback before tearDown/doCleanups can join
    # the server worker whose state explains a transport deadline. Tracebacks
    # contain filenames/function names/line numbers, never locals or source.
    if stream is None:
        return
    stream.write(json.dumps({'schema': 'rock-native-failure-observation/1',
        'test': test_id, 'event': event, 'monotonic_seconds': time.monotonic(),
        'resources': resource_snapshot()}) + '\n')
    stream.flush()
    faulthandler.dump_traceback(file=stream, all_threads=True)
    stream.write('\n')
    stream.flush()
