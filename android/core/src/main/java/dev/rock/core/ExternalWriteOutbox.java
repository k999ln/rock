package dev.rock.core;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Host/fixture outbox for external-write effects (docs/ai-native-os-architecture.md section 4).
 * States: prepared -> dispatched -> confirmed | rejected | uncertain; uncertain is resolved only by
 * reconciliation. Not wired to any Tool, Provider, Zema or AIDL; exactly-once is not promised.
 *
 * Rules fixed here:
 * - Only EXTERNAL_WRITE is accepted; local-pure and remote-read never enter the outbox.
 * - Everything named by the design (owner, operation ID, payload hash, target, cost limit, approval
 *   ID/expiry, provider idempotency key, generation) is persisted before dispatch. The same operation
 *   ID with identical content returns the existing record; different content is rejected. A provider
 *   key cannot be reused by another operation.
 * - Authority and approval expiry are re-checked immediately before dispatch.
 * - A dispatch left open by an earlier process (crash/kill) becomes uncertain and is never re-sent
 *   automatically. Late or duplicate callbacks cannot overwrite a reconciled result.
 * - Reconciliation compares content hash and amount. Only a provider that guarantees idempotent
 *   retry may be re-dispatched with the same key after the provider reports the operation absent;
 *   otherwise the operation stays uncertain until the owner resolves it. Cancelling an uncertain
 *   operation requires the provider to have reported it absent.
 * - A confirmed operation is never "cancelled"; a separate compensating operation is prepared.
 */
public final class ExternalWriteOutbox {
    public static final int SCHEMA_VERSION = 1;
    public enum Effect { LOCAL_PURE, REMOTE_READ, EXTERNAL_WRITE }
    public enum Observation { CONFIRMED, REJECTED, ABSENT }

    /** Checked in the dispatch transaction; the Broker supplies OS permission and approval state. */
    public interface Authority { boolean permits(Operation operation, long nowMs); }

    public static final class Operation {
        public final String operationId, owner, workId, target, payload, payloadHash, currency, approvalId,
            providerKey, compensatesOperationId;
        public final long costLimitMinor, approvalExpiresAtMs, generation;
        public final boolean providerIdempotentRetry;

        public Operation(String operationId, String owner, String workId, String target, String payload,
                         long costLimitMinor, String currency, String approvalId, long approvalExpiresAtMs,
                         String providerKey, boolean providerIdempotentRetry, long generation,
                         String compensatesOperationId) {
            this.operationId = key(operationId, "INVALID_OPERATION_ID");
            this.owner = key(owner, "INVALID_OWNER");
            this.workId = require(workId, "INVALID_WORK_ID");
            this.target = key(target, "INVALID_TARGET");
            Engine.bounded(payload);
            this.payload = payload;
            this.payloadHash = Engine.digest(payload);
            if (costLimitMinor < 0) throw new IllegalArgumentException("INVALID_COST_LIMIT");
            if (currency == null || !currency.matches("[A-Z]{3,5}")) throw new IllegalArgumentException("INVALID_CURRENCY");
            this.costLimitMinor = costLimitMinor; this.currency = currency;
            this.approvalId = key(approvalId, "APPROVAL_REQUIRED");
            if (approvalExpiresAtMs <= 0) throw new IllegalArgumentException("APPROVAL_EXPIRY_REQUIRED");
            this.approvalExpiresAtMs = approvalExpiresAtMs;
            this.providerKey = key(providerKey, "PROVIDER_IDEMPOTENCY_KEY_REQUIRED");
            this.providerIdempotentRetry = providerIdempotentRetry;
            if (generation < 1) throw new IllegalArgumentException("INVALID_GENERATION");
            this.generation = generation;
            this.compensatesOperationId = compensatesOperationId == null ? null : key(compensatesOperationId, "INVALID_COMPENSATION");
            if (operationId.equals(compensatesOperationId)) throw new IllegalArgumentException("INVALID_COMPENSATION");
        }

        /** Identity of the request; a different target, amount, approval or key is a different request. */
        String digest() {
            return Engine.digest(String.join("\n", "external-write@1", operationId, owner, workId, target, payloadHash,
                Long.toString(costLimitMinor), currency, approvalId, Long.toString(approvalExpiresAtMs), providerKey,
                Boolean.toString(providerIdempotentRetry), Long.toString(generation),
                compensatesOperationId == null ? "" : compensatesOperationId));
        }
    }

    /** Handed to the transport after the dispatch is durable. */
    public static final class Dispatch {
        public final String operationId, token, providerKey, target, payload, payloadHash;
        public final int attempt;
        Dispatch(Map<String,String> row) {
            operationId = row.get("operation_id"); token = row.get("dispatch_token"); providerKey = row.get("provider_key");
            target = row.get("target"); payload = row.get("payload"); payloadHash = row.get("payload_hash");
            attempt = Integer.parseInt(row.get("attempts"));
        }
    }

    private final Database db;
    private final String session = UUID.randomUUID().toString();

    public ExternalWriteOutbox(Database db) {
        this.db = db;
        db.execute("PRAGMA foreign_keys=ON");
        db.transaction(() -> {
            if (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='outbox_meta'").isEmpty()) {
                db.execute("CREATE TABLE outbox_meta(version INTEGER NOT NULL CHECK(version>=1))");
                db.execute("INSERT INTO outbox_meta VALUES(?)", SCHEMA_VERSION);
                db.execute("CREATE TABLE outbox_operations(operation_id TEXT PRIMARY KEY,request_digest TEXT NOT NULL,owner TEXT NOT NULL,work_id TEXT NOT NULL REFERENCES works(id),target TEXT NOT NULL,payload TEXT NOT NULL,payload_hash TEXT NOT NULL,cost_limit_minor INTEGER NOT NULL CHECK(cost_limit_minor>=0),currency TEXT NOT NULL,approval_id TEXT NOT NULL,approval_expires_at INTEGER NOT NULL,provider_key TEXT NOT NULL UNIQUE,provider_idempotent_retry INTEGER NOT NULL CHECK(provider_idempotent_retry IN(0,1)),generation INTEGER NOT NULL CHECK(generation>=1),compensates_operation_id TEXT REFERENCES outbox_operations(operation_id),state TEXT NOT NULL CHECK(state IN('prepared','dispatched','confirmed','rejected','uncertain','cancelled')),attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),dispatch_token TEXT,dispatch_session TEXT,absence_reported INTEGER NOT NULL DEFAULT 0 CHECK(absence_reported IN(0,1)),provider_reference TEXT,settled_amount_minor INTEGER,resolution TEXT)");
                db.execute("CREATE TABLE outbox_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,operation_id TEXT NOT NULL REFERENCES outbox_operations(operation_id),kind TEXT NOT NULL,at_ms INTEGER NOT NULL)");
            }
            List<Map<String,String>> meta = db.query("SELECT version FROM outbox_meta");
            if (meta.size() != 1 || Integer.parseInt(meta.get(0).get("version")) != SCHEMA_VERSION)
                throw new IllegalStateException("UNSUPPORTED_OUTBOX_SCHEMA");
            return null;
        });
        recoverInterrupted(0);
    }

    /** Persists a prepared external write. Identical re-prepare returns the existing state. */
    public String prepare(Effect effect, Operation op, long nowMs) {
        if (effect != Effect.EXTERNAL_WRITE) throw new IllegalArgumentException("NOT_AN_EXTERNAL_WRITE");
        if (op.approvalExpiresAtMs <= nowMs) throw new SecurityException("APPROVAL_EXPIRED");
        return db.transaction(() -> {
            List<Map<String,String>> old = db.query("SELECT request_digest,state FROM outbox_operations WHERE operation_id=?", op.operationId);
            if (!old.isEmpty()) {
                if (!op.digest().equals(old.get(0).get("request_digest"))) throw new IllegalStateException("OPERATION_CONFLICT");
                return old.get(0).get("state");
            }
            if (!db.query("SELECT 1 FROM outbox_operations WHERE provider_key=?", op.providerKey).isEmpty())
                throw new IllegalStateException("PROVIDER_KEY_REUSED");
            if (op.compensatesOperationId != null && !"confirmed".equals(state(op.compensatesOperationId)))
                throw new IllegalStateException("COMPENSATION_TARGET_NOT_CONFIRMED");
            if (db.query("SELECT 1 FROM works WHERE id=? AND state='active'", op.workId).isEmpty())
                throw new IllegalStateException("WORK_NOT_ACTIVE");
            db.execute("INSERT INTO outbox_operations(operation_id,request_digest,owner,work_id,target,payload,payload_hash,cost_limit_minor,currency,approval_id,approval_expires_at,provider_key,provider_idempotent_retry,generation,compensates_operation_id,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'prepared')",
                op.operationId, op.digest(), op.owner, op.workId, op.target, op.payload, op.payloadHash, op.costLimitMinor,
                op.currency, op.approvalId, op.approvalExpiresAtMs, op.providerKey, op.providerIdempotentRetry ? 1 : 0,
                op.generation, op.compensatesOperationId);
            event(op.operationId, "prepared", nowMs);
            return "prepared";
        });
    }

    /** Write-ahead dispatch: the row is durable as dispatched before the transport may send anything. */
    public Dispatch beginDispatch(String operationId, Authority authority, long nowMs) {
        return db.transaction(() -> {
            recoverInterrupted(nowMs);
            Map<String,String> row = row(operationId);
            if (!"prepared".equals(row.get("state"))) throw new IllegalStateException("NOT_PREPARED");
            if (Long.parseLong(row.get("approval_expires_at")) <= nowMs) throw new SecurityException("APPROVAL_EXPIRED");
            if (authority == null || !authority.permits(operation(row), nowMs)) throw new SecurityException("REAUTHORIZATION_REQUIRED");
            return dispatch(operationId, nowMs);
        });
    }

    /** Transport result for the current dispatch. A stale token (restart, reconciliation) changes nothing. */
    public boolean recordResult(Dispatch dispatch, Observation result, String providerReference, long amountMinor, long nowMs) {
        return db.transaction(() -> {
            Map<String,String> row = row(dispatch.operationId);
            if (!"dispatched".equals(row.get("state")) || !dispatch.token.equals(row.get("dispatch_token"))) return false;
            return settle(row, result, providerReference, amountMinor, row.get("payload_hash"), nowMs, "result");
        });
    }

    /** The transport lost the answer (timeout/disconnect): never treated as failure or retried. */
    public boolean recordUnknown(Dispatch dispatch, long nowMs) {
        return db.transaction(() -> {
            Map<String,String> row = row(dispatch.operationId);
            if (!"dispatched".equals(row.get("state")) || !dispatch.token.equals(row.get("dispatch_token"))) return false;
            markUncertain(dispatch.operationId, nowMs);
            return true;
        });
    }

    /** Provider query by reference or key. The only way out of uncertain besides owner cancel after absence. */
    public String reconcile(String operationId, Observation observed, String providerReference, String observedPayloadHash,
                            long amountMinor, long nowMs) {
        return db.transaction(() -> {
            recoverInterrupted(nowMs);
            Map<String,String> row = row(operationId);
            String state = row.get("state");
            if ("confirmed".equals(state) || "rejected".equals(state)) {
                boolean same = observed.name().toLowerCase(java.util.Locale.ROOT).equals(state)
                    && (providerReference == null ? row.get("provider_reference") == null : providerReference.equals(row.get("provider_reference")));
                if (!same) throw new IllegalStateException("RECONCILIATION_CONFLICT");
                return state;                                    // duplicate observation of a settled result
            }
            if (!"uncertain".equals(state)) throw new IllegalStateException("NOTHING_TO_RECONCILE");
            if (observed == Observation.ABSENT) {
                db.execute("UPDATE outbox_operations SET absence_reported=1 WHERE operation_id=?", operationId);
                event(operationId, "reconciled_absent", nowMs);
                return "uncertain";
            }
            settle(row, observed, providerReference, amountMinor, observedPayloadHash, nowMs, "reconciled");
            return state(operationId);
        });
    }

    /** Same-key resend, allowed only when the provider guarantees idempotent retry and reported the operation absent. */
    public Dispatch redispatch(String operationId, Authority authority, long nowMs) {
        return db.transaction(() -> {
            recoverInterrupted(nowMs);
            Map<String,String> row = row(operationId);
            if (!"uncertain".equals(row.get("state"))) throw new IllegalStateException("NOT_UNCERTAIN");
            if (!"1".equals(row.get("provider_idempotent_retry"))) throw new IllegalStateException("PROVIDER_RETRY_NOT_GUARANTEED");
            if (!"1".equals(row.get("absence_reported"))) throw new IllegalStateException("RECONCILIATION_REQUIRED");
            if (Long.parseLong(row.get("approval_expires_at")) <= nowMs) throw new SecurityException("APPROVAL_EXPIRED");
            if (authority == null || !authority.permits(operation(row), nowMs)) throw new SecurityException("REAUTHORIZATION_REQUIRED");
            db.execute("UPDATE outbox_operations SET absence_reported=0 WHERE operation_id=?", operationId);
            return dispatch(operationId, nowMs);
        });
    }

    /** Owner cancel: before dispatch, or for an uncertain operation the provider reported absent. */
    public void cancel(String operationId, long nowMs) {
        db.transaction(() -> {
            recoverInterrupted(nowMs);
            Map<String,String> row = row(operationId);
            String state = row.get("state");
            if ("cancelled".equals(state)) return null;
            if ("confirmed".equals(state)) throw new IllegalStateException("COMPENSATION_REQUIRED");
            if ("uncertain".equals(state) && !"1".equals(row.get("absence_reported")))
                throw new IllegalStateException("RECONCILIATION_REQUIRED");
            if (!"prepared".equals(state) && !"uncertain".equals(state)) throw new IllegalStateException("CANCEL_NOT_ALLOWED");
            db.execute("UPDATE outbox_operations SET state='cancelled',dispatch_token=NULL,dispatch_session=NULL,resolution='owner_cancel' WHERE operation_id=?", operationId);
            event(operationId, "cancelled", nowMs);
            return null;
        });
    }

    public String state(String operationId) { return row(operationId).get("state"); }
    public Map<String,String> record(String operationId) { return row(operationId); }
    public List<Map<String,String>> events(String operationId) {
        row(operationId);
        return db.query("SELECT seq,kind FROM outbox_events WHERE operation_id=? ORDER BY seq", operationId);
    }

    /** Dispatches opened by another process session are unknown outcomes, never failures to resend. */
    private void recoverInterrupted(long nowMs) {
        db.transaction(() -> {
            for (Map<String,String> r : db.query("SELECT operation_id FROM outbox_operations WHERE state='dispatched' AND (dispatch_session IS NULL OR dispatch_session<>?)", session))
                markUncertain(r.get("operation_id"), nowMs);
            return null;
        });
    }
    private Dispatch dispatch(String operationId, long nowMs) {
        db.execute("UPDATE outbox_operations SET state='dispatched',attempts=attempts+1,dispatch_token=?,dispatch_session=? WHERE operation_id=?",
            UUID.randomUUID().toString(), session, operationId);
        event(operationId, "dispatched", nowMs);
        return new Dispatch(row(operationId));
    }
    private void markUncertain(String operationId, long nowMs) {
        db.execute("UPDATE outbox_operations SET state='uncertain',dispatch_token=NULL,dispatch_session=NULL WHERE operation_id=?", operationId);
        event(operationId, "uncertain", nowMs);
    }
    private boolean settle(Map<String,String> row, Observation result, String providerReference, long amountMinor,
                           String observedPayloadHash, long nowMs, String source) {
        String id = row.get("operation_id");
        if (result == Observation.ABSENT) throw new IllegalArgumentException("ABSENT_IS_NOT_A_RESULT");
        if (result == Observation.CONFIRMED) {
            boolean matches = providerReference != null && providerReference.matches("[A-Za-z0-9._:-]{1,128}")
                && row.get("payload_hash").equals(observedPayloadHash)
                && amountMinor >= 0 && amountMinor <= Long.parseLong(row.get("cost_limit_minor"));
            if (!matches) {                                        // content/amount disagree: owner/provider must resolve
                markUncertain(id, nowMs);
                event(id, source + "_mismatch", nowMs);
                return true;
            }
            db.execute("UPDATE outbox_operations SET state='confirmed',dispatch_token=NULL,dispatch_session=NULL,provider_reference=?,settled_amount_minor=?,resolution=? WHERE operation_id=?",
                providerReference, amountMinor, source, id);
            event(id, source + "_confirmed", nowMs);
        } else {
            db.execute("UPDATE outbox_operations SET state='rejected',dispatch_token=NULL,dispatch_session=NULL,provider_reference=?,resolution=? WHERE operation_id=?",
                providerReference, source, id);
            event(id, source + "_rejected", nowMs);
        }
        return true;
    }
    private Operation operation(Map<String,String> r) {
        return new Operation(r.get("operation_id"), r.get("owner"), r.get("work_id"), r.get("target"), r.get("payload"),
            Long.parseLong(r.get("cost_limit_minor")), r.get("currency"), r.get("approval_id"),
            Long.parseLong(r.get("approval_expires_at")), r.get("provider_key"), "1".equals(r.get("provider_idempotent_retry")),
            Long.parseLong(r.get("generation")), r.get("compensates_operation_id"));
    }
    private Map<String,String> row(String operationId) {
        List<Map<String,String>> rows = db.query("SELECT * FROM outbox_operations WHERE operation_id=?", operationId);
        if (rows.size() != 1) throw new IllegalArgumentException("UNKNOWN_OPERATION");
        Map<String,String> r = rows.get(0);
        if (!operation(r).digest().equals(r.get("request_digest"))) throw new IllegalStateException("OPERATION_RECORD_CORRUPT");
        return r;
    }
    private void event(String operationId, String kind, long nowMs) {
        db.execute("INSERT INTO outbox_events(operation_id,kind,at_ms) VALUES(?,?,?)", operationId, kind, nowMs);
    }
    private static String key(String value, String error) {
        if (value == null || !value.matches("[A-Za-z0-9._:-]{1,128}")) throw new IllegalArgumentException(error);
        return value;
    }
    private static String require(String value, String error) {
        if (value == null || value.isEmpty() || value.length() > 128) throw new IllegalArgumentException(error);
        return value;
    }
}
