package dev.rock.automation;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.pm.PackageManager;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.rock.core.Engine;
import dev.rock.core.ArticleTools;
import dev.rock.sdk.ArticlePayload;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.io.File;
import java.util.UUID;

/** Runs in an ephemeral Android emulator against real Binder and Android SQLite, no UI/accounts. */
@RunWith(AndroidJUnit4.class)
public class DeviceIntegrationTest {
    @Test public void realBinderPipelinePersistsAndRequiresReview() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String name = "integration-" + UUID.randomUUID() + ".db";
        Context isolatedDatabase = new ContextWrapper(target) {
            @Override public File getDatabasePath(String ignored) { return target.getDatabasePath(name); }
        };
        String payload = new JSONObject()
            .put("markdown", "# 検証用原稿\n\n最初の説明です。（出典: [A](https://example.test/source)）\n\n次の詳しい手順です。最後に記録を残します。")
            .put("afterChars", 4).put("summary", "- 小さく試す\n- 出典を残す\n- 最後に確認")
            .put("price", 500).put("paidContents", "詳しい手順")
            .put("noteUrl", "https://note.com/example/n/test_article").toString();
        ArticlePayload.parse(payload);
        // Direct Android-runtime check with synthetic input; no raw production errors in IPC.
        String expectedCitations = ArticleTools.citations(new JSONObject(payload).getString("markdown"));
        assertTrue(expectedCitations.contains("## 出典"));
        String id;
        try {
            try (AndroidDatabase db = new AndroidDatabase(isolatedDatabase)) {
                Engine engine = new Engine(db);
                id = engine.submit("integration", payload, false, true);
                Engine.Ticket first = engine.claim("synthetic-boot", SystemClock.elapsedRealtime(), true);
                assertNotNull(first);
                ToolConnection.Result formatted = new ToolConnection(target).execute(first);
                assertEquals("passed", formatted.outcome);
                ArticlePayload.validateIntermediate(payload, formatted.output);
                assertEquals(expectedCitations, new JSONObject(formatted.output).getString("markdown"));
                assertTrue(engine.finish(first, formatted.outcome, formatted.output, "synthetic-boot", SystemClock.elapsedRealtime()));
                assertFalse(engine.finish(first, formatted.outcome, formatted.output, "synthetic-boot", SystemClock.elapsedRealtime()));
            }
            try (AndroidDatabase db = new AndroidDatabase(isolatedDatabase)) {
                Engine engine = new Engine(db);
                Engine.Ticket second = engine.claim("synthetic-boot", SystemClock.elapsedRealtime(), true);
                assertEquals(1, second.step);
                ToolConnection.Result free = new ToolConnection(target).execute(second);
                assertEquals("passed", free.outcome);
                assertTrue(free.output.contains("## 出典"));
                assertTrue(engine.finish(second, free.outcome, free.output, "synthetic-boot", SystemClock.elapsedRealtime()));
                assertEquals("review", engine.work(id).get("state"));
                assertEquals(free.output, engine.result(id));
                assertThrows(IllegalArgumentException.class, () -> engine.complete(id, ""));
                engine.complete(id, "合成原稿の出典と無料範囲を確認");
                assertEquals("completed", engine.work(id).get("state"));
            }
        } finally { target.deleteDatabase(name); } // Only this test's UUID-named database.
    }

    @Test public void schedulerAndPermissionConfigurationMatchContract() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        try {
            Scheduler.schedule(target);
            JobInfo info = target.getSystemService(JobScheduler.class).getPendingJob(Scheduler.ID);
            assertNotNull(info); assertTrue(info.isRequireCharging()); assertTrue(info.isPersisted());
            assertTrue(info.isPeriodic()); assertTrue(info.getIntervalMillis() >= 15 * 60_000L);
            PackageManager pm = target.getPackageManager();
            assertEquals(PackageManager.PERMISSION_DENIED, pm.checkPermission("android.permission.INTERNET", ToolConnection.PACKAGE));
            assertEquals(PackageManager.PERMISSION_DENIED, pm.checkPermission("dev.rock.permission.RUN_TOOL", ToolConnection.PACKAGE));
            assertEquals(PackageManager.PERMISSION_GRANTED, pm.checkPermission("dev.rock.permission.RUN_TOOL", target.getPackageName()));
        } finally { Scheduler.stop(target); }
    }
}
