#!/usr/bin/env python3
"""Compare exact public input in two native recipes and the retained PC CLI.

Source-level quality only. This does not inject input into an OS, measure a
person, or turn the unavailable old Japanese keyboard flow into a UI pass.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import time

WORKER = 'systems/rock-star-os/src/blackberryrock/recipe_worker.py'
FIXTURE = 'systems/rock-star-os/os/tools/fixtures/citations.md'
PACKAGE = 'systems/rock-star-os/os/tools/packages/org.rockstar.citation-organizer--1.0.0.recipe.json'
PC = ['toolkits/mr/rock_star_tools.py', 'vendor/mr/citation-strip.py',
      'vendor/mr/provenance.json', 'vendor/mr/LICENSE']
EXPECTED_NATIVE = '紹介文です。\n\n```text\n（出典: [コード内の例](https://example.test/code)）\n```\n\n## 出典\n\n- [店舗情報](https://example.test/store)\n'
EXPECTED_PC = EXPECTED_NATIVE.replace('```\n\n## 出典', '```\n---\n\n## 出典')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--before', required=True)
    parser.add_argument('--after', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    repo = args.repo.resolve(strict=True)
    output = args.output.resolve()
    output.mkdir(mode=0o700, parents=False, exist_ok=False)

    def git(*argv):
        return subprocess.check_output(['git', '-C', str(repo), *argv], timeout=20)

    commits = {name: git('rev-parse', '--verify', value + '^{commit}').decode().strip()
               for name, value in [('before', args.before), ('after', args.after)]}
    files = {}
    for label, commit in commits.items():
        for name in [WORKER, FIXTURE, PACKAGE, *(PC if label == 'after' else [])]:
            raw = git('show', commit + ':' + name)
            path = output / label / name
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            path.write_bytes(raw)
            path.chmod(0o400)
            files[str(path.relative_to(output))] = sha(raw)
    text = (output / 'after' / FIXTURE).read_bytes()
    assert text == (output / 'before' / FIXTURE).read_bytes()
    assert sha(text) == 'bad73028a4b23b6e046abc4a1463f2fa14ffd4f55844ec9146cdc9acc3b1387e'
    assert sha(EXPECTED_NATIVE.encode()) == 'e5e655f1c0c3008fd895f0eba61f206cf83035d376ab63d76846bf0636840fa7'
    assert sha(EXPECTED_PC.encode()) == '30dafde5d3c32d7c690276656f8d5ed0ff924b2c9b5617ede86820efc0b1a0f6'
    plan = {'schema': 'rock-citation-source-quality/1', 'commits': commits,
            'input_sha256': sha(text), 'source_sha256': files,
            'runtime': {'python': sys.version, 'executable': sys.executable, 'platform': platform.platform()},
            'deadline_per_process_seconds': 3, 'attempts_per_path': 1,
            'expected': {'native': EXPECTED_NATIVE, 'pc': EXPECTED_PC},
            'scope': 'Actual source processes only; no OS/GUI/physical USB/external API or human timing',
            'old_native_same_input_ui': 'NOT_RUN: old framebuffer keyboard has no Japanese input method',
            'prior_ui_comparison': 'Old generic sample and new citation sample differ; do not compare their elapsed time'}
    plan_path = output / 'plan.json'
    plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n')
    plan_path.chmod(0o444)
    report = {'schema': plan['schema'], 'status': 'RUNNING', 'plan_sha256': sha(plan_path.read_bytes()),
              'started_utc': datetime.now(timezone.utc).isoformat(), 'results': []}
    try:
        for label in ('before', 'after', 'pc'):
            source_label = 'after' if label == 'pc' else label
            base = output / source_label
            if label == 'pc':
                command = [sys.executable, '-I', '-B', str(base / PC[0]), 'citations', '--input', str(base / FIXTURE)]
                request = None
            else:
                package = json.loads((base / PACKAGE).read_text())
                assert package['recipe'] == [{'op': 'organize_citations'}]
                command = [sys.executable, '-I', '-B', str(base / WORKER)]
                request = json.dumps({'text': text.decode(), 'recipe': package['recipe']}, ensure_ascii=False).encode()
            started = time.monotonic()
            result = subprocess.run(command, input=request, capture_output=True, timeout=3, check=False)
            elapsed = time.monotonic() - started
            (output / (label + '.stdout')).write_bytes(result.stdout)
            (output / (label + '.stderr')).write_bytes(result.stderr)
            assert result.returncode == 0 and not result.stderr, label + ' source process failed'
            rendered = result.stdout.decode() if label == 'pc' else json.loads(result.stdout)['text']
            expected = EXPECTED_PC if label == 'pc' else EXPECTED_NATIVE
            assert rendered == expected, label + ' exact expected output differs'
            assert elapsed < 3, label + ' result observed outside deadline'
            (output / (label + '-result.md')).write_text(rendered)
            report['results'].append({'path': label, 'exit_code': result.returncode,
                                      'machine_process_seconds': elapsed, 'output_bytes': len(rendered.encode()),
                                      'output_sha256': sha(rendered.encode()), 'exact_expected_output': True})
        assert files == {name: sha((output / name).read_bytes()) for name in files}
        report.update(status='PASS_SCOPED_SOURCE_QUALITY', source_unchanged=True,
                      native_before_after_byte_equal=True, native_pc_byte_equal=False,
                      difference='PC contains the four-byte Markdown separator ---\\n before ## 出典; output is not normalized',
                      preserved_quality=['code block and its example citation unchanged', 'body citation moved to source list',
                                         'original citation link target and label retained'],
                      human_time='NOT_MEASURED', final_os_acceptance='NOT_RUN')
    except Exception as error:
        report.update(status='FAIL', error=type(error).__name__ + ': ' + str(error))
        raise
    finally:
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({key: report.get(key) for key in ('status', 'error', 'results')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
