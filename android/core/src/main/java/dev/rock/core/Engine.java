package dev.rock.core;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Prototype: one Android user/database, two pinned local transforms, no external effects. */
public final class Engine {
    public static final int SCHEMA_VERSION = 2;
    public static final int MAX_BYTES = 32 * 1024;
    public static final int MAX_WORKS = 100;
    public static final long LEASE_MS = 60_000;
    public static final String RECIPE = "article-preparation@1";
    private static final String[] TOOLS = {"citations@1", "free-article@1"};
    private final Database db;

    public static final class Ticket {
        public final String workId, token, tool, input, boot;
        public final int step, attempt;
        public final long deadline;
        Ticket(Map<String,String> row, String input) {
            workId = row.get("work_id"); token = row.get("token"); tool = row.get("tool");
            boot = row.get("boot"); step = Integer.parseInt(row.get("step"));
            attempt = Integer.parseInt(row.get("attempt")); deadline = Long.parseLong(row.get("deadline"));
            this.input = input;
        }
    }

    /** Broker-owned durable record of the Tool explicitly selected in native Sky. */
    public static final class SkySelection {
        public final String token, toolId;
        public final int revision;
        SkySelection(Map<String,String> row) {
            token = row.get("selection_token"); toolId = row.get("tool_id");
            revision = Integer.parseInt(row.get("revision"));
        }
    }

    public Engine(Database db) {
        this.db = db;
        db.execute("PRAGMA foreign_keys=ON");
        db.transaction(() -> {
            if (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='rock_meta'").isEmpty()) {
                try (InputStream in = Engine.class.getResourceAsStream("/schema.sql")) {
                    if (in == null) throw new IllegalStateException("SCHEMA_MISSING");
                    String schema = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                    for (String sql : schema.split(";")) if (!sql.trim().isEmpty()) db.execute(sql);
                } catch (java.io.IOException e) { throw new IllegalStateException("SCHEMA_READ_FAILED", e); }
            }
            List<Map<String,String>> versions = db.query("SELECT version FROM rock_meta");
            if (versions.size() != 1) throw new IllegalStateException("UNSUPPORTED_DATABASE_VERSION");
            int version = Integer.parseInt(versions.get(0).get("version"));
            if (version == 1) {
                db.execute("ALTER TABLE rock_meta RENAME TO rock_meta_v1");
                db.execute("CREATE TABLE rock_meta(version INTEGER NOT NULL CHECK(version>=1))");
                db.execute("INSERT INTO rock_meta VALUES(?)", SCHEMA_VERSION);
                db.execute("DROP TABLE rock_meta_v1");
                db.execute("CREATE TABLE sky_selection(id INTEGER PRIMARY KEY CHECK(id=1),selection_token TEXT NOT NULL UNIQUE,tool_id TEXT NOT NULL CHECK(tool_id='article-preparation@1'),revision INTEGER NOT NULL CHECK(revision>=1))");
                version = SCHEMA_VERSION;
            }
            if (version != SCHEMA_VERSION)
                throw new IllegalStateException("UNSUPPORTED_DATABASE_VERSION");
            return null;
        });
    }

    /** Re-selecting the same v1 Tool is stable, so UI recreation cannot mint a different handoff. */
    public SkySelection selectSkyTool(String toolId) {
        if (!RECIPE.equals(toolId)) throw new SecurityException("SKY_TOOL_NOT_ALLOWED");
        return db.transaction(() -> {
            List<Map<String,String>> rows = db.query("SELECT selection_token,tool_id,revision FROM sky_selection WHERE id=1");
            if (rows.isEmpty()) {
                db.execute("INSERT INTO sky_selection(id,selection_token,tool_id,revision) VALUES(1,?,?,1)",
                    UUID.randomUUID().toString(), toolId);
                rows = db.query("SELECT selection_token,tool_id,revision FROM sky_selection WHERE id=1");
            }
            if (rows.size() != 1 || !toolId.equals(rows.get(0).get("tool_id")))
                throw new IllegalStateException("SKY_SELECTION_CORRUPT");
            return new SkySelection(rows.get(0));
        });
    }

    public SkySelection skySelection() {
        List<Map<String,String>> rows = db.query("SELECT selection_token,tool_id,revision FROM sky_selection WHERE id=1");
        if (rows.size() > 1) throw new IllegalStateException("SKY_SELECTION_CORRUPT");
        return rows.isEmpty() ? null : new SkySelection(rows.get(0));
    }

    /** Returns the exact selected Tool only when the caller presents the persisted selection token. */
    public String requireSkySelection(String selectionToken) {
        if (selectionToken == null || !selectionToken.matches("[0-9a-f-]{36}"))
            throw new SecurityException("SKY_SELECTION_REQUIRED");
        SkySelection selected = skySelection();
        if (selected == null || !selectionToken.equals(selected.token))
            throw new SecurityException("SKY_SELECTION_MISMATCH");
        return selected.toolId;
    }

    public static String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder s = new StringBuilder();
            for (byte b : bytes) s.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
            return s.toString();
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    public static void bounded(String text) {
        if (text == null || text.trim().isEmpty() || text.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES)
            throw new IllegalArgumentException("INVALID_PAYLOAD_SIZE");
        // Reject malformed UTF-16 rather than hashing replacement characters ambiguously.
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (Character.isHighSurrogate(c)) {
                if (++i >= text.length() || !Character.isLowSurrogate(text.charAt(i)))
                    throw new IllegalArgumentException("INVALID_UNICODE");
            } else if (Character.isLowSurrogate(c)) throw new IllegalArgumentException("INVALID_UNICODE");
        }
    }

    public String submit(String requestKey, String input, boolean sample, boolean consent) {
        if (!consent) throw new SecurityException("LOCAL_ARTIFACT_CONSENT_REQUIRED");
        if (requestKey == null || !requestKey.matches("[A-Za-z0-9_-]{1,80}"))
            throw new IllegalArgumentException("INVALID_REQUEST_KEY");
        bounded(input);
        String hash = digest(RECIPE + "\n" + sample + "\n" + input);
        return db.transaction(() -> {
            List<Map<String,String>> old = db.query("SELECT id,request_hash FROM works WHERE request_key=?", requestKey);
            if (!old.isEmpty()) {
                if (!hash.equals(old.get(0).get("request_hash"))) throw new IllegalStateException("REQUEST_CONFLICT");
                return old.get(0).get("id");
            }
            if (Integer.parseInt(db.query("SELECT count(*) AS n FROM works").get(0).get("n")) >= MAX_WORKS)
                throw new IllegalStateException("WORK_LIMIT_REACHED");
            String id = UUID.randomUUID().toString();
            db.execute("INSERT INTO works(id,request_key,request_hash,state,sample) VALUES(?,?,?,'active',?)", id, requestKey, hash, sample ? 1 : 0);
            String inputHash = artifact(id, input);
            for (int step = 0; step < TOOLS.length; step++)
                db.execute("INSERT INTO runs(work_id,step,tool,state,input_digest) VALUES(?,?,?,?,?)", id, step, TOOLS[step], step == 0 ? "queued" : "pending", step == 0 ? inputHash : null);
            event(id, -1, "submitted");
            return id;
        });
    }

    /** Returns an existing idempotent request without reading or exposing its payload. */
    public String existingWorkId(String requestKey) {
        if (requestKey == null || !requestKey.matches("[A-Za-z0-9_-]{1,80}"))
            throw new IllegalArgumentException("INVALID_REQUEST_KEY");
        List<Map<String,String>> rows = db.query("SELECT id FROM works WHERE request_key=?", requestKey);
        if (rows.size() > 1) throw new IllegalStateException("DUPLICATE_REQUEST_KEY");
        return rows.isEmpty() ? null : rows.get(0).get("id");
    }

    /** elapsedMs is monotonic uptime. bootId must change on reboot, not on app restart. */
    public Ticket claim(String bootId, long elapsedMs, boolean charging) {
        if (bootId == null || bootId.isEmpty() || elapsedMs < 0 || elapsedMs > Long.MAX_VALUE - LEASE_MS)
            throw new IllegalArgumentException("INVALID_CLOCK");
        return db.transaction(() -> {
            recover(bootId, elapsedMs);
            if (!charging || paused()) return null;
            if (!db.query("SELECT 1 FROM runs WHERE state='running' LIMIT 1").isEmpty()) return null;
            List<Map<String,String>> rows = db.query("SELECT r.* FROM runs r JOIN works w ON w.id=r.work_id WHERE r.state='queued' AND w.state='active' ORDER BY w.rowid,r.step LIMIT 1");
            if (rows.isEmpty()) return null;
            Map<String,String> r = rows.get(0);
            String id = r.get("work_id"); int step = Integer.parseInt(r.get("step"));
            db.execute("UPDATE runs SET state='running',attempt=attempt+1,token=?,boot=?,deadline=?,error=NULL WHERE work_id=? AND step=? AND state='queued'", UUID.randomUUID().toString(), bootId, elapsedMs + LEASE_MS, id, step);
            event(id, step, "started");
            Map<String,String> current = run(id, step);
            return new Ticket(current, verifiedArtifact(id, current.get("input_digest")));
        });
    }

    private void recover(String boot, long now) {
        for (Map<String,String> r : db.query("SELECT * FROM runs WHERE state='running' AND (boot<>? OR deadline<=?)", boot, now)) {
            boolean exhausted = Integer.parseInt(r.get("attempt")) >= 3;
            db.execute("UPDATE runs SET state=?,token=NULL,boot=NULL,deadline=NULL,error='INTERRUPTED' WHERE work_id=? AND step=?", exhausted ? "needs_review" : "queued", r.get("work_id"), r.get("step"));
            event(r.get("work_id"), Integer.parseInt(r.get("step")), "interrupted");
        }
    }

    /** Result comes only from a transport that authenticated the expected tool UID. */
    public boolean finish(Ticket ticket, String outcome, String output, String boot, long elapsedMs) {
        if (!List.of("passed", "needs_review", "failed").contains(outcome))
            throw new IllegalArgumentException("INVALID_OUTCOME");
        if ("passed".equals(outcome)) bounded(output);
        return db.transaction(() -> {
            Map<String,String> r = run(ticket.workId, ticket.step);
            if (!"running".equals(r.get("state")) || !ticket.token.equals(r.get("token"))
                || !boot.equals(r.get("boot")) || elapsedMs < 0
                || elapsedMs >= Long.parseLong(r.get("deadline")) || paused()) return false;
            if (!"active".equals(work(ticket.workId).get("state"))) return false;
            boolean passed = "passed".equals(outcome) && "0".equals(work(ticket.workId).get("sample"));
            String finalState = passed ? "succeeded" : "failed".equals(outcome) ? "failed" : "needs_review";
            String outputHash = "passed".equals(outcome) ? artifact(ticket.workId, output) : null;
            db.execute("UPDATE runs SET state=?,output_digest=?,token=NULL,boot=NULL,deadline=NULL,error=? WHERE work_id=? AND step=?", finalState, outputHash, passed ? null : finalState.toUpperCase(java.util.Locale.ROOT), ticket.workId, ticket.step);
            if (passed && ticket.step == TOOLS.length - 1)
                db.execute("UPDATE works SET state='review' WHERE id=?", ticket.workId);
            else if (passed)
                db.execute("UPDATE runs SET state='queued',input_digest=? WHERE work_id=? AND step=? AND state='pending'", outputHash, ticket.workId, ticket.step + 1);
            // Output, state and next queue entry commit together; polling the queue is replay-safe.
            event(ticket.workId, ticket.step, finalState);
            return true;
        });
    }

    public void interrupt(Ticket ticket) {
        db.transaction(() -> {
            Map<String,String> r = run(ticket.workId, ticket.step);
            if ("running".equals(r.get("state")) && ticket.token.equals(r.get("token"))) {
                db.execute("UPDATE runs SET state=?,token=NULL,boot=NULL,deadline=NULL,error='INTERRUPTED' WHERE work_id=? AND step=?", ticket.attempt >= 3 ? "needs_review" : "queued", ticket.workId, ticket.step);
                event(ticket.workId, ticket.step, "interrupted");
            }
            return null;
        });
    }

    /** Broker stop for a claimed run whose prerequisite (for example its pinned model) is unusable. Never auto-retried. */
    public void hold(Ticket ticket, String reason) {
        if (reason == null || !reason.matches("[A-Z_]{1,40}")) throw new IllegalArgumentException("INVALID_HOLD_REASON");
        db.transaction(() -> {
            Map<String,String> r = run(ticket.workId, ticket.step);
            if ("running".equals(r.get("state")) && ticket.token.equals(r.get("token"))) {
                db.execute("UPDATE runs SET state='needs_review',token=NULL,boot=NULL,deadline=NULL,error=? WHERE work_id=? AND step=?", reason, ticket.workId, ticket.step);
                event(ticket.workId, ticket.step, "held");
            }
            return null;
        });
    }

    public void cancel(String workId) {
        db.transaction(() -> {
            String state = work(workId).get("state");
            if ("completed".equals(state)) throw new IllegalStateException("ALREADY_COMPLETED");
            if (!"cancelled".equals(state)) {
                db.execute("UPDATE works SET state='cancelled' WHERE id=?", workId);
                db.execute("UPDATE runs SET state='cancelled',token=NULL,boot=NULL,deadline=NULL WHERE work_id=? AND state<>'succeeded'", workId);
                event(workId, -1, "cancelled");
            }
            return null;
        });
    }

    public void setPaused(boolean paused) {
        db.transaction(() -> {
            db.execute("UPDATE settings SET paused=? WHERE id=1", paused ? 1 : 0);
            if (paused) for (Map<String,String> r : db.query("SELECT * FROM runs WHERE state='running'"))
                interrupt(new Ticket(r, ""));
            return null;
        });
    }

    public void complete(String id, String note) {
        if (note == null || note.trim().isEmpty() || note.length() > 1000)
            throw new IllegalArgumentException("REVIEW_NOTE_REQUIRED");
        db.transaction(() -> {
            if (!"review".equals(work(id).get("state"))) throw new IllegalStateException("NOT_READY_FOR_REVIEW");
            if (db.query("SELECT 1 FROM runs WHERE work_id=? AND state<>'succeeded'", id).size() != 0)
                throw new IllegalStateException("STEPS_INCOMPLETE");
            db.execute("UPDATE works SET state='completed',review_note=? WHERE id=?", note.trim(), id);
            event(id, -1, "completed"); return null;
        });
    }

    /** Explicit human retry, never called by automatic recovery. Successful steps stay immutable. */
    public void retry(String id) {
        db.transaction(() -> {
            Map<String,String> w = work(id);
            if (!"active".equals(w.get("state")) || !"0".equals(w.get("sample")))
                throw new IllegalStateException("RETRY_NOT_ALLOWED");
            List<Map<String,String>> stopped = db.query("SELECT step FROM runs WHERE work_id=? AND state IN('failed','needs_review')", id);
            if (stopped.size() != 1) throw new IllegalStateException("NO_FAILED_STEP");
            int step = Integer.parseInt(stopped.get(0).get("step"));
            db.execute("UPDATE runs SET state='queued',attempt=0,error=NULL,output_digest=NULL WHERE work_id=? AND step=?", id, step);
            event(id, step, "human_retry"); return null;
        });
    }

    public boolean paused() { return "1".equals(db.query("SELECT paused FROM settings WHERE id=1").get(0).get("paused")); }
    public List<Map<String,String>> list() { return db.query("SELECT id,state,sample FROM works ORDER BY rowid DESC"); }
    public Map<String,String> work(String id) { return one(db.query("SELECT * FROM works WHERE id=?", id)); }
    public List<Map<String,String>> runs(String id) { work(id); return db.query("SELECT * FROM runs WHERE work_id=? ORDER BY step", id); }
    public List<Map<String,String>> events(String id) { work(id); return db.query("SELECT seq,step,kind FROM events WHERE work_id=? ORDER BY seq", id); }
    public String result(String id) {
        Map<String,String> r = run(id, TOOLS.length - 1);
        if (!"succeeded".equals(r.get("state"))) throw new IllegalStateException("NO_FINAL_ARTIFACT");
        return verifiedArtifact(id, r.get("output_digest"));
    }
    private Map<String,String> run(String id, int step) { return one(db.query("SELECT * FROM runs WHERE work_id=? AND step=?", id, step)); }
    private static Map<String,String> one(List<Map<String,String>> rows) {
        if (rows.size() != 1) throw new IllegalArgumentException("NOT_FOUND");
        return rows.get(0);
    }
    private String artifact(String id, String body) {
        String hash = digest(body);
        db.execute("INSERT OR IGNORE INTO artifacts(work_id,digest,body) VALUES(?,?,?)", id, hash, body);
        if (!body.equals(verifiedArtifact(id, hash))) throw new IllegalStateException("ARTIFACT_COLLISION");
        return hash;
    }
    private String verifiedArtifact(String id, String hash) {
        String body = one(db.query("SELECT body FROM artifacts WHERE work_id=? AND digest=?", id, hash)).get("body");
        if (!digest(body).equals(hash)) throw new IllegalStateException("ARTIFACT_CORRUPT");
        return body;
    }
    private void event(String id, int step, String kind) { db.execute("INSERT INTO events(work_id,step,kind) VALUES(?,?,?)", id, step, kind); }
}
