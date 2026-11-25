import csv
import json
from pathlib import Path
import tempfile
import unittest
import study

class StudyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name)/"run"
    def tearDown(self):
        self.tmp.cleanup()
    def rows(self):
        return study.read_csv(self.folder/"trials.csv", study.FIELDS)
    def save(self, rows):
        study.csv_write(self.folder/"trials.csv", rows, study.FIELDS)
    def test_geometry_matches_independent_known_shapes_and_plane_equation(self):
        for item in study.materials().values():
            k = int(item["id"][-1])
            self.assertEqual(item["answer"]["vertices"], {1:3,2:4,3:5,4:6}[k])
            for p in item["intersection"]:
                self.assertAlmostEqual(study.dot(item["normal"], p), item["offset"])
                self.assertTrue(all(0 <= v <= 1 for v in p))
            self.assertEqual(len(set(item["answer"]["cycle"])), len(item["answer"]["cycle"]))
    def test_allocation_near_balance(self):
        rows=study.assignments()
        self.assertEqual(len(rows),24)
        for pid in {r["participant_id"] for r in rows}:
            these=[r for r in rows if r["participant_id"]==pid]
            self.assertEqual({r["form"] for r in these},set("ABC"))
            self.assertEqual({r["condition"] for r in these},set(study.CONDITIONS))
        for c in study.CONDITIONS:
            for p in (1,2,3):
                self.assertIn(sum(r["condition"]==c and r["period"]==p for r in rows),(2,3))
            for f in "ABC":
                self.assertIn(sum(r["condition"]==c and r["form"]==f for r in rows),(2,3))
    def test_blank_is_not_zero_or_success(self):
        study.initialize(self.folder,"field")
        result=study.analyze(self.folder)
        self.assertEqual(result["observed_scored_rows"],0)
        self.assertEqual(result["evaluable_participants"],0)
        self.assertIsNone(result["participants"][0]["metrics"]["phone"]["day2"]["score_of_12"])
        self.assertEqual(result["hypothesis_result"],"blocked_gen1_readiness")
        self.assertEqual(result["facility_answers_unverified"][0]["budget_max_jpy"],"")
    def test_fixture_exactly_six_not_physical_or_commercial(self):
        study.fixture(self.folder)
        result=study.analyze(self.folder)
        self.assertEqual((result["evaluable_participants"],result["hypothesis_matches"]),(8,6))
        self.assertEqual(result["hypothesis_result"],"met_in_fixture")
        self.assertFalse(result["field_comparison_ready"])
        self.assertIsNone(result["physical_acceptance"])
        self.assertIsNone(result["commercial_validation"])
    def test_incomplete_day2_never_reduces_denominator(self):
        study.fixture(self.folder)
        rows=self.rows()
        for row in rows:
            if row["participant_id"]=="P08" and row["phase"]=="day2":
                for k in study.FIELDS[6:]:row[k]=""
        self.save(rows)
        r=study.analyze(self.folder)
        self.assertEqual((r["evaluable_participants"],r["planned_participants"]),(7,8))
        self.assertEqual(r["hypothesis_result"],"incomplete")
    def test_wrong_cycle_loses_reproduction_point(self):
        item=study.materials()["A-immediate-4"]; a=item["answer"]
        row=dict(vertices=str(a["vertices"]),edges=" ".join(a["edges"]),cycle=" ".join(a["cycle"][::-1]))
        self.assertEqual(study.grade(row,item),3)
        row["cycle"]=" ".join([a["cycle"][1],a["cycle"][0],*a["cycle"][2:]])
        self.assertEqual(study.grade(row,item),2)
    def test_real_mode_rejects_fixture_as_comparison_data(self):
        study.fixture(self.folder)
        path=self.folder/"manifest.json"; m=json.loads(path.read_text());m["mode"]="field"
        path.write_text(json.dumps(m))
        self.assertEqual(study.analyze(self.folder)["evaluable_participants"],0)
    def test_strict_duplicates_negative_nonfinite_order(self):
        for edit in (lambda r:r.append(dict(r[0])),lambda r:r[0].update(elapsed_seconds="-1"),
                     lambda r:r[0].update(gaze_switches="NaN"),lambda r:r[0].update(condition="wall")):
            with self.subTest(edit=edit):
                if not self.folder.exists():study.fixture(self.folder)
                original=self.rows(); changed=[dict(r) for r in original]; edit(changed);self.save(changed)
                with self.assertRaises(ValueError):study.analyze(self.folder)
                self.save(original)
    def test_missing_gaze_and_bad_retention_are_incomplete(self):
        study.fixture(self.folder);rows=self.rows()
        rows[0]["gaze_switches"]=""; self.save(rows)
        self.assertEqual(study.analyze(self.folder)["evaluable_participants"],7)
        rows[0]["gaze_switches"]="4"
        next(r for r in rows if r["participant_id"]=="P01" and r["phase"]=="day2")["retention_hours"]="48"
        self.save(rows);self.assertEqual(study.analyze(self.folder)["evaluable_participants"],7)
    def test_bad_product_target_latency_remains_distinct(self):
        m=study.initialize(self.folder,"field")
        m["gen1_readiness"].update(calibration_id="CAL01",camera_model="fixture_camera",projector_model="fixture_projector",geometry_error_mm=4,
            physical_motion_to_photon_ms=40,one_metre_traverse_ok=True,comfortable=True,setup_checked=True)
        self.assertEqual(study.readiness_errors(m),[]) # Task21 <50; D-1 <=30 is NOT inferred.
        m["gen1_readiness"]["physical_motion_to_photon_ms"]=50
        self.assertIn("physical_motion_to_photon_ms",study.readiness_errors(m))
    def test_pose_stale_future_bad_and_nonfinite(self):
        p=dict(x=0,y=0,z=2,captured_at_ms=950,sequence=1,source="live_pose")
        self.assertEqual(study.validate_pose(p,1000),p)
        for changes in ({"captured_at_ms":899},{"captured_at_ms":1001},{"x":float("nan")},{"z":0},{"source":"fixture"},{"sequence":1.5}):
            with self.assertRaises(ValueError):study.validate_pose(p|changes,1000)
    def test_no_overwrite(self):
        study.initialize(self.folder,"field")
        with self.assertRaises(ValueError):study.fixture(self.folder)
    def test_budget_and_intent_do_not_become_proposal_or_payment(self):
        study.fixture(self.folder)
        row=dict.fromkeys(study.FACILITY_FIELDS, "")|dict(site_id="S01",budget_answer="ceiling",budget_max_jpy="100000",purchase_intent="yes")
        study.csv_write(self.folder/"facilities.csv",[row],study.FACILITY_FIELDS)
        result=study.analyze(self.folder)
        self.assertIsNone(result["commercial_validation"])
        self.assertEqual(result["facility_answers_unverified"][0]["payment_jpy"],"")
        row["proposal_status"]="sent"
        study.csv_write(self.folder/"facilities.csv",[row],study.FACILITY_FIELDS)
        with self.assertRaises(ValueError):study.analyze(self.folder)
    def test_descriptive_medians_include_metric_denominators(self):
        study.initialize(self.folder,"field")
        self.assertEqual(study.analyze(self.folder)["descriptive_medians"]["phone"]["day2"]["score_of_12"],{"n":0,"median":None})

if __name__=="__main__":unittest.main()
