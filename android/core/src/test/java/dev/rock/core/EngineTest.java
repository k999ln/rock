package dev.rock.core;

import dev.rock.core.platform.ComponentManifest;
import dev.rock.core.platform.ModelProfileManifest;
import dev.rock.core.platform.PlatformStore;
import dev.rock.core.platform.RuntimeManifest;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;
import java.util.UUID;
import java.util.List;
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
    @Test public void nativeSkySelectionPersistsAndFencesZemaHandoff() {
        Engine.SkySelection selected = engine.selectSkyTool(Engine.RECIPE);
        assertEquals(Engine.RECIPE, selected.toolId); assertEquals(1, selected.revision);
        assertEquals(selected.token, engine.selectSkyTool(Engine.RECIPE).token);
        assertEquals(Engine.RECIPE, engine.requireSkySelection(selected.token));
        assertThrows(SecurityException.class, () -> engine.requireSkySelection(null));
        assertThrows(SecurityException.class, () -> engine.requireSkySelection(UUID.randomUUID().toString()));
        assertThrows(SecurityException.class, () -> engine.selectSkyTool("other-tool@1"));
        db.close(); db = new JdbcDatabase(file); engine = new Engine(db);
        assertEquals(selected.token, engine.skySelection().token);
        assertEquals(Engine.RECIPE, engine.requireSkySelection(selected.token));
    }
    @Test public void submitIsIdempotentButConflictingPayloadIsRejected() {
        assertNull(engine.existingWorkId("request-1"));
        String id = submit(); assertEquals(id, engine.existingWorkId("request-1"));
        assertEquals(id, submit()); assertEquals(1, engine.list().size());
        assertThrows(IllegalStateException.class, () -> engine.submit("request-1", "別の原稿", false, true));
        assertThrows(IllegalStateException.class, () -> engine.submit("request-1", "原稿🔒", true, true));
        assertThrows(IllegalArgumentException.class, () -> engine.existingWorkId("../request"));
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
    @Test public void versionOneMigratesSkySelectionAndUnknownSchemaIsNotSilentlyReset() {
        try (JdbcDatabase legacy = new JdbcDatabase(temp.newFile("engine-v1.db").getPath())) {
            legacy.execute("CREATE TABLE rock_meta(version INTEGER NOT NULL CHECK(version=1))");
            legacy.execute("INSERT INTO rock_meta VALUES(1)");
            legacy.execute("CREATE TABLE works(id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,state TEXT NOT NULL,sample INTEGER NOT NULL,review_note TEXT NOT NULL DEFAULT '')");
            Engine migrated = new Engine(legacy);
            assertEquals("3", legacy.query("SELECT version FROM rock_meta").get(0).get("version"));
            assertNull(migrated.skySelection());
            legacy.execute("UPDATE rock_meta SET version=4");
            assertThrows(IllegalStateException.class, () -> new Engine(legacy));
            assertEquals("4", legacy.query("SELECT version FROM rock_meta").get(0).get("version"));
        } catch (Exception failure) { throw new AssertionError(failure); }
    }

    @Test public void jobsPersistThePreselectedModelProfileAcrossEngineRestart() throws Exception {
        PlatformStore platform = new PlatformStore(db);
        String signer = "a".repeat(64);
        ComponentManifest component = new ComponentManifest(ComponentManifest.Kind.TOOL,
            "org.rockstar.runtime.localai", "org.rockstar.runtime.localai", 1, 1, 1, 12003,
            "rock_tool_app", signer, List.of("text.input", "text.output", "local-ai.inference"), 1, 1);
        platform.register("register:runtime", component, 1);
        platform.activate(component.componentId, component.versionCode, false, 2);
        RuntimeManifest runtime = new RuntimeManifest(component.componentId, 1, signer, 1, 1,
            List.of("GGUF"), List.of("article-preparation@1/input-v1"));
        platform.registerRuntimeManifest(runtime);
        ModelProfileManifest profile = new ModelProfileManifest("profile.lifeline.qwen", 1,
            Engine.digest("weights"), Engine.digest("tokenizer"), Engine.digest("template"), "Apache-2.0",
            "rock.fixture", "key.fixture", "A".repeat(86),
            component.componentId, 1, 1, 1, "GGUF", "Q8_0", 4096,
            "article-preparation@1/input-v1", 1_000_000_000L, 2_000_000_000L);
        platform.registerModelProfile(profile);
        platform.activateModelProfile(profile.profileId, profile.version,
            candidate -> Engine.digest("fixture-verification"), 3);

        String jobDigest = Engine.digest("prompt and context");
        Engine.ModelProfilePin pin = engine.prepareModelProfilePin("owner:alice", "request-profile", jobDigest, 4);
        assertEquals(profile.profileId, pin.profileId);
        assertEquals(profile.digest(), pin.manifestDigest);
        assertEquals(profile.weightsSha256, pin.weightsSha256);
        assertEquals(profile.tokenizerSha256, pin.tokenizerSha256);
        assertEquals(profile.templateSha256, pin.templateSha256);
        assertEquals(component.componentId, pin.runtimeComponentId);
        assertEquals(runtime.digest(), pin.runtimeManifestDigest);
        assertEquals(signer, pin.runtimeSigningDigest);
        assertEquals(1, pin.runtimeVersionCode);
        assertEquals(1, pin.runtimeApiMin);
        assertEquals(1, pin.runtimeApiMax);
        assertEquals(1, pin.runtimeManifestApiMin);
        assertEquals(1, pin.runtimeManifestApiMax);
        assertEquals(profile.planSchemaId, pin.planSchemaId);
        ModelProfileManifest nextProfile = new ModelProfileManifest("profile.lifeline.qwen-alt", 1,
            Engine.digest("weights-next"), Engine.digest("tokenizer-next"), Engine.digest("template-next"), "Apache-2.0",
            "rock.fixture", "key.fixture", "B".repeat(86),
            component.componentId, 1, 1, 1, "GGUF", "Q4_K_M", 4096,
            "article-preparation@1/input-v1", 800_000_000L, 1_500_000_000L);
        platform.registerModelProfile(nextProfile);
        assertThrows(IllegalStateException.class, () -> platform.activateModelProfile(nextProfile.profileId,
            nextProfile.version, candidate -> { throw new AssertionError("must preserve an outstanding model reservation"); }, 5));
        assertEquals(2, platform.activateModelProfile(nextProfile.profileId, nextProfile.version,
            candidate -> Engine.digest("fixture-verification-next"), 900_005));
        String workId = engine.submitPinned(pin, "request-profile", "pinned input", false, true);
        assertEquals(workId, engine.existingPinnedWorkId("owner:alice", "request-profile", jobDigest));
        assertThrows(SecurityException.class, () -> engine.existingPinnedWorkId(
            "owner:bob", "request-profile", jobDigest));
        assertThrows(SecurityException.class, () -> engine.existingPinnedWorkId(
            "owner:alice", "request-profile", Engine.digest("different intent")));
        Engine.Ticket ticket = engine.claim("boot-1", 1, true);
        assertEquals(workId, ticket.workId);
        assertEquals(profile.profileId, ticket.modelProfileId);
        assertEquals(1, ticket.modelProfileVersion);
        assertEquals(1, ticket.modelActivationGeneration);
        assertEquals(workId, engine.submitPinned(engine.prepareModelProfilePin("owner:alice",
            "request-profile", jobDigest, 5), "request-profile", "pinned input", false, true));

        db.close(); db = new JdbcDatabase(file); engine = new Engine(db);
        Engine.Ticket restored = engine.claim("boot-2", 1, true);
        assertEquals(profile.profileId, restored.modelProfileId);
        assertEquals(1, restored.modelProfileVersion);
        assertEquals(workId, restored.workId);
        new PlatformStore(db).revokeModelProfile(profile.profileId, profile.version, 2);
        assertFalse(engine.finish(restored, "passed", "must not be adopted", "boot-2", 3));
        assertEquals("review", engine.work(workId).get("state"));
        assertEquals("needs_review", engine.runs(workId).get(0).get("state"));
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
