"""Fixed preregistered ARM64 guest comparison; no execution on import."""
from datetime import datetime, timezone
import hashlib
import json
import math
import statistics

EXPERIMENT = 'H2-OS-workflow-v1'
OPERATIONS = ('trim_lines', 'unique_lines', 'sort_lines')
WORDS = ('alpha', 'Bravo', 'りんご', '東京', 'zeta', '7', 'Ω', 'Ａ')
INPUT = '\n'.join('  \t  ' if index % 17 == 0 else f' \t{WORDS[(index * 5) % len(WORDS)]}  ' for index in range(1200))
EXPECTED = '\n'.join(sorted(('', *WORDS)))
NAMES = (*OPERATIONS, 'workflow')
IDS = {name: 'org.rockstar.os-experiment.' + name.replace('_', '-') for name in NAMES}
WARMUPS, PAIRS = 3, 30
JOB_SECONDS, MEASUREMENT_SECONDS, PREP_SECONDS = 30, 900, 180
POLL_SECONDS = 0.005
RUNTIME = ('/usr/bin/python3', '/usr/bin/bwrap', '/usr/libexec/rock-sandbox-exec',
           '/usr/lib/rock-platform/service.py', '/usr/lib/rock-platform/registry_control.py',
           '/usr/lib/rock-platform/blackberryrock/hub.py', '/usr/lib/rock-platform/blackberryrock/packages.py',
           '/usr/lib/rock-platform/blackberryrock/recipe_worker.py',
           '/usr/lib/rock-platform/registry/client.py', '/usr/lib/rock-platform/registry/transport.py')


def now():
    return datetime.now(timezone.utc).isoformat()


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def schedule():
    for phase, count in (('warmup', WARMUPS), ('measured', PAIRS)):
        for pair in range(1, count + 1):
            for order, variant in enumerate(('A', 'B') if pair % 2 else ('B', 'A'), 1):
                yield phase, pair, order, variant


def stats(values):
    if not values:
        return {'n': 0}
    require(all(type(value) is int and value > 0 for value in values), 'duration must be positive integer nanoseconds')
    ordered = sorted(values)
    return {'n': len(values), 'median_ms': statistics.median(values) / 1e6,
            'p95_ms_nearest_rank': ordered[math.ceil(len(values) * .95) - 1] / 1e6,
            'minimum_ms': min(values) / 1e6, 'maximum_ms': max(values) / 1e6}


def summarize(samples):
    measured = [x for x in samples if x['phase'] == 'measured' and x.get('status') == 'succeeded']
    a, b = ([x['elapsed_ns'] for x in measured if x['variant'] == variant] for variant in ('A', 'B'))
    pairs = {}
    for item in measured:
        pairs.setdefault(item['pair'], {})[item['variant']] = item['elapsed_ns']
    complete = [p for p in pairs.values() if set(p) == {'A', 'B'}]
    return {'A_three_tools': stats(a), 'B_one_workflow': stats(b), 'complete_pairs': len(complete),
            'median_shortening_percent': (1 - statistics.median(b) / statistics.median(a)) * 100 if a and b else None,
            'median_paired_shortening_percent': statistics.median((1 - p['B'] / p['A']) * 100 for p in complete) if complete else None,
            'workflow_slower_pairs': sum(p['B'] > p['A'] for p in complete), 'outliers_removed': 0}
