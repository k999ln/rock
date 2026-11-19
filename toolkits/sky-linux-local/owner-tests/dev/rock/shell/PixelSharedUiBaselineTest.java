package dev.rock.shell;

import android.app.KeyguardManager;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Explicit owner physical acceptance: read-only baseline, no job or grant creation. */
@RunWith(AndroidJUnit4.class)
public final class PixelSharedUiBaselineTest {
    @Test public void captureExistingStateBeforeUpdate() throws Exception {
        assertEquals("physical", InstrumentationRegistry.getArguments().getString("rockAcceptanceTarget"));
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertFalse("Unlock the owner Pixel before this check", c.getSystemService(KeyguardManager.class).isDeviceLocked());
        assertTrue("Existing paired bridge required", SkyLinuxBridge.paired(c));
        assertTrue("Existing owner session required", EveAccountSync.linked(c));
        java.io.File receipt = new java.io.File(c.getFilesDir(), "pixel-common-ui-before.json");
        assertFalse("Baseline already captured; do not overwrite it", receipt.exists());
        JSONObject snapshot = SkyLinuxBridge.request(c, new JSONObject().put("action", "status"));
        JSONArray runs = snapshot.getJSONArray("runs");
        for (int i = 0; i < runs.length(); i++) assertNotEquals("active", runs.getJSONObject(i).getJSONObject("job").getString("status"));
        JSONObject queue = EveAccountSync.request(c, "/api/eve/device-sync", "GET", null, true);
        JSONArray pending = queue.optJSONArray("commands");
        assertTrue("Existing owner commands are pending; handle them before the no-new-work update check", pending == null || pending.length() == 0);
        JSONObject history = EveAccountSync.request(c, "/api/eve/history", "GET", null, true);
        java.security.KeyStore keys = java.security.KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        java.util.List<String> aliases = java.util.Collections.list(keys.aliases()); java.util.Collections.sort(aliases);
        JSONObject baseline = new JSONObject().put("snapshot", snapshot).put("history", history).put("keyAliases", new JSONArray(aliases))
            .put("schema", "rockstaros.pixel-common-ui-before/1").put("capturedAt", System.currentTimeMillis());
        try (OutputStream out = c.openFileOutput(receipt.getName(), Context.MODE_PRIVATE)) { out.write(baseline.toString().getBytes(StandardCharsets.UTF_8)); }
        // Keep owner material in private app storage. Instrumentation output includes no transcript.
    }
}
