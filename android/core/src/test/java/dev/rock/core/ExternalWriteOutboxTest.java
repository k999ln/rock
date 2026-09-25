package dev.rock.core;

import org.junit.*;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;
import dev.rock.core.ExternalWriteOutbox.Dispatch;
import dev.rock.core.ExternalWriteOutbox.Effect;
import dev.rock.core.ExternalWriteOutbox.Observation;
import dev.rock.core.ExternalWriteOutbox.Operation;
import java.util.HashMap;
import java.util.Map;

/** AI04 host/fixture acceptance: operation key, uncertain results, reconciliation and crash recovery. */
public class ExternalWriteOutboxTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();
    private JdbcDatabase db; private Engine engine; private ExternalWriteOutbox outbox; private String file; private String work;
    private static final long NOW = 1_000_000L, EXPIRES = NOW + 60_000L;
    private static final ExternalWriteOutbox.Authority ALLOW = (op, now) -> true;

    /** Fixture provider: counts every side effect it applies, keyed by provider idempotency key. */
    private static final class FixtureProvider {
        final Map<String,Integer> applied = new HashMap<>();
        final boolean idempotent;
        FixtureProvider(boolean idempotent) { this.idempotent = idempotent; }
        String send(Dispatch d) {
            if (idempotent && applied.containsKey(d.providerKey)) return "ref-" + d.providerKey;
            applied.merge(d.providerKey, 1, Integer::sum);
            return "ref-" + d.providerKey;
        }
        int count(String key) { return applied.getOrDefault(key, 0); }
    }

    @Before public void setup() throws Exception {
        file = temp.newFile("work.db").getPath(); db = new JdbcDatabase(file); engine = new Engine(db);
        outbox = new ExternalWriteOutbox(db);
        work = engine.submit("work-1", "出品原稿", false, true);
    }
    @After public void close() { db.close(); }
    private void restart() { db.close(); db = new JdbcDatabase(file); engine = new Engine(db); outbox = new ExternalWriteOutbox(db); }
    private Operation op(String id, String payload, long cost, String key, boolean idempotent) {
        return new Operation(id, "owner-1", work, "fixture-provider:listing", payload, cost, "JPY", "approval-1", EXPIRES,
            key, idempotent, 1, null);
    }

    @Test public void operationKeyRejectsDifferentContentAndReturnsSameResultForIdenticalResend() {
        assertEquals("prepared", outbox.prepare(Effect.EXTERNAL_WRITE, op("op-1", "{\"price\":1000}", 1000, "key-1", false), NOW));
        assertEquals("prepared", outbox.prepare(Effect.EXTERNAL_WRITE, op("op-1", "{\"price\":1000}", 1000, "key-1", false), NOW + 1));
        IllegalStateException payload = assertThrows(IllegalStateException.class,
            () -> outbox.prepare(Effect.EXTERNAL_WRITE, op("op-1", "{\"price\":9000}", 1000, "key-1", false), NOW));
        assertEquals("OPERATION_CONFLICT", payload.getMessage());
        assertThrows(IllegalStateException.class,
            () -> outbox.prepare(Effect.EXTERNAL_WRITE, op("op-1", "{\"price\":1000}", 5000, "key-1", false), NOW));
        Operation otherTarget = new Operation("op-1", "owner-1", work, "fixture-provider:other", "{\"price\":1000}", 1000, "JPY",
            "approval-1", EXPIRES, "key-1", false, 1, null);
        assertThrows(IllegalStateException.class, () -> outbox.prepare(Effect.EXTERNAL_WRITE, otherTarget, NOW));
        IllegalStateException reused = assertThrows(IllegalStateException.class,
            () -> outbox.prepare(Effect.EXTERNAL_WRITE, op("op-2", "{\"price\":1000}", 1000, "key-1", false), NOW));
        assertEquals("PROVIDER_KEY_REUSED", reused.getMessage());

        FixtureProvider provider = new FixtureProvider(false);
        Dispatch d = outbox.beginDispatch("op-1", ALLOW, NOW + 2);
        String ref = provider.send(d);
        assertTrue(outbox.recordResult(d, Observation.CONFIRMED, ref, 1000, NOW + 3));
        assertFalse(outbox.recordResult(d, Observation.CONFIRMED, ref, 1000, NOW + 4));      // duplicate callback
        assertEquals("confirmed", outbox.prepare(Effect.EXTERNAL_WRITE, op("op-1", "{\"price\":1000}", 1000, "key-1", false), NOW + 5));
        assertThrows(IllegalStateException.class, () -> outbox.beginDispatch("op-1", ALLOW, NOW + 6));
        assertEquals(1, provider.count("key-1"));
    }

    @Test public void onlyExternalWritesEnterAndDispatchRechecksApprovalAndAuthority() {
        for (Effect effect : new Effect[]{Effect.LOCAL_PURE, Effect.REMOTE_READ})
            assertThrows(IllegalArgumentException.class, () -> outbox.prepare(effect, op("op-x", "p", 1, "key-x", false), NOW));
        assertThrows(SecurityException.class, () -> outbox.prepare(Effect.EXTERNAL_WRITE, op("op-x", "p", 1, "key-x", false), EXPIRES));
        outbox.prepare(Effect.EXTERNAL_WRITE, op("op-1", "p", 1, "key-1", false), NOW);
        assertEquals("REAUTHORIZATION_REQUIRED",
            assertThrows(SecurityException.class, () -> outbox.beginDispatch("op-1", (o, now) -> false, NOW + 1)).getMessage());
        assertEquals("APPROVAL_EXPIRED",
            assertThrows(SecurityException.class, () -> outbox.beginDispatch("op-1", ALLOW, EXPIRES)).getMessage());
        assertEquals("prepared", outbox.state("op-1"));                                     // refused dispatch left no trace
        outbox.cancel("op-1", NOW + 2);
        assertEquals("cancelled", outbox.state("op-1"));
        outbox.prepare(Effect.EXTERNAL_WRITE, op("op-2", "p", 1, "key-2", false), NOW);
        engine.cancel(work);                                                // stop wins over a later dispatch
        assertEquals("WORK_NOT_ACTIVE",
            assertThrows(IllegalStateException.class, () -> outbox.beginDispatch("op-2", ALLOW, NOW + 3)).getMessage());
        assertEquals("prepared", outbox.state("op-2"));
        assertEquals("WORK_NOT_ACTIVE", assertThrows(IllegalStateException.class,
            () -> outbox.prepare(Effect.EXTERNAL_WRITE, op("op-3", "p", 1, "key-3", false), NOW)).getMessage());
    }

    @Test public void crashAfterSendNeverResendsAndReconciliationConfirms() {
        FixtureProvider provider = new FixtureProvider(false);
        outbox.prepare(Effect.EXTERNAL_WRITE, op("op-1", "{\"price\":1000}", 1000, "key-1", false), NOW);
        Dispatch d = outbox.beginDispatch("op-1", ALLOW, NOW + 1);
        String ref = provider.send(d);                                      // provider applied it, then the process dies
        restart();
        assertEquals("uncertain", outbox.state("op-1"));
        assertThrows(IllegalStateException.class, () -> outbox.beginDispatch("op-1", ALLOW, NOW + 2));
        assertEquals("PROVIDER_RETRY_NOT_GUARANTEED",
            assertThrows(IllegalStateException.class, () -> outbox.redispatch("op-1", ALLOW, NOW + 2)).getMessage());
        assertEquals("RECONCILIATION_REQUIRED",
            assertThrows(IllegalStateException.class, () -> outbox.cancel("op-1", NOW + 2)).getMessage());
        assertFalse(outbox.recordResult(d, Observation.CONFIRMED, ref, 1000, NOW + 3));     // late callback from dead session
        assertEquals("uncertain", outbox.state("op-1"));
        assertEquals("confirmed", outbox.reconcile("op-1", Observation.CONFIRMED, ref, Engine.digest("{\"price\":1000}"), 1000, NOW + 4));
        assertEquals("confirmed", outbox.reconcile("op-1", Observation.CONFIRMED, ref, Engine.digest("{\"price\":1000}"), 1000, NOW + 5));
        assertThrows(IllegalStateException.class, () -> outbox.reconcile("op-1", Observation.REJECTED, null, null, 0, NOW + 6));
        assertEquals(1, provider.count("key-1"));
        assertEquals("COMPENSATION_REQUIRED", assertThrows(IllegalStateException.class, () -> outbox.cancel("op-1", NOW + 7)).getMessage());
        Operation refund = new Operation("op-1-refund", "owner-1", work, "fixture-provider:listing", "{\"withdraw\":true}", 0, "JPY",
            "approval-2", EXPIRES, "key-1-refund", false, 1, "op-1");
        assertEquals("prepared", outbox.prepare(Effect.EXTERNAL_WRITE, refund, NOW + 8));
    }

    @Test public void mismatchedReconciliationStaysUncertainAndAbsenceAllowsCancelOnly() {
        outbox.prepare(Effect.EXTERNAL_WRITE, op("op-1", "{\"price\":1000}", 1000, "key-1", false), NOW);
        Dispatch d = outbox.beginDispatch("op-1", ALLOW, NOW + 1);
        assertTrue(outbox.recordUnknown(d, NOW + 2));
        assertEquals("uncertain", outbox.reconcile("op-1", Observation.CONFIRMED, "ref-x", Engine.digest("other"), 1000, NOW + 3));
        assertEquals("uncertain", outbox.reconcile("op-1", Observation.CONFIRMED, "ref-x", Engine.digest("{\"price\":1000}"), 5000, NOW + 4));
        assertEquals("uncertain", outbox.reconcile("op-1", Observation.ABSENT, null, null, 0, NOW + 5));
        assertThrows(IllegalStateException.class, () -> outbox.redispatch("op-1", ALLOW, NOW + 6));   // retry not guaranteed
        outbox.cancel("op-1", NOW + 7);
        assertEquals("cancelled", outbox.state("op-1"));
        assertThrows(IllegalStateException.class, () -> outbox.reconcile("op-1", Observation.CONFIRMED, "ref-x", Engine.digest("{\"price\":1000}"), 1000, NOW + 8));
    }

    @Test public void idempotentProviderMayResendSameKeyOnlyAfterReportedAbsence() {
        FixtureProvider provider = new FixtureProvider(true);
        outbox.prepare(Effect.EXTERNAL_WRITE, op("op-1", "p", 10, "key-1", true), NOW);
        outbox.beginDispatch("op-1", ALLOW, NOW + 1);                       // killed before the provider saw it
        restart();
        assertEquals("RECONCILIATION_REQUIRED",
            assertThrows(IllegalStateException.class, () -> outbox.redispatch("op-1", ALLOW, NOW + 2)).getMessage());
        outbox.reconcile("op-1", Observation.ABSENT, null, null, 0, NOW + 3);
        Dispatch again = outbox.redispatch("op-1", ALLOW, NOW + 4);
        assertEquals("key-1", again.providerKey); assertEquals(2, again.attempt);
        String ref = provider.send(again);
        assertTrue(outbox.recordResult(again, Observation.CONFIRMED, ref, 10, NOW + 5));
        assertEquals(1, provider.count("key-1"));
    }

    /** Test-only view that records whether a transaction is open when the Broker callback runs. */
    private static final class TrackingDatabase implements Database {
        final Database inner; int depth;
        TrackingDatabase(Database inner) { this.inner = inner; }
        public void execute(String sql, Object... args) { inner.execute(sql, args); }
        public java.util.List<Map<String,String>> query(String sql, Object... args) { return inner.query(sql, args); }
        public <T> T transaction(java.util.function.Supplier<T> body) {
            depth++;
            try { return inner.transaction(body); } finally { depth--; }
        }
        public void close() { inner.close(); }
    }

    @Test public void authorityRunsOutsideTransactionsAndChangesDuringItRefuseTheSend() {
        TrackingDatabase tracking = new TrackingDatabase(db);
        ExternalWriteOutbox tracked = new ExternalWriteOutbox(tracking);
        int[] calls = {0};
        tracked.prepare(Effect.EXTERNAL_WRITE, op("op-1", "p", 1, "key-1", true), NOW);
        Dispatch d = tracked.beginDispatch("op-1", (o, now) -> { calls[0]++; assertEquals(0, tracking.depth); return true; }, NOW + 1);
        assertTrue(tracked.recordUnknown(d, NOW + 2));
        tracked.reconcile("op-1", Observation.ABSENT, null, null, 0, NOW + 3);
        tracked.redispatch("op-1", (o, now) -> { calls[0]++; assertEquals(0, tracking.depth); return true; }, NOW + 4);
        assertEquals(2, calls[0]);

        tracked.prepare(Effect.EXTERNAL_WRITE, op("op-2", "p", 1, "key-2", false), NOW);
        assertEquals("OPERATION_CHANGED_DURING_AUTHORIZATION", assertThrows(IllegalStateException.class,
            () -> tracked.beginDispatch("op-2", (o, now) -> { tracked.cancel("op-2", now); return true; }, NOW + 5)).getMessage());
        assertEquals("cancelled", tracked.state("op-2"));
        tracked.prepare(Effect.EXTERNAL_WRITE, op("op-3", "p", 1, "key-3", false), NOW);
        assertEquals("WORK_NOT_ACTIVE", assertThrows(IllegalStateException.class,
            () -> tracked.beginDispatch("op-3", (o, now) -> { engine.cancel(work); return true; }, NOW + 6)).getMessage());
        assertEquals("prepared", tracked.state("op-3"));
        assertEquals("0", tracked.record("op-3").get("attempts"));                    // nothing was sent
    }

    @Test public void rejectedResultAndTamperedRecordAreFinal() {
        outbox.prepare(Effect.EXTERNAL_WRITE, op("op-1", "p", 10, "key-1", false), NOW);
        Dispatch d = outbox.beginDispatch("op-1", ALLOW, NOW + 1);
        assertTrue(outbox.recordResult(d, Observation.REJECTED, null, 0, NOW + 2));
        assertEquals("rejected", outbox.state("op-1"));
        assertThrows(IllegalStateException.class, () -> outbox.cancel("op-1", NOW + 3));
        outbox.prepare(Effect.EXTERNAL_WRITE, op("op-2", "p", 10, "key-2", false), NOW);
        db.execute("UPDATE outbox_operations SET cost_limit_minor=999999 WHERE operation_id='op-2'");
        assertEquals("OPERATION_RECORD_CORRUPT",
            assertThrows(IllegalStateException.class, () -> outbox.beginDispatch("op-2", ALLOW, NOW + 4)).getMessage());
    }
}
