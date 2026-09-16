package dev.rock.shell;

import android.content.pm.PackageManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.UUID;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Verifies the unprivileged shell reaches state only through the exact signed Broker. */
@RunWith(AndroidJUnit4.class)
public final class ShellBrokerIntegrationTest {
    @Test public void separateShellUsesSignedBrokerWithoutInternetOrLocalDatabase() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageManager packages = context.getPackageManager();
        assertEquals("dev.rock.shell", context.getPackageName());
        assertEquals(PackageManager.PERMISSION_DENIED,
            packages.checkPermission("android.permission.INTERNET", context.getPackageName()));
        assertEquals(PackageManager.PERMISSION_GRANTED,
            packages.checkPermission("dev.rock.permission.USE_SHELL_API", context.getPackageName()));
        assertEquals(PackageManager.PERMISSION_DENIED,
            packages.checkPermission("dev.rock.permission.MANAGE_PLATFORM", context.getPackageName()));
        assertEquals(PackageManager.SIGNATURE_MATCH,
            packages.checkSignatures(context.getPackageName(), ShellConnection.BROKER_PACKAGE));

        ShellConnection broker = new ShellConnection(context);
        assertEquals(2, ShellConnection.API_VERSION);
        JSONObject before = new JSONObject(broker.snapshot());
        assertEquals(1, before.getInt("apiVersion"));
        assertTrue(before.has("totalWorkCount"));
        assertTrue(before.has("truncated"));
        String input = new JSONObject()
            .put("markdown", "# Test\n\nSource ([A](https://example.test/source))\n\nDetails")
            .put("summary", "- one\n- two\n- three")
            .put("afterChars", 4).put("price", 500)
            .put("paidContents", "Details")
            .put("noteUrl", "https://note.com/example/n/test_article").toString();
        String workId = broker.submit(UUID.randomUUID().toString(), input, false, true);
        assertTrue(workId.matches("[0-9a-f-]{36}"));
        try {
            JSONObject after = new JSONObject(broker.snapshot());
            assertTrue(after.toString().contains(workId));
        } finally {
            broker.cancel(workId);
        }
    }

    @Test public void zemaCommitsOneVerifiedPlanOrNoWorkAtAll() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ShellConnection broker = new ShellConnection(context);
        String localAiState = broker.localAiStatus();
        int before = new JSONObject(broker.snapshot()).getInt("totalWorkCount");
        JSONObject response = new JSONObject(broker.submitZema(UUID.randomUUID().toString(),
            "article-preparation@1",
            "検証用の記事原稿と要約を準備して。無料部分の後に詳しい本文も残してください。",
            "[]", true));
        assertEquals(3, response.length());
        assertTrue(response.has("status"));
        assertTrue(response.has("code"));
        assertTrue(response.has("workId"));
        JSONObject after = new JSONObject(broker.snapshot());
        if ("ready".equals(localAiState)) {
            assertEquals("queued", response.getString("status"));
            String workId = response.getString("workId");
            assertEquals(before + 1, after.getInt("totalWorkCount"));
            assertTrue(after.toString().contains(workId));
            System.out.println("ZEMA_RESULT=QUEUED");
            broker.cancel(workId);
        } else {
            assertTrue(java.util.Set.of("no_model", "loading", "busy", "error")
                .contains(localAiState));
            assertEquals("blocked", response.getString("status"));
            assertTrue(response.isNull("workId"));
            String code = response.getString("code");
            assertEquals("LOCAL_AI_UNAVAILABLE", code);
            assertEquals(before, after.getInt("totalWorkCount"));
            System.out.println("ZEMA_RESULT=BLOCKED_WITHOUT_PARTIAL_WORK:" + code);
        }
    }

    @Test public void zemaRequiresConsentBeforeCallingLocalAiOrCreatingWork() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ShellConnection broker = new ShellConnection(context);
        int before = new JSONObject(broker.snapshot()).getInt("totalWorkCount");
        JSONObject response = new JSONObject(broker.submitZema(UUID.randomUUID().toString(),
            "article-preparation@1", "This must not reach Local AI.", "[]", false));
        assertEquals("blocked", response.getString("status"));
        assertEquals("DENIED", response.getString("code"));
        assertTrue(response.isNull("workId"));
        assertEquals(before, new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
    }
}
