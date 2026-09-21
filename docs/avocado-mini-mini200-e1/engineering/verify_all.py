#!/usr/bin/env python3
"""Replay trusted Mini200 E1 models using stdlib-only temporary copies.

Place this file in the distribution's engineering/ directory. No dependency
installation, network, camera, microphone, ASR inference, or game boot is used.
Importing Python is NOT an execution sandbox: run only a trusted package.
"""
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
import math
from pathlib import Path
import shutil
import sys
import tempfile

EXPECTED_COUNTS = {"core": 9, "mechanical": 14, "voice": 18, "interaction": 99}
FILES = {
    "core": ("calculate.py", "results.json", "README.md"),
    "mechanical": ("calculate.py", "inputs.json", "calculated_results.json", "README.md"),
    "voice": ("calculate.py", "design_inputs.json", "calculated_results.json", "README.md", "sources.json"),
    "interaction": ("permission_model.py", "tests.json", "README.md"),
}
RESULT_FILES = {"core": "results.json", "mechanical": "calculated_results.json",
                "voice": "calculated_results.json", "interaction": "tests.json"}
FLOAT_REL_TOL = 1e-12
FLOAT_ABS_TOL = 1e-12


class VerificationError(Exception):
    pass


def require(condition, message):
    # Not assert: package-status checks must not disappear with -O.
    if not condition:
        raise VerificationError(message)


def no_json_constant(value):
    raise VerificationError("Non-finite JSON constant is not permitted: " + value)


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=no_json_constant)


def snapshot(root):
    """Hash the supplied tree; never follow symlinks or write into it."""
    result = {}
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            result[relative] = "SYMLINK:" + str(path.readlink())
        elif path.is_file():
            digest = hashlib.sha256()
            with path.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
            result[relative] = digest.hexdigest()
    return result


def require_zero(data, key, where):
    value = data.get(key)
    require(type(value) is int and value == 0, where + ": " + key + " must be integer 0")


def validate_pass(kind, result, where):
    """Validate the saved result itself, not only equality with a rerun."""
    require(type(result) is dict, where + ": JSON result must be an object")
    expected = EXPECTED_COUNTS[kind]
    if kind == "voice":
        checks = result.get("arithmetic_checks")
        require(type(checks) is dict and len(checks) == expected, where + ": wrong check count")
        require(all(type(name) is str and name for name in checks), where + ": invalid check name")
        require(all(value is True for value in checks.values()), where + ": saved checks include failure")
        require(result.get("all_arithmetic_checks_pass") is True, where + ": aggregate PASS is absent")
        require(type(result.get("passed_check_count")) is int and result["passed_check_count"] == expected,
                where + ": incorrect passed_check_count")
        require_zero(result, "physical_measurements_count", where)
    else:
        key = "model_tests" if kind == "mechanical" else "checks"
        checks = result.get(key)
        require(type(checks) is list and len(checks) == expected, where + ": wrong check count")
        require(all(type(item) is dict and type(item.get("name")) is str and item["name"]
                    and item.get("pass") is True for item in checks), where + ": checks include failure or invalid type")
        names = [item["name"] for item in checks]
        require(len(set(names)) == expected, where + ": duplicate names within this result")
        require_zero(result, "physical_tests", where)
        if kind != "mechanical":
            require(type(result.get("pass_count")) is int and result["pass_count"] == expected,
                    where + ": incorrect pass_count")
        if kind == "core":
            require_zero(result, "asr_audio_tests", where)
            require(type(result.get("fictional_merge_cases")) is int and result["fictional_merge_cases"] == 1000,
                    where + ": fictional case count must be 1000")
        if kind == "interaction":
            for extra in ("fail_count", "actual_asr_runs", "external_actions"):
                require_zero(result, extra, where)
    return expected


def compare_json(expected, actual, location="$"):
    """Compare structure/types exactly, finite floats within roundoff tolerance."""
    require(type(expected) is type(actual), location + ": JSON types differ")
    if type(expected) is dict:
        require(expected.keys() == actual.keys(), location + ": object keys differ")
        for key in expected:
            compare_json(expected[key], actual[key], location + "." + key)
    elif type(expected) is list:
        require(len(expected) == len(actual), location + ": array lengths differ")
        for index, (left, right) in enumerate(zip(expected, actual)):
            compare_json(left, right, location + "[" + str(index) + "]")
    elif type(expected) is float:
        require(math.isfinite(expected) and math.isfinite(actual)
                and math.isclose(expected, actual, rel_tol=FLOAT_REL_TOL, abs_tol=FLOAT_ABS_TOL),
                location + ": floating values differ")
    else:
        require(expected == actual, location + ": values differ")


def import_model(kind, filename):
    name = "_mini200_e1_replay_" + kind
    spec = importlib.util.spec_from_file_location(name, filename)
    require(spec is not None and spec.loader is not None, kind + ": cannot import model")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module  # Required by dataclasses during interaction import.
    spec.loader.exec_module(module)
    return module


def run_group(kind, path):
    script = "permission_model.py" if kind == "interaction" else "calculate.py"
    module = import_model(kind, path / script)
    try:
        with redirect_stdout(io.StringIO()):
            if kind == "core":
                module.OUT = path
                result = module.run()
            elif kind == "mechanical":
                module.P = path
                result = module.run()
            elif kind == "voice":
                result = module.calculate(load_json(path / "design_inputs.json"))
            else:
                result = module.run_tests()
        result = json.loads(json.dumps(result, ensure_ascii=False, allow_nan=False))
        generated_path = path / RESULT_FILES[kind]
        if kind in ("core", "mechanical"):
            compare_json(result, load_json(generated_path), kind + ".returned_vs_written")
        else:
            generated_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return result
    finally:
        sys.modules.pop("_mini200_e1_replay_" + kind, None)


def verify(engineering_root):
    require(__debug__, "Run without -O or -OO; model assertions must be enabled.")
    require(sys.version_info >= (3, 10), "Python 3.10 or newer is required.")
    root = Path(engineering_root).resolve()
    for group, files in FILES.items():
        require((root / group).is_dir() and not (root / group).is_symlink(), group + ": missing or symlinked directory")
        for filename in files:
            path = root / group / filename
            require(path.is_file() and not path.is_symlink(), str(path) + ": missing or symlinked file")
    before = snapshot(root)
    old_bytecode_setting = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    per_group = {}
    try:
        saved = {}
        for group in FILES:
            saved[group] = load_json(root / group / RESULT_FILES[group])
            validate_pass(group, saved[group], group + ".bundled")
        with tempfile.TemporaryDirectory(prefix="mini200-e1-replay-") as temporary:
            stage = Path(temporary)
            for group, files in FILES.items():
                target = stage / group
                target.mkdir()
                for filename in files:
                    shutil.copy2(root / group / filename, target / filename)
                fresh = run_group(group, target)
                count = validate_pass(group, fresh, group + ".replayed")
                compare_json(saved[group], fresh, group)
                per_group[group] = {"reported_check_count": count, "bundled_status": "PASS",
                                    "replayed_status": "PASS", "JSON_comparison": "MATCH"}
    finally:
        sys.dont_write_bytecode = old_bytecode_setting
        after = snapshot(root)
        require(before == after, "Supplied engineering files changed during replay; release audit failed.")
    total = sum(item["reported_check_count"] for item in per_group.values())
    require(total == 140, "Expected 9 + 14 + 18 + 99 = 140 reported check entries.")
    return {
        "status": "PASS_CALCULATION_AND_ABSTRACT_MODEL_REPLAY_ONLY",
        "groups": per_group,
        "reported_check_entries_total": total,
        "check_count_meaning": "9+14+18+99=140 entries; overlaps are possible, not 140 independent physical tests.",
        "fictional_particle_cases": 1000,
        "fictional_case_count_meaning": "Synthetic perfectly-inelastic merge cases already summarized by one core check; not an additional 1000 hardware or chemistry tests.",
        "physical_tests": 0,
        "actual_ASR_audio_tests": 0,
        "original_files_unchanged": True,
        "floating_comparison": {"relative_tolerance": FLOAT_REL_TOL, "absolute_tolerance": FLOAT_ABS_TOL,
                                "integers_booleans_strings_keys_and_array_order": "exact"},
        "limits": ["No hardware, microphone, camera, network, funds, ASR engine, or game boot is used.",
                   "No measured FPS, latency percentile, recognition accuracy, cooling, power peak, or physical mute validation.",
                   "Model PASS does not remove HOLD or grant manufacturing approval.",
                   "Trusted supplied Python is imported; this is not a sandbox for modified or untrusted code."]
    }


def main():
    try:
        require(len(sys.argv) == 1, "No arguments required. Place verify_all.py in engineering/ and run it there.")
        result = verify(Path(__file__).resolve().parent)
    except Exception as error:
        print(json.dumps({"status": "FAIL", "error_type": type(error).__name__, "message": str(error),
                          "physical_tests": 0, "manufacturing_approval": False}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
