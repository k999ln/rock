package dev.rock.core;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Broker-owned ModelProfile registry and work pinning for the single installed runtime adapter
 * (docs/ai-native-os-architecture.md section 2). Host/fixture stage: it is not wired to
 * LocalAiConnection, does not download or load weights, and is not device or OS-image evidence.
 *
 * Rules fixed here:
 * - stage: only a profile compatible with the adapter (runtime API, format, plan schema) is accepted;
 *   the same profile ID with different content is rejected.
 * - activate: only after a passed isolation test; the active generation pointer switches atomically.
 * - health failure rolls back to the previous checked profile; revoked/rejected profiles are never
 *   rollback targets and the model becomes unavailable instead.
 * - every new work pins the healthy active profile; claim/finish keep that pin across restarts and
 *   later switches, and a result reported under any other profile is refused.
 * - a pinned profile is never retired; a revoked pin stops the work, and continuing requires an
 *   explicit replan that creates a new revision under the current profile.
 */
public final class ModelProfiles {
    public static final int SCHEMA_VERSION = 1;
    private final Database db;
    private final Engine engine;
    private final int runtimeApi;
    private final Set<String> runtimeFormats;
    private final String runtimePlanSchema;

    /** Work claimed together with the profile it is pinned to. */
    public static final class PinnedTicket {
        public final Engine.Ticket ticket;
        public final ModelProfile profile;
        public final int revision;
        PinnedTicket(Engine.Ticket ticket, ModelProfile profile, int revision) {
            this.ticket = ticket; this.profile = profile; this.revision = revision;
        }
    }

    public ModelProfiles(Database db, Engine engine, int runtimeApi, Set<String> runtimeFormats, String runtimePlanSchema) {
        if (db == null || engine == null || runtimeApi < 1 || runtimeFormats == null || runtimeFormats.isEmpty()
            || runtimePlanSchema == null || runtimePlanSchema.isEmpty())
            throw new IllegalArgumentException("INVALID_RUNTIME_ADAPTER");
        this.db = db; this.engine = engine; this.runtimeApi = runtimeApi;
        this.runtimeFormats = Collections.unmodifiableSet(new LinkedHashSet<>(runtimeFormats));
        this.runtimePlanSchema = runtimePlanSchema;
        migrate();
    }

    private void migrate() {
        db.transaction(() -> {
            if (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='model_meta'").isEmpty()) {
                db.execute("CREATE TABLE model_meta(version INTEGER NOT NULL CHECK(version>=1))");
                db.execute("INSERT INTO model_meta VALUES(?)", SCHEMA_VERSION);
                db.execute("CREATE TABLE model_profiles(profile_id TEXT PRIMARY KEY,digest TEXT NOT NULL,model_id TEXT NOT NULL,version TEXT NOT NULL,weights_sha256 TEXT NOT NULL,tokenizer_sha256 TEXT NOT NULL,chat_template_sha256 TEXT NOT NULL,license TEXT NOT NULL,runtime_api_min INTEGER NOT NULL,runtime_api_max INTEGER NOT NULL,quantization TEXT NOT NULL,format TEXT NOT NULL,context_tokens INTEGER NOT NULL,plan_schema TEXT NOT NULL,required_ram_bytes INTEGER NOT NULL,required_storage_bytes INTEGER NOT NULL,measured_on TEXT NOT NULL,quality_result TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('STAGED','READY','REJECTED','REVOKED','RETIRED')))");
                db.execute("CREATE TABLE model_pointer(id INTEGER PRIMARY KEY CHECK(id=1),profile_id TEXT REFERENCES model_profiles(profile_id),previous_id TEXT REFERENCES model_profiles(profile_id),generation INTEGER NOT NULL CHECK(generation>=0),health TEXT NOT NULL CHECK(health IN('NONE','PENDING','HEALTHY')))");
                db.execute("INSERT INTO model_pointer(id,profile_id,previous_id,generation,health) VALUES(1,NULL,NULL,0,'NONE')");
                db.execute("CREATE TABLE model_pins(work_id TEXT PRIMARY KEY REFERENCES works(id),profile_id TEXT NOT NULL REFERENCES model_profiles(profile_id),profile_digest TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),replaces_work_id TEXT UNIQUE REFERENCES works(id))");
                db.execute("CREATE TABLE model_journal(seq INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,profile_id TEXT,work_id TEXT,generation INTEGER NOT NULL)");
            }
            List<Map<String,String>> meta = db.query("SELECT version FROM model_meta");
            if (meta.size() != 1 || Integer.parseInt(meta.get(0).get("version")) != SCHEMA_VERSION)
                throw new IllegalStateException("UNSUPPORTED_MODEL_SCHEMA");
            return null;
        });
    }

    /** Download/hash/license are the stager's job; the Broker re-checks content and adapter compatibility. */
    public void stage(ModelProfile profile) {
        if (!profile.compatibleWith(runtimeApi, runtimeFormats, runtimePlanSchema))
            throw new IllegalArgumentException("INCOMPATIBLE_MODEL_PROFILE");
        db.transaction(() -> {
            List<Map<String,String>> old = db.query("SELECT digest FROM model_profiles WHERE profile_id=?", profile.id());
            if (!old.isEmpty()) {
                if (!profile.digest().equals(old.get(0).get("digest"))) throw new IllegalStateException("MODEL_PROFILE_CONFLICT");
                return null;
            }
            db.execute("INSERT INTO model_profiles(profile_id,digest,model_id,version,weights_sha256,tokenizer_sha256,chat_template_sha256,license,runtime_api_min,runtime_api_max,quantization,format,context_tokens,plan_schema,required_ram_bytes,required_storage_bytes,measured_on,quality_result,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'STAGED')",
                profile.id(), profile.digest(), profile.modelId, profile.version, profile.weightsSha256, profile.tokenizerSha256,
                profile.chatTemplateSha256, profile.license, profile.runtimeApiMin, profile.runtimeApiMax, profile.quantization,
                profile.format, profile.contextTokens, profile.planSchema, profile.requiredRamBytes, profile.requiredStorageBytes,
                profile.measuredOn, profile.qualityResult);
            journal("staged", profile.id(), null);
            return null;
        });
    }

    /** Result of the isolated test run; only a STAGED profile can move to READY or REJECTED. */
    public void recordIsolationTest(String profileId, boolean passed) {
        db.transaction(() -> {
            if (!"STAGED".equals(state(profileId))) throw new IllegalStateException("MODEL_PROFILE_NOT_STAGED");
            db.execute("UPDATE model_profiles SET state=? WHERE profile_id=?", passed ? "READY" : "REJECTED", profileId);
            journal(passed ? "isolation_passed" : "isolation_failed", profileId, null);
            return null;
        });
    }

    /** Atomic pointer switch. Running and queued works keep their existing pins. */
    public int activate(String profileId) {
        return db.transaction(() -> {
            if (!"READY".equals(state(profileId))) throw new IllegalStateException("MODEL_PROFILE_NOT_READY");
            ModelProfile profile = verified(profileId);
            if (!profile.compatibleWith(runtimeApi, runtimeFormats, runtimePlanSchema))
                throw new IllegalStateException("INCOMPATIBLE_MODEL_PROFILE");
            Map<String,String> p = pointer();
            if ("PENDING".equals(p.get("health"))) throw new IllegalStateException("MODEL_SWITCH_PENDING");
            if (profileId.equals(p.get("profile_id"))) return Integer.parseInt(p.get("generation"));
            int generation = Integer.parseInt(p.get("generation")) + 1;
            db.execute("UPDATE model_pointer SET previous_id=?,profile_id=?,generation=?,health='PENDING' WHERE id=1", p.get("profile_id"), profileId, generation);
            journal("activated", profileId, null);
            return generation;
        });
    }

    /** Health check after a switch. Failure returns to the previous checked profile or leaves no model. */
    public String confirmHealth(boolean healthy) {
        return db.transaction(() -> {
            Map<String,String> p = pointer();
            if (!"PENDING".equals(p.get("health"))) throw new IllegalStateException("NO_PENDING_MODEL_SWITCH");
            String current = p.get("profile_id");
            int generation = Integer.parseInt(p.get("generation")) + 1;
            if (healthy) {
                db.execute("UPDATE model_pointer SET health='HEALTHY' WHERE id=1");
                journal("health_passed", current, null);
                return current;
            }
            db.execute("UPDATE model_profiles SET state='REJECTED' WHERE profile_id=? AND state='READY'", current);
            journal("health_failed", current, null);
            String previous = p.get("previous_id");
            if (previous != null && "READY".equals(state(previous))) {
                verified(previous);
                db.execute("UPDATE model_pointer SET profile_id=?,previous_id=NULL,generation=?,health='HEALTHY' WHERE id=1", previous, generation);
                journal("rolled_back", previous, null);
                return previous;
            }
            db.execute("UPDATE model_pointer SET profile_id=NULL,previous_id=NULL,generation=?,health='NONE' WHERE id=1", generation);
            journal("model_unavailable", null, null);
            return null;
        });
    }

    /** Revocation never falls back automatically; works pinned to it stop at their next claim. */
    public void revoke(String profileId) {
        db.transaction(() -> {
            state(profileId);
            db.execute("UPDATE model_profiles SET state='REVOKED' WHERE profile_id=?", profileId);
            Map<String,String> p = pointer();
            int generation = Integer.parseInt(p.get("generation"));
            if (profileId.equals(p.get("profile_id"))) {
                generation++;
                db.execute("UPDATE model_pointer SET profile_id=NULL,previous_id=NULL,generation=?,health='NONE' WHERE id=1", generation);
            } else if (profileId.equals(p.get("previous_id"))) {
                db.execute("UPDATE model_pointer SET previous_id=NULL WHERE id=1");
            }
            journal("revoked", profileId, null);
            return null;
        });
    }

    /** Retirement (weights may then be removed) is refused while any unfinished work is pinned. */
    public void retire(String profileId) {
        db.transaction(() -> {
            String state = state(profileId);
            Map<String,String> p = pointer();
            if (profileId.equals(p.get("profile_id"))) throw new IllegalStateException("MODEL_PROFILE_ACTIVE");
            if (!db.query("SELECT 1 FROM model_pins m JOIN works w ON w.id=m.work_id WHERE m.profile_id=? AND w.state IN('active','review') LIMIT 1", profileId).isEmpty())
                throw new IllegalStateException("MODEL_PROFILE_PINNED");
            if ("REVOKED".equals(state)) return null;            // revocation stays visible; never downgraded
            if (!"RETIRED".equals(state)) {
                db.execute("UPDATE model_profiles SET state='RETIRED' WHERE profile_id=?", profileId);
                if (profileId.equals(p.get("previous_id"))) db.execute("UPDATE model_pointer SET previous_id=NULL WHERE id=1");
                journal("retired", profileId, null);
            }
            return null;
        });
    }

    /** New work pins the healthy active profile; an idempotent resubmission keeps its original pin. */
    public String submit(String requestKey, String input, boolean sample, boolean consent) {
        return db.transaction(() -> {
            String existing = engine.existingWorkId(requestKey);
            if (existing != null) {
                engine.submit(requestKey, input, sample, consent);
                pin(existing);
                return existing;
            }
            String profileId = healthyActive();
            String id = engine.submit(requestKey, input, sample, consent);
            db.execute("INSERT INTO model_pins(work_id,profile_id,profile_digest,revision,replaces_work_id) VALUES(?,?,?,1,NULL)", id, profileId, verified(profileId).digest());
            journal("pinned", profileId, id);
            return id;
        });
    }

    /** Claims the next run with its pinned profile; runs whose pin is unusable are stopped for review. */
    public PinnedTicket claim(String bootId, long elapsedMs, boolean charging) {
        return db.transaction(() -> {
            while (true) {
                Engine.Ticket ticket = engine.claim(bootId, elapsedMs, charging);
                if (ticket == null) return null;
                Map<String,String> pin = pinRow(ticket.workId);
                if (pin == null) { stop(ticket, "MODEL_PIN_MISSING", null); continue; }
                String profileId = pin.get("profile_id");
                if (!usable(profileId, pin.get("profile_digest"))) { stop(ticket, "MODEL_PROFILE_UNAVAILABLE", profileId); continue; }
                return new PinnedTicket(ticket, verified(profileId), Integer.parseInt(pin.get("revision")));
            }
        });
    }

    /** Accepts a result only from the pinned profile; any other profile is refused without a state change. */
    public boolean finish(PinnedTicket claimed, String executedProfileId, String outcome, String output, String bootId, long elapsedMs) {
        return db.transaction(() -> {
            Map<String,String> pin = pinRow(claimed.ticket.workId);
            if (pin == null || !pin.get("profile_id").equals(claimed.profile.id()) || !claimed.profile.id().equals(executedProfileId))
                throw new SecurityException("MODEL_PROFILE_MISMATCH");
            if (!usable(executedProfileId, pin.get("profile_digest"))) {
                stop(claimed.ticket, "MODEL_PROFILE_UNAVAILABLE", executedProfileId);
                return false;
            }
            return engine.finish(claimed.ticket, outcome, output, bootId, elapsedMs);
        });
    }

    /** Explicit replan of a work whose pinned profile was revoked: new revision under the current profile. */
    public String replan(String workId, String newRequestKey, String input, boolean consent) {
        return db.transaction(() -> {
            Map<String,String> old = pin(workId);
            if (!"REVOKED".equals(state(old.get("profile_id")))) throw new IllegalStateException("REPLAN_NOT_REQUIRED");
            if (!"active".equals(engine.work(workId).get("state"))) throw new IllegalStateException("REPLAN_NOT_ALLOWED");
            if (engine.existingWorkId(newRequestKey) != null) throw new IllegalStateException("REQUEST_CONFLICT");
            String profileId = healthyActive();
            engine.cancel(workId);
            String id = engine.submit(newRequestKey, input, false, consent);
            db.execute("INSERT INTO model_pins(work_id,profile_id,profile_digest,revision,replaces_work_id) VALUES(?,?,?,?,?)",
                id, profileId, verified(profileId).digest(), Integer.parseInt(old.get("revision")) + 1, workId);
            journal("replanned", profileId, id);
            return id;
        });
    }

    /** Plan schema of the single installed runtime adapter (read-only, for capability observation). */
    public String runtimePlanSchema() { return runtimePlanSchema; }
    /** The active profile only when its switch was confirmed healthy; otherwise null. */
    public String healthyActiveProfileId() {
        Map<String,String> p = pointer();
        return "HEALTHY".equals(p.get("health")) ? p.get("profile_id") : null;
    }
    public ModelProfile pinnedProfile(String workId) { return verified(pin(workId).get("profile_id")); }
    public int revision(String workId) { return Integer.parseInt(pin(workId).get("revision")); }
    public String activeProfileId() { return pointer().get("profile_id"); }
    public String health() { return pointer().get("health"); }
    public int generation() { return Integer.parseInt(pointer().get("generation")); }
    public String profileState(String profileId) { return state(profileId); }
    public List<Map<String,String>> journal() { return db.query("SELECT seq,kind,profile_id,work_id,generation FROM model_journal ORDER BY seq"); }

    private String healthyActive() {
        Map<String,String> p = pointer();
        String id = p.get("profile_id");
        if (id == null) throw new IllegalStateException("MODEL_UNAVAILABLE");
        if (!"HEALTHY".equals(p.get("health"))) throw new IllegalStateException("MODEL_SWITCH_PENDING");
        return id;
    }
    private boolean usable(String profileId, String pinnedDigest) {
        List<Map<String,String>> rows = db.query("SELECT state,digest FROM model_profiles WHERE profile_id=?", profileId);
        if (rows.size() != 1 || !"READY".equals(rows.get(0).get("state"))) return false;
        try {
            return pinnedDigest.equals(rows.get(0).get("digest")) && pinnedDigest.equals(verified(profileId).digest());
        } catch (IllegalArgumentException | IllegalStateException corrupt) {
            return false;                                     // a tampered row stops the work instead of blocking the queue
        }
    }
    private void stop(Engine.Ticket ticket, String reason, String profileId) {
        engine.hold(ticket, reason);
        journal("work_stopped_" + reason.toLowerCase(java.util.Locale.ROOT), profileId, ticket.workId);
    }
    private Map<String,String> pinRow(String workId) {
        List<Map<String,String>> rows = db.query("SELECT * FROM model_pins WHERE work_id=?", workId);
        return rows.isEmpty() ? null : rows.get(0);
    }
    private Map<String,String> pin(String workId) {
        Map<String,String> row = pinRow(workId);
        if (row == null) throw new IllegalStateException("MODEL_PIN_MISSING");
        return row;
    }
    private String state(String profileId) {
        List<Map<String,String>> rows = db.query("SELECT state FROM model_profiles WHERE profile_id=?", profileId);
        if (rows.size() != 1) throw new IllegalArgumentException("UNKNOWN_MODEL_PROFILE");
        return rows.get(0).get("state");
    }
    private ModelProfile verified(String profileId) {
        List<Map<String,String>> rows = db.query("SELECT * FROM model_profiles WHERE profile_id=?", profileId);
        if (rows.size() != 1) throw new IllegalArgumentException("UNKNOWN_MODEL_PROFILE");
        ModelProfile profile = ModelProfile.fromRow(rows.get(0));
        if (!profile.id().equals(profileId) || !profile.digest().equals(rows.get(0).get("digest")))
            throw new IllegalStateException("MODEL_PROFILE_CORRUPT");
        return profile;
    }
    private Map<String,String> pointer() {
        List<Map<String,String>> rows = db.query("SELECT * FROM model_pointer WHERE id=1");
        if (rows.size() != 1) throw new IllegalStateException("MODEL_POINTER_CORRUPT");
        return rows.get(0);
    }
    private void journal(String kind, String profileId, String workId) {
        db.execute("INSERT INTO model_journal(kind,profile_id,work_id,generation) VALUES(?,?,?,?)", kind, profileId, workId, generation());
    }
}
