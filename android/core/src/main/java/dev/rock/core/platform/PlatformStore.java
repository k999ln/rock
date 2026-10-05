package dev.rock.core.platform;

import dev.rock.core.Database;
import dev.rock.core.Engine;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Transactional OS-side registry, approval controller and append-only Wallet ledger.
 * No component-provided code runs inside these transactions.
 */
public final class PlatformStore {
    public static final int SCHEMA_VERSION = 4;
    /** Internal approval identity; generic component registration/proposals cannot claim it. */
    public static final String A2A_WALLET_APPROVAL_COMPONENT = "org.rockstar.platform.a2a-wallet";
    private static final long MAX_APPROVAL_MS = 7L * 24 * 60 * 60 * 1000;
    private static final long MODEL_PLAN_RESERVATION_MS = 15L * 60 * 1000;
    private static final int RECOVERABLE_STATE_VERSION = 3;
    private static final int MAX_BACKUP_ROWS = 2_000;
    private final Database db;
    private final A2AUsageReceiptVerifier a2aUsageReceiptVerifier;

    @FunctionalInterface
    public interface ModelArtifactVerifier {
        /** Broker verifies the signed manifest, stages bytes, loads the exact model and returns a runtime-bound receipt. */
        String verifyAndLoad(ModelProfileManifest profile);
    }

    public PlatformStore(Database db) {
        this(db, null);
    }

    public PlatformStore(Database db, A2AUsageReceiptVerifier a2aUsageReceiptVerifier) {
        this.db = db;
        this.a2aUsageReceiptVerifier = a2aUsageReceiptVerifier;
        db.execute("PRAGMA foreign_keys=ON");
        migrate();
    }

    private void migrate() {
        db.transaction(() -> {
            if (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='platform_meta'").isEmpty()) {
                db.execute("CREATE TABLE platform_meta(version INTEGER NOT NULL CHECK(version>=1))");
                // Create the established v2 core first; the same transactional v2->v3 migration below
                // installs the model/runtime tables for both fresh and upgraded databases.
                db.execute("INSERT INTO platform_meta VALUES(2)");
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
            if (version == 2) {
                db.execute("CREATE TABLE runtime_manifests(component_id TEXT NOT NULL,version_code INTEGER NOT NULL,manifest_digest TEXT NOT NULL,signing_digest TEXT NOT NULL,api_min INTEGER NOT NULL,api_max INTEGER NOT NULL,model_formats TEXT NOT NULL,plan_schemas TEXT NOT NULL,PRIMARY KEY(component_id,version_code))");
                db.execute("CREATE TABLE model_profiles(profile_id TEXT NOT NULL,version INTEGER NOT NULL,weights_sha256 TEXT NOT NULL,tokenizer_sha256 TEXT NOT NULL,template_sha256 TEXT NOT NULL,license_id TEXT NOT NULL,publisher_id TEXT NOT NULL,signing_key_id TEXT NOT NULL,manifest_signature TEXT NOT NULL,runtime_component_id TEXT NOT NULL,runtime_version_code INTEGER NOT NULL,runtime_api_min INTEGER NOT NULL,runtime_api_max INTEGER NOT NULL,format TEXT NOT NULL,quantization TEXT NOT NULL,context_tokens INTEGER NOT NULL,plan_schema_id TEXT NOT NULL,artifact_bytes INTEGER NOT NULL,min_ram_bytes INTEGER NOT NULL,manifest_digest TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('CANDIDATE','ACTIVE','CACHED','REVOKED')),verified_receipt_digest TEXT,PRIMARY KEY(profile_id,version))");
                db.execute("CREATE UNIQUE INDEX model_profile_one_active ON model_profiles(status) WHERE status='ACTIVE'");
                db.execute("CREATE TABLE model_profile_activation(id INTEGER PRIMARY KEY CHECK(id=1),profile_id TEXT NOT NULL,profile_version INTEGER NOT NULL,generation INTEGER NOT NULL CHECK(generation>=1),verified_receipt_digest TEXT NOT NULL)");
                db.execute("CREATE TABLE model_profile_job_pins(owner TEXT NOT NULL,work_id TEXT NOT NULL,request_digest TEXT NOT NULL,profile_id TEXT NOT NULL,profile_version INTEGER NOT NULL,activation_generation INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(owner,work_id))");
                db.execute("UPDATE platform_meta SET version=3");
                version = 3;
            }
            if (version == 3) {
                db.execute("CREATE TABLE a2a_wallet_reservations(delegation_id TEXT PRIMARY KEY,owner TEXT NOT NULL,parent_job_id TEXT NOT NULL,task_id TEXT NOT NULL,agent_origin TEXT NOT NULL,agent_name TEXT NOT NULL,agent_version TEXT NOT NULL,currency TEXT NOT NULL,pricing_version TEXT NOT NULL,budget_limit_minor INTEGER NOT NULL CHECK(budget_limit_minor>=0),approval_id TEXT NOT NULL,approval_digest TEXT NOT NULL,created_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,held_minor INTEGER NOT NULL CHECK(held_minor>=0),settled_minor INTEGER NOT NULL CHECK(settled_minor>=0),released_minor INTEGER NOT NULL CHECK(released_minor>=0),state TEXT NOT NULL CHECK(state IN('HELD','DISPATCHED','INDETERMINATE','RECOVERY_REQUIRED','SETTLED','RELEASED')),provider_ref TEXT,provider_receipt_digest TEXT,updated_at INTEGER NOT NULL,UNIQUE(owner,provider_ref))");
                db.execute("CREATE INDEX a2a_wallet_reservations_owner_state ON a2a_wallet_reservations(owner,currency,state)");
                db.execute("UPDATE platform_meta SET version=4");
                version = 4;
            }
            if (version != SCHEMA_VERSION) {
                throw new IllegalStateException("UNSUPPORTED_PLATFORM_SCHEMA");
            }
            return null;
        });
    }

    public String register(String requestKey, ComponentManifest manifest, long now) {
        key(requestKey, "INVALID_REGISTRATION_KEY");
        if (manifest == null || A2A_WALLET_APPROVAL_COMPONENT.equals(manifest.componentId))
            throw new SecurityException("PLATFORM_INTERNAL_COMPONENT_RESERVED");
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
        if (A2A_WALLET_APPROVAL_COMPONENT.equals(componentId))
            throw new SecurityException("PLATFORM_INTERNAL_APPROVAL_REQUIRED");
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
            if (A2A_WALLET_APPROVAL_COMPONENT.equals(approval.get("component_id"))) {
                if (!"wallet.a2a.reserve".equals(approval.get("action")) ||
                    Long.parseLong(approval.get("component_generation")) != 1)
                    throw new SecurityException("INTERNAL_A2A_APPROVAL_INVALID");
            } else {
                Map<String,String> component = active(approval.get("component_id"));
                if (Long.parseLong(approval.get("component_generation")) != Long.parseLong(component.get("generation")))
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
            if (actualCostMinor > 0 && hasActiveA2AHolds(owner, currency) &&
                availableBalance(owner, currency) < actualCostMinor)
                throw new SecurityException("A2A_WALLET_FUNDS_RESERVED");
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

    /** Consume a confirmed Broker approval and reserve funded Wallet balance for one exact A2A task. */
    public Map<String,String> reserveA2ABudget(String approvalId, String brokerComponentId,
        String payloadDigest, A2AUsageReceiptVerifier.Hold hold, long now) {
        if (hold == null) throw new IllegalArgumentException("A2A_WALLET_HOLD_REQUIRED");
        owner(hold.ownerUserId); uuid(approvalId, "INVALID_APPROVAL_ID"); id(brokerComponentId);
        action("wallet.a2a.reserve"); digest(payloadDigest); clock(now);
        if (!a2aBudgetPayloadDigest(hold).equals(payloadDigest))
            throw new SecurityException("A2A_WALLET_APPROVAL_DIGEST_MISMATCH");
        return db.transaction(() -> {
            List<Map<String,String>> existing = db.query("SELECT * FROM a2a_wallet_reservations WHERE delegation_id=?", hold.delegationId);
            if (!existing.isEmpty()) {
                if (!sameA2AHold(existing.get(0), hold) || !approvalId.equals(existing.get(0).get("approval_id")) ||
                    !payloadDigest.equals(existing.get(0).get("approval_digest")))
                    throw new IllegalStateException("A2A_WALLET_RESERVATION_CONFLICT");
                return existing.get(0);
            }
            if (now < hold.createdAt || now >= hold.deadlineAt) throw new SecurityException("A2A_WALLET_RESERVATION_EXPIRED");
            long available = availableBalance(hold.ownerUserId, hold.currency);
            if (available < hold.limitMinor) throw new SecurityException("A2A_WALLET_INSUFFICIENT_FUNDS");
            consumeApproval(hold.ownerUserId, approvalId, brokerComponentId,
                "wallet.a2a.reserve", payloadDigest, hold.limitMinor, now);
            db.execute("INSERT INTO a2a_wallet_reservations(delegation_id,owner,parent_job_id,task_id,agent_origin,agent_name,agent_version,currency,pricing_version,budget_limit_minor,approval_id,approval_digest,created_at,deadline_at,held_minor,settled_minor,released_minor,state,provider_ref,provider_receipt_digest,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,'HELD',NULL,NULL,?)",
                hold.delegationId, hold.ownerUserId, hold.parentJobId, hold.taskId, hold.agentOrigin,
                hold.agentName, hold.agentVersion, hold.currency, hold.pricingVersion, hold.limitMinor,
                approvalId, payloadDigest, hold.createdAt, hold.deadlineAt, hold.limitMinor, now);
            event("A2A_WALLET_RESERVED", brokerComponentId, hold.ownerUserId, hold.delegationId, now);
            return a2aWalletReservation(hold.ownerUserId, hold.delegationId);
        });
    }

    /** Propose the exact native Wallet cap; owner confirmation remains a separate device-credential step. */
    public String proposeA2AWalletApproval(String owner, String requestKey,
        A2AUsageReceiptVerifier.Hold hold, long expiresAt, long now) {
        owner(owner); key(requestKey, "INVALID_APPROVAL_KEY"); clock(now);
        if (hold == null || !owner.equals(hold.ownerUserId) || hold.requestSha256.isEmpty() ||
            hold.priceQuoteDigest.isEmpty() || hold.limitMinor < 1 || now < hold.createdAt ||
            now >= hold.deadlineAt || expiresAt <= now || expiresAt > hold.deadlineAt ||
            expiresAt - now > MAX_APPROVAL_MS)
            throw new IllegalArgumentException("INVALID_A2A_WALLET_APPROVAL");
        String action = "wallet.a2a.reserve";
        String payloadDigest = a2aBudgetPayloadDigest(hold);
        String approvalDigest = approvalDigest(owner, A2A_WALLET_APPROVAL_COMPONENT,
            action, payloadDigest, hold.limitMinor, expiresAt);
        return db.transaction(() -> {
            List<Map<String,String>> existing = db.query(
                "SELECT * FROM platform_approvals WHERE owner=? AND request_key=?", owner, requestKey);
            if (!existing.isEmpty()) {
                Map<String,String> old = existing.get(0);
                String oldDigest = approvalDigest(old.get("owner"), old.get("component_id"),
                    old.get("action"), old.get("payload_digest"), Long.parseLong(old.get("max_cost_minor")),
                    Long.parseLong(old.get("expires_at")));
                if (!approvalDigest.equals(oldDigest) ||
                    !A2A_WALLET_APPROVAL_COMPONENT.equals(old.get("component_id")))
                    throw new IllegalStateException("A2A_WALLET_APPROVAL_CONFLICT");
                return old.get("id");
            }
            String approvalId = UUID.randomUUID().toString();
            db.execute("INSERT INTO platform_approvals(id,owner,request_key,component_id,action,payload_digest,max_cost_minor,expires_at,state,component_generation) VALUES(?,?,?,?,?,?,?,?, 'PROPOSED',1)",
                approvalId, owner, requestKey, A2A_WALLET_APPROVAL_COMPONENT, action,
                payloadDigest, hold.limitMinor, expiresAt);
            event("A2A_WALLET_APPROVAL_PROPOSED", A2A_WALLET_APPROVAL_COMPONENT, owner, approvalId, now);
            return approvalId;
        });
    }

    /**
     * Require an unspent native reservation whose original owner approval included the exact provider quote.
     * The quote digest is committed into approval_digest, so no extra quote column or backup migration is needed.
     */
    public Map<String,String> requireHeldQuoteBoundA2ABudget(A2AUsageReceiptVerifier.Hold expected, long now) {
        if (expected == null || expected.requestSha256.isEmpty() || expected.priceQuoteDigest.isEmpty())
            throw new SecurityException("A2A_REQUEST_BOUND_SIGNED_PRICE_QUOTE_REQUIRED");
        owner(expected.ownerUserId); clock(now);
        Map<String,String> row = a2aWalletReservation(expected.ownerUserId, expected.delegationId);
        if (!"HELD".equals(row.get("state")) || now < expected.createdAt || now >= expected.deadlineAt
            || !sameA2AHold(row, expected)
            || !a2aBudgetPayloadDigest(expected).equals(row.get("approval_digest")))
            throw new SecurityException("A2A_QUOTE_BOUND_WALLET_HOLD_MISMATCH");
        return row;
    }

    /**
     * Sign the Cloud Broker authorization only after the same request and signed quote are held in the
     * native Wallet. The stable task identity is the Cloud delegation ID; the Provider's remote task
     * ID arrives later inside its signed usage receipt and is checked through that delegation binding.
     */
    public Map<String,Object> authorizeHeldA2ADelegation(A2ABrokerAuthorization.Intent intent,
        String authorityId, String deviceRef, String keyId, long now,
        A2AWalletHandoffRequest.Signer signer) {
        if (intent == null) throw new IllegalArgumentException("A2A_BROKER_INTENT_REQUIRED");
        Map<String,String> row = a2aWalletReservation(intent.ownerUserId, intent.delegationId);
        A2AUsageReceiptVerifier.Hold expected = new A2AUsageReceiptVerifier.Hold(
            intent.ownerUserId, intent.parentJobId, intent.delegationId, intent.delegationId,
            intent.targetOrigin, intent.targetAgentName, intent.targetAgentVersion,
            intent.budgetCurrency, intent.pricingVersion, intent.requestSha256,
            intent.priceQuoteDigest, intent.budgetLimitMinor, intent.parentBudgetLimitMinor,
            Long.parseLong(row.get("created_at")), intent.deadlineAt);
        requireHeldQuoteBoundA2ABudget(expected, now);
        return A2ABrokerAuthorization.create(intent, authorityId, deviceRef, keyId, now, signer);
    }

    /** Fence a hold before an authorized one-shot cloud dispatch. */
    public Map<String,String> markA2ABudgetDispatched(String owner, String delegationId, long now) {
        owner(owner); identifier(delegationId, "INVALID_DELEGATION_ID"); clock(now);
        return db.transaction(() -> {
            Map<String,String> hold = a2aWalletReservation(owner, delegationId);
            if (!"HELD".equals(hold.get("state"))) throw new IllegalStateException("A2A_WALLET_NOT_DISPATCHABLE");
            if (now >= Long.parseLong(hold.get("deadline_at"))) throw new SecurityException("A2A_WALLET_RESERVATION_EXPIRED");
            db.execute("UPDATE a2a_wallet_reservations SET state='DISPATCHED',updated_at=? WHERE owner=? AND delegation_id=? AND state='HELD'",
                now, owner, delegationId);
            event("A2A_WALLET_DISPATCHED", null, owner, delegationId, now);
            return a2aWalletReservation(owner, delegationId);
        });
    }

    /** Recover the local fence when an owner-authenticated Cloud readback proves approval/dispatch began. */
    public Map<String,String> reconcileA2ABudgetDispatched(String owner, String delegationId,
        String cloudState, long now) {
        owner(owner); identifier(delegationId, "INVALID_DELEGATION_ID"); clock(now);
        if (!Set.of("prepared", "dispatching", "dispatch_submitting", "indeterminate", "submitted",
                "working", "awaiting_remote_input", "cancel_requested", "cancel_submitting",
                "cancel_unconfirmed", "remote_cancelled", "remote_completed", "remote_failed",
                "remote_rejected").contains(cloudState))
            throw new SecurityException("A2A_CLOUD_STATE_NOT_DISPATCHED");
        return db.transaction(() -> {
            Map<String,String> hold = a2aWalletReservation(owner, delegationId);
            String state = hold.get("state");
            if ("HELD".equals(state)) {
                db.execute("UPDATE a2a_wallet_reservations SET state='DISPATCHED',updated_at=? WHERE owner=? AND delegation_id=? AND state='HELD'",
                    now, owner, delegationId);
                event("A2A_WALLET_CLOUD_APPROVAL_RECONCILED", null, owner, delegationId, now);
                return a2aWalletReservation(owner, delegationId);
            }
            if (Set.of("DISPATCHED", "INDETERMINATE", "RECOVERY_REQUIRED", "SETTLED").contains(state))
                return hold;
            throw new IllegalStateException("A2A_WALLET_RECONCILE_STATE_CONFLICT");
        });
    }

    /** Preserve a dispatched hold when the remote result is ambiguous; it cannot be released or resent. */
    public Map<String,String> markA2ABudgetIndeterminate(String owner, String delegationId, long now) {
        owner(owner); identifier(delegationId, "INVALID_DELEGATION_ID"); clock(now);
        return db.transaction(() -> {
            Map<String,String> hold = a2aWalletReservation(owner, delegationId);
            if ("INDETERMINATE".equals(hold.get("state"))) return hold;
            if (!"DISPATCHED".equals(hold.get("state"))) throw new IllegalStateException("A2A_WALLET_NOT_DISPATCHED");
            db.execute("UPDATE a2a_wallet_reservations SET state='INDETERMINATE',updated_at=? WHERE owner=? AND delegation_id=? AND state='DISPATCHED'",
                now, owner, delegationId);
            event("A2A_WALLET_INDETERMINATE", null, owner, delegationId, now);
            return a2aWalletReservation(owner, delegationId);
        });
    }

    /** Freeze an HELD cap when a Cloud approval request may have crossed the network boundary. */
    public Map<String,String> fenceA2ABudgetForUnknownDispatch(String owner, String delegationId, long now) {
        owner(owner); identifier(delegationId, "INVALID_DELEGATION_ID"); clock(now);
        return db.transaction(() -> {
            Map<String,String> hold = a2aWalletReservation(owner, delegationId);
            String state = hold.get("state");
            if ("HELD".equals(state) || "DISPATCHED".equals(state)) {
                db.execute("UPDATE a2a_wallet_reservations SET state='INDETERMINATE',updated_at=? WHERE owner=? AND delegation_id=? AND state=?",
                    now, owner, delegationId, state);
                event("A2A_WALLET_DISPATCH_UNKNOWN", null, owner, delegationId, now);
                return a2aWalletReservation(owner, delegationId);
            }
            if (Set.of("INDETERMINATE", "RECOVERY_REQUIRED", "SETTLED").contains(state)) return hold;
            throw new IllegalStateException("A2A_WALLET_UNKNOWN_STATE_CONFLICT");
        });
    }

    /** Release funds only while the hold is still provably pre-dispatch. */
    public Map<String,String> releaseA2ABudgetBeforeDispatch(String owner, String delegationId, long now) {
        owner(owner); identifier(delegationId, "INVALID_DELEGATION_ID"); clock(now);
        return db.transaction(() -> {
            Map<String,String> hold = a2aWalletReservation(owner, delegationId);
            if ("RELEASED".equals(hold.get("state"))) return hold;
            if (!"HELD".equals(hold.get("state"))) throw new IllegalStateException("A2A_WALLET_RELEASE_AFTER_DISPATCH_FORBIDDEN");
            db.execute("UPDATE a2a_wallet_reservations SET state='RELEASED',held_minor=0,released_minor=budget_limit_minor,updated_at=? WHERE owner=? AND delegation_id=? AND state='HELD'",
                now, owner, delegationId);
            event("A2A_WALLET_RELEASED", null, owner, delegationId, now);
            return a2aWalletReservation(owner, delegationId);
        });
    }

    /** Verify the Provider receipt and settle the original hold atomically with an append-only ledger debit. */
    public String settleA2ABudget(String owner, String delegationId, String requestKey,
        Map<String,Object> receipt, long now) {
        owner(owner); identifier(delegationId, "INVALID_DELEGATION_ID"); key(requestKey, "INVALID_LEDGER_KEY"); clock(now);
        if (a2aUsageReceiptVerifier == null) throw new SecurityException("A2A_USAGE_RECEIPT_VERIFIER_UNAVAILABLE");
        Map<String,String> observed = a2aWalletReservation(owner, delegationId);
        String state = observed.get("state");
        if (!Set.of("DISPATCHED", "INDETERMINATE", "RECOVERY_REQUIRED", "SETTLED").contains(state))
            throw new IllegalStateException("A2A_WALLET_NOT_SETTLEABLE");
        A2AUsageReceiptVerifier.Hold intent = holdFromReservation(observed);
        String receiptDigest = a2aUsageReceiptVerifier.verify(receipt, intent, now);
        long amountMinor = ((Number) receipt.get("amountMinor")).longValue();
        String providerRef = Engine.digest(receipt.get("providerId") + "\n" + receipt.get("receiptId"));
        String entryDigest = ledgerDigest(owner, "org.rockstar.a2a.wallet", null,
            "wallet.a2a.settle", receiptDigest, amountMinor, -amountMinor,
            intent.currency, providerRef, receiptDigest);
        return db.transaction(() -> {
            List<Map<String,String>> prior = db.query("SELECT receipt_id,entry_digest FROM platform_ledger WHERE owner=? AND request_key=?", owner, requestKey);
            if (!prior.isEmpty()) {
                if (!entryDigest.equals(prior.get(0).get("entry_digest"))) throw new IllegalStateException("LEDGER_REQUEST_CONFLICT");
                return prior.get(0).get("receipt_id");
            }
            Map<String,String> current = a2aWalletReservation(owner, delegationId);
            if (!sameA2AHold(current, intent) || !Set.of("DISPATCHED", "INDETERMINATE", "RECOVERY_REQUIRED").contains(current.get("state")))
                throw new IllegalStateException("A2A_WALLET_RESERVATION_CHANGED");
            if (!db.query("SELECT 1 FROM platform_ledger WHERE owner=? AND provider_ref=?", owner, providerRef).isEmpty())
                throw new IllegalStateException("PROVIDER_RECEIPT_DUPLICATE");
            String ledgerReceiptId = UUID.randomUUID().toString();
            db.execute("INSERT INTO platform_ledger(receipt_id,owner,request_key,component_id,approval_id,amount_minor,currency,provider_ref,provider_receipt_digest,reverses_receipt,entry_digest,created_at) VALUES(?,?,?,?,NULL,?,?,?, ?,NULL,?,?)",
                ledgerReceiptId, owner, requestKey, "org.rockstar.a2a.wallet", -amountMinor,
                intent.currency, providerRef, receiptDigest, entryDigest, now);
            long released = intent.limitMinor - amountMinor;
            db.execute("UPDATE a2a_wallet_reservations SET state='SETTLED',held_minor=0,settled_minor=?,released_minor=?,provider_ref=?,provider_receipt_digest=?,updated_at=? WHERE owner=? AND delegation_id=?",
                amountMinor, released, providerRef, receiptDigest, now, owner, delegationId);
            event("A2A_WALLET_SETTLED", "org.rockstar.a2a.wallet", owner, ledgerReceiptId, now);
            return ledgerReceiptId;
        });
    }

    /** Validate the read-only Cloud handoff envelope, then independently verify and settle its Provider receipt. */
    public String applyA2AWalletSettlementHandoff(String owner, String delegationId,
        Map<String,Object> handoff, long now) {
        owner(owner); identifier(delegationId, "INVALID_DELEGATION_ID"); clock(now);
        if (handoff == null || !handoff.keySet().equals(Set.of(
            "schema", "state", "idempotencyKey", "receiptSha256", "reservation", "walletCommand")))
            throw new SecurityException("INVALID_A2A_WALLET_HANDOFF");
        requireHandoffString(handoff, "schema", "rock-a2a-wallet-settlement-handoff/1");
        requireHandoffString(handoff, "state", "ready_for_device_wallet");
        String idempotencyKey = handoffString(handoff.get("idempotencyKey"));
        key(idempotencyKey, "INVALID_A2A_HANDOFF_KEY");
        digest(handoffString(handoff.get("receiptSha256")));
        Map<String,Object> reservation = handoffMap(handoff.get("reservation"), Set.of(
            "ownerUserId", "delegationId", "parentJobId", "currency", "reservedMinor",
            "settledMinor", "deadlineAt", "authorizationSha256"));
        Map<String,Object> command = handoffMap(handoff.get("walletCommand"), Set.of(
            "v", "op", "key", "delegation_id", "receipt"));
        if (handoffInteger(command.get("v")) != 1 ||
            !"a2a.budget.settle".equals(handoffString(command.get("op"))) ||
            !idempotencyKey.equals(handoffString(command.get("key"))) ||
            !delegationId.equals(handoffString(command.get("delegation_id"))))
            throw new SecurityException("A2A_WALLET_HANDOFF_COMMAND_MISMATCH");
        Map<String,String> stored = a2aWalletReservation(owner, delegationId);
        if (!owner.equals(handoffString(reservation.get("ownerUserId"))) ||
            !delegationId.equals(handoffString(reservation.get("delegationId"))) ||
            !stored.get("parent_job_id").equals(handoffString(reservation.get("parentJobId"))) ||
            !stored.get("currency").equals(handoffString(reservation.get("currency"))) ||
            Long.parseLong(stored.get("budget_limit_minor")) != handoffInteger(reservation.get("reservedMinor")) ||
            Long.parseLong(stored.get("deadline_at")) != handoffInteger(reservation.get("deadlineAt")))
            throw new SecurityException("A2A_WALLET_HANDOFF_RESERVATION_MISMATCH");
        digest(handoffString(reservation.get("authorizationSha256")));
        if (!(command.get("receipt") instanceof Map<?,?>))
            throw new SecurityException("INVALID_A2A_HANDOFF_RECEIPT");
        @SuppressWarnings("unchecked") Map<String,Object> receipt = (Map<String,Object>) command.get("receipt");
        long receiptAmount = handoffInteger(receipt.get("amountMinor"));
        if (receiptAmount != handoffInteger(reservation.get("settledMinor")))
            throw new SecurityException("A2A_WALLET_HANDOFF_AMOUNT_MISMATCH");
        return settleA2ABudget(owner, delegationId, idempotencyKey, receipt, now);
    }

    public Map<String,String> a2aWalletReservation(String owner, String delegationId) {
        owner(owner); identifier(delegationId, "INVALID_DELEGATION_ID");
        return one(db.query("SELECT delegation_id,owner,parent_job_id,task_id,agent_origin,agent_name,agent_version,currency,pricing_version,budget_limit_minor,approval_id,approval_digest,created_at,deadline_at,held_minor,settled_minor,released_minor,state,provider_ref,provider_receipt_digest,updated_at FROM a2a_wallet_reservations WHERE owner=? AND delegation_id=?", owner, delegationId), "A2A_WALLET_RESERVATION_NOT_FOUND");
    }

    /** Optional owner-scoped lookup for idempotent reservation recovery. */
    public Map<String,String> findA2AWalletReservation(String owner, String delegationId) {
        owner(owner); identifier(delegationId, "INVALID_DELEGATION_ID");
        List<Map<String,String>> rows = db.query("SELECT delegation_id,owner,parent_job_id,task_id,agent_origin,agent_name,agent_version,currency,pricing_version,budget_limit_minor,approval_id,approval_digest,created_at,deadline_at,held_minor,settled_minor,released_minor,state,provider_ref,provider_receipt_digest,updated_at FROM a2a_wallet_reservations WHERE owner=? AND delegation_id=?", owner, delegationId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public long availableBalance(String owner, String currency) {
        owner(owner); currency(currency);
        long reserved = Long.parseLong(one(db.query("SELECT COALESCE(SUM(held_minor),0) AS total FROM a2a_wallet_reservations WHERE owner=? AND currency=? AND state IN('HELD','DISPATCHED','INDETERMINATE','RECOVERY_REQUIRED')", owner, currency), "A2A_WALLET_BALANCE_UNAVAILABLE").get("total"));
        return Math.subtractExact(balance(owner, currency), reserved);
    }

    public String reverse(String owner, String requestKey, String receiptId, long now) {
        owner(owner); key(requestKey, "INVALID_LEDGER_KEY"); uuid(receiptId, "INVALID_RECEIPT_ID"); clock(now);
        return db.transaction(() -> {
            Map<String,String> original = one(db.query("SELECT * FROM platform_ledger WHERE owner=? AND receipt_id=?", owner, receiptId), "RECEIPT_NOT_FOUND");
            long amount = Long.parseLong(original.get("amount_minor"));
            if (amount == Long.MIN_VALUE) throw new IllegalStateException("AMOUNT_OVERFLOW");
            long reversalAmount = -amount;
            if (reversalAmount < 0 && hasActiveA2AHolds(owner, original.get("currency")) &&
                availableBalance(owner, original.get("currency")) < -reversalAmount)
                throw new SecurityException("A2A_WALLET_FUNDS_RESERVED");
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

    /** Runtime identity remains anchored to a currently active, signer-verified Broker component. */
    public String registerRuntimeManifest(RuntimeManifest manifest) {
        if (manifest == null) throw new IllegalArgumentException("RUNTIME_MANIFEST_REQUIRED");
        return db.transaction(() -> {
            Map<String,String> component = active(manifest.componentId);
            if (!ComponentManifest.Kind.TOOL.name().equals(component.get("kind"))
                || !hasPermission(manifest.componentId, Long.parseLong(component.get("version_code")), "local-ai.inference"))
                throw new SecurityException("RUNTIME_COMPONENT_NOT_AUTHORIZED");
            if (Long.parseLong(component.get("version_code")) != manifest.versionCode
                || !manifest.signingDigest.equals(component.get("signing_digest")))
                throw new SecurityException("RUNTIME_IDENTITY_MISMATCH");
            ComponentManifest declared = manifest(manifest.componentId, manifest.versionCode);
            if (manifest.apiMin < declared.apiMin || manifest.apiMax > declared.apiMax)
                throw new SecurityException("RUNTIME_API_OUTSIDE_COMPONENT_RANGE");
            List<Map<String,String>> old = db.query("SELECT manifest_digest FROM runtime_manifests WHERE component_id=? AND version_code=?", manifest.componentId, manifest.versionCode);
            if (!old.isEmpty()) {
                if (!manifest.digest().equals(old.get(0).get("manifest_digest"))) throw new SecurityException("RUNTIME_MANIFEST_REPLACED");
                return manifest.digest();
            }
            db.execute("INSERT INTO runtime_manifests(component_id,version_code,manifest_digest,signing_digest,api_min,api_max,model_formats,plan_schemas) VALUES(?,?,?,?,?,?,?,?)",
                manifest.componentId, manifest.versionCode, manifest.digest(), manifest.signingDigest,
                manifest.apiMin, manifest.apiMax, String.join(",", manifest.modelFormats), String.join(",", manifest.planSchemas));
            return manifest.digest();
        });
    }

    /** Exact previously registered runtime contract used by the Broker's profile installer. */
    public RuntimeManifest runtimeManifest(String componentId, long versionCode) {
        id(componentId);
        if (versionCode < 1) throw new IllegalArgumentException("INVALID_RUNTIME_VERSION");
        Map<String,String> row = one(db.query("SELECT * FROM runtime_manifests WHERE component_id=? AND version_code=?",
            componentId, versionCode), "RUNTIME_MANIFEST_NOT_REGISTERED");
        return new RuntimeManifest(row.get("component_id"), Long.parseLong(row.get("version_code")),
            row.get("signing_digest"), Integer.parseInt(row.get("api_min")), Integer.parseInt(row.get("api_max")),
            split(row.get("model_formats")), split(row.get("plan_schemas")));
    }

    /** Registration creates only a candidate; it neither downloads nor verifies model bytes. */
    public String registerModelProfile(ModelProfileManifest profile) {
        if (profile == null) throw new IllegalArgumentException("MODEL_PROFILE_REQUIRED");
        return db.transaction(() -> {
            List<Map<String,String>> runtimeRows = db.query("SELECT * FROM runtime_manifests WHERE component_id=? AND version_code=?",
                profile.runtimeComponentId, profile.runtimeVersionCode);
            Map<String,String> runtimeRow = one(runtimeRows, "RUNTIME_MANIFEST_NOT_REGISTERED");
            RuntimeManifest runtime = new RuntimeManifest(runtimeRow.get("component_id"),
                Long.parseLong(runtimeRow.get("version_code")), runtimeRow.get("signing_digest"),
                Integer.parseInt(runtimeRow.get("api_min")), Integer.parseInt(runtimeRow.get("api_max")),
                split(runtimeRow.get("model_formats")), split(runtimeRow.get("plan_schemas")));
            if (!profile.accepts(runtime)) throw new SecurityException("PROFILE_RUNTIME_INCOMPATIBLE");
            List<Map<String,String>> old = db.query("SELECT manifest_digest FROM model_profiles WHERE profile_id=? AND version=?", profile.profileId, profile.version);
            if (!old.isEmpty()) {
                if (!profile.digest().equals(old.get(0).get("manifest_digest"))) throw new SecurityException("MODEL_PROFILE_REPLACED");
                return profile.digest();
            }
            db.execute("INSERT INTO model_profiles(profile_id,version,weights_sha256,tokenizer_sha256,template_sha256,license_id,publisher_id,signing_key_id,manifest_signature,runtime_component_id,runtime_version_code,runtime_api_min,runtime_api_max,format,quantization,context_tokens,plan_schema_id,artifact_bytes,min_ram_bytes,manifest_digest,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'CANDIDATE')",
                profile.profileId, profile.version, profile.weightsSha256, profile.tokenizerSha256, profile.templateSha256,
                profile.licenseId, profile.publisherId, profile.signingKeyId, profile.manifestSignatureBase64Url,
                profile.runtimeComponentId, profile.runtimeVersionCode, profile.runtimeApiMin,
                profile.runtimeApiMax, profile.format, profile.quantization, profile.contextTokens,
                profile.planSchemaId, profile.artifactBytes, profile.minRamBytes, profile.digest());
            return profile.digest();
        });
    }

    /** Activation follows Broker verification, staging and successful runtime load; callers cannot submit a pass flag. */
    public long activateModelProfile(String profileId, long version, ModelArtifactVerifier verifier, long now) {
        id(profileId); clock(now);
        if (verifier == null) throw new SecurityException("MODEL_VERIFIER_REQUIRED");
        Map<String,String> candidate = one(db.query("SELECT * FROM model_profiles WHERE profile_id=? AND version=?", profileId, version), "MODEL_PROFILE_NOT_FOUND");
        ModelProfileManifest targetProfile = toProfile(candidate);
        Map<String,String> componentBeforeLoad = active(targetProfile.runtimeComponentId);
        if (Long.parseLong(componentBeforeLoad.get("version_code")) != targetProfile.runtimeVersionCode)
            throw new SecurityException("PROFILE_RUNTIME_NOT_ACTIVE");
        if (!targetProfile.accepts(runtimeManifest(targetProfile.runtimeComponentId, targetProfile.runtimeVersionCode)))
            throw new SecurityException("PROFILE_RUNTIME_INCOMPATIBLE");
        requireNoConflictingModelJobs(profileId, version, now);
        String verifiedReceiptDigest = verifier.verifyAndLoad(targetProfile);
        digest(verifiedReceiptDigest);
        return db.transaction(() -> {
            requireNoConflictingModelJobs(profileId, version, now);
            Map<String,String> target = one(db.query("SELECT * FROM model_profiles WHERE profile_id=? AND version=?", profileId, version), "MODEL_PROFILE_NOT_FOUND");
            if (!target.get("manifest_digest").equals(toProfile(target).digest())) throw new SecurityException("MODEL_PROFILE_MANIFEST_DRIFT");
            if ("REVOKED".equals(target.get("status"))) throw new SecurityException("MODEL_PROFILE_REVOKED");
            List<Map<String,String>> activePointer = db.query("SELECT * FROM model_profile_activation WHERE id=1");
            long generation = activePointer.isEmpty() ? 1 : Long.parseLong(activePointer.get(0).get("generation")) + 1;
            if (!activePointer.isEmpty() && profileId.equals(activePointer.get(0).get("profile_id"))
                && version == Long.parseLong(activePointer.get(0).get("profile_version"))) return generation - 1;
            Map<String,String> component = active(target.get("runtime_component_id"));
            if (Long.parseLong(component.get("version_code")) != Long.parseLong(target.get("runtime_version_code")))
                throw new SecurityException("PROFILE_RUNTIME_NOT_ACTIVE");
            String oldProfile = activePointer.isEmpty() ? null : activePointer.get(0).get("profile_id");
            long oldVersion = activePointer.isEmpty() ? -1 : Long.parseLong(activePointer.get(0).get("profile_version"));
            if (oldProfile != null) db.execute("UPDATE model_profiles SET status='CACHED' WHERE profile_id=? AND version=? AND status='ACTIVE'", oldProfile, oldVersion);
            db.execute("UPDATE model_profiles SET status='ACTIVE',verified_receipt_digest=? WHERE profile_id=? AND version=? AND status IN('CANDIDATE','CACHED')",
                verifiedReceiptDigest, profileId, version);
            if (db.query("SELECT 1 FROM model_profiles WHERE profile_id=? AND version=? AND status='ACTIVE'", profileId, version).isEmpty())
                throw new IllegalStateException("MODEL_PROFILE_NOT_ACTIVATABLE");
            if (activePointer.isEmpty()) db.execute("INSERT INTO model_profile_activation(id,profile_id,profile_version,generation,verified_receipt_digest) VALUES(1,?,?,?,?)", profileId, version, generation, verifiedReceiptDigest);
            else db.execute("UPDATE model_profile_activation SET profile_id=?,profile_version=?,generation=?,verified_receipt_digest=? WHERE id=1", profileId, version, generation, verifiedReceiptDigest);
            event("MODEL_PROFILE_ACTIVATED", target.get("runtime_component_id"), null, profileId + "@" + version, now);
            return generation;
        });
    }

    /** The installed runtime holds one model context, so switching waits for every other pinned job to end. */
    private void requireNoConflictingModelJobs(String targetProfileId, long targetVersion, long now) {
        long reservationCutoff = Math.max(0, now - MODEL_PLAN_RESERVATION_MS);
        boolean hasWorkTable = !db.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='works'").isEmpty();
        String sql = hasWorkTable
            ? "SELECT 1 FROM model_profile_job_pins p LEFT JOIN works w ON w.id=p.work_id "
                + "WHERE NOT(p.profile_id=? AND p.profile_version=?) AND "
                + "(w.state='active' OR (w.id IS NULL AND p.created_at>?)) LIMIT 1"
            : "SELECT 1 FROM model_profile_job_pins p WHERE NOT(p.profile_id=? AND p.profile_version=?) "
                + "AND p.created_at>? LIMIT 1";
        if (!db.query(sql, targetProfileId, targetVersion, reservationCutoff).isEmpty())
            throw new IllegalStateException("MODEL_PROFILE_SWITCH_HAS_PINNED_WORK");
    }

    /** Active signed manifest used to restore the runtime if activation loses its commit race. */
    public ModelProfileManifest activeModelProfile() {
        List<Map<String,String>> active = db.query("SELECT m.* FROM model_profile_activation a "
            + "JOIN model_profiles m ON m.profile_id=a.profile_id AND m.version=a.profile_version WHERE a.id=1");
        return active.isEmpty() ? null : toProfile(active.get(0));
    }

    /** Pins the active model once for an owner/job; retries return the original profile after later switches. */
    public Map<String,String> pinModelProfile(String owner, String workId, String requestDigest, long now) {
        owner(owner); uuid(workId, "INVALID_WORK_ID"); digest(requestDigest); clock(now);
        return db.transaction(() -> {
            List<Map<String,String>> old = db.query("SELECT * FROM model_profile_job_pins WHERE owner=? AND work_id=?", owner, workId);
            if (!old.isEmpty()) {
                if (!requestDigest.equals(old.get(0).get("request_digest"))) throw new SecurityException("MODEL_PIN_REQUEST_CONFLICT");
                Map<String,String> profile = one(db.query("SELECT status FROM model_profiles WHERE profile_id=? AND version=?",
                    old.get(0).get("profile_id"), Long.parseLong(old.get(0).get("profile_version"))), "MODEL_PIN_PROFILE_MISSING");
                if ("REVOKED".equals(profile.get("status"))) throw new SecurityException("MODEL_PIN_PROFILE_REVOKED");
                return old.get(0);
            }
            Map<String,String> active = one(db.query("SELECT * FROM model_profile_activation WHERE id=1"), "MODEL_PROFILE_NOT_ACTIVE");
            db.execute("INSERT INTO model_profile_job_pins(owner,work_id,request_digest,profile_id,profile_version,activation_generation,created_at) VALUES(?,?,?,?,?,?,?)",
                owner, workId, requestDigest, active.get("profile_id"), Long.parseLong(active.get("profile_version")),
                Long.parseLong(active.get("generation")), now);
            return one(db.query("SELECT * FROM model_profile_job_pins WHERE owner=? AND work_id=?", owner, workId), "MODEL_PIN_WRITE_FAILED");
        });
    }

    public Map<String,String> modelProfilePin(String owner, String workId) {
        owner(owner); uuid(workId, "INVALID_WORK_ID");
        Map<String,String> pin = one(db.query("SELECT * FROM model_profile_job_pins WHERE owner=? AND work_id=?", owner, workId), "MODEL_PIN_NOT_FOUND");
        Map<String,String> profile = one(db.query("SELECT status FROM model_profiles WHERE profile_id=? AND version=?",
            pin.get("profile_id"), Long.parseLong(pin.get("profile_version"))), "MODEL_PIN_PROFILE_MISSING");
        if ("REVOKED".equals(profile.get("status"))) throw new SecurityException("MODEL_PIN_PROFILE_REVOKED");
        return pin;
    }

    /** Exact registered profile tuple required to bind a runtime's loaded-model attestation to this job. */
    public Map<String,String> modelProfileForPin(String owner, String workId) {
        owner(owner); uuid(workId, "INVALID_WORK_ID");
        Map<String,String> row = one(db.query("SELECT p.*,m.manifest_digest,m.weights_sha256,m.tokenizer_sha256,"
            + "m.template_sha256,m.runtime_component_id,m.runtime_version_code,m.runtime_api_min,m.runtime_api_max,"
            + "m.format,m.quantization,m.context_tokens,m.plan_schema_id,m.artifact_bytes,m.min_ram_bytes,"
            + "m.status AS profile_status,m.verified_receipt_digest FROM model_profile_job_pins p "
            + "JOIN model_profiles m ON m.profile_id=p.profile_id AND m.version=p.profile_version "
            + "WHERE p.owner=? AND p.work_id=?", owner, workId), "MODEL_PIN_NOT_FOUND");
        if ("REVOKED".equals(row.get("profile_status"))) throw new SecurityException("MODEL_PIN_PROFILE_REVOKED");
        if (!("ACTIVE".equals(row.get("profile_status")) || "CACHED".equals(row.get("profile_status")))
            || row.get("verified_receipt_digest") == null)
            throw new SecurityException("MODEL_PIN_PROFILE_UNVERIFIED");
        Map<String,String> runtime = one(db.query("SELECT manifest_digest,signing_digest,api_min,api_max "
            + "FROM runtime_manifests WHERE component_id=? AND version_code=?",
            row.get("runtime_component_id"), Long.parseLong(row.get("runtime_version_code"))),
            "MODEL_PIN_RUNTIME_MISSING");
        Map<String,String> result = new HashMap<>(row);
        result.put("runtime_manifest_digest", runtime.get("manifest_digest"));
        result.put("runtime_signing_digest", runtime.get("signing_digest"));
        result.put("runtime_manifest_api_min", runtime.get("api_min"));
        result.put("runtime_manifest_api_max", runtime.get("api_max"));
        return result;
    }

    public void revokeModelProfile(String profileId, long version, long now) {
        id(profileId); clock(now);
        db.transaction(() -> {
            Map<String,String> profile = one(db.query("SELECT * FROM model_profiles WHERE profile_id=? AND version=?", profileId, version), "MODEL_PROFILE_NOT_FOUND");
            List<Map<String,String>> active = db.query("SELECT 1 FROM model_profile_activation WHERE id=1 AND profile_id=? AND profile_version=?", profileId, version);
            if (!active.isEmpty()) db.execute("DELETE FROM model_profile_activation WHERE id=1");
            db.execute("UPDATE model_profiles SET status='REVOKED' WHERE profile_id=? AND version=?", profileId, version);
            event("MODEL_PROFILE_REVOKED", profile.get("runtime_component_id"), null, profileId + "@" + version, now);
            return null;
        });
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
        if (!db.query("SELECT 1 FROM a2a_wallet_reservations WHERE owner=? AND state IN('HELD','DISPATCHED','INDETERMINATE','RECOVERY_REQUIRED') LIMIT 1", owner).isEmpty())
            throw new IllegalStateException("A2A_WALLET_HOLD_REQUIRES_RECOVERABLE_BACKUP");
        if (hasActiveA2AHolds(owner, "USD") || hasActiveA2AHolds(owner, "JPY"))
            throw new IllegalStateException("A2A_WALLET_HOLD_REQUIRES_RECOVERABLE_BACKUP");
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

    /**
     * Version-2 allowlisted state. Installed component identities, live sessions and secrets are
     * intentionally absent. The returned plaintext must be passed to EncryptedBackup before it is
     * written outside the Broker.
     */
    public byte[] exportRecoverableState(String owner) {
        owner(owner);
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            DataOutputStream out = new DataOutputStream(bytes);
            out.writeUTF(PlatformApi.RECOVERABLE_STATE_FORMAT);
            out.writeInt(RECOVERABLE_STATE_VERSION);
            out.writeUTF(owner);
            out.writeInt(Engine.SCHEMA_VERSION);
            out.writeInt(SCHEMA_VERSION);
            writeTable(out, "settings", db.query("SELECT paused FROM settings WHERE id=1"));
            writeTable(out, "sky_selection", db.query("SELECT tool_id,revision FROM sky_selection WHERE id=1"));
            writeTable(out, "works", db.query("SELECT id,request_key,request_hash,state,sample,review_note,model_profile_id,model_profile_version,model_activation_generation FROM works ORDER BY rowid"));
            writeTable(out, "model_profile_job_pins", db.query("SELECT owner,work_id,request_digest,profile_id,profile_version,activation_generation,created_at FROM model_profile_job_pins WHERE owner=? ORDER BY work_id", owner));
            writeTable(out, "artifacts", db.query("SELECT work_id,digest,body FROM artifacts ORDER BY work_id,digest"));
            writeTable(out, "runs", db.query("SELECT work_id,step,tool,state,attempt,input_digest,output_digest,error FROM runs ORDER BY work_id,step"));
            writeTable(out, "events", db.query("SELECT work_id,step,kind FROM events ORDER BY seq"));
            writeTable(out, "platform_approvals", db.query("SELECT id,request_key,component_id,action,payload_digest,max_cost_minor,expires_at,state,component_generation,confirmed_at,consumed_at FROM platform_approvals WHERE owner=? ORDER BY rowid", owner));
            writeTable(out, "platform_ledger", db.query("SELECT receipt_id,request_key,component_id,approval_id,amount_minor,currency,provider_ref,provider_receipt_digest,reverses_receipt,entry_digest,created_at FROM platform_ledger WHERE owner=? ORDER BY rowid", owner));
            writeTable(out, "a2a_wallet_reservations", db.query("SELECT delegation_id,owner,parent_job_id,task_id,agent_origin,agent_name,agent_version,currency,pricing_version,budget_limit_minor,approval_id,approval_digest,created_at,deadline_at,held_minor,settled_minor,released_minor,state,provider_ref,provider_receipt_digest,updated_at FROM a2a_wallet_reservations WHERE owner=? ORDER BY created_at", owner));
            out.flush();
            byte[] result = bytes.toByteArray();
            if (result.length == 0 || result.length > EncryptedBackup.MAX_PLAINTEXT_BYTES) {
                throw new IllegalStateException("RECOVERABLE_BACKUP_TOO_LARGE");
            }
            return result;
        } catch (IOException impossible) {
            throw new IllegalStateException("BACKUP_SERIALIZATION_FAILED", impossible);
        }
    }

    /** Ensures replacement-device restore cannot merge two independent histories. */
    public void requireEmptyRecoverableRestoreTarget(String owner) {
        owner(owner);
        if (!db.query("SELECT 1 FROM works LIMIT 1").isEmpty() ||
            !db.query("SELECT 1 FROM model_profile_job_pins WHERE owner=? LIMIT 1", owner).isEmpty() ||
            !db.query("SELECT 1 FROM sky_selection LIMIT 1").isEmpty() ||
            !db.query("SELECT 1 FROM platform_approvals WHERE owner=? LIMIT 1", owner).isEmpty() ||
            !db.query("SELECT 1 FROM platform_ledger WHERE owner=? LIMIT 1", owner).isEmpty() ||
            !db.query("SELECT 1 FROM a2a_wallet_reservations WHERE owner=? LIMIT 1", owner).isEmpty()) {
            throw new IllegalStateException("RESTORE_TARGET_NOT_EMPTY");
        }
    }

    /**
     * Restores a fully authenticated plaintext snapshot in one database transaction. Work remains
     * paused, old approvals are stopped, running leases are invalidated and the Sky token rotates.
     */
    public RestoreSummary restoreRecoverableState(byte[] plaintext, String owner, long now) {
        owner(owner); clock(now);
        Snapshot snapshot = readSnapshot(plaintext, owner);
        validateSnapshot(snapshot);
        return db.transaction(() -> {
            requireEmptyRecoverableRestoreTarget(owner);
            db.execute("UPDATE settings SET paused=1 WHERE id=1");
            for (Map<String,String> row : snapshot.selection) {
                int nextRevision = Math.addExact(Integer.parseInt(required(row, "revision")), 1);
                db.execute("INSERT INTO sky_selection(id,selection_token,tool_id,revision) VALUES(1,?,?,?)",
                    UUID.randomUUID().toString(), required(row, "tool_id"), nextRevision);
            }
            for (Map<String,String> row : snapshot.works) {
                db.execute("INSERT INTO works(id,request_key,request_hash,state,sample,review_note,model_profile_id,model_profile_version,model_activation_generation) VALUES(?,?,?,?,?,?,?,?,?)",
                    required(row, "id"), required(row, "request_key"), required(row, "request_hash"),
                    required(row, "state"), integer(row, "sample"), value(row, "review_note"),
                    value(row, "model_profile_id"), value(row, "model_profile_version"), value(row, "model_activation_generation"));
            }
            for (Map<String,String> row : snapshot.modelPins) {
                db.execute("INSERT INTO model_profile_job_pins(owner,work_id,request_digest,profile_id,profile_version,activation_generation,created_at) VALUES(?,?,?,?,?,?,?)",
                    owner, required(row, "work_id"), required(row, "request_digest"), required(row, "profile_id"),
                    longValue(row, "profile_version"), longValue(row, "activation_generation"), longValue(row, "created_at"));
            }
            for (Map<String,String> row : snapshot.artifacts) {
                db.execute("INSERT INTO artifacts(work_id,digest,body) VALUES(?,?,?)",
                    required(row, "work_id"), required(row, "digest"), required(row, "body"));
            }
            for (Map<String,String> row : snapshot.runs) {
                String state = required(row, "state");
                int attempt = integer(row, "attempt");
                String error = value(row, "error");
                if ("running".equals(state)) {
                    state = attempt >= 3 ? "needs_review" : "queued";
                    error = "RESTORED_AFTER_DEVICE_LOSS";
                }
                db.execute("INSERT INTO runs(work_id,step,tool,state,attempt,token,boot,deadline,input_digest,output_digest,error) VALUES(?,?,?,?,?,NULL,NULL,NULL,?,?,?)",
                    required(row, "work_id"), integer(row, "step"), required(row, "tool"), state,
                    attempt, value(row, "input_digest"), value(row, "output_digest"), error);
            }
            for (Map<String,String> row : snapshot.events) {
                db.execute("INSERT INTO events(work_id,step,kind) VALUES(?,?,?)",
                    required(row, "work_id"), integer(row, "step"), required(row, "kind"));
            }
            for (Map<String,String> row : snapshot.works) {
                db.execute("INSERT INTO events(work_id,step,kind) VALUES(?,-1,'restored')", required(row, "id"));
            }
            int stoppedApprovals = 0;
            for (Map<String,String> row : snapshot.approvals) {
                String state = required(row, "state");
                if ("PROPOSED".equals(state) || "ISSUED".equals(state)) {
                    state = "STOPPED";
                    stoppedApprovals++;
                }
                db.execute("INSERT INTO platform_approvals(id,owner,request_key,component_id,action,payload_digest,max_cost_minor,expires_at,state,component_generation,confirmed_at,consumed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                    required(row, "id"), owner, required(row, "request_key"), required(row, "component_id"),
                    required(row, "action"), required(row, "payload_digest"), longValue(row, "max_cost_minor"),
                    longValue(row, "expires_at"), state, longValue(row, "component_generation"),
                    nullableLong(row, "confirmed_at"), nullableLong(row, "consumed_at"));
            }
            for (Map<String,String> row : snapshot.ledger) {
                db.execute("INSERT INTO platform_ledger(receipt_id,owner,request_key,component_id,approval_id,amount_minor,currency,provider_ref,provider_receipt_digest,reverses_receipt,entry_digest,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                    required(row, "receipt_id"), owner, required(row, "request_key"),
                    required(row, "component_id"), value(row, "approval_id"), longValue(row, "amount_minor"),
                    required(row, "currency"), value(row, "provider_ref"), value(row, "provider_receipt_digest"),
                    value(row, "reverses_receipt"), required(row, "entry_digest"), longValue(row, "created_at"));
            }
            for (Map<String,String> row : snapshot.a2aReservations) {
                String state = required(row, "state");
                if (Set.of("HELD", "DISPATCHED", "INDETERMINATE", "RECOVERY_REQUIRED").contains(state))
                    state = "RECOVERY_REQUIRED";
                db.execute("INSERT INTO a2a_wallet_reservations(delegation_id,owner,parent_job_id,task_id,agent_origin,agent_name,agent_version,currency,pricing_version,budget_limit_minor,approval_id,approval_digest,created_at,deadline_at,held_minor,settled_minor,released_minor,state,provider_ref,provider_receipt_digest,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    required(row, "delegation_id"), owner, required(row, "parent_job_id"), required(row, "task_id"),
                    required(row, "agent_origin"), required(row, "agent_name"), required(row, "agent_version"),
                    required(row, "currency"), required(row, "pricing_version"), longValue(row, "budget_limit_minor"),
                    required(row, "approval_id"), required(row, "approval_digest"), longValue(row, "created_at"),
                    longValue(row, "deadline_at"), longValue(row, "held_minor"), longValue(row, "settled_minor"),
                    longValue(row, "released_minor"), state, value(row, "provider_ref"),
                    value(row, "provider_receipt_digest"), now);
            }
            event("BACKUP_RESTORED", null, owner,
                Engine.digest(PlatformApi.RECOVERABLE_STATE_FORMAT + ":" + snapshot.works.size() + ":" + snapshot.ledger.size()), now);
            return new RestoreSummary(snapshot.works.size(), snapshot.ledger.size(), stoppedApprovals);
        });
    }

    private void consumeApproval(String owner, String approvalId, String componentId, String action,
        String payloadDigest, long actualCostMinor, long now) {
        Map<String,String> approval = one(db.query("SELECT * FROM platform_approvals WHERE id=?", approvalId), "APPROVAL_NOT_FOUND");
        if (!owner.equals(approval.get("owner")) || !componentId.equals(approval.get("component_id")) ||
            !action.equals(approval.get("action")) || !payloadDigest.equals(approval.get("payload_digest"))) {
            throw new SecurityException("APPROVAL_SCOPE_MISMATCH");
        }
        Map<String,String> component = null;
        boolean internalA2A = A2A_WALLET_APPROVAL_COMPONENT.equals(componentId);
        if (internalA2A) {
            if (!"wallet.a2a.reserve".equals(action) || Long.parseLong(approval.get("component_generation")) != 1)
                throw new SecurityException("INTERNAL_A2A_APPROVAL_INVALID");
        } else component = active(componentId);
        if (!"ISSUED".equals(approval.get("state"))) throw new SecurityException("APPROVAL_NOT_ACTIVE");
        if (now >= Long.parseLong(approval.get("expires_at"))) {
            throw new SecurityException("APPROVAL_EXPIRED");
        }
        if (!internalA2A && Long.parseLong(approval.get("component_generation")) != Long.parseLong(component.get("generation"))) {
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

    public static String a2aBudgetPayloadDigest(A2AUsageReceiptVerifier.Hold hold) {
        if (hold == null) throw new IllegalArgumentException("A2A_WALLET_HOLD_REQUIRED");
        if (!hold.requestSha256.isEmpty() || !hold.priceQuoteDigest.isEmpty()) {
            if (hold.requestSha256.isEmpty() || hold.priceQuoteDigest.isEmpty())
                throw new IllegalArgumentException("A2A_REQUEST_AND_QUOTE_DIGESTS_REQUIRED_TOGETHER");
            return Engine.digest(String.join("\n", "rockstaros-a2a-wallet-reservation/2",
                hold.ownerUserId, hold.parentJobId, hold.delegationId, hold.taskId, hold.agentOrigin,
                hold.agentName, hold.agentVersion, hold.currency, hold.pricingVersion, hold.requestSha256,
                hold.priceQuoteDigest, Long.toString(hold.limitMinor),
                Long.toString(hold.parentBudgetLimitMinor), Long.toString(hold.createdAt),
                Long.toString(hold.deadlineAt)));
        }
        return Engine.digest(String.join("\n", "rockstaros-a2a-wallet-reservation/1",
            hold.ownerUserId, hold.parentJobId, hold.delegationId, hold.taskId, hold.agentOrigin,
            hold.agentName, hold.agentVersion, hold.currency, hold.pricingVersion,
            Long.toString(hold.limitMinor), Long.toString(hold.createdAt), Long.toString(hold.deadlineAt)));
    }

    private static A2AUsageReceiptVerifier.Hold holdFromReservation(Map<String,String> row) {
        return new A2AUsageReceiptVerifier.Hold(row.get("owner"), row.get("parent_job_id"),
            row.get("delegation_id"), row.get("task_id"), row.get("agent_origin"),
            row.get("agent_name"), row.get("agent_version"), row.get("currency"),
            row.get("pricing_version"), Long.parseLong(row.get("budget_limit_minor")),
            Long.parseLong(row.get("created_at")), Long.parseLong(row.get("deadline_at")));
    }

    private static Map<String,Object> handoffMap(Object value, Set<String> fields) {
        if (!(value instanceof Map<?,?>) || !((Map<?,?>) value).keySet().equals(fields))
            throw new SecurityException("INVALID_A2A_WALLET_HANDOFF_OBJECT");
        @SuppressWarnings("unchecked") Map<String,Object> result = (Map<String,Object>) value;
        return result;
    }

    private static String handoffString(Object value) {
        if (!(value instanceof String) || ((String) value).isBlank() || ((String) value).length() > 2048)
            throw new SecurityException("INVALID_A2A_WALLET_HANDOFF_VALUE");
        return (String) value;
    }

    private static void requireHandoffString(Map<String,Object> source, String name, String expected) {
        if (!expected.equals(handoffString(source.get(name))))
            throw new SecurityException("INVALID_A2A_WALLET_HANDOFF_VALUE");
    }

    private static long handoffInteger(Object value) {
        if (!(value instanceof Number)) throw new SecurityException("INVALID_A2A_WALLET_HANDOFF_INTEGER");
        Number number = (Number) value;
        long result = number.longValue();
        if (result < 0 || number.doubleValue() != (double) result || result > 9_007_199_254_740_991L)
            throw new SecurityException("INVALID_A2A_WALLET_HANDOFF_INTEGER");
        return result;
    }

    private static boolean sameA2AHold(Map<String,String> row, A2AUsageReceiptVerifier.Hold hold) {
        return hold.ownerUserId.equals(row.get("owner")) && hold.parentJobId.equals(row.get("parent_job_id")) &&
            hold.delegationId.equals(row.get("delegation_id")) && hold.taskId.equals(row.get("task_id")) &&
            hold.agentOrigin.equals(row.get("agent_origin")) && hold.agentName.equals(row.get("agent_name")) &&
            hold.agentVersion.equals(row.get("agent_version")) && hold.currency.equals(row.get("currency")) &&
            hold.pricingVersion.equals(row.get("pricing_version")) &&
            hold.limitMinor == Long.parseLong(row.get("budget_limit_minor")) &&
            hold.createdAt == Long.parseLong(row.get("created_at")) &&
            hold.deadlineAt == Long.parseLong(row.get("deadline_at"));
    }

    private boolean hasActiveA2AHolds(String owner, String currency) {
        return !db.query("SELECT 1 FROM a2a_wallet_reservations WHERE owner=? AND currency=? AND state IN('HELD','DISPATCHED','INDETERMINATE','RECOVERY_REQUIRED') LIMIT 1", owner, currency).isEmpty();
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
    private static String value(Map<String,String> row, String key) { return row.get(key); }
    private static String required(Map<String,String> row, String key) {
        String value = row.get(key);
        if (value == null) throw new IllegalArgumentException("BACKUP_REQUIRED_FIELD:" + key);
        return value;
    }
    private static int integer(Map<String,String> row, String key) {
        try { return Integer.parseInt(required(row, key)); }
        catch (NumberFormatException invalid) { throw new IllegalArgumentException("BACKUP_INVALID_INTEGER:" + key, invalid); }
    }
    private static long longValue(Map<String,String> row, String key) {
        try { return Long.parseLong(required(row, key)); }
        catch (NumberFormatException invalid) { throw new IllegalArgumentException("BACKUP_INVALID_LONG:" + key, invalid); }
    }
    private static Object nullableLong(Map<String,String> row, String key) {
        String value = row.get(key);
        if (value == null) return null;
        try { return Long.parseLong(value); }
        catch (NumberFormatException invalid) { throw new IllegalArgumentException("BACKUP_INVALID_LONG:" + key, invalid); }
    }
    private static void writeTable(DataOutputStream out, String name, List<Map<String,String>> rows) throws IOException {
        out.writeUTF(name);
        writeRows(out, rows);
    }
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

    private static Snapshot readSnapshot(byte[] plaintext, String expectedOwner) {
        if (plaintext == null || plaintext.length == 0 || plaintext.length > EncryptedBackup.MAX_PLAINTEXT_BYTES) {
            throw new IllegalArgumentException("INVALID_RECOVERABLE_STATE_SIZE");
        }
        try {
            DataInputStream input = new DataInputStream(new ByteArrayInputStream(plaintext));
            if (!PlatformApi.RECOVERABLE_STATE_FORMAT.equals(input.readUTF())) {
                throw new IllegalArgumentException("UNSUPPORTED_RECOVERABLE_STATE");
            }
            int stateVersion = input.readInt();
            if (stateVersion < 2 || stateVersion > RECOVERABLE_STATE_VERSION)
                throw new IllegalArgumentException("UNSUPPORTED_RECOVERABLE_STATE");
            if (!expectedOwner.equals(input.readUTF())) throw new SecurityException("BACKUP_OWNER_MISMATCH");
            int engineSchema = input.readInt(), platformSchema = input.readInt();
            if (engineSchema != Engine.SCHEMA_VERSION || (platformSchema != 3 && platformSchema != SCHEMA_VERSION) ||
                (stateVersion >= 3 && platformSchema != SCHEMA_VERSION)) {
                throw new IllegalArgumentException("UNSUPPORTED_RECOVERABLE_SCHEMA");
            }
            List<Map<String,String>> settings = readTable(input, "settings", Set.of("paused"), 1);
            List<Map<String,String>> selection = readTable(input, "sky_selection", Set.of("tool_id", "revision"), 1);
            List<Map<String,String>> works = readTable(input, "works", Set.of("id", "request_key", "request_hash", "state", "sample", "review_note", "model_profile_id", "model_profile_version", "model_activation_generation"), Engine.MAX_WORKS);
            List<Map<String,String>> pins = readTable(input, "model_profile_job_pins", Set.of("owner", "work_id", "request_digest", "profile_id", "profile_version", "activation_generation", "created_at"), Engine.MAX_WORKS);
            List<Map<String,String>> artifacts = readTable(input, "artifacts", Set.of("work_id", "digest", "body"), Engine.MAX_WORKS * 3);
            List<Map<String,String>> runs = readTable(input, "runs", Set.of("work_id", "step", "tool", "state", "attempt", "input_digest", "output_digest", "error"), Engine.MAX_WORKS * 2);
            List<Map<String,String>> events = readTable(input, "events", Set.of("work_id", "step", "kind"), MAX_BACKUP_ROWS);
            List<Map<String,String>> approvals = readTable(input, "platform_approvals", Set.of("id", "request_key", "component_id", "action", "payload_digest", "max_cost_minor", "expires_at", "state", "component_generation", "confirmed_at", "consumed_at"), MAX_BACKUP_ROWS);
            List<Map<String,String>> ledger = readTable(input, "platform_ledger", Set.of("receipt_id", "request_key", "component_id", "approval_id", "amount_minor", "currency", "provider_ref", "provider_receipt_digest", "reverses_receipt", "entry_digest", "created_at"), MAX_BACKUP_ROWS);
            List<Map<String,String>> a2aReservations = stateVersion >= 3
                ? readTable(input, "a2a_wallet_reservations", Set.of("delegation_id", "owner", "parent_job_id", "task_id", "agent_origin", "agent_name", "agent_version", "currency", "pricing_version", "budget_limit_minor", "approval_id", "approval_digest", "created_at", "deadline_at", "held_minor", "settled_minor", "released_minor", "state", "provider_ref", "provider_receipt_digest", "updated_at"), MAX_BACKUP_ROWS)
                : List.of();
            Snapshot snapshot = new Snapshot(
                settings, selection, works, pins, artifacts, runs, events, approvals, ledger, a2aReservations);
            for (Map<String,String> pin : snapshot.modelPins) {
                if (!expectedOwner.equals(required(pin, "owner"))) throw new SecurityException("BACKUP_OWNER_MISMATCH");
            }
            for (Map<String,String> reservation : snapshot.a2aReservations) {
                if (!expectedOwner.equals(required(reservation, "owner"))) throw new SecurityException("BACKUP_OWNER_MISMATCH");
            }
            if (input.available() != 0) throw new IllegalArgumentException("RECOVERABLE_STATE_TRAILING_BYTES");
            return snapshot;
        } catch (IOException error) {
            throw new IllegalArgumentException("INVALID_RECOVERABLE_STATE", error);
        }
    }

    private static List<Map<String,String>> readTable(DataInputStream input, String expectedName,
        Set<String> columns, int maximumRows) throws IOException {
        if (!expectedName.equals(input.readUTF())) throw new IllegalArgumentException("BACKUP_TABLE_ORDER");
        int count = input.readInt();
        if (count < 0 || count > maximumRows) throw new IllegalArgumentException("BACKUP_ROW_LIMIT");
        List<Map<String,String>> rows = new ArrayList<>(count);
        for (int rowIndex = 0; rowIndex < count; rowIndex++) {
            int columnCount = input.readInt();
            if (columnCount != columns.size()) throw new IllegalArgumentException("BACKUP_COLUMN_COUNT");
            Map<String,String> row = new LinkedHashMap<>();
            for (int column = 0; column < columnCount; column++) {
                String name = input.readUTF();
                if (!columns.contains(name) || row.containsKey(name)) {
                    throw new IllegalArgumentException("BACKUP_COLUMN_NAME");
                }
                row.put(name, input.readBoolean() ? input.readUTF() : null);
            }
            if (!row.keySet().equals(columns)) throw new IllegalArgumentException("BACKUP_COLUMNS_MISSING");
            rows.add(row);
        }
        return rows;
    }

    private static void validateSnapshot(Snapshot snapshot) {
        if (snapshot.settings.size() != 1 ||
            !("0".equals(required(snapshot.settings.get(0), "paused")) ||
              "1".equals(required(snapshot.settings.get(0), "paused")))) {
            throw new IllegalArgumentException("BACKUP_SETTINGS");
        }
        Set<String> works = new HashSet<>();
        for (Map<String,String> row : snapshot.works) {
            uuid(required(row, "id"), "BACKUP_WORK_ID");
            workKey(required(row, "request_key"));
            digest(required(row, "request_hash"));
            if (!Set.of("active", "review", "completed", "cancelled").contains(required(row, "state")))
                throw new IllegalArgumentException("BACKUP_WORK_STATE");
            int sample = integer(row, "sample");
            if (sample != 0 && sample != 1) throw new IllegalArgumentException("BACKUP_SAMPLE");
            String note = value(row, "review_note");
            if (note == null || note.length() > 1_000 || !works.add(required(row, "id")))
                throw new IllegalArgumentException("BACKUP_WORK_DUPLICATE");
            String profile = value(row, "model_profile_id");
            String version = value(row, "model_profile_version");
            String generation = value(row, "model_activation_generation");
            if ((profile == null) != (version == null) || (profile == null) != (generation == null))
                throw new IllegalArgumentException("BACKUP_MODEL_PIN_INCOMPLETE");
            if (profile != null && (profile.isBlank() || longValue(row, "model_profile_version") < 1 ||
                longValue(row, "model_activation_generation") < 1))
                throw new IllegalArgumentException("BACKUP_MODEL_PIN_INVALID");
        }
        Map<String,Map<String,String>> worksById = new HashMap<>();
        for (Map<String,String> row : snapshot.works) worksById.put(required(row, "id"), row);
        Set<String> pinnedWorks = new HashSet<>();
        for (Map<String,String> pin : snapshot.modelPins) {
            String workId = required(pin, "work_id");
            Map<String,String> work = worksById.get(workId);
            if (work == null || !required(pin, "owner").matches("[A-Za-z0-9:_-]{3,128}") ||
                !required(pin, "profile_id").equals(value(work, "model_profile_id")) ||
                !required(pin, "profile_version").equals(value(work, "model_profile_version")) ||
                !required(pin, "activation_generation").equals(value(work, "model_activation_generation")) ||
                !required(pin, "request_digest").matches("[a-f0-9]{64}") ||
                longValue(pin, "profile_version") < 1 || longValue(pin, "activation_generation") < 1 ||
                longValue(pin, "created_at") < 0 || !pinnedWorks.add(workId))
                throw new IllegalArgumentException("BACKUP_MODEL_PIN");
        }
        for (Map<String,String> work : snapshot.works) {
            if (value(work, "model_profile_id") != null && !pinnedWorks.contains(required(work, "id")))
                throw new IllegalArgumentException("BACKUP_MODEL_PIN_MISSING");
        }
        if (snapshot.selection.size() == 1) {
            if (!Engine.RECIPE.equals(required(snapshot.selection.get(0), "tool_id")) ||
                integer(snapshot.selection.get(0), "revision") < 1) {
                throw new IllegalArgumentException("BACKUP_SKY_SELECTION");
            }
        }
        Set<String> artifacts = new HashSet<>();
        for (Map<String,String> row : snapshot.artifacts) {
            String workId = required(row, "work_id");
            String body = required(row, "body");
            Engine.bounded(body);
            String artifactDigest = required(row, "digest"); digest(artifactDigest);
            if (!works.contains(workId) || !artifactDigest.equals(Engine.digest(body)) ||
                !artifacts.add(workId + ":" + artifactDigest)) {
                throw new IllegalArgumentException("BACKUP_ARTIFACT");
            }
        }
        Set<String> runs = new HashSet<>();
        for (Map<String,String> row : snapshot.runs) {
            String workId = required(row, "work_id");
            int step = integer(row, "step");
            int attempt = integer(row, "attempt");
            String tool = required(row, "tool");
            if (!works.contains(workId) || step < 0 || step > 1 || attempt < 0 || attempt > 3 ||
                !(step == 0 ? "citations@1" : "free-article@1").equals(tool) ||
                !Set.of("pending", "queued", "running", "succeeded", "needs_review", "failed", "cancelled").contains(required(row, "state")) ||
                !runs.add(workId + ":" + step)) {
                throw new IllegalArgumentException("BACKUP_RUN");
            }
            for (String field : List.of("input_digest", "output_digest")) {
                String artifact = value(row, field);
                if (artifact != null && (!artifact.matches("[a-f0-9]{64}") ||
                    !artifacts.contains(workId + ":" + artifact))) {
                    throw new IllegalArgumentException("BACKUP_RUN_ARTIFACT");
                }
            }
        }
        if (runs.size() != works.size() * 2) throw new IllegalArgumentException("BACKUP_RUN_COUNT");
        for (Map<String,String> row : snapshot.events) {
            if (!works.contains(required(row, "work_id")) || integer(row, "step") < -1 ||
                integer(row, "step") > 1 || !required(row, "kind").matches("[a-z_]{3,40}")) {
                throw new IllegalArgumentException("BACKUP_EVENT");
            }
        }
        Set<String> approvalIds = new HashSet<>(), approvalKeys = new HashSet<>();
        for (Map<String,String> row : snapshot.approvals) {
            uuid(required(row, "id"), "BACKUP_APPROVAL_ID");
            key(required(row, "request_key"), "BACKUP_APPROVAL_KEY");
            id(required(row, "component_id"));
            action(required(row, "action"));
            digest(required(row, "payload_digest"));
            if (longValue(row, "max_cost_minor") < 0 || longValue(row, "expires_at") < 0 ||
                longValue(row, "component_generation") < 1 ||
                negativeNullableLong(row, "confirmed_at") ||
                negativeNullableLong(row, "consumed_at") ||
                !approvalIds.add(required(row, "id")) ||
                !approvalKeys.add(required(row, "request_key"))) {
                throw new IllegalArgumentException("BACKUP_APPROVAL");
            }
            if (!Set.of("PROPOSED", "ISSUED", "CONSUMED", "STOPPED", "REVOKED", "EXPIRED").contains(required(row, "state")))
                throw new IllegalArgumentException("BACKUP_APPROVAL_STATE");
        }
        Set<String> receiptIds = new HashSet<>(), ledgerKeys = new HashSet<>(),
            providerRefs = new HashSet<>(), reversals = new HashSet<>();
        for (Map<String,String> row : snapshot.ledger) {
            uuid(required(row, "receipt_id"), "BACKUP_RECEIPT_ID");
            key(required(row, "request_key"), "BACKUP_LEDGER_KEY");
            id(required(row, "component_id"));
            optionalUuid(row, "approval_id", "BACKUP_LEDGER_APPROVAL_ID");
            currency(required(row, "currency"));
            long amount = longValue(row, "amount_minor");
            if (longValue(row, "created_at") < 0 ||
                !receiptIds.add(required(row, "receipt_id")) ||
                !ledgerKeys.add(required(row, "request_key"))) {
                throw new IllegalArgumentException("BACKUP_LEDGER");
            }
            String providerRef = value(row, "provider_ref");
            String providerDigest = value(row, "provider_receipt_digest");
            if ((providerRef == null) != (providerDigest == null))
                throw new IllegalArgumentException("BACKUP_PROVIDER_RECEIPT");
            if (providerRef != null) {
                key(providerRef, "BACKUP_PROVIDER_REFERENCE");
                digest(providerDigest);
                boolean a2aDebit = "org.rockstar.a2a.wallet".equals(required(row, "component_id")) && amount <= 0;
                if ((!a2aDebit && amount <= 0) || value(row, "approval_id") != null ||
                    value(row, "reverses_receipt") != null || !providerRefs.add(providerRef)) {
                    throw new IllegalArgumentException("BACKUP_PROVIDER_RECEIPT");
                }
            }
            String reversal = value(row, "reverses_receipt");
            if (reversal != null) {
                uuid(reversal, "BACKUP_REVERSAL_ID");
                if (!reversals.add(reversal)) throw new IllegalArgumentException("BACKUP_REVERSAL_DUPLICATE");
            }
            digest(required(row, "entry_digest"));
        }
        for (Map<String,String> row : snapshot.ledger) {
            String approval = value(row, "approval_id");
            String reversal = value(row, "reverses_receipt");
            if (value(row, "provider_ref") == null && reversal == null &&
                (approval == null || !approvalIds.contains(approval) || longValue(row, "amount_minor") > 0)) {
                throw new IllegalArgumentException("BACKUP_LEDGER_APPROVAL");
            }
            if (reversal != null && (approval != null || !receiptIds.contains(reversal) ||
                reversal.equals(required(row, "receipt_id")))) {
                throw new IllegalArgumentException("BACKUP_LEDGER_REVERSAL");
            }
        }
        Set<String> delegationIds = new HashSet<>(), a2aProviderRefs = new HashSet<>();
        for (Map<String,String> row : snapshot.a2aReservations) {
            A2AUsageReceiptVerifier.Hold hold = holdFromReservation(row);
            String delegation = required(row, "delegation_id");
            String state = required(row, "state");
            long limit = longValue(row, "budget_limit_minor"), held = longValue(row, "held_minor");
            long settled = longValue(row, "settled_minor"), released = longValue(row, "released_minor");
            digest(required(row, "approval_digest"));
            if (!hold.ownerUserId.matches("[A-Za-z0-9:_-]{3,128}") ||
                !approvalIds.contains(required(row, "approval_id")) ||
                !Set.of("HELD", "DISPATCHED", "INDETERMINATE", "RECOVERY_REQUIRED", "SETTLED", "RELEASED").contains(state) ||
                limit < 0 || held < 0 || settled < 0 || released < 0 ||
                Math.addExact(Math.addExact(held, settled), released) != limit ||
                longValue(row, "created_at") > longValue(row, "deadline_at") ||
                longValue(row, "updated_at") < 0 || !delegationIds.add(delegation))
                throw new IllegalArgumentException("BACKUP_A2A_WALLET_RESERVATION");
            boolean active = Set.of("HELD", "DISPATCHED", "INDETERMINATE", "RECOVERY_REQUIRED").contains(state);
            if ((active && (held != limit || settled != 0 || released != 0)) ||
                ("SETTLED".equals(state) && (held != 0 || settled + released != limit)) ||
                ("RELEASED".equals(state) && (held != 0 || settled != 0 || released != limit)))
                throw new IllegalArgumentException("BACKUP_A2A_WALLET_STATE");
            String providerRef = value(row, "provider_ref"), providerDigest = value(row, "provider_receipt_digest");
            if ((providerRef == null) != (providerDigest == null) ||
                (providerRef != null && (!"SETTLED".equals(state) || !a2aProviderRefs.add(providerRef) || !providerRefs.contains(providerRef))))
                throw new IllegalArgumentException("BACKUP_A2A_WALLET_PROVIDER_RECEIPT");
            if (providerDigest != null) digest(providerDigest);
            Map<String,String> approval = snapshot.approvals.stream()
                .filter(item -> required(item, "id").equals(required(row, "approval_id"))).findFirst().orElse(null);
            if (approval == null ||
                !"wallet.a2a.reserve".equals(value(approval, "action")) ||
                !required(row, "approval_digest").equals(value(approval, "payload_digest")))
                throw new IllegalArgumentException("BACKUP_A2A_WALLET_APPROVAL");
        }
    }

    public static final class RestoreSummary {
        public final int works, ledgerEntries, stoppedApprovals;
        RestoreSummary(int works, int ledgerEntries, int stoppedApprovals) {
            this.works = works; this.ledgerEntries = ledgerEntries;
            this.stoppedApprovals = stoppedApprovals;
        }
    }

    private static final class Snapshot {
        final List<Map<String,String>> settings, selection, works, modelPins, artifacts, runs, events,
            approvals, ledger, a2aReservations;
        Snapshot(List<Map<String,String>> settings, List<Map<String,String>> selection,
            List<Map<String,String>> works, List<Map<String,String>> modelPins, List<Map<String,String>> artifacts,
            List<Map<String,String>> runs, List<Map<String,String>> events,
            List<Map<String,String>> approvals, List<Map<String,String>> ledger,
            List<Map<String,String>> a2aReservations) {
            this.settings = settings; this.selection = selection; this.works = works; this.modelPins = modelPins;
            this.artifacts = artifacts; this.runs = runs; this.events = events;
            this.approvals = approvals; this.ledger = ledger; this.a2aReservations = a2aReservations;
        }
    }
    private static Map<String,String> one(List<Map<String,String>> rows, String error) {
        if (rows.size() != 1) throw new IllegalStateException(error);
        return rows.get(0);
    }

    private boolean hasPermission(String componentId, long version, String permission) {
        List<Map<String,String>> rows = db.query("SELECT permissions FROM platform_components WHERE component_id=? AND version_code=?", componentId, version);
        if (rows.size() != 1) return false;
        for (String value : rows.get(0).get("permissions").split(",")) if (permission.equals(value)) return true;
        return false;
    }

    private static ModelProfileManifest toProfile(Map<String,String> row) {
        return new ModelProfileManifest(row.get("profile_id"), Long.parseLong(row.get("version")),
            row.get("weights_sha256"), row.get("tokenizer_sha256"), row.get("template_sha256"), row.get("license_id"),
            row.get("publisher_id"), row.get("signing_key_id"), row.get("manifest_signature"),
            row.get("runtime_component_id"), Long.parseLong(row.get("runtime_version_code")),
            Integer.parseInt(row.get("runtime_api_min")), Integer.parseInt(row.get("runtime_api_max")),
            row.get("format"), row.get("quantization"), Integer.parseInt(row.get("context_tokens")),
            row.get("plan_schema_id"), Long.parseLong(row.get("artifact_bytes")), Long.parseLong(row.get("min_ram_bytes")));
    }

    private static List<String> split(String value) {
        if (value == null || value.isEmpty()) return List.of();
        return List.of(value.split(",", -1));
    }
    private static void owner(String value) { if (value == null || !value.matches("[A-Za-z0-9:_-]{3,128}")) throw new IllegalArgumentException("INVALID_OWNER"); }
    private static void identifier(String value, String error) { if (value == null || !value.matches("[A-Za-z0-9._:-]{1,128}")) throw new IllegalArgumentException(error); }
    private static void id(String value) { if (value == null || !value.matches("[a-z0-9]+(?:[._-][a-z0-9]+){2,}")) throw new IllegalArgumentException("INVALID_COMPONENT_ID"); }
    private static void workKey(String value) { if (value == null || !value.matches("[A-Za-z0-9_-]{1,80}")) throw new IllegalArgumentException("BACKUP_REQUEST_KEY"); }
    private static void key(String value, String error) { if (value == null || !value.matches("[A-Za-z0-9:._-]{1,160}")) throw new IllegalArgumentException(error); }
    private static void action(String value) { if (value == null || !value.matches("[a-z][a-z0-9._-]{0,79}")) throw new IllegalArgumentException("INVALID_ACTION"); }
    private static void digest(String value) { if (value == null || !value.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("INVALID_DIGEST"); }
    private static void currency(String value) { if (value == null || !value.matches("[A-Z]{3,8}")) throw new IllegalArgumentException("INVALID_CURRENCY"); }
    private static void uuid(String value, String error) { try { UUID.fromString(value); } catch (RuntimeException failure) { throw new IllegalArgumentException(error); } }
    private static void optionalUuid(Map<String,String> row, String key, String error) { String value = row.get(key); if (value != null) uuid(value, error); }
    private static boolean negativeNullableLong(Map<String,String> row, String key) { Object value = nullableLong(row, key); return value != null && ((Long) value) < 0; }
    private static void clock(long now) { if (now < 0) throw new IllegalArgumentException("INVALID_CLOCK"); }
}
