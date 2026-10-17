package dev.rock.shell;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.BatteryManager;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.RadioGroup;
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Tests real navigation and the existing signed Broker; no substitute model or cloud result. */
@RunWith(AndroidJUnit4.class)
public final class TerminalHomeIntegrationTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private Context context() { return instrumentation.getTargetContext(); }
    private MainActivity launch() {
        return (MainActivity) instrumentation.startActivitySync(new Intent(context(), MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }
    private void ui(Runnable action) { instrumentation.runOnMainSync(action); }
    private static Object field(Object target, String name) {
        try { Field f = target.getClass().getDeclaredField(name); f.setAccessible(true); return f.get(target); }
        catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
    private static void call(MainActivity target, String name, Class<?>[] types, Object... arguments) {
        try { Method m = MainActivity.class.getDeclaredMethod(name, types); m.setAccessible(true); m.invoke(target, arguments); }
        catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
    private static Button button(View root, String text) {
        if (root instanceof Button && text.equals(((Button) root).getText().toString())) return (Button) root;
        if (root instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++) {
            Button found = button(((ViewGroup) root).getChildAt(i), text); if (found != null) return found;
        }
        return null;
    }
    private static String text(View root) {
        StringBuilder result = new StringBuilder();
        if (root instanceof TextView) result.append(((TextView) root).getText()).append('\n');
        if (root instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++) result.append(text(((ViewGroup) root).getChildAt(i)));
        return result.toString();
    }

    @Test public void homeCandidateDoesNotTakeTheDefaultOrGainNetworkAuthority() throws Exception {
        PackageManager pm = context().getPackageManager();
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        android.content.pm.ResolveInfo before = pm.resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
        assertTrue(pm.queryIntentActivities(home.setPackage(context().getPackageName()), PackageManager.MATCH_DEFAULT_ONLY).stream()
            .anyMatch(info -> MainActivity.class.getName().equals(info.activityInfo.name)));
        assertEquals(PackageManager.PERMISSION_DENIED, pm.checkPermission("android.permission.INTERNET", context().getPackageName()));
        assertEquals(PackageManager.PERMISSION_DENIED, pm.checkPermission("dev.rock.permission.MANAGE_PLATFORM", context().getPackageName()));
        MainActivity activity = launch();
        try {
            ui(() -> {
                assertEquals(0, field(activity, "selectedPage"));
                Object voice = field(activity, "voice");
                assertNull(field(voice, "recognizer")); assertNull(field(voice, "tts"));
            });
            android.content.pm.ResolveInfo after = pm.resolveActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY);
            assertEquals(before == null ? null : before.activityInfo.packageName, after == null ? null : after.activityInfo.packageName);
        } finally { ui(activity::finish); }
    }

    @Test public void preparingEachExecutionRouteIsOnlyADraftAndClearsConsent() throws Exception {
        ShellConnection broker = new ShellConnection(context());
        int before = new JSONObject(broker.snapshot()).getInt("totalWorkCount");
        int previous = context().getSharedPreferences("terminal_preferences", Context.MODE_PRIVATE).getInt("executionChoice", 3101);
        MainActivity activity = launch();
        try {
            ui(() -> {
                String[] destinations = {"markdown", "zemaPrompt", "cloudLlmPrompt"};
                for (int index = 0; index < 3; index++) {
                    String draft = "synthetic draft " + index;
                    ((EditText) field(activity, "homePrompt")).setText(draft);
                    ((RadioGroup) field(activity, "homeExecutionChoice")).check(3101 + index);
                    for (String key : new String[]{"consent", "zemaConsent", "cloudLlmExecutionConsent"}) ((CheckBox) field(activity, key)).setChecked(true);
                    call(activity, "prepareHomeRequest", new Class<?>[0]);
                    assertEquals(draft, ((EditText) field(activity, destinations[index])).getText().toString());
                    assertEquals(2, field(activity, "selectedPage"));
                    for (String key : new String[]{"consent", "zemaConsent", "cloudLlmExecutionConsent"}) assertFalse(((CheckBox) field(activity, key)).isChecked());
                }
            });
            assertEquals(before, new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
        } finally {
            ui(activity::finish);
            context().getSharedPreferences("terminal_preferences", Context.MODE_PRIVATE).edit().putInt("executionChoice", previous).commit();
        }
    }

    @Test public void currentV4ObservationIsAcceptedAndHistoricalV2IsRejected() throws Exception {
        JSONObject observation = new JSONObject().put("state", "no_model").put("modelLoaded", false)
            .put("runtime", "llama.rn").put("apiVersion", 4)
            .put("trustBasis", "approved_package_signature_and_binder_api").put("modelProfileIdentity", "not_reported");
        Method validate = MainActivity.class.getDeclaredMethod("validLocalInferenceObservation", JSONObject.class); validate.setAccessible(true);
        assertEquals(true, validate.invoke(null, observation));
        observation.put("apiVersion", 2); assertEquals(false, validate.invoke(null, observation));
        observation.put("apiVersion", 4).put("modelLoaded", true); assertEquals(false, validate.invoke(null, observation));
    }

    @Test public void cancelledWorkRemainsVisibleAndEmptyReviewCannotComplete() throws Exception {
        MainActivity activity = launch();
        try {
            JSONArray works = new JSONArray().put(new JSONObject().put("id", UUID.randomUUID()).put("state", "cancelled"))
                .put(new JSONObject().put("id", UUID.randomUUID()).put("state", "review").put("runs", new JSONArray()));
            ui(() -> {
                call(activity, "render", new Class<?>[]{JSONArray.class}, works);
                View jobs = (View) field(activity, "jobs");
                assertTrue(text(jobs).contains("中止"));
                Button complete = button(jobs, "確認して完了"); assertNotNull(complete);
                complete.performClick();
                ViewGroup card = (ViewGroup) complete.getParent();
                boolean error = false;
                for (int i = 0; i < card.getChildCount(); i++) if (card.getChildAt(i) instanceof EditText)
                    error |= ((EditText) card.getChildAt(i)).getError() != null;
                assertTrue(error);
            });
        } finally { ui(activity::finish); }
    }

    @Test public void modelCatalogAndConsentRefusalCrossTheRealShellBinderWithoutCreatingWork() throws Exception {
        ShellConnection broker = new ShellConnection(context());
        JSONObject before = new JSONObject(broker.snapshot());
        JSONObject catalog = new JSONObject(broker.localModelCatalog());
        assertEquals(2, catalog.getJSONArray("models").length());
        JSONObject model = catalog.getJSONArray("models").getJSONObject(0);
        assertEquals("dev.rock.qwen3-06b-q8", model.getString("profileId"));
        java.io.File file = java.io.File.createTempFile("unapproved-model-", ".gguf", context().getCacheDir());
        try (android.os.ParcelFileDescriptor descriptor = android.os.ParcelFileDescriptor.open(file,
                android.os.ParcelFileDescriptor.MODE_READ_ONLY)) {
            JSONObject denied = new JSONObject(broker.importLocalModel(model.getString("profileId"), descriptor, false));
            assertEquals("failed", denied.getString("status"));
            assertEquals("MODEL_IMPORT_CONSENT_REQUIRED", denied.getString("code"));
        } finally { file.delete(); }
        assertEquals(before.getInt("totalWorkCount"), new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
        assertEquals(catalog.optString("activeProfileId"), new JSONObject(broker.localModelCatalog()).optString("activeProfileId"));
    }

    @Test public void realToolSubmissionRunsOnceWithoutAModelAndSurvivesActivityRestart() throws Exception {
        Assume.assumeTrue("physical/emulator execution needs the existing charging gate", context().getSystemService(BatteryManager.class).isCharging());
        ShellConnection broker = new ShellConnection(context());
        JSONObject initial = new JSONObject(broker.snapshot());
        Assume.assumeFalse("do not resume somebody else's paused work", initial.getBoolean("paused"));
        Set<String> before = new HashSet<>(); JSONArray old = initial.getJSONArray("works");
        for (int i = 0; i < old.length(); i++) before.add(old.getJSONObject(i).getString("id"));
        MainActivity activity = launch(); String created = null;
        try {
            ui(() -> {
                String[][] fields = {
                    {"markdown", "# 端末内の検証\n\n最初の説明です。（出典: [A](https://example.test/source)）\n\n次の詳しい手順です。最後に記録を残します。"},
                    {"summary", "- 小さく試す\n- 出典を残す\n- 最後に確認"},
                    {"cutoff", "4"}, {"price", "500"}, {"paid", "詳しい手順"}, {"url", "https://note.com/example/n/test_article"}
                };
                for (String[] input : fields) ((EditText) field(activity, input[0])).setText(input[1]);
                ((CheckBox) field(activity, "consent")).setChecked(true);
                ((CheckBox) field(activity, "sample")).setChecked(false);
                Button submit = (Button) field(activity, "articleSubmitButton"); submit.performClick(); submit.performClick();
            });
            long deadline = SystemClock.elapsedRealtime() + 90_000;
            String state = null;
            while (SystemClock.elapsedRealtime() < deadline) {
                JSONArray works = new JSONObject(broker.snapshot()).getJSONArray("works");
                for (int i = 0; i < works.length(); i++) {
                    JSONObject work = works.getJSONObject(i); String id = work.getString("id");
                    if (!before.contains(id)) {
                        if (created == null) created = id; else assertEquals("one submit must create one job", created, id);
                        state = work.getString("state");
                    }
                }
                if ("review".equals(state)) break;
                SystemClock.sleep(400);
            }
            assertNotNull("a real Broker job must be saved", created); assertEquals("review", state);
            assertEquals(initial.getInt("totalWorkCount") + 1, new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
            String artifact = broker.result(created); assertTrue(artifact.contains("出典")); assertTrue(artifact.contains("example.test/source"));
            String id = created;
            broker.complete(id, "Synthetic acceptance: inspected the generated article and source list; no publication or charge.");
            ui(activity::finish);
            MainActivity restarted = launch();
            try { assertEquals(artifact, new ShellConnection(context()).result(id)); }
            finally { ui(restarted::finish); }
            System.out.println("TERMINAL_REAL_TOOL_ACCEPTANCE=PASSED_ACTIVITY_RESTART_NOT_OS_BOOT");
        } finally {
            ui(activity::finish);
            if (created != null) {
                JSONArray current = new JSONObject(broker.snapshot()).getJSONArray("works");
                for (int i = 0; i < current.length(); i++) if (created.equals(current.getJSONObject(i).getString("id"))
                        && !"completed".equals(current.getJSONObject(i).getString("state"))) broker.cancel(created);
            }
        }
    }
    @Test public void physicalLocalModelHomeRequestCreatesOneReviewArtifact() throws Exception {
        Assume.assumeTrue("owner-connected physical model UI acceptance is opt-in",
            "true".equals(InstrumentationRegistry.getArguments().getString("rockPhysicalModelAcceptance")));
        assertEquals("frankel", android.os.Build.DEVICE);
        assertTrue(context().getSystemService(BatteryManager.class).isCharging());
        ShellConnection broker = new ShellConnection(context());
        JSONObject initial = new JSONObject(broker.snapshot());
        assertFalse("do not resume unrelated paused work", initial.getBoolean("paused"));
        broker.selectSkyTool("article-preparation@1");
        Set<String> before = new HashSet<>(); JSONArray old = initial.getJSONArray("works");
        for (int i = 0; i < old.length(); i++) before.add(old.getJSONObject(i).getString("id"));
        MainActivity activity = launch(); String created = null; boolean readyForReview = false;
        int previousRoute = context().getSharedPreferences("terminal_preferences", Context.MODE_PRIVATE).getInt("executionChoice", 3101);
        try {
            long deadline = SystemClock.elapsedRealtime() + 10_000;
            java.util.concurrent.atomic.AtomicBoolean selected = new java.util.concurrent.atomic.AtomicBoolean();
            do { ui(() -> selected.set(field(activity, "skySelectionToken") != null)); if (!selected.get()) SystemClock.sleep(100); }
            while (!selected.get() && SystemClock.elapsedRealtime() < deadline);
            assertTrue("real Sky selection must reach the UI", selected.get());
            ui(() -> {
                ((EditText) field(activity, "homePrompt")).setText("日本語で、部屋の片づけを小さく始める方法の記事下書きを作る。導入、具体的な3手順、最後の確認を書く。出典は未調査と明記し、実在する人物や根拠のない数値を作らない。まとめは3項目。投稿や課金はしない。");
                ((RadioGroup) field(activity, "homeExecutionChoice")).check(3102);
                call(activity, "prepareHomeRequest", new Class<?>[0]);
                assertEquals(2, field(activity, "selectedPage"));
                assertFalse(((CheckBox) field(activity, "zemaConsent")).isChecked());
            });
            assertEquals(initial.getInt("totalWorkCount"), new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
            ui(() -> {
                ((CheckBox) field(activity, "zemaConsent")).setChecked(true);
                Button submit = (Button) field(activity, "zemaSubmitButton"); submit.performClick(); submit.performClick();
            });
            deadline = SystemClock.elapsedRealtime() + 120_000; String state = null;
            while (SystemClock.elapsedRealtime() < deadline) {
                JSONArray works = new JSONObject(broker.snapshot()).getJSONArray("works");
                for (int i = 0; i < works.length(); i++) {
                    JSONObject work = works.getJSONObject(i); String id = work.getString("id");
                    if (!before.contains(id)) {
                        if (created == null) created = id; else assertEquals("double tap must create one model job", created, id);
                        state = work.getString("state");
                    }
                }
                if ("review".equals(state)) break;
                ui(() -> assertFalse("model request was refused; keep the pending ID for diagnosis",
                    ((TextView) field(activity, "message")).getText().toString().startsWith("保存結果を確認できません")));
                SystemClock.sleep(250);
            }
            assertNotNull("the real Home request must produce work", created); assertEquals("review", state);
            assertEquals(initial.getInt("totalWorkCount") + 1, new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
            String artifact = broker.result(created); assertFalse(artifact.isBlank()); assertFalse(artifact.contains("<think>"));
            assertTrue("the generated artifact must address the actual room-tidying request", (artifact.contains("片づけ") || artifact.contains("片付け")));
            assertFalse("do not accept the old generic prompt example as a useful article", artifact.contains("- 要点1"));
            java.io.File directory = context().getExternalFilesDir(null);
            java.nio.file.Files.write(new java.io.File(directory, "local-jennifer-ui-artifact.md").toPath(), artifact.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            JSONObject receipt = new JSONObject().put("workId", created).put("state", "review")
                .put("draftPreparationCreatedNoWork", true).put("explicitConsent", true).put("doubleTapCreatedOneWork", true)
                .put("bytes", artifact.getBytes(java.nio.charset.StandardCharsets.UTF_8).length).put("humanReviewAccepted", false);
            java.nio.file.Files.write(new java.io.File(directory, "local-jennifer-ui-acceptance.json").toPath(), receipt.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            readyForReview = true; // Intentionally leave only this synthetic artifact for inspection in the UI.
        } finally {
            if (created != null && !readyForReview) broker.cancel(created);
            ui(activity::finish);
            context().getSharedPreferences("terminal_preferences", Context.MODE_PRIVATE).edit().putInt("executionChoice", previousRoute).commit();
        }
    }

}
