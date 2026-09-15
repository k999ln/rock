package dev.rock.core.platform;

import dev.rock.core.Database;
import dev.rock.core.Engine;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Transactional OS-side registry, approval controller and append-only Wallet ledger.
 * No component-provided code runs inside these transactions.
 */
public final class PlatformStore {
    public static final int SCHEMA_VERSION = 2;
    private static final long MAX_APPROVAL_MS = 7L * 24 * 60 * 60 * 1000;
    private final Database db;

    public PlatformStore(Database db) {
        this.db = db;
        db.execute("PRAGMA foreign_keys=ON");
        migrate();
    }

    private void migrate() {
        db.transaction(() -> {
            if (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='platform_meta'").isEmpty()) {
                db.execute("CREATE TABLE platform_meta(version INTEGER NOT NULL CHECK(version>=1))");
                db.execute("INSERT INTO platform_meta VALUES(?)", SCHEMA_VERSION);
                db.execute("CREATE TABLE platform_components(component_id TEXT NOT NULL,kind TEXT NOT NULL,package_name TEXT NOT NULL,version_code INTEGER NOT NULL,api_min INTEGER NOT NULL,api_max INTEGER NOT NULL,uid INTEGER NOT NULL,security_domain TEXT NOT NULL,signing_digest TEXT NOT NULL,permissions TEXT NOT NULL,data_schema_min INTEGER NOT NULL,data_schema_max INTEGER NOT NULL,manifest_digest TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('CANDIDATE','ACTIVE','CACHED','REVOKED')),generation INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(component_id,version_code))");
                db.execute("CREATE UNIQUE INDEX platform_component_active ON platform_components(component_id) WHERE status='ACTIVE'");
                db.execute("CREATE TABLE platform_registration_requests(request_key TEXT PRIMARY KEY,manifest_digest TEXT NOT NULL,component_id TEXT NOT NULL,version_code INTEGER NOT NULL)");
                db.execute("CREATE TABLE platform_approvals(id TEXT PRIMARY KEY,owner TEXT NOT NULL,request_key TEXT NOT NULL,component_id TEXT NOT NULL,action TEXT NOT NULL,payload_digest TEXT NOT NULL,max_cost_minor INTEGER NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN('PROPOSED','ISSUED','CONSUMED','STOPPED','REVOKED','EXPIRED')),component_generation INTEGER NOT NULL,confirmed_at INTEGER,consumed_at INTEGER,UNIQUE(owner,request_key))");
                db.execute("CREATE TABLE platform_ledger(receipt_id TEXT PRIMARY KEY,owner TEXT NOT NULL,request_key TEXT NOT NULL,component_id TEXT NOT NULL,approval_id TEXT,amount_minor INTEGER NOT NULL,currency TEXT NOT NULL,provider_ref TEXT,provider_receipt_digest TEXT,reverses_receipt TEXT,entry_digest TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(owner,request_key),UNIQUE(owner,provider_ref),UNIQUE(owner,reverses_receipt))");
                db.execute("CREATE TABLE platform_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,component_id TEXT,owner TEXT,reference_id TEXT,created_at INTEGER NOT NULL)");
            }
            Map<String,String> meta = one(db.query("SELECT version FROM platform_meta"), "PLATFORM_SCHEMA_MISSING");
            int version = Integer.parseInt(meta.get("version"));
            if (version == 1) {
                db.execute("ALTER TABLE platform_approvals RENAME TO platform_approvals_v1");
                db.execute("CREATE TABLE platform_approvals(id TEXT PRIMARY KEY,owner TEXT NOT NULL,request_key TEXT NOT NULL,component_id TEXT NOT NULL,action TEXT NOT NULL,payload_digest TEXT NOT NULL,max_cost_minor INTEGER NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN('PROPOSED','ISSUED','CONSUMED','STOPPED','REVOKED','EXPIRED')),component_generation INTEGER NOT NULL,confirmed_at INTEGER,consumed_at INTEGER,UNIQUE(owner,request_key))");
                db.execute("INSERT INTO platform_approvals(id,owner,request_key,component_id,action,payload_digest,max_cost_minor,expires_at,state,component_generation,confirmed_at,consumed_at) SELECT id,owner,request_key,component_id,action,payload_digest,max_cost_minor,expires_at,CASE WHEN state='ISSUED' THEN 'STOPPED' ELSE state END,component_generation,NULL,consumed_at FROM platform_approvals_v1");
                db.execute("DROP TABLE platform_approvals_v1");
                db.execute("UPDATE platform_meta SET version=2");
                version = 2;
            }
            if (version != SCHEMA_VERSION) {
                throw new IllegalStateException("UNSUPPORTED_PLATFORM_SCHEMA");
            }
            return null;
        });
    }

    public String register(String requestKey, ComponentManifest manifest, long now) {
        key(requestKey, "INVALID_REGISTRATION_KEY");
        clock(now);
        return db.transaction(() -> {
            List<Map<String,String>> request = db.query("SELECT * FROM platform_registration_requests WHERE request_key=?", requestKey);
            if (!request.isEmpty()) {
                if (!manifest.digest().equals(request.get(0).get("manifest_digest"))) {
                    throw new IllegalStateException("REGISTRATION_REQUEST_CONFLICT");
                }
                return request.get(0).get("manifest_digest");
            }
            if (!db.query("SELECT 1 FROM platform_components WHERE component_id=? AND status='REVOKED' LIMIT 1", manifest.componentId).isEmpty()) {
                throw new SecurityException("COMPONENT_REVOKED");
            }
            List<Map<String,String>> uidOwner = db.query("SELECT component_id FROM platform_components WHERE uid=? AND component_id<>? LIMIT 1", manifest.uid, manifest.componentId);
            if (!uidOwner.isEmpty()) throw new SecurityException("APP_UID_ALREADY_ASSIGNED");
            List<Map<String,String>> packageOwner = db.query("SELECT component_id FROM platform_components WHERE package_name=? AND component_id<>? LIMIT 1", manifest.packageName, manifest.componentId);
            if (!packageOwner.isEmpty()) throw new SecurityException("PACKAGE_ALREADY_ASSIGNED");
            List<Map<String,String>> existing = db.query("SELECT manifest_digest FROM platform_components WHERE component_id=? AND version_code=?", manifest.componentId, manifest.versionCode);
            if (!existing.isEmpty()) {
                if (!manifest.digest().equals(existing.get(0).get("manifest_digest"))) {
                    throw new SecurityException("COMPONENT_VERSION_REPLACED");
                }
            } else {
                db.execute("INSERT INTO platform_components(component_id,kind,package_name,version_code,api_min,api_max,uid,security_domain,signing_digest,permissions,data_schema_min,data_schema_max,manifest_digest,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'CANDIDATE')",
                    manifest.componentId, manifest.kind.name(), manifest.packageName, manifest.versionCode,
                    manifest.apiMin, manifest.apiMax, manifest.uid, manifest.securityDomain,
                    manifest.signingDigest, String.join(",", manifest.permissions),
                    manifest.dataSchemaMin, manifest.dataSchemaMax, manifest.digest());
            }
            db.execute("INSERT INTO platform_registration_requests(request_key,manifest_digest,component_id,version_code) VALUES(?,?,?,?)", requestKey, manifest.digest(), manifest.componentId, manifest.versionCode);
            event("REGISTERED", manifest.componentId, null, requestKey, now);
            return manifest.digest();
        });
    }

    public void activate(String componentId, long versionCode, boolean rollback, long now) {
        id(componentId);
        clock(now);
        db.transaction(() -> {
            ComponentManifest target = manifest(componentId, versionCode);
            List<Map<String,String>> activeRows = db.query("SELECT version_code FROM platform_components WHERE component_id=? AND status='ACTIVE'", componentId);
            long nextGeneration = 1;
            if (!activeRows.isEmpty()) {
                long activeVersion = Long.parseLong(activeRows.get(0).get("version_code"));
                if (activeVersion == versionCode) return null;
                Map<String,String> activeRow = active(componentId);
                nextGeneration = Long.parseLong(activeRow.get("generation")) + 1;
                ComponentManifest current = manifest(componentId, activeVersion);
                int storedDataSchema = current.dataSchemaMax;
                if (rollback) UpdatePolicy.requireRollback(current, target, storedDataSchema);
                else UpdatePolicy.requireUpdate(current, target, storedDataSchema);
                db.execute("UPDATE platform_components SET status='CACHED' WHERE component_id=? AND version_code=?", componentId, activeVersion);
                db.execute("UPDATE platform_approvals SET state='STOPPED' WHERE component_id=? AND state IN('PROPOSED','ISSUED')", componentId);
            } else if (rollback) {
                throw new IllegalStateException("NO_ACTIVE_VERSION");
            }
            db.execute("UPDATE platform_components SET status='ACTIVE',generation=? WHERE component_id=? AND version_code=? AND status IN('CANDIDATE','CACHED')", nextGeneration, componentId, versionCode);
            if (db.query("SELECT 1 FROM platform_components WHERE component_id=? AND version_code=? AND status='ACTIVE'", componentId, versionCode).isEmpty()) {
                throw new IllegalStateException("COMPONENT_NOT_ACTIVATABLE");
            }
            event(rollback ? "ROLLED_BACK" : "ACTIVATED", componentId, null, Long.toString(versionCode), now);
            return null;
        });
    }

    /** Creates a proposal only. A separate owner-authenticated call must confirm it. */
    public String proposeApproval(String owner, String requestKey, String componentId, String action,
        String payloadDigest, long maxCostMinor, long expiresAt, long now) {
        owner(owner); key(requestKey, "INVALID_APPROVAL_KEY"); id(componentId); action(action); digest(payloadDigest);
        clock(now);
        if (maxCostMinor < 0) throw new IllegalArgumentException("INVALID_COST_LIMIT");
        if (expiresAt <= now || expiresAt - now > MAX_APPROVAL_MS) throw new IllegalArgumentException("INVALID_APPROVAL_EXPIRY");
        String canonical = approvalDigest(owner, componentId, action, payloadDigest, maxCostMinor, expiresAt);
        return db.transaction(() -> {
            Map<String,String> active = active(componentId);
            List<Map<String,String>> existing = db.query("SELECT * FROM platform_approvals WHERE owner=? AND request_key=?", owner, requestKey);
            if (!existing.isEmpty()) {
                Map<String,String> old = existing.get(0);
                String oldDigest = approvalDigest(old.get("owner"), old.get("component_id"), old.get("action"), old.get("payload_digest"), Long.parseLong(old.get("max_cost_minor")), Long.parseLong(old.get("expires_at")));
                if (!canonical.equals(oldDigest)) throw new IllegalStateException("APPROVAL_REQUEST_CONFLICT");
                return old.get("id");
            }
            String approvalId = UUID.randomUUID().toString();
            db.execute("INSERT INTO platform_approvals(id,owner,request_key,component_id,action,payload_digest,max_cost_minor,expires_at,state,component_generation) VALUES(?,?,?,?,?,?,?,?, 'PROPOSED',?)",
                approvalId, owner, requestKey, componentId, action, payloadDigest, maxCostMinor, expiresAt, Long.parseLong(active.get("generation")));
            event("APPROVAL_PROPOSED", componentId, owner, approvalId, now);
            return approvalId;
        });
    }

    /** Must be called only after the OS has authenticated the owner and shown the exact scope/cost. */
    public void confirmApproval(String owner, String approvalId, long now) {
        owner(owner); uuid(approvalId, "INVALID_APPROVAL_ID"); clock(now);
        String rejection = db.transaction(() -> {
            Map<String,String> approval = one(db.query("SELECT * FROM platform_approvals WHERE id=?", approvalId), "APPROVAL_NOT_FOUND");
            if (!owner.equals(approval.get("owner"))) throw new SecurityException("APPROVAL_OWNER_MISMATCH");
            if ("ISSUED".equals(approval.get("state"))) return null;
            if (!"PROPOSED".equals(approval.get("state"))) throw new SecurityException("APPROVAL_NOT_CONFIRMABLE");
            if (now >= Long.parseLong(approval.get("expires_at"))) {
                db.execute("UPDATE platform_approvals SET state='EXPIRED' WHERE id=?", approvalId);
                event("APPROVAL_EXPIRED", approval.get("component_id"), owner, approvalId, now);
                return "APPROVAL_EXPIRED";
            }
            Map<String,String> component = active(approval.get("component_id"));
            if (Long.parseLong(approval.get("component_generation")) != Long.parseLong(component.get("generation"))) {
                throw new SecurityException("APPROVAL_COMPONENT_RESTARTED");
            }
            db.execute("UPDATE platform_approvals SET state='ISSUED',confirmed_at=? WHERE id=? AND state='PROPOSED'", now, approvalId);
            event("APPROVAL_CONFIRMED", approval.get("component_id"), owner, approvalId, now);
            return null;
        });
        if (rejection != null) throw new SecurityException(rejection);
    }

    /** Consumes exact approval and commits the Wallet entry in the same transaction. */
    public String recordApproved(String owner, String requestKey, String approvalId, String componentId,
        String action, String payloadDigest, long actualCostMinor, long amountMinor, String currency, long now) {
        owner(owner); key(requestKey, "INVALID_LEDGER_KEY"); uuid(approvalId, "INVALID_APPROVAL_ID");
        id(componentId); action(action); digest(payloadDigest); currency(currency); clock(now);
        if (actualCostMinor < 0) throw new IllegalArgumentException("INVALID_ACTUAL_COST");
        if (amountMinor != -actualCostMinor) throw new IllegalArgumentException("LEDGER_AMOUNT_COST_MISMATCH");
        expireApproval(approvalId, now);
        return db.transaction(() -> {
            String entryDigest = ledgerDigest(owner, componentId, approvalId, action, payloadDigest,
                actualCostMinor, amountMinor, currency, null, null);
            List<Map<String,String>> old = db.query("SELECT receipt_id,entry_digest FROM platform_ledger WHERE owner=? AND request_key=?", owner, requestKey);
            if (!old.isEmpty()) {
                if (!entryDigest.equals(old.get(0).get("entry_digest"))) throw new IllegalStateException("LEDGER_REQUEST_CONFLICT");
                return old.get(0).get("receipt_id");
            }
            consumeApproval(owner, approvalId, componentId, action, payloadDigest, actualCostMinor, now);
            String receiptId = UUID.randomUUID().toString();
            db.execute("INSERT INTO platform_ledger(receipt_id,owner,request_key,component_id,approval_id,amount_minor,currency,entry_digest,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                receiptId, owner, requestKey, componentId, approvalId, amountMinor, currency, entryDigest, now);
            event("LEDGER_RECORDED", componentId, owner, receiptId, now);
            return receiptId;
        });
    }

    /** Records only a positive broker-attested receipt digest from an active Provider component. */
    public String recordProviderReceipt(String owner, String requestKey, String providerId, long amountMinor,
        String currency, String providerRef, String providerReceiptDigest, long now) {
        owner(owner); key(requestKey, "INVALID_LEDGER_KEY"); id(providerId); currency(currency);
        key(providerRef, "INVALID_PROVIDER_REFERENCE"); digest(providerReceiptDigest); clock(now);
        if (amountMinor <= 0) throw new IllegalArgumentException("PROVIDER_RECEIPT_MUST_BE_POSITIVE");
        return db.transaction(() -> {
            Map<String,String> provider = active(providerId);
            if (!ComponentManifest.Kind.PROVIDER.name().equals(provider.get("kind"))) throw new SecurityException("NOT_A_PROVIDER");
            String entryDigest = ledgerDigest(owner, providerId, null, "provider.receipt", providerReceiptDigest,
                0, amountMinor, currency, providerRef, providerReceiptDigest);
            List<Map<String,String>> old = db.query("SELECT receipt_id,entry_digest FROM platform_ledger WHERE owner=? AND request_key=?", owner, requestKey);
            if (!old.isEmpty()) {
                if (!entryDigest.equals(old.get(0).get("entry_digest"))) throw new IllegalStateException("LEDGER_REQUEST_CONFLICT");
                return old.get(0).get("receipt_id");
            }
            if (!db.query("SELECT 1 FROM platform_ledger WHERE owner=? AND provider_ref=?", owner, providerRef).isEmpty()) {
                throw new IllegalStateException("PROVIDER_RECEIPT_DUPLICATE");
            }
            String receiptId = UUID.randomUUID().toString();
            db.execute("INSERT INTO platform_ledger(receipt_id,owner,request_key,component_id,amount_minor,currency,provider_ref,provider_receipt_digest,entry_digest,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                receiptId, owner, requestKey, providerId, amountMinor, currency, providerRef, providerReceiptDigest, entryDigest, now);
            event("PROVIDER_RECEIPT_RECORDED", providerId, owner, receiptId, now);
            return receiptId;
        });
    }

    public String reverse(String owner, String requestKey, String receiptId, long now) {
        owner(owner); key(requestKey, "INVALID_LEDGER_KEY"); uuid(receiptId, "INVALID_RECEIPT_ID"); clock(now);
        return db.transaction(() -> {
            Map<String,String> original = one(db.query("SELECT * FROM platform_ledger WHERE owner=? AND receipt_id=?", owner, receiptId), "RECEIPT_NOT_FOUND");
            long amount = Long.parseLong(original.get("amount_minor"));
            if (amount == Long.MIN_VALUE) throw new IllegalStateException("AMOUNT_OVERFLOW");
            String entryDigest = ledgerDigest(owner, original.get("component_id"), null, "ledger.reversal",
                Engine.digest(receiptId), 0, -amount, original.get("currency"), null, receiptId);
            List<Map<String,String>> old = db.query("SELECT receipt_id,entry_digest FROM platform_ledger WHERE owner=? AND request_key=?", owner, requestKey);
            if (!old.isEmpty()) {
                if (!entryDigest.equals(old.get(0).get("entry_digest"))) throw new IllegalStateException("LEDGER_REQUEST_CONFLICT");
                return old.get(0).get("receipt_id");
            }
            if (original.get("reverses_receipt") != null) throw new IllegalStateException("REVERSAL_CANNOT_BE_REVERSED");
            if (!db.query("SELECT 1 FROM platform_ledger WHERE owner=? AND reverses_receipt=?", owner, receiptId).isEmpty()) {
                throw new IllegalStateException("RECEIPT_ALREADY_REVERSED");
            }
            String reversalId = UUID.randomUUID().toString();
            db.execute("INSERT INTO platform_ledger(receipt_id,owner,request_key,component_id,amount_minor,currency,reverses_receipt,entry_digest,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                reversalId, owner, requestKey, original.get("component_id"), -amount, original.get("currency"), receiptId, entryDigest, now);
            event("LEDGER_REVERSED", original.get("component_id"), owner, reversalId, now);
            return reversalId;
        });
    }

    public long balance(String owner, String currency) {
        owner(owner); currency(currency);
        Map<String,String> row = one(db.query("SELECT COALESCE(SUM(amount_minor),0) AS balance FROM platform_ledger WHERE owner=? AND currency=?", owner, currency), "BALANCE_UNAVAILABLE");
        return Long.parseLong(row.get("balance"));
    }

    public long stop(String componentId, long now) {
        id(componentId); clock(now);
        return db.transaction(() -> {
            Map<String,String> current = active(componentId);
            long generation = Long.parseLong(current.get("generation")) + 1;
            db.execute("UPDATE platform_components SET generation=? WHERE component_id=? AND status='ACTIVE'", generation, componentId);
            db.execute("UPDATE platform_approvals SET state='STOPPED' WHERE component_id=? AND state IN('PROPOSED','ISSUED')", componentId);
            event("STOPPED", componentId, null, Long.toString(generation), now);
            return generation;
        });
    }

    public void revoke(String componentId, long now) {
        id(componentId); clock(now);
        db.transaction(() -> {
            if (db.query("SELECT 1 FROM platform_components WHERE component_id=?", componentId).isEmpty()) throw new IllegalArgumentException("COMPONENT_NOT_FOUND");
            db.execute("UPDATE platform_components SET status='REVOKED',generation=generation+1 WHERE component_id=?", componentId);
            db.execute("UPDATE platform_approvals SET state='REVOKED' WHERE component_id=? AND state IN('PROPOSED','ISSUED')", componentId);
            event("REVOKED", componentId, null, componentId, now);
            return null;
        });
    }

    public List<Map<String,String>> components() {
        return db.query("SELECT component_id,kind,package_name,version_code,uid,security_domain,status,generation FROM platform_components ORDER BY component_id,version_code");
    }

    public List<Map<String,String>> receipts(String owner) {
        owner(owner);
        return db.query("SELECT receipt_id,component_id,amount_minor,currency,provider_ref,reverses_receipt,entry_digest,created_at FROM platform_ledger WHERE owner=? ORDER BY rowid", owner);
    }

    public List<Map<String,String>> events() {
        return db.query("SELECT seq,kind,component_id,owner,reference_id,created_at FROM platform_events ORDER BY seq");
    }

    /** Exact, display-safe proposal fields for the trusted owner-confirmation UI. */
    public Map<String,String> approval(String owner, String approvalId) {
        owner(owner); uuid(approvalId, "INVALID_APPROVAL_ID");
        return one(db.query("SELECT id,component_id,action,payload_digest,max_cost_minor,expires_at,state FROM platform_approvals WHERE owner=? AND id=?", owner, approvalId), "APPROVAL_NOT_FOUND");
    }

    /** Versioned owner-scoped snapshot. Encrypt with EncryptedBackup before writing it anywhere. */
    public byte[] exportBackup(String owner) {
        owner(owner);
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            DataOutputStream out = new DataOutputStream(bytes);
            out.writeUTF(PlatformApi.BACKUP_FORMAT);
            out.writeInt(SCHEMA_VERSION);
            out.writeUTF(owner);
            writeRows(out, components());
            writeRows(out, db.query("SELECT id,request_key,component_id,action,payload_digest,max_cost_minor,expires_at,state,component_generation,confirmed_at,consumed_at FROM platform_approvals WHERE owner=? ORDER BY rowid", owner));
            writeRows(out, db.query("SELECT receipt_id,request_key,component_id,approval_id,amount_minor,currency,provider_ref,provider_receipt_digest,reverses_receipt,entry_digest,created_at FROM platform_ledger WHERE owner=? ORDER BY rowid", owner));
            out.flush();
            return bytes.toByteArray();
        } catch (IOException impossible) {
            throw new IllegalStateException("BACKUP_SERIALIZATION_FAILED", impossible);
        }
    }

    private void consumeApproval(String owner, String approvalId, String componentId, String action,
        String payloadDigest, long actualCostMinor, long now) {
        Map<String,String> approval = one(db.query("SELECT * FROM platform_approvals WHERE id=?", approvalId), "APPROVAL_NOT_FOUND");
        Map<String,String> component = active(componentId);
        if (!owner.equals(approval.get("owner")) || !componentId.equals(approval.get("component_id")) ||
            !action.equals(approval.get("action")) || !payloadDigest.equals(approval.get("payload_digest"))) {
            throw new SecurityException("APPROVAL_SCOPE_MISMATCH");
        }
        if (!"ISSUED".equals(approval.get("state"))) throw new SecurityException("APPROVAL_NOT_ACTIVE");
        if (now >= Long.parseLong(approval.get("expires_at"))) {
            throw new SecurityException("APPROVAL_EXPIRED");
        }
        if (Long.parseLong(approval.get("component_generation")) != Long.parseLong(component.get("generation"))) {
            throw new SecurityException("APPROVAL_COMPONENT_RESTARTED");
        }
        if (actualCostMinor > Long.parseLong(approval.get("max_cost_minor"))) throw new SecurityException("COST_LIMIT_EXCEEDED");
        db.execute("UPDATE platform_approvals SET state='CONSUMED',consumed_at=? WHERE id=? AND state='ISSUED'", now, approvalId);
    }

    private void expireApproval(String approvalId, long now) {
        db.transaction(() -> {
            List<Map<String,String>> rows = db.query("SELECT component_id,owner,expires_at,state FROM platform_approvals WHERE id=?", approvalId);
            if (!rows.isEmpty() && "ISSUED".equals(rows.get(0).get("state")) && now >= Long.parseLong(rows.get(0).get("expires_at"))) {
                db.execute("UPDATE platform_approvals SET state='EXPIRED' WHERE id=? AND state='ISSUED'", approvalId);
                event("APPROVAL_EXPIRED", rows.get(0).get("component_id"), rows.get(0).get("owner"), approvalId, now);
            }
            return null;
        });
    }

    private ComponentManifest manifest(String componentId, long versionCode) {
        Map<String,String> row = one(db.query("SELECT * FROM platform_components WHERE component_id=? AND version_code=?", componentId, versionCode), "COMPONENT_VERSION_NOT_FOUND");
        return new ComponentManifest(
            ComponentManifest.Kind.valueOf(row.get("kind")), row.get("component_id"), row.get("package_name"),
            Long.parseLong(row.get("version_code")), Integer.parseInt(row.get("api_min")), Integer.parseInt(row.get("api_max")),
            Integer.parseInt(row.get("uid")), row.get("security_domain"), row.get("signing_digest"),
            new ArrayList<>(Arrays.asList(row.get("permissions").split(","))),
            Integer.parseInt(row.get("data_schema_min")), Integer.parseInt(row.get("data_schema_max"))
        );
    }

    private Map<String,String> active(String componentId) {
        return one(db.query("SELECT * FROM platform_components WHERE component_id=? AND status='ACTIVE'", componentId), "COMPONENT_NOT_ACTIVE");
    }

    private void event(String kind, String componentId, String owner, String referenceId, long now) {
        db.execute("INSERT INTO platform_events(kind,component_id,owner,reference_id,created_at) VALUES(?,?,?,?,?)", kind, componentId, owner, referenceId, now);
    }

    private static String approvalDigest(String owner, String componentId, String action, String payloadDigest, long maxCost, long expiresAt) {
        return Engine.digest(String.join("\n", owner, componentId, action, payloadDigest, Long.toString(maxCost), Long.toString(expiresAt)));
    }

    private static String ledgerDigest(String owner, String componentId, String approvalId, String action,
        String payloadDigest, long actualCost, long amount, String currency, String providerRef, String evidence) {
        return Engine.digest(String.join("\n", owner, componentId, value(approvalId), action, payloadDigest,
            Long.toString(actualCost), Long.toString(amount), currency, value(providerRef), value(evidence)));
    }

    private static String value(String value) { return value == null ? "-" : value; }
    private static void writeRows(DataOutputStream out, List<Map<String,String>> rows) throws IOException {
        out.writeInt(rows.size());
        for (Map<String,String> row : rows) {
            out.writeInt(row.size());
            for (Map.Entry<String,String> cell : row.entrySet()) {
                out.writeUTF(cell.getKey());
                out.writeBoolean(cell.getValue() != null);
                if (cell.getValue() != null) out.writeUTF(cell.getValue());
            }
        }
    }
    private static Map<String,String> one(List<Map<String,String>> rows, String error) {
        if (rows.size() != 1) throw new IllegalStateException(error);
        return rows.get(0);
    }
    private static void owner(String value) { if (value == null || !value.matches("[A-Za-z0-9:_-]{3,128}")) throw new IllegalArgumentException("INVALID_OWNER"); }
    private static void id(String value) { if (value == null || !value.matches("[a-z0-9]+(?:[._-][a-z0-9]+){2,}")) throw new IllegalArgumentException("INVALID_COMPONENT_ID"); }
    private static void key(String value, String error) { if (value == null || !value.matches("[A-Za-z0-9:._-]{1,160}")) throw new IllegalArgumentException(error); }
    private static void action(String value) { if (value == null || !value.matches("[a-z][a-z0-9._-]{0,79}")) throw new IllegalArgumentException("INVALID_ACTION"); }
    private static void digest(String value) { if (value == null || !value.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("INVALID_DIGEST"); }
    private static void currency(String value) { if (value == null || !value.matches("[A-Z]{3,8}")) throw new IllegalArgumentException("INVALID_CURRENCY"); }
    private static void uuid(String value, String error) { try { UUID.fromString(value); } catch (RuntimeException failure) { throw new IllegalArgumentException(error); } }
    private static void clock(long now) { if (now < 0) throw new IllegalArgumentException("INVALID_CLOCK"); }
}
