"""Run one deterministic module partition of the complete native discovery."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time
import unittest


def flatten(suite):
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            yield from flatten(item)
        else:
            yield item


def partition_for(test_id, count):
    # Keep module/class fixtures together and retain discovery order. Ordinals
    # below distinguish intentional repeated imports of the same test ID.
    module = test_id.split('.')[0]
    return int.from_bytes(hashlib.sha256(module.encode()).digest()[:8], 'big') % count


def selection(test_ids, index, count):
    if type(count) is not int or not 1 <= count <= 16 or type(index) is not int or not 0 <= index < count:
        raise ValueError('invalid native partition')
    return {'schema': 'rock-native-selection/1', 'index': index, 'count': count,
            'tests': list(test_ids),
            'selected_ordinals': [i for i, name in enumerate(test_ids) if partition_for(name, count) == index]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=int, required=True)
    parser.add_argument('--count', type=int, required=True)
    parser.add_argument('--selection', type=Path, required=True)
    args = parser.parse_args()
    cases = list(flatten(unittest.defaultTestLoader.discover('tests')))
    plan = selection([case.id() for case in cases], args.index, args.count)
    if not plan['selected_ordinals']:
        parser.error('empty native partition')
    with args.selection.open('x') as stream:
        json.dump(plan, stream, indent=2)
        stream.write('\n')
    timings_path = args.selection.with_suffix('.timings.jsonl')
    with timings_path.open('x', buffering=1) as timings:
        class TimedResult(unittest.TextTestResult):
            def startTest(self, test):
                self.started = time.perf_counter()
                cpu = os.times()
                self.started_cpu = cpu.user + cpu.system
                super().startTest(test)

            def stopTest(self, test):
                super().stopTest(test)
                cpu = os.times()
                timings.write(json.dumps({'test': test.id(),
                    'elapsed_seconds': time.perf_counter() - self.started,
                    'cpu_seconds': cpu.user + cpu.system - self.started_cpu}) + '\n')

        result = unittest.TextTestRunner(verbosity=2, resultclass=TimedResult).run(
            unittest.TestSuite(cases[i] for i in plan['selected_ordinals']))
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    raise SystemExit(main())
