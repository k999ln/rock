package dev.rock.automation;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.rock.core.Engine;
import dev.rock.core.ArticleTools;
import dev.rock.core.platform.PlatformStore;
import dev.rock.core.platform.RecoveryPhrase;
import dev.rock.sdk.ArticlePayload;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.io.File;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.UUID;

/** Runs in an ephemeral Android emulator against real Binder and Android SQLite, no UI/accounts. */
@RunWith(AndroidJUnit4.class)
public class DeviceIntegrationTest {
    @Test public void zemaPlanRunsTheSelectedLocalToolToReview() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String name = "zema-integration-" + UUID.randomUUID() + ".db";
        Context isolatedDatabase = new ContextWrapper(target) {
            @Override public File getDatabasePath(String ignored) { return target.getDatabasePath(name); }
        };
        try (AndroidDatabase db = new AndroidDatabase(isolatedDatabase)) {
            Engine engine = new Engine(db);
            Engine.SkySelection selection = engine.selectSkyTool(Engine.RECIPE);
            String state = new LocalAiConnection(target).status();
            if (!"ready".equals(state)) {
                assertTrue(java.util.Set.of("no_model", "loading", "busy", "error").contains(state));
                assertThrows(IllegalStateException.class, () ->
                    new ZemaOrchestrator(target, engine).submit("zema-no-model", selection.token,
                        "検証用の記事原稿と要約を準備して", "[]", true));
                assertTrue(engine.list().isEmpty());
                return;
            }
            assertEquals("ready", state);
            String id = new ZemaOrchestrator(target, engine).submit(
                "zema-" + UUID.randomUUID(), selection.token,
                "検証用の記事原稿と要約を準備して", "[]", true);
            for (int step = 0; step < 2; step++) {
                Engine.Ticket ticket = engine.claim("zema-test-boot", SystemClock.elapsedRealtime(), true);
                assertNotNull(ticket);
                assertEquals(step, ticket.step);
                ToolConnection.Result result = new ToolConnection(target).execute(ticket);
                assertEquals("passed", result.outcome);
                assertTrue(engine.finish(ticket, result.outcome, result.output,
                    "zema-test-boot", SystemClock.elapsedRealtime()));
            }
            assertEquals("review", engine.work(id).get("state"));
            assertTrue(!engine.result(id).trim().isEmpty());
            assertEquals(5, engine.events(id).size());
        } finally { target.deleteDatabase(name); }
    }

    @Test public void nativeSkySelectionSurvivesBrokerDatabaseReopen() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String name = "sky-selection-" + UUID.randomUUID() + ".db";
        Context isolatedDatabase = new ContextWrapper(target) {
            @Override public File getDatabasePath(String ignored) { return target.getDatabasePath(name); }
        };
        String token;
        try (AndroidDatabase db = new AndroidDatabase(isolatedDatabase)) {
            db.execute("CREATE TABLE rock_meta(version INTEGER NOT NULL CHECK(version=1))");
            db.execute("INSERT INTO rock_meta VALUES(1)");
            Engine engine = new Engine(db);
            assertEquals("2", db.query("SELECT version FROM rock_meta").get(0).get("version"));
            token = engine.selectSkyTool(Engine.RECIPE).token;
            assertEquals(Engine.RECIPE, engine.requireSkySelection(token));
        }
        try (AndroidDatabase reopened = new AndroidDatabase(isolatedDatabase)) {
            Engine restored = new Engine(reopened);
            assertEquals(token, restored.skySelection().token);
            assertEquals(Engine.RECIPE, restored.requireSkySelection(token));
            assertThrows(SecurityException.class,
                () -> restored.requireSkySelection(UUID.randomUUID().toString()));
        } finally { target.deleteDatabase(name); }
    }

    @Test public void recoverySecretUsesAndroidKeystoreAndPhraseChecksum() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String suffix = UUID.randomUUID().toString();
        String alias = "avocadoos-test-recovery-" + suffix;
        String fileName = "test-recovery-" + suffix + ".secret";
        File secretFile = new File(new File(target.getNoBackupFilesDir(), "recovery"), fileName);
        byte[] secret = new byte[32]; new java.security.SecureRandom().nextBytes(secret);
        try {
            RecoverySecretStore store = new RecoverySecretStore(target, alias, fileName);
            store.bind(secret, "android-user:0");
            assertTrue(store.isConfigured());
            assertArrayEquals(secret, store.load("android-user:0"));
            assertThrows(SecurityException.class, () -> store.load("android-user:1"));
            String phrase = RecoveryPhrase.encode(secret);
            assertArrayEquals(secret, RecoveryPhrase.decode(phrase));
        } finally {
            Arrays.fill(secret, (byte) 0);
            secretFile.delete();
            KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
            if (keys.containsAlias(alias)) keys.deleteEntry(alias);
        }
    }

    @Test public void recoverableStateRestoresTransactionallyOnAndroidSqlite() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String sourceName = "backup-source-" + UUID.randomUUID() + ".db";
        String restoredName = "backup-restored-" + UUID.randomUUID() + ".db";
        Context sourceContext = new ContextWrapper(target) {
            @Override public File getDatabasePath(String ignored) { return target.getDatabasePath(sourceName); }
        };
        Context restoredContext = new ContextWrapper(target) {
            @Override public File getDatabasePath(String ignored) { return target.getDatabasePath(restoredName); }
        };
        byte[] snapshot;
        String oldToken;
        try {
            try (AndroidDatabase source = new AndroidDatabase(sourceContext)) {
                Engine engine = new Engine(source); oldToken = engine.selectSkyTool(Engine.RECIPE).token;
                engine.submit("android-backup", "{\"owner\":\"fixture\"}", false, true);
                snapshot = new PlatformStore(source).exportRecoverableState("android-user:0");
            }
            try (AndroidDatabase restored = new AndroidDatabase(restoredContext)) {
                Engine engine = new Engine(restored); PlatformStore platform = new PlatformStore(restored);
                PlatformStore.RestoreSummary result = platform.restoreRecoverableState(
                    snapshot, "android-user:0", System.currentTimeMillis());
                assertEquals(1, result.works); assertTrue(engine.paused());
                assertNotEquals(oldToken, engine.skySelection().token);
                assertEquals(2, engine.skySelection().revision);
                assertThrows(IllegalStateException.class, () ->
                    platform.restoreRecoverableState(snapshot, "android-user:0", System.currentTimeMillis()));
                assertEquals(1, engine.list().size());
            }
        } finally {
            target.deleteDatabase(sourceName); target.deleteDatabase(restoredName);
        }
    }

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
        Bundle arguments = InstrumentationRegistry.getArguments();
        String executionReceiptId = arguments.getString("executionReceiptId");
        if (executionReceiptId == null || !executionReceiptId.matches("[A-Za-z0-9_-]{1,80}")) {
            executionReceiptId = "integration-" + UUID.randomUUID();
        }
        String id;
        try {
            try (AndroidDatabase db = new AndroidDatabase(isolatedDatabase)) {
                Engine engine = new Engine(db);
                id = engine.submit(executionReceiptId, payload, false, true);
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
