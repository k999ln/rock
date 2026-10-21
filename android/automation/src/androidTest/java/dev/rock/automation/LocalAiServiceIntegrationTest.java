package dev.rock.automation;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.Set;
import java.util.UUID;
import dev.rock.sdk.ZemaToolPlan;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** Exercises the installed, separately packaged local-AI service over Binder. */
@RunWith(AndroidJUnit4.class)
public final class LocalAiServiceIntegrationTest {
    @Test public void connectsToPinnedSignedServiceAndReadsValidatedStatus() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String state = new LocalAiConnection(context).status();
        assertTrue(Set.of("ready", "no_model", "loading", "busy", "error").contains(state));
        // A status-only service observation is not a verified model profile and cannot authorize planning.
        try {
            new LocalAiConnection(context).requireReadyForPlanning(null);
            throw new AssertionError("planning without an immutable model profile must be rejected");
        } catch (SecurityException expected) {
            assertEquals("MODEL_PROFILE_PIN_REQUIRED", expected.getMessage());
        }
    }

    @Test public void brokerEvidenceReportsOnlyTheLoadedProfileFromTheSignedRuntime() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        org.json.JSONObject evidence = new LocalAiConnection(context).statusEvidence();
        assertEquals("llama.rn", evidence.getString("runtime"));
        assertEquals(4, evidence.getInt("apiVersion"));
        assertEquals("approved_package_signature_and_binder_api", evidence.getString("trustBasis"));
        assertEquals("not_reported", evidence.getString("modelProfileIdentity"));
        assertTrue(Set.of("ready", "no_model", "loading", "busy", "error")
            .contains(evidence.getString("state")));
    }

    @Test public void runtimeMatchesInstalledModelState() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        LocalAiConnection connection = new LocalAiConnection(context);
        String state = connection.status();
        LocalAiConnection.Result result = connection.complete(
            UUID.randomUUID().toString(), "端末内モデルの接続を確認", "[]");
        if ("no_model".equals(state)) {
            assertEquals("failed", result.event);
            assertEquals("NO_MODEL", result.payload);
        } else if ("ready".equals(state)) {
            assertEquals("completed", result.event);
            assertTrue(!result.payload.trim().isEmpty());
        } else {
            assertEquals("failed", result.event);
        }
    }

    @Test public void planApiRejectsRequestsWithoutAModelProfilePin() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        LocalAiConnection connection = new LocalAiConnection(context);
        try {
            connection.plan(UUID.randomUUID().toString(), null,
                ZemaToolPlan.ARTICLE_PLAN_SCHEMA,
                ZemaToolPlan.planningPrompt(ZemaToolPlan.ARTICLE_TOOL,
                    "検証用の記事原稿と要約を準備して"), "[]");
            throw new AssertionError("unprofiled planning request must be rejected");
        } catch (SecurityException expected) {
            assertEquals("MODEL_PROFILE_PIN_REQUIRED", expected.getMessage());
        }
    }
}
