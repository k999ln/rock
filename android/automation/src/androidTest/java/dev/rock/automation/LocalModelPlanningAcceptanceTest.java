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
    @Test public void exactV4WeightPlansAndRealToolsProduceADurableArtifact() throws Exception {
        Assume.assumeTrue("requires owner-connected Pixel and explicit physical acceptance flag",
            "true".equals(InstrumentationRegistry.getArguments().getString("rockPhysicalModelAcceptance")));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("frankel", android.os.Build.DEVICE);
        assertTrue(context.getSystemService(BatteryManager.class).isCharging());
        RockApplication application = (RockApplication) context.getApplicationContext();
        Engine engine = application.engine();
        assertFalse("must not resume unrelated paused work", engine.paused());
        File weights = new File(context.getExternalFilesDir(null), "Qwen3-0.6B-Q8_0.gguf");
        assertTrue("stage the official pinned model in the Broker app's own external files", weights.isFile());
        String installed = new LocalModelInstaller(context, application.platform()).install("dev.rock.qwen3-06b-q8",
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
            assertEquals("dev.rock.qwen3-06b-q8", pin.get("profile_id"));
            assertEquals("9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031", pin.get("weights_sha256"));
            JSONObject result = new JSONObject().put("workId", workId).put("profileId", pin.get("profile_id"))
                .put("weightsSha256", pin.get("weights_sha256")).put("artifactSha256", Engine.digest(artifact))
                .put("stepsSucceeded", 2).put("reviewRequired", true).put("deviceRebootAccepted", false);
            Files.write(new File(context.getExternalFilesDir(null), "local-jennifer-acceptance.json").toPath(), result.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } finally {
            if (workId != null) engine.cancel(workId); // Only the synthetic work created by this test.
        }
    }
}
