package dev.rock.core;

import dev.rock.core.platform.A2AUsageReceiptVerifier;
import dev.rock.core.platform.A2AWalletSettlementSync;
import dev.rock.core.platform.ComponentManifest;
import dev.rock.core.platform.PlatformStore;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;

public final class A2AWalletReservationTest {
    private static final long CREATED = 1_799_000_000_000L;
    private static final long NOW = 1_799_400_000_000L;
    private static final long DEADLINE = 1_800_000_000_000L;
    private static final String ORIGIN = "https://agent.example";
    private static final byte[] PUBLIC_KEY = hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
    @Rule public TemporaryFolder temp = new TemporaryFolder();
    private JdbcDatabase db;
    private PlatformStore store;
    private ComponentManifest broker;
    private ComponentManifest provider;
    private ComponentManifest tool;
    private A2AUsageReceiptVerifier.Hold hold;

    @Before public void setup() throws Exception {
        db = new JdbcDatabase(temp.newFile("a2a-wallet.db").getPath());
        new Engine(db);
        A2AUsageReceiptVerifier verifier = new A2AUsageReceiptVerifier(List.of(
            new A2AUsageReceiptVerifier.TrustedKey("provider-x", "usage-key-1", ORIGIN, PUBLIC_KEY, false)));
        store = new PlatformStore(db, verifier);
        broker = component(ComponentManifest.Kind.MCP, "org.rockstar.mcp.broker", "org.rockstar.mcp.broker", 12001,
            List.of("mcp.connect", "mcp.invoke"));
        provider = component(ComponentManifest.Kind.PROVIDER, "org.rockstar.provider.cash", "org.rockstar.provider.cash", 12002,
            List.of("provider.status", "wallet.receipt"));
        tool = component(ComponentManifest.Kind.TOOL, "org.rockstar.tool.clean", "org.rockstar.tool.clean", 12003,
            List.of("text.input", "text.output"));
        install("register:broker", broker);
        install("register:provider", provider);
        install("register:tool", tool);
        store.recordProviderReceipt("alice", "income:1", provider.componentId, 1_000, "USD",
            "provider:tx:1", Engine.digest("provider signed funding receipt"), NOW);
        String message = "Summarize public information.";
        hold = new A2AUsageReceiptVerifier.Hold("alice", "zema-job-1", "a2a-job-1", "a2a-job-1",
            ORIGIN, "Research Agent", "1.0.0", "USD", "fixture-price-1", Engine.digest(message),
            "c".repeat(64), 700, 900, CREATED, DEADLINE);
    }

    @After public void close() { db.close(); }

    @Test public void reservationCapsConcurrentSpendAndReceiptDebitsOnlyVerifiedUsage() throws Exception {
        String approval = approve();
        Map<String,String> reserved = reserve(approval);
        assertEquals("HELD", reserved.get("state"));
        assertEquals(300, store.availableBalance("alice", "USD"));
        String concurrentApproval = store.proposeApproval("alice", "approve:concurrent", tool.componentId,
            "tool.run", Engine.digest("concurrent spend"), 400, DEADLINE, NOW + 1);
        store.confirmApproval("alice", concurrentApproval, NOW + 1);
        assertThrows(SecurityException.class, () -> store.recordApproved("alice", "ledger:concurrent", concurrentApproval,
            tool.componentId, "tool.run", Engine.digest("concurrent spend"), 400, -400, "USD", NOW + 2));
        store.markA2ABudgetDispatched("alice", "a2a-job-1", NOW + 2);
        store.markA2ABudgetIndeterminate("alice", "a2a-job-1", NOW + 3);
        assertThrows(IllegalStateException.class, () -> store.markA2ABudgetDispatched("alice", "a2a-job-1", NOW + 4));
        Map<String,Object> receipt = receipt();
        Map<String,Object> handoff = handoff(receipt);
        Map<String,Object> badHandoff = new HashMap<>(handoff);
        Map<String,Object> badReservation = new HashMap<>();
        ((Map<?,?>) handoff.get("reservation")).forEach((key, value) -> badReservation.put(String.valueOf(key), value));
        badReservation.put("parentJobId", "another-job");
        badHandoff.put("reservation", badReservation);
        assertThrows(SecurityException.class, () -> store.applyA2AWalletSettlementHandoff(
            "alice", "a2a-job-1", badHandoff, DEADLINE));
        String ledgerId = store.applyA2AWalletSettlementHandoff("alice", "a2a-job-1", handoff, DEADLINE);
        assertEquals(ledgerId, store.applyA2AWalletSettlementHandoff("alice", "a2a-job-1", handoff, DEADLINE));
        assertEquals("SETTLED", store.a2aWalletReservation("alice", "a2a-job-1").get("state"));
        assertEquals("650", store.a2aWalletReservation("alice", "a2a-job-1").get("settled_minor"));
        assertEquals("50", store.a2aWalletReservation("alice", "a2a-job-1").get("released_minor"));
        assertEquals(350, store.balance("alice", "USD"));
    }

    @Test public void firstPartyWalletApprovalIsOwnerConfirmedQuoteBoundAndIdempotent() {
        String requestKey = "a2a-wallet:" + hold.delegationId;
        long approvalExpiry = NOW + 5 * 60_000L;
        String approvalId = store.proposeA2AWalletApproval("alice", requestKey, hold, approvalExpiry, NOW);
        assertEquals(approvalId, store.proposeA2AWalletApproval("alice", requestKey, hold, approvalExpiry, NOW + 1));
        assertEquals("PROPOSED", store.approval("alice", approvalId).get("state"));
        assertThrows(SecurityException.class, () -> store.proposeApproval("alice", "claim-internal",
            PlatformStore.A2A_WALLET_APPROVAL_COMPONENT, "wallet.a2a.reserve",
            PlatformStore.a2aBudgetPayloadDigest(hold), hold.limitMinor, approvalExpiry, NOW));
        assertThrows(SecurityException.class, () -> store.register("claim-internal-component",
            new ComponentManifest(ComponentManifest.Kind.MCP, PlatformStore.A2A_WALLET_APPROVAL_COMPONENT,
                "org.rockstar.platform.a2awallet", 1, 1, 1, 12004, "rock_mcp_app", "a".repeat(64),
                List.of("mcp.connect"), 1, 1), NOW));
        assertThrows(SecurityException.class, () -> store.confirmApproval("bob", approvalId, NOW + 1));
        assertThrows(SecurityException.class, () -> store.reserveA2ABudget(approvalId,
            PlatformStore.A2A_WALLET_APPROVAL_COMPONENT, PlatformStore.a2aBudgetPayloadDigest(hold), hold, NOW + 1));
        store.confirmApproval("alice", approvalId, NOW + 1);
        store.confirmApproval("alice", approvalId, NOW + 2);
        assertEquals("ISSUED", store.approval("alice", approvalId).get("state"));
        Map<String,String> reserved = store.reserveA2ABudget(approvalId,
            PlatformStore.A2A_WALLET_APPROVAL_COMPONENT, PlatformStore.a2aBudgetPayloadDigest(hold), hold, NOW + 3);
        assertEquals("HELD", reserved.get("state"));
        assertEquals(Long.toString(hold.limitMinor), reserved.get("held_minor"));
        assertEquals(300, store.availableBalance("alice", "USD"));
    }

    @Test public void provenPreDispatchFailureReleasesTheHoldIdempotently() {
        reserve(approve());
        assertEquals("RELEASED", store.releaseA2ABudgetBeforeDispatch("alice", "a2a-job-1", NOW + 3).get("state"));
        assertEquals("RELEASED", store.releaseA2ABudgetBeforeDispatch("alice", "a2a-job-1", NOW + 4).get("state"));
        assertEquals(1_000, store.availableBalance("alice", "USD"));
        assertThrows(IllegalStateException.class, () -> store.markA2ABudgetDispatched("alice", "a2a-job-1", NOW + 5));
    }

    @Test public void ownerApprovedReservationCommitsExactQuoteDigestAndStablePreDispatchTaskId() {
        A2AUsageReceiptVerifier.Hold sharedVector = new A2AUsageReceiptVerifier.Hold(
            "alice", "zema-job-1", "a2a-job-1", "a2a-job-1", ORIGIN,
            "Research Agent", "1.0.0", "USD", "fixture-price-1", "a".repeat(64),
            "c".repeat(64), 700, 900, CREATED, DEADLINE);
        assertEquals("394d03d764c77cab75eb2e368b7bac97e74bb882e493dcafd1507ae825461470",
            PlatformStore.a2aBudgetPayloadDigest(sharedVector));
        Map<String,String> reserved = reserve(approve());
        assertEquals("a2a-job-1", reserved.get("task_id"));
        assertEquals("507f5eb71ae39041d4ea055362ea76404ae88dd3819856db0b42cdef50e2a6ca",
            PlatformStore.a2aBudgetPayloadDigest(hold));
        assertEquals(reserved, store.requireHeldQuoteBoundA2ABudget(hold, NOW + 3));
        A2AUsageReceiptVerifier.Hold changedQuote = new A2AUsageReceiptVerifier.Hold(
            "alice", "zema-job-1", "a2a-job-1", "a2a-job-1", ORIGIN,
            "Research Agent", "1.0.0", "USD", "fixture-price-1", Engine.digest("Summarize public information."),
            "d".repeat(64), 700, 900, CREATED, DEADLINE);
        assertThrows(SecurityException.class,
            () -> store.requireHeldQuoteBoundA2ABudget(changedQuote, NOW + 3));
        A2AUsageReceiptVerifier.Hold missingQuote = new A2AUsageReceiptVerifier.Hold(
            "alice", "zema-job-1", "a2a-job-1", "a2a-job-1", ORIGIN,
            "Research Agent", "1.0.0", "USD", "fixture-price-1", 700, CREATED, DEADLINE);
        assertThrows(SecurityException.class,
            () -> store.requireHeldQuoteBoundA2ABudget(missingQuote, NOW + 3));
        A2AUsageReceiptVerifier.Hold changedRequest = new A2AUsageReceiptVerifier.Hold(
            "alice", "zema-job-1", "a2a-job-1", "a2a-job-1", ORIGIN,
            "Research Agent", "1.0.0", "USD", "fixture-price-1", "b".repeat(64),
            "c".repeat(64), 700, 900, CREATED, DEADLINE);
        assertThrows(SecurityException.class,
            () -> store.requireHeldQuoteBoundA2ABudget(changedRequest, NOW + 3));
        A2AUsageReceiptVerifier.Hold changedParentCap = new A2AUsageReceiptVerifier.Hold(
            "alice", "zema-job-1", "a2a-job-1", "a2a-job-1", ORIGIN,
            "Research Agent", "1.0.0", "USD", "fixture-price-1", Engine.digest("Summarize public information."),
            "c".repeat(64), 700, 901, CREATED, DEADLINE);
        assertThrows(SecurityException.class,
            () -> store.requireHeldQuoteBoundA2ABudget(changedParentCap, NOW + 3));
        store.markA2ABudgetDispatched("alice", "a2a-job-1", NOW + 4);
        assertThrows(SecurityException.class,
            () -> store.requireHeldQuoteBoundA2ABudget(hold, NOW + 5));
    }

    @Test public void ownerScopedCloudReadbackFencesAReservationAfterApprovalAndIsIdempotent() {
        reserve(approve());
        assertEquals("DISPATCHED", store.reconcileA2ABudgetDispatched(
            "alice", "a2a-job-1", "prepared", NOW + 3).get("state"));
        assertEquals("DISPATCHED", store.reconcileA2ABudgetDispatched(
            "alice", "a2a-job-1", "working", NOW + 4).get("state"));
        assertEquals(300, store.availableBalance("alice", "USD"));
        assertThrows(SecurityException.class, () -> store.reconcileA2ABudgetDispatched(
            "alice", "a2a-job-1", "awaiting_approval", NOW + 5));
        assertThrows(IllegalStateException.class, () -> store.releaseA2ABudgetBeforeDispatch(
            "alice", "a2a-job-1", NOW + 6));
    }

    @Test public void ambiguousCloudApprovalFreezesTheOriginalHeldAmountUntilReadback() {
        reserve(approve());
        assertEquals("INDETERMINATE", store.fenceA2ABudgetForUnknownDispatch(
            "alice", "a2a-job-1", NOW + 3).get("state"));
        assertEquals(300, store.availableBalance("alice", "USD"));
        assertThrows(IllegalStateException.class, () -> store.releaseA2ABudgetBeforeDispatch(
            "alice", "a2a-job-1", NOW + 4));
        assertEquals("INDETERMINATE", store.fenceA2ABudgetForUnknownDispatch(
            "alice", "a2a-job-1", NOW + 5).get("state"));
    }

    @Test public void brokerProofCanOnlyBeSignedForTheExistingExactQuoteBoundWalletHold() {
        reserve(approve());
        A2ABrokerAuthorization.Intent intent = new A2ABrokerAuthorization.Intent(
            "alice", "a2a-job-1", "zema-job-1", "message-1", ORIGIN, "Research Agent", "1.0.0",
            "1.0", "USD", "fixture-price-1", 700, 900, true, DEADLINE,
            "Summarize public information.", "c".repeat(64));
        final int[] signatures = {0};
        Map<String,Object> proof = store.authorizeHeldA2ADelegation(intent, "fixture-rockstaros",
            "device-a", "device-key-1", NOW + 3, bytes -> { signatures[0]++; return new byte[64]; });
        assertEquals(1, signatures[0]);
        assertEquals("rock-a2a-broker-authorization/2", proof.get("schema"));
        assertEquals("a2a-job-1", proof.get("delegationId"));
        assertEquals(Engine.digest("Summarize public information."), proof.get("inputSha256"));
        assertTrue(((String) proof.get("authorizationSha256")).matches("[a-f0-9]{64}"));
        assertTrue(((String) proof.get("signature")).matches("[A-Za-z0-9_-]{86}"));

        A2ABrokerAuthorization.Intent changedQuote = new A2ABrokerAuthorization.Intent(
            "alice", "a2a-job-1", "zema-job-1", "message-1", ORIGIN, "Research Agent", "1.0.0",
            "1.0", "USD", "fixture-price-1", 700, 900, true, DEADLINE,
            "Summarize public information.", "d".repeat(64));
        assertThrows(SecurityException.class, () -> store.authorizeHeldA2ADelegation(changedQuote,
            "fixture-rockstaros", "device-a", "device-key-1", NOW + 3,
            bytes -> { signatures[0]++; return new byte[64]; }));
        assertEquals(1, signatures[0]);

        store.markA2ABudgetDispatched("alice", "a2a-job-1", NOW + 4);
        assertThrows(SecurityException.class, () -> store.authorizeHeldA2ADelegation(intent,
            "fixture-rockstaros", "device-a", "device-key-1", NOW + 5,
            bytes -> { signatures[0]++; return new byte[64]; }));
        assertEquals(1, signatures[0]);
    }

    @Test public void reconnectSyncSettlesTheOwnerScopedCloudHandoffOnlyAfterFetch() throws Exception {
        reserve(approve());
        store.markA2ABudgetDispatched("alice", "a2a-job-1", NOW + 3);
        store.markA2ABudgetIndeterminate("alice", "a2a-job-1", NOW + 4);
        Map<String,Object> response = handoff(receipt());
        final int[] fetches = {0};
        A2AWalletSettlementSync sync = new A2AWalletSettlementSync(store, (owner, delegationId) -> {
            assertEquals("alice", owner);
            assertEquals("a2a-job-1", delegationId);
            fetches[0]++;
            return response;
        });
        String settled = sync.synchronize("alice", "a2a-job-1", DEADLINE);
        assertEquals(settled, sync.synchronize("alice", "a2a-job-1", DEADLINE));
        assertEquals(2, fetches[0]);
        assertEquals(350, store.balance("alice", "USD"));
    }

    @Test public void reconnectTransportFailureKeepsDispatchedHoldReserved() {
        reserve(approve());
        store.markA2ABudgetDispatched("alice", "a2a-job-1", NOW + 3);
        A2AWalletSettlementSync sync = new A2AWalletSettlementSync(store,
            (owner, delegationId) -> { throw new java.io.IOException("offline"); });
        assertThrows(java.io.IOException.class,
            () -> sync.synchronize("alice", "a2a-job-1", NOW + 4));
        assertEquals("DISPATCHED", store.a2aWalletReservation("alice", "a2a-job-1").get("state"));
        assertEquals(300, store.availableBalance("alice", "USD"));
    }

    @Test public void restoredDispatchedHoldStaysReservedUntilAProviderReceiptSettlesIt() throws Exception {
        String approval = approve();
        reserve(approval);
        store.markA2ABudgetDispatched("alice", "a2a-job-1", NOW + 1);
        assertThrows(IllegalStateException.class, () -> store.exportBackup("alice"));
        byte[] recovery = store.exportRecoverableState("alice");

        JdbcDatabase replacementDb = new JdbcDatabase(temp.newFile("a2a-wallet-restored.db").getPath());
        try {
            new Engine(replacementDb);
            PlatformStore replacement = new PlatformStore(replacementDb, new A2AUsageReceiptVerifier(List.of(
                new A2AUsageReceiptVerifier.TrustedKey("provider-x", "usage-key-1", ORIGIN, PUBLIC_KEY, false))));
            replacement.restoreRecoverableState(recovery, "alice", NOW + 2);
            assertEquals("RECOVERY_REQUIRED", replacement.a2aWalletReservation("alice", "a2a-job-1").get("state"));
            assertEquals(300, replacement.availableBalance("alice", "USD"));
            assertThrows(IllegalStateException.class, () -> replacement.releaseA2ABudgetBeforeDispatch("alice", "a2a-job-1", NOW + 3));
            assertThrows(IllegalStateException.class, () -> replacement.markA2ABudgetDispatched("alice", "a2a-job-1", NOW + 3));
            replacement.settleA2ABudget("alice", "a2a-job-1", "a2a:settle:after-restore", receipt(), DEADLINE);
            assertEquals(350, replacement.balance("alice", "USD"));
        } finally { replacementDb.close(); }
    }

    private String approve() {
        String digest = PlatformStore.a2aBudgetPayloadDigest(hold);
        String approval = store.proposeApproval("alice", "approve:a2a:1", broker.componentId,
            "wallet.a2a.reserve", digest, 700, DEADLINE, NOW);
        store.confirmApproval("alice", approval, NOW + 1);
        return approval;
    }

    private Map<String,String> reserve(String approval) {
        return store.reserveA2ABudget(approval, broker.componentId, PlatformStore.a2aBudgetPayloadDigest(hold), hold, NOW + 2);
    }

    private Map<String,Object> handoff(Map<String,Object> receipt) {
        String idempotencyKey = "a2a-settle-a2a-job-1-fixture";
        Map<String,Object> reservation = Map.of(
            "ownerUserId", "alice", "delegationId", "a2a-job-1", "parentJobId", "zema-job-1",
            "currency", "USD", "reservedMinor", 700L, "settledMinor", 650L,
            "deadlineAt", DEADLINE, "authorizationSha256", Engine.digest("cloud authorization"));
        Map<String,Object> command = Map.of(
            "v", 1L, "op", "a2a.budget.settle", "key", idempotencyKey,
            "delegation_id", "a2a-job-1", "receipt", receipt);
        return Map.of("schema", "rock-a2a-wallet-settlement-handoff/1", "state", "ready_for_device_wallet",
            "idempotencyKey", idempotencyKey, "receiptSha256", Engine.digest("stored receipt JSON"),
            "reservation", reservation, "walletCommand", command);
    }

    private void install(String key, ComponentManifest manifest) {
        store.register(key, manifest, 1);
        store.activate(manifest.componentId, manifest.versionCode, false, 2);
    }

    private static ComponentManifest component(ComponentManifest.Kind kind, String id, String packageName, int uid,
        List<String> permissions) {
        return new ComponentManifest(kind, id, packageName, 1, 1, 1, uid,
            ComponentManifest.expectedDomain(kind), "a".repeat(64), permissions, 1, 1);
    }

    @SuppressWarnings("unchecked")
    private static Map<String,Object> receipt() throws Exception {
        try (InputStream input = A2AWalletReservationTest.class.getResourceAsStream("/a2a-usage-receipt-v1.json")) {
            assertNotNull(input);
            return deepMap(new JSONObject(new String(input.readAllBytes(), StandardCharsets.UTF_8)).toMap());
        }
    }

    private static Map<String,Object> deepMap(Map<String,Object> source) {
        Map<String,Object> out = new HashMap<>();
        for (Map.Entry<String,Object> entry : source.entrySet()) {
            Object value = entry.getValue();
            if (value instanceof Map<?,?>) {
                Map<String,Object> nested = new HashMap<>();
                ((Map<?,?>) value).forEach((key, item) -> nested.put(String.valueOf(key), item));
                value = deepMap(nested);
            } else if (value instanceof List<?>) {
                List<Object> list = new ArrayList<>();
                for (Object item : (List<?>) value) {
                    if (item instanceof Map<?,?>) {
                        Map<String,Object> nested = new HashMap<>();
                        ((Map<?,?>) item).forEach((key, child) -> nested.put(String.valueOf(key), child));
                        list.add(deepMap(nested));
                    } else list.add(item);
                }
                value = list;
            }
            out.put(entry.getKey(), value);
        }
        return out;
    }

    private static byte[] hex(String value) {
        byte[] out = new byte[value.length() / 2];
        for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
        return out;
    }
}
