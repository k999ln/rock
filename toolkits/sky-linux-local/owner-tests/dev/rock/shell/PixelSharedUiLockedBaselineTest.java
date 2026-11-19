package dev.rock.shell;

import android.app.KeyguardManager;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Locked update preflight: no account decryption, cloud call, enrollment or inference. */
@RunWith(AndroidJUnit4.class)
public final class PixelSharedUiLockedBaselineTest {
    private static String hash(byte[] value) throws Exception {
        StringBuilder hex = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(value)) hex.append(String.format(java.util.Locale.ROOT, "%02x", b));
        return hex.toString();
    }
    @Test public void captureLockedLocalStateBeforeUpdate() throws Exception {
        assertEquals("physical", InstrumentationRegistry.getArguments().getString("rockAcceptanceTarget"));
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("This route is only for the observed locked owner device", c.getSystemService(KeyguardManager.class).isDeviceLocked());
        File receipt = new File(c.getFilesDir(), "pixel-common-ui-before.json");
        assertFalse("Do not overwrite a previously captured baseline", receipt.exists());
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        assertTrue(keys.containsAlias("sky-linux-bridge-ec-v1"));
        assertTrue(keys.containsAlias("eve-account-session-aes-v1"));
        List<String> aliases = Collections.list(keys.aliases()); Collections.sort(aliases);
        assertTrue(SkyLinuxBridge.paired(c));
        File account = new File(c.getNoBackupFilesDir(), "account/eve-account-session-v2.bin");
        assertTrue("Existing encrypted owner session must be present", account.isFile());
        String accountHash = hash(Files.readAllBytes(account.toPath()));
        JSONObject snapshot = SkyLinuxBridge.request(c, new JSONObject().put("action", "status"));
        JSONArray runs = snapshot.getJSONArray("runs");
        for (int i = 0; i < runs.length(); i++) {
            JSONObject run = runs.getJSONObject(i);
            assertNotEquals("Existing work is still active", "active", run.getJSONObject("job").getString("status"));
            assertFalse("Existing stop is unconfirmed", java.util.Arrays.asList("requested", "unconfirmed").contains(run.optString("stop")));
        }
        List<String> afterAliases = Collections.list(keys.aliases()); Collections.sort(afterAliases);
        assertEquals(aliases, afterAliases);
        assertEquals(accountHash, hash(Files.readAllBytes(account.toPath())));
        JSONObject baseline = new JSONObject().put("schema", "rockstaros.pixel-common-ui-before/1")
            .put("snapshot", snapshot).put("keyAliases", new JSONArray(aliases)).put("accountCiphertextSha256", accountHash)
            .put("capturedAt", System.currentTimeMillis()).put("lockedLocalBaseline", true)
            .put("remoteHistoryReadbackDeferred", true).put("cloudCalls", 0);
        try (OutputStream out = c.openFileOutput(receipt.getName(), Context.MODE_PRIVATE)) { out.write(baseline.toString().getBytes(StandardCharsets.UTF_8)); }
    }
}
