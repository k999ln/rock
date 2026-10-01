"""Optional Draft 2020-12 structural checks; no runtime or physical verification."""
import copy
import json
from pathlib import Path

try:
    from jsonschema import Draft202012Validator
except ImportError as exc:
    raise SystemExit('NOT_RUN: jsonschema is unavailable; no validation success is claimed.') from exc


def main():
    here = Path(__file__).resolve().parent
    schemas = {name: json.loads((here / f'{name}.schema.json').read_text())
               for name in ('command', 'receipt', 'telemetry')}
    examples = {name: json.loads((here / 'examples' / f'{name}.json').read_text())
                for name in schemas}
    checks = []
    validators = {}
    for name, schema in schemas.items():
        Draft202012Validator.check_schema(schema)
        validators[name] = Draft202012Validator(schema)
        validators[name].validate(examples[name])
        checks.append(f'{name}: positive static example')
        for field in schema['required']:
            bad = copy.deepcopy(examples[name])
            del bad[field]
            assert not validators[name].is_valid(bad), (name, 'missing', field)
            checks.append(f'{name}: rejects missing {field}')
        for field, value in [('unexpected', 1), ('mode', 'LIVE'),
                             ('sourceClass', 'MEASURED'), ('signature', 'not-a-mac')]:
            bad = copy.deepcopy(examples[name])
            bad[field] = value
            assert not validators[name].is_valid(bad), (name, field)
            checks.append(f'{name}: rejects invalid {field}')
    for field in ('expiresAt', 'authorityEpoch', 'expectedRevision'):
        bad = copy.deepcopy(examples['command'])
        bad[field] = True
        assert not validators['command'].is_valid(bad), field
        checks.append(f'command: rejects boolean {field}')
    for field in ('authorityEpoch', 'expectedRevision'):
        bad = copy.deepcopy(examples['command'])
        bad[field] = -1
        assert not validators['command'].is_valid(bad), field
        checks.append(f'command: rejects negative {field}')
    for value in (True, -1, 101):
        bad = copy.deepcopy(examples['command'])
        bad['payload']['desiredFlexibleKw'] = value
        assert not validators['command'].is_valid(bad), value
        checks.append(f'command: rejects load {value}')
    bad = copy.deepcopy(examples['command'])
    bad['payload']['operation'] = 'hardware.execute'
    assert not validators['command'].is_valid(bad)
    checks.append('command: rejects nonfixture operation')
    bad = copy.deepcopy(examples['command'])
    bad['payload']['unexpected'] = 1
    assert not validators['command'].is_valid(bad)
    checks.append('command: rejects unknown payload field')
    for status, reason in [('APPLIED', 'EXPIRED'), ('REJECTED', None)]:
        bad = copy.deepcopy(examples['receipt'])
        bad.update(status=status, reason=reason)
        assert not validators['receipt'].is_valid(bad)
        checks.append(f'receipt: rejects inconsistent {status}')
    print(json.dumps({'status': 'PASS', 'scope': 'Static schema shape only',
                      'check_count': len(checks), 'checks': checks}, indent=2))


if __name__ == '__main__':
    main()
