#!/usr/bin/env python3
"""Actual C hitbox regression with public signed manifests; no guest/backend run."""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'src'))
from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER, verify_package
from replay_qmp import native_install_steps, native_permission_review_steps, native_primary_steps, native_sequence, validate


def replay_case(images):
    catalog = []
    for path in sorted((ROOT / 'examples/registry').glob('*.rock.json')):
        manifest, digest = verify_package(json.loads(path.read_bytes()), {TEST_PUBLISHER: PUBLIC_TEST_KEY})
        catalog.append({'manifest': manifest, 'hash': digest, 'size': path.stat().st_size,
                        'filename': path.name, 'source': 'embedded'})
    versions = [row['manifest']['version'] for row in catalog
                if row['manifest']['id'] == 'org.example.action-checklist']
    assert versions == ['1.0.0', '2.0.0'], 'test requires the actual two-version default public Tool'
    steps = native_sequence()
    validate(steps, 720, 960)
    assert sum('capture' in step for step in steps) == 9, 'native observer still requires all nine frames'
    end = next(i for i, step in enumerate(steps) if step == {'click': [250, 425]})
    return {'snapshot': {'catalog': catalog, 'hub': {'installed': [], 'jobs': []},
                         'wallet': {'simulation_only': True},
                         'registry': {'configured': False, 'source_label': '内蔵カタログ・配信元未設定'}},
            'steps': steps[:end + 1], 'images': str(images)}


def check_live_verifier_shared_steps():
    spec = importlib.util.spec_from_file_location('native_replay_verifier', Path(__file__).with_name('verify-native.py'))
    verifier = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verifier)
    # Exercise the same NativeInput adapter used by the live verifier without
    # opening QMP or sleeping. The C runner below consumes these exact steps.
    class Recorder:
        def __init__(self):
            self.steps = []

        def keys(self, names):
            self.steps.append({'keys': names})

        def click(self, x, y):
            self.steps.append({'click': [x, y]})
    recorder = Recorder()
    for steps in (native_install_steps(), native_permission_review_steps(), native_primary_steps(), native_primary_steps()):
        verifier.NativeInput.perform(recorder, steps)
    assert recorder.steps == [{'keys': ['pgdn']}, {'click': [360, 793]}, {'keys': ['pgup']},
                              {'click': [360, 758]}, {'click': [360, 758]}]
    # Both helpers must be used by main, not merely imported and unit-tested.
    import ast
    tree = ast.parse(Path(verifier.__file__).read_text())
    main = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'main')
    calls = [node for node in ast.walk(main) if isinstance(node, ast.Call) and
             isinstance(node.func, ast.Attribute) and node.func.attr == 'perform']
    assert [call.args[0].func.id for call in calls] == ['native_install_steps', 'native_permission_review_steps',
                                                         'native_primary_steps', 'native_primary_steps']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--renderer', type=Path, required=True, help='built rock-ui-test executable')
    parser.add_argument('--font', type=Path, required=True, help='same Noto CJK font as the OS')
    parser.add_argument('--output', type=Path, help='new directory for host-only PNG/geometry evidence')
    args = parser.parse_args()
    renderer, font = args.renderer.resolve(strict=True), args.font.resolve(strict=True)
    check_live_verifier_shared_steps()
    with tempfile.TemporaryDirectory(prefix='rock-native-replay-') as temporary:
        directory = Path(temporary)
        images = args.output.resolve() if args.output else directory / 'frames'
        images.mkdir(parents=True, exist_ok=False)
        case = replay_case(images)
        case_path = directory / 'case.json'
        case_path.write_text(json.dumps(case, ensure_ascii=False))
        command = [str(renderer), '--native-replay', str(font), str(case_path)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)
        print(result.stdout, end='')
        if result.returncode:
            print(result.stderr, file=sys.stderr, end='')
        result.check_returncode()
        assert len(list(images.glob('*.png'))) == 5
        # Reproduce each stale scroll state with the identical public catalog:
        # omitted PageDown misses install; omitted PageUp misses approval.
        original_steps = case['steps']
        for missing in ('pgdn', 'pgup'):
            case['steps'] = [step for step in original_steps if step != {'keys': [missing]}]
            negative = directory / ('negative-' + missing)
            negative.mkdir()
            case['images'] = str(negative)
            case_path.write_text(json.dumps(case, ensure_ascii=False))
            stale = subprocess.run(command, capture_output=True, text=True, timeout=30)
            assert stale.returncode == 1 and 'documented QMP coordinate targets an enabled visible control' in stale.stderr, stale
        print('PASS missing PageDown and PageUp rejected; nine-capture live contract preserved')


if __name__ == '__main__':
    main()
