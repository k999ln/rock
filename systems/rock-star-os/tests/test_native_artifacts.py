"""Synthetic artifact metadata only; these tests never contact GitHub."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[3] / "scripts/select-native-artifacts.py"
SPEC = importlib.util.spec_from_file_location("native_artifact_selector", SCRIPT)
SELECTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SELECTOR)
RUN_ID = 41
HEAD = "a" * 40
TARGET = {"run_id": RUN_ID, "head_sha": HEAD, "attempt": 12}


def artifact(part="main-0", attempt=1, ident=101, **extra):
    return {"id": ident, "name": f"native-source-part-{part}-attempt-{attempt}",
            "expired": False, "workflow_run": {"id": RUN_ID, "head_sha": HEAD},
            **extra}


def baseline():
    return [artifact(part, ident=101 + index)
            for index, part in enumerate(SELECTOR.PARTS)]


def pages(records):
    return [{"total_count": len(records), "artifacts": records}]


def run_metadata(**extra):
    return {"id": RUN_ID, "head_sha": HEAD, "run_attempt": 12, **extra}


class SelectionTests(unittest.TestCase):
    def select(self, value, **target):
        return SELECTOR.select_artifacts(value, **(TARGET | target))

    def rejected(self, value, code, **target):
        with self.assertRaises(SELECTOR.SelectionError) as raised:
            self.select(value, **target)
        self.assertEqual(str(raised.exception), "NATIVE_ARTIFACT_" + code)

    def test_new_pass_replaces_old_fail_and_new_fail_replaces_old_pass(self):
        for old, latest in (("FAIL", "PASS"), ("PASS", "FAIL")):
            with self.subTest(old=old, latest=latest):
                records = baseline()
                records[0]["report_status"] = old
                records.append(artifact(attempt=2, ident=9, report_status=latest))
                self.assertEqual(self.select(pages(records)), (9, 102, 103, 104, 105))

    def test_partial_rerun_uses_numeric_attempt_not_id_or_creation_time(self):
        records = baseline()
        records[0].update(id=9001, created_at="2099-01-01T00:00:00Z")
        records.extend([
            artifact(attempt=2, ident=9002, created_at="2099-01-02T00:00:00Z"),
            artifact(attempt=10, ident=9, created_at="2000-01-01T00:00:00Z"),
            artifact("support", attempt=11, ident=10),
        ])
        self.assertEqual(self.select(pages(records)), (9, 102, 103, 104, 10))

    def test_page_and_item_order_do_not_change_selection_or_mutate_inputs(self):
        records = baseline() + [artifact("main-1", attempt=12, ident=11)]
        listing = [{"total_count": 6, "artifacts": records[:2]},
                   {"total_count": 6, "artifacts": list(reversed(records[2:]))}]
        original = copy.deepcopy(listing)
        self.assertEqual(self.select(listing), (101, 11, 103, 104, 105))
        self.assertEqual(self.select(list(reversed(listing))), (101, 11, 103, 104, 105))
        self.assertEqual(listing, original)

    def test_expired_latest_never_falls_back_to_old_pass(self):
        records = baseline()
        records[0]["report_status"] = "PASS"
        records.append(artifact(attempt=2, ident=9, expired=True, report_status="FAIL"))
        self.rejected(pages(records), "EXPIRED_SELECTED")
        records[-1]["expired"] = False
        records[0]["expired"] = True
        self.assertEqual(self.select(pages(records))[0], 9)

    def test_unknown_malformed_or_future_partition_names_fail_closed(self):
        invalid = [
            "native-source-part-main-4-attempt-1",
            "native-source-part-main-0",
            "native-source-part-main-0-attempt-01",
            "native-source-part-main-0-attempt-0",
            "native-source-part-main-0-attempt--1",
            "native-source-part-support-attempt-1\n",
            "native-source-part-support-attempt-１",
            "native-source-partition",
        ]
        for name in invalid:
            with self.subTest(name=name):
                records = baseline()
                records[0]["name"] = name
                self.rejected(pages(records), "INVALID_PART")
        self.rejected(pages(baseline() + [artifact(attempt=13, ident=9)]), "FUTURE_ATTEMPT")

    def test_duplicate_old_or_latest_attempt_and_missing_partition_are_rejected(self):
        records = baseline() + [artifact(attempt=2, ident=9), artifact(attempt=1, ident=10)]
        self.rejected(pages(records), "DUPLICATE_PART_ATTEMPT")
        records[-1]["name"] = "native-source-part-main-0-attempt-2"
        self.rejected(pages(records), "DUPLICATE_PART_ATTEMPT")
        self.rejected(pages(baseline()[:-1]), "MISSING_PART")

    def test_invalid_duplicate_and_javascript_unsafe_ids_are_rejected(self):
        for bad in (None, True, "123", 1.5, 0, -1, 1 << 53):
            with self.subTest(kind=type(bad).__name__):
                records = baseline()
                records[0]["id"] = bad
                self.rejected(pages(records), "INVALID_METADATA")
        records = baseline()
        records[0]["id"] = records[1]["id"]
        self.rejected(pages(records), "DUPLICATE_ID")
        records = baseline()
        records[0]["id"] = SELECTOR.MAX_ID
        self.assertEqual(self.select(pages(records))[0], SELECTOR.MAX_ID)

    def test_every_artifact_must_belong_to_exact_run_and_head_even_if_unrelated(self):
        for changes in ({"id": RUN_ID + 1}, {"head_sha": "b" * 40}, {"id": True}):
            with self.subTest(fields=tuple(changes)):
                record = artifact(ident=999, name="native-source-test-results")
                record["workflow_run"].update(changes)
                self.rejected(pages(baseline() + [record]), "INVALID_METADATA")
        for bad in (None, {}, "run"):
            record = artifact(ident=999, name="unrelated", workflow_run=bad)
            self.rejected(pages(baseline() + [record]), "INVALID_METADATA")

    def test_pagination_and_metadata_must_be_complete_and_well_typed(self):
        invalid = [
            ([], "INVALID_METADATA"),
            ({"total_count": 5, "artifacts": baseline()}, "INVALID_METADATA"),
            ([{"total_count": 6, "artifacts": baseline()}], "INCOMPLETE_PAGINATION"),
            ([{"total_count": 5, "artifacts": baseline()[:2]},
              {"total_count": 6, "artifacts": baseline()[2:]}], "INCOMPLETE_PAGINATION"),
            ([{"total_count": 5, "artifacts": baseline()},
              {"total_count": 5, "artifacts": []}], "INCOMPLETE_PAGINATION"),
            ([{"total_count": True, "artifacts": baseline()}], "INVALID_METADATA"),
            ([{"total_count": 1001, "artifacts": []}], "ARTIFACT_LIMIT"),
            ([{"total_count": 5, "artifacts": baseline()}] * 11, "INVALID_METADATA"),
        ]
        for value, code in invalid:
            with self.subTest(code=code):
                self.rejected(value, code)
        for field, value in (("expired", 0), ("expired", "false"), ("name", None)):
            records = baseline()
            records[0][field] = value
            self.rejected(pages(records), "INVALID_METADATA")

    def test_invalid_target_is_rejected_before_metadata(self):
        for changes in ({"run_id": True}, {"run_id": 1 << 53},
                        {"head_sha": "private-marker"}, {"attempt": 0}, {"attempt": True}):
            self.rejected(pages(baseline()), "INVALID_ARGUMENTS", **changes)


class CollectionTests(unittest.TestCase):
    def collect(self, responses, **kwargs):
        request = mock.Mock(side_effect=responses)
        value = SELECTOR.collect_artifacts("k999ln/rock", request=request, **TARGET, **kwargs)
        return value, request

    def test_run_identity_is_verified_before_single_page_fetch(self):
        selected, request = self.collect([run_metadata(), pages(baseline())[0]])
        self.assertEqual(selected, (101, 102, 103, 104, 105))
        self.assertEqual(request.call_args_list, [
            mock.call("repos/k999ln/rock/actions/runs/41"),
            mock.call("repos/k999ln/rock/actions/runs/41/artifacts?per_page=100&page=1"),
        ])

    def test_ten_pages_and_one_thousand_artifacts_are_the_exact_collection_bound(self):
        records = baseline() + [artifact(ident=1000 + index, name=f"unrelated-{index}")
                                for index in range(995)]
        responses = [run_metadata()] + [
            {"total_count": 1000, "artifacts": records[offset:offset + 100]}
            for offset in range(0, 1000, 100)]
        selected, request = self.collect(responses)
        self.assertEqual(selected, (101, 102, 103, 104, 105))
        self.assertEqual(request.call_count, 11)
        self.assertTrue(request.call_args.args[0].endswith("page=10"))

    def test_run_head_or_attempt_mismatch_never_fetches_artifacts(self):
        for changed in ({"id": 42}, {"head_sha": "b" * 40}, {"run_attempt": 11},
                        {"run_attempt": True}):
            with self.subTest(fields=tuple(changed)):
                request = mock.Mock(return_value=run_metadata(**changed))
                with self.assertRaisesRegex(SELECTOR.SelectionError,
                                            "^NATIVE_ARTIFACT_RUN_MISMATCH$"):
                    SELECTOR.collect_artifacts("k999ln/rock", request=request, **TARGET)
                self.assertEqual(request.call_count, 1)

    def test_missing_changed_short_or_failed_later_page_has_no_partial_success(self):
        first = baseline() + [artifact(ident=1000 + index, name=f"other-{index}")
                              for index in range(95)]
        page_one = {"total_count": 105, "artifacts": first}
        for second, code in [
            (None, "INVALID_METADATA"),
            ({"total_count": 106, "artifacts": baseline()}, "INCOMPLETE_PAGINATION"),
            ({"total_count": 105, "artifacts": []}, "INCOMPLETE_PAGINATION"),
            (RuntimeError("PRIVATE-UPSTREAM-MARKER"), "REQUEST_FAILED"),
        ]:
            request = mock.Mock(side_effect=[run_metadata(), page_one, second])
            with self.subTest(code=code), self.assertRaises(SELECTOR.SelectionError) as raised:
                SELECTOR.collect_artifacts("k999ln/rock", request=request, **TARGET)
            self.assertEqual(str(raised.exception), "NATIVE_ARTIFACT_" + code)
            self.assertEqual(request.call_count, 3)

    def test_over_cap_count_stops_before_any_additional_page(self):
        request = mock.Mock(side_effect=[
            run_metadata(), {"total_count": 1001, "artifacts": []}])
        with self.assertRaisesRegex(SELECTOR.SelectionError, "^NATIVE_ARTIFACT_ARTIFACT_LIMIT$"):
            SELECTOR.collect_artifacts("k999ln/rock", request=request, **TARGET)
        self.assertEqual(request.call_count, 2)

    def test_invalid_repository_cannot_become_a_gh_argument_or_endpoint(self):
        for repo in ("https://github.com/k999ln/rock", "owner/repo?x", "a/b/c",
                     "owner/..", "owner/repo\n", "-flag/repo"):
            request = mock.Mock()
            with self.subTest(repo=repo), self.assertRaisesRegex(
                    SELECTOR.SelectionError, "^NATIVE_ARTIFACT_INVALID_ARGUMENTS$"):
                SELECTOR.collect_artifacts(repo, request=request, **TARGET)
            request.assert_not_called()


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.children = []
        self.commands = []
        self.addCleanup(self.assert_closed)

    def assert_closed(self):
        for child in self.children:
            self.assertIsNotNone(child.returncode)
            self.assertTrue(child.stdout.closed)

    def fake_gh(self, body):
        original = subprocess.Popen

        def spawn(command, **kwargs):
            self.commands.append((command, kwargs.copy()))
            child = original([sys.executable, "-B", "-c", body], **kwargs)
            self.children.append(child)
            return child

        return mock.patch.object(SELECTOR.subprocess, "Popen", side_effect=spawn)

    def test_fixed_get_command_parses_only_bounded_stdout_without_shell(self):
        endpoint = "repos/k999ln/rock/actions/runs/41"
        with self.fake_gh("print('{}')"):
            self.assertEqual(SELECTOR.request_json(endpoint), {})
        command, kwargs = self.commands[0]
        self.assertEqual(command, ["gh", "api", "--hostname", "github.com",
                                   "--method", "GET", endpoint])
        self.assertNotIn("shell", kwargs)
        self.assertIs(kwargs["stdin"], subprocess.DEVNULL)
        self.assertIs(kwargs["stderr"], subprocess.DEVNULL)

    def test_output_cap_kills_and_reaps_writer_without_returning_partial_json(self):
        with self.fake_gh("import os,time; os.write(1,b'x'*65); time.sleep(30)"), \
                mock.patch.object(SELECTOR, "MAX_INPUT_BYTES", 64), \
                self.assertRaisesRegex(SELECTOR.SelectionError,
                                       "^NATIVE_ARTIFACT_INPUT_TOO_LARGE$"):
            SELECTOR.request_json("synthetic-endpoint")

    def test_timeout_exit_failure_and_parse_failure_have_only_fixed_errors(self):
        cases = [
            ("import time; time.sleep(30)", "REQUEST_FAILED"),
            ("import sys; print('PRIVATE-STDERR',file=sys.stderr); sys.exit(3)", "REQUEST_FAILED"),
            ("print('PRIVATE-INVALID-JSON')", "INVALID_METADATA"),
        ]
        for body, code in cases:
            with self.subTest(code=code), self.fake_gh(body), \
                    mock.patch.object(SELECTOR, "REQUEST_SECONDS", .3), \
                    self.assertRaises(SELECTOR.SelectionError) as raised:
                SELECTOR.request_json("synthetic-endpoint")
            self.assertEqual(str(raised.exception), "NATIVE_ARTIFACT_" + code)


class CLITests(unittest.TestCase):
    def args(self, source):
        return [*source, "--run-id", str(RUN_ID), "--head-sha", HEAD, "--attempt", "12"]

    def cli(self, data, extra=()):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "PRIVATE-INPUT-NAME.json"
            path.write_bytes(data)
            return subprocess.run(
                [sys.executable, "-B", str(SCRIPT), *self.args(["--input", str(path)]), *extra],
                capture_output=True, timeout=5, check=False)

    def assert_error(self, result, code):
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b"")
        self.assertEqual(result.stderr, ("NATIVE_ARTIFACT_" + code + "\n").encode())
        self.assertNotIn(b"PRIVATE", result.stderr)
        self.assertNotIn(b"Traceback", result.stderr)

    def test_cli_emits_only_ids_for_complete_input(self):
        result = self.cli(json.dumps(pages(baseline())).encode())
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b"artifact-ids=101,102,103,104,105\n")
        self.assertEqual(result.stderr, b"")

    def test_cli_invalid_json_metadata_size_and_arguments_use_fixed_errors(self):
        cases = [
            (b"PRIVATE-NOT-JSON", (), "INVALID_METADATA"),
            (b'{"PRIVATE":"DATA"}', (), "INVALID_METADATA"),
            (b'{"total_count":5,"total_count":5}', (), "INVALID_METADATA"),
            (b" " * (SELECTOR.MAX_INPUT_BYTES + 1), (), "INPUT_TOO_LARGE"),
            (b"[]", ("--head-sha", "PRIVATE-SHA"), "INVALID_ARGUMENTS"),
            (b"[]", ("--unknown", "PRIVATE-ARGUMENT"), "INVALID_ARGUMENTS"),
            (b"[]", ("--repo", "k999ln/rock"), "INVALID_ARGUMENTS"),
        ]
        for data, extra, code in cases:
            with self.subTest(code=code):
                self.assert_error(self.cli(data, extra), code)

    def test_missing_input_and_unexpected_exception_do_not_print_raw_diagnostics(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = SELECTOR.main(self.args(["--input", "/PRIVATE-MISSING-INPUT"]))
        self.assertEqual((result, stdout.getvalue(), stderr.getvalue()),
                         (1, "", "NATIVE_ARTIFACT_INPUT_ERROR\n"))
        for error in (RuntimeError("PRIVATE-EXCEPTION"),
                      SELECTOR.SelectionError("PRIVATE-CUSTOM-ERROR")):
            stdout, stderr = io.StringIO(), io.StringIO()
            with mock.patch.object(SELECTOR, "collect_artifacts", side_effect=error), \
                    contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                result = SELECTOR.main(self.args(["--repo", "k999ln/rock"]))
            self.assertEqual((result, stdout.getvalue(), stderr.getvalue()),
                             (1, "", "NATIVE_ARTIFACT_INTERNAL_ERROR\n"))

    def test_cli_repo_mode_uses_same_target_contract_without_real_network(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with mock.patch.object(SELECTOR, "collect_artifacts", return_value=(1, 2, 3, 4, 5)) as collect, \
                contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = SELECTOR.main(self.args(["--repo", "k999ln/rock"]))
        self.assertEqual((result, stdout.getvalue(), stderr.getvalue()),
                         (0, "artifact-ids=1,2,3,4,5\n", ""))
        collect.assert_called_once_with("k999ln/rock", **TARGET)


if __name__ == "__main__":
    unittest.main()
