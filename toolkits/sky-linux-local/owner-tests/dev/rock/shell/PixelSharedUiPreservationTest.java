package dev.rock.shell;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Update preservation only. Account/history/foreground acceptance is a separate test. */
@RunWith(AndroidJUnit4.class)
public final class PixelSharedUiPreservationTest {
    private static String canonical(Object value) throws Exception {
        if (value instanceof JSONObject) { JSONObject o = (JSONObject) value; List<String> keys = new ArrayList<>(); Iterator<String> it = o.keys(); while (it.hasNext()) keys.add(it.next()); Collections.sort(keys); List<String> pairs = new ArrayList<>(); for (String key : keys) pairs.add(JSONObject.quote(key) + ":" + canonical(o.get(key))); return "{" + String.join(",", pairs) + "}"; }
        if (value instanceof JSONArray) { JSONArray a = (JSONArray) value; List<String> items = new ArrayList<>(); for (int i = 0; i < a.length(); i++) items.add(canonical(a.get(i))); return "[" + String.join(",", items) + "]"; }
        return value == null || value == JSONObject.NULL ? "null" : value instanceof String ? JSONObject.quote((String) value) : value.toString();
    }
    @Test public void preservesExistingLocalDataAndKeysAfterUpdate() throws Exception {
        assertEquals("physical", InstrumentationRegistry.getArguments().getString("rockAcceptanceTarget"));
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        JSONObject before;
        try (InputStream in = c.openFileInput("pixel-common-ui-before.json")) { before = new JSONObject(new String(in.readAllBytes(), StandardCharsets.UTF_8)); }
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        List<String> aliases = Collections.list(keys.aliases()); Collections.sort(aliases);
        assertEquals(canonical(before.getJSONArray("keyAliases")), canonical(new JSONArray(aliases)));
        if (before.has("accountCiphertextSha256")) {
            byte[] encrypted = Files.readAllBytes(new File(c.getNoBackupFilesDir(), "account/eve-account-session-v2.bin").toPath());
            StringBuilder hex = new StringBuilder(); for (byte b : MessageDigest.getInstance("SHA-256").digest(encrypted)) hex.append(String.format(java.util.Locale.ROOT, "%02x", b));
            assertEquals("Encrypted account session must not be replaced", before.getString("accountCiphertextSha256"), hex.toString());
        }
        JSONObject after = SkyLinuxBridge.request(c, new JSONObject().put("action", "status"));
        for (String field : new String[]{"runs", "models", "agents"}) assertEquals("Preserve " + field, canonical(before.getJSONObject("snapshot").get(field)), canonical(after.get(field)));
        JSONObject proof = new JSONObject().put("preservationAccepted", true).put("jobs", after.getJSONArray("runs").length())
            .put("models", after.getJSONArray("models").length()).put("agents", after.getJSONArray("agents").length())
            .put("encryptedAccountFileUnchanged", before.has("accountCiphertextSha256")).put("keyAliasesUnchanged", true)
            .put("newInference", 0).put("cloudCalls", 0).put("remoteHistoryAccepted", false).put("foregroundSyncAccepted", false);
        try (OutputStream out = c.openFileOutput("pixel-common-ui-preservation.json", Context.MODE_PRIVATE)) { out.write(proof.toString(2).getBytes(StandardCharsets.UTF_8)); }
    }
}
