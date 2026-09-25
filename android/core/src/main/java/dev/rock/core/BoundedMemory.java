package dev.rock.core;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Host/fixture bounded memory (docs/ai-native-os-architecture.md section 3, docs/sky-assistant-and-memory.md).
 * Canonical records follow the design fields
 * schemaVersion/ownerRef/projectRef/memoryId/kind/contentRef/provenance/createdAt/expiresAt/revision
 * and hold no model-specific representation. Model-specific context
 * is a projection cache keyed by ModelProfile identity and is rebuilt from canonical records.
 * Not wired to Sky UI, Tools, Zema, AIDL, Cloud or an encrypted store; no vector search.
 *
 * Rules fixed here:
 * - Every read, search, reconstruction and export is limited to one owner, one project and (except export)
 *   one read scope. A memory of another project is reported as unknown, never as forbidden.
 * - Provenance is required and never changes on correction. Long-term memory (preference, procedure,
 *   reference) is stored only when confirmed by the owner; an unconfirmed model guess is refused, so it can
 *   never become an owner fact. An artifact memory must point at an existing work artifact.
 * - Deletion, owner-wide deletion and expiry remove the content and every projection of the project;
 *   a deleted memory ID cannot be revived by a stale correction or a re-save.
 * - Limits: content size per memory and memories per project. Exceeding them refuses the write and never
 *   evicts existing memories. Reconstruction stays within the requested budget, which may not exceed the
 *   profile context limit; memories that do not fit are omitted whole and listed, never cut mid-item.
 * - Stored rows carry a digest; a changed row is reported as corrupt instead of being used.
 */
public final class BoundedMemory {
    public static final int SCHEMA_VERSION = 1;
    public static final int MAX_CONTENT_BYTES = 4 * 1024;
    public static final int MAX_MEMORIES_PER_PROJECT = 200;
    public static final int MAX_SCOPES = 8;
    public enum Kind { PREFERENCE, PROCEDURE, REFERENCE, ARTIFACT }
    public enum Origin { OWNER, TOOL, MODEL }

    /** Where a memory came from. Immutable for the life of the memory ID. */
    public static final class Provenance {
        public final Origin origin;
        public final boolean ownerConfirmed;
        public final String sourceWorkId, sourceArtifactDigest, modelProfileId;

        public Provenance(Origin origin, boolean ownerConfirmed, String sourceWorkId, String sourceArtifactDigest,
                          String modelProfileId) {
            if (origin == null) throw new IllegalArgumentException("PROVENANCE_REQUIRED");
            this.origin = origin; this.ownerConfirmed = ownerConfirmed;
            this.sourceWorkId = sourceWorkId == null ? null : ref(sourceWorkId, "INVALID_SOURCE_WORK");
            if (sourceArtifactDigest != null && !sourceArtifactDigest.matches("[0-9a-f]{64}"))
                throw new IllegalArgumentException("INVALID_SOURCE_ARTIFACT");
            this.sourceArtifactDigest = sourceArtifactDigest;
            if (modelProfileId != null && !modelProfileId.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,63}@[0-9]{1,6}(\\.[0-9]{1,6}){0,2}"))
                throw new IllegalArgumentException("INVALID_MODEL_PROFILE");
            this.modelProfileId = modelProfileId;
            if (origin == Origin.OWNER && !ownerConfirmed) throw new IllegalArgumentException("OWNER_ORIGIN_MUST_BE_CONFIRMED");
            if (origin == Origin.TOOL && (sourceWorkId == null || sourceArtifactDigest == null))
                throw new IllegalArgumentException("TOOL_SOURCE_REQUIRED");
            if (origin == Origin.MODEL && (sourceWorkId == null || modelProfileId == null))
                throw new IllegalArgumentException("MODEL_SOURCE_REQUIRED");
            if (origin != Origin.MODEL && modelProfileId != null) throw new IllegalArgumentException("MODEL_PROFILE_ONLY_FOR_MODEL_ORIGIN");
        }

        String canonical() {
            return String.join("|", origin.name(), ownerConfirmed ? "1" : "0", nz(sourceWorkId), nz(sourceArtifactDigest), nz(modelProfileId));
        }
    }

    /** Canonical memory record. */
    public static final class Item {
        public final int schemaVersion, revision;
        public final String ownerRef, projectRef, memoryId, content, contentRef;
        public final Kind kind;
        public final Provenance provenance;
        public final long createdAt, expiresAt;
        public final Set<String> scopes;
        Item(Map<String,String> r) {
            schemaVersion = Integer.parseInt(r.get("schema_version")); revision = Integer.parseInt(r.get("revision"));
            ownerRef = r.get("owner_ref"); projectRef = r.get("project_ref"); memoryId = r.get("memory_id");
            content = r.get("content"); contentRef = r.get("content_ref"); kind = Kind.valueOf(r.get("kind"));
            provenance = new Provenance(Origin.valueOf(r.get("origin")), "1".equals(r.get("owner_confirmed")),
                r.get("source_work_id"), r.get("source_artifact_digest"), r.get("model_profile_id"));
            createdAt = Long.parseLong(r.get("created_at")); expiresAt = Long.parseLong(r.get("expires_at"));
            scopes = Collections.unmodifiableSet(new TreeSet<>(java.util.Arrays.asList(r.get("scopes").split(","))));
        }
    }

    /** Model-specific context rebuilt from canonical memory; omitted lists memories left out by the budget. */
    public static final class Context {
        public final String profileId, profileDigest, text;
        public final List<String> included, omitted;
        public final int estimatedTokens;
        public final boolean fromCache;
        Context(Map<String,String> r, boolean fromCache) {
            profileId = r.get("profile_id"); profileDigest = r.get("profile_digest"); text = r.get("context");
            included = list(r.get("included")); omitted = list(r.get("omitted"));
            estimatedTokens = Integer.parseInt(r.get("estimated_tokens")); this.fromCache = fromCache;
        }
    }

    private final Database db;

    public BoundedMemory(Database db) {
        this.db = db;
        db.execute("PRAGMA foreign_keys=ON");
        db.transaction(() -> {
            if (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_meta'").isEmpty()) {
                db.execute("CREATE TABLE memory_meta(version INTEGER NOT NULL CHECK(version>=1))");
                db.execute("INSERT INTO memory_meta VALUES(?)", SCHEMA_VERSION);
                db.execute("CREATE TABLE memory_items(owner_ref TEXT NOT NULL,project_ref TEXT NOT NULL,memory_id TEXT NOT NULL,schema_version INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN('PREFERENCE','PROCEDURE','REFERENCE','ARTIFACT')),content TEXT NOT NULL,content_ref TEXT NOT NULL,scopes TEXT NOT NULL,origin TEXT NOT NULL CHECK(origin IN('OWNER','TOOL','MODEL')),owner_confirmed INTEGER NOT NULL CHECK(owner_confirmed IN(0,1)),source_work_id TEXT REFERENCES works(id),source_artifact_digest TEXT,model_profile_id TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),request_digest TEXT NOT NULL,row_digest TEXT NOT NULL,PRIMARY KEY(owner_ref,project_ref,memory_id))");
                db.execute("CREATE TABLE memory_tombstones(owner_ref TEXT NOT NULL,project_ref TEXT NOT NULL,memory_id TEXT NOT NULL,reason TEXT NOT NULL CHECK(reason IN('deleted','owner_erased','expired')),deleted_at INTEGER NOT NULL,PRIMARY KEY(owner_ref,project_ref,memory_id))");
                db.execute("CREATE TABLE memory_projections(owner_ref TEXT NOT NULL,project_ref TEXT NOT NULL,scope TEXT NOT NULL,profile_id TEXT NOT NULL,profile_digest TEXT NOT NULL,budget_tokens INTEGER NOT NULL,set_digest TEXT NOT NULL,context TEXT NOT NULL,context_digest TEXT NOT NULL,included TEXT NOT NULL,omitted TEXT NOT NULL,estimated_tokens INTEGER NOT NULL,PRIMARY KEY(owner_ref,project_ref,scope,profile_digest,budget_tokens))");
            }
            List<Map<String,String>> meta = db.query("SELECT version FROM memory_meta");
            if (meta.size() != 1 || Integer.parseInt(meta.get(0).get("version")) != SCHEMA_VERSION)
                throw new IllegalStateException("UNSUPPORTED_MEMORY_SCHEMA");
            return null;
        });
    }

    /** Saves a new memory. Re-saving identical content returns the current revision; different content is refused. */
    public int save(String owner, String project, String memoryId, Kind kind, String content, Set<String> scopes,
                    Provenance provenance, long nowMs, long expiresAtMs) {
        ref(owner, "INVALID_OWNER"); ref(project, "INVALID_PROJECT"); ref(memoryId, "INVALID_MEMORY_ID");
        if (kind == null || provenance == null) throw new IllegalArgumentException("PROVENANCE_REQUIRED");
        content(content);
        String scopeList = scopes(scopes);
        if (expiresAtMs <= nowMs) throw new IllegalArgumentException("INVALID_EXPIRY");
        if (kind == Kind.ARTIFACT ? provenance.origin != Origin.TOOL : !provenance.ownerConfirmed)
            throw new IllegalArgumentException(kind == Kind.ARTIFACT ? "ARTIFACT_REQUIRES_TOOL_SOURCE" : "MEMORY_CONFIRMATION_REQUIRED");
        String request = requestDigest(kind, content, scopeList, provenance, expiresAtMs);
        return db.transaction(() -> {
            purgeExpired(owner, project, nowMs);
            if (!db.query("SELECT 1 FROM memory_tombstones WHERE owner_ref=? AND project_ref=? AND memory_id=?", owner, project, memoryId).isEmpty())
                throw new IllegalStateException("MEMORY_DELETED");
            List<Map<String,String>> old = db.query("SELECT * FROM memory_items WHERE owner_ref=? AND project_ref=? AND memory_id=?", owner, project, memoryId);
            if (!old.isEmpty()) {
                Map<String,String> row = verified(old.get(0));
                if (!request.equals(row.get("request_digest"))) throw new IllegalStateException("MEMORY_CONFLICT");
                return Integer.parseInt(row.get("revision"));
            }
            if (provenance.sourceWorkId != null && db.query("SELECT 1 FROM works WHERE id=?", provenance.sourceWorkId).isEmpty())
                throw new IllegalArgumentException("UNKNOWN_SOURCE_WORK");
            if (provenance.sourceArtifactDigest != null && db.query("SELECT 1 FROM artifacts WHERE work_id=? AND digest=?",
                    provenance.sourceWorkId, provenance.sourceArtifactDigest).isEmpty())
                throw new IllegalArgumentException("UNKNOWN_SOURCE_ARTIFACT");
            int count = Integer.parseInt(db.query("SELECT COUNT(*) AS n FROM memory_items WHERE owner_ref=? AND project_ref=?", owner, project).get(0).get("n"));
            if (count >= MAX_MEMORIES_PER_PROJECT) throw new IllegalStateException("MEMORY_LIMIT_REACHED");
            write(owner, project, memoryId, kind, content, scopeList, provenance, nowMs, expiresAtMs, 1, request, true);
            invalidate(owner, project);
            return 1;
        });
    }

    /** Owner correction or share change (scopes). Provenance and kind stay; a stale revision is refused. */
    public int revise(String owner, String project, String memoryId, int expectedRevision, String content,
                      Set<String> scopes, long nowMs, long expiresAtMs) {
        content(content);
        String scopeList = scopes(scopes);
        if (expiresAtMs <= nowMs) throw new IllegalArgumentException("INVALID_EXPIRY");
        return db.transaction(() -> {
            purgeExpired(owner, project, nowMs);
            if (!db.query("SELECT 1 FROM memory_tombstones WHERE owner_ref=? AND project_ref=? AND memory_id=?", owner, project, memoryId).isEmpty())
                throw new IllegalStateException("MEMORY_DELETED");
            Item item = new Item(current(owner, project, memoryId));
            if (item.revision != expectedRevision) throw new IllegalStateException("REVISION_CONFLICT");
            String request = requestDigest(item.kind, content, scopeList, item.provenance, expiresAtMs);
            write(owner, project, memoryId, item.kind, content, scopeList, item.provenance, item.createdAt, expiresAtMs,
                item.revision + 1, request, false);
            invalidate(owner, project);
            return item.revision + 1;
        });
    }

    public Item get(String owner, String project, String scope, String memoryId, long nowMs) {
        scope(scope);
        return db.transaction(() -> {
            purgeExpired(owner, project, nowMs);
            Item item = new Item(current(owner, project, memoryId));
            if (!item.scopes.contains(scope)) throw new IllegalArgumentException("UNKNOWN_MEMORY");
            return item;
        });
    }

    /** Plain substring search inside one project and scope (no vector index). */
    public List<Item> search(String owner, String project, String scope, String query, long nowMs) {
        scope(scope);
        if (query == null || query.trim().isEmpty() || query.length() > 256) throw new IllegalArgumentException("INVALID_QUERY");
        String needle = query.toLowerCase(Locale.ROOT);
        return db.transaction(() -> {
            purgeExpired(owner, project, nowMs);
            List<Item> found = new ArrayList<>();
            for (Item item : visible(owner, project, scope))
                if (item.content.toLowerCase(Locale.ROOT).contains(needle)) found.add(item);
            return found;
        });
    }

    /** Owner export of one project, all scopes, with provenance. */
    public List<Item> export(String owner, String project, long nowMs) {
        return db.transaction(() -> {
            purgeExpired(owner, project, nowMs);
            List<Item> items = new ArrayList<>();
            for (Map<String,String> r : db.query("SELECT * FROM memory_items WHERE owner_ref=? AND project_ref=? ORDER BY memory_id",
                    ref(owner, "INVALID_OWNER"), ref(project, "INVALID_PROJECT")))
                items.add(new Item(verified(r)));
            return items;
        });
    }

    /** Deletes one memory: content, every projection of the project, and a tombstone that blocks revival. */
    public void delete(String owner, String project, String memoryId, long nowMs) {
        db.transaction(() -> {                                              // a corrupt row can still be deleted
            if (db.query("SELECT 1 FROM memory_items WHERE owner_ref=? AND project_ref=? AND memory_id=?",
                    ref(owner, "INVALID_OWNER"), ref(project, "INVALID_PROJECT"), ref(memoryId, "INVALID_MEMORY_ID")).isEmpty())
                throw new IllegalArgumentException("UNKNOWN_MEMORY");
            erase(owner, project, memoryId, "deleted", nowMs);
            return null;
        });
    }

    /** Owner-wide erase across every project. Returns the number of memories removed. */
    public int deleteAll(String owner, long nowMs) {
        ref(owner, "INVALID_OWNER");
        return db.transaction(() -> {
            List<Map<String,String>> rows = db.query("SELECT project_ref,memory_id FROM memory_items WHERE owner_ref=?", owner);
            for (Map<String,String> r : rows) erase(owner, r.get("project_ref"), r.get("memory_id"), "owner_erased", nowMs);
            db.execute("DELETE FROM memory_projections WHERE owner_ref=?", owner);
            return rows.size();
        });
    }

    /**
     * Rebuilds the context for one model profile from canonical memory. A projection built for another
     * profile is never reused; a cached projection is reused only for the same profile digest, budget and
     * canonical set, and only if its stored text still matches its digest.
     */
    public Context reconstruct(String owner, String project, String scope, ModelProfile profile, int budgetTokens, long nowMs) {
        scope(scope);
        if (profile == null) throw new IllegalArgumentException("MODEL_PROFILE_REQUIRED");
        if (budgetTokens < 1 || budgetTokens > profile.contextTokens) throw new IllegalArgumentException("CONTEXT_BUDGET_EXCEEDS_PROFILE");
        return db.transaction(() -> {
            purgeExpired(owner, project, nowMs);
            List<Item> items = visible(owner, project, scope);
            StringBuilder set = new StringBuilder("memory-set@1\n").append(scope).append('\n');
            for (Item item : items) set.append(item.memoryId).append(':').append(item.revision).append(':').append(item.contentRef).append('\n');
            String setDigest = Engine.digest(set.toString());
            List<Map<String,String>> cached = db.query("SELECT * FROM memory_projections WHERE owner_ref=? AND project_ref=? AND scope=? AND profile_digest=? AND budget_tokens=?",
                owner, project, scope, profile.digest(), budgetTokens);
            if (!cached.isEmpty()) {
                Map<String,String> c = cached.get(0);
                if (setDigest.equals(c.get("set_digest")) && Engine.digest(c.get("context")).equals(c.get("context_digest"))
                        && profile.id().equals(c.get("profile_id")))
                    return new Context(c, true);
            }
            String header = "{\"memory\":\"canonical@1\",\"project\":" + json(project) + ",\"scope\":" + json(scope)
                + ",\"profile\":" + json(profile.id()) + "}\n";
            StringBuilder text = new StringBuilder(header);
            int used = tokens(header);
            List<String> included = new ArrayList<>(), omitted = new ArrayList<>();
            for (Item item : items) {
                String line = render(item);
                int cost = tokens(line);
                if (used + cost <= budgetTokens) { text.append(line); used += cost; included.add(item.memoryId); }
                else omitted.add(item.memoryId);                           // whole item left out, never cut
            }
            if (used > budgetTokens) throw new IllegalStateException("CONTEXT_BUDGET_TOO_SMALL");
            String context = text.toString();
            db.execute("DELETE FROM memory_projections WHERE owner_ref=? AND project_ref=? AND scope=? AND profile_digest=? AND budget_tokens=?",
                owner, project, scope, profile.digest(), budgetTokens);
            db.execute("INSERT INTO memory_projections(owner_ref,project_ref,scope,profile_id,profile_digest,budget_tokens,set_digest,context,context_digest,included,omitted,estimated_tokens) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                owner, project, scope, profile.id(), profile.digest(), budgetTokens, setDigest, context, Engine.digest(context),
                String.join(",", included), String.join(",", omitted), used);
            return new Context(db.query("SELECT * FROM memory_projections WHERE owner_ref=? AND project_ref=? AND scope=? AND profile_digest=? AND budget_tokens=?",
                owner, project, scope, profile.digest(), budgetTokens).get(0), false);
        });
    }

    private List<Item> visible(String owner, String project, String scope) {
        List<Item> items = new ArrayList<>();
        for (Map<String,String> r : db.query("SELECT * FROM memory_items WHERE owner_ref=? AND project_ref=? ORDER BY CASE kind WHEN 'PREFERENCE' THEN 0 WHEN 'PROCEDURE' THEN 1 WHEN 'REFERENCE' THEN 2 ELSE 3 END,created_at,memory_id",
                ref(owner, "INVALID_OWNER"), ref(project, "INVALID_PROJECT"))) {
            Item item = new Item(verified(r));
            if (item.scopes.contains(scope)) items.add(item);
        }
        return items;
    }
    private Map<String,String> current(String owner, String project, String memoryId) {
        List<Map<String,String>> rows = db.query("SELECT * FROM memory_items WHERE owner_ref=? AND project_ref=? AND memory_id=?",
            ref(owner, "INVALID_OWNER"), ref(project, "INVALID_PROJECT"), ref(memoryId, "INVALID_MEMORY_ID"));
        if (rows.size() != 1) throw new IllegalArgumentException("UNKNOWN_MEMORY");
        return verified(rows.get(0));
    }
    private void write(String owner, String project, String memoryId, Kind kind, String content, String scopes, Provenance p,
                       long createdAt, long expiresAt, int revision, String request, boolean insert) {
        String contentRef = Engine.digest(content);
        String rowDigest = rowDigest(owner, project, memoryId, kind.name(), content, contentRef, scopes, p.canonical(), createdAt, expiresAt, revision, request);
        if (insert)
            db.execute("INSERT INTO memory_items(owner_ref,project_ref,memory_id,schema_version,kind,content,content_ref,scopes,origin,owner_confirmed,source_work_id,source_artifact_digest,model_profile_id,created_at,expires_at,revision,request_digest,row_digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                owner, project, memoryId, SCHEMA_VERSION, kind.name(), content, contentRef, scopes, p.origin.name(), p.ownerConfirmed ? 1 : 0,
                p.sourceWorkId, p.sourceArtifactDigest, p.modelProfileId, createdAt, expiresAt, revision, request, rowDigest);
        else
            db.execute("UPDATE memory_items SET content=?,content_ref=?,scopes=?,expires_at=?,revision=?,request_digest=?,row_digest=? WHERE owner_ref=? AND project_ref=? AND memory_id=? AND revision=?",
                content, contentRef, scopes, expiresAt, revision, request, rowDigest, owner, project, memoryId, revision - 1);
    }
    private void erase(String owner, String project, String memoryId, String reason, long nowMs) {
        db.execute("DELETE FROM memory_items WHERE owner_ref=? AND project_ref=? AND memory_id=?", owner, project, memoryId);
        db.execute("INSERT OR REPLACE INTO memory_tombstones(owner_ref,project_ref,memory_id,reason,deleted_at) VALUES(?,?,?,?,?)",
            owner, project, memoryId, reason, nowMs);
        invalidate(owner, project);
    }
    private void purgeExpired(String owner, String project, long nowMs) {
        for (Map<String,String> r : db.query("SELECT memory_id FROM memory_items WHERE owner_ref=? AND project_ref=? AND expires_at<=?",
                ref(owner, "INVALID_OWNER"), ref(project, "INVALID_PROJECT"), nowMs))
            erase(owner, project, r.get("memory_id"), "expired", nowMs);
    }
    private void invalidate(String owner, String project) {
        db.execute("DELETE FROM memory_projections WHERE owner_ref=? AND project_ref=?", owner, project);
    }
    private static Map<String,String> verified(Map<String,String> r) {
        String expected = rowDigest(r.get("owner_ref"), r.get("project_ref"), r.get("memory_id"), r.get("kind"), r.get("content"),
            r.get("content_ref"), r.get("scopes"), new Item(r).provenance.canonical(), Long.parseLong(r.get("created_at")),
            Long.parseLong(r.get("expires_at")), Integer.parseInt(r.get("revision")), r.get("request_digest"));
        if (!expected.equals(r.get("row_digest")) || !Engine.digest(r.get("content")).equals(r.get("content_ref"))
                || Integer.parseInt(r.get("schema_version")) != SCHEMA_VERSION)
            throw new IllegalStateException("MEMORY_RECORD_CORRUPT");
        return r;
    }
    private static String requestDigest(Kind kind, String content, String scopes, Provenance p, long expiresAt) {
        return Engine.digest(String.join("\n", "memory-request@1", kind.name(), Engine.digest(content), scopes, p.canonical(), Long.toString(expiresAt)));
    }
    private static String rowDigest(String owner, String project, String memoryId, String kind, String content, String contentRef,
                                    String scopes, String provenance, long createdAt, long expiresAt, int revision, String request) {
        return Engine.digest(String.join("\n", "memory-row@1", Integer.toString(SCHEMA_VERSION), owner, project, memoryId, kind,
            Engine.digest(content), contentRef, scopes, provenance, Long.toString(createdAt), Long.toString(expiresAt),
            Integer.toString(revision), request));
    }
    /** Owner-confirmed memories are owner facts; Tool results stay marked as untrusted data. */
    private static String render(Item item) {
        Provenance p = item.provenance;
        return "{\"memoryId\":" + json(item.memoryId) + ",\"kind\":" + json(item.kind.name().toLowerCase(Locale.ROOT))
            + ",\"revision\":" + item.revision + ",\"origin\":" + json(p.origin.name().toLowerCase(Locale.ROOT))
            + ",\"trust\":" + json(p.ownerConfirmed ? "owner-confirmed" : "untrusted-data")
            + ",\"sourceWork\":" + json(p.sourceWorkId) + ",\"sourceArtifact\":" + json(p.sourceArtifactDigest)
            + ",\"modelProfile\":" + json(p.modelProfileId) + ",\"content\":" + json(item.content) + "}\n";
    }
    /** Conservative estimate: at most one token per UTF-8 byte (no model tokenizer on the host). */
    private static int tokens(String text) { return text.getBytes(StandardCharsets.UTF_8).length; }
    private static String json(String value) {
        if (value == null) return "null";
        StringBuilder s = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '"' || c == '\\') s.append('\\').append(c);
            else if (c < 0x20) s.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
            else s.append(c);
        }
        return s.append('"').toString();
    }
    private static void content(String content) {
        Engine.bounded(content);
        if (content.getBytes(StandardCharsets.UTF_8).length > MAX_CONTENT_BYTES) throw new IllegalArgumentException("MEMORY_CONTENT_TOO_LARGE");
    }
    private static String scopes(Set<String> scopes) {
        if (scopes == null || scopes.isEmpty() || scopes.size() > MAX_SCOPES) throw new IllegalArgumentException("INVALID_SCOPES");
        TreeSet<String> sorted = new TreeSet<>();
        for (String scope : scopes) sorted.add(scope(scope));
        return String.join(",", sorted);
    }
    private static String scope(String scope) {
        if (scope == null || !scope.matches("[A-Za-z0-9][A-Za-z0-9._:@-]{0,63}")) throw new IllegalArgumentException("INVALID_SCOPE");
        return scope;
    }
    private static String ref(String value, String error) {
        if (value == null || !value.matches("[A-Za-z0-9._:-]{1,128}")) throw new IllegalArgumentException(error);
        return value;
    }
    private static String nz(String value) { return value == null ? "" : value; }
    private static List<String> list(String joined) {
        if (joined == null || joined.isEmpty()) return Collections.emptyList();
        return Collections.unmodifiableList(java.util.Arrays.asList(joined.split(",")));
    }
}
