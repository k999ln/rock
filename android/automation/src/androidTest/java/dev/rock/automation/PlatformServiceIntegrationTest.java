package dev.rock.automation;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.IBinder;
import android.os.Bundle;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.rock.core.Engine;
import dev.rock.sdk.IPlatformApi;
import dev.rock.sdk.IPlatformCallback;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Exercises the generated Binder interface, installed-package identity and SQLite registry on Android. */
@RunWith(AndroidJUnit4.class)
public final class PlatformServiceIntegrationTest {
    private static final String FIXTURE_PROVIDER_ID = "org.rockstar.provider.fixture";
    @Test public void registersInstalledToolThroughVersionedBinder() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        CountDownLatch connected = new CountDownLatch(1);
        IPlatformApi[] api = new IPlatformApi[1];
        ServiceConnection connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder service) {
                api[0] = IPlatformApi.Stub.asInterface(service); connected.countDown();
            }
            @Override public void onServiceDisconnected(ComponentName name) { api[0] = null; }
        };
        Intent intent = new Intent().setComponent(new ComponentName(context, RockPlatformService.class));
        assertTrue(context.bindService(intent, connection, Context.BIND_AUTO_CREATE));
        try {
            assertTrue(connected.await(5, TimeUnit.SECONDS));
            assertEquals(1, api[0].getApiVersion());
            PackageInfo info = context.getPackageManager().getPackageInfo(
                "dev.rock.tools.article", PackageManager.GET_SIGNING_CERTIFICATES);
            String signer = hex(MessageDigest.getInstance("SHA-256")
                .digest(info.signingInfo.getApkContentsSigners()[0].toByteArray()));
            JSONObject manifest = new JSONObject()
                .put("kind", "TOOL")
                .put("componentId", "org.rockstar.tool.article")
                .put("packageName", "dev.rock.tools.article")
                .put("versionCode", info.getLongVersionCode())
                .put("apiMin", 1).put("apiMax", 1)
                .put("dataSchemaMin", 1).put("dataSchemaMax", 1)
                .put("signingDigest", signer)
                .put("permissions", new JSONArray().put("text.input").put("text.output"));
            String request = "android-test:" + UUID.randomUUID();
            CountDownLatch completed = new CountDownLatch(1);
            String[] status = new String[1];
            api[0].registerComponent(request, manifest.toString(), new IPlatformCallback.Stub() {
                @Override public void onResult(String requestId, String resultStatus, String resultId, String digest) {
                    if (request.equals(requestId)) { status[0] = resultStatus; completed.countDown(); }
                }
            });
            assertTrue(completed.await(5, TimeUnit.SECONDS));
            assertEquals("OK", status[0]);
        } finally {
            context.unbindService(connection);
        }
    }

    @Test public void providerReceiptIsRecordedOnceThroughPhysicalBinder() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        CountDownLatch connected = new CountDownLatch(1);
        IPlatformApi[] api = new IPlatformApi[1];
        ServiceConnection connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder service) {
                api[0] = IPlatformApi.Stub.asInterface(service); connected.countDown();
            }
            @Override public void onServiceDisconnected(ComponentName name) { api[0] = null; }
        };
        Intent intent = new Intent().setComponent(new ComponentName(context, RockPlatformService.class));
        assertTrue(context.bindService(intent, connection, Context.BIND_AUTO_CREATE));
        try {
            assertTrue(connected.await(5, TimeUnit.SECONDS));
            Bundle arguments = InstrumentationRegistry.getArguments();
            String executionReceiptId = arguments.getString("executionReceiptId");
            if (executionReceiptId == null || !executionReceiptId.matches("[0-9a-f-]{36}")) {
                executionReceiptId = UUID.randomUUID().toString();
            }
            final String correlatedExecutionId = executionReceiptId;
            String receiptDigest = arguments.getString("providerReceiptDigest");
            if (receiptDigest == null || !receiptDigest.matches("[0-9a-f]{64}")) {
                receiptDigest = Engine.digest("synthetic provider receipt:" + correlatedExecutionId);
            }

            PackageInfo info = context.getPackageManager().getPackageInfo(
                context.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
            String signer = hex(MessageDigest.getInstance("SHA-256")
                .digest(info.signingInfo.getApkContentsSigners()[0].toByteArray()));
            String providerId = FIXTURE_PROVIDER_ID;
            JSONObject manifest = new JSONObject()
                .put("kind", "PROVIDER")
                .put("componentId", providerId)
                .put("packageName", context.getPackageName())
                .put("versionCode", info.getLongVersionCode())
                .put("apiMin", 1).put("apiMax", 1)
                .put("dataSchemaMin", 1).put("dataSchemaMax", 1)
                .put("signingDigest", signer)
                .put("permissions", new JSONArray().put("provider.status").put("wallet.receipt"));
            String registerRequest = "provider-register:" + correlatedExecutionId;
            CallbackResult registered = await(callback ->
                api[0].registerComponent(registerRequest, manifest.toString(), callback));
            assertEquals("OK", registered.status);
            assertEquals(providerId, registered.resultId);

            String earningRequest = "earning:" + correlatedExecutionId;
            String providerReference = "fixture:" + correlatedExecutionId;
            String finalReceiptDigest = receiptDigest;
            CallbackResult first = await(callback -> api[0].recordProviderReceipt(
                earningRequest, providerId, 1500, "USD", providerReference,
                finalReceiptDigest, callback));
            assertEquals("OK", first.status);
            assertTrue(first.resultId.matches("[0-9a-f-]{36}"));

            CallbackResult replay = await(callback -> api[0].recordProviderReceipt(
                earningRequest, providerId, 1500, "USD", providerReference,
                finalReceiptDigest, callback));
            assertEquals("OK", replay.status);
            assertEquals(first.resultId, replay.resultId);
            assertEquals(first.digest, replay.digest);

            CallbackResult conflict = await(callback -> api[0].recordProviderReceipt(
                "earning-duplicate:" + correlatedExecutionId, providerId, 1500, "USD",
                providerReference, finalReceiptDigest, callback));
            assertEquals("CONFLICT", conflict.status);
            assertEquals("", conflict.resultId);
        } finally {
            context.unbindService(connection);
            removeSyntheticProviderFixture(context);
        }
    }

    private static void removeSyntheticProviderFixture(Context context) {
        try (AndroidDatabase database = new AndroidDatabase(context)) {
            if (database.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='platform_components'").isEmpty()) return;
            database.transaction(() -> {
                database.execute("DELETE FROM platform_ledger WHERE component_id=?", FIXTURE_PROVIDER_ID);
                database.execute("DELETE FROM platform_approvals WHERE component_id=?", FIXTURE_PROVIDER_ID);
                database.execute("DELETE FROM platform_registration_requests WHERE component_id=?", FIXTURE_PROVIDER_ID);
                database.execute("DELETE FROM platform_events WHERE component_id=?", FIXTURE_PROVIDER_ID);
                database.execute("DELETE FROM platform_components WHERE component_id=?", FIXTURE_PROVIDER_ID);
                return null;
            });
            assertTrue(database.query("SELECT 1 FROM platform_ledger WHERE component_id=?", FIXTURE_PROVIDER_ID).isEmpty());
            assertTrue(database.query("SELECT 1 FROM platform_components WHERE component_id=?", FIXTURE_PROVIDER_ID).isEmpty());
        }
    }

    private interface AsyncCall { void invoke(IPlatformCallback callback) throws Exception; }

    private static CallbackResult await(AsyncCall call) throws Exception {
        CountDownLatch completed = new CountDownLatch(1);
        CallbackResult[] result = new CallbackResult[1];
        call.invoke(new IPlatformCallback.Stub() {
            @Override public void onResult(String requestId, String status, String resultId, String digest) {
                result[0] = new CallbackResult(status, resultId, digest);
                completed.countDown();
            }
        });
        assertTrue(completed.await(5, TimeUnit.SECONDS));
        assertNotNull(result[0]);
        return result[0];
    }

    private static final class CallbackResult {
        final String status;
        final String resultId;
        final String digest;
        CallbackResult(String status, String resultId, String digest) {
            this.status = status;
            this.resultId = resultId;
            this.digest = digest;
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(bytes.length * 2);
        for (byte item : bytes) value.append(String.format(Locale.ROOT, "%02x", item & 0xff));
        return value.toString();
    }
}
