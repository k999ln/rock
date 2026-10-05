package dev.rock.core;

import dev.rock.core.platform.PlatformStore;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/** Prototype: one Android user/database, two pinned local transforms, no external effects. */
public final class Engine {
    public static final int SCHEMA_VERSION = 3;
    public static final int MAX_BYTES = 32 * 1024;
    public static final int MAX_WORKS = 100;
    public static final long LEASE_MS = 60_000;
    public static final String RECIPE = "article-preparation@1";
    private static final String[] TOOLS = {"citations@1", "free-article@1"};
    private final Database db;

    public static final class Ticket {
        public final String workId, token, tool, input, boot;
        public final String modelProfileId;
        public final long modelProfileVersion, modelActivationGeneration;
        public final int step, attempt;
        public final long deadline;
        Ticket(Map<String,String> row, String input) {
            workId = row.get("work_id"); token = row.get("token"); tool = row.get("tool");
            boot = row.get("boot"); step = Integer.parseInt(row.get("step"));
            attempt = Integer.parseInt(row.get("attempt")); deadline = Long.parseLong(row.get("deadline"));
            modelProfileId = row.get("model_profile_id");
            modelProfileVersion = row.get("model_profile_version") == null ? 0 : Long.parseLong(row.get("model_profile_version"));
            modelActivationGeneration = row.get("model_activation_generation") == null ? 0 : Long.parseLong(row.get("model_activation_generation"));
            this.input = input;
        }
    }

    /** Owner/job binding created before Local AI is called. */
    public static final class ModelProfilePin {
        public final String owner, workId, requestDigest, profileId;
        public final long profileVersion, activationGeneration;
        public final String manifestDigest, weightsSha256, tokenizerSha256, templateSha256;
        public final String runtimeComponentId, runtimeManifestDigest, runtimeSigningDigest;
        public final String format, quantization, planSchemaId;
        public final long runtimeVersionCode, artifactBytes, minRamBytes;
        public final int runtimeApiMin, runtimeApiMax, contextTokens;
        public final int runtimeManifestApiMin, runtimeManifestApiMax;
        private ModelProfilePin(String owner, String workId, String requestDigest, Map<String,String> row) {
            this.owner = owner; this.workId = workId; this.requestDigest = requestDigest;
            profileId = row.get("profile_id"); profileVersion = Long.parseLong(row.get("profile_version"));
            activationGeneration = Long.parseLong(row.get("activation_generation"));
            manifestDigest = row.get("manifest_digest"); weightsSha256 = row.get("weights_sha256");
            tokenizerSha256 = row.get("tokenizer_sha256"); templateSha256 = row.get("template_sha256");
            runtimeComponentId = row.get("runtime_component_id");
            runtimeManifestDigest = row.get("runtime_manifest_digest");
            runtimeSigningDigest = row.get("runtime_signing_digest");
            runtimeVersionCode = Long.parseLong(row.get("runtime_version_code"));
            runtimeApiMin = Integer.parseInt(row.get("runtime_api_min"));
            runtimeApiMax = Integer.parseInt(row.get("runtime_api_max"));
            runtimeManifestApiMin = Integer.parseInt(row.get("runtime_manifest_api_min"));
            runtimeManifestApiMax = Integer.parseInt(row.get("runtime_manifest_api_max"));
            format = row.get("format"); quantization = row.get("quantization");
            contextTokens = Integer.parseInt(row.get("context_tokens"));
            planSchemaId = row.get("plan_schema_id"); artifactBytes = Long.parseLong(row.get("artifact_bytes"));
            minRamBytes = Long.parseLong(row.get("min_ram_bytes"));
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
                db.execute("INSERT INTO rock_meta VALUES(2)");
                db.execute("DROP TABLE rock_meta_v1");
                db.execute("CREATE TABLE sky_selection(id INTEGER PRIMARY KEY CHECK(id=1),selection_token TEXT NOT NULL UNIQUE,tool_id TEXT NOT NULL CHECK(tool_id='article-preparation@1'),revision INTEGER NOT NULL CHECK(revision>=1))");
                version = 2;
            }
            if (version == 2) {
                db.execute("ALTER TABLE works ADD COLUMN model_profile_id TEXT");
                db.execute("ALTER TABLE works ADD COLUMN model_profile_version INTEGER CHECK(model_profile_version IS NULL OR model_profile_version>=1)");
                db.execute("ALTER TABLE works ADD COLUMN model_activation_generation INTEGER CHECK(model_activation_generation IS NULL OR model_activation_generation>=1)");
                db.execute("CREATE TRIGGER works_model_pin_insert BEFORE INSERT ON works WHEN NOT ((NEW.model_profile_id IS NULL AND NEW.model_profile_version IS NULL AND NEW.model_activation_generation IS NULL) OR (NEW.model_profile_id IS NOT NULL AND NEW.model_profile_version IS NOT NULL AND NEW.model_activation_generation IS NOT NULL)) BEGIN SELECT RAISE(ABORT,'MODEL_PROFILE_PIN_INCOMPLETE'); END");
                db.execute("CREATE TRIGGER works_model_pin_update BEFORE UPDATE OF model_profile_id,model_profile_version,model_activation_generation ON works WHEN NOT ((NEW.model_profile_id IS NULL AND NEW.model_profile_version IS NULL AND NEW.model_activation_generation IS NULL) OR (NEW.model_profile_id IS NOT NULL AND NEW.model_profile_version IS NOT NULL AND NEW.model_activation_generation IS NOT NULL)) BEGIN SELECT RAISE(ABORT,'MODEL_PROFILE_PIN_INCOMPLETE'); END");
                db.execute("UPDATE rock_meta SET version=?", SCHEMA_VERSION);
                version = SCHEMA_VERSION;
            }
            if (version != SCHEMA_VERSION)
                throw new IllegalStateException("UNSUPPORTED_DATABASE_VERSION");
            return null;
        });
        // Ensure the Broker's model/profile registry exists before any Engine method can read pins.
        new PlatformStore(db);
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

    /** Read-only list of the pinned Tool versions of RECIPE, for the Broker capability observation. */
    public static List<String> toolIds() { return java.util.Collections.unmodifiableList(java.util.Arrays.asList(TOOLS.clone())); }

    public static String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder s = new StringBuilder();
            for (byte b : bytes) s.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
            return s.toString();
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private static String modelWorkId(String owner, String requestKey) {
        return UUID.nameUUIDFromBytes(("rockstaros-work-v1\n" + owner + "\n" + requestKey).getBytes(StandardCharsets.UTF_8)).toString();
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

    /** Allocate a stable work identity and pin the active profile before invoking the local planner. */
    public ModelProfilePin prepareModelProfilePin(String owner, String requestKey, String requestDigest, long now) {
        if (owner == null || !owner.matches("[A-Za-z0-9:_-]{3,128}")) throw new IllegalArgumentException("INVALID_OWNER");
        if (requestKey == null || !requestKey.matches("[A-Za-z0-9_-]{1,80}")) throw new IllegalArgumentException("INVALID_REQUEST_KEY");
        if (requestDigest == null || !requestDigest.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("INVALID_REQUEST_DIGEST");
        if (now < 0) throw new IllegalArgumentException("INVALID_CLOCK");
        String workId = modelWorkId(owner, requestKey);
        PlatformStore store = new PlatformStore(db);
        store.pinModelProfile(owner, workId, requestDigest, now);
        Map<String,String> profile = store.modelProfileForPin(owner, workId);
        return new ModelProfilePin(owner, workId, requestDigest, profile);
    }

    /** Commits the result under the exact profile pinned before inference. */
    public String submitPinned(ModelProfilePin pin, String requestKey, String input, boolean sample, boolean consent) {
        if (pin == null) throw new SecurityException("MODEL_PROFILE_PIN_REQUIRED");
        if (!consent) throw new SecurityException("LOCAL_ARTIFACT_CONSENT_REQUIRED");
        if (requestKey == null || !requestKey.matches("[A-Za-z0-9_-]{1,80}")) throw new IllegalArgumentException("INVALID_REQUEST_KEY");
        if (!pin.workId.equals(modelWorkId(pin.owner, requestKey))) throw new SecurityException("MODEL_PROFILE_PIN_REQUEST_MISMATCH");
        bounded(input);
        String requestHash = digest(RECIPE + "\n" + sample + "\n" + pin.requestDigest + "\n" + input);
        return db.transaction(() -> {
            Map<String,String> pinRow = one(db.query("SELECT p.*,m.status,m.verified_receipt_digest FROM model_profile_job_pins p JOIN model_profiles m ON m.profile_id=p.profile_id AND m.version=p.profile_version WHERE p.owner=? AND p.work_id=?",
                pin.owner, pin.workId), "MODEL_PROFILE_PIN_NOT_FOUND");
            if (!pin.requestDigest.equals(pinRow.get("request_digest")) || !pin.profileId.equals(pinRow.get("profile_id"))
                || pin.profileVersion != Long.parseLong(pinRow.get("profile_version"))
                || pin.activationGeneration != Long.parseLong(pinRow.get("activation_generation")))
                throw new SecurityException("MODEL_PROFILE_PIN_MISMATCH");
            if ("REVOKED".equals(pinRow.get("status"))) throw new SecurityException("MODEL_PROFILE_PIN_REVOKED");
            if (!("ACTIVE".equals(pinRow.get("status")) || "CACHED".equals(pinRow.get("status")))
                || pinRow.get("verified_receipt_digest") == null) throw new SecurityException("MODEL_PROFILE_PIN_UNVERIFIED");
            List<Map<String,String>> old = db.query("SELECT id,request_hash,model_profile_id,model_profile_version,model_activation_generation FROM works WHERE request_key=?", requestKey);
            if (!old.isEmpty()) {
                Map<String,String> work = old.get(0);
                if (!requestHash.equals(work.get("request_hash")) || !pin.workId.equals(work.get("id"))
                    || !pin.profileId.equals(work.get("model_profile_id"))
                    || pin.profileVersion != Long.parseLong(work.get("model_profile_version"))
                    || pin.activationGeneration != Long.parseLong(work.get("model_activation_generation")))
                    throw new IllegalStateException("REQUEST_PROFILE_CONFLICT");
                return work.get("id");
            }
            if (!db.query("SELECT 1 FROM works WHERE id=?", pin.workId).isEmpty()) throw new IllegalStateException("WORK_ID_CONFLICT");
            if (Integer.parseInt(db.query("SELECT count(*) AS n FROM works").get(0).get("n")) >= MAX_WORKS)
                throw new IllegalStateException("WORK_LIMIT_REACHED");
            db.execute("INSERT INTO works(id,request_key,request_hash,state,sample,model_profile_id,model_profile_version,model_activation_generation) VALUES(?,?,?,'active',?,?,?,?)",
                pin.workId, requestKey, requestHash, sample ? 1 : 0, pin.profileId, pin.profileVersion, pin.activationGeneration);
            String inputHash = artifact(pin.workId, input);
            for (int step = 0; step < TOOLS.length; step++)
                db.execute("INSERT INTO runs(work_id,step,tool,state,input_digest) VALUES(?,?,?,?,?)", pin.workId, step,
                    TOOLS[step], step == 0 ? "queued" : "pending", step == 0 ? inputHash : null);
            event(pin.workId, -1, "submitted");
            return pin.workId;
        });
    }

    /** Reuses only the exact owner/request/profile pin, avoiding a second inference on retries. */
    public String existingPinnedWorkId(String owner, String requestKey, String requestDigest) {
        if (owner == null || !owner.matches("[A-Za-z0-9:_-]{3,128}")) throw new IllegalArgumentException("INVALID_OWNER");
        if (requestKey == null || !requestKey.matches("[A-Za-z0-9_-]{1,80}")) throw new IllegalArgumentException("INVALID_REQUEST_KEY");
        if (requestDigest == null || !requestDigest.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("INVALID_REQUEST_DIGEST");
        List<Map<String,String>> rows = db.query("SELECT w.id,w.model_profile_id,w.model_profile_version,w.model_activation_generation,"
            + "p.request_digest,p.profile_id,p.profile_version,p.activation_generation FROM works w "
            + "LEFT JOIN model_profile_job_pins p ON p.owner=? AND p.work_id=w.id WHERE w.request_key=?", owner, requestKey);
        if (rows.size() > 1) throw new IllegalStateException("DUPLICATE_REQUEST_KEY");
        if (rows.isEmpty()) return null;
        Map<String,String> work = rows.get(0);
        String expectedWorkId = modelWorkId(owner, requestKey);
        if (!expectedWorkId.equals(work.get("id")) || work.get("request_digest") == null
                || !requestDigest.equals(work.get("request_digest"))
                || work.get("model_profile_id") == null
                || !Objects.equals(work.get("profile_id"), work.get("model_profile_id"))
                || !Objects.equals(work.get("model_profile_version"), work.get("profile_version"))
                || !Objects.equals(work.get("model_activation_generation"), work.get("activation_generation")))
            throw new SecurityException("REQUEST_PROFILE_CONFLICT");
        return work.get("id");
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
            for (Map<String,String> unavailable : db.query("SELECT DISTINCT w.id,w.model_profile_id,w.model_profile_version FROM works w JOIN runs r ON r.work_id=w.id LEFT JOIN model_profiles p ON p.profile_id=w.model_profile_id AND p.version=w.model_profile_version WHERE w.state='active' AND r.state IN('queued','pending') AND w.model_profile_id IS NOT NULL AND (p.status IS NULL OR p.status NOT IN('ACTIVE','CACHED') OR p.verified_receipt_digest IS NULL)")) {
                db.execute("UPDATE runs SET state='needs_review',error='MODEL_PROFILE_UNAVAILABLE' WHERE work_id=? AND state IN('queued','pending')", unavailable.get("id"));
                db.execute("UPDATE works SET state='review',review_note='Pinned local model profile is unavailable; replan explicitly.' WHERE id=? AND state='active'", unavailable.get("id"));
                event(unavailable.get("id"), -1, "model_profile_unavailable");
            }
            List<Map<String,String>> rows = db.query("SELECT r.*,w.model_profile_id,w.model_profile_version,w.model_activation_generation FROM runs r JOIN works w ON w.id=r.work_id WHERE r.state='queued' AND w.state='active' ORDER BY w.rowid,r.step LIMIT 1");
            if (rows.isEmpty()) return null;
            Map<String,String> r = rows.get(0);
            String id = r.get("work_id"); int step = Integer.parseInt(r.get("step"));
            db.execute("UPDATE runs SET state='running',attempt=attempt+1,token=?,boot=?,deadline=?,error=NULL WHERE work_id=? AND step=? AND state='queued'", UUID.randomUUID().toString(), bootId, elapsedMs + LEASE_MS, id, step);
            event(id, step, "started");
            Map<String,String> current = one(db.query("SELECT r.*,w.model_profile_id,w.model_profile_version,w.model_activation_generation "
                + "FROM runs r JOIN works w ON w.id=r.work_id WHERE r.work_id=? AND r.step=?", id, step));
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
            Map<String,String> work = work(ticket.workId);
            if (!"active".equals(work.get("state"))) return false;
            String storedProfileId = work.get("model_profile_id");
            if ((storedProfileId == null) != (ticket.modelProfileId == null)
                || (storedProfileId != null && (!storedProfileId.equals(ticket.modelProfileId)
                    || Long.parseLong(work.get("model_profile_version")) != ticket.modelProfileVersion
                    || Long.parseLong(work.get("model_activation_generation")) != ticket.modelActivationGeneration))) return false;
            if (storedProfileId != null) {
                List<Map<String,String>> profile = db.query("SELECT status,verified_receipt_digest FROM model_profiles WHERE profile_id=? AND version=?",
                    storedProfileId, ticket.modelProfileVersion);
                if (profile.size() != 1 || !("ACTIVE".equals(profile.get(0).get("status")) || "CACHED".equals(profile.get(0).get("status")))
                    || profile.get(0).get("verified_receipt_digest") == null) {
                    db.execute("UPDATE runs SET state='needs_review',token=NULL,boot=NULL,deadline=NULL,error='MODEL_PROFILE_UNAVAILABLE' WHERE work_id=? AND step=? AND state='running'", ticket.workId, ticket.step);
                    db.execute("UPDATE works SET state='review',review_note='Pinned local model profile became unavailable; replan explicitly.' WHERE id=? AND state='active'", ticket.workId);
                    event(ticket.workId, ticket.step, "model_profile_unavailable");
                    return false;
                }
            }
            boolean passed = "passed".equals(outcome) && "0".equals(work.get("sample"));
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
    private static Map<String,String> one(List<Map<String,String>> rows, String error) {
        if (rows.size() != 1) throw new IllegalStateException(error);
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
