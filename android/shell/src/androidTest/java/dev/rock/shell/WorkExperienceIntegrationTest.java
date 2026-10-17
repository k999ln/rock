package dev.rock.shell;

import android.app.Instrumentation;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.BatteryManager;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class WorkExperienceIntegrationTest {
    private final Instrumentation instrument = InstrumentationRegistry.getInstrumentation();
    private Context context() { return instrument.getTargetContext(); }
    private MainActivity launch(Intent intent) {
        return (MainActivity) instrument.startActivitySync(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }
    private MainActivity launch() { return launch(new Intent(context(), MainActivity.class)); }
    private void ui(Runnable task) { instrument.runOnMainSync(task); }
    private static Object field(Object object, String name) {
        try { Field value = object.getClass().getDeclaredField(name); value.setAccessible(true); return value.get(object); }
        catch (Exception error) { throw new AssertionError(error); }
    }
    private static void call(MainActivity activity, String name, Class<?>[] types, Object... args) {
        try { Method method = MainActivity.class.getDeclaredMethod(name, types); method.setAccessible(true); method.invoke(activity, args); }
        catch (Exception error) { throw new AssertionError(error); }
    }
    private static Button button(View root, String name) {
        if (root instanceof Button && name.equals(((Button) root).getText().toString())) return (Button) root;
        if (root instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++) {
            Button found = button(((ViewGroup) root).getChildAt(i), name); if (found != null) return found;
        }
        return null;
    }
    private static JSONObject work(String id, String state, String... steps) throws Exception {
        JSONArray runs = new JSONArray(); for (String step : steps) runs.put(new JSONObject().put("state", step));
        return new JSONObject().put("id", id).put("state", state).put("runs", runs);
    }

    private static android.view.accessibility.AccessibilityNodeInfo notificationBody(android.view.accessibility.AccessibilityNodeInfo node) {
        if (node == null) return null;
        if ("成果が届きました。内容を確認してください。".contentEquals(node.getText() == null ? "" : node.getText())
                && "com.android.systemui".contentEquals(node.getPackageName() == null ? "" : node.getPackageName())) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            android.view.accessibility.AccessibilityNodeInfo found = notificationBody(node.getChild(i)); if (found != null) return found;
        }
        return null;
    }

    @Test public void listPrioritizesReviewAndOpensOneFocusedDetail() throws Exception {
        MainActivity activity = launch();
        String old = UUID.randomUUID().toString(), review = UUID.randomUUID().toString();
        JSONArray rows = new JSONArray().put(work(old, "completed", "succeeded", "succeeded"))
            .put(work(review, "review", "succeeded", "succeeded"));
        try { ui(() -> {
            call(activity, "render", new Class<?>[]{JSONArray.class}, rows);
            ViewGroup jobs = (ViewGroup) field(activity, "jobs");
            assertEquals("work-card-" + review, jobs.getChildAt(1).getTag());
            assertNull(button(jobs, "確認して完了"));
            button(jobs, "成果を確認する").performClick();
            assertEquals(review, field(activity, "focusedWorkId"));
            assertNotNull(button(jobs, "確認して完了"));
            assertNotNull(button(jobs, "ファイルに保存"));
            assertEquals(View.GONE, ((View) field(activity, "workFilters")).getVisibility());
            button(jobs, "‹ 仕事の一覧へ").performClick();
            assertNull(field(activity, "focusedWorkId"));
            assertEquals(View.VISIBLE, ((View) field(activity, "workFilters")).getVisibility());
        }); } finally { ui(activity::finish); }
    }

    @Test public void failedReviewNeverOffersArtifactOrCompletionAndOnlyFailedActiveCanRetry() throws Exception {
        MainActivity activity = launch(); String id = UUID.randomUUID().toString();
        try {
            for (String state : new String[]{"review", "active"}) {
                JSONArray rows = new JSONArray().put(work(id, state, "succeeded", "needs_review"));
                ui(() -> {
                    call(activity, "render", new Class<?>[]{JSONArray.class}, rows);
                    call(activity, "openWork", new Class<?>[]{String.class}, id);
                    View jobs = (View) field(activity, "jobs");
                    assertNull(button(jobs, "確認して完了")); assertNull(button(jobs, "ファイルに保存"));
                    assertEquals("active".equals(state), button(jobs, "止まった工程を再試行") != null);
                });
            }
        } finally { ui(activity::finish); }
    }

    @Test public void externalNotificationIntentOnlyNavigatesAndCannotCreateOrApproveWork() throws Exception {
        ShellConnection broker = new ShellConnection(context()); int before = new JSONObject(broker.snapshot()).getInt("totalWorkCount");
        MainActivity activity = launch(new Intent(context(), MainActivity.class).setAction(Intent.ACTION_VIEW)
            .putExtra(WorkNotifications.EXTRA_WORK_ID, UUID.randomUUID().toString()).putExtra("approve", true).putExtra("submit", "execute"));
        try {
            ui(() -> assertEquals(2, field(activity, "selectedPage")));
            assertEquals(before, new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
            android.content.pm.ActivityInfo receiver = context().getPackageManager().getReceiverInfo(
                new android.content.ComponentName(context(), WorkNotificationReceiver.class), 0);
            assertEquals("dev.rock.permission.USE_SHELL_API", receiver.permission);
        } finally { ui(activity::finish); }
    }

    @Test public void disabledNotificationsDoNotPostOrChangeBrokerState() throws Exception {
        ShellConnection broker = new ShellConnection(context()); JSONObject snapshot = new JSONObject(broker.snapshot());
        boolean prior = WorkNotifications.preferences(context()).getBoolean("enabled", false);
        NotificationManager manager = context().getSystemService(NotificationManager.class);
        int before = manager.getActiveNotifications().length;
        WorkNotifications.preferences(context()).edit().putBoolean("enabled", false).commit();
        try {
            WorkNotifications.sync(context(), snapshot, null, false);
            assertEquals(before, manager.getActiveNotifications().length);
            assertEquals(snapshot.getInt("totalWorkCount"), new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
        } finally { WorkNotifications.preferences(context()).edit().putBoolean("enabled", prior).commit(); }
    }

    @Test public void realBackgroundToolCompletionNotifiesAndTapOnlyOpensItsSavedWork() throws Exception {
        Assume.assumeTrue("explicit physical notification trial", "true".equals(InstrumentationRegistry.getArguments().getString("rockPhysicalNotificationAcceptance")));
        assertEquals("frankel", android.os.Build.DEVICE);
        assertTrue(context().getSystemService(BatteryManager.class).isCharging());
        assertTrue("owner-enabled Android permission and app preference required", WorkNotifications.enabled(context()));
        ShellConnection broker = new ShellConnection(context()); JSONObject before = new JSONObject(broker.snapshot());
        assertFalse(before.getBoolean("paused")); WorkNotifications.sync(context(), before, null, true);
        JSONObject input = new JSONObject().put("markdown", "# 通知導線の実機検証\n\n最初の説明です。（出典: [A](https://example.test/source)）\n\n次の詳しい手順です。最後に記録を残します。")
            .put("summary", "- 小さく試す\n- 出典を残す\n- 最後に確認").put("afterChars", 4).put("price", 500)
            .put("paidContents", "詳しい手順").put("noteUrl", "https://note.com/example/n/test_article");
        // No Shell activity is kept visible: only the Broker scheduler and protected receiver deliver the notification.
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context().startActivity(home); SystemClock.sleep(500);
        String id = broker.submit(UUID.randomUUID().toString(), input.toString(), false, true);
        NotificationManager manager = context().getSystemService(NotificationManager.class);
        MainActivity opened = null;
        try {
            long deadline = SystemClock.elapsedRealtime() + 90_000;
            android.service.notification.StatusBarNotification found = null;
            do {
                for (android.service.notification.StatusBarNotification note : manager.getActiveNotifications())
                    if (id.equals(note.getTag()) && "あなたの確認待ち".contentEquals(note.getNotification().extras.getCharSequence(android.app.Notification.EXTRA_TITLE, ""))) found = note;
                if (found != null) break; SystemClock.sleep(300);
            } while (SystemClock.elapsedRealtime() < deadline);
            assertNotNull("actual background completion must deliver the notification", found);
            assertEquals(android.app.Notification.VISIBILITY_PRIVATE, found.getNotification().visibility);
            assertTrue(found.getNotification().contentIntent.isImmutable());
            String body = found.getNotification().extras.getCharSequence(android.app.Notification.EXTRA_TEXT, "").toString();
            assertFalse(body.contains("最初の説明")); assertFalse(body.contains("example.test"));
            assertEquals(before.getInt("totalWorkCount") + 1, new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
            String artifact = broker.result(id); assertTrue(artifact.contains("example.test/source"));
            Instrumentation.ActivityMonitor monitor = instrument.addMonitor(MainActivity.class.getName(), null, false);
            try {
                assertTrue(instrument.getUiAutomation().performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS));
                android.view.accessibility.AccessibilityNodeInfo target = null;
                long tapDeadline = SystemClock.elapsedRealtime() + 10_000;
                do { target = notificationBody(instrument.getUiAutomation().getRootInActiveWindow());
                    if (target == null) SystemClock.sleep(200);
                } while (target == null && SystemClock.elapsedRealtime() < tapDeadline);
                assertNotNull("the actual System UI notification must be visible", target);
                while (target != null && !target.isClickable()) target = target.getParent();
                assertNotNull("notification must expose a tappable parent", target);
                assertTrue(target.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK));
                opened = (MainActivity) instrument.waitForMonitorWithTimeout(monitor, 10_000);
            }
            finally { instrument.removeMonitor(monitor); }
            assertNotNull(opened); MainActivity detail = opened;
            ui(() -> { assertEquals(2, field(detail, "selectedPage")); assertEquals(id, field(detail, "focusedWorkId")); });
            assertEquals(artifact, broker.result(id));
            assertEquals(before.getInt("totalWorkCount") + 1, new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
            JSONObject receipt = new JSONObject().put("workId", id).put("backgroundRealTools", true).put("reviewNotification", true)
                .put("actualSystemNotificationTapped", true).put("tapOnlyNavigated", true).put("duplicateWork", false).put("manuscriptInNotification", false).put("artifactBytes", artifact.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
            java.nio.file.Files.write(new java.io.File(context().getExternalFilesDir(null), "pixel-work-notification-acceptance.json").toPath(), receipt.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } finally {
            if (opened != null) { MainActivity close = opened; ui(close::finish); }
            broker.cancel(id); manager.cancel(id, 1); // Only this test's synthetic job.
        }
    }
}
