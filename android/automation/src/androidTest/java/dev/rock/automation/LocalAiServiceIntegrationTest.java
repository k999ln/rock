package dev.rock.automation;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.Set;
import java.util.UUID;
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
}
