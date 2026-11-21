#!/usr/bin/env python3
"""Noah の棚の DDL 案（docs/contracts/noah-shelf-v1.sql）と問い合わせ（noah-shelf-queries-v1.sql）を、手元の SQLite で流して確かめる。本番 D1 への適用ではない。

実行: python3 docs/design-validation/noah/validate-noah-shelf-v1.py
既存の drizzle/*.sql を名前順に一時 DB へ流し、docs/contracts/noah-v1.sql を流し、続けて棚の DDL 案を 2 回流す（2 回目で壊れないこと）。
その後、制約が拒否すべき物を拒否し、問い合わせが索引を使い、手で数えた値と同じになることを確かめる。
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
BASE = REPO / "docs/contracts/noah-v1.sql"
DDL = REPO / "docs/contracts/noah-shelf-v1.sql"
QUERIES = REPO / "docs/contracts/noah-shelf-queries-v1.sql"
RESULT = Path(os.environ.get("NOAH_SHELF_SQL_RESULT", str(REPO / "work/design-validation/noah-shelf-v1-validation.json"))).resolve()
H = "a" * 64
DAY = 86_400_000
T0 = 20_000 * DAY   # ある UTC の日の 0 時
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
    raise AssertionError("拒否されなかった: " + sql[:80] + " " + json.dumps(list(args), ensure_ascii=False)[:160])


def put(db, table, row):
    db.execute(f"INSERT INTO {table}({','.join(row)}) VALUES({','.join('?' * len(row))})", list(row.values()))


def variants(db, table, base, changes):
    """元の行が通ること（入れた行は戻す）を先に確かめ、1 項目ずつ変えた行が拒否されること。"""
    db.execute("SAVEPOINT a")
    try:
        put(db, table, base)
    finally:
        db.execute("ROLLBACK TO a")
        db.execute("RELEASE a")
    for change in changes:
        row = base | change
        rejects(db, f"INSERT INTO {table}({','.join(row)}) VALUES({','.join('?' * len(row))})", list(row.values()))


def plan(db, sql, args=None):
    return " | ".join(r[3] for r in db.execute("EXPLAIN QUERY PLAN " + sql, args or {}))


def named(path):
    """「-- name: …」で始まる文を、名前で引けるようにする。"""
    out = {}
    for stmt in statements(path.read_text()):
        for line in stmt.splitlines():
            if line.startswith("-- name:"):
                out[line.split(":", 1)[1].strip()] = "\n".join(part for part in stmt.splitlines() if not part.startswith("--")).strip().rstrip(";")
    return out


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
for stmt in statements(BASE.read_text()):
    db.executescript(stmt)
Q = named(QUERIES)
NEW = ["noah_package_connections", "noah_package_evidence", "noah_package_steps", "noah_packages", "noah_shelf_daily", "noah_shelf_seen",
       "noah_trial_channels", "noah_trial_entries", "noah_trial_reports"]
# 実装の task が drizzle/ へ移した表（task 110: drizzle/0050_noah_shelf.sql、114: 0051_noah_trial.sql、111: 0052_noah_shelf_evidence.sql）。移した表と索引は、DDL 案と同じ定義であること。
MOVED = {"noah_packages": ["noah_packages_shelf"], "noah_package_steps": ["noah_package_steps_ref"],
         "noah_trial_channels": [], "noah_trial_entries": ["noah_trial_entries_via"], "noah_trial_reports": ["noah_trial_reports_package"],
         "noah_package_evidence": [], "noah_shelf_daily": [], "noah_shelf_seen": []}


def ddl_twice():
    before = {r[0]: r[1] for r in db.execute("SELECT name, sql FROM sqlite_master")}
    for _ in range(2):
        for stmt in statements(DDL.read_text()):
            db.executescript(stmt)
    after = {r[0]: r[1] for r in db.execute("SELECT name, sql FROM sqlite_master")}
    for name, sql in before.items():
        assert after.get(name) == sql, f"既存の定義が変わった: {name}"
    new = sorted(n for n in after if n not in before and db.execute("SELECT type FROM sqlite_master WHERE name=?", (n,)).fetchone()[0] == "table")
    moved = sorted(n for n in MOVED if n in before)
    assert sorted(new + moved) == NEW, (new, moved)
    # 移した表は、DDL 案だけを流した DB と、同じ定義（表も索引も）。
    fresh = sqlite3.connect(":memory:")
    for stmt in statements(DDL.read_text()):
        fresh.executescript(stmt)
    for table in moved:
        for name in [table, *MOVED[table]]:
            assert before.get(name) == fresh.execute("SELECT sql FROM sqlite_master WHERE name=?", (name,)).fetchone()[0], f"移した定義が DDL 案と違う: {name}"
    for table in NEW:   # 本文と本人の ID を置く列が、数える表に無い
        columns = [r[1] for r in db.execute(f"PRAGMA table_info({table})")]
        assert not any(c in columns for c in ("prompt", "input", "output", "body", "url")), (table, columns)
    for table in ("noah_package_evidence", "noah_shelf_daily", "noah_packages", "noah_package_steps", "noah_trial_channels"):
        assert "owner_id" not in [r[1] for r in db.execute(f"PRAGMA table_info({table})")], table
    assert sorted(Q) == sorted(["shelf", "packages_of_family", "package_touch", "evidence_rollup", "evidence", "shown", "seen", "seen_hide", "seen_of_owner",
                                "seen_forget", "seen_forget_hidden", "live_cards", "trial_totals", "trial_funnel", "trial_earn"]), sorted(Q)


check("棚の DDL 案を 2 回流しても壊れず、既存の定義も noah-v1.sql の定義も変えない。新しい表は 9 個（drizzle/ へ移した表は、DDL 案と同じ定義）", ddl_twice)


def package(pid="pkg:weather", **change):
    return dict(id=pid, shelf="life", topic="home", position=10, status="verified", package_json="{}", package_sha256=H, listed=1, reason=None,
                checked_at=1, created_at=1, updated_at=1, revision=1) | change


def step(pid="pkg:weather", n=0, **change):
    return dict(package_id=pid, step=n, kind="family", ref="mcp-registry:ex/weather", tool="get_weather") | change


def connection(cid, owner, family="mcp-registry:ex/weather", at=T0, connected=True, **change):
    return dict(id=cid, owner_id=owner, family_key=family, agent_id=family, digest=H, request_sha256=H, connect_json="{}", connect_sha256=H, plan_sha256=H,
                place="provider", state="connected" if connected else "failed", consent_json="{}", price_json='{"model":"free"}', cost_taps=0, cost_typed=0,
                revision=1, created_at=at, updated_at=at, connected_at=at + 100 if connected else None) | change


def ask(aid, owner, cid, at, state="succeeded", tool="get_weather", took=1000, **change):
    done = state in ("succeeded", "failed", "stopped", "limit", "unknown")
    return dict(id=aid, owner_id=owner, connection_id=cid, work_id="work-" + aid[-4:], request_sha256=H, mode="form", host="ex.example", tool=tool, tool_sha256=H,
                state=state, revision=1, created_at=at, updated_at=at, finished_at=at + took if done else None) | change


def uid(n):
    return f"00000000-0000-4000-8000-{n:012d}"


def packages():
    put(db, "noah_packages", package())
    put(db, "noah_packages", package("pkg:quiet", position=5))
    put(db, "noah_packages", package("pkg:two", position=1, shelf="earn", topic="dev"))
    put(db, "noah_packages", package("pkg:draft", position=0, status="draft", listed=0, reason="draft"))
    put(db, "noah_packages", package("pkg:broken", position=2, listed=0, reason="step_changed", reason_step=0))
    variants(db, "noah_packages", package("pkg:xx"), (
        dict(id="weather"), dict(id="pkg:Weather"), dict(id="pkg:w"), dict(id="pkg:" + "a" * 64), dict(id="pkg:a b"),
        dict(shelf="play"), dict(topic="money"), dict(position=-1), dict(position=10000), dict(status="listed"),
        dict(package_json="{こわれた"), dict(package_json=json.dumps({"x": "a" * 8200})), dict(package_sha256="abc"),
        dict(listed=2), dict(listed=1, reason="draft"), dict(listed=0, reason=None), dict(listed=0, reason="popular"),
        dict(status="draft"), dict(status="retired"), dict(reason_step=0), dict(listed=0, reason="step_missing", reason_step=6), dict(revision=0),
    ))
    put(db, "noah_package_steps", step())
    put(db, "noah_package_steps", step("pkg:quiet", ref="mcp-registry:ex/quiet", tool="t"))
    put(db, "noah_package_steps", step("pkg:two", 0, ref="mcp-registry:ex/weather"))
    put(db, "noah_package_steps", step("pkg:two", 1, ref="mcp-registry:ex/review", tool="review"))
    variants(db, "noah_package_steps", step("pkg:draft"), (
        dict(package_id="pkg:none"), dict(step=6), dict(kind="shell"), dict(tool=None), dict(kind="home", ref="anicca"), dict(kind="owner", ref="x", tool=None),
        dict(ref=""), dict(ref="a" * 401), dict(tool=""), dict(package_id="pkg:weather", step=0),
    ))
    for row in (step("pkg:draft", 0, kind="home", ref="anicca", tool=None), step("pkg:draft", 1, kind="builtin", ref="compose-check", tool=None),
                step("pkg:draft", 2, kind="owner", ref="", tool=None), step("pkg:draft", 3, kind="gap", ref="", tool=None)):
        put(db, "noah_package_steps", row)
    # 棚 1 段: 載せているカードだけを、運営の順で。索引を使い、並べ替えの一時の表を作らない。
    rows = db.execute(Q["shelf"], {"shelf": "life"}).fetchall()
    assert [r[0] for r in rows] == ["pkg:quiet", "pkg:weather"], rows
    assert [r[0] for r in db.execute(Q["shelf"], {"shelf": "earn"})] == ["pkg:two"]
    p = plan(db, Q["shelf"], {"shelf": "life"})
    assert "noah_packages_shelf" in p and "TEMP B-TREE" not in p, p
    # 系列が変わった時に、見直すカードを引く。
    assert sorted(r[0] for r in db.execute(Q["packages_of_family"], {"family_id": "mcp-registry:ex/weather"})) == ["pkg:two", "pkg:weather"]
    assert "noah_package_steps_ref" in plan(db, Q["packages_of_family"], {"family_id": "x"})
    # 載せるかの見直しの写し: 版が合う時だけ。外す時は理由が要る。
    touch = {"id": "pkg:weather", "revision": 1, "now": 9}
    assert db.execute(Q["package_touch"], touch | {"listed": 0, "reason": "step_not_running", "reason_step": 0}).rowcount == 1
    assert db.execute("SELECT listed, reason, reason_step, checked_at, revision FROM noah_packages WHERE id='pkg:weather'").fetchone() == (0, "step_not_running", 0, 9, 2)
    assert [r[0] for r in db.execute(Q["shelf"], {"shelf": "life"})] == ["pkg:quiet"], "外したカードは、棚に出ない"
    assert db.execute(Q["package_touch"], touch | {"listed": 1, "reason": None, "reason_step": None}).rowcount == 0, "古い版では書けない"
    assert db.execute(Q["package_touch"], touch | {"revision": 2, "listed": 1, "reason": None, "reason_step": None}).rowcount == 1
    rejects(db, Q["package_touch"], {"id": "pkg:weather", "revision": 3, "now": 9, "listed": 0, "reason": None, "reason_step": None})
    rejects(db, Q["package_touch"], {"id": "pkg:draft", "revision": 1, "now": 9, "listed": 1, "reason": None, "reason_step": None})


check("カード: 形の制約・棚の一覧（索引・運営の順）・系列からカードを引く・載せるかの写し（版・理由）", packages)


def evidence():
    since = T0 - 1
    rows = [
        connection(uid(1), "o1", at=T0),
        connection(uid(20), "o2", at=T0 + 500, state="disconnected", disconnected_at=T0 + 900),   # 切って、つなぎ直した人
        connection(uid(2), "o2", at=T0 + 1000),
        connection(uid(3), "o3", at=T0 + 2000),
        connection(uid(4), "o4", at=T0 + 3000, connected=False),                                   # つながらなかった人
        connection(uid(5), "o5", at=T0 + 4000),
        connection(uid(6), "o6", at=T0 + 5000),
        connection(uid(9), "o9", at=T0 - 10 * DAY),                                                # 数える期間より前
        connection(uid(7), "o7", family="mcp-registry:ex/other", at=T0),                           # 別の系列
    ]
    for row in rows:
        put(db, "noah_connections", row)
    asks = [
        ask(uid(101), "o1", uid(1), T0 + 29_000),                                   # 最初の成果: T0 + 30,000（接続から 30 秒）
        ask(uid(102), "o1", uid(1), T0 + DAY + 5),                                  # 次の日に、もう 1 回
        ask(uid(103), "o2", uid(2), T0 + 50_000, took=11_000),                      # 最初の成果: T0 + 61,000（最初の接続 T0 + 500 から 60 秒）
        ask(uid(104), "o2", uid(2), T0 + 70_000),                                   # 同じ日の 2 回目（「また使った」に数えない）
        ask(uid(105), "o3", uid(3), T0 + 80_000, state="failed"),
        ask(uid(106), "o5", uid(5), T0 + 90_000, tool="other_tool"),                # 別の道具（このカードの実績に数えない）
        ask(uid(107), "o6", uid(6), T0 + 14_000),                                   # 最初の成果: T0 + 15,000（接続から 10 秒）
        ask(uid(108), "o6", uid(6), T0 + 2 * DAY, state="failed"),                  # 2 日後に、もう 1 回頼んだ（成果でなくても「また使った」）
        ask(uid(109), "o3", uid(3), T0 + 95_000, state="queued"),                   # 終わっていない依頼
        ask(uid(110), "o9", uid(9), T0 - 10 * DAY + 5),                             # 期間より前
        ask(uid(111), "o7", uid(7), T0 + 1000),                                     # 別の系列
    ]
    for row in asks:
        put(db, "noah_asks", row)
    args = {"since": since, "now": T0 + 3 * DAY}
    db.execute(Q["evidence_rollup"], args)
    got = {r[0]: r[1:] for r in db.execute("SELECT package_id, people, connects, connected, asks, succeeded, reviewed, accepted, first_users, returned, median_seconds FROM noah_package_evidence")}
    # 手で数えた値。pkg:two は、自動の工程が 2 つあるので、数えない（行ができない）。
    assert got == {"pkg:weather": (6, 7, 6, 7, 5, 0, 0, 3, 2, 30), "pkg:quiet": (0, 0, 0, 0, 0, 0, 0, 0, 0, None)}, got
    # もう 1 回流しても同じ数（数え直すだけ。足し込まない）。時刻だけが変わる。
    db.execute(Q["evidence_rollup"], args | {"now": T0 + 4 * DAY})
    again = {r[0]: r[1:] for r in db.execute("SELECT package_id, people, connects, connected, asks, succeeded, reviewed, accepted, first_users, returned, median_seconds FROM noah_package_evidence")}
    assert again == got, again
    assert db.execute("SELECT DISTINCT computed_at FROM noah_package_evidence").fetchall() == [(T0 + 4 * DAY,)]
    # 新しい成果が増えると、次の数え直しで増える。偶数の人数の中央値は、真ん中の 2 つの平均（切り捨て）。
    put(db, "noah_asks", ask(uid(112), "o3", uid(3), T0 + 100_000, took=18_000))   # o3 の最初の成果: 接続 T0 + 2,000 から 116 秒
    db.execute(Q["evidence_rollup"], args)
    assert db.execute("SELECT asks, succeeded, first_users, returned, median_seconds FROM noah_package_evidence WHERE package_id='pkg:weather'").fetchone() == (8, 6, 4, 2, 45)
    # 期間を進めると、古い実績は数に入らない。
    db.execute(Q["evidence_rollup"], {"since": T0 + DAY, "now": T0 + 5 * DAY})
    assert db.execute("SELECT people, connects, asks FROM noah_package_evidence WHERE package_id='pkg:weather'").fetchone() == (0, 0, 0)
    db.execute(Q["evidence_rollup"], args)
    # 索引を使う（系列から接続、本人と時刻から依頼）。依頼の表を端から読まない。
    p = plan(db, Q["evidence_rollup"], args)
    assert "noah_connections_family" in p, p
    assert "noah_asks_owner_created" in p and "SCAN a" not in p and "SCAN noah_asks" not in p, p
    # 棚 1 段の実績。載せていないカードの行は返さない。
    assert sorted(r[0] for r in db.execute(Q["evidence"], {"shelf": "life"})) == ["pkg:quiet", "pkg:weather"]
    db.execute(Q["package_touch"], {"id": "pkg:quiet", "revision": 1, "now": 9, "listed": 0, "reason": "retired", "reason_step": None})
    assert [r[0] for r in db.execute(Q["evidence"], {"shelf": "life"})] == ["pkg:weather"]
    variants(db, "noah_package_evidence", dict(package_id="pkg:draft", people=5, connects=5, connected=5, asks=5, succeeded=5, first_users=5, returned=5, since_at=1, computed_at=1), (
        dict(connected=6), dict(succeeded=6), dict(accepted=1), dict(returned=6), dict(people=-1), dict(median_seconds=-1), dict(package_id="pkg:none"),
    ))


check("実績の数え直し: 手で数えた値と同じ・足し込まない・期間・索引・載せているカードだけ・数の制約", evidence)


def seen():
    day = 20261121
    for band, shown, opened in (("top", 1, 0), ("top", 1, 0), ("top", 0, 1), ("mid", 1, 0)):
        db.execute(Q["shown"], {"day": day, "package_id": "pkg:weather", "band": band, "shown": shown, "opened": opened})
    assert db.execute("SELECT band, shown, opened FROM noah_shelf_daily ORDER BY band DESC").fetchall() == [("top", 2, 1), ("mid", 1, 0)]
    variants(db, "noah_shelf_daily", dict(day=day, package_id="pkg:two", band="low", shown=1, opened=0), (
        dict(band="first"), dict(day=1121), dict(shown=-1), dict(opened=-1), dict(package_id="pkg:none"), dict(package_id="pkg:weather", band="top"),
    ))
    # 同意した本人の、見た記録。
    for _ in range(3):
        db.execute(Q["seen"], {"owner": "o1", "package_id": "pkg:weather", "shown": 1, "opened": 0, "now": 5})
    db.execute(Q["seen"], {"owner": "o1", "package_id": "pkg:two", "shown": 1, "opened": 1, "now": 6})
    db.execute(Q["seen_hide"], {"owner": "o1", "package_id": "pkg:quiet", "hidden": 1, "now": 7})
    db.execute(Q["seen_hide"], {"owner": "o2", "package_id": "pkg:two", "hidden": 1, "now": 7})
    assert sorted(db.execute(Q["seen_of_owner"], {"owner": "o1"}).fetchall()) == [("pkg:quiet", 0, 0, 1), ("pkg:two", 1, 1, 0), ("pkg:weather", 3, 0, 0)]
    assert "sqlite_autoindex_noah_shelf_seen_1" in plan(db, Q["seen_of_owner"], {"owner": "o1"})
    # 非表示を戻す。
    db.execute(Q["seen_hide"], {"owner": "o2", "package_id": "pkg:two", "hidden": 0, "now": 8})
    assert db.execute(Q["seen_of_owner"], {"owner": "o2"}).fetchall() == [("pkg:two", 0, 0, 0)]
    # 履歴を消す: 見た記録の行が消える。本人が頼んだ「非表示」は残る。他の本人の行には触らない。
    db.execute(Q["seen"], {"owner": "o1", "package_id": "pkg:quiet", "shown": 2, "opened": 0, "now": 9})
    db.execute(Q["seen_forget"], {"owner": "o1"})
    db.execute(Q["seen_forget_hidden"], {"owner": "o1"})
    assert db.execute(Q["seen_of_owner"], {"owner": "o1"}).fetchall() == [("pkg:quiet", 0, 0, 1)]
    assert db.execute(Q["seen_of_owner"], {"owner": "o2"}).fetchall() == [("pkg:two", 0, 0, 0)]
    variants(db, "noah_shelf_seen", dict(owner_id="o3", package_id="pkg:two", shown=1, opened=0, hidden=0, first_at=5, last_at=5), (
        dict(hidden=2), dict(shown=-1), dict(last_at=4), dict(package_id="pkg:none"),
    ))


check("見せた記録: 全員の数は日・カード・位置の区分ごと。本人の記録・非表示・履歴を消す", seen)


def live_cards():
    # o1 は、pkg:weather の系列（1 本）と、別の系列を 3 本つないでいる。そのうち 2 本は、同じカードの中。
    for n, family in ((31, "mcp-registry:ex/a"), (32, "mcp-registry:ex/b"), (33, "mcp-registry:ex/c")):
        put(db, "noah_connections", connection(uid(n), "o1", family=family))
    put(db, "noah_connections", connection(uid(34), "o1", family="mcp-registry:ex/d", state="disconnected", disconnected_at=T0 + 9))
    assert db.execute(Q["live_cards"], {"owner": "o1"}).fetchone() == (4,), "カードの外の接続は、1 本が 1"
    put(db, "noah_package_connections", dict(connection_id=uid(31), package_id="pkg:two"))
    put(db, "noah_package_connections", dict(connection_id=uid(32), package_id="pkg:two"))
    put(db, "noah_package_connections", dict(connection_id=uid(34), package_id="pkg:two"))
    assert db.execute(Q["live_cards"], {"owner": "o1"}).fetchone() == (3,), "同じカードの中の 2 本は、1 と数える。切った接続は数えない"
    assert db.execute(Q["live_cards"], {"owner": "nobody"}).fetchone() == (0,)
    assert "noah_connections_owner" in plan(db, Q["live_cards"], {"owner": "o1"}) or "noah_connections_one_live" in plan(db, Q["live_cards"], {"owner": "o1"}), plan(db, Q["live_cards"], {"owner": "o1"})
    rejects(db, "INSERT INTO noah_package_connections(connection_id, package_id) VALUES(?, ?)", (uid(31), "pkg:weather"))
    rejects(db, "INSERT INTO noah_package_connections(connection_id, package_id) VALUES(?, ?)", (uid(999), "pkg:weather"))
    rejects(db, "INSERT INTO noah_package_connections(connection_id, package_id) VALUES(?, ?)", (uid(33), "pkg:none"))


check("つなげる数: 同じカードの中の接続は 1。切った接続は数えない", live_cards)


def trial():
    put(db, "noah_trial_channels", dict(via="salon-1", label="サロン 11/21 の投稿", wave=1, created_at=1))
    put(db, "noah_trial_channels", dict(via="talk-1", label="実演会 1 回目", wave=2, created_at=2))
    variants(db, "noah_trial_channels", dict(via="friend", label="直接", wave=1, created_at=1), (
        dict(via="Friend"), dict(via="a b"), dict(via=""), dict(via="a" * 41), dict(via="-x"), dict(label=""), dict(wave=4), dict(via="salon-1"),
    ))
    for n in range(1, 7):
        put(db, "noah_trial_entries", dict(owner_id=f"o{n}", via="salon-1", wave=1, created_at=10 + n))
    put(db, "noah_trial_entries", dict(owner_id="o7", via="talk-1", wave=2, created_at=20))
    variants(db, "noah_trial_entries", dict(owner_id="o8", via="salon-1", wave=1, created_at=1), (dict(via="unknown"), dict(wave=0), dict(owner_id="o1")))
    # 段 1 の人（o1〜o6）: 「接続」を押した 6、つながった 5（o4 は失敗）、成果まで 5（o1・o2・o3・o5・o6）、また使った 2（o1・o6）。
    assert db.execute(Q["trial_totals"], {"wave": 1}).fetchone() == (6, 5, 5, 2)
    assert db.execute(Q["trial_totals"], {"wave": 2}).fetchone() == (7, 6, 6, 2), "段 2 までを合わせると、o7 が入る"
    p = plan(db, Q["trial_totals"], {"wave": 1})
    assert "SCAN c" not in p and "SCAN a" not in p and "SCAN b" not in p, p   # 接続と依頼の表を、端から読まない
    # 経路ごと: 5 人未満の経路（talk-1 は 1 人）は出さない。
    assert db.execute(Q["trial_funnel"]).fetchall() == [("salon-1", 6, 5, 5)]
    # 本人からの報告。5 人未満のカードは出さない。
    reports = [("o1", 1, 2, 7_800, 50), ("o2", 1, 0, 0, 20), ("o3", 1, 1, 2_340, 30), ("o4", 0, 0, 0, 0), ("o5", 0, 0, 0, 5)]
    for owner, listed, sold, net, minutes in reports:
        put(db, "noah_trial_reports", dict(owner_id=owner, package_id="pkg:weather", listed=listed, sold=sold, net_yen=net, minutes=minutes, reported_at=30))
    for owner in ("o1", "o2", "o3", "o4"):
        put(db, "noah_trial_reports", dict(owner_id=owner, package_id="pkg:two", listed=1, sold=1, net_yen=3_900, minutes=10, reported_at=30))
    assert db.execute(Q["trial_earn"]).fetchall() == [("pkg:weather", 5, 3, 2, 3, 10_140, 105)]
    variants(db, "noah_trial_reports", dict(owner_id="o6", package_id="pkg:weather", listed=1, sold=1, net_yen=2_340, minutes=30, reported_at=30), (
        dict(listed=0), dict(sold=0), dict(sold=1000), dict(net_yen=-1), dict(minutes=-1), dict(owner_id="outsider"), dict(package_id="pkg:none"), dict(owner_id="o1"),
    ))
    assert "noah_trial_reports_package" in plan(db, Q["trial_earn"]) or "sqlite_autoindex_noah_trial_reports_1" in plan(db, Q["trial_earn"]), plan(db, Q["trial_earn"])


check("300 人の試行: 経路の札・入口は 1 人 1 行・段を終えたかの 4 つの数・5 人未満を出さない・報告の制約", trial)

failed = [r for r in results if r["status"] != "pass"]
summary = {"sqlite": sqlite3.sqlite_version, "rejections": REJECTED[0], "migrationsApplied": len(applied), "migrationsSkipped": skipped, "checks": len(results),
           "passed": len(results) - len(failed), "results": results}
RESULT.parent.mkdir(parents=True, exist_ok=True)
RESULT.write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n")
for r in results:
    print(("ok   " if r["status"] == "pass" else "FAIL ") + r["name"] + ("" if r["status"] == "pass" else "  — " + r["error"]))
print(f"{summary['passed']}/{summary['checks']} checks（拒否を確かめた行 {REJECTED[0]}）, SQLite {summary['sqlite']}, 既存の migration {len(applied)} 本を適用（{len(skipped)} 本は空の DB では流れない）")
sys.exit(1 if failed else 0)
