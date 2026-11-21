#!/usr/bin/env python3
"""Noah の DDL 案（docs/contracts/noah-v1.sql）を、手元の SQLite で流して確かめる。本番 D1 への適用ではない。

実行: python3 docs/design-validation/noah/validate-noah-v1.py
既存の drizzle/*.sql を名前順に一時 DB へ流し、続けて DDL 案を 2 回流す（2 回目で壊れないこと）。
その後、制約が拒否すべき物を拒否し、設計書に書いた問い合わせが索引を使うことを確かめる。
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
DDL = REPO / "docs/contracts/noah-v1.sql"
RESULT = Path(os.environ.get("NOAH_SQL_RESULT", str(REPO / "work/design-validation/noah-v1-validation.json"))).resolve()
H = "a" * 64
UUID = "00000000-0000-4000-8000-00000000000{}"
results = []


def check(name, fn):
    try:
        fn()
        results.append({"name": name, "status": "pass"})
    except Exception as error:  # noqa: BLE001 - 失敗の理由を結果に残す
        results.append({"name": name, "status": "fail", "error": f"{type(error).__name__}: {error}"})


def statements(sql):
    return [part for part in sql.split("--> statement-breakpoint") if part.strip()]


REJECTED = [0]


def rejects(db, sql, args=()):
    """制約が拒否すること。拒否しなければ失敗。"""
    REJECTED[0] += 1
    db.execute("SAVEPOINT r")
    try:
        db.execute(sql, args)
    except sqlite3.IntegrityError:
        db.execute("ROLLBACK TO r")
        db.execute("RELEASE r")
        return
    db.execute("ROLLBACK TO r")
    db.execute("RELEASE r")
    raise AssertionError("拒否されなかった: " + sql[:80])


def accepts(db, table, row):
    """元の行が通ること（この後の「拒否」が、変えた 1 項目のせいだと言えるようにする）。入れた行は戻す。"""
    db.execute("SAVEPOINT a")
    try:
        put(db, table, row)
    finally:
        db.execute("ROLLBACK TO a")
        db.execute("RELEASE a")


def variants(db, table, base, changes):
    accepts(db, table, base)
    for change in changes:
        row = base | change
        rejects(db, f"INSERT INTO {table}({','.join(row)}) VALUES({','.join('?' * len(row))})", list(row.values()))


def put(db, table, row):
    keys = ",".join(row)
    db.execute(f"INSERT INTO {table}({keys}) VALUES({','.join('?' * len(row))})", list(row.values()))


def plan(db, sql, args=()):
    return " | ".join(r[3] for r in db.execute("EXPLAIN QUERY PLAN " + sql, args))


db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
applied, skipped = [], []
for path in sorted((REPO / "drizzle").glob("*.sql")):
    try:
        for stmt in statements(path.read_text()):
            db.executescript(stmt)
        applied.append(path.name)
    except sqlite3.Error as error:
        skipped.append({"file": path.name, "error": str(error)[:120]})   # この系譜は、空の DB からの立ち上げ用ではない（drizzle/README.md）


def existing():
    names = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    for table in ("noah_runner_devices", "noah_runner_commands", "noah_instances", "noah_discovery_candidates"):
        assert table in names, table


def ddl_twice():
    before = {r[0]: r[1] for r in db.execute("SELECT name, sql FROM sqlite_master WHERE name LIKE 'noah_%'")}
    for _ in range(2):
        for stmt in statements(DDL.read_text()):
            db.executescript(stmt)
    after = {r[0]: r[1] for r in db.execute("SELECT name, sql FROM sqlite_master WHERE name LIKE 'noah_%'")}
    for name, sql in before.items():
        assert after.get(name) == sql, f"既存の定義が変わった: {name}"
    new = sorted(n for n in after if n not in before and db.execute("SELECT type FROM sqlite_master WHERE name=?", (n,)).fetchone()[0] == "table")
    expected = ["noah_asks", "noah_connection_secrets", "noah_connections", "noah_intake_candidates", "noah_intake_checks", "noah_intake_families",
                   "noah_intake_sources", "noah_oauth_clients", "noah_oauth_grants", "noah_oauth_states", "noah_probe_hosts", "noah_standing_works",
                   "noah_usage_events"]
    assert new == [name for name in expected if name not in before], new
    # Promoted launch tables must still be byte-equivalent SQLite definitions,
    # including checks and indexes; they are no longer newly created by this draft.
    contract = sqlite3.connect(":memory:")
    contract.executescript(DDL.read_text())
    for name, sql in contract.execute("SELECT name,sql FROM sqlite_master WHERE name LIKE 'noah_intake_%' OR name='noah_probe_hosts'"):
        assert after.get(name) == sql, f"移植した定義が型契約と違う: {name}"
    contract.close()


check("既存の Noah の表がある", existing)
check("DDL 案を 2 回流しても壊れず、既存の定義を変えない", ddl_twice)


def candidate(key="ac.mizan/registry", **change):
    return dict(id=f"mcp-registry:{key}", source="mcp-registry", external_key=key, family_id=f"mcp-registry:{key}", group_key=key.split("/")[0], name=key,
                record_sha256=H, record_json="{}", state="active", first_seen_at=1, changed_at=1, seen_at=1, revision=1) | change


def checks(key="ac.mizan/registry", **change):
    return dict(candidate_id=f"mcp-registry:{key}", mouth="mcp-remote", surface="none", auth="unknown", connect_json="{}", connect_sha256=H,
                setup=0, level=0, result="unchecked", next_check_at=0) | change


def connection(n=1, **change):
    return dict(id=UUID.format(n), owner_id="owner-1", family_key="mcp-registry:ac.mizan/registry", agent_id="mcp-registry:ac.mizan/registry",
                digest=H, request_sha256=H, connect_json="{}", connect_sha256=H, plan_sha256=H, place="provider", state="planned",
                consent_json="{}", price_json='{"model":"free"}', cost_taps=0, cost_typed=0, revision=1, created_at=1, updated_at=1) | change


def ask(n=1, **change):
    return dict(id=UUID.format(n), owner_id="owner-1", connection_id=UUID.format(1), work_id="work-1", request_sha256=H, mode="agent",
                state="queued", revision=1, created_at=1, updated_at=1) | change


def intake():
    put(db, "noah_intake_sources", dict(id="mcp-registry"))
    rejects(db, "INSERT INTO noah_intake_sources(id) VALUES('github')")                       # 取り込みの出どころは 3 種だけ
    put(db, "noah_intake_candidates", candidate())
    rejects(db, "INSERT INTO noah_intake_candidates(id,source,external_key,family_id,group_key,name,record_sha256,record_json,state,first_seen_at,changed_at,seen_at,revision) "
                "VALUES('mcp-registry:dup','mcp-registry','ac.mizan/registry','f','g','n',?,'{}','active',1,1,1,1)", (H,))   # 出どころと鍵で一意
    variants(db, "noah_intake_candidates", candidate("x/y"), (dict(state="unsupported"), dict(state="active", reason="bad_url"), dict(record_json="{not json"), dict(record_sha256="abc"),
                dict(source="nowhere"), dict(revision=0), dict(running=2)))
    put(db, "noah_intake_candidates", candidate("x/unsupported", state="unsupported", reason="legacy_sse_only"))
    put(db, "noah_intake_checks", checks())
    variants(db, "noah_intake_checks", checks("x/unsupported"), (dict(level=1), dict(level=1, tools_sha256=H), dict(level=2, tools_sha256=H, l1_at=1), dict(mouth="ssh"), dict(surface="desktop"),
                dict(result="great"), dict(auth="basic"), dict(failures=1), dict(first_failure_at=5), dict(candidate_id="mcp-registry:none")))
    db.execute("UPDATE noah_intake_checks SET level=1, result='ok', tools_sha256=?, tool_count=5, read_only=1, l1_at=10, checked_at=10 WHERE candidate_id=?", (H, "mcp-registry:ac.mizan/registry"))
    db.execute("UPDATE noah_intake_checks SET level=2, l2_at=20, sample_json=? WHERE candidate_id=?", (json.dumps({"tool": "registry_stats", "input": {}, "output": "…"}), "mcp-registry:ac.mizan/registry"))
    put(db, "noah_intake_families", dict(id="mcp-registry:ac.mizan/registry", representative_id="mcp-registry:ac.mizan/registry", members=1, level=2, l2_at=20,
                                         badge_hint="one_click", updated_at=20, revision=1))
    rejects(db, "INSERT INTO noah_intake_families(id,representative_id,members,level,badge_hint,claimed_by,updated_at,revision) VALUES('f:2',?,1,0,'unverified','owner-9',1,1)",
            ("mcp-registry:ac.mizan/registry",))                                              # 引き取りは、人と時刻が対


check("取り込み: 候補・接続試験・系列の制約", intake)


def intake_queries():
    # 見回りが次に確かめる物を取る（期限が来ていて、他の巡回が持っていない物）
    due = ("SELECT candidate_id FROM noah_intake_checks WHERE setup = 0 AND mouth IN ('mcp-remote','space-mcp','a2a') "
           "AND next_check_at <= ? AND lease_until < ? ORDER BY next_check_at LIMIT 8")
    assert "noah_intake_checks_due" in plan(db, due, (100, 100)), plan(db, due, (100, 100))
    claimed = db.execute("UPDATE noah_intake_checks SET lease_until=? WHERE candidate_id IN (" + due + ") RETURNING candidate_id", (160, 100, 100)).fetchall()
    assert len(claimed) == 1
    assert db.execute("UPDATE noah_intake_checks SET lease_until=? WHERE candidate_id IN (" + due + ") RETURNING candidate_id", (160, 100, 100)).fetchall() == [], "同じ物を 2 つの巡回が取らない"
    # 端末で動かす配布と、鍵の入力が要る物は、期限が来ていても、握手の対象に取らない
    put(db, "noah_intake_candidates", candidate("x/package"))
    put(db, "noah_intake_checks", checks("x/package", mouth="mcp-package", surface="terminal", auth="none"))
    put(db, "noah_intake_candidates", candidate("x/keyed"))
    put(db, "noah_intake_checks", checks("x/keyed", setup=1, auth="key"))
    assert db.execute(due, (10**15, 10**15)).fetchall() == [("mcp-registry:ac.mizan/registry",)], "握手できる物だけを取る"
    # タイムライン（L2 が 7 日以内の系列を、新しい順に 20 件）
    timeline = "SELECT id FROM noah_intake_families WHERE level = 2 AND withdrawn_at IS NULL AND hidden_at IS NULL AND l2_at >= ? ORDER BY l2_at DESC, id LIMIT 20"
    assert "noah_intake_families_timeline" in plan(db, timeline, (0,)), plan(db, timeline, (0,))
    assert db.execute(timeline, (0,)).fetchall() == [("mcp-registry:ac.mizan/registry",)]
    db.execute("UPDATE noah_intake_families SET withdrawn_at=30 WHERE id='mcp-registry:ac.mizan/registry'")
    assert db.execute(timeline, (0,)).fetchall() == [], "取り下げた系列は載らない"
    db.execute("UPDATE noah_intake_families SET withdrawn_at=NULL WHERE id='mcp-registry:ac.mizan/registry'")
    # 取り下げの掃き出し（全件の巡回で見えなかった物）
    sweep = "SELECT id FROM noah_intake_candidates WHERE source = ? AND state = 'active' AND seen_at < ?"
    assert "noah_intake_candidates_sweep" in plan(db, sweep, ("mcp-registry", 5)), plan(db, sweep, ("mcp-registry", 5))
    # 同じ host へは 1 巡回に 1 回
    host = "INSERT INTO noah_probe_hosts(host,last_probe_at) VALUES(?,?) ON CONFLICT(host) DO UPDATE SET last_probe_at=excluded.last_probe_at WHERE noah_probe_hosts.last_probe_at <= ? AND noah_probe_hosts.not_before <= ? RETURNING host"
    assert db.execute(host, ("mizan.ac", 1000, 1000 - 3600, 1000)).fetchall() == [("mizan.ac",)]
    assert db.execute(host, ("mizan.ac", 1500, 1500 - 3600, 1500)).fetchall() == [], "1 時間以内の 2 回目は取れない"
    assert db.execute(host, ("mizan.ac", 5000, 5000 - 3600, 5000)).fetchall() == [("mizan.ac",)]


check("取り込み: 見回り・タイムライン・掃き出し・host の間隔の問い合わせ", intake_queries)


def connections():
    put(db, "noah_runner_devices", dict(id="dev-1", owner_id="owner-1", credential_sha256="c1", boot_id="b1", name="Mac", platform="darwin", created_at=1, last_seen_at=1))
    put(db, "noah_connections", connection(1))
    rejects(db, "INSERT INTO noah_connections SELECT ?,owner_id,family_key,agent_id,digest,request_sha256,connect_json,connect_sha256,plan_sha256,tools_sha256,confirmed_tools_json,egress_granted_json,"
                "place,device_id,runner_command_id,state,needs_json,consent_json,price_json,cost_taps,cost_typed,probe_ms,error,revision,created_at,updated_at,connected_at,last_used_at,disconnected_at FROM noah_connections WHERE id=?",
            (UUID.format(2), UUID.format(1)))                                                 # 同じ本人・同じ系列の、切っていない接続は 1 件
    variants(db, "noah_connections", connection(3, family_key="other"), (dict(place="mac"), dict(place="home"), dict(place="provider", device_id="dev-1"), dict(state="connected"), dict(state="needs_action"),
                dict(state="disconnected"), dict(disconnected_at=9), dict(state="ready"), dict(connect_json="x"), dict(revision=0), dict(id="short"),
                dict(place="home", device_id="dev-none")))
    # 同じ操作 ID の再送は、行を増やさない
    row = connection(1)
    assert db.execute(f"INSERT OR IGNORE INTO noah_connections({','.join(row)}) VALUES({','.join('?' * len(row))}) RETURNING id", list(row.values())).fetchall() == []
    # 楽観ロック: revision が合う時だけ進む
    step = "UPDATE noah_connections SET state=?, connected_at=?, revision=revision+1, updated_at=? WHERE id=? AND revision=? AND state=? RETURNING revision"
    assert db.execute("UPDATE noah_connections SET state='probing', revision=revision+1 WHERE id=? AND revision=1 RETURNING revision", (UUID.format(1),)).fetchall() == [(2,)]
    assert db.execute(step, ("connected", 50, 50, UUID.format(1), 1, "probing")).fetchall() == [], "古い revision では進まない"
    assert db.execute(step, ("connected", 50, 50, UUID.format(1), 2, "probing")).fetchall() == [(3,)]
    # 切ると、同じ系列をつなぎ直せる。記録は残る
    db.execute("UPDATE noah_connections SET state='disconnected', disconnected_at=60, revision=revision+1 WHERE id=?", (UUID.format(1),))
    put(db, "noah_connections", connection(2, place="home", device_id="dev-1"))
    assert db.execute("SELECT COUNT(*) FROM noah_connections WHERE owner_id='owner-1'").fetchone()[0] == 2
    mine = "SELECT id FROM noah_connections WHERE owner_id=? AND disconnected_at IS NULL ORDER BY updated_at DESC, id LIMIT 50"
    assert "noah_connections" in plan(db, mine, ("owner-1",))
    on_device = "SELECT id FROM noah_connections WHERE device_id=? AND state='connected'"
    assert "noah_connections_device" in plan(db, on_device, ("dev-1",)), plan(db, on_device, ("dev-1",))
    # つなぐ途中で止まった接続を、巡回の後始末が拾う文（spec-88 の 9.5）。その接続だけを持つ索引を使い、表を端から読まない。
    connecting = ("SELECT id,owner_id,state,revision FROM noah_connections WHERE disconnected_at IS NULL AND state IN ('planned','entitling','preparing','probing') "
                  "AND place='provider' AND updated_at < ? ORDER BY updated_at LIMIT ?")
    assert "SEARCH noah_connections USING INDEX noah_connections_connecting" in plan(db, connecting, (10**15, 50)), plan(db, connecting, (10**15, 50))
    assert "SCAN" not in plan(db, connecting, (10**15, 50))
    # IN の並びが違う文は、この索引を使えない（文は、索引の式と同じに書く）。
    reordered = connecting.replace("('planned','entitling','preparing','probing')", "('probing','planned','entitling','preparing')")
    assert "noah_connections_connecting" not in plan(db, reordered, (10**15, 50))
    put(db, "noah_connection_secrets", dict(connection_id=UUID.format(2), name="Authorization", value_ciphertext="v1:…", created_at=1))
    rejects(db, "INSERT INTO noah_connection_secrets(connection_id,name,value_ciphertext,created_at) VALUES(?,?,?,1)", (UUID.format(2), "Authorization", "v1:…"))
    rejects(db, "INSERT INTO noah_connection_secrets(connection_id,name,value_ciphertext,created_at) VALUES('none','K','v',1)")


check("接続: 一意・置き場所と端末・状態と時刻・楽観ロック・切ってつなぎ直す", connections)


def oauth():
    put(db, "noah_oauth_clients", dict(issuer="https://auth.example.com", client_id="https://avoado.si/oauth/client.json", method="cimd", registration_json="{}", created_at=1))
    rejects(db, "INSERT INTO noah_oauth_clients(issuer,client_id,method,registration_json,created_at) VALUES('https://b.example.com','c','manual','{}',1)")
    state = dict(state_sha256=H, owner_id="owner-1", connection_id=UUID.format(2), service_id="auth.example.com", issuer="https://auth.example.com",
                 resource="https://api.example.com/mcp", verifier_ciphertext="v1:…", redirect_uri="https://avoado.si/api/noah/oauth/callback",
                 return_path="/noah", created_at=1, expires_at=601)
    put(db, "noah_oauth_states", state)
    rejects(db, f"INSERT INTO noah_oauth_states({','.join(state)}) VALUES({','.join('?' * len(state))})", list(state.values()))
    bad = state | dict(state_sha256="b" * 64, return_path="https://evil.example.com/")
    rejects(db, f"INSERT INTO noah_oauth_states({','.join(bad)}) VALUES({','.join('?' * len(bad))})", list(bad.values()))   # 戻り先は Noah の中だけ
    use = "UPDATE noah_oauth_states SET used_at=? WHERE state_sha256=? AND owner_id=? AND used_at IS NULL AND expires_at > ? RETURNING connection_id"
    assert db.execute(use, (100, H, "owner-2", 100)).fetchall() == [], "別の本人は使えない"
    assert db.execute(use, (700, H, "owner-1", 700)).fetchall() == [], "期限切れは使えない"
    assert db.execute(use, (100, H, "owner-1", 100)).fetchall() == [(UUID.format(2),)]
    assert db.execute(use, (101, H, "owner-1", 101)).fetchall() == [], "2 回目は使えない"
    grant = dict(id="g1", owner_id="owner-1", service_id="auth.example.com", resource="https://api.example.com/mcp", issuer="https://auth.example.com",
                 scopes="things:read", token_ciphertext="v1:…", created_at=1, updated_at=1)
    put(db, "noah_oauth_grants", grant)
    again = grant | dict(id="g2")
    rejects(db, f"INSERT INTO noah_oauth_grants({','.join(again)}) VALUES({','.join('?' * len(again))})", list(again.values()))   # 有効な許可は 1 件
    db.execute("UPDATE noah_oauth_grants SET revoked_at=5 WHERE id='g1'")
    put(db, "noah_oauth_grants", again)


check("相手の許可: client・1 回だけ使える state・有効な許可は 1 件", oauth)


def asks():
    put(db, "noah_asks", ask(1))
    variants(db, "noah_asks", ask(2), (dict(state="your_turn"), dict(pending_json="{}"), dict(state="succeeded"), dict(finished_at=9), dict(mode="chat"),
                dict(connection_id="none"), dict(stop_requested=2), dict(state="done")))
    # 実行器が 1 件取る（lease）。2 つの実行器が同じ依頼を取らない
    claim = ("UPDATE noah_asks SET state='running', lease_until=?, revision=revision+1 WHERE id=(SELECT id FROM noah_asks WHERE finished_at IS NULL "
             "AND state IN ('queued','running') AND lease_until < ? AND stop_requested=0 ORDER BY created_at LIMIT 1) RETURNING id, step")
    assert db.execute(claim, (130, 100)).fetchall() == [(UUID.format(1), 0)]
    assert db.execute(claim, (130, 100)).fetchall() == []
    # step の番号が合う時だけ、次の step を記録する（同じ step を 2 回実行しない）
    advance = "UPDATE noah_asks SET step=step+1, model_calls=model_calls+1, lease_until=? WHERE id=? AND step=? AND state='running' RETURNING step"
    assert db.execute(advance, (160, UUID.format(1), 0)).fetchall() == [(1,)]
    assert db.execute(advance, (160, UUID.format(1), 0)).fetchall() == [], "遅れて届いた同じ step は捨てる"
    # あなたの番 → 許可 → 続き
    db.execute("UPDATE noah_asks SET state='your_turn', pending_json=? WHERE id=?", (json.dumps({"tool": "send_mail", "args": {"to": "a"}}), UUID.format(1)))
    assert db.execute(claim, (200, 190)).fetchall() == [], "本人を待っている依頼は、実行器が取らない"
    db.execute("UPDATE noah_asks SET state='running', pending_json=NULL WHERE id=? AND state='your_turn'", (UUID.format(1),))
    # 止める: 止めた後に届いた成功は採らない
    db.execute("UPDATE noah_asks SET stop_requested=1 WHERE id=?", (UUID.format(1),))
    finish = "UPDATE noah_asks SET state=?, finished_at=?, lease_until=0 WHERE id=? AND finished_at IS NULL AND (stop_requested=0 OR ?='stopped') RETURNING state"
    assert db.execute(finish, ("succeeded", 210, UUID.format(1), "succeeded")).fetchall() == []
    assert db.execute(finish, ("stopped", 211, UUID.format(1), "stopped")).fetchall() == [("stopped",)]
    # lease が切れた依頼は、結果不明にする。取り直して再実行しない
    put(db, "noah_asks", ask(3, state="running", lease_until=50))
    expire = "UPDATE noah_asks SET state='unknown', finished_at=?, error='結果を確かめられませんでした。' WHERE finished_at IS NULL AND state='running' AND lease_until < ? AND lease_until > 0 RETURNING id"
    assert db.execute(expire, (300, 300)).fetchall() == [(UUID.format(3),)]
    assert db.execute(claim, (400, 390)).fetchall() == []
    assert "noah_asks_open" in plan(db, "SELECT id FROM noah_asks WHERE finished_at IS NULL AND state='running' AND lease_until < ?", (1,))
    # 入力欄で頼む依頼は、送り先・道具の名前・本人が見た定義の hash を必ず持つ
    form = ask(4, mode="form", host="mizan.ac", tool="lookup_player", tool_sha256=H)
    variants(db, "noah_asks", form | dict(screen="narrow"), (dict(host=None), dict(tool=None), dict(tool_sha256=None), dict(tool_sha256="abc"), dict(tool="x" * 129), dict(tool=""),
                                                                 dict(screen="phone")))
    put(db, "noah_asks", form)


check("頼む: 取り合い・step の番号・あなたの番・停止・結果不明", asks)


def standing_and_usage():
    work = dict(id=UUID.format(1), owner_id="owner-1", connection_id=UUID.format(2), prompt="毎朝の要約", trigger_json='{"everySeconds":3600}',
                limits_json='{"maxRuns":100}', state="active", next_run_at=3600, revision=1, created_at=1, updated_at=1)
    put(db, "noah_standing_works", work)
    variants(db, "noah_standing_works", work | dict(id=UUID.format(2)), (dict(state="paused"), dict(state="active", next_run_at=None), dict(prompt=""), dict(state="running")))
    due = "SELECT id FROM noah_standing_works WHERE state='active' AND next_run_at <= ? ORDER BY next_run_at LIMIT 20"
    assert "noah_standing_works_due" in plan(db, due, (4000,)), plan(db, due, (4000,))
    # 止まっていた分は 1 回だけ実行する: 次の時刻は「今」から数える
    fired = db.execute("UPDATE noah_standing_works SET runs=runs+1, last_run_at=?, next_run_at=?+3600, revision=revision+1 WHERE id=? AND revision=? AND state='active' AND next_run_at <= ? RETURNING runs, next_run_at",
                       (40000, 40000, UUID.format(1), 1, 40000)).fetchall()
    assert fired == [(1, 43600)], fired
    usage = dict(id=UUID.format(1), owner_id="owner-1", connection_id=UUID.format(2), family_key="f", digest=H, place="provider", mouth="mcp-remote",
                 result="succeeded", seconds=4, cost_micro_usd=None, created_at=1)
    put(db, "noah_usage_events", usage)
    assert db.execute(f"INSERT OR IGNORE INTO noah_usage_events({','.join(usage)}) VALUES({','.join('?' * len(usage))}) RETURNING id", list(usage.values())).fetchall() == [], "同じ仕事の記録は 1 件"
    variants(db, "noah_usage_events", usage | dict(id=UUID.format(2)), (dict(result="ok"), dict(place="mac"), dict(seconds=-1), dict(cost_micro_usd=-5)))
    assert db.execute("SELECT COUNT(*) FROM noah_usage_events WHERE cost_micro_usd IS NULL").fetchone()[0] == 1, "計測できなかった費用は NULL のまま"
    # 作る人に見せる集計: 5 人未満の区分は出さない
    for n in range(3, 8):
        put(db, "noah_usage_events", usage | dict(id=UUID.format(n), owner_id=f"owner-{n}", family_key="popular"))
    visible = db.execute("SELECT family_key, COUNT(*) AS runs, COUNT(DISTINCT owner_id) AS people FROM noah_usage_events GROUP BY family_key HAVING COUNT(DISTINCT owner_id) >= 5").fetchall()
    assert visible == [("popular", 5, 5)], visible


check("継続運用と利用の記録: 状態と次の時刻・溜めて連発しない・記録は 1 件・5 人未満は出さない", standing_and_usage)

def regroup():
    """名寄せの SQL が、参照実装（groupNoahFamilies）の試験と同じ系列を作ること。別の一時 DB で流す。"""
    g = sqlite3.connect(":memory:")
    for stmt in statements(DDL.read_text()):
        try:
            g.executescript(stmt)
        except sqlite3.OperationalError as error:
            if "noah_runner_devices" not in str(error):   # 接続の表は、この確認では使わない
                raise
    for source in ("mcp-registry", "hf-mcp-space", "acp-registry"):
        put(g, "noah_intake_sources", dict(id=source))

    def add(source, key, group_key, host=None, repository=None, tools=None, running=1, likes=0, level=0):
        cid = f"{source}:{key}"
        put(g, "noah_intake_candidates", dict(id=cid, source=source, external_key=key, family_id=cid, group_key=group_key, name=key, repository=repository, host=host,
                                              record_sha256=H, record_json="{}", state="active", running=running, likes=likes, first_seen_at=1, changed_at=1, seen_at=1, revision=1))
        if tools or level:
            put(g, "noah_intake_checks", checks() | dict(candidate_id=cid, level=level or 1, result="ok", tools_sha256=tools or H, l1_at=1,
                                                         l2_at=2 if level == 2 else None, next_check_at=0))
        return cid

    T = 20
    bulk = [add("mcp-registry", f"io.github.maker/tool-{i}", "io.github.maker", host="gateway.maker.example") for i in range(T)]
    almost = [add("mcp-registry", f"io.github.small/tool-{i}", "io.github.small", host="api.small.example") for i in range(T - 1)]
    same_repo = [add("mcp-registry", f"io.github.mono/pkg-{i}", "io.github.mono", repository="github.com/mono/servers") for i in range(T)]
    two = [add("mcp-registry", f"io.github.duo/{n}", "io.github.duo", repository="github.com/duo/tools") for n in ("alpha", "beta")]
    mirror = [add("mcp-registry", "ai.smithery/owner-thing", "ai.smithery", host="server.smithery.example", repository="github.com/owner/thing", tools="f" * 64),
              add("mcp-registry", "io.github.owner/thing", "io.github.owner", host="thing.example", repository="github.com/owner/thing", tools="f" * 64)]
    cross = [add("mcp-registry", "io.github.solo/agent", "io.github.solo", repository="github.com/solo/agent"), add("acp-registry", "solo-agent", "solo-agent", repository="github.com/solo/agent")]
    copies = [add("hf-mcp-space", f"user{i}/mcp-sentiment", "mcp-sentiment", running=1 if i == 7 else 0, likes=i) for i in range(T)]
    few = [add("hf-mcp-space", "a/demo", "demo"), add("hf-mcp-space", "b/demo", "demo")]
    same_tools = [add("hf-mcp-space", "c/calc", "calc", tools="e" * 64), add("hf-mcp-space", "d/calc", "calc", tools="e" * 64, level=2)]
    for stmt in statements((REPO / "docs/contracts/noah-regroup-v1.sql").read_text()):
        g.execute(stmt, {"threshold": T, "now": 100} if ":now" in stmt else {"threshold": T} if ":threshold" in stmt else {})
    family = dict(g.execute("SELECT id, family_id FROM noah_intake_candidates"))
    fam = lambda ids: sorted({family[i] for i in ids})  # noqa: E731
    assert fam(bulk) == ["bulk:io.github.maker@gateway.maker.example"], fam(bulk)
    assert len(fam(almost)) == T - 1
    assert fam(same_repo) == ["bulk:repo:github.com/mono/servers"], fam(same_repo)
    assert len(fam(two)) == 2, fam(two)
    assert fam(mirror) == ["same:ffffffffffffffff:github.com/owner/thing"], fam(mirror)
    assert fam(cross) == ["repo:github.com/solo/agent"], fam(cross)
    assert fam(copies) == ["space:mcp-sentiment"], fam(copies)
    assert len(fam(few)) == 2, fam(few)
    assert fam(same_tools) == ["same:eeeeeeeeeeeeeeee:space/calc"], fam(same_tools)
    rep = dict(g.execute("SELECT id, representative_id FROM noah_intake_families"))
    assert rep["space:mcp-sentiment"] == "hf-mcp-space:user7/mcp-sentiment", "代表は、動いている物"
    assert rep["same:eeeeeeeeeeeeeeee:space/calc"] == "hf-mcp-space:d/calc", "代表は、接続試験が深い物"
    members = dict(g.execute("SELECT id, members FROM noah_intake_families"))
    assert members["bulk:io.github.maker@gateway.maker.example"] == T and members["space:mcp-sentiment"] == T
    assert g.execute("SELECT COUNT(*) FROM noah_intake_families").fetchone()[0] == len(set(family.values()))
    # 何も変わっていなければ、もう一度流しても 1 行も書かない（D1 は、書いた行の数で数える）
    revisions = dict(g.execute("SELECT id, revision FROM noah_intake_families"))
    changes = g.total_changes
    for stmt in statements((REPO / "docs/contracts/noah-regroup-v1.sql").read_text()):
        g.execute(stmt, {"threshold": T, "now": 150} if ":now" in stmt else {"threshold": T} if ":threshold" in stmt else {})
    assert dict(g.execute("SELECT id, family_id FROM noah_intake_candidates")) == family, "2 回目も同じ系列"
    assert dict(g.execute("SELECT id, revision FROM noah_intake_families")) == revisions, "変わらない系列の行を書き直さない"
    grouped = sum(1 for cid, fid in family.items() if cid != fid)
    assert g.total_changes - changes <= 2 * grouped, f"書いた行は、まとめた候補の分だけ（{g.total_changes - changes} 行、まとめた候補 {grouped} 件）"
    # 候補が消えた系列は隠す。もう一度流しても同じ結果
    g.execute("UPDATE noah_intake_candidates SET state='withdrawn' WHERE id IN ('hf-mcp-space:a/demo')")
    for stmt in statements((REPO / "docs/contracts/noah-regroup-v1.sql").read_text()):
        g.execute(stmt, {"threshold": T, "now": 200} if ":now" in stmt else {"threshold": T} if ":threshold" in stmt else {})
    assert g.execute("SELECT hidden_at FROM noah_intake_families WHERE id='hf-mcp-space:a/demo'").fetchone()[0] == 200
    assert dict(g.execute("SELECT id, family_id FROM noah_intake_candidates WHERE state='active'")) == {k: v for k, v in family.items() if k != "hf-mcp-space:a/demo"}

    def rerun(now):
        """名寄せを流して、系列の表を書いた行の数を返す（候補の表の書き直しは数えない）。"""
        written = 0
        for stmt in statements((REPO / "docs/contracts/noah-regroup-v1.sql").read_text()):
            cursor = g.execute(stmt, {"threshold": T, "now": now} if ":now" in stmt else {"threshold": T} if ":threshold" in stmt else {})
            body = "\n".join(line for line in stmt.splitlines() if not line.lstrip().startswith("--"))
            if "UPDATE noah_intake_families" in body or "INSERT INTO noah_intake_families" in body:
                written += cursor.rowcount
        return written

    # 本番では、候補は入った時に「1 件で 1 系列」の行を持つ。まとめた候補のその行は、候補が無いので隠れる
    for cid, fid in family.items():
        if cid != fid:
            put(g, "noah_intake_families", dict(id=cid, representative_id=cid, members=1, level=0, badge_hint="unverified", listed=0, one_tap=0, shuffle=0, updated_at=1, revision=1))
    assert rerun(210) == grouped, "まとめた候補の元の行だけを隠す"
    assert g.execute("SELECT COUNT(*) FROM noah_intake_families WHERE hidden_at = 210").fetchone()[0] == grouped
    # 隠してある行は、もう一度流しても書かない（全件の 2 割近くが量産の系列。毎回書き直すと、1 日に 1 万行を越える）
    assert rerun(220) == 0, "変わらない名寄せは、系列の表を 1 行も書かない"
    assert g.execute("SELECT hidden_at FROM noah_intake_families WHERE id='hf-mcp-space:a/demo'").fetchone()[0] == 200, "隠した時刻は、最初の値のまま"
    # 候補が戻った系列は戻す（台帳に戻った物）。まとめたままの候補の元の行は、隠したまま
    g.execute("UPDATE noah_intake_candidates SET state='active' WHERE id='hf-mcp-space:a/demo'")
    assert rerun(230) == 1
    assert g.execute("SELECT hidden_at, updated_at FROM noah_intake_families WHERE id='hf-mcp-space:a/demo'").fetchone() == (None, 230)
    assert g.execute("SELECT COUNT(*) FROM noah_intake_families WHERE hidden_at = 210").fetchone()[0] == grouped
    # 量産の系列がほどけた時も、元の行が戻る。候補の無くなった量産の系列は隠れる
    g.execute("UPDATE noah_intake_candidates SET state='withdrawn' WHERE id=?", (bulk[0],))
    rerun(240)
    assert g.execute("SELECT hidden_at FROM noah_intake_families WHERE id='bulk:io.github.maker@gateway.maker.example'").fetchone()[0] == 240
    assert g.execute("SELECT COUNT(*) FROM noah_intake_families WHERE hidden_at IS NULL AND id IN (%s)" % ",".join("?" * (T - 1)), bulk[1:]).fetchone()[0] == T - 1
    assert g.execute("SELECT hidden_at FROM noah_intake_families WHERE id=?", (bulk[0],)).fetchone()[0] == 210, "取り下げになった候補の行は、隠したまま"
    # 握手の失敗が続いて隠した系列（88 の 9.3。代表の first_failure_at がある）は、候補が有効でも、名寄せでは戻さない。握手が通った後に戻る
    flaky = bulk[1]
    put(g, "noah_intake_checks", checks() | dict(candidate_id=flaky, level=0, result="unreachable", failures=3, first_failure_at=5))
    g.execute("UPDATE noah_intake_families SET hidden_at = 245 WHERE id=?", (flaky,))
    rerun(250)
    assert g.execute("SELECT hidden_at FROM noah_intake_families WHERE id=?", (flaky,)).fetchone()[0] == 245
    g.execute("UPDATE noah_intake_checks SET level=1, result='ok', tools_sha256=?, l1_at=255, failures=0, first_failure_at=NULL WHERE candidate_id=?", (H, flaky))
    rerun(260)
    assert g.execute("SELECT hidden_at FROM noah_intake_families WHERE id=?", (flaky,)).fetchone()[0] is None


check("名寄せの SQL が、参照実装と同じ系列と代表を作る", regroup)


def named(path):
    """「-- name: …」で始まる文を、名前で引けるようにする。"""
    out = {}
    for stmt in statements(path.read_text()):
        for line in stmt.splitlines():
            if line.startswith("-- name:"):
                out[line.split(":", 1)[1].strip()] = "\n".join(part for part in stmt.splitlines() if not part.startswith("--")).strip().rstrip(";")
    return out


def listing():
    """ローンチの一覧: SQL が、表（fixtures/listing-cases.json）と同じ結果になる。頁の継ぎ目・並びの引き直し・写し・検索・上限。"""
    q = named(REPO / "docs/contracts/noah-listing-v1.sql")
    assert sorted(q) == ["connect_gate", "counts", "gate", "host_take", "host_wait", "new", "ran", "reshuffle", "search", "touch"], sorted(q)
    g = sqlite3.connect(":memory:")
    g.execute("CREATE TABLE noah_runner_devices(id TEXT PRIMARY KEY)")   # 接続の表が参照する（この確認では行を入れない）
    for stmt in statements(DDL.read_text()):
        g.executescript(stmt)
    for source in ("mcp-registry", "hf-mcp-space", "acp-registry"):
        put(g, "noah_intake_sources", dict(id=source))
    cases = json.loads((REPO / "docs/design-validation/noah/fixtures/listing-cases.json").read_text())["cases"]
    T = 20
    ids = {}

    def add(source, key, group_key, host, state, check, summary=""):
        cid = f"{source}:{key}"
        put(g, "noah_intake_candidates", dict(id=cid, source=source, external_key=key, family_id=cid, group_key=group_key, name=key, summary=summary, host=host, record_sha256=H,
                                              record_json="{}", state=state, reason="bad_url" if state == "unsupported" else None, source_updated_at=5,
                                              first_seen_at=1, changed_at=1, seen_at=1, revision=1))
        if check is not None:
            level = check["level"]
            failures = check.get("failures", 0)
            put(g, "noah_intake_checks", dict(candidate_id=cid, mouth=check["mouth"], surface=check.get("surface", "none"), auth=check["auth"], connect_json="{}", connect_sha256=H,
                                              setup=check["setup"], level=level, result=check["result"], tools_sha256=H if level else None, l1_at=10 if level else None,
                                              l2_at=20 if level == 2 else None, form_tools=check["formTools"], one_tap_tools=check["oneTapTools"],
                                              failures=failures, first_failure_at=9 if failures else None, next_check_at=0))
        return cid

    for n, case in enumerate(cases):
        ns = f"io.case{n}"
        if case.get("bulk"):
            members = [add(case["source"], f"{ns}/tool-{i}", ns, "gateway.example", case["state"], case["check"]) for i in range(T)]
            ids[case["name"]] = f"bulk:{ns}@gateway.example"
            assert len(members) == T
        else:
            host = f"h{n}.example" if case["check"] and case["check"]["mouth"] in ("mcp-remote", "space-mcp") else None
            ids[case["name"]] = add(case["source"], f"{ns}/agent", ns if case["source"] == "mcp-registry" else f"agent{n}", host, case["state"], case["check"])
    regroup_sql = statements((REPO / "docs/contracts/noah-regroup-v1.sql").read_text())

    def run_regroup(now):
        for stmt in regroup_sql:
            g.execute(stmt, {"threshold": T, "now": now} if ":now" in stmt else {"threshold": T} if ":threshold" in stmt else {})

    run_regroup(100)
    for case in cases:
        if case.get("withdrawn"):
            g.execute("UPDATE noah_intake_families SET withdrawn_at=150 WHERE id=?", (ids[case["name"]],))
        if case.get("hidden"):
            g.execute("UPDATE noah_intake_families SET hidden_at=150 WHERE id=?", (ids[case["name"]],))
    first_ran = {"before_at": 9007199254740991, "after_id": "", "limit": 500}
    first_new = {"before": 1000000000, "after_id": "", "one_tap": 0, "limit": 500}
    ran = [r[0] for r in g.execute(q["ran"], first_ran)]
    new = [r[0] for r in g.execute(q["new"], first_new)]
    quick = [r[0] for r in g.execute(q["new"], first_new | {"one_tap": 1})]
    for case in cases:
        fid, want = ids[case["name"]], case["expect"]
        section = "ran" if fid in ran else "new" if fid in new else None
        assert section == (want.get("section") if want["listed"] else None), f"{case['name']}: SQL は {section}、表は {want}"
        if want["listed"] and want["section"] == "new":
            assert (fid in quick) == want["oneTap"], f"{case['name']}: 押すだけの絞り込み"
    assert not set(ran) & set(new)
    # 索引を使い、並べ替えのための一時の表を作らない
    for name, args, index in (("ran", first_ran, "noah_intake_families_timeline"), ("new", first_new, "noah_intake_families_listed")):
        text = plan(g, q[name], args)
        assert index in text and "TEMP B-TREE" not in text, f"{name}: {text}"
    # 頁の継ぎ目: 同じ並びの値が続いても、重ならず、抜けない
    extra = []
    for i in range(30):
        cid = add("mcp-registry", f"io.page/agent-{i:02d}", f"io.page{i}", f"p{i}.example", "active",
                  dict(mouth="mcp-remote", setup=0, auth="none", result="ok", level=1, formTools=1, oneTapTools=i % 2))
        extra.append(cid)
    run_regroup(200)
    for i, cid in enumerate(extra):
        g.execute("UPDATE noah_intake_families SET shuffle=? WHERE id=?", (500 + i // 3, cid))    # 3 件ずつ同じ値
    expected = [r[0] for r in g.execute("SELECT id FROM noah_intake_families WHERE listed=1 AND level=1 AND withdrawn_at IS NULL AND hidden_at IS NULL ORDER BY shuffle DESC, id")]
    assert len(expected) >= 30
    seen, cursor = [], {"before": 1000000000, "after_id": ""}
    for _ in range(20):
        page = g.execute(q["new"], cursor | {"one_tap": 0, "limit": 7}).fetchall()
        seen += [r[0] for r in page]
        if len(page) < 7:
            break
        cursor = {"before": page[-1][1], "after_id": page[-1][0]}
    assert seen == expected, "頁をつないだ結果が、全体の並びと同じ"
    # 並びの引き直し: 載せている L1 の系列だけ。L2 と、載せていない系列は変えない
    before = dict(g.execute("SELECT id, shuffle FROM noah_intake_families"))
    g.execute(q["reshuffle"])
    after = dict(g.execute("SELECT id, shuffle FROM noah_intake_families"))
    assert sum(1 for cid in extra if after[cid] != before[cid]) >= 25 and all(0 <= v < 1000000000 for v in after.values())
    drawn = {r[0] for r in g.execute("SELECT id FROM noah_intake_families WHERE listed=1 AND level=1")}   # 隠した系列も引くが、一覧には出ない
    assert all(after[i] == before[i] for i in after if i not in drawn), "L1 で載せる印のある系列以外は変えない"
    assert [r[0] for r in g.execute("SELECT id FROM noah_intake_families WHERE listed=1 AND level=1 AND withdrawn_at IS NULL AND hidden_at IS NULL ORDER BY id")] == sorted(expected)
    # 名寄せをやり直しても、並びの値は変わらない（毎時の名寄せで並びが動かない）
    run_regroup(300)
    assert dict(g.execute("SELECT id, shuffle FROM noah_intake_families")) == after
    # 写し: 本人の実行で L2 になった物は、次の名寄せを待たずに「動いた」へ移る。2 回続けて失敗した物は、すぐ外れる
    one = extra[0]
    g.execute(q["touch"], {"candidate_id": one, "level": 2, "l2_at": 400, "badge_hint": "one_click", "listed": 1, "one_tap": 0, "now": 400})
    assert [r[0] for r in g.execute(q["ran"], first_ran)][0] == one and one not in [r[0] for r in g.execute(q["new"], first_new)]
    g.execute("UPDATE noah_intake_checks SET level=0, result='unreachable', failures=2, first_failure_at=450 WHERE candidate_id=?", (one,))   # 写しは、握手の表を書いた直後に行う
    g.execute(q["touch"], {"candidate_id": one, "level": 0, "l2_at": None, "badge_hint": "unverified", "listed": 0, "one_tap": 0, "now": 500})
    assert one not in [r[0] for r in g.execute(q["ran"], first_ran)] + [r[0] for r in g.execute(q["new"], first_new)]
    assert g.execute("SELECT l2_at FROM noah_intake_families WHERE id=?", (one,)).fetchone()[0] is None
    assert "noah_intake_families_representative" in plan(g, q["touch"], {"candidate_id": one, "level": 1, "l2_at": None, "badge_hint": "unverified", "listed": 1, "one_tap": 0, "now": 1})
    # 検索: 名前と説明の部分一致。載せている系列だけ。% と _ は文字として探す
    add("mcp-registry", "io.find/weather", "io.find", "w.example", "active", dict(mouth="mcp-remote", setup=0, auth="none", result="ok", level=1, formTools=1, oneTapTools=1), summary="天気を 100% 調べる")
    add("mcp-registry", "io.find/hidden-weather", "io.find2", "w2.example", "active", dict(mouth="mcp-remote", setup=1, auth="key", result="unchecked", level=0, formTools=None, oneTapTools=None), summary="天気（鍵が要る）")
    run_regroup(600)
    like = lambda word: "%" + word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"  # noqa: E731
    find = lambda word: [r[0] for r in g.execute(q["search"], {"like": like(word), "limit": 50, "offset": 0})]  # noqa: E731
    assert find("weather") == ["mcp-registry:io.find/weather"], find("weather")
    assert find("天気") == ["mcp-registry:io.find/weather"], "載せていない物は出さない"
    assert find("100%") == ["mcp-registry:io.find/weather"] and find("%") == ["mcp-registry:io.find/weather"], "% を、何にでも合う記号として扱わない"
    assert find("agent_0") == [], "_ を、1 文字に合う記号として扱わない"
    assert len(find("agent-0")) == 9, find("agent-0")   # agent-00 は、上で 2 回続けて失敗した物。名寄せをやり直しても戻らない
    # 集計: 全部の候補を、1 回ずつ数える
    assert sum(r[-1] for r in g.execute(q["counts"])) == g.execute("SELECT COUNT(*) FROM noah_intake_candidates").fetchone()[0]
    # 頼む前の上限の数え方
    put(g, "noah_connections", connection(1))
    now = 10_000_000
    rows = [(1, "owner-1", "mizan.ac", now - 30_000, None), (2, "owner-1", "mizan.ac", now - 90_000, now - 80_000), (3, "owner-1", "other.example", now - 90_000_000, now - 89_000_000),
            (4, "owner-2", "mizan.ac", now - 10_000, None), (5, "owner-2", "mizan.ac", now - 61_000, now - 50_000)]
    for n, owner, host, created, finished in rows:
        put(g, "noah_asks", ask(n, owner_id=owner, mode="form", host=host, tool="lookup_player", tool_sha256=H, created_at=created, updated_at=created,
                                state="succeeded" if finished else "queued", finished_at=finished))
    args = {"owner": "owner-1", "host": "mizan.ac", "minute_ago": now - 60_000, "day_ago": now - 86_400_000}
    assert g.execute(q["gate"], args).fetchone() == (1, 1, 2, 2), g.execute(q["gate"], args).fetchone()
    text = plan(g, q["gate"], args)
    assert "noah_asks_owner_created" in text and "noah_asks_host_created" in text, text
    # つなぐ前の上限の数え方: 切っていない数・直近 60 秒に作った数・直近 24 時間に作った数。他の本人の行は数えない
    for n, owner, created, gone in ((5, "owner-3", now - 30_000, None), (6, "owner-3", now - 50_000, now - 40_000), (7, "owner-3", now - 3_600_000, None),
                                    (8, "owner-3", now - 90_000_000, None), (9, "owner-4", now - 5_000, None)):
        put(g, "noah_connections", connection(n, owner_id=owner, family_key=f"family-{n}", created_at=created, updated_at=gone or created,
                                              state="disconnected" if gone else "planned", disconnected_at=gone))
    cargs = {"owner": "owner-3", "minute_ago": now - 60_000, "day_ago": now - 86_400_000}
    assert g.execute(q["connect_gate"], cargs).fetchone() == (3, 2, 3), g.execute(q["connect_gate"], cargs).fetchone()
    g.execute("UPDATE noah_connections SET updated_at=? WHERE id=?", (now - 1_000, UUID.format(8)))   # 古い接続を今さわっても、「作った数」には入らない
    assert g.execute(q["connect_gate"], cargs).fetchone() == (3, 2, 3)
    text = plan(g, q["connect_gate"], cargs)
    assert text.count("SEARCH noah_connections USING") == 3 and "SCAN noah_connections" not in text, text   # 3 つとも、本人の行だけを索引で引く
    # 接続先の枠: 60 秒の枠に :limit 回まで。枠が明けたら、また取れる
    take = lambda at, limit=3, host="busy.example": g.execute(q["host_take"], {"host": host, "now": at, "limit": limit}).fetchall()  # noqa: E731
    assert [take(now + i) for i in range(4)] == [[(1,)], [(2,)], [(3,)], []], "4 回目は取れない"
    assert take(now + 59_999) == [] and take(now + 60_000) == [(1,)] and take(now + 60_001) == [(2,)], "最初に取った時刻から 60 秒で、枠が明ける"
    assert take(now + 60_002, limit=2) == [], "上限を下げると、その場で効く"
    assert take(now, host="other.example") == [(1,)], "別の接続先の枠は別"
    # 枠を取っても、巡回の間隔には触らない（新しい host は last_probe_at = 0 で入り、巡回の握手を妨げない）
    probe = ("INSERT INTO noah_probe_hosts(host,last_probe_at) VALUES(?,?) ON CONFLICT(host) DO UPDATE SET last_probe_at=excluded.last_probe_at "
             "WHERE noah_probe_hosts.last_probe_at <= ? AND noah_probe_hosts.not_before <= ? RETURNING host")
    assert g.execute(probe, ("busy.example", now + 70_000, now + 70_000 - 3_600_000, now + 70_000)).fetchall() == [("busy.example",)]
    assert g.execute("SELECT user_count FROM noah_probe_hosts WHERE host='busy.example'").fetchone() == (2,), "巡回の握手は、利用者の枠を使わない"
    assert g.execute(probe, ("patrol-first.example", now, now - 3_600_000, now)).fetchall() == [("patrol-first.example",)]
    assert take(now + 1, host="patrol-first.example") == [(1,)], "巡回が先に作った行でも、利用者の枠は取れる"
    # 相手が「混んでいる」と返したら、その時刻まで、利用者の操作から始める握手も、巡回も待つ。待つ時刻は、短くはならない
    g.execute(q["host_wait"], {"host": "busy.example", "until": now + 300_000})
    g.execute(q["host_wait"], {"host": "busy.example", "until": now + 200_000})
    assert g.execute("SELECT not_before FROM noah_probe_hosts WHERE host='busy.example'").fetchone() == (now + 300_000,)
    assert take(now + 299_999) == [] and take(now + 300_000) == [(1,)], "待つ時刻の前は取れない。過ぎたら取れる"
    assert g.execute(probe, ("busy.example", now + 4_000_000, now + 400_000, now + 299_999)).fetchall() == [], "巡回も待つ"
    g.execute(q["host_wait"], {"host": "new-busy.example", "until": now + 50_000})
    assert take(now, host="new-busy.example") == [] and take(now + 50_000, host="new-busy.example") == [(1,)], "初めての host でも待つ"
    rejects(g, "UPDATE noah_probe_hosts SET user_count=-1 WHERE host='busy.example'")


check("ローンチの一覧と上限: 表と同じ結果・索引・頁の継ぎ目・並びの引き直し・写し・検索・つなぐ前と頼む前の上限・接続先の枠", listing)

failed = [r for r in results if r["status"] != "pass"]
summary = {"sqlite": sqlite3.sqlite_version, "rejections": REJECTED[0], "migrationsApplied": len(applied), "migrationsSkipped": skipped, "checks": len(results),
           "passed": len(results) - len(failed), "results": results}
RESULT.parent.mkdir(parents=True, exist_ok=True)
RESULT.write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n")
for r in results:
    print(("ok   " if r["status"] == "pass" else "FAIL ") + r["name"] + ("" if r["status"] == "pass" else "  — " + r["error"]))
print(f"{summary['passed']}/{summary['checks']} checks（拒否を確かめた行 {REJECTED[0]}）, SQLite {summary['sqlite']}, 既存の migration {len(applied)} 本を適用（{len(skipped)} 本は空の DB では流れない）")
sys.exit(1 if failed else 0)
