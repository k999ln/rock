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
    assert new == ["noah_asks", "noah_connection_secrets", "noah_connections", "noah_intake_candidates", "noah_intake_checks", "noah_intake_families",
                   "noah_intake_sources", "noah_oauth_clients", "noah_oauth_grants", "noah_oauth_states", "noah_probe_hosts", "noah_standing_works",
                   "noah_usage_events"], new


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
    due = "SELECT candidate_id FROM noah_intake_checks WHERE next_check_at <= ? AND lease_until < ? ORDER BY next_check_at LIMIT 8"
    assert "noah_intake_checks_due" in plan(db, due, (100, 100)), plan(db, due, (100, 100))
    claimed = db.execute("UPDATE noah_intake_checks SET lease_until=? WHERE candidate_id IN (" + due + ") RETURNING candidate_id", (160, 100, 100)).fetchall()
    assert len(claimed) == 1
    assert db.execute("UPDATE noah_intake_checks SET lease_until=? WHERE candidate_id IN (" + due + ") RETURNING candidate_id", (160, 100, 100)).fetchall() == [], "同じ物を 2 つの巡回が取らない"
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
    # 候補が消えた系列は隠す。もう一度流しても同じ結果
    g.execute("UPDATE noah_intake_candidates SET state='withdrawn' WHERE id IN ('hf-mcp-space:a/demo')")
    for stmt in statements((REPO / "docs/contracts/noah-regroup-v1.sql").read_text()):
        g.execute(stmt, {"threshold": T, "now": 200} if ":now" in stmt else {"threshold": T} if ":threshold" in stmt else {})
    assert g.execute("SELECT hidden_at FROM noah_intake_families WHERE id='hf-mcp-space:a/demo'").fetchone()[0] == 200
    assert dict(g.execute("SELECT id, family_id FROM noah_intake_candidates WHERE state='active'")) == {k: v for k, v in family.items() if k != "hf-mcp-space:a/demo"}


check("名寄せの SQL が、参照実装と同じ系列と代表を作る", regroup)

failed = [r for r in results if r["status"] != "pass"]
summary = {"sqlite": sqlite3.sqlite_version, "rejections": REJECTED[0], "migrationsApplied": len(applied), "migrationsSkipped": skipped, "checks": len(results),
           "passed": len(results) - len(failed), "results": results}
RESULT.parent.mkdir(parents=True, exist_ok=True)
RESULT.write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n")
for r in results:
    print(("ok   " if r["status"] == "pass" else "FAIL ") + r["name"] + ("" if r["status"] == "pass" else "  — " + r["error"]))
print(f"{summary['passed']}/{summary['checks']} checks（拒否を確かめた行 {REJECTED[0]}）, SQLite {summary['sqlite']}, 既存の migration {len(applied)} 本を適用（{len(skipped)} 本は空の DB では流れない）")
sys.exit(1 if failed else 0)
