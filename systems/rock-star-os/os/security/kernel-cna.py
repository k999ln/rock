#!/usr/bin/env python3
"""Conservative, offline Linux CNA version-range classification.

This reads records and writes a report. It does not inspect code, execute a
kernel, fetch a network resource, apply patches, or determine exploitability.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re


LINUX_CNA_ID = "416baaa9-dc9f-4396-8d5f-8c081fb06d67"
LINUX_REPO = "https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git"
CVE_ID = re.compile(r"CVE-[0-9]{4}-[0-9]{4,}\Z")
NUMBER = re.compile(r"(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){0,2}\Z")
BRANCH_WILDCARD = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.\*\Z")
UNAFFECTED = "issuer-version-unaffected"
UNCONFIRMED = "unconfirmed"
KNOWN_OPAQUE_TYPES = {"git", "original_commit_for_fix"}


class RecordError(ValueError):
    """An input cannot support a reliable version conclusion."""


def number(value):
    """Linux numeric release notation only; no rc, suffix or hash ordering."""
    if not isinstance(value, str) or not NUMBER.fullmatch(value):
        raise RecordError("unsupported numeric release")
    parts = tuple(int(item) for item in value.split("."))
    if any(item > 2**31 - 1 for item in parts):
        raise RecordError("release component exceeds bound")
    return parts + (0,) * (3 - len(parts))


def target_number(value):
    result = number(value)
    if len(value.split(".")) != 3:
        raise RecordError("target must be an exact major.minor.patch release")
    return result


def interval(version, target):
    """Return (contains target, same-branch bounded interval).

    Numeric cross-branch ranges may disprove a conclusion, but never provide
    an unaffected conclusion. The only supported wildcard is the issuer's
    inclusive major.minor.* upper bound.
    """
    allowed = {"version", "versionType", "status", "lessThan", "lessThanOrEqual"}
    if not isinstance(version, dict) or set(version) - allowed:
        raise RecordError("unsupported range fields (including changes)")
    if version.get("versionType") != "semver":
        raise RecordError("not an explicit semver range")
    if not isinstance(version.get("status"), str) or version["status"] not in {"affected", "unaffected", "unknown"}:
        raise RecordError("unsupported range status")
    lower = number(version.get("version"))
    bounds = [key for key in ("lessThan", "lessThanOrEqual") if key in version]
    if len(bounds) > 1:
        raise RecordError("multiple upper bounds")
    if not bounds:
        return target == lower, False
    bound = bounds[0]
    raw_upper = version[bound]
    wildcard = BRANCH_WILDCARD.fullmatch(raw_upper) if isinstance(raw_upper, str) else None
    if wildcard:
        if bound != "lessThanOrEqual":
            raise RecordError("exclusive wildcard upper bound is unsupported")
        branch = tuple(int(part) for part in wildcard.groups())
        if any(part > 2**31 - 1 for part in branch) or lower[:2] != branch:
            raise RecordError("wildcard is not on the lower-bound branch")
        return target[:2] == branch and target >= lower, target[:2] == branch
    upper = number(raw_upper)
    if upper < lower or (upper == lower and bound == "lessThan"):
        raise RecordError("empty or reversed interval")
    contains = lower <= target and (target <= upper if bound == "lessThanOrEqual" else target < upper)
    same_branch = lower[:2] == target[:2] == upper[:2]
    return contains, same_branch


def classify(record, cve_id, target_version="6.18.50"):
    target = target_number(target_version)
    result = {"id": cve_id, "classification": UNCONFIRMED, "reasons": [],
              "matching_unaffected_ranges": [], "conflicting_ranges": [],
              "evaluated_semver_ranges": [], "unsupported_ranges": [],
              "opaque_range_evidence": [], "ignored_opaque_ranges": 0,
              "default_status_used": False}
    if not isinstance(record, dict):
        result["reasons"] = ["invalid_record"]
        return result
    metadata = record.get("cveMetadata", {})
    containers = record.get("containers", {})
    cna = containers.get("cna", {}) if isinstance(containers, dict) else {}
    provider = cna.get("providerMetadata", {}) if isinstance(cna, dict) else {}
    if not isinstance(metadata, dict) or metadata.get("cveId") != cve_id:
        result["reasons"] = ["record_id_mismatch"]
        return result
    result["record_updated_at"] = metadata.get("dateUpdated")
    result["issuer"] = provider if isinstance(provider, dict) else {}
    if metadata.get("state") != "PUBLISHED":
        result["reasons"] = ["record_not_published"]
        return result
    if (not isinstance(provider, dict) or provider.get("orgId") != LINUX_CNA_ID
            or provider.get("shortName") != "Linux"):
        result["reasons"] = ["not_linux_cna"]
        result["uninterpreted_affected"] = cna.get("affected") if isinstance(cna, dict) else None
        return result
    affected = cna.get("affected")
    if not isinstance(affected, list) or not affected:
        result["reasons"] = ["missing_affected_products"]
        return result
    product_error = False
    for product_index, product in enumerate(affected):
        if (not isinstance(product, dict) or product.get("vendor") != "Linux"
                or product.get("product") != "Linux" or product.get("repo") != LINUX_REPO):
            product_error = True
            continue
        versions = product.get("versions")
        if not isinstance(versions, list) or not versions:
            product_error = True
            continue
        for version_index, version in enumerate(versions):
            evidence = {"product_index": product_index, "version_index": version_index,
                        "range": version}
            if not isinstance(version, dict):
                result["unsupported_ranges"].append(evidence)
                continue
            kind = version.get("versionType")
            if kind is not None and not isinstance(kind, str):
                result["unsupported_ranges"].append(evidence)
                continue
            if kind in KNOWN_OPAQUE_TYPES:
                # Separate issuer git/fix provenance is never semver evidence.
                result["ignored_opaque_ranges"] += 1
                result["opaque_range_evidence"].append(evidence)
                continue
            if kind is None and set(version) == {"version", "status"}:
                # Linux also records introduction versions without a range.
                # Do not infer that an introduction covers every later release.
                try:
                    exact = number(version["version"])
                except RecordError:
                    result["unsupported_ranges"].append(evidence)
                    continue
                if not isinstance(version["status"], str) or version["status"] not in {"affected", "unaffected", "unknown"}:
                    result["unsupported_ranges"].append(evidence)
                elif exact == target and version["status"] != "unaffected":
                    result["conflicting_ranges"].append(evidence)
                continue
            try:
                contains, same_branch = interval(version, target)
            except RecordError as error:
                evidence["error"] = str(error)
                result["unsupported_ranges"].append(evidence)
                continue
            result["evaluated_semver_ranges"].append({**evidence, "contains_target": contains,
                                                       "same_target_branch_interval": same_branch})
            if contains and version["status"] in {"affected", "unknown"}:
                result["conflicting_ranges"].append(evidence)
            if contains and same_branch and version["status"] == "unaffected":
                result["matching_unaffected_ranges"].append(evidence)
    if product_error:
        result["reasons"].append("unsupported_or_missing_linux_product")
    if result["unsupported_ranges"]:
        result["reasons"].append("unsupported_range_format")
    if result["conflicting_ranges"]:
        result["reasons"].append("matching_affected_or_unknown_range")
    if not result["matching_unaffected_ranges"]:
        result["reasons"].append("no_explicit_same_branch_unaffected_interval")
    if not result["reasons"]:
        result["classification"] = UNAFFECTED
        result["reasons"] = ["explicit_linux_cna_same_branch_unaffected_interval"]
    return result


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise RecordError("duplicate JSON object key")
        result[key] = value
    return result


def read_json(path, maximum):
    with path.open("rb") as stream:
        data = stream.read(maximum + 1)
    if len(data) > maximum:
        raise RecordError("input file exceeds size bound")
    digest = hashlib.sha256(data).hexdigest()

    def reject_constant(value):
        raise RecordError("non-finite JSON number")

    try:
        value = json.loads(data, object_pairs_hook=_pairs, parse_constant=reject_constant)
    except (UnicodeError, json.JSONDecodeError, RecursionError, RecordError) as error:
        failure = RecordError("invalid JSON record")
        failure.record_sha256 = digest
        raise failure from error
    return value, digest


def report(nvd_path, cna_directory, target_version="6.18.50"):
    target_number(target_version)
    nvd, nvd_hash = read_json(nvd_path, 64 * 1024 * 1024)
    if not isinstance(nvd, dict) or not isinstance(nvd.get("vulnerabilities"), list):
        raise RecordError("NVD vulnerabilities list is required")
    entries = nvd["vulnerabilities"]
    if len(entries) > 100_000:
        raise RecordError("candidate count exceeds bound")
    identifiers = []
    identifier_set = set()
    for entry in entries:
        try:
            candidate = entry["cve"]["id"]
        except (KeyError, TypeError) as error:
            raise RecordError("candidate id is missing") from error
        if not isinstance(candidate, str) or not CVE_ID.fullmatch(candidate) or candidate in identifier_set:
            raise RecordError("candidate id is invalid or duplicated")
        identifiers.append(candidate)
        identifier_set.add(candidate)
    results = []
    for candidate in identifiers:
        path = cna_directory / (candidate + ".json")
        record_hash = None
        try:
            record, record_hash = read_json(path, 4 * 1024 * 1024)
            row = classify(record, candidate, target_version)
        except (OSError, RecordError) as error:
            record_hash = getattr(error, "record_sha256", record_hash)
            row = {"id": candidate, "classification": UNCONFIRMED,
                   "reasons": ["record_unreadable"], "error_type": type(error).__name__,
                   "default_status_used": False}
        row.update({"record_path": str(path), "record_sha256": record_hash,
                    "record_url": "https://cveawg.mitre.org/api/cve/" + candidate,
                    "public_url": "https://www.cve.org/CVERecord?id=" + candidate})
        results.append(row)
    total = nvd.get("totalResults")
    complete = type(total) is int and total == len(entries) and nvd.get("startIndex") == 0
    return {"schema": 1, "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "target_version": target_version,
            "source": {"nvd_file": str(nvd_path), "nvd_sha256": nvd_hash,
                       "cna_directory": str(cna_directory), "expected_candidates": total,
                       "loaded_candidates": len(entries), "complete_nvd_page": complete},
            "scope": "Offline issuer-version statements only; no source/config/backport inspection, exploitability inference, runtime test or global safety conclusion.",
            "policy": {"positive": "Explicit Linux CNA unaffected semver interval on the exact target major.minor branch, without a matching affected/unknown statement or unsupported semantic range.",
                       "default_status_used": False,
                       "git_or_original_commit_fix_ranges": "Preserved in source records; counted but never converted to semver or used alone to conclude unaffected.",
                       "unconfirmed": "Does not mean vulnerable; manual source/config/vendor review remains required.",
                       "numeric_notation": "One/two-component numeric Linux bounds are normalized with zeroes. Prereleases, suffixes, hashes and general wildcards are not ordered.",
                       "hardware_and_runtime_verification": "NOT_RUN"},
            "counts": dict(Counter(row["classification"] for row in results)),
            "reason_counts": dict(Counter(reason for row in results for reason in row["reasons"])),
            "results": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--nvd", type=Path, required=True)
    parser.add_argument("--cna-dir", type=Path, required=True)
    parser.add_argument("--target", default="6.18.50")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = report(args.nvd, args.cna_dir, args.target)
    protected = {args.nvd.resolve()}
    protected.update((args.cna_dir / (row["id"] + ".json")).resolve() for row in result["results"])
    if args.output.resolve() in protected:
        parser.error("output must not overwrite an input record")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "source_complete": result["source"]["complete_nvd_page"],
                      "counts": result["counts"], "reason_counts": result["reason_counts"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
