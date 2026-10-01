#!/usr/bin/env python3
"""Read-only source audit, isolated replay, and independent budget arithmetic.

This is not an engine, trajectory, flight-control, or re-entry model.
Writes only beside this script, including its replay directory.
"""
from collections import Counter
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
INPUT_NAMES = ("mass_study.py", "mass_study.json", "mass_study.md", "design_register.json")
G0 = 9.80665


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def independent_row(row):
    dry, ret, asc = row["s2_dry_t"], row["s2_return_t"], row["s2_ascent_t"]
    upper = math.fsum((dry, ret, asc, 0.6, 1.0))
    launch = 445.0 + upper
    sep = 65.0 + upper
    upper_end = dry + ret + 0.6 + 1.0
    dv1 = G0 * row["isp1_s"] * math.log(launch / sep)
    dv2 = G0 * row["isp2_s"] * math.log(upper / upper_end)
    needed = (dry + .6) * math.expm1(150 / (G0 * 360) + 600 / (G0 * 320))
    return {
        "launch_t": launch, "s1_end_t": sep,
        "s2_stage_t": upper - 1, "s2_with_payload_t": upper,
        "s2_end_t": upper_end,
        "loaded_propellant_and_residual_t": 405 + ret + asc + .6,
        "dv1_m_s": dv1, "dv2_m_s": dv2, "dv_total_m_s": dv1 + dv2,
        "illustrative_two_burn_return_required_t": needed,
        "illustrative_two_burn_return_margin_t": ret - needed,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Original C3 package directory (read only)")
    args = parser.parse_args()
    source = args.source or next((parent / "outputs/rocketstar_C3_package" for parent in HERE.parents
                                 if (parent / "outputs/rocketstar_C3_package").is_dir()), None)
    if source is None:
        parser.error("C3 package not found; specify --source with the original package path")
    SOURCE = source.resolve()
    if not all((SOURCE / name).is_file() for name in INPUT_NAMES):
        parser.error("source must contain the four original C3 mass/register files")
    before = {name: sha(SOURCE / name) for name in INPUT_NAMES}
    replay = HERE / "replay"
    replay.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE / "mass_study.py", replay / "mass_study.py")
    completed = subprocess.run([sys.executable, str(replay / "mass_study.py")],
                               cwd=replay, check=True, capture_output=True, text=True)
    stored = json.loads((SOURCE / "mass_study.json").read_text())
    regenerated = json.loads((replay / "mass_study.json").read_text())
    register = json.loads((SOURCE / "design_register.json").read_text())
    numeric_max, field_checks = 0.0, 0
    rows = [stored["nominal"], stored["previous_112t"], *stored["sensitivity"]]
    inverse_rows = stored["inverse_fixed_dry"] + stored["inverse_with_hypothetical_dry_growth"]
    for inverse in inverse_rows:
        rows.append(inverse["solution"] or inverse["sampled_maximum"])
    for row in rows:
        checked = independent_row(row)
        for key, expected in checked.items():
            error = abs(row[key] - expected)
            numeric_max = max(numeric_max, error)
            assert math.isclose(row[key], expected, rel_tol=1e-12, abs_tol=1e-8), (key, row[key], expected)
            field_checks += 1
        assert math.isclose(row["launch_t"], 40 + row["s2_dry_t"] + 1 + row["loaded_propellant_and_residual_t"], abs_tol=1e-9)
        assert math.isclose(row["s1_end_t"], 65 + row["s2_with_payload_t"], abs_tol=1e-9)
        assert row["covers_illustrative_two_burn_return"] == (row["illustrative_two_burn_return_margin_t"] >= 0)
        for target, margin in row["margins_m_s"].items():
            assert math.isclose(margin, checked["dv_total_m_s"] - float(target), abs_tol=1e-8)
    for row in stored["two_burn_return_example"]:
        terminal = row["s2_dry_t"] + .6
        expected = {
            "touchdown_t": terminal,
            "landing_propellant_t": terminal * math.expm1(600 / (G0 * 320)),
            "departure_propellant_t": terminal * math.exp(600 / (G0 * 320)) * math.expm1(150 / (G0 * 360)),
            "total_return_propellant_t": terminal * math.expm1(600 / (G0 * 320) + 150 / (G0 * 360)),
        }
        for key, value in expected.items():
            numeric_max = max(numeric_max, abs(row[key] - value))
            assert math.isclose(row[key], value, abs_tol=1e-10)
            field_checks += 1
    inverse_residuals = []
    growth_errors = []
    no_crossing = []
    for inv in inverse_rows:
        if inv["solution"] is None:
            assert inv["status"] == "no_crossing_in_search_range"
            assert inv["sampled_maximum"]["dv_total_m_s"] < inv["target_m_s"]
            no_crossing.append({k: inv[k] for k in ("dry_anchor_t", "return_t", "isp1_s", "isp2_s", "target_m_s", "marginal_dry_per_propellant", "search_ascent_range_t")})
            continue
        row = inv["solution"]
        assert 0 <= row["s2_ascent_t"] <= 2000
        residual = abs(independent_row(row)["dv_total_m_s"] - inv["target_m_s"])
        inverse_residuals.append(residual)
        assert residual < 1e-6
        expected_dry = inv["dry_anchor_t"] + inv["marginal_dry_per_propellant"] * max(0, row["s2_ascent_t"] + inv["return_t"] - 154)
        growth_errors.append(abs(row["s2_dry_t"] - expected_dry))
        assert math.isclose(row["s2_dry_t"], expected_dry, abs_tol=1e-9)
    items = register["items"]
    counts = dict(Counter(item["status"] for item in items))
    for status, count in register["status_counts"].items():
        assert count == counts.get(status, 0)
    ids = {item["id"] for item in items}
    unresolved = [(item["id"], dep) for item in items for dep in item["dependencies"] if dep not in ids]
    assert not unresolved
    assert len(ids) == len(items)
    assert not any(item["manufacturing_release"] for item in items)
    assert not any(item["certification_evidence"] for item in items)
    return_rows = []
    for retained in (0.0, .5, 1.0):
        dry, residue = 18.0, .6
        end = dry + residue + retained
        ideal_required = end * math.expm1(150 / (G0 * 360) + 600 / (G0 * 320))
        beginning = end + 4.0
        after_departure = beginning - .8
        return_rows.append({
            "retained_payload_t": retained, "terminal_mass_t": end,
            "return_start_with_4t_t": beginning,
            "illustrative_150_600_m_s_return_required_t": ideal_required,
            "illustrative_shortfall_against_4t_t": ideal_required - 4,
            "legacy_allocated_departure_dv_m_s": G0 * 360 * math.log(beginning / after_departure),
            "legacy_allocated_landing_dv_m_s": G0 * 320 * math.log(after_departure / end),
            "status": "conditional_arithmetic_not_approved_return_case",
        })
    alpha_case = next(inv for inv in stored["inverse_with_hypothetical_dry_growth"]
                      if inv["dry_anchor_t"] == 22 and inv["return_t"] == 6
                      and inv["isp1_s"] == 320 and inv["target_m_s"] == 10290
                      and inv["marginal_dry_per_propellant"] == .03)
    conditional = {}
    for target in (10080, 10290):
        ascent = [row for row in stored["sensitivity"] if row["dv_total_m_s"] >= target]
        both = [row for row in ascent if row["covers_illustrative_two_burn_return"]]
        conditional[str(target)] = {
            "ascent_comparison_pass_rows": len(ascent),
            "ascent_and_illustrative_return_pass_rows": len(both),
            "interpretation": "Rows only, not unique designs, trajectory closure, or qualification.",
        }
    after = {name: sha(SOURCE / name) for name in INPUT_NAMES}
    assert before == after
    report = {
        "title": "rocketstar 質量・性能モデル独立監査", "audit_date": "2026-09-24",
        "audit_scope": "Source preservation, isolated replay, independent scalar arithmetic, register consistency, retained-payload sensitivity.",
        "physical_validation": False, "manufacturing_release": False, "flight_release": False,
        "source_directory": str(SOURCE),
        "sources": {name: {"sha256_before": before[name], "sha256_after": after[name]} for name in INPUT_NAMES},
        "reproduction": {
            "isolated_directory": str(replay), "python": sys.version.split()[0],
            "script_bytes_match": sha(replay / "mass_study.py") == before["mass_study.py"],
            "json_bytes_match": sha(replay / "mass_study.json") == before["mass_study.json"],
            "json_values_match": stored == regenerated,
            "markdown_bytes_match": sha(replay / "mass_study.md") == before["mass_study.md"],
            "process_exit_code": completed.returncode,
            "stdout": json.loads(completed.stdout), "source_unchanged": before == after,
        },
        "counts": {"forward_rows": len(stored["sensitivity"]),
                   "unique_forward_input_tuples": len({(r["s2_dry_t"], r["s2_return_t"], r["s2_ascent_t"], r["isp1_s"], r["isp2_s"]) for r in stored["sensitivity"]}),
                   "fixed_dry_inverse_rows": len(stored["inverse_fixed_dry"]),
                   "hypothetical_dry_growth_inverse_rows": len(stored["inverse_with_hypothetical_dry_growth"]),
                   "inverse_crossings": len(inverse_residuals), "inverse_no_crossing_rows": len(no_crossing),
                   "independently_checked_rows": len(rows),
                   "independently_checked_return_table_rows": len(stored["two_burn_return_example"]),
                   "scalar_field_comparisons": field_checks},
        "independent_checks": {"all_checked_numeric_fields_match": True,
                               "maximum_absolute_scalar_difference": numeric_max,
                               "maximum_inverse_residual_m_s": max(inverse_residuals),
                               "maximum_growth_law_difference_t": max(growth_errors),
                               "mass_conservation_and_category_checks": True,
                               "original_search_limits_replayed_not_global_impossibility_proof": True},
        "nominal_comparison_B0": stored["nominal"],
        "approximately_819_7_t_inverse_comparison": alpha_case,
        "conditional_comparison_counts": conditional,
        "retained_payload_cases": return_rows,
        "register": {"item_count": len(items), "status_counts_recounted": counts,
                     "status_counts_match": True, "dangling_dependencies": unresolved,
                     "certified_count": register["certified_count"],
                     "manufacturing_release": register["manufacturing_release"],
                     "flight_release": register["flight_release"],
                     "mass_related": [{k: item[k] for k in ("id", "title", "status", "current_disposition")}
                                      for item in items if item["id"] in ("RDR-004", "RDR-005", "RDR-014", "RDR-016", "RDR-032")]},
        "findings": [
            {"id": "MA-01", "kind": "verified_arithmetic", "detail": "Original replay and independent mass/ideal-delta-v arithmetic checked. This cannot validate unmeasured inputs."},
            {"id": "MA-02", "kind": "open_engineering", "detail": "B0 and approximately 819.7 t comparison are not selected performance. Neither closes actual ascent and return together."},
            {"id": "MA-03", "kind": "missing_case", "detail": "Original return example assumes all payload released. Retained payload now has explicit arithmetic cases; geometry, centre of gravity, heat and landing control remain open."},
            {"id": "MA-04", "kind": "accounting_rule", "detail": "40 t and 18 t dry masses already include 25% old allocation. No second 25% may be added without a separate named allocation."},
            {"id": "MA-05", "kind": "source_history", "detail": "Old RETURN-1 title and work/design_freeze run command remain in preserved mass source. New package should name current report rocketstar and identify replay instructions separately, not alter historical evidence."},
        ],
        "remaining_physical_inputs": ["site and mission", "ascent and return path", "part-level dry mass", "tank volume and structural sizing", "thrust/Isp versus operating point and burn duration", "aerodynamic and heating models", "usable propellant, residuals and all other fluids", "power and waiting duration", "payload state and centre of gravity", "measurement and model uncertainty"],
    }
    (HERE / "audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"reproduction": report["reproduction"], "counts": report["counts"], "checks": report["independent_checks"], "conditional": conditional, "payload_cases": return_rows}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
