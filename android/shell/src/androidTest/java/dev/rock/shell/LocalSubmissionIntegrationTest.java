package dev.rock.shell;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.IOException;
import java.lang.reflect.Field;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Exercises real signed Binder calls; fixture jobs never make a publishing or financial request. */
@RunWith(AndroidJUnit4.class)
public final class LocalSubmissionIntegrationTest {
    private static String input(String suffix) throws Exception {
        return new JSONObject().put("markdown", "# Test " + suffix + "\n\nSource ([A](https://example.test/source))\n\nDetails")
            .put("summary", "- one\n- two\n- three").put("afterChars", 4).put("price", 500)
            .put("paidContents", "Details").put("noteUrl", "https://note.com/example/n/test_article").toString();
    }

    @Test public void lostReplyAndRecreatedControllerResolveOneBrokerWorkAndRejectChangedPayload() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences prefs = context.getSharedPreferences("submission-test-" + UUID.randomUUID(), Context.MODE_PRIVATE);
        LocalSubmission.Store store = new LocalSubmission.Store() {
            public String read() { return prefs.getString("pending", null); }
            public void write(String value) throws IOException {
                SharedPreferences.Editor edit = prefs.edit();
                if (value == null) edit.remove("pending"); else edit.putString("pending", value);
                if (!edit.commit()) throw new IOException("test persistence failed");
            }
        };
        String owner = "android-user:" + context.getSystemService(android.os.UserManager.class)
            .getSerialNumberForUser(android.os.Process.myUserHandle());
        String payload = input("recovery");
        String digest = LocalSubmission.fingerprint("article", payload, "true", "true");
        ShellConnection broker = new ShellConnection(context);
        int before = new JSONObject(broker.snapshot()).getInt("totalWorkCount");
        String id = null;
        try {
            LocalSubmission first = new LocalSubmission(store);
            LocalSubmission.Attempt sent = first.begin(owner, digest);
            id = broker.submit(sent.requestId, payload, true, true);
            // Commit happened, but the UI never received its reply (e.g. process death).
            LocalSubmission recreated = new LocalSubmission(store);
            LocalSubmission.Attempt retry = recreated.begin(owner, digest);
            assertEquals(sent.requestId, retry.requestId);
            assertEquals(id, broker.submit(retry.requestId, payload, true, true));
            assertEquals(before + 1, new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
            try {
                broker.submit(retry.requestId, input("changed"), true, true);
                fail("the saved request identity must not accept a changed payload");
            } catch (IllegalStateException conflict) {
                assertTrue(conflict.getMessage().contains("REQUEST_CONFLICT"));
            }
            assertTrue(recreated.finish(retry, owner, true));
            assertNull(store.read());
            assertEquals(before + 1, new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
        } finally {
            if (id != null) broker.cancel(id);
            assertTrue(prefs.edit().clear().commit());
        }
    }

    @Test public void activityDoubleClickWhileWorkerIsDelayedCreatesOneWorkFromFrozenInput() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        ShellConnection broker = new ShellConnection(context);
        JSONObject before = new JSONObject(broker.snapshot());
        Set<String> existing = workIds(before);
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(
            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        ExecutorService worker = (ExecutorService) field(activity, "worker");
        CountDownLatch blocked = new CountDownLatch(1), release = new CountDownLatch(1);
        try {
            worker.submit(() -> {
                blocked.countDown();
                try { release.await(30, TimeUnit.SECONDS); }
                catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            });
            assertTrue("activity worker should reach the delayed-send fixture", blocked.await(30, TimeUnit.SECONDS));
            instrumentation.runOnMainSync(() -> {
                try {
                    JSONObject payload = new JSONObject(input("double-click"));
                    for (String name : new String[]{"markdown", "summary", "paid", "url", "cutoff", "price"}) {
                        String key = "paid".equals(name) ? "paidContents" : "url".equals(name) ? "noteUrl"
                            : "cutoff".equals(name) ? "afterChars" : name;
                        ((EditText) field(activity, name)).setText(payload.getString(key));
                    }
                    ((CheckBox) field(activity, "consent")).setChecked(true);
                    ((CheckBox) field(activity, "sample")).setChecked(true);
                    Button submit = findButton(activity.findViewById(android.R.id.content), "仕事を保存して自動実行を予約");
                    assertNotNull(submit);
                    submit.performClick();
                    assertFalse("submission must be fenced before the worker can start", submit.isEnabled());
                    submit.performClick(); // Even a queued/programmatic second click cannot dispatch.
                    ((EditText) field(activity, "markdown")).setText("edited after dispatch");
                } catch (Exception error) { throw new AssertionError(error); }
            });
            release.countDown();
            worker.submit(() -> {}).get(30, TimeUnit.SECONDS);
            instrumentation.waitForIdleSync();
            assertEquals(before.getInt("totalWorkCount") + 1, new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
        } finally {
            release.countDown();
            instrumentation.runOnMainSync(activity::finish);
            instrumentation.waitForIdleSync();
            for (String id : workIds(new JSONObject(broker.snapshot()))) if (!existing.contains(id)) broker.cancel(id);
        }
    }

    private static Object field(MainActivity activity, String name) throws Exception {
        Field field = MainActivity.class.getDeclaredField(name); field.setAccessible(true); return field.get(activity);
    }
    private static Button findButton(View view, String text) {
        if (view instanceof Button && text.contentEquals(((Button) view).getText())) return (Button) view;
        if (view instanceof ViewGroup) for (int index = 0; index < ((ViewGroup) view).getChildCount(); index++) {
            Button found = findButton(((ViewGroup) view).getChildAt(index), text); if (found != null) return found;
        }
        return null;
    }
    private static Set<String> workIds(JSONObject snapshot) throws Exception {
        Set<String> ids = new HashSet<>(); JSONArray works = snapshot.getJSONArray("works");
        for (int index = 0; index < works.length(); index++) ids.add(works.getJSONObject(index).getString("id"));
        return ids;
    }
}
