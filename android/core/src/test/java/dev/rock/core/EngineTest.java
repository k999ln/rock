package dev.rock.core;

import org.junit.*;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;
import java.util.concurrent.*;

public class EngineTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();
    private JdbcDatabase db; private Engine engine; private String file;
    @Before public void setup() throws Exception { file = temp.newFile("work.db").getPath(); db = new JdbcDatabase(file); engine = new Engine(db); }
    @After public void close() { db.close(); }
    private String submit() { return engine.submit("request-1", "原稿🔒", false, true); }
    private Engine.Ticket claim(long time) { return engine.claim("boot-1", time, true); }

    @Test public void twoStepsPersistAndRequireHumanReview() {
        String id = submit(); Engine.Ticket first = claim(10);
        assertEquals("citations@1", first.tool); assertEquals("原稿🔒", first.input);
        assertTrue(engine.finish(first, "passed", "整理済み", "boot-1", 20));
        assertNotNull(claim(30)); // Simulate losing the process after claiming the second step.
        db.close(); db = new JdbcDatabase(file); engine = new Engine(db);
        Engine.Ticket next = engine.claim("boot-2", 1, true);
        assertEquals(1, next.step); assertEquals("整理済み", next.input);
        assertTrue(engine.finish(next, "passed", "無料版", "boot-2", 2));
        assertEquals("review", engine.work(id).get("state")); assertEquals("無料版", engine.result(id));
        assertThrows(IllegalArgumentException.class, () -> engine.complete(id, " "));
        engine.complete(id, "本文・出典を確認"); assertEquals("completed", engine.work(id).get("state"));
        assertNull(claim(100));
    }
    @Test public void submitIsIdempotentButConflictingPayloadIsRejected() {
        String id = submit(); assertEquals(id, submit()); assertEquals(1, engine.list().size());
        assertThrows(IllegalStateException.class, () -> engine.submit("request-1", "別の原稿", false, true));
        assertThrows(IllegalStateException.class, () -> engine.submit("request-1", "原稿🔒", true, true));
    }
    @Test public void duplicateResultDoesNotAdvanceTwice() {
        String id = submit(); Engine.Ticket t = claim(1);
        assertTrue(engine.finish(t, "passed", "output", "boot-1", 2));
        assertFalse(engine.finish(t, "passed", "output", "boot-1", 3));
        assertEquals(3, engine.events(id).size()); assertEquals("queued", engine.runs(id).get(1).get("state"));
    }
    @Test public void staleLeaseAndRebootFenceOldResults() {
        submit(); Engine.Ticket old = claim(10);
        assertNull(claim(20)); Engine.Ticket next = engine.claim("boot-2", 1, true);
        assertEquals(2, next.attempt); assertNotEquals(old.token, next.token);
        assertFalse(engine.finish(old, "passed", "old", "boot-2", 2));
        assertTrue(engine.finish(next, "passed", "new", "boot-2", 2));
    }
    @Test public void deadlineUsesUptimeAndRetriesAreBounded() {
        String id = submit(); Engine.Ticket old = claim(1);
        assertFalse(engine.finish(old, "passed", "late", "boot-1", old.deadline));
        assertEquals(2, claim(old.deadline).attempt);
        assertEquals(3, claim(old.deadline + Engine.LEASE_MS).attempt);
        assertNull(claim(old.deadline + Engine.LEASE_MS * 2));
        assertEquals("needs_review", engine.runs(id).get(0).get("state"));
    }
    @Test public void failuresSamplesAndReviewNeverAdvance() {
        for (String outcome : new String[]{"failed", "needs_review", "passed"}) {
            String id = engine.submit(outcome, "input", outcome.equals("passed"), true);
            Engine.Ticket t = claim(1); engine.finish(t, outcome, "output", "boot-1", 2);
            assertEquals("active", engine.work(id).get("state"));
            assertEquals("pending", engine.runs(id).get(1).get("state"));
            assertThrows(IllegalStateException.class, () -> engine.complete(id, "確認"));
        }
    }
    @Test public void stopIsDurableAndInvalidatesRunningToken() {
        submit(); Engine.Ticket t = claim(1); engine.setPaused(true);
        assertFalse(engine.finish(t, "passed", "late", "boot-1", 2)); assertNull(claim(3));
        db.close(); db = new JdbcDatabase(file); engine = new Engine(db); assertTrue(engine.paused());
        engine.setPaused(false); assertNotEquals(t.token, claim(4).token);
    }
    @Test public void cancelIsTerminalAndDoesNotAdoptLateOutput() {
        String id = submit(); Engine.Ticket t = claim(1); engine.cancel(id); engine.cancel(id);
        assertFalse(engine.finish(t, "passed", "late", "boot-1", 2)); assertNull(claim(3));
        assertEquals("cancelled", engine.work(id).get("state"));
    }
    @Test public void chargingAndConsentAreEnforced() {
        assertThrows(SecurityException.class, () -> engine.submit("denied", "body", false, false));
        submit(); assertNull(engine.claim("boot-1", 0, false)); assertNotNull(claim(1));
    }
    @Test public void invalidInputsAndOversizedResultsAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> engine.submit("x", "あ".repeat(Engine.MAX_BYTES), false, true));
        assertThrows(IllegalArgumentException.class, () -> engine.submit("x", "\uD800", false, true));
        assertThrows(IllegalArgumentException.class, () -> engine.submit("../x", "body", false, true));
        submit(); Engine.Ticket t = claim(1);
        assertThrows(IllegalArgumentException.class, () -> engine.finish(t, "passed", " ", "boot-1", 2));
        assertThrows(IllegalArgumentException.class, () -> engine.finish(t, "passed", "x".repeat(Engine.MAX_BYTES + 1), "boot-1", 2));
        assertThrows(IllegalArgumentException.class, () -> engine.finish(t, "success", "output", "boot-1", 2));
    }
    @Test public void transactionFailureDoesNotPublishHalfAResult() {
        String id = submit(); Engine.Ticket t = claim(1);
        db.execute("CREATE TRIGGER fail_event BEFORE INSERT ON events WHEN NEW.kind='succeeded' BEGIN SELECT RAISE(ABORT,'simulated power loss'); END");
        assertThrows(IllegalStateException.class, () -> engine.finish(t, "passed", "output", "boot-1", 2));
        assertEquals("running", engine.runs(id).get(0).get("state"));
        assertEquals("pending", engine.runs(id).get(1).get("state"));
        assertTrue(db.query("SELECT 1 FROM artifacts WHERE digest=?", Engine.digest("output")).isEmpty());
    }
    @Test public void corruptedInputCannotRun() {
        submit(); db.execute("UPDATE artifacts SET body='corrupt'");
        assertThrows(IllegalStateException.class, () -> claim(1));
        assertTrue(db.query("SELECT 1 FROM runs WHERE state='running'").isEmpty());
    }
    @Test public void unknownSchemaIsNotSilentlyReset() {
        db.execute("DROP TABLE rock_meta"); db.execute("CREATE TABLE rock_meta(version INTEGER)"); db.execute("INSERT INTO rock_meta VALUES(2)");
        assertThrows(IllegalStateException.class, () -> new Engine(db));
        assertEquals("2", db.query("SELECT version FROM rock_meta").get(0).get("version"));
    }
    @Test public void concurrentConnectionsCannotClaimTheSameWork() throws Exception {
        submit(); ExecutorService threads = Executors.newFixedThreadPool(2);
        try (JdbcDatabase other = new JdbcDatabase(file)) {
            Engine second = new Engine(other); CountDownLatch gate = new CountDownLatch(1);
            Future<Engine.Ticket> a = threads.submit(() -> { gate.await(); return claim(1); });
            Future<Engine.Ticket> b = threads.submit(() -> { gate.await(); return second.claim("boot-1", 1, true); });
            gate.countDown(); int claimed = (a.get() == null ? 0 : 1) + (b.get() == null ? 0 : 1); assertEquals(1, claimed);
        } finally { threads.shutdownNow(); }
    }
    @Test public void manualRetryRetainsPassedStepsAndCannotReviveCancelledWork() {
        String id = submit(); Engine.Ticket a = claim(1); engine.finish(a, "passed", "intermediate", "boot-1", 2);
        Engine.Ticket b = claim(3); engine.finish(b, "failed", "", "boot-1", 4);
        engine.retry(id); Engine.Ticket retried = claim(5);
        assertEquals(1, retried.step); assertEquals("intermediate", retried.input); assertEquals(1, retried.attempt);
        assertEquals("succeeded", engine.runs(id).get(0).get("state"));
        engine.cancel(id); assertThrows(IllegalStateException.class, () -> engine.retry(id));
    }
    @Test public void sampleCannotBePromotedByRetryAndEventsContainNoPayload() {
        String id = engine.submit("sample", "TOP_SECRET_INPUT", true, true);
        Engine.Ticket t = claim(1); engine.finish(t, "passed", "TOP_SECRET_OUTPUT", "boot-1", 2);
        assertThrows(IllegalStateException.class, () -> engine.retry(id));
        assertFalse(engine.events(id).toString().contains("TOP_SECRET"));
    }
}
