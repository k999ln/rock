from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "kernel-cna.py"
SPEC = importlib.util.spec_from_file_location("kernel_cna_assessment", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
CID = "CVE-2026-12345"


def release(lower="6.18.47", upper="6.18.*", status="unaffected", bound="lessThanOrEqual"):
    return {"version": lower, bound: upper, "status": status, "versionType": "semver"}


def record(versions=None):
    return {"cveMetadata": {"cveId": CID, "state": "PUBLISHED", "dateUpdated": "2026-09-08T10:00:00Z"},
            "containers": {"cna": {"providerMetadata": {"shortName": "Linux", "orgId": MODULE.LINUX_CNA_ID},
                           "affected": [{"vendor": "Linux", "product": "Linux", "repo": MODULE.LINUX_REPO,
                                         "defaultStatus": "affected", "versions": [release()] if versions is None else versions}]}}}


class ConservativeRanges(unittest.TestCase):
    def classify(self, versions, target="6.18.50"):
        return MODULE.classify(record(versions), CID, target)

    def test_inclusive_fixed_release_and_same_branch_later_release(self):
        for target in ("6.18.47", "6.18.50", "6.18.100"):
            with self.subTest(target=target):
                result = self.classify([release()], target)
                self.assertEqual(result["classification"], MODULE.UNAFFECTED)
                self.assertEqual(result["matching_unaffected_ranges"][0]["range"], release())
                self.assertFalse(result["default_status_used"])

    def test_before_fix_and_other_branches_remain_unconfirmed(self):
        for target in ("6.18.46", "6.17.99", "6.19.1"):
            with self.subTest(target=target):
                self.assertEqual(self.classify([release()], target)["classification"], MODULE.UNCONFIRMED)

    def test_numeric_order_is_not_lexicographic(self):
        self.assertEqual(self.classify([release("6.18.10")], "6.18.9")["classification"], MODULE.UNCONFIRMED)
        self.assertEqual(self.classify([release("6.18.9")], "6.18.10")["classification"], MODULE.UNAFFECTED)

    def test_numeric_upper_bound_inclusion(self):
        self.assertEqual(self.classify([release("6.18.40", "6.18.50")])["classification"], MODULE.UNAFFECTED)
        self.assertEqual(self.classify([release("6.18.40", "6.18.50", bound="lessThan")])["classification"], MODULE.UNCONFIRMED)

    def test_general_unaffected_range_is_not_same_branch_evidence(self):
        self.assertEqual(self.classify([release("0", "7.0", bound="lessThan")])["classification"], MODULE.UNCONFIRMED)
        self.assertEqual(self.classify([{"version": "6.18.50", "versionType": "semver", "status": "unaffected"}])["classification"], MODULE.UNCONFIRMED)

    def test_default_unaffected_alone_never_classifies(self):
        value = record([])
        value["containers"]["cna"]["affected"][0]["defaultStatus"] = "unaffected"
        self.assertEqual(MODULE.classify(value, CID)["classification"], MODULE.UNCONFIRMED)

    def test_git_and_original_fix_cannot_establish_release_coverage(self):
        ranges = [{"version": "a" * 40, "lessThan": "b" * 40, "versionType": "git", "status": "affected"},
                  {"version": "6.18", "lessThanOrEqual": "*", "versionType": "original_commit_for_fix", "status": "unaffected"}]
        result = self.classify(ranges)
        self.assertEqual(result["classification"], MODULE.UNCONFIRMED)
        self.assertEqual(result["ignored_opaque_ranges"], 2)
        self.assertEqual(self.classify(ranges + [release()])["classification"], MODULE.UNAFFECTED)

    def test_overlapping_affected_or_unknown_statement_blocks_exclusion(self):
        for status in ("affected", "unknown"):
            with self.subTest(status=status):
                result = self.classify([release(), release("6.18.1", "6.18.60", status)])
                self.assertEqual(result["classification"], MODULE.UNCONFIRMED)
                self.assertEqual(len(result["conflicting_ranges"]), 1)
                self.assertEqual(len(result["matching_unaffected_ranges"]), 1)

    def test_cross_branch_affected_interval_still_blocks(self):
        result = self.classify([release(), release("0", "7.0", "affected", "lessThan")])
        self.assertEqual(result["classification"], MODULE.UNCONFIRMED)

    def test_exact_untyped_introduction_does_not_mean_every_later_version(self):
        intro = {"version": "6.18", "status": "affected"}
        self.assertEqual(self.classify([intro, release()])["classification"], MODULE.UNAFFECTED)
        intro["version"] = "6.18.50"
        self.assertEqual(self.classify([intro, release()])["classification"], MODULE.UNCONFIRMED)

    def test_unsupported_range_forms_block_even_with_positive_range(self):
        forms = [release("6.18.47-rc1"), release("6.18.47", "*"),
                 release("6.18.47", "6.18.*", bound="lessThan"),
                 release("6.18.47", "6.19.*"), release("6.18.70", "6.18.60"),
                 {**release(), "changes": [{"at": "6.18.49", "status": "affected"}]},
                 {**release(), "versionType": "custom"}, {**release(), "versionType": []},
                 {**release(), "status": []}, {**release(), "lessThan": "6.18.99"},
                 {"version": "unexpected", "status": "affected"}]
        for bad in forms:
            with self.subTest(bad=bad):
                result = self.classify([release(), bad])
                self.assertEqual(result["classification"], MODULE.UNCONFIRMED)
                self.assertTrue(result["unsupported_ranges"])

    def test_only_published_linux_cna_and_correct_id_are_eligible(self):
        for change in ("other_org", "other_name", "rejected", "id"):
            with self.subTest(change=change):
                value = record()
                if change == "other_org": value["containers"]["cna"]["providerMetadata"]["orgId"] = "other"
                if change == "other_name": value["containers"]["cna"]["providerMetadata"]["shortName"] = "other"
                if change == "rejected": value["cveMetadata"]["state"] = "REJECTED"
                if change == "id": value["cveMetadata"]["cveId"] = "CVE-2026-12346"
                self.assertEqual(MODULE.classify(value, CID)["classification"], MODULE.UNCONFIRMED)

    def test_unrecognized_product_and_missing_versions_stay_unconfirmed(self):
        for bad in (None, {}, {"vendor": "Linux", "product": "Linux", "repo": "https://example.com", "versions": [release()]}):
            with self.subTest(bad=bad):
                value = record()
                value["containers"]["cna"]["affected"].append(bad)
                self.assertEqual(MODULE.classify(value, CID)["classification"], MODULE.UNCONFIRMED)

    def test_exact_target_required_and_input_record_not_mutated(self):
        for bad in ("6.18", "6.18.50-rc1", "6.18.*", "06.18.50"):
            with self.subTest(bad=bad), self.assertRaises(MODULE.RecordError):
                MODULE.classify(record(), CID, bad)
        value = record()
        before = deepcopy(value)
        MODULE.classify(value, CID)
        self.assertEqual(value, before)


class RecordEvidence(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.nvd = self.root / "nvd.json"
        self.cna = self.root / "cna"
        self.cna.mkdir()

    def write_nvd(self, identifiers, total=None):
        self.nvd.write_text(json.dumps({"startIndex": 0, "totalResults": len(identifiers) if total is None else total,
                                        "vulnerabilities": [{"cve": {"id": value}} for value in identifiers]}))

    def test_complete_record_hash_url_and_missing_record_are_explicit(self):
        missing = "CVE-2026-12346"
        self.write_nvd([CID, missing])
        data = json.dumps(record()).encode()
        path = self.cna / (CID + ".json")
        path.write_bytes(data)
        result = MODULE.report(self.nvd, self.cna)
        self.assertTrue(result["source"]["complete_nvd_page"])
        first, second = result["results"]
        self.assertEqual(first["record_sha256"], hashlib.sha256(data).hexdigest())
        self.assertEqual(first["record_url"], "https://cveawg.mitre.org/api/cve/" + CID)
        self.assertEqual(second["classification"], MODULE.UNCONFIRMED)
        self.assertIsNone(second["record_sha256"])
        self.assertEqual(path.read_bytes(), data)

    def test_truncated_candidate_page_is_not_presented_as_complete(self):
        self.write_nvd([], total=1014)
        result = MODULE.report(self.nvd, self.cna)
        self.assertFalse(result["source"]["complete_nvd_page"])
        self.assertEqual(result["source"]["expected_candidates"], 1014)

    def test_duplicate_keys_invalid_json_and_nonfinite_record_do_not_exclude(self):
        self.write_nvd([CID])
        for raw in (b'{"cveMetadata":{},"cveMetadata":{}}', b'{', b'{"x":NaN}'):
            with self.subTest(raw=raw):
                (self.cna / (CID + ".json")).write_bytes(raw)
                row = MODULE.report(self.nvd, self.cna)["results"][0]
                self.assertEqual(row["classification"], MODULE.UNCONFIRMED)
                self.assertEqual(row["record_sha256"], hashlib.sha256(raw).hexdigest())

    def test_invalid_or_duplicate_candidate_ids_rejected_without_path_traversal(self):
        for ids in ([CID, CID], ["../../outside"], [None]):
            with self.subTest(ids=ids):
                self.write_nvd(ids)
                with self.assertRaises(MODULE.RecordError):
                    MODULE.report(self.nvd, self.cna)

    def test_file_read_limit_is_enforced(self):
        path = self.root / "bounded.json"
        path.write_bytes(b" " * 33)
        with self.assertRaises(MODULE.RecordError):
            MODULE.read_json(path, 32)

    def test_report_cli_refuses_overwriting_input_record(self):
        self.write_nvd([CID])
        path = self.cna / (CID + ".json")
        raw = json.dumps(record()).encode()
        path.write_bytes(raw)
        result = subprocess.run([sys.executable, str(SCRIPT), "--nvd", str(self.nvd),
                                 "--cna-dir", str(self.cna), "--output", str(path)],
                                capture_output=True, timeout=3)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"must not overwrite", result.stderr)
        self.assertEqual(path.read_bytes(), raw)


if __name__ == "__main__":
    unittest.main()
