package dev.rock.core;

import dev.rock.core.ExternalWriteOutbox.Effect;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Host/fixture OS-side Sky capability negotiation and single executor device
 * (docs/ai-native-os-architecture.md section 5 and the "Sky/Zema初期" completion row).
 * Capability response fields follow the design:
 * protocolVersion, deviceRef, coreApiRange, toolVersions, planSchemas, effects, storageSchemaRange, modelProfiles, limits, connectivity, observedAt, expiresAt, generation
 * Not wired to Sky UI, Zema, AIDL, a remote gateway or multi-device handoff.
 *
 * Rules fixed here:
 * - The capability is observed by the Broker from local state (Engine, ModelProfiles, outbox availability) and
 *   bound to the owner and this device; nothing declared by an app is accepted as capability.
 * - Tool requirements are Broker-held manifests. Only the intersection of requirement and observation is
 *   executable; an unknown required capability, a stale observation (expired or clock moved back) or a
 *   range mismatch makes the Tool non-executable, with reasons.
 * - The check runs at selection, at submit and at claim. A claimed run that fails it is held for review.
 * - One executor device per owner; each work is bound to one authority device and writer epoch and is never
 *   moved to another device automatically. Selection and designation use expected-revision updates.
 * - After snapshot restore the old selection token is dead (PlatformStore rotates it), the executor needs the
 *   owner's re-designation, and the selection needs a fresh observation and re-selection.
 */
public final class SkyExecutor {
    public static final int SCHEMA_VERSION = 1;
    public static final int PROTOCOL_VERSION = 1;
    public static final Range CORE_API = new Range(1, 1);
    public static final long OBSERVATION_TTL_MS = 5 * 60_000L;
    public static final Set<String> KNOWN_CAPABILITIES = Collections.unmodifiableSet(new TreeSet<>(Arrays.asList(
        "protocolVersion", "deviceRef", "coreApiRange", "toolVersions", "planSchemas", "effects", "storageSchemaRange",
        "modelProfiles", "limits", "connectivity", "observedAt", "expiresAt", "generation")));
    public enum Connectivity { OFFLINE, ONLINE }

    public static final class Range {
        public final int min, max;
        public Range(int min, int max) {
            if (min < 1 || max < min) throw new IllegalArgumentException("INVALID_RANGE");
            this.min = min; this.max = max;
        }
        boolean overlaps(Range other) { return min <= other.max && other.min <= max; }
        @Override public String toString() { return min + "-" + max; }
        static Range parse(String s) { String[] p = s.split("-"); return new Range(Integer.parseInt(p[0]), Integer.parseInt(p[1])); }
    }

    /** Broker observation of what this device can run now. */
    public static final class Capability {
        public final int protocolVersion;
        public final String owner, deviceRef;
        public final Range coreApiRange, storageSchemaRange;
        public final Set<String> toolVersions, planSchemas, modelProfiles;
        public final Set<Effect> effects;
        public final long maxInputBytes, maxWorks, observedAt, expiresAt, generation;
        public final Connectivity connectivity;
        Capability(Map<String,String> r) {
            protocolVersion = Integer.parseInt(r.get("protocol_version")); owner = r.get("owner"); deviceRef = r.get("device_ref");
            coreApiRange = Range.parse(r.get("core_api_range")); storageSchemaRange = Range.parse(r.get("storage_schema_range"));
            toolVersions = set(r.get("tool_versions")); planSchemas = set(r.get("plan_schemas")); modelProfiles = set(r.get("model_profiles"));
            EnumSet<Effect> e = EnumSet.noneOf(Effect.class);
            for (String name : set(r.get("effects"))) e.add(Effect.valueOf(name));
            effects = Collections.unmodifiableSet(e);
            maxInputBytes = Long.parseLong(r.get("max_input_bytes")); maxWorks = Long.parseLong(r.get("max_works"));
            connectivity = Connectivity.valueOf(r.get("connectivity"));
            observedAt = Long.parseLong(r.get("observed_at")); expiresAt = Long.parseLong(r.get("expires_at"));
            generation = Long.parseLong(r.get("generation"));
        }
    }

    /** Broker-held Tool manifest requirement. requiredCapabilities names what the Tool cannot run without. */
    public static final class ToolRequirement {
        public final String toolId, planSchema, modelProfile;
        public final int protocolVersion;
        public final Range coreApiRange, storageSchemaRange;
        public final Set<String> toolVersions, requiredCapabilities;
        public final Set<Effect> effects;
        public final long maxInputBytes;
        public ToolRequirement(String toolId, int protocolVersion, Range coreApiRange, Set<String> toolVersions, String planSchema,
                               Set<Effect> effects, Range storageSchemaRange, String modelProfile, long maxInputBytes,
                               Set<String> requiredCapabilities) {
            this.toolId = key(toolId, "INVALID_TOOL_ID");
            if (protocolVersion < 1 || coreApiRange == null || storageSchemaRange == null || planSchema == null
                    || toolVersions == null || toolVersions.isEmpty() || effects == null || effects.isEmpty()
                    || maxInputBytes < 1 || requiredCapabilities == null)
                throw new IllegalArgumentException("INVALID_TOOL_REQUIREMENT");
            this.protocolVersion = protocolVersion; this.coreApiRange = coreApiRange; this.storageSchemaRange = storageSchemaRange;
            for (String v : toolVersions) key(v, "INVALID_TOOL_VERSION");
            for (String c : requiredCapabilities) key(c, "INVALID_CAPABILITY_NAME");
            this.toolVersions = Collections.unmodifiableSet(new TreeSet<>(toolVersions));
            this.planSchema = planSchema; this.effects = Collections.unmodifiableSet(EnumSet.copyOf(effects));
            this.modelProfile = modelProfile; this.maxInputBytes = maxInputBytes;
            this.requiredCapabilities = Collections.unmodifiableSet(new TreeSet<>(requiredCapabilities));
        }
        /** recipe hash stored with the selection and each work binding. */
        public String digest() {
            return Engine.digest(String.join("\n", "tool-requirement@1", toolId, Integer.toString(protocolVersion),
                coreApiRange.toString(), String.join(",", toolVersions), planSchema, joinEffects(effects),
                storageSchemaRange.toString(), modelProfile == null ? "" : modelProfile, Long.toString(maxInputBytes),
                String.join(",", requiredCapabilities)));
        }
    }

    public static final class Evaluation {
        public final String toolId;
        public final List<String> reasons;
        public final boolean executable;
        Evaluation(String toolId, List<String> reasons) {
            this.toolId = toolId; this.reasons = Collections.unmodifiableList(reasons); executable = reasons.isEmpty();
        }
    }

    public static final class Selection {
        public final String owner, toolId, recipeHash, deviceRef, token;
        public final long policyGeneration;
        public final int revision;
        Selection(Map<String,String> r, String token) {
            owner = r.get("owner"); toolId = r.get("tool_id"); recipeHash = r.get("recipe_hash"); deviceRef = r.get("device_ref");
            policyGeneration = Long.parseLong(r.get("policy_generation")); revision = Integer.parseInt(r.get("revision"));
            this.token = token;
        }
    }

    private final Database db;
    private final Engine engine;
    private final ModelProfiles models;
    private final String localDevice;
    private final Map<String,ToolRequirement> manifests;
    private final boolean externalWriteOutbox;

    public SkyExecutor(Database db, Engine engine, ModelProfiles models, String localDeviceRef,
                       List<ToolRequirement> manifests, boolean externalWriteOutbox) {
        this.db = db; this.engine = engine; this.models = models;
        this.localDevice = key(localDeviceRef, "INVALID_DEVICE_REF");
        Map<String,ToolRequirement> m = new LinkedHashMap<>();
        for (ToolRequirement r : manifests) if (m.put(r.toolId, r) != null) throw new IllegalArgumentException("DUPLICATE_TOOL_MANIFEST");
        this.manifests = Collections.unmodifiableMap(m);
        this.externalWriteOutbox = externalWriteOutbox;
        db.execute("PRAGMA foreign_keys=ON");
        db.transaction(() -> {
            if (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='sky_executor_meta'").isEmpty()) {
                db.execute("CREATE TABLE sky_executor_meta(version INTEGER NOT NULL CHECK(version>=1))");
                db.execute("INSERT INTO sky_executor_meta VALUES(?)", SCHEMA_VERSION);
                db.execute("CREATE TABLE sky_executor(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,device_ref TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('active','restored')),revision INTEGER NOT NULL CHECK(revision>=1),writer_epoch INTEGER NOT NULL CHECK(writer_epoch>=1))");
                db.execute("CREATE TABLE sky_capabilities(device_ref TEXT PRIMARY KEY,owner TEXT NOT NULL,protocol_version INTEGER NOT NULL,core_api_range TEXT NOT NULL,tool_versions TEXT NOT NULL,plan_schemas TEXT NOT NULL,effects TEXT NOT NULL,storage_schema_range TEXT NOT NULL,model_profiles TEXT NOT NULL,max_input_bytes INTEGER NOT NULL,max_works INTEGER NOT NULL,connectivity TEXT NOT NULL CHECK(connectivity IN('OFFLINE','ONLINE')),observed_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,generation INTEGER NOT NULL CHECK(generation>=1),content_digest TEXT NOT NULL)");
                db.execute("CREATE TABLE sky_selection_v2(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,tool_id TEXT NOT NULL,recipe_hash TEXT NOT NULL,device_ref TEXT NOT NULL,policy_generation INTEGER NOT NULL CHECK(policy_generation>=0),revision INTEGER NOT NULL CHECK(revision>=1),token_digest TEXT NOT NULL)");
                db.execute("CREATE TABLE sky_work_bindings(work_id TEXT PRIMARY KEY REFERENCES works(id),owner TEXT NOT NULL,tool_id TEXT NOT NULL,recipe_hash TEXT NOT NULL,device_ref TEXT NOT NULL,writer_epoch INTEGER NOT NULL CHECK(writer_epoch>=1),selection_revision INTEGER NOT NULL)");
            }
            List<Map<String,String>> meta = db.query("SELECT version FROM sky_executor_meta");
            if (meta.size() != 1 || Integer.parseInt(meta.get(0).get("version")) != SCHEMA_VERSION)
                throw new IllegalStateException("UNSUPPORTED_SKY_EXECUTOR_SCHEMA");
            return null;
        });
    }

    /** OS observation of this device for the authenticated owner. Generation changes only when content changes. */
    public Capability observe(String owner, Connectivity connectivity, long nowMs) {
        requireOwner(owner);
        if (connectivity == null || nowMs < 0) throw new IllegalArgumentException("INVALID_OBSERVATION");
        TreeSet<String> tools = new TreeSet<>(Engine.toolIds()); tools.add(Engine.RECIPE);
        String profile = models.healthyActiveProfileId();
        EnumSet<Effect> effects = EnumSet.of(Effect.LOCAL_PURE);
        if (externalWriteOutbox && connectivity == Connectivity.ONLINE) effects.add(Effect.EXTERNAL_WRITE);
        String storage = new Range(Engine.SCHEMA_VERSION, Engine.SCHEMA_VERSION).toString();
        String digest = contentDigest(PROTOCOL_VERSION, owner, localDevice, CORE_API.toString(), String.join(",", tools),
            models.runtimePlanSchema(), joinEffects(effects), storage, profile == null ? "" : profile, Engine.MAX_BYTES,
            Engine.MAX_WORKS, connectivity.name(), nowMs, nowMs + OBSERVATION_TTL_MS);
        return db.transaction(() -> {
            List<Map<String,String>> old = db.query("SELECT generation,content_digest,owner FROM sky_capabilities WHERE device_ref=?", localDevice);
            if (!old.isEmpty() && !owner.equals(old.get(0).get("owner"))) throw new SecurityException("OWNER_MISMATCH");
            long generation = old.isEmpty() ? 1 : Long.parseLong(old.get(0).get("generation"))
                + (sameOffer(old.get(0).get("content_digest"), digest) ? 0 : 1);
            db.execute("INSERT OR REPLACE INTO sky_capabilities(device_ref,owner,protocol_version,core_api_range,tool_versions,plan_schemas,effects,storage_schema_range,model_profiles,max_input_bytes,max_works,connectivity,observed_at,expires_at,generation,content_digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                localDevice, owner, PROTOCOL_VERSION, CORE_API.toString(), String.join(",", tools), models.runtimePlanSchema(),
                joinEffects(effects), storage, profile == null ? "" : profile, Engine.MAX_BYTES, Engine.MAX_WORKS,
                connectivity.name(), nowMs, nowMs + OBSERVATION_TTL_MS, generation, digest);
            return storedCapability();
        });
    }

    /** Evaluates one Broker-held manifest against the stored observation of this device. */
    public Evaluation evaluate(String owner, String toolId, long nowMs) {
        requireOwner(owner);
        ToolRequirement req = manifests.get(toolId);
        if (req == null) return new Evaluation(toolId, Collections.singletonList("UNKNOWN_TOOL"));
        List<String> reasons = new ArrayList<>();
        Capability cap = storedCapability();
        if (cap == null) { reasons.add("CAPABILITY_MISSING"); return new Evaluation(toolId, reasons); }
        if (!owner.equals(cap.owner)) reasons.add("CAPABILITY_OWNER_MISMATCH");
        if (!localDevice.equals(cap.deviceRef)) reasons.add("CAPABILITY_DEVICE_MISMATCH");
        if (nowMs >= cap.expiresAt || nowMs < cap.observedAt) reasons.add("CAPABILITY_STALE");
        for (String name : req.requiredCapabilities)
            if (!KNOWN_CAPABILITIES.contains(name)) reasons.add("UNKNOWN_REQUIRED_CAPABILITY:" + name);
        if (req.protocolVersion != cap.protocolVersion) reasons.add("PROTOCOL_MISMATCH");
        if (!req.coreApiRange.overlaps(cap.coreApiRange)) reasons.add("CORE_API_RANGE_MISMATCH");
        if (!req.storageSchemaRange.overlaps(cap.storageSchemaRange)) reasons.add("STORAGE_SCHEMA_RANGE_MISMATCH");
        if (!cap.toolVersions.containsAll(req.toolVersions)) reasons.add("TOOL_VERSION_MISSING");
        if (!cap.planSchemas.contains(req.planSchema)) reasons.add("PLAN_SCHEMA_MISSING");
        if (!cap.effects.containsAll(req.effects)) reasons.add("EFFECT_NOT_OFFERED");
        if (req.modelProfile == null ? cap.modelProfiles.isEmpty() : !cap.modelProfiles.contains(req.modelProfile))
            reasons.add("MODEL_PROFILE_MISSING");
        if (req.maxInputBytes > cap.maxInputBytes) reasons.add("LIMIT_EXCEEDED");
        return new Evaluation(toolId, reasons);
    }

    /** What Sky may show: only Tools in the intersection. */
    public List<String> executableTools(String owner, long nowMs) {
        List<String> tools = new ArrayList<>();
        for (String id : manifests.keySet()) if (evaluate(owner, id, nowMs).executable) tools.add(id);
        return tools;
    }

    /** Owner designates the single executor device (expected revision 0 for the first designation). */
    public int designate(String owner, String deviceRef, int expectedRevision, long nowMs) {
        key(owner, "INVALID_OWNER"); key(deviceRef, "INVALID_DEVICE_REF");
        return db.transaction(() -> {
            List<Map<String,String>> rows = db.query("SELECT * FROM sky_executor WHERE id=1");
            if (rows.isEmpty()) {
                if (expectedRevision != 0) throw new IllegalStateException("REVISION_CONFLICT");
                if (!db.query("SELECT 1 FROM sky_capabilities WHERE owner<>?", owner).isEmpty()) throw new SecurityException("OWNER_MISMATCH");
                db.execute("INSERT INTO sky_executor(id,owner,device_ref,state,revision,writer_epoch) VALUES(1,?,?,'active',1,1)", owner, deviceRef);
                return 1;
            }
            Map<String,String> e = rows.get(0);
            if (!owner.equals(e.get("owner"))) throw new SecurityException("OWNER_MISMATCH");
            int revision = Integer.parseInt(e.get("revision"));
            if (revision != expectedRevision) throw new IllegalStateException("REVISION_CONFLICT");
            long epoch = Long.parseLong(e.get("writer_epoch"));
            if ("restored".equals(e.get("state"))) {
                // explicit owner confirmation after restore: restored works move to the confirmed device with a new epoch
                epoch++;
                db.execute("UPDATE sky_work_bindings SET device_ref=?,writer_epoch=? WHERE owner=?", deviceRef, epoch, owner);
            } else if (!deviceRef.equals(e.get("device_ref"))) {
                epoch++;                                                    // existing works keep their authority device
            }
            db.execute("UPDATE sky_executor SET device_ref=?,state='active',revision=?,writer_epoch=? WHERE id=1", deviceRef, revision + 1, epoch);
            return revision + 1;
        });
    }

    /** Selection re-checks the intersection now and records the capability generation it was made against. */
    public Selection select(String owner, String toolId, int expectedRevision, long nowMs) {
        return db.transaction(() -> {
            requireLocalExecutor(owner);
            Evaluation ev = evaluate(owner, toolId, nowMs);
            if (!ev.executable) throw new IllegalStateException("TOOL_NOT_EXECUTABLE:" + String.join(",", ev.reasons));
            Engine.SkySelection v1 = engine.selectSkyTool(toolId);
            List<Map<String,String>> rows = db.query("SELECT * FROM sky_selection_v2 WHERE id=1");
            int current = rows.isEmpty() ? 0 : Integer.parseInt(rows.get(0).get("revision"));
            if (!rows.isEmpty() && !owner.equals(rows.get(0).get("owner"))) throw new SecurityException("OWNER_MISMATCH");
            if (current != expectedRevision) throw new IllegalStateException("REVISION_CONFLICT");
            db.execute("INSERT OR REPLACE INTO sky_selection_v2(id,owner,tool_id,recipe_hash,device_ref,policy_generation,revision,token_digest) VALUES(1,?,?,?,?,?,?,?)",
                owner, toolId, manifests.get(toolId).digest(), localDevice, storedCapability().generation, current + 1, Engine.digest(v1.token));
            return new Selection(db.query("SELECT * FROM sky_selection_v2 WHERE id=1").get(0), v1.token);
        });
    }

    /** Submit with the persisted selection token; re-checks selection, executor and capability, then pins and binds. */
    public String submit(String owner, String token, String requestKey, String input, boolean consent, long nowMs) {
        return db.transaction(() -> {
            Map<String,String> sel = requireSelection(owner, token);
            requireLocalExecutor(owner);
            ToolRequirement req = manifests.get(sel.get("tool_id"));
            if (req == null || !req.digest().equals(sel.get("recipe_hash"))) throw new IllegalStateException("SELECTION_REVALIDATION_REQUIRED");
            Capability cap = storedCapability();
            if (cap == null || cap.generation != Long.parseLong(sel.get("policy_generation"))) throw new IllegalStateException("SELECTION_REVALIDATION_REQUIRED");
            if (!localDevice.equals(sel.get("device_ref"))) throw new SecurityException("AUTHORITY_DEVICE_MISMATCH");
            Evaluation ev = evaluate(owner, req.toolId, nowMs);
            if (!ev.executable) throw new IllegalStateException("TOOL_NOT_EXECUTABLE:" + String.join(",", ev.reasons));
            String existing = engine.existingWorkId(requestKey);
            String workId = models.submit(requestKey, input, false, consent);   // idempotent; different content -> REQUEST_CONFLICT
            List<Map<String,String>> binding = db.query("SELECT * FROM sky_work_bindings WHERE work_id=?", workId);
            if (!binding.isEmpty()) {
                if (!owner.equals(binding.get(0).get("owner")) || !req.toolId.equals(binding.get(0).get("tool_id")))
                    throw new IllegalStateException("REQUEST_CONFLICT");
                return workId;
            }
            if (existing != null) throw new IllegalStateException("SKY_BINDING_MISSING");   // work made outside this Broker path
            long epoch = Long.parseLong(db.query("SELECT writer_epoch FROM sky_executor WHERE id=1").get(0).get("writer_epoch"));
            db.execute("INSERT INTO sky_work_bindings(work_id,owner,tool_id,recipe_hash,device_ref,writer_epoch,selection_revision) VALUES(?,?,?,?,?,?,?)",
                workId, owner, req.toolId, req.digest(), localDevice, epoch, Integer.parseInt(sel.get("revision")));
            return workId;
        });
    }

    /** Claim re-checks the observation first (no state change if stale), then each claimed run's binding and Tool. */
    public ModelProfiles.PinnedTicket claim(String owner, String bootId, long elapsedMs, boolean charging, long nowMs) {
        return db.transaction(() -> {
            requireOwner(owner);
            Capability cap = storedCapability();
            if (cap == null || nowMs >= cap.expiresAt || nowMs < cap.observedAt) throw new IllegalStateException("CAPABILITY_STALE");
            List<Map<String,String>> e = db.query("SELECT state FROM sky_executor WHERE id=1");
            if (e.isEmpty() || !"active".equals(e.get(0).get("state"))) throw new IllegalStateException("EXECUTOR_CONFIRMATION_REQUIRED");
            while (true) {
                ModelProfiles.PinnedTicket t = models.claim(bootId, elapsedMs, charging);
                if (t == null) return null;
                List<Map<String,String>> b = db.query("SELECT * FROM sky_work_bindings WHERE work_id=?", t.ticket.workId);
                if (b.isEmpty()) { engine.hold(t.ticket, "SKY_BINDING_MISSING"); continue; }
                Map<String,String> binding = b.get(0);
                if (!owner.equals(binding.get("owner"))) { engine.hold(t.ticket, "OWNER_MISMATCH"); continue; }
                if (!localDevice.equals(binding.get("device_ref"))) { engine.hold(t.ticket, "AUTHORITY_DEVICE_MISMATCH"); continue; }
                ToolRequirement req = manifests.get(binding.get("tool_id"));
                if (req == null || !req.digest().equals(binding.get("recipe_hash")) || !evaluate(owner, req.toolId, nowMs).executable) {
                    engine.hold(t.ticket, "CAPABILITY_MISMATCH"); continue;
                }
                return t;
            }
        });
    }

    public Selection selection(String owner, String token) {
        return db.transaction(() -> new Selection(requireSelection(owner, token), token));
    }
    public Map<String,String> executor() {
        List<Map<String,String>> rows = db.query("SELECT owner,device_ref,state,revision,writer_epoch FROM sky_executor WHERE id=1");
        return rows.isEmpty() ? null : rows.get(0);
    }
    public Map<String,String> binding(String workId) {
        List<Map<String,String>> rows = db.query("SELECT * FROM sky_work_bindings WHERE work_id=?", workId);
        if (rows.size() != 1) throw new IllegalArgumentException("UNKNOWN_WORK");
        return rows.get(0);
    }

    /**
     * Allowlisted plaintext for the owner: executor, selection and work bindings. No token, no capability
     * observation. Like PlatformStore output it must be encrypted before leaving the Broker.
     */
    public String exportSnapshot(String owner) {
        requireOwner(owner);
        return db.transaction(() -> {
            StringBuilder s = new StringBuilder("sky-executor-snapshot@1\n").append(owner).append('\n');
            Map<String,String> e = executor();
            if (e == null) throw new IllegalStateException("NOTHING_TO_EXPORT");
            s.append("executor|").append(e.get("device_ref")).append('|').append(e.get("revision")).append('|').append(e.get("writer_epoch")).append('\n');
            for (Map<String,String> r : db.query("SELECT tool_id,recipe_hash,revision FROM sky_selection_v2 WHERE id=1"))
                s.append("selection|").append(r.get("tool_id")).append('|').append(r.get("recipe_hash")).append('|').append(r.get("revision")).append('\n');
            for (Map<String,String> r : db.query("SELECT work_id,tool_id,recipe_hash,device_ref,writer_epoch,selection_revision FROM sky_work_bindings ORDER BY work_id"))
                s.append("binding|").append(r.get("work_id")).append('|').append(r.get("tool_id")).append('|').append(r.get("recipe_hash"))
                    .append('|').append(r.get("device_ref")).append('|').append(r.get("writer_epoch")).append('|').append(r.get("selection_revision")).append('\n');
            String digest = Engine.digest(s.toString());
            return s.append("digest|").append(digest).append('\n').toString();
        });
    }

    /**
     * Restores after PlatformStore.restoreRecoverableState (works restored, automation paused, Sky token rotated).
     * The target must be empty. The executor is marked restored until the owner re-designates, and the selection
     * is bound to the rotated token with policy generation 0, so it must be re-selected against a fresh observation.
     */
    public void restoreSnapshot(String snapshot, String owner, long nowMs) {
        key(owner, "INVALID_OWNER");
        if (snapshot == null || snapshot.length() > 1_000_000) throw new IllegalArgumentException("INVALID_SNAPSHOT");
        String[] lines = snapshot.split("\n");
        if (lines.length < 4 || !"sky-executor-snapshot@1".equals(lines[0])) throw new IllegalArgumentException("INVALID_SNAPSHOT");
        if (!owner.equals(lines[1])) throw new SecurityException("SNAPSHOT_OWNER_MISMATCH");
        String last = lines[lines.length - 1];
        String body = snapshot.substring(0, snapshot.length() - last.length() - 1);
        if (!last.equals("digest|" + Engine.digest(body))) throw new SecurityException("SNAPSHOT_CORRUPT");
        db.transaction(() -> {
            if (!db.query("SELECT 1 FROM sky_executor").isEmpty() || !db.query("SELECT 1 FROM sky_selection_v2").isEmpty()
                    || !db.query("SELECT 1 FROM sky_work_bindings").isEmpty() || !db.query("SELECT 1 FROM sky_capabilities").isEmpty())
                throw new IllegalStateException("RESTORE_TARGET_NOT_EMPTY");
            if (!engine.paused()) throw new IllegalStateException("RESTORE_REQUIRES_PAUSED_ENGINE");
            for (int i = 2; i < lines.length - 1; i++) {
                String[] f = lines[i].split("\\|", -1);
                switch (f[0]) {
                    case "executor":
                        db.execute("INSERT INTO sky_executor(id,owner,device_ref,state,revision,writer_epoch) VALUES(1,?,?,'restored',?,?)",
                            owner, key(f[1], "INVALID_SNAPSHOT"), Math.addExact(Integer.parseInt(f[2]), 1), Long.parseLong(f[3]));
                        break;
                    case "selection":
                        Engine.SkySelection v1 = engine.skySelection();
                        if (v1 == null || !v1.toolId.equals(f[1])) throw new IllegalStateException("SNAPSHOT_SELECTION_MISMATCH");
                        db.execute("INSERT INTO sky_selection_v2(id,owner,tool_id,recipe_hash,device_ref,policy_generation,revision,token_digest) VALUES(1,?,?,?,'',0,?,?)",
                            owner, f[1], f[2], Math.addExact(Integer.parseInt(f[3]), 1), Engine.digest(v1.token));
                        break;
                    case "binding":
                        engine.work(f[1]);                                   // PlatformStore restored the work first
                        db.execute("INSERT INTO sky_work_bindings(work_id,owner,tool_id,recipe_hash,device_ref,writer_epoch,selection_revision) VALUES(?,?,?,?,?,?,?)",
                            f[1], owner, f[2], f[3], f[4], Long.parseLong(f[5]), Integer.parseInt(f[6]));
                        break;
                    default: throw new IllegalArgumentException("INVALID_SNAPSHOT");
                }
            }
            if (db.query("SELECT 1 FROM sky_executor").isEmpty()) throw new IllegalArgumentException("INVALID_SNAPSHOT");
            return null;
        });
    }

    private Map<String,String> requireSelection(String owner, String token) {
        requireOwner(owner);
        engine.requireSkySelection(token);                                      // SKY_SELECTION_REQUIRED / _MISMATCH
        List<Map<String,String>> rows = db.query("SELECT * FROM sky_selection_v2 WHERE id=1");
        if (rows.isEmpty()) throw new SecurityException("SKY_SELECTION_MISMATCH");
        Map<String,String> r = rows.get(0);
        if (!owner.equals(r.get("owner"))) throw new SecurityException("OWNER_MISMATCH");
        if (!Engine.digest(token).equals(r.get("token_digest"))) throw new SecurityException("SKY_SELECTION_MISMATCH");
        return r;
    }
    private void requireLocalExecutor(String owner) {
        requireOwner(owner);
        List<Map<String,String>> rows = db.query("SELECT * FROM sky_executor WHERE id=1");
        if (rows.isEmpty()) throw new IllegalStateException("EXECUTOR_NOT_DESIGNATED");
        if (!"active".equals(rows.get(0).get("state"))) throw new IllegalStateException("EXECUTOR_CONFIRMATION_REQUIRED");
        if (!localDevice.equals(rows.get(0).get("device_ref"))) throw new SecurityException("NOT_DESIGNATED_EXECUTOR");
    }
    /** This Broker database serves one owner; the first designation or observation binds it. */
    private void requireOwner(String owner) {
        key(owner, "INVALID_OWNER");
        List<Map<String,String>> e = db.query("SELECT owner FROM sky_executor WHERE id=1");
        if (!e.isEmpty() && !owner.equals(e.get(0).get("owner"))) throw new SecurityException("OWNER_MISMATCH");
    }
    /** A stored observation whose fields no longer match its digest is refused, never used. */
    private Capability storedCapability() {
        List<Map<String,String>> rows = db.query("SELECT * FROM sky_capabilities WHERE device_ref=?", localDevice);
        if (rows.isEmpty()) return null;
        Map<String,String> r = rows.get(0);
        String expected = contentDigest(Integer.parseInt(r.get("protocol_version")), r.get("owner"), r.get("device_ref"),
            r.get("core_api_range"), r.get("tool_versions"), r.get("plan_schemas"), r.get("effects"), r.get("storage_schema_range"),
            r.get("model_profiles"), Long.parseLong(r.get("max_input_bytes")), Long.parseLong(r.get("max_works")), r.get("connectivity"),
            Long.parseLong(r.get("observed_at")), Long.parseLong(r.get("expires_at")));
        if (!expected.equals(r.get("content_digest"))) throw new IllegalStateException("CAPABILITY_RECORD_CORRUPT");
        return new Capability(r);
    }
    /** digest = offer digest (what the device offers) + ":" + digest including the observation window. */
    private static String contentDigest(int protocol, String owner, String device, String coreApi, String tools, String plans,
                                        String effects, String storage, String profiles, long maxInput, long maxWorks,
                                        String connectivity, long observedAt, long expiresAt) {
        String offer = Engine.digest(String.join("\n", "capability-offer@1", Integer.toString(protocol), owner, device, coreApi, tools,
            plans, effects, storage, profiles, Long.toString(maxInput), Long.toString(maxWorks), connectivity));
        return offer + ":" + Engine.digest(offer + "\n" + observedAt + "\n" + expiresAt);
    }
    private static boolean sameOffer(String a, String b) {
        return a != null && b != null && a.split(":")[0].equals(b.split(":")[0]);
    }
    private static String joinEffects(Set<Effect> effects) {
        TreeSet<String> names = new TreeSet<>();
        for (Effect e : effects) names.add(e.name());
        return String.join(",", names);
    }
    private static Set<String> set(String joined) {
        if (joined == null || joined.isEmpty()) return Collections.emptySet();
        return Collections.unmodifiableSet(new TreeSet<>(Arrays.asList(joined.split(","))));
    }
    private static String key(String value, String error) {
        if (value == null || !value.matches("[A-Za-z0-9._:@-]{1,128}")) throw new IllegalArgumentException(error);
        return value;
    }
}
