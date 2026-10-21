package dev.rock.automation;

import android.content.Context;
import android.os.BatteryManager;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.rock.core.Engine;
import dev.rock.sdk.ZemaToolPlan;
import java.io.File;
import java.nio.file.Files;
import java.util.UUID;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Opt-in physical acceptance. Default CI must report a skip, never infer model success. */
@RunWith(AndroidJUnit4.class)
public final class LocalModelPlanningAcceptanceTest {
    private String physicalProfileId() {
        return InstrumentationRegistry.getArguments().getString("rockPhysicalModelProfile", "dev.rock.qwen3-06b-q8");
    }

    @Test public void exactV4WeightPlansAndRealToolsProduceADurableArtifact() throws Exception {
        Assume.assumeTrue("requires owner-connected Pixel and explicit physical acceptance flag",
            "true".equals(InstrumentationRegistry.getArguments().getString("rockPhysicalModelAcceptance")));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("frankel", android.os.Build.DEVICE);
        assertTrue(context.getSystemService(BatteryManager.class).isCharging());
        RockApplication application = (RockApplication) context.getApplicationContext();
        Engine engine = application.engine();
        assertFalse("must not resume unrelated paused work", engine.paused());
        LocalModelCatalog.Entry selectedModel = new LocalModelInstaller(context, application.platform()).catalog().require(physicalProfileId());
        File weights = new File(context.getExternalFilesDir(null), selectedModel.fileName);
        assertTrue("stage the official pinned model in the Broker app's own external files", weights.isFile());
        String installed = new LocalModelInstaller(context, application.platform()).install(physicalProfileId(),
            ParcelFileDescriptor.open(weights, ParcelFileDescriptor.MODE_READ_ONLY), true);
        assertEquals("ready", new JSONObject(installed).getString("status"));
        Engine.SkySelection selection = engine.selectSkyTool(ZemaToolPlan.ARTICLE_TOOL);
        String requestId = UUID.randomUUID().toString();
        String prompt = "日本語で、部屋の片づけを小さく始める方法の記事下書きを作る。導入、具体的な3手順、最後の確認を書く。"
            + "出典は未調査と明記し、実在する人物や根拠のない数値を作らない。まとめは3項目。投稿や課金はしない。";
        String workId = null;
        try {
            workId = new ZemaOrchestrator(context, engine).submit(requestId, selection.token, prompt, "[]", true);
            assertEquals(workId, new ZemaOrchestrator(context, engine).submit(requestId, selection.token, prompt, "[]", true));
            Scheduler.schedule(context);
            long deadline = SystemClock.elapsedRealtime() + 120_000;
            String artifact = null;
            while (SystemClock.elapsedRealtime() < deadline) {
                try { artifact = engine.result(workId); break; }
                catch (IllegalStateException pending) { SystemClock.sleep(400); }
            }
            assertNotNull("real Tools must produce an artifact", artifact);
            assertFalse(artifact.isBlank());
            assertTrue(engine.runs(workId).stream().allMatch(run -> "succeeded".equals(run.get("state"))));
            assertEquals(2, engine.runs(workId).size());
            java.util.Map<String,String> pin = application.platform().modelProfileForPin(AndroidOwner.current(context), workId);
            assertEquals(physicalProfileId(), pin.get("profile_id"));
            assertEquals(selectedModel.profile.weightsSha256, pin.get("weights_sha256"));
            JSONObject result = new JSONObject().put("workId", workId).put("profileId", pin.get("profile_id"))
                .put("weightsSha256", pin.get("weights_sha256")).put("artifactSha256", Engine.digest(artifact))
                .put("stepsSucceeded", 2).put("reviewRequired", true).put("deviceRebootAccepted", false);
            Files.write(new File(context.getExternalFilesDir(null), "local-jennifer-acceptance.json").toPath(), result.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } finally {
            if (workId != null) engine.cancel(workId); // Only the synthetic work created by this test.
        }
    }
    @Test public void stopAndResumeDuringActualModelPlanCannotCommitLateWork() throws Exception {
        Assume.assumeTrue("physical model stop acceptance is opt-in",
            "true".equals(InstrumentationRegistry.getArguments().getString("rockPhysicalModelAcceptance")));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("frankel", android.os.Build.DEVICE);
        assertTrue(context.getSystemService(BatteryManager.class).isCharging());
        Engine engine = ((RockApplication) context.getApplicationContext()).engine();
        assertFalse("must not resume somebody else's paused work", engine.paused());
        Assume.assumeTrue("do not pause unrelated active work", engine.list().stream().allMatch(work ->
            java.util.Set.of("completed", "cancelled", "review", "sample").contains(work.get("state"))));
        assertEquals("ready", new JSONObject(new LocalModelInstaller(context,
            ((RockApplication) context.getApplicationContext()).platform()).reload(physicalProfileId(), true)).getString("status"));
        int before = engine.list().size();
        Engine.SkySelection selection = engine.selectSkyTool(ZemaToolPlan.ARTICLE_TOOL);
        java.util.concurrent.ExecutorService executor = java.util.concurrent.Executors.newSingleThreadExecutor();
        java.util.concurrent.Future<String> pending = executor.submit(() -> new ZemaOrchestrator(context, engine).submit(
            UUID.randomUUID().toString(), selection.token,
            "日本語で部屋の片づけの記事下書きを作る。具体的な3手順と最後の確認を書く。投稿や課金はしない。", "[]", true));
        String unexpectedWork = null;
        boolean ownPause = false;
        try {
            long deadline = SystemClock.elapsedRealtime() + 15_000;
            boolean busy = false;
            while (!pending.isDone() && SystemClock.elapsedRealtime() < deadline) {
                if ("busy".equals(new LocalAiConnection(context).status())) { busy = true; break; }
                SystemClock.sleep(100);
            }
            assertTrue("must observe the actual runtime planning before stopping", busy);
            assertFalse(pending.isDone());
            SystemClock.sleep(300);
            assertFalse(pending.isDone());
            long stopStarted = SystemClock.elapsedRealtime();
            ZemaOrchestrator.setPaused(engine, true);
            ownPause = true;
            long stopMillis = SystemClock.elapsedRealtime() - stopStarted;
            assertTrue("stop acknowledgement must return within five seconds", stopMillis < 5_000);
            ZemaOrchestrator.setPaused(engine, false);
            ownPause = false;
            try {
                unexpectedWork = pending.get(30, java.util.concurrent.TimeUnit.SECONDS);
                fail("a stopped plan must not submit after resume");
            } catch (java.util.concurrent.ExecutionException stopped) {
                assertEquals("LOCAL_EXECUTION_PAUSED", stopped.getCause().getMessage());
            }
            assertEquals(before, engine.list().size());
            long runtimeWaitStarted = SystemClock.elapsedRealtime();
            deadline = runtimeWaitStarted + 30_000;
            while (!"ready".equals(new LocalAiConnection(context).status()) && SystemClock.elapsedRealtime() < deadline)
                SystemClock.sleep(200);
            assertEquals("ready", new LocalAiConnection(context).status());
            assertEquals(before, engine.list().size());
            JSONObject result = new JSONObject().put("actualRuntimeBusyObserved", true)
                .put("stopThenResume", true).put("lateWorkCreated", false).put("runtimeReadyAfterStop", true)
                .put("stopMillis", stopMillis).put("runtimeReadyWaitMillis", SystemClock.elapsedRealtime() - runtimeWaitStarted)
                .put("workCountBefore", before).put("workCountAfter", engine.list().size());
            Files.write(new File(context.getExternalFilesDir(null), "local-jennifer-stop-acceptance.json").toPath(),
                result.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } finally {
            // The test started unpaused with no unrelated active work, and restores only its own stop.
            if (ownPause) ZemaOrchestrator.setPaused(engine, false);
            if (unexpectedWork == null && pending.isDone() && !pending.isCancelled()) {
                try { unexpectedWork = pending.get(); } catch (Exception failedPlan) { /* No work was returned. */ }
            }
            if (unexpectedWork != null) engine.cancel(unexpectedWork);
            if (!pending.isDone()) pending.cancel(true);
            executor.shutdownNow();
        }
    }

    @Test public void physicalPlanUsesTheRequestedTopicInsteadOfTheOldExample() throws Exception {
        Assume.assumeTrue("real model language check is physical opt-in",
            "true".equals(InstrumentationRegistry.getArguments().getString("rockPhysicalModelAcceptance")));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("frankel", android.os.Build.DEVICE);
        RockApplication app = (RockApplication) context.getApplicationContext();
        assertFalse(app.engine().paused());
        assertEquals("ready", new JSONObject(new LocalModelInstaller(context, app.platform())
            .reload(physicalProfileId(), true)).getString("status"));
        String prompt = ZemaToolPlan.planningPrompt(ZemaToolPlan.ARTICLE_TOOL,
            "日本語で、部屋の片づけを小さく始める記事下書きを作る。導入、具体的な3手順、最後の確認を書く。出典は未調査と明記する。投稿・送信・課金はしない。");
        Engine.ModelProfilePin pin = app.engine().prepareModelProfilePin(AndroidOwner.current(context),
            UUID.randomUUID().toString(), Engine.digest(prompt), System.currentTimeMillis());
        LocalAiConnection.Result result = new LocalAiConnection(context).plan(UUID.randomUUID().toString(), pin,
            dev.rock.sdk.LocalWorkDraft.SCHEMA, dev.rock.sdk.LocalWorkDraft.prompt("article", prompt), "[]");
        JSONObject observed = new JSONObject().put("event", result.event).put("payload", result.payload);
        Files.write(new File(context.getExternalFilesDir(null), "local-jennifer-synthetic-plan.json").toPath(),
            observed.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertEquals("synthetic diagnostic payload is saved in the app's external files", "completed", result.event);
        JSONObject input = new JSONObject(dev.rock.sdk.LocalWorkDraft.articleInput(result.payload));
        assertTrue(input.getString("markdown").contains("片") || input.getString("markdown").contains("部屋"));
        assertFalse(input.getString("summary").contains("- 要点1"));
    }

    @Test public void physicalSavedArtifactMatchesItsReceiptAfterProcessRestart() throws Exception {
        android.os.Bundle args = InstrumentationRegistry.getArguments();
        Assume.assumeTrue("physical readback needs an explicit synthetic receipt",
            "true".equals(args.getString("rockPhysicalModelAcceptance"))
                && args.getString("rockSyntheticWorkId") != null && args.getString("rockExpectedArtifactSha256") != null);
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("frankel", android.os.Build.DEVICE);
        RockApplication app = (RockApplication) context.getApplicationContext();
        String id = args.getString("rockSyntheticWorkId"), expected = args.getString("rockExpectedArtifactSha256");
        assertTrue(id.matches("[a-f0-9-]{36}")); assertTrue(expected.matches("[a-f0-9]{64}"));
        String artifact = app.engine().result(id);
        assertEquals(expected, Engine.digest(artifact));
        java.util.Map<String,String> pin = app.platform().modelProfileForPin(AndroidOwner.current(context), id);
        assertEquals(physicalProfileId(), pin.get("profile_id"));
        Files.write(new File(context.getExternalFilesDir(null), "local-jennifer-readback-artifact.md").toPath(),
            artifact.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        JSONObject receipt = new JSONObject().put("mode", "existing_artifact_readback_only")
            .put("workId", id).put("profileId", physicalProfileId()).put("artifactSha256", expected)
            .put("artifactBytes", artifact.getBytes(java.nio.charset.StandardCharsets.UTF_8).length).put("deviceReboot", false);
        Files.write(new File(context.getExternalFilesDir(null), "local-jennifer-readback.json").toPath(),
            receipt.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

}
