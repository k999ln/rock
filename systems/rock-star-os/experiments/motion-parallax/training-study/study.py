#!/usr/bin/env python3
"""Offline, anonymous pilot kit. Standard library only; no product/runtime writes."""
import argparse
import csv
from datetime import date
import hashlib
import html
import io
import itertools
import json
import math
from pathlib import Path
import secrets
import statistics
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = Path(__file__).resolve().parent
VERSION = "mii.sections.pilot/1"
CONDITIONS = ("phone", "wall", "gen1")
VERTICES = dict(zip("ABCDEFGH", [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0),
                                       (0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]))
EDGES = ("AB", "BC", "CD", "DA", "EF", "FG", "GH", "HE", "AE", "BF", "CG", "DH")
FIELDS = ["participant_id", "phase", "period", "condition", "form", "item_id", "status",
          "vertices", "edges", "cycle", "elapsed_seconds", "gaze_switches", "hints",
          "retention_hours", "input_source", "deviation"]
STATUSES = ("complete", "timeout", "withdrawn", "technical_failure")
SOURCES = ("phone_screen", "fixed_projection", "live_pose", "fixture", "paper")
DEVIATIONS = ("none", "tracking_loss", "interruption", "discomfort", "extra_teaching", "other")
FACILITY_FIELDS = ["site_id", "next_date_answer", "next_date", "budget_answer", "budget_max_jpy",
                   "purchase_intent", "proposal_status", "proposal_ref", "payment_jpy", "payment_ref"]
SETUP_FIELDS = ["condition", "session_id", "device_model", "setup_minutes", "calibration_minutes",
                "teardown_minutes", "people_needed", "occupied_m2", "cables_count", "construction_needed",
                "ambient_lux", "viewing_distance_m", "image_width_m", "geometry_error_mm",
                "physical_motion_to_photon_ms", "traverse_one_metre_ok", "fps", "dropout_count", "discomfort_stops"]

def dot(a, b):
    return sum(x*y for x, y in zip(a, b))

def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])

def normalized(a):
    d = math.sqrt(dot(a, a))
    return tuple(x/d for x in a)

def section(normal, offset):
    hits = []
    for edge in EDGES:
        a, b = [VERTICES[k] for k in edge]
        da, db = dot(normal, a)-offset, dot(normal, b)-offset
        if da*db < 0:
            t = da/(da-db)
            hits.append((edge, tuple(x+t*(y-x) for x, y in zip(a, b))))
    center = tuple(statistics.mean(p[i] for _, p in hits) for i in range(3))
    u = normalized(cross(normal, (0, 1, 0) if abs(normal[1]) < .9*math.sqrt(dot(normal, normal)) else (1, 0, 0)))
    v = normalized(cross(normal, u))
    hits.sort(key=lambda e: math.atan2(dot(tuple(e[1][i]-center[i] for i in range(3)), v),
                                     dot(tuple(e[1][i]-center[i] for i in range(3)), u)))
    return hits

def materials():
    result = {}
    # Three isomorphic forms; equivalence is geometric, not psychometrically validated.
    for f, form in enumerate("ABC"):
        for phase in ("immediate", "day2"):
            for k, (n, d) in enumerate([((1, 1, 1), .6), ((0, 0, 1), .45),
                                        ((1, 1, 2), 1.5), ((1, 1, 1), 1.5)], 1):
                # Axis permutation plus reflection changes labels while preserving shape difficulty.
                n = list(n[f:]+n[:f])
                if f == 1:
                    d -= n[0]
                    n[0] *= -1
                if f == 2:
                    d -= n[1]
                    n[1] *= -1
                if phase == "day2":
                    d += (.12 if f == 0 else -.12)  # transfer: different cutting location
                key = f"{form}-{phase}-{k}"
                hits = section(n, d)
                result[key] = {"id": key, "normal": n, "offset": d,
                               "answer": {"vertices": len(hits), "edges": sorted(e for e, _ in hits),
                                          "cycle": [e for e, _ in hits]},
                               "intersection": [p for _, p in hits]}
    return result

def assignments():
    orders = list(itertools.permutations(CONDITIONS)) + [("phone", "wall", "gen1"), ("wall", "gen1", "phone")]
    # Exhaustively choose form rotations; fixed before any observations, no outcome-dependent allocation.
    best = None
    for shifts in itertools.product(range(3), repeat=8):
        forms = [tuple("ABC"[(j+s) % 3] for j in range(3)) for s in shifts]
        counts = {(c, f): 0 for c in CONDITIONS for f in "ABC"}
        for order, fs in zip(orders, forms):
            for c, f in zip(order, fs):
                counts[c, f] += 1
        score = sum((n-8/3)**2 for n in counts.values())
        position = sum((sum(fs[j] == f for fs in forms)-8/3)**2 for j in range(3) for f in "ABC")
        rank = (round(score+position, 8), shifts)
        if best is None or rank < best[0]:
            best = (rank, forms)
    rows = []
    for i, (order, fs) in enumerate(zip(orders, best[1]), 1):
        for j, (condition, form) in enumerate(zip(order, fs), 1):
            item_order = [(k+i+j-2) % 4+1 for k in range(4)]
            rows.append(dict(participant_id=f"P{i:02}", period=j, condition=condition, form=form,
                             item_order=" ".join(map(str, item_order))))
    return rows

def csv_write(path, rows, fields):
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

def expected_rows(schedule):
    return [{**{k: str(a[k]) for k in ("participant_id", "period", "condition", "form")},
             "phase": phase, "item_id": f"{a['form']}-{phase}-{k}",
             **{k: "" for k in FIELDS[6:]}}
            for a in schedule for phase in ("immediate", "day2") for k in a["item_order"].split()]

def project(p, eye=(2.7, 2.1, 5), width=2, height=2):
    p = tuple((v-.5)*.8 for v in p)
    p = (p[0], p[1], p[2]-.8)
    t = eye[2]/(eye[2]-p[2])
    return ((eye[0]+t*(p[0]-eye[0]))/width*400+200,
            200-(eye[1]+t*(p[1]-eye[1]))/height*400)

def diagram(item, answer=False):
    parts = []
    points = [project(p) for p in item["intersection"]]
    # The transfer sheet shows the cutting plane, not the intersection/answer.
    n, d = item["normal"], item["offset"]
    center = tuple(.5+x*(d-dot(n, (.5, .5, .5)))/dot(n, n) for x in n)
    u = normalized(cross(n, (1, 0, 0) if abs(n[0]) < .9*math.sqrt(dot(n, n)) else (0, 1, 0)))
    v = normalized(cross(n, u))
    plane = [project(tuple(center[i]+a*u[i]+b*v[i] for i in range(3)))
             for a, b in [(-1.1, -1.1), (1.1, -1.1), (1.1, 1.1), (-1.1, 1.1)]]
    all_points = plane+[project(p) for p in VERTICES.values()]
    x0, y0 = min(p[0] for p in all_points)-20, min(p[1] for p in all_points)-20
    x1, y1 = max(p[0] for p in all_points)+20, max(p[1] for p in all_points)+20
    parts.append(f'<svg viewBox="{x0:.1f} {y0:.1f} {x1-x0:.1f} {y1-y0:.1f}" width="320" height="260" aria-label="切断平面と辺の符号">')
    parts.append('<polygon points="'+" ".join(f"{x:.1f},{y:.1f}" for x, y in plane)+'" fill="#bbd4df" fill-opacity=".5" stroke="#416579"/>')
    for edge in EDGES:
        a, b = [project(VERTICES[k]) for k in edge]
        parts.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#111"/>')
    for key, p in VERTICES.items():
        x, y = project(p)
        parts.append(f'<text x="{x+5:.1f}" y="{y-5:.1f}" font-size="13">{key}</text>')
    if answer:
        parts.append('<polygon points="'+" ".join(f"{x:.1f},{y:.1f}" for x, y in points)+'" fill="none" stroke="#b53219" stroke-width="3"/>')
    return "".join(parts)+"</svg>"

def write_packet(folder, manifest):
    mats = materials()
    style = '<style>body{font:16px sans-serif;max-width:960px;margin:2em auto}section{break-after:page}section[hidden]{display:none}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:.4em}label{display:block;margin:1em 0}.draw{height:130px;border:1px solid #aaa}svg{display:block;max-width:100%;overflow:hidden}@media print{body{margin:0}button,.controls{display:none}section{break-inside:avoid}}</style>'
    parts = ['<!doctype html><html lang="ja"><meta charset="utf-8"><title>匿名記入票</title>'+style,
             '<div class="controls"><h1>mii 断面理解・匿名記入票</h1><p>氏名・連絡先・勤務先名は記入しない。空欄は未測定。P01〜P08はくじ順で割り当て、本人だけがカードを翌日持参。日程調整は施設側で別管理。</p><label>印刷するID <select id="pid"><option value="all">全員</option>'+''.join(f'<option>P{i:02}</option>' for i in range(1,9))+'<option>S01</option></select></label><label>日 <select id="day"><option value="all">当日・翌日</option><option value="immediate">当日</option><option value="day2">翌日</option></select></label><button onclick="window.print()">選択した票を印刷</button></div>']
    for a in manifest["assignments"]:
        for phase in ("immediate", "day2"):
            for k in a["item_order"].split():
                item = mats[f'{a["form"]}-{phase}-{k}']
                parts.append(f'<section data-pid="{a["participant_id"]}" data-day="{phase}"><h2>{a["participant_id"]} / {phase} / 順番{a["period"]} / {a["condition"]} / {a["form"]}</h2>')
                parts.append('<p>頂点数、切断される辺、断面の輪郭を順に記す。辺の向きAB/BA、輪郭の開始位置・回り方は自由。個人名を書かない。</p>')
                parts.append(f'<h3>{item["id"]}</h3>')
                if phase == "day2":
                    parts.append(diagram(item))
                parts.append('<p>頂点数: ______　切断される辺: __________________________</p><div class="draw">輪郭を描き、各頂点に対応する辺の符号を書く（辺の巡回順も記入）:</div><p>巡回順: _______________________________________</p>')
                parts.append('<p>観察者: status ______ 秒 ______ 視線切替 ______ ヒント ______ 入力源 ______ 逸脱 ______ 翌日間隔h ______</p>')
                parts.append('</section>')
    parts.append('<section data-pid="S01" data-day="all"><h2>施設担当者の回答（別票・匿名施設ID S01）</h2><p>次回日程回答［未回答／検討中／日付提示／なし］ 日付 ______</p><p>予算回答［未回答／検討中／上限提示／予算なし］ 上限 ______ 円</p><p>購入意向［未回答／検討／あり／なし］ ______</p><p>実提案［未実施／下書き／送付／受諾／辞退］ ______ 証拠参照 ______</p><p>入金額 ______ 円 証拠参照 ______（意向・予算から推測しない）</p></section>')
    parts.append('<script>function filter(){const p=document.getElementById("pid").value,d=document.getElementById("day").value;document.querySelectorAll("section[data-pid]").forEach(s=>s.hidden=(p!=="all"&&s.dataset.pid!==p)||(d!=="all"&&s.dataset.day!==d&&s.dataset.day!=="all"));}document.getElementById("pid").onchange=filter;document.getElementById("day").onchange=filter;</script></html>')
    (folder/"forms.html").write_text("".join(parts), encoding="utf-8")
    key = ['<!doctype html><html lang="ja"><meta charset="utf-8"><title>進行者専用採点鍵</title>'+style+'<h1>進行者専用・翌日終了まで非開示</h1>']
    for item in mats.values():
        key.append(f'<section><h2>{item["id"]}</h2>{diagram(item, True)}<p>{html.escape(json.dumps(item["answer"], ensure_ascii=False))}</p></section>')
    (folder/"answer-key.html").write_text("".join(key)+"</html>", encoding="utf-8")

def initialize(folder, mode):
    if folder.exists():
        raise ValueError("出力先は新しいディレクトリを指定。既存記録は上書きしません")
    folder.mkdir(parents=True)
    schedule = assignments()
    manifest = {"schema": VERSION, "mode": mode, "assignments": schedule,
                "hypothesis": "all_8_complete_and_at_least_6_lower_gaze_than_both_and_preserved_both_scores",
                "display": {"width_m": 2.0, "height_m": 1.125, "eye_distance_m": 2.0},
                "gen1_readiness": {"calibration_id": "", "camera_model": "", "projector_model": "",
                    "geometry_error_mm": None, "physical_motion_to_photon_ms": None,
                    "one_metre_traverse_ok": None, "comfortable": None, "setup_checked": None},
                "physical_accepted": False, "product_goal_accepted": False}
    (folder/"manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n")
    rows = expected_rows(schedule)
    csv_write(folder/"assignments.csv", schedule, list(schedule[0]))
    csv_write(folder/"trials.csv", rows, FIELDS)
    csv_write(folder/"facilities.csv", [dict.fromkeys(FACILITY_FIELDS, "") | {"site_id": "S01"}], FACILITY_FIELDS)
    setup = [dict.fromkeys(SETUP_FIELDS, "") | {"condition": c} for c in CONDITIONS]
    csv_write(folder/"setup.csv", setup, SETUP_FIELDS)
    write_packet(folder, manifest)
    (folder/".gitignore").write_text("*\n")
    return manifest

def number(row, key, low=0, high=1e9, integer=False):
    raw = row[key].strip()
    if not raw:
        return None
    try:
        n = float(raw)
    except ValueError as e:
        raise ValueError(f"{key}: 数値が必要") from e
    if not math.isfinite(n) or not low <= n <= high or (integer and n != int(n)):
        raise ValueError(f"{key}: 範囲外")
    return n

def edge_list(raw):
    lookup = {"".join(sorted(e)): e for e in EDGES}
    parts = raw.upper().replace("→", " ").replace(",", " ").replace(";", " ").split()
    if any("".join(sorted(e)) not in lookup for e in parts):
        raise ValueError("辺の符号は AB BC CD DA EF FG GH HE AE BF CG DH")
    return [lookup["".join(sorted(e))] for e in parts]

def grade(row, item):
    vertices = number(row, "vertices", 0, 12, True)
    edges, cycle = edge_list(row["edges"]), edge_list(row["cycle"])
    if len(cycle) > 1 and cycle[0] == cycle[-1]:
        cycle.pop()
    answer = item["answer"]
    target = answer["cycle"]
    same_cycle = len(cycle) == len(target) and any(cycle == seq[i:]+seq[:i]
                  for seq in (target, target[::-1]) for i in range(len(target)))
    return int(vertices == answer["vertices"])+int(len(edges) == len(set(edges)) and sorted(edges) == answer["edges"])+int(same_cycle)

def read_csv(path, fields):
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != fields:
            raise ValueError(f"{path.name}: ヘッダー不一致")
        rows = list(reader)
        if any(None in r or any(v is None for v in r.values()) for r in rows):
            raise ValueError(f"{path.name}: 列数不一致")
        return rows

def analyze(folder):
    manifest = json.loads((folder/"manifest.json").read_text())
    if manifest.get("schema") != VERSION or manifest.get("mode") not in ("field", "fixture"):
        raise ValueError("manifest の版または mode 不一致")
    if manifest["assignments"] != assignments():
        raise ValueError("割付表が事前固定値と異なります。別試験として版を改める必要があります")
    expected = {(r["participant_id"], r["phase"], r["item_id"]): r for r in expected_rows(manifest["assignments"])}
    observed = {}
    mats = materials()
    rows = read_csv(folder/"trials.csv", FIELDS)
    for row in rows:
        key = tuple(row[k] for k in ("participant_id", "phase", "item_id"))
        if key in observed or key not in expected:
            raise ValueError(f"重複または未知の行: {key}")
        if any(row[k] != expected[key][k] for k in FIELDS[:6]):
            raise ValueError(f"割付不一致: {key}")
        status = row["status"]
        if status not in ("", *STATUSES):
            raise ValueError(f"status 不明: {key}")
        for k, choices in [("input_source", SOURCES), ("deviation", DEVIATIONS)]:
            if row[k] and row[k] not in choices:
                raise ValueError(f"{k} 不明: {key}")
        score = grade(row, mats[row["item_id"]]) if status in ("complete", "timeout") else None
        elapsed = number(row, "elapsed_seconds", 0, 90)
        gaze = number(row, "gaze_switches", 0, 10000, True)
        hints = number(row, "hints", 0, 2, True)
        retention = number(row, "retention_hours", 0, 168)
        source = "paper" if row["phase"] == "day2" else {"phone": "phone_screen", "wall": "fixed_projection", "gen1": "live_pose"}[row["condition"]]
        provenance_ok = row["input_source"] == ("fixture" if manifest["mode"] == "fixture" else source)
        usable = (status in ("complete", "timeout") and elapsed is not None and elapsed > 0
                  and hints is not None and provenance_ok and row["deviation"] == "none"
                  and (status != "timeout" or elapsed == 90)
                  and (row["phase"] != "day2" or (retention is not None and 20 <= retention <= 28 and hints == 0)))
        if not status and any(row[k] for k in FIELDS[7:]):
            raise ValueError(f"status 未記入の測定値: {key}")
        observed[key] = {"row": row, "score": score, "elapsed": elapsed, "gaze": gaze, "hints": hints, "usable": usable}
    people = []
    for pid in sorted({r[0] for r in expected}):
        metrics = {}
        for c in CONDITIONS:
            metrics[c] = {}
            for phase in ("immediate", "day2"):
                values = [v for v in observed.values() if v["row"]["participant_id"] == pid and v["row"]["condition"] == c and v["row"]["phase"] == phase]
                complete = len(values) == 4 and all(v["usable"] for v in values)
                gaze_complete = complete and all(v["gaze"] is not None for v in values)
                seconds = sum(v["elapsed"] for v in values) if complete else None
                total_gaze = sum(v["gaze"] for v in values) if gaze_complete else None
                metrics[c][phase] = {"usable_items": sum(v["usable"] for v in values),
                    "score_of_12": sum(v["score"] for v in values) if complete else None,
                    "seconds": seconds, "gaze_switches": total_gaze,
                    "gaze_per_minute": total_gaze/(seconds/60) if gaze_complete else None,
                    "hints": sum(v["hints"] for v in values) if complete else None}
        available = all(metrics[c][p]["score_of_12"] is not None for c in CONDITIONS for p in ("immediate", "day2")) and all(metrics[c]["immediate"]["gaze_switches"] is not None for c in CONDITIONS)
        qualifies = (all(metrics["gen1"]["immediate"]["gaze_switches"] < metrics[c]["immediate"]["gaze_switches"] for c in ("phone", "wall")) and
                     all(metrics["gen1"][p]["score_of_12"] >= metrics[c][p]["score_of_12"] for c in ("phone", "wall") for p in ("immediate", "day2"))) if available else None
        people.append({"participant_id": pid, "metrics": metrics, "hypothesis_match": qualifies})
    setup = read_csv(folder/"setup.csv", SETUP_FIELDS)
    seen_setup = set()
    for row in setup:
        key = row["condition"], row["session_id"]
        if row["condition"] not in CONDITIONS or key in seen_setup:
            raise ValueError("設置票: 不明な方式または重複セッション")
        seen_setup.add(key)
        for k in SETUP_FIELDS[3:]:
            if k in ("construction_needed", "traverse_one_metre_ok"):
                if row[k] not in ("", "yes", "no"):
                    raise ValueError("設置票: yes/no/空欄")
            else:
                number(row, k)
    facilities = read_csv(folder/"facilities.csv", FACILITY_FIELDS)
    seen_sites = set()
    for row in facilities:
        if not row["site_id"].startswith("S") or not row["site_id"][1:].isdigit():
            raise ValueError("施設IDはSと数字のみ")
        if row["site_id"] in seen_sites:
            raise ValueError("施設ID重複")
        seen_sites.add(row["site_id"])
        for k in ("budget_max_jpy", "payment_jpy"):
            number(row, k, 0, 1e12, True)
        for k, allowed in {"next_date_answer": ("pending", "date", "no"), "budget_answer": ("pending", "ceiling", "none"), "purchase_intent": ("considering", "yes", "no"), "proposal_status": ("not_made", "draft", "sent", "accepted", "declined")}.items():
            if row[k] and row[k] not in allowed:
                raise ValueError(f"施設票: {k} 不明")
        if row["next_date"] or row["next_date_answer"] == "date":
            if row["next_date_answer"] != "date" or date.fromisoformat(row["next_date"]).isoformat() != row["next_date"]:
                raise ValueError("日程提示はYYYY-MM-DDの回答日が必要")
        if row["budget_max_jpy"] or row["budget_answer"] == "ceiling":
            if row["budget_answer"] != "ceiling" or not row["budget_max_jpy"]:
                raise ValueError("予算上限提示はceilingと金額の両方が必要")
        if row["proposal_status"] in ("sent", "accepted") and not row["proposal_ref"]:
            raise ValueError("実提案は証拠参照が必要")
        if row["payment_jpy"] and not row["payment_ref"]:
            raise ValueError("入金記録は証拠参照が必要")
    evaluable = sum(p["hypothesis_match"] is not None for p in people)
    count = sum(p["hypothesis_match"] is True for p in people)
    gate = readiness_errors(manifest)
    groups = {}
    for c in CONDITIONS:
        groups[c] = {}
        for phase in ("immediate", "day2"):
            groups[c][phase] = {}
            for metric in ("score_of_12", "seconds", "gaze_switches", "gaze_per_minute", "hints"):
                values = [p["metrics"][c][phase][metric] for p in people if p["metrics"][c][phase][metric] is not None]
                groups[c][phase][metric] = {"n": len(values), "median": statistics.median(values) if values else None}
    result = {"schema": VERSION, "mode": manifest["mode"], "synthetic": manifest["mode"] == "fixture",
              "observed_scored_rows": sum(v["score"] is not None for v in observed.values()),
              "missing_rows": len(expected)-len(observed), "evaluable_participants": evaluable,
              "hypothesis_matches": count, "planned_participants": 8,
              "hypothesis_result": ("met_in_fixture" if manifest["mode"] == "fixture" else "met_in_pilot") if evaluable == 8 and count >= 6 else ("not_met" if evaluable == 8 else "incomplete"),
              "gen1_readiness_errors": gate, "field_comparison_ready": manifest["mode"] == "field" and not gate,
              "physical_acceptance": None, "whole_room_acceptance": None, "commercial_validation": None,
              "participants": people, "descriptive_medians": groups, "setup_measurements_unverified": setup, "facility_answers_unverified": facilities,
              "input_sha256": {n: hashlib.sha256((folder/n).read_bytes()).hexdigest() for n in ("manifest.json", "assignments.csv", "trials.csv", "facilities.csv", "setup.csv")}}
    if manifest["mode"] == "field" and gate:
        result["hypothesis_result"] = "blocked_gen1_readiness"
    return result

def readiness_errors(manifest):
    r = manifest["gen1_readiness"]
    errors = [k for k in ("calibration_id", "camera_model", "projector_model") if not r.get(k)]
    for k in ("one_metre_traverse_ok", "comfortable", "setup_checked"):
        if r.get(k) is not True:
            errors.append(k)
    for k, maximum in (("geometry_error_mm", 5), ("physical_motion_to_photon_ms", 50)):
        n = r.get(k)
        if isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) or n < 0 or (n >= maximum if maximum == 50 else n > maximum):
            errors.append(k)
    for k in ("width_m", "height_m", "eye_distance_m"):
        n = manifest["display"].get(k)
        if isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) or not .1 <= n <= 10:
            errors.append("display."+k)
    return errors

def fixture(folder):
    initialize(folder, "fixture")
    rows = read_csv(folder/"trials.csv", FIELDS)
    mats = materials()
    for row in rows:
        answer = mats[row["item_id"]]["answer"]
        row.update(status="complete", vertices=str(answer["vertices"]), edges=" ".join(answer["edges"]),
                   cycle=" ".join(answer["cycle"]), elapsed_seconds="45", hints="0", input_source="fixture", deviation="none")
        row["gaze_switches"] = "2" if row["condition"] == "gen1" and int(row["participant_id"][1:]) <= 6 else "4"
        row["retention_hours"] = "24" if row["phase"] == "day2" else ""
    csv_write(folder/"trials.csv", rows, FIELDS)

def validate_pose(payload, now_ms):
    if set(payload) != {"x", "y", "z", "captured_at_ms", "sequence", "source"} or payload["source"] != "live_pose":
        raise ValueError("pose schema")
    if any(isinstance(payload[k], bool) or not isinstance(payload[k], (int, float)) or not math.isfinite(payload[k]) for k in ("x", "y", "z", "captured_at_ms", "sequence")):
        raise ValueError("pose numeric")
    if not (-5 <= payload["x"] <= 5 and -5 <= payload["y"] <= 5 and .2 <= payload["z"] <= 10 and
            0 <= now_ms-payload["captured_at_ms"] <= 100 and payload["sequence"] >= 0 and payload["sequence"] == int(payload["sequence"])):
        raise ValueError("pose range/freshness")
    return payload

def serve(folder, port, allow_lan=False):
    manifest = json.loads((folder/"manifest.json").read_text())
    public = {"schema": VERSION, "mode": manifest["mode"], "display": manifest["display"],
              "readiness_errors": readiness_errors(manifest), "vertices": VERTICES, "edges": EDGES,
              "materials": {k: {x: v[x] for x in ("id", "normal", "offset")} for k, v in materials().items()}}
    token, state = secrets.token_urlsafe(24), {"pose": None}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass
        def send(self, code, body, kind="application/json"):
            self.send_response(code)
            self.send_header("Content-Type", kind+"; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body.encode())
        def do_GET(self):
            path = self.path.split("?")[0]
            if path == "/":
                self.send(200, (HERE/"display.html").read_text(), "text/html")
            elif path in ("/app.js", "/geometry.js"):
                self.send(200, (HERE/path[1:]).read_text(), "text/javascript")
            elif path == "/materials.json":
                self.send(200, json.dumps(public))
            elif path == "/forms-preview" and manifest["mode"] == "fixture":
                self.send(200, (folder/"forms.html").read_text(), "text/html")
            elif path == "/pose":
                pose = state["pose"]
                age = time.time()*1000-pose["captured_at_ms"] if pose else None
                self.send(200, json.dumps({"pose": pose if age is not None and 0 <= age <= 100 else None, "age_ms": age}))
            else:
                self.send(404, '{"error":"not found"}')
        def do_POST(self):
            # A local tracker adapter only. No disk writes, camera frames, names or credentials.
            if self.path != "/pose" or self.client_address[0] != "127.0.0.1" or self.headers.get("Origin") or self.headers.get("Authorization") != "Bearer "+token:
                self.send(403, '{"error":"local tracker token required"}')
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                if not 0 < length <= 1024:
                    raise ValueError("payload length")
                pose = validate_pose(json.loads(self.rfile.read(length)), time.time()*1000)
                if state["pose"] and pose["sequence"] <= state["pose"]["sequence"]:
                    raise ValueError("out of order")
                state["pose"] = pose
                self.send(200, '{"accepted":true}')
            except (ValueError, TypeError, KeyError):
                self.send(400, '{"error":"invalid or stale pose"}')
    server = ThreadingHTTPServer(("0.0.0.0" if allow_lan else "127.0.0.1", port), Handler)
    print(f"Local display: http://127.0.0.1:{port}  mode={manifest['mode']}", flush=True)
    print(f"Tracker-only ephemeral token: {token}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("init", "fixture", "analyze", "serve"))
    parser.add_argument("directory", type=Path)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--allow-lan", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "init":
            initialize(args.directory, "field")
        elif args.command == "fixture":
            fixture(args.directory)
        elif args.command == "analyze":
            result = analyze(args.directory)
            (args.directory/"summary.json").write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n")
            print(json.dumps({k: v for k, v in result.items() if k not in ("participants", "descriptive_medians", "input_sha256", "facility_answers_unverified", "setup_measurements_unverified")}, ensure_ascii=False, indent=2))
        else:
            serve(args.directory, args.port, args.allow_lan)
    except (ValueError, OSError) as e:
        parser.exit(2, str(e)+"\n")

if __name__ == "__main__":
    main()
