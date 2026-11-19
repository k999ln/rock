package dev.rock.shell;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.After;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Existing owner/bridge only. Starts sync, reads back, stops sync; never submits inference. */
@RunWith(AndroidJUnit4.class)
public final class PixelSharedUiAcceptanceTest {
    @After public void restoreTemporaryForegroundTestState() {
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        c.stopService(new Intent(c, EvePixelHostService.class));
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            for (android.app.Activity activity : androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(androidx.test.runner.lifecycle.Stage.RESUMED))
                if (activity instanceof RockstarOsActivity) activity.getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }
    private static String canonical(Object value) throws Exception {
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value; List<String> keys = new ArrayList<>();
            Iterator<String> it = object.keys(); while (it.hasNext()) keys.add(it.next()); Collections.sort(keys);
            List<String> pairs = new ArrayList<>(); for (String key : keys) pairs.add(JSONObject.quote(key) + ":" + canonical(object.get(key)));
            return "{" + String.join(",", pairs) + "}";
        }
        if (value instanceof JSONArray) { JSONArray array = (JSONArray) value; List<String> items = new ArrayList<>(); for (int i = 0; i < array.length(); i++) items.add(canonical(array.get(i))); return "[" + String.join(",", items) + "]"; }
        return value == null || value == JSONObject.NULL ? "null" : value instanceof String ? JSONObject.quote((String) value) : value.toString();
    }

    @Test public void sharedUiHostRetainsJobsAndSyncsWithoutNewInference() throws Exception {
        assertEquals("physical", InstrumentationRegistry.getArguments().getString("rockAcceptanceTarget"));
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertFalse(c.getSystemService(KeyguardManager.class).isDeviceLocked());
        JSONObject before;
        try (InputStream in = c.openFileInput("pixel-common-ui-before.json")) { before = new JSONObject(new String(in.readAllBytes(), StandardCharsets.UTF_8)); }
        JSONObject old = before.getJSONObject("snapshot");
        c.startActivity(new Intent(c, RockstarOsActivity.class).putExtra("deviceSettings", true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        SystemClock.sleep(600);
        final android.app.Activity[] testActivity = {null};
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            for (android.app.Activity activity : androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(androidx.test.runner.lifecycle.Stage.RESUMED))
                if (activity instanceof RockstarOsActivity) testActivity[0] = activity;
            assertNotNull("Owner settings must be visible for the foreground test", testActivity[0]);
            testActivity[0].getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
        assertTrue("Existing owner grant must be unlocked", EveAccountSync.linked(c));
        JSONObject queue = EveAccountSync.request(c, "/api/eve/device-sync", "GET", null, true);
        JSONArray pending = queue.optJSONArray("commands");
        assertTrue("Handle pending owner commands before this no-new-work check", pending == null || pending.length() == 0);
        JSONObject historyBefore = before.has("history") ? before.getJSONObject("history")
            : EveAccountSync.request(c, "/api/eve/history", "GET", null, true);
        int preservedReplicas = 0;
        if (before.optBoolean("lockedLocalBaseline")) {
            JSONObject tracked = new JSONObject(EveAccountSync.prefs(c).getString("jobs_" + EveAccountSync.ownerScope(c), "{}"));
            JSONArray replicas = queue.getJSONArray("jobs"), saved = old.getJSONArray("runs");
            for (int i = 0; i < saved.length(); i++) {
                JSONObject local = saved.getJSONObject(i); String id = local.getJSONObject("job").getString("id");
                if (!tracked.has(id)) continue;
                JSONObject replica = null;
                for (int j = 0; j < replicas.length(); j++) if (id.equals(replicas.getJSONObject(j).getJSONObject("run").getJSONObject("job").getString("id"))) replica = replicas.getJSONObject(j);
                assertNotNull("Previously linked job must remain in the same account", replica);
                assertEquals(tracked.getString(id), replica.getString("threadId"));
                assertEquals(local.optString("input"), replica.getJSONObject("run").optString("input"));
                assertEquals(local.optString("text"), replica.getJSONObject("run").optString("text"));
                JSONObject thread = EveAccountSync.request(c, "/api/eve/history?id=" + tracked.getString(id), "GET", null, true);
                JSONArray messages = thread.getJSONObject("session").getJSONArray("messages");
                boolean requestFound = false, resultFound = local.optString("text").isEmpty();
                for (int j = 0; j < messages.length(); j++) {
                    JSONObject m = messages.getJSONObject(j);
                    if (("linux:" + id + ":request").equals(m.optString("id")) && local.optString("input").equals(m.optString("text"))) requestFound = true;
                    if (("linux:" + id + ":result").equals(m.optString("id")) && local.optString("text").equals(m.optString("text"))) resultFound = true;
                }
                assertTrue("Saved request/result must still exist in the original thread", requestFound && resultFound);
                preservedReplicas++;
            }
            assertTrue("At least one previously linked account job is required", preservedReplicas > 0);
        }
        long started = System.currentTimeMillis();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> c.startForegroundService(new Intent(c, EvePixelHostService.class)));
        try {
            long end = SystemClock.elapsedRealtime() + 65000;
            while (EvePixelHostService.lastConfirmedAt() < started && SystemClock.elapsedRealtime() < end) SystemClock.sleep(500);
            assertTrue("Foreground account sync not confirmed", EvePixelHostService.lastConfirmedAt() >= started);
            assertTrue(EvePixelHostService.running()); assertTrue(EveAccountSync.linked(c));
            JSONObject after = SkyLinuxBridge.request(c, new JSONObject().put("action", "status"));
            for (String key : new String[]{"runs", "models", "agents"}) assertEquals("Preserve " + key, canonical(old.get(key)), canonical(after.get(key)));
            java.security.KeyStore keys = java.security.KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
            java.util.List<String> aliases = java.util.Collections.list(keys.aliases()); java.util.Collections.sort(aliases);
            assertEquals("No new or removed app keys", canonical(before.getJSONArray("keyAliases")), canonical(new JSONArray(aliases)));
            JSONObject remote = EveAccountSync.request(c, "/api/eve/history", "GET", null, true);
            assertEquals("Existing account history must remain unchanged", canonical(historyBefore), canonical(remote));
            JSONObject proof = new JSONObject().put("accepted", true).put("existingJobsRetained", after.getJSONArray("runs").length())
                .put("modelsRetained", after.getJSONArray("models").length()).put("agentsRetained", after.getJSONArray("agents").length())
                .put("sameAccountHistory", true).put("keyAliasesUnchanged", true)
                .put("remoteHistoryBaselineBeforeUpdate", before.has("history")).put("existingReplicasReadBack", preservedReplicas).put("newInference", 0).put("newGrants", 0).put("foregroundSyncConfirmed", true)
                .put("lastConfirmedAt", EvePixelHostService.lastConfirmedAt());
            try (OutputStream out = c.openFileOutput("pixel-common-ui-acceptance.json", Context.MODE_PRIVATE)) { out.write(proof.toString(2).getBytes(StandardCharsets.UTF_8)); }
        } finally {
            c.stopService(new Intent(c, EvePixelHostService.class));
            long end = SystemClock.elapsedRealtime() + 5000; while (EvePixelHostService.running() && SystemClock.elapsedRealtime() < end) SystemClock.sleep(100);
            assertFalse("Service must stop without reboot or credential deletion", EvePixelHostService.running());
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                if (testActivity[0] != null && !testActivity[0].isDestroyed()) testActivity[0].getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
    }
}
